import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth.js';
import { sql } from '../db.js';
import { HttpError, idParam, notFound, parse } from '../http.js';
import { listProviders } from '../providers/index.js';
import { startActiveProxy, syncSessionsProxy } from '../settings.js';
import { parseLink, testThroughProxy, xrayStatus } from '../xray.js';

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
    await sql`
      UPDATE tenants SET name = ${b.name ?? t.name}, active = ${b.active ?? t.active},
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
    const rows = await sql`SELECT id, name, protocol, active, last_test_ok, last_test_ms, last_test_at, created_at, outbound->'streamSettings'->>'network' AS network, outbound->'streamSettings'->>'security' AS security FROM proxies ORDER BY id`;
    return { items: rows, xray: xrayStatus() };
  });

  app.post('/admin/proxy', async function addProxy(request) {
    const b = parse(z.object({ links: z.string().min(5).max(100_000) }), request.body);
    const added: unknown[] = [];
    const errors: string[] = [];
    for (const line of b.links.split(/\s+/).filter(Boolean)) {
      try {
        const p = parseLink(line);
        const [row] = await sql`
          INSERT INTO proxies (name, link, protocol, outbound) VALUES (${p.name}, ${line}, ${p.protocol}, ${sql.json(p.outbound)})
          RETURNING id, name, protocol`;
        added.push(row);
      } catch (err: any) {
        errors.push(`${line.slice(0, 40)}...: ${err.message}`);
      }
    }
    return { added: added, errors: errors };
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
