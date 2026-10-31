import { refundCredits, takeCredits } from './auth.js';
import { sql } from './db.js';
import { notifyTenant } from './notify.js';
import { getProvider } from './providers/index.js';
import { renderContent, type MessageContent } from './template.js';
import { shortId } from './waha.js';

export interface QueuedMessage {
  id: bigint;
  tenant_id: number;
  session_id: number;
  campaign_id: number | null;
  contact_id: bigint | null;
  phone: string;
  content: MessageContent;
  charged: boolean;
}

interface SessionRow {
  id: number;
  name: string;
  tenant_id: number;
  rate_per_minute: number;
  daily_cap: number;
}

const busy = new Set<number>();
let timer: NodeJS.Timeout | null = null;

export function startScheduler(tickMs: number): void {
  void sql`UPDATE messages SET status = 'queued' WHERE status = 'sending'`.catch(function ignore() {});
  timer = setInterval(function tick() {
    void runTick().catch(function log(err) {
      console.error('scheduler tick failed', err);
    });
  }, tickMs);
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

async function runTick(): Promise<void> {
  const sessions = await sql<SessionRow[]>`
    SELECT s.id, s.name, s.tenant_id, s.rate_per_minute, s.daily_cap
    FROM wa_sessions s
    WHERE s.status = 'WORKING' AND s.next_send_at <= now()
      AND EXISTS (
        SELECT 1 FROM messages m LEFT JOIN campaigns c ON c.id = m.campaign_id
        WHERE m.session_id = s.id AND m.status = 'queued' AND (m.campaign_id IS NULL OR c.status = 'running')
      )`;
  for (const s of sessions) {
    if (busy.has(s.id)) continue;
    busy.add(s.id);
    void processSession(s)
      .catch(function log(err) {
        console.error(`session ${s.name} send failed`, err);
      })
      .finally(function release() {
        busy.delete(s.id);
      });
  }
}

async function processSession(s: SessionRow): Promise<void> {
  const [{ count }] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM messages
    WHERE session_id = ${s.id} AND direction = 'out' AND sent_at >= date_trunc('day', now())`;
  if (s.daily_cap > 0 && count >= s.daily_cap) {
    await sql`UPDATE wa_sessions SET next_send_at = date_trunc('day', now()) + interval '1 day' WHERE id = ${s.id}`;
    return;
  }
  const rows = await sql<QueuedMessage[]>`
    UPDATE messages SET status = 'sending'
    WHERE id = (
      SELECT m.id FROM messages m LEFT JOIN campaigns c ON c.id = m.campaign_id
      WHERE m.session_id = ${s.id} AND m.status = 'queued' AND (m.campaign_id IS NULL OR c.status = 'running')
      ORDER BY (m.campaign_id IS NOT NULL), m.id
      LIMIT 1 FOR UPDATE OF m SKIP LOCKED
    )
    RETURNING id, tenant_id, session_id, campaign_id, contact_id, phone, content, charged`;
  const msg = rows[0];
  if (!msg) return;
  const intervalMs = Math.max(1000, Math.round(60_000 / Math.max(1, s.rate_per_minute)));
  await sql`UPDATE wa_sessions SET next_send_at = now() + ${intervalMs + ' milliseconds'}::interval WHERE id = ${s.id}`;
  await deliver(s.name, msg);
  if (msg.campaign_id) await finishCampaignIfDone(msg.campaign_id);
}

async function setStatus(id: bigint, status: string, error?: string): Promise<void> {
  await sql`UPDATE messages SET status = ${status}, error = ${error ?? null} WHERE id = ${id}`;
}

export async function deliver(sessionName: string, msg: QueuedMessage): Promise<void> {
  const [srow] = await sql<{ provider: string }[]>`SELECT provider FROM wa_sessions WHERE id = ${msg.session_id}`;
  const provider = getProvider(srow?.provider);
  const optedOut = await sql`SELECT 1 FROM opt_outs WHERE tenant_id = ${msg.tenant_id} AND phone = ${msg.phone}`;
  if (optedOut.length) {
    if (msg.charged) await refundCredits(msg.tenant_id, 1);
    await setStatus(msg.id, 'opted_out');
    return;
  }

  let contact: { name: string | null; vars: Record<string, unknown> } | undefined;
  if (msg.contact_id) {
    const c = await sql<{ name: string | null; vars: Record<string, unknown> }[]>`SELECT name, vars FROM contacts WHERE id = ${msg.contact_id}`;
    contact = c[0];
  }

  if (msg.campaign_id) {
    const camp = await sql<{ check_exists: boolean }[]>`SELECT check_exists FROM campaigns WHERE id = ${msg.campaign_id}`;
    if (camp[0]?.check_exists) {
      try {
        const exists = provider.exists ? await provider.exists(sessionName, msg.phone) : true;
        if (!exists) {
          if (msg.charged) await refundCredits(msg.tenant_id, 1);
          await setStatus(msg.id, 'invalid', 'number is not on WhatsApp');
          return;
        }
      } catch (err) {
        await setStatus(msg.id, 'queued');
        throw err;
      }
    }
  }

  if (!msg.charged) {
    const ok = await takeCredits(msg.tenant_id, 1);
    if (!ok) {
      await setStatus(msg.id, 'queued');
      if (msg.campaign_id) {
        await sql`UPDATE campaigns SET status = 'paused', pause_reason = 'no_credits' WHERE id = ${msg.campaign_id} AND status = 'running'`;
      } else {
        await setStatus(msg.id, 'failed', 'no credits');
      }
      return;
    }
    await sql`UPDATE messages SET charged = TRUE WHERE id = ${msg.id}`;
    msg.charged = true;
  }

  const content = renderContent(msg.content, { phone: msg.phone, name: contact?.name, vars: contact?.vars });
  try {
    const waId = await provider.send(sessionName, provider.addressFor(msg.phone), content);
    await sql`
      UPDATE messages SET status = 'sent', wa_id = ${waId}, short_id = ${shortId(waId)}, sent_at = now(), error = NULL,
        content = ${sql.json(content as any)}
      WHERE id = ${msg.id}`;
    notifyTenant(msg.tenant_id, 'message.status', { id: String(msg.id), campaignId: msg.campaign_id, phone: msg.phone, status: 'sent' });
  } catch (err: any) {
    await refundCredits(msg.tenant_id, 1);
    await sql`UPDATE messages SET status = 'failed', error = ${String(err?.message ?? err).slice(0, 500)}, charged = FALSE WHERE id = ${msg.id}`;
    notifyTenant(msg.tenant_id, 'message.status', { id: String(msg.id), campaignId: msg.campaign_id, phone: msg.phone, status: 'failed' });
  }
}

export async function finishCampaignIfDone(campaignId: number): Promise<void> {
  await sql`
    UPDATE campaigns SET status = 'done', finished_at = now()
    WHERE id = ${campaignId} AND status = 'running'
      AND NOT EXISTS (SELECT 1 FROM messages WHERE campaign_id = ${campaignId} AND status IN ('queued','sending'))`;
}

/** Send immediately, bypassing the queue (auto replies). */
export async function sendNow(params: {
  tenantId: number;
  sessionId: number;
  sessionName: string;
  phone: string;
  content: MessageContent;
  ruleId?: number;
}): Promise<void> {
  const rows = await sql<QueuedMessage[]>`
    INSERT INTO messages (tenant_id, session_id, rule_id, phone, content, status)
    VALUES (${params.tenantId}, ${params.sessionId}, ${params.ruleId ?? null}, ${params.phone}, ${sql.json(params.content as any)}, 'sending')
    RETURNING id, tenant_id, session_id, campaign_id, contact_id, phone, content, charged`;
  await deliver(params.sessionName, rows[0]);
}
