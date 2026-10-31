import { sql } from './db.js';
import { XRAY_ADVERTISE, applyXray } from './xray.js';
import { waha, type ProxySettings } from './waha.js';

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const rows = await sql<{ value: T }[]>`SELECT value FROM settings WHERE key = ${key}`;
  return rows[0]?.value ?? fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await sql`
    INSERT INTO settings (key, value) VALUES (${key}, ${sql.json(value as any)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
}

export async function activeProxy(): Promise<ProxySettings | null> {
  const rows = await sql`SELECT id FROM proxies WHERE active LIMIT 1`;
  return rows.length ? { server: XRAY_ADVERTISE } : null;
}

/** Start Xray with the active proxy (or stop it). */
export async function startActiveProxy(): Promise<void> {
  const rows = await sql<{ outbound: Record<string, any> }[]>`SELECT outbound FROM proxies WHERE active LIMIT 1`;
  await applyXray(rows[0]?.outbound ?? null);
}

/** Push the current proxy setting to every WAHA session and restart them. */
export async function syncSessionsProxy(): Promise<{ updated: number; failed: string[] }> {
  const proxy = await activeProxy();
  const sessions = await sql<{ name: string }[]>`SELECT name FROM wa_sessions`;
  const failed: string[] = [];
  for (const s of sessions) {
    try {
      await waha.updateSession(s.name, proxy);
      await waha.restartSession(s.name);
    } catch {
      failed.push(s.name);
    }
  }
  return { updated: sessions.length - failed.length, failed: failed };
}
