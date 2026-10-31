import { sql } from './db.js';
import { getSetting, startActiveProxy, syncSessionsProxy } from './settings.js';
import { testOutboundFull, testThroughProxy, xrayInstalled, xrayStatus } from './xray.js';

interface ProxyRow {
  id: number;
  name: string;
  outbound: Record<string, any>;
}

/** Test every saved config and activate the fastest working one. */
export async function activateBest(): Promise<{ id: number; name: string; ms: number; waOk: boolean } | null> {
  const rows = await sql<ProxyRow[]>`SELECT id, name, outbound FROM proxies ORDER BY id`;
  let best: { id: number; name: string; ms: number; waOk: boolean } | null = null;
  for (const r of rows) {
    try {
      const t = await testOutboundFull(r.outbound);
      await sql`UPDATE proxies SET last_test_ok = TRUE, last_test_ms = ${t.ms}, last_test_at = now(), wa_ok = ${t.wa.ok}, wa_note = ${t.wa.note} WHERE id = ${r.id}`;
      const cand = { id: r.id, name: r.name, ms: t.ms, waOk: t.wa.ok };
      // WhatsApp-reachable configs always beat unreachable ones; then lowest ping wins.
      if (!best || (cand.waOk && !best.waOk) || (cand.waOk === best.waOk && cand.ms < best.ms)) best = cand;
    } catch (err: any) {
      await sql`UPDATE proxies SET last_test_ok = FALSE, last_test_ms = NULL, last_test_at = now(), wa_ok = FALSE, wa_note = ${String(err?.message ?? err).slice(0, 120)} WHERE id = ${r.id}`;
    }
  }
  if (!best) return null;
  await sql.begin(async function swap(tx) {
    await tx`UPDATE proxies SET active = FALSE WHERE active`;
    await tx`UPDATE proxies SET active = TRUE WHERE id = ${best!.id}`;
  });
  await startActiveProxy();
  await syncSessionsProxy();
  return best;
}

let failures = 0;
let timer: NodeJS.Timeout | null = null;
let busy = false;

export function failoverState(): { failures: number; checking: boolean } {
  return { failures: failures, checking: busy };
}

async function tick(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const enabled = await getSetting<boolean>('proxy_failover', true);
    const active = await sql<{ id: number; name: string }[]>`SELECT id, name FROM proxies WHERE active LIMIT 1`;
    if (!enabled || !active.length || !xrayInstalled()) {
      failures = 0;
      return;
    }
    if (!xrayStatus().running) await startActiveProxy();
    try {
      const ms = await testThroughProxy('web.whatsapp.com', 8_000);
      failures = 0;
      await sql`UPDATE proxies SET last_test_ok = TRUE, last_test_ms = ${ms}, last_test_at = now() WHERE id = ${active[0].id}`;
      return;
    } catch (err: any) {
      failures += 1;
      await sql`UPDATE proxies SET last_test_ok = FALSE, last_test_at = now() WHERE id = ${active[0].id}`;
      console.warn(`[failover] active proxy "${active[0].name}" failed (${failures}): ${err?.message ?? err}`);
    }
    if (failures < 2) return;
    console.warn('[failover] switching to the fastest working config...');
    const best = await activateBest();
    failures = 0;
    if (best) console.warn(`[failover] now using "${best.name}" (${best.ms} ms)`);
    else console.warn('[failover] no working config found; keeping current');
  } catch (err) {
    console.error('[failover] check failed', err);
  } finally {
    busy = false;
  }
}

export function startProxyWatchdog(intervalSeconds: number): void {
  if (timer) clearInterval(timer);
  timer = setInterval(function run() {
    void tick();
  }, Math.max(20, intervalSeconds) * 1000);
  timer.unref();
}

export function stopProxyWatchdog(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
