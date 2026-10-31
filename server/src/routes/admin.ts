import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth.js';
import { sql } from '../db.js';
import { HttpError, idParam, notFound, parse } from '../http.js';
import { listProviders } from '../providers/index.js';
import { getSetting, setSetting, startActiveProxy, syncSessionsProxy } from '../settings.js';
import { activateBest, failoverState } from '../failover.js';
import { waha } from '../waha.js';
import { XRAY_ADVERTISE } from '../xray.js';
import { judgeWhatsApp, parseLink, probeHttps, probeWhatsApp, testOutboundFull, testThroughProxy, xrayStatus } from '../xray.js';

const planSchema = z.object({
  name: z.string().min(1).max(100),
  price: z.number().min(0).default(0),
  messageQuota: z.number().int().min(0),
  sessionLimit: z.number().int().min(0),
  durationDays: z.number().int().min(1).max(3650).default(30),
  active: z.boolean().default(true),
});

async function assignPlan(tenantId: number, planId: number): Promise<void> {
  const plans = await sql<{ id: number; message_quota: number; duration_days: number }[]>`SELECT id, message_quota, duration_days FROM plans WHERE id = ${planId}`;
  const plan = plans[0] ?? notFound('plan_not_found');
  await sql`
    UPDATE tenants SET plan_id = ${plan.id}, credits = credits + ${plan.message_quota},
      plan_expires_at = GREATEST(COALESCE(plan_expires_at, now()), now()) + ${plan.duration_days + ' days'}::interval
    WHERE id = ${tenantId}`;
}

async function addLinks(text: string): Promise<{ added: unknown[]; errors: string[]; skipped: number }> {
  const added: unknown[] = [];
  const errors: string[] = [];
  let skipped = 0;
  for (const line of text.split(/\s+/).filter(Boolean)) {
    try {
      const p = parseLink(line);
      const dup = await sql`SELECT 1 FROM proxies WHERE link = ${line}`;
      if (dup.length) { skipped += 1; continue; }
      const [row] = await sql`
        INSERT INTO proxies (name, link, protocol, outbound) VALUES (${p.name}, ${line}, ${p.protocol}, ${sql.json(p.outbound)})
        RETURNING id, name, protocol`;
      added.push(row);
    } catch (err: any) {
      errors.push(`${line.slice(0, 40)}...: ${err.message}`);
    }
  }
  return { added: added, errors: errors, skipped: skipped };
}

function maybeBase64(text: string): string {
  const t = text.trim();
  if (/^(vless|vmess|ss|trojan):\/\//m.test(t)) return t;
  try {
    const decoded = Buffer.from(t.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    if (/(vless|vmess|ss|trojan):\/\//.test(decoded)) return decoded;
  } catch {
    // not base64
  }
  return t;
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAdmin);

  app.get('/admin/providers', async function providers() {
    return listProviders();
  });

  app.get('/admin/plans', async function plans() {
    return sql`SELECT p.*, (SELECT count(*)::int FROM tenants t WHERE t.plan_id = p.id) AS tenants FROM plans p ORDER BY p.id`;
  });

  app.post('/admin/plans', async function createPlan(request) {
    const b = parse(planSchema, request.body);
    const [row] = await sql`
      INSERT INTO plans (name, price, message_quota, session_limit, duration_days, active)
      VALUES (${b.name}, ${b.price}, ${b.messageQuota}, ${b.sessionLimit}, ${b.durationDays}, ${b.active}) RETURNING *`;
    return row;
  });

  app.put('/admin/plans/:id', async function updatePlan(request) {
    const b = parse(planSchema, request.body);
    const rows = await sql`
      UPDATE plans SET name = ${b.name}, price = ${b.price}, message_quota = ${b.messageQuota}, session_limit = ${b.sessionLimit},
        duration_days = ${b.durationDays}, active = ${b.active}
      WHERE id = ${idParam(request.params)} RETURNING *`;
    return rows[0] ?? notFound();
  });

  app.delete('/admin/plans/:id', async function deletePlan(request) {
    await sql`DELETE FROM plans WHERE id = ${idParam(request.params)}`;
    return { ok: true };
  });

  app.get('/admin/tenants', async function tenants() {
    return sql`
      SELECT t.id, t.name, t.email, t.role, t.credits, t.plan_id, p.name AS plan_name, t.plan_expires_at, t.session_limit, t.active, t.created_at,
        (SELECT count(*)::int FROM wa_sessions s WHERE s.tenant_id = t.id) AS sessions,
        (SELECT count(*)::int FROM messages m WHERE m.tenant_id = t.id AND m.direction = 'out' AND m.sent_at IS NOT NULL) AS sent
      FROM tenants t LEFT JOIN plans p ON p.id = t.plan_id ORDER BY t.id`;
  });

  app.post('/admin/tenants', async function createTenant(request) {
    const b = parse(
      z.object({
        name: z.string().min(1).max(200),
        email: z.string().email(),
        password: z.string().min(8).max(200),
        role: z.enum(['admin', 'user']).default('user'),
        planId: z.number().int().optional(),
        credits: z.number().int().min(0).default(0),
        sessionLimit: z.number().int().min(0).nullable().default(null),
      }),
      request.body,
    );
    const exists = await sql`SELECT 1 FROM tenants WHERE lower(email) = lower(${b.email})`;
    if (exists.length) throw new HttpError(409, 'email_taken');
    const [row] = await sql<{ id: number }[]>`
      INSERT INTO tenants (name, email, password_hash, role, credits, session_limit)
      VALUES (${b.name}, ${b.email}, ${await bcrypt.hash(b.password, 10)}, ${b.role}, ${b.credits}, ${b.sessionLimit})
      RETURNING id`;
    if (b.planId) await assignPlan(row.id, b.planId);
    return { id: row.id };
  });

  app.patch('/admin/tenants/:id', async function updateTenant(request) {
    const id = idParam(request.params);
    const b = parse(
      z.object({
        name: z.string().min(1).max(200).optional(),
        active: z.boolean().optional(),
        password: z.string().min(8).max(200).optional(),
        sessionLimit: z.number().int().min(0).nullable().optional(),
      }),
      request.body,
    );
    const [t] = await sql`SELECT * FROM tenants WHERE id = ${id}`;
    if (!t) notFound();
    const nextActive = t.role === 'admin' ? true : (b.active ?? t.active);
    await sql`
      UPDATE tenants SET name = ${b.name ?? t.name}, active = ${nextActive},
        session_limit = ${b.sessionLimit === undefined ? t.session_limit : b.sessionLimit}
      WHERE id = ${id}`;
    if (b.password) await sql`UPDATE tenants SET password_hash = ${await bcrypt.hash(b.password, 10)} WHERE id = ${id}`;
    return { ok: true };
  });

  app.post('/admin/tenants/:id/plan', async function setPlan(request) {
    const b = parse(z.object({ planId: z.number().int() }), request.body);
    await assignPlan(idParam(request.params), b.planId);
    return { ok: true };
  });

  app.post('/admin/tenants/:id/credits', async function credits(request) {
    const b = parse(z.object({ amount: z.number().int() }), request.body);
    const rows = await sql`UPDATE tenants SET credits = GREATEST(0, credits + ${b.amount}) WHERE id = ${idParam(request.params)} RETURNING credits`;
    return rows[0] ?? notFound();
  });

  app.delete('/admin/tenants/:id', async function deleteTenant(request) {
    const id = idParam(request.params);
    if (id === request.tenant.id) throw new HttpError(400, 'cannot_delete_self');
    await sql`DELETE FROM tenants WHERE id = ${id}`;
    return { ok: true };
  });

  app.get('/admin/proxy', async function proxies() {
    const rows = await sql`SELECT id, name, protocol, active, last_test_ok, last_test_ms, last_test_at, wa_ok, wa_note, created_at, outbound->'streamSettings'->>'network' AS network, outbound->'streamSettings'->>'security' AS security FROM proxies ORDER BY id`;
    const sub = await getSetting<string | null>('subscription_url', null);
    const failover = await getSetting<boolean>('proxy_failover', true);
    // Ask WAHA what proxy each session is really running with, so the UI never lies.
    const sessionRows = await sql<{ id: number; label: string; name: string }[]>`SELECT id, label, name FROM wa_sessions ORDER BY id`;
    const sessions = [];
    for (const srow of sessionRows) {
      try {
        const info = await waha.getSession(srow.name);
        sessions.push({ id: srow.id, label: srow.label, status: info?.status ?? 'UNKNOWN', proxy: info?.config?.proxy?.server ?? null });
      } catch (err: any) {
        sessions.push({ id: srow.id, label: srow.label, status: 'UNREACHABLE', proxy: null, error: String(err?.message ?? err).slice(0, 120) });
      }
    }
    return { items: rows, xray: xrayStatus(), subscriptionUrl: sub, failover: failover, failoverState: failoverState(), sessions: sessions, advertise: XRAY_ADVERTISE };
  });

  app.post('/admin/proxy', async function addProxy(request) {
    const b = parse(z.object({ links: z.string().min(5).max(500_000) }), request.body);
    return addLinks(maybeBase64(b.links));
  });

  app.post('/admin/proxy/subscription', async function importSub(request) {
    const b = parse(z.object({ url: z.string().url() }), request.body);
    const res = await fetch(b.url, { headers: { 'user-agent': 'v2rayN/6.0' }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new HttpError(502, 'subscription_fetch_failed', `${res.status}`);
    const body = await res.text();
    const result = await addLinks(maybeBase64(body));
    await setSetting('subscription_url', b.url);
    return result;
  });

  app.post('/admin/proxy/test-all', async function testAll() {
    const rows = await sql<{ id: number; name: string; outbound: Record<string, any> }[]>`SELECT id, name, outbound FROM proxies ORDER BY id`;
    const results: any[] = [];
    for (const r of rows) {
      try {
        const t = await testOutboundFull(r.outbound);
        await sql`UPDATE proxies SET last_test_ok = TRUE, last_test_ms = ${t.ms}, last_test_at = now(), wa_ok = ${t.wa.ok}, wa_note = ${t.wa.note} WHERE id = ${r.id}`;
        results.push({ id: r.id, name: r.name, ok: true, ms: t.ms, wa: t.wa });
      } catch (err: any) {
        const note = String(err?.message ?? err).slice(0, 120);
        await sql`UPDATE proxies SET last_test_ok = FALSE, last_test_ms = NULL, last_test_at = now(), wa_ok = FALSE, wa_note = ${note} WHERE id = ${r.id}`;
        results.push({ id: r.id, name: r.name, ok: false, ms: null, error: note });
      }
    }
    return { results: results, xray: xrayStatus() };
  });

  app.post('/admin/proxy/auto', async function autoBest() {
    const best = await activateBest();
    if (!best) throw new HttpError(502, 'no_working_proxy');
    return { ok: true, best: best, xray: xrayStatus() };
  });

  app.get('/admin/proxy/ping', async function livePing() {
    const active = await sql`SELECT id FROM proxies WHERE active LIMIT 1`;
    if (!active.length) return { ok: false, error: 'no_active_proxy' };
    try {
      const ms = await testThroughProxy('web.whatsapp.com', 6_000);
      return { ok: true, ms: ms };
    } catch (err: any) {
      return { ok: false, error: String(err?.message ?? err).slice(0, 120) };
    }
  });

  app.post('/admin/proxy/check-whatsapp', async function checkWhatsApp() {
    const active = await sql`SELECT id FROM proxies WHERE active LIMIT 1`;
    if (!active.length) throw new HttpError(400, 'no_active_proxy');
    // Control: a big, unblocked site through the same proxy proves the tunnel itself works.
    let control: { ok: boolean; note: string };
    try {
      const c = await probeHttps('www.cloudflare.com', undefined, 12_000);
      control = { ok: c.status > 0 && (c.complete || c.bytes >= 20_000), note: `HTTP ${c.status}, ${c.bytes} B` };
    } catch (err: any) {
      control = { ok: false, note: String(err?.message ?? err).slice(0, 120) };
    }
    let wa;
    try {
      wa = judgeWhatsApp(await probeWhatsApp());
    } catch (err) {
      wa = judgeWhatsApp(null, err);
    }
    await sql`UPDATE proxies SET wa_ok = ${wa.ok}, wa_note = ${wa.note} WHERE id = ${active[0].id}`;
    let verdict: string = wa.verdict;
    if (!wa.ok && !control.ok) verdict = 'proxy_or_network_error';
    else if (!wa.ok && control.ok) verdict = wa.verdict === 'ip_blocked_by_whatsapp' ? 'ip_blocked_by_whatsapp' : 'whatsapp_blocks_this_ip';
    return { ok: wa.ok, verdict: verdict, whatsapp: wa, control: control, status: wa.status, ms: wa.ms, bytes: wa.bytes, line: wa.note };
  });

  app.post('/admin/proxy/failover', async function setFailover(request) {
    const b = parse(z.object({ enabled: z.boolean() }), request.body);
    await setSetting('proxy_failover', b.enabled);
    return { ok: true, enabled: b.enabled };
  });

  app.post('/admin/proxy/:id/activate', async function activate(request) {
    const id = idParam(request.params);
    await sql.begin(async function swap(tx) {
      await tx`UPDATE proxies SET active = FALSE WHERE active`;
      await tx`UPDATE proxies SET active = TRUE WHERE id = ${id}`;
    });
    await startActiveProxy();
    const result = await syncSessionsProxy();
    return { ok: true, xray: xrayStatus(), sessions: result };
  });

  app.post('/admin/proxy/deactivate', async function deactivate() {
    await sql`UPDATE proxies SET active = FALSE WHERE active`;
    await startActiveProxy();
    const result = await syncSessionsProxy();
    return { ok: true, sessions: result };
  });

  app.post('/admin/proxy/test', async function test() {
    const active = await sql<{ id: number }[]>`SELECT id FROM proxies WHERE active LIMIT 1`;
    if (!active.length) throw new HttpError(400, 'no_active_proxy');
    try {
      const ms = await testThroughProxy();
      await sql`UPDATE proxies SET last_test_ok = TRUE, last_test_ms = ${ms}, last_test_at = now() WHERE id = ${active[0].id}`;
      return { ok: true, ms: ms };
    } catch (err: any) {
      await sql`UPDATE proxies SET last_test_ok = FALSE, last_test_ms = NULL, last_test_at = now() WHERE id = ${active[0].id}`;
      return { ok: false, error: err.message, xray: xrayStatus() };
    }
  });

  app.delete('/admin/proxy/:id', async function removeProxy(request) {
    const id = idParam(request.params);
    const [row] = await sql<{ active: boolean }[]>`DELETE FROM proxies WHERE id = ${id} RETURNING active`;
    if (row?.active) {
      await startActiveProxy();
      await syncSessionsProxy();
    }
    return { ok: true };
  });
}
