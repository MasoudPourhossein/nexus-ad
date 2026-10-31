import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '../db.js';
import { HttpError, idParam, notFound, parse } from '../http.js';
import { normalizePhone } from '../phone.js';
import { activeProxy } from '../settings.js';
import { config } from '../config.js';
import { waha } from '../waha.js';

interface SessionRow {
  id: number;
  tenant_id: number;
  name: string;
  label: string;
  status: string;
  phone: string | null;
  rate_per_minute: number;
  daily_cap: number;
}

export async function ownSession(tenantId: number, id: number): Promise<SessionRow> {
  const rows = await sql<SessionRow[]>`SELECT id, tenant_id, name, label, status, phone, rate_per_minute, daily_cap FROM wa_sessions WHERE id = ${id} AND tenant_id = ${tenantId}`;
  return rows[0] ?? notFound('session_not_found');
}

export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/sessions', async function list(request) {
    return sql`
      SELECT s.id, s.label, s.status, s.phone, s.rate_per_minute, s.daily_cap, s.created_at,
        (SELECT count(*)::int FROM messages m WHERE m.session_id = s.id AND m.direction = 'out' AND m.sent_at >= date_trunc('day', now())) AS sent_today
      FROM wa_sessions s WHERE s.tenant_id = ${request.tenant.id} ORDER BY s.id`;
  });

  app.post('/sessions', async function create(request) {
    const body = parse(
      z.object({
        label: z.string().min(1).max(100),
        ratePerMinute: z.number().int().min(0).max(config.maxRatePerMinute).default(10),
        dailyCap: z.number().int().min(0).max(config.maxDailyCap).default(5000),
      }),
      request.body,
    );
    const t = request.tenant;
    if (t.role !== 'admin') {
      const plan = t.plan_id ? (await sql<{ session_limit: number }[]>`SELECT session_limit FROM plans WHERE id = ${t.plan_id}`)[0] : null;
      const limit = t.session_limit ?? plan?.session_limit ?? 0;
      const [{ count }] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM wa_sessions WHERE tenant_id = ${t.id}`;
      if (count >= limit) throw new HttpError(402, 'session_limit_reached');
    }
    const name = `t${t.id}_${randomBytes(4).toString('hex')}`;
    await waha.createSession(name, await activeProxy());
    const [row] = await sql`
      INSERT INTO wa_sessions (tenant_id, name, label, rate_per_minute, daily_cap)
      VALUES (${t.id}, ${name}, ${body.label}, ${body.ratePerMinute}, ${body.dailyCap})
      RETURNING id, label, status, rate_per_minute, daily_cap, created_at`;
    return row;
  });

  app.get('/sessions/:id', async function get(request) {
    const s = await ownSession(request.tenant.id, idParam(request.params));
    try {
      const info = await waha.getSession(s.name);
      const phone = normalizePhone(String(info?.me?.id ?? '').split('@')[0]);
      await sql`UPDATE wa_sessions SET status = ${info.status}, phone = COALESCE(${phone}, phone) WHERE id = ${s.id}`;
      s.status = info.status;
      s.phone = phone ?? s.phone;
    } catch {
      // WAHA may be restarting; return the stored state
    }
    return { id: s.id, label: s.label, status: s.status, phone: s.phone, ratePerMinute: s.rate_per_minute, dailyCap: s.daily_cap };
  });

  app.get('/sessions/:id/qr', async function qr(request) {
    const s = await ownSession(request.tenant.id, idParam(request.params));
    const res = await waha.qr(s.name);
    return { value: res.value };
  });

  app.post('/sessions/:id/pair-code', async function pair(request) {
    const s = await ownSession(request.tenant.id, idParam(request.params));
    const body = parse(z.object({ phone: z.string().min(5) }), request.body);
    const phone = normalizePhone(body.phone);
    if (!phone) throw new HttpError(400, 'invalid_phone');
    return waha.requestCode(s.name, phone);
  });

  app.patch('/sessions/:id', async function update(request) {
    const s = await ownSession(request.tenant.id, idParam(request.params));
    const body = parse(
      z.object({
        label: z.string().min(1).max(100).optional(),
        ratePerMinute: z.number().int().min(0).max(config.maxRatePerMinute).optional(),
        dailyCap: z.number().int().min(0).max(config.maxDailyCap).optional(),
      }),
      request.body,
    );
    await sql`
      UPDATE wa_sessions SET label = ${body.label ?? s.label}, rate_per_minute = ${body.ratePerMinute ?? s.rate_per_minute},
        daily_cap = ${body.dailyCap ?? s.daily_cap}, next_send_at = now()
      WHERE id = ${s.id}`;
    return { ok: true };
  });

  app.post('/sessions/:id/restart', async function restart(request) {
    const s = await ownSession(request.tenant.id, idParam(request.params));
    await waha.updateSession(s.name, await activeProxy()).catch(function ignore() {});
    await waha.restartSession(s.name);
    return { ok: true };
  });

  app.post('/sessions/:id/logout', async function logout(request) {
    const s = await ownSession(request.tenant.id, idParam(request.params));
    await waha.logoutSession(s.name);
    await sql`UPDATE wa_sessions SET phone = NULL WHERE id = ${s.id}`;
    return { ok: true };
  });

  app.delete('/sessions/:id', async function remove(request) {
    const s = await ownSession(request.tenant.id, idParam(request.params));
    await waha.deleteSession(s.name).catch(function ignore() {});
    await sql`DELETE FROM wa_sessions WHERE id = ${s.id}`;
    return { ok: true };
  });
}
