import { sql } from './db.js';
import { notifyTenant } from './notify.js';
import { normalizeText, phoneFromChatId } from './phone.js';
import { sendNow } from './sender.js';
import type { MessageContent } from './template.js';
import { shortId, waha } from './waha.js';

interface SessionInfo {
  id: number;
  name: string;
  tenant_id: number;
}

const ACK_STATUS: Record<number, string> = { [-1]: 'failed', 1: 'sent', 2: 'delivered', 3: 'read', 4: 'read' };
const RANK: Record<string, number> = { queued: 0, sending: 0, sent: 1, delivered: 2, read: 3, replied: 4 };

export async function handleWahaEvent(body: any): Promise<void> {
  const name: string | undefined = body?.session;
  if (!name) return;
  const rows = await sql<SessionInfo[]>`SELECT id, name, tenant_id FROM wa_sessions WHERE name = ${name}`;
  const session = rows[0];
  if (!session) return;
  const payload = body.payload ?? {};
  if (body.event === 'session.status') return onStatus(session, payload, body.me);
  if (body.event === 'message.ack') return onAck(session, payload);
  if (body.event === 'message') return onMessage(session, payload);
}

async function onStatus(session: SessionInfo, payload: any, me: any): Promise<void> {
  const phone = phoneFromChatId(me?.id ?? payload?.me?.id);
  await sql`UPDATE wa_sessions SET status = ${payload.status ?? 'UNKNOWN'}, phone = COALESCE(${phone}, phone) WHERE id = ${session.id}`;
  notifyTenant(session.tenant_id, 'session.status', { sessionId: session.id, status: payload.status, phone: phone });
}

async function onAck(session: SessionInfo, payload: any): Promise<void> {
  const status = ACK_STATUS[Number(payload.ack)];
  const sid = shortId(payload.id);
  if (!status || !sid) return;
  const column = status === 'delivered' ? sql`delivered_at = COALESCE(delivered_at, now()),` : status === 'read' ? sql`read_at = COALESCE(read_at, now()), delivered_at = COALESCE(delivered_at, now()),` : sql``;
  const updated = await sql<{ id: bigint; campaign_id: number | null; phone: string; status: string }[]>`
    UPDATE messages SET ${column} status = CASE
        WHEN ${status} = 'failed' THEN 'failed'
        WHEN ${RANK[status] ?? 0} > (CASE status WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 WHEN 'replied' THEN 4 ELSE 0 END) THEN ${status}
        ELSE status END
    WHERE session_id = ${session.id} AND short_id = ${sid} AND direction = 'out'
    RETURNING id, campaign_id, phone, status`;
  for (const m of updated) {
    notifyTenant(session.tenant_id, 'message.status', { id: String(m.id), campaignId: m.campaign_id, phone: m.phone, status: m.status });
  }
}

async function resolvePhone(session: SessionInfo, chatId: string | undefined): Promise<string | null> {
  const direct = phoneFromChatId(chatId);
  if (direct) return direct;
  if (chatId?.endsWith('@lid')) {
    try {
      const res = await waha.lidToPhone(session.name, chatId);
      return phoneFromChatId(res?.pn);
    } catch {
      return null;
    }
  }
  return null;
}

interface RuleRow {
  id: number;
  campaign_id: number | null;
  tag: string | null;
  keywords: string[];
  match: 'exact' | 'contains' | 'any';
  reply: MessageContent;
}

function matches(rule: RuleRow, text: string): boolean {
  if (rule.match === 'any') return true;
  const words = rule.keywords.map(normalizeText).filter(Boolean);
  if (rule.match === 'contains') return words.some((w) => text.includes(w));
  return words.includes(text);
}

async function onMessage(session: SessionInfo, payload: any): Promise<void> {
  if (payload.fromMe) return;
  const from: string | undefined = payload.from;
  if (!from || from.endsWith('@g.us') || from.endsWith('@newsletter') || from === 'status@broadcast') return;
  const phone = await resolvePhone(session, payload._data?.key?.senderPn ?? payload._data?.senderPn ?? from);
  if (!phone) return;
  const body = String(payload.body ?? '');
  const text = normalizeText(body);
  console.log(`[msg] from=${phone} text=${JSON.stringify(body)} norm=${JSON.stringify(text)}`);

  await sql`
    INSERT INTO messages (tenant_id, session_id, direction, phone, content, status, wa_id, short_id, sent_at)
    VALUES (${session.tenant_id}, ${session.id}, 'in', ${phone}, ${sql.json({ type: 'text', text: body } as any)}, 'received', ${payload.id ?? null}, ${shortId(payload.id)}, now())`;

  const replied = await sql<{ campaign_id: number | null }[]>`
    UPDATE messages SET status = 'replied', replied_at = now()
    WHERE id = (
      SELECT id FROM messages WHERE session_id = ${session.id} AND phone = ${phone} AND direction = 'out'
        AND status IN ('sent','delivered','read') AND sent_at > now() - interval '30 days'
      ORDER BY id DESC LIMIT 1
    )
    RETURNING campaign_id`;

  notifyTenant(session.tenant_id, 'message.incoming', {
    sessionId: session.id,
    phone: phone,
    text: body,
    campaignId: replied[0]?.campaign_id ?? null,
  });

  const tenant = await sql<{ opt_out_keywords: string[]; opt_out_reply: string | null }[]>`
    SELECT opt_out_keywords, opt_out_reply FROM tenants WHERE id = ${session.tenant_id}`;
  const keywords = (tenant[0]?.opt_out_keywords ?? []).map(normalizeText);
  if (text && keywords.includes(text)) {
    await sql`INSERT INTO opt_outs (tenant_id, phone) VALUES (${session.tenant_id}, ${phone}) ON CONFLICT DO NOTHING`;
    await sql`UPDATE messages SET status = 'opted_out' WHERE tenant_id = ${session.tenant_id} AND phone = ${phone} AND status = 'queued'`;
    if (tenant[0]?.opt_out_reply) {
      await sendNow({ tenantId: session.tenant_id, sessionId: session.id, sessionName: session.name, phone: phone, content: { type: 'text', text: tenant[0].opt_out_reply } }).catch(function ignore() {});
    }
    notifyTenant(session.tenant_id, 'contact.opted_out', { phone: phone });
    return;
  }

  const rules = await sql<RuleRow[]>`
    SELECT id, campaign_id, tag, keywords, match, reply FROM rules
    WHERE tenant_id = ${session.tenant_id} AND active AND (session_id IS NULL OR session_id = ${session.id})
    ORDER BY priority DESC, id`;
  console.log(`[msg] active rules=${rules.length}`);
  for (const rule of rules) {
    if (!matches(rule, text)) continue;
    if (rule.campaign_id) {
      const got = await sql`SELECT 1 FROM messages WHERE campaign_id = ${rule.campaign_id} AND phone = ${phone} AND direction = 'out' AND sent_at IS NOT NULL LIMIT 1`;
      if (!got.length) {
        console.log(`[msg] rule ${rule.id} matched but ${phone} is not a recipient of campaign ${rule.campaign_id} — skipped`);
        continue;
      }
    }
    console.log(`[msg] rule ${rule.id} fired for ${phone}`);
    if (rule.tag) {
      const campaignId = rule.campaign_id ?? replied[0]?.campaign_id ?? null;
      await sql`
        INSERT INTO leads (tenant_id, session_id, campaign_id, rule_id, phone, tag, text)
        VALUES (${session.tenant_id}, ${session.id}, ${campaignId}, ${rule.id}, ${phone}, ${rule.tag}, ${body.slice(0, 1000)})
        ON CONFLICT DO NOTHING`;
      notifyTenant(session.tenant_id, 'lead.created', { phone: phone, tag: rule.tag, campaignId: campaignId, ruleId: rule.id });
    }
    await sendNow({ tenantId: session.tenant_id, sessionId: session.id, sessionName: session.name, phone: phone, content: rule.reply, ruleId: rule.id });
    break;
  }
}
