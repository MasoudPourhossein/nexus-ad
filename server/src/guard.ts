import type { FastifyInstance } from 'fastify';
import { config } from './config.js';

interface Counter {
  hits: number;
  resetAt: number;
}

const requests = new Map<string, Counter>();
const violations = new Map<string, Counter>();
const bans = new Map<string, number>();

function sweep(): void {
  const now = Date.now();
  for (const [k, v] of requests) if (v.resetAt < now) requests.delete(k);
  for (const [k, v] of violations) if (v.resetAt < now) violations.delete(k);
  for (const [k, until] of bans) if (until < now) bans.delete(k);
}

function bump(map: Map<string, Counter>, key: string, windowMs: number): number {
  const now = Date.now();
  const c = map.get(key);
  if (!c || c.resetAt < now) {
    map.set(key, { hits: 1, resetAt: now + windowMs });
    return 1;
  }
  c.hits += 1;
  return c.hits;
}

/** Match an IP against allowlist entries: exact IP or "1.2.3." prefix. */
function allowed(ip: string): boolean {
  if (!config.ipAllowlist.length) return true;
  return config.ipAllowlist.some(function test(entry) {
    if (entry.endsWith('.')) return ip.startsWith(entry);
    return ip === entry;
  });
}

export function banStats(): { bans: number; tracked: number } {
  return { bans: bans.size, tracked: requests.size };
}

/**
 * Per-IP request throttling, automatic temporary bans for IPs that keep
 * producing auth/not-found/limit errors, an optional IP allowlist, and
 * hardening headers. Volumetric DDoS still needs an upstream (see README).
 */
export function registerGuard(app: FastifyInstance, https: boolean): void {
  const timer = setInterval(sweep, 60_000);
  timer.unref();
  app.addHook('onClose', async function stop() {
    clearInterval(timer);
  });

  app.addHook('onRequest', async function guard(request, reply) {
    const ip = request.ip;
    if (!allowed(ip)) return reply.code(403).send({ error: 'forbidden' });
    const until = bans.get(ip);
    if (until && until > Date.now()) {
      reply.header('retry-after', String(Math.ceil((until - Date.now()) / 1000)));
      return reply.code(429).send({ error: 'temporarily_blocked' });
    }
    if (bump(requests, ip, 60_000) > config.rateLimitPerMin) {
      bump(violations, ip, 10 * 60_000);
      reply.header('retry-after', '60');
      return reply.code(429).send({ error: 'rate_limited' });
    }
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('cross-origin-opener-policy', 'same-origin');
    reply.header('permissions-policy', 'geolocation=(), camera=(), microphone=(self)');
    if (https) reply.header('strict-transport-security', 'max-age=31536000; includeSubDomains');
  });

  app.addHook('onResponse', async function track(request, reply) {
    const code = reply.statusCode;
    if (code !== 401 && code !== 403 && code !== 404 && code !== 429) return;
    const count = bump(violations, request.ip, 10 * 60_000);
    if (count >= config.maxViolations) {
      bans.set(request.ip, Date.now() + config.banMinutes * 60_000);
      violations.delete(request.ip);
      console.warn(`[guard] banned ${request.ip} for ${config.banMinutes}m after ${count} failed requests`);
    }
  });
}
