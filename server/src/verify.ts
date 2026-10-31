import { config } from './config.js';
import { sql } from './db.js';
import { chatIdFor } from './phone.js';
import { waha } from './waha.js';

const CONCURRENCY = Math.max(1, Number(process.env.NEXUS_WA_CHECK_CONCURRENCY ?? 8));
const CACHE_DAYS = Number(process.env.NEXUS_WA_CACHE_DAYS ?? 30);
const CHUNK = 500;

const running = new Set<number>();

interface Contact {
  id: string;
  phone: string;
}

/** Resolve one phone's WhatsApp status, using the global cache first. */
async function resolve(sessionName: string, phone: string): Promise<{ exists: boolean; chatId: string | null }> {
  const cached = await sql<{ exists: boolean; chat_id: string | null }[]>`
    SELECT exists, chat_id FROM wa_cache WHERE phone = ${phone} AND checked_at > now() - ${CACHE_DAYS + ' days'}::interval`;
  if (cached[0]) return { exists: cached[0].exists, chatId: cached[0].chat_id };
  const res = await waha.checkExists(sessionName, phone);
  const chatId = res.numberExists ? (res.chatId ?? chatIdFor(phone)) : null;
  await sql`
    INSERT INTO wa_cache (phone, exists, chat_id, checked_at) VALUES (${phone}, ${res.numberExists}, ${chatId}, now())
    ON CONFLICT (phone) DO UPDATE SET exists = EXCLUDED.exists, chat_id = EXCLUDED.chat_id, checked_at = now()`;
  return { exists: res.numberExists, chatId: chatId };
}

async function runJob(jobId: number, listId: number, sessionName: string): Promise<void> {
  try {
    const [{ total }] = await sql<{ total: number }[]>`SELECT count(*)::int AS total FROM contacts WHERE list_id = ${listId} AND has_wa IS NULL`;
    const [{ already }] = await sql<{ already: number }[]>`SELECT count(*)::int AS already FROM contacts WHERE list_id = ${listId} AND has_wa = TRUE`;
    await sql`UPDATE verify_jobs SET total = ${total}, found = ${already} WHERE id = ${jobId}`;
    let checked = 0;
    let found = already;
    let lastReport = Date.now();

    // keyset walk over unchecked contacts; resumable if the job is re-run
    for (;;) {
      const job = await sql<{ status: string }[]>`SELECT status FROM verify_jobs WHERE id = ${jobId}`;
      if (!job[0] || job[0].status === 'cancelled') return;
      const rows = await sql<Contact[]>`
        SELECT id, phone FROM contacts WHERE list_id = ${listId} AND has_wa IS NULL ORDER BY id LIMIT ${CHUNK}`;
      if (!rows.length) break;

      let i = 0;
      async function worker(): Promise<void> {
        for (;;) {
          const row = rows[i++];
          if (!row) return;
          try {
            const r = await resolve(sessionName, row.phone);
            await sql`UPDATE contacts SET has_wa = ${r.exists}, chat_id = ${r.chatId}, wa_checked_at = now() WHERE id = ${row.id}::bigint`;
            checked += 1;
            if (r.exists) found += 1;
          } catch {
            // transient WAHA error: leave has_wa NULL so a later run retries this one
            checked += 1;
          }
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));

      if (Date.now() - lastReport > 1000) {
        lastReport = Date.now();
        await sql`UPDATE verify_jobs SET checked = ${checked}, found = ${found}, updated_at = now() WHERE id = ${jobId}`;
      }
    }
    await sql`UPDATE verify_jobs SET status = 'done', checked = ${checked}, found = ${found}, updated_at = now() WHERE id = ${jobId}`;
  } catch (err: any) {
    await sql`UPDATE verify_jobs SET status = 'failed', error = ${String(err?.message ?? err).slice(0, 300)}, updated_at = now() WHERE id = ${jobId}`.catch(function ignore() {});
  }
}

export async function startVerifyJob(tenantId: number, listId: number, sessionId: number, sessionName: string): Promise<string> {
  const [job] = await sql<{ id: number }[]>`
    INSERT INTO verify_jobs (tenant_id, list_id, session_id) VALUES (${tenantId}, ${listId}, ${sessionId}) RETURNING id`;
  if (running.has(listId)) {
    // a verification is already walking this list; the new job will be picked up as a no-op
    await sql`UPDATE verify_jobs SET status = 'done', error = 'another verification is already running for this list' WHERE id = ${job.id}`;
    return String(job.id);
  }
  running.add(listId);
  void runJob(job.id, listId, sessionName).finally(function done() {
    running.delete(listId);
  });
  return String(job.id);
}

void config;
