import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, newApiKey } from '../auth.js';
import { sql } from '../db.js';
import { HttpError, idParam, parse } from '../http.js';

const failures = new Map<string, { count: number; until: number }>();
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;

function locked(key: string): boolean {
  const f = failures.get(key);
  return !!f && f.count >= MAX_FAILS && f.until > Date.now();
}

function fail(key: string): void {
  const f = failures.get(key);
  if (!f || f.until < Date.now()) failures.set(key, { count: 1, until: Date.now() + LOCK_MS });
  else f.count += 1;
}

export async function coreRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/login', async function login(request, reply) {
    const body = parse(z.object({ email: z.string().min(1).max(200), password: z.string().min(1).max(200) }), request.body);
    const key = `${request.ip}|${body.email.toLowerCase()}`;
    if (locked(key) || locked(request.ip)) throw new HttpError(429, 'too_many_attempts');
    const rows = await sql<{ id: number; password_hash: string; active: boolean }[]>`
      SELECT id, password_hash, active FROM tenants WHERE lower(email) = lower(${body.email})`;
    const user = rows[0];
    const ok = user && user.active && (await bcrypt.compare(body.password, user.password_hash));
    if (!ok) {
      fail(key);
      fail(request.ip);
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 400));
      throw new HttpError(401, 'invalid_credentials');
    }
    failures.delete(key);
    const token = await reply.jwtSign({ sub: user.id }, { expiresIn: '7d' });
    return { token: token };
  });

  app.register(async function authed(scope) {
    scope.addHook('preHandler', authenticate);

    scope.get('/me', async function me(request) {
      const t = request.tenant;
      const plan = t.plan_id ? (await sql`SELECT id, name, message_quota, session_limit FROM plans WHERE id = ${t.plan_id}`)[0] : null;
      const [{ sessions }] = await sql<{ sessions: number }[]>`SELECT count(*)::int AS sessions FROM wa_sessions WHERE tenant_id = ${t.id}`;
      return {
        id: t.id,
        name: t.name,
        email: t.email,
        role: t.role,
        credits: t.role === 'admin' ? null : t.credits,
        plan: plan,
        planExpiresAt: t.plan_expires_at,
        sessionLimit: t.role === 'admin' ? null : (t.session_limit ?? plan?.session_limit ?? null),
        sessions: sessions,
        webhookUrl: t.webhook_url,
        optOutKeywords: t.opt_out_keywords,
        optOutReply: t.opt_out_reply,
      };
    });

    scope.patch('/me', async function updateMe(request) {
      const body = parse(
        z.object({
          name: z.string().min(1).max(200).optional(),
          webhookUrl: z.string().url().nullable().optional(),
          optOutKeywords: z.array(z.string().min(1).max(50)).max(50).optional(),
          optOutReply: z.string().max(1000).nullable().optional(),
          currentPassword: z.string().optional(),
          newPassword: z.string().min(8).max(200).optional(),
        }),
        request.body,
      );
      const t = request.tenant;
      if (body.newPassword) {
        const [row] = await sql<{ password_hash: string }[]>`SELECT password_hash FROM tenants WHERE id = ${t.id}`;
        if (!body.currentPassword || !(await bcrypt.compare(body.currentPassword, row.password_hash))) {
          throw new HttpError(400, 'wrong_password');
        }
        await sql`UPDATE tenants SET password_hash = ${await bcrypt.hash(body.newPassword, 10)} WHERE id = ${t.id}`;
      }
      await sql`
        UPDATE tenants SET
          name = COALESCE(${body.name ?? null}, name),
          webhook_url = ${body.webhookUrl === undefined ? t.webhook_url : body.webhookUrl},
          opt_out_keywords = ${body.optOutKeywords ?? t.opt_out_keywords},
          opt_out_reply = ${body.optOutReply === undefined ? t.opt_out_reply : body.optOutReply}
        WHERE id = ${t.id}`;
      return { ok: true };
    });

    scope.get('/api-keys', async function listKeys(request) {
      return sql`SELECT id, name, prefix, revoked, last_used_at, created_at FROM api_keys WHERE tenant_id = ${request.tenant.id} ORDER BY id DESC`;
    });

    scope.post('/api-keys', async function createKey(request) {
      const body = parse(z.object({ name: z.string().min(1).max(100) }), request.body);
      const k = newApiKey();
      const [row] = await sql`
        INSERT INTO api_keys (tenant_id, name, prefix, key_hash) VALUES (${request.tenant.id}, ${body.name}, ${k.prefix}, ${k.hash})
        RETURNING id, name, prefix, created_at`;
      return { ...row, key: k.key };
    });

    scope.delete('/api-keys/:id', async function revokeKey(request) {
      await sql`UPDATE api_keys SET revoked = TRUE WHERE id = ${idParam(request.params)} AND tenant_id = ${request.tenant.id}`;
      return { ok: true };
    });

    scope.get('/stats', async function stats(request) {
      const tid = request.tenant.id;
      const [totals] = await sql`
        SELECT
          count(*) FILTER (WHERE direction = 'out' AND sent_at >= date_trunc('day', now()))::int AS sent_today,
          count(*) FILTER (WHERE direction = 'out' AND sent_at IS NOT NULL)::int AS sent_total,
          count(*) FILTER (WHERE direction = 'out' AND status IN ('delivered','read','replied'))::int AS delivered_total,
          count(*) FILTER (WHERE direction = 'out' AND status IN ('read','replied'))::int AS read_total,
          count(*) FILTER (WHERE direction = 'out' AND status = 'replied')::int AS replied_total,
          count(*) FILTER (WHERE direction = 'out' AND status = 'failed')::int AS failed_total,
          count(*) FILTER (WHERE direction = 'out' AND status = 'queued')::int AS queued,
          count(*) FILTER (WHERE direction = 'in')::int AS received_total
        FROM messages WHERE tenant_id = ${tid}`;
      const daily = await sql`
        SELECT to_char(d, 'YYYY-MM-DD') AS day,
          (SELECT count(*)::int FROM messages WHERE tenant_id = ${tid} AND direction = 'out' AND sent_at >= d AND sent_at < d + interval '1 day') AS sent,
          (SELECT count(*)::int FROM messages WHERE tenant_id = ${tid} AND direction = 'in' AND created_at >= d AND created_at < d + interval '1 day') AS received
        FROM generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') AS d`;
      const [counts] = await sql`
        SELECT
          (SELECT count(*)::int FROM wa_sessions WHERE tenant_id = ${tid}) AS sessions,
          (SELECT count(*)::int FROM wa_sessions WHERE tenant_id = ${tid} AND status = 'WORKING') AS sessions_working,
          (SELECT count(*)::int FROM contacts WHERE tenant_id = ${tid}) AS contacts,
          (SELECT count(*)::int FROM campaigns WHERE tenant_id = ${tid} AND status = 'running') AS campaigns_running,
          (SELECT count(*)::int FROM opt_outs WHERE tenant_id = ${tid}) AS opt_outs`;
      return { totals: totals, counts: counts, daily: daily, credits: request.tenant.role === 'admin' ? null : request.tenant.credits };
    });
  });
}
