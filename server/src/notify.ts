import { sql } from './db.js';

/** Fire-and-forget webhook to the tenant's own system (the SaaS site). */
export function notifyTenant(tenantId: number, event: string, payload: unknown): void {
  void (async function send() {
    const rows = await sql<{ webhook_url: string | null }[]>`SELECT webhook_url FROM tenants WHERE id = ${tenantId}`;
    const url = rows[0]?.webhook_url;
    if (!url) return;
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: event, timestamp: Date.now(), payload: payload }),
      signal: AbortSignal.timeout(10_000),
    });
  })().catch(function ignore() {});
}
