import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { sql } from './db.js';

export interface Tenant {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user';
  credits: number;
  plan_id: number | null;
  plan_expires_at: Date | null;
  session_limit: number | null;
  webhook_url: string | null;
  opt_out_keywords: string[];
  opt_out_reply: string | null;
  active: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    tenant: Tenant;
  }
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function newApiKey(): { key: string; prefix: string; hash: string } {
  const key = 'nx_' + randomBytes(24).toString('base64url');
  return { key: key, prefix: key.slice(0, 10), hash: hashKey(key) };
}

const TENANT_COLUMNS = sql`id, name, email, role, credits, plan_id, plan_expires_at, session_limit, webhook_url, opt_out_keywords, opt_out_reply, active`;

export async function loadTenant(id: number): Promise<Tenant | null> {
  const rows = await sql<Tenant[]>`SELECT ${TENANT_COLUMNS} FROM tenants WHERE id = ${id}`;
  return rows[0] ?? null;
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  let tenant: Tenant | null = null;
  const apiKey = request.headers['x-api-key'];
  if (typeof apiKey === 'string' && apiKey) {
    const rows = await sql<{ tenant_id: number; id: number }[]>`
      UPDATE api_keys SET last_used_at = now()
      WHERE key_hash = ${hashKey(apiKey)} AND NOT revoked
      RETURNING tenant_id, id`;
    if (rows[0]) tenant = await loadTenant(rows[0].tenant_id);
  } else {
    try {
      const payload = await request.jwtVerify<{ sub: number }>();
      tenant = await loadTenant(Number(payload.sub));
    } catch {
      tenant = null;
    }
  }
  if (!tenant || !tenant.active) {
    await reply.code(401).send({ error: 'unauthorized' });
    return;
  }
  request.tenant = tenant;
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (request.tenant?.role !== 'admin') {
    await reply.code(403).send({ error: 'forbidden' });
  }
}

/** Atomically take credits; returns false when the balance is too low. */
export async function takeCredits(tenantId: number, amount: number): Promise<boolean> {
  const rows = await sql`
    UPDATE tenants SET credits = credits - ${amount}
    WHERE id = ${tenantId} AND role <> 'admin' AND credits >= ${amount}
      AND (plan_expires_at IS NULL OR plan_expires_at > now())
    RETURNING id`;
  if (rows.length) return true;
  const admin = await sql`SELECT 1 FROM tenants WHERE id = ${tenantId} AND role = 'admin'`;
  return admin.length > 0;
}

export async function refundCredits(tenantId: number, amount: number): Promise<void> {
  await sql`UPDATE tenants SET credits = credits + ${amount} WHERE id = ${tenantId} AND role <> 'admin'`;
}
