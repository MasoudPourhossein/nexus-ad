import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import bcrypt from 'bcryptjs';
import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authenticate } from './auth.js';
import { config } from './config.js';
import { migrate, sql } from './db.js';
import { HttpError, sendError } from './http.js';
import { handleWahaEvent } from './incoming.js';
import { adminRoutes } from './routes/admin.js';
import { campaignRoutes } from './routes/campaigns.js';
import { contactRoutes } from './routes/contacts.js';
import { groupRoutes } from './routes/groups.js';
import { coreRoutes } from './routes/core.js';
import { sessionRoutes } from './routes/sessions.js';
import { startScheduler, stopScheduler } from './sender.js';
import { startActiveProxy } from './settings.js';
import { stopXray } from './xray.js';

const basePath = ('/' + (process.env.NEXUS_BASE_PATH ?? '').replace(/^\/+|\/+$/g, '')).replace(/^\/$/, '');
const internalPort = Number(process.env.NEXUS_INTERNAL_PORT ?? 3101);
const webDir = process.env.NEXUS_WEB_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'dist');

function httpsOptions(): { key: Buffer; cert: Buffer } | undefined {
  const cert = process.env.NEXUS_TLS_CERT;
  const key = process.env.NEXUS_TLS_KEY;
  if (cert && key && existsSync(cert) && existsSync(key)) return { cert: readFileSync(cert), key: readFileSync(key) };
  return undefined;
}

/** Simple per-IP limiter: protects every public route. */
function rateLimiter(limitPerMinute: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  setInterval(function cleanup() {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, 60_000).unref();
  return function check(ip: string): boolean {
    const now = Date.now();
    const h = hits.get(ip);
    if (!h || h.reset < now) {
      hits.set(ip, { n: 1, reset: now + 60_000 });
      return true;
    }
    h.n += 1;
    return h.n <= limitPerMinute;
  };
}

function errorHandler(app: FastifyInstance): void {
  app.setErrorHandler(function onError(err: any, request, reply) {
    if (err instanceof HttpError) return sendError(reply, err);
    if (err?.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.code ?? err.message });
    request.log.error(err);
    return reply.code(502).send({ error: 'upstream_error', message: String(err?.message ?? err).slice(0, 300) });
  });
}

async function buildPublic(): Promise<FastifyInstance> {
  const https = httpsOptions();
  const app = Fastify({
    logger: { level: process.env.NEXUS_LOG_LEVEL ?? 'info' },
    trustProxy: process.env.NEXUS_TRUST_PROXY === '1',
    bodyLimit: 10 * 1024 * 1024,
    ...(https ? { https: https } : {}),
  } as any) as unknown as FastifyInstance;
  errorHandler(app);
  const allow = rateLimiter(Number(process.env.NEXUS_RATE_LIMIT ?? 600));
  app.addHook('onRequest', async function guard(request, reply) {
    if (!allow(request.ip)) return reply.code(429).send({ error: 'rate_limited' });
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'no-referrer');
    if (https) reply.header('strict-transport-security', 'max-age=31536000');
  });
  await app.register(cors, { origin: process.env.NEXUS_CORS_ORIGIN ? process.env.NEXUS_CORS_ORIGIN.split(',') : false });
  await app.register(jwt, { secret: config.jwtSecret });
  await app.register(multipart, { limits: { fileSize: Number(process.env.NEXUS_MAX_UPLOAD_BYTES ?? 2 * 1024 * 1024 * 1024), files: 1 } });

  await app.register(
    async function api(scope) {
      await scope.register(coreRoutes);
      await scope.register(async function tenantScope(t) {
        t.addHook('preHandler', authenticate);
        await t.register(sessionRoutes);
        await t.register(contactRoutes);
        await t.register(groupRoutes);
        await t.register(campaignRoutes);
        await t.register(adminRoutes);
      });
    },
    { prefix: `${basePath}/api/v1` },
  );

  if (existsSync(webDir)) {
    const indexHtml = readFileSync(join(webDir, 'index.html'), 'utf8').replace(
      '<head>',
      `<head><script>window.__NEXUS_BASE__=${JSON.stringify(basePath)}</script><base href="${basePath}/">`,
    );
    await app.register(fastifyStatic, { root: webDir, prefix: `${basePath}/`, index: false, wildcard: false });
    app.get(`${basePath}/*`, async function spa(request, reply) {
      return reply.type('text/html').send(indexHtml);
    });
    app.get(basePath || '/', async function root(request, reply) {
      return reply.type('text/html').send(indexHtml);
    });
  }
  app.setNotFoundHandler(function notFound(request, reply) {
    reply.code(404).send({ error: 'not_found' });
  });
  return app;
}

async function buildInternal(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: 50 * 1024 * 1024 });
  app.post('/hooks/waha', async function hook(request, reply) {
    if ((request.query as any)?.token !== config.webhookSecret) return reply.code(401).send({ error: 'unauthorized' });
    handleWahaEvent(request.body).catch(function log(err) {
      console.error('webhook handling failed', err);
    });
    return { ok: true };
  });
  app.get('/health', async function health() {
    await sql`SELECT 1`;
    return { ok: true };
  });
  return app;
}

async function seedAdmin(): Promise<void> {
  const rows = await sql`SELECT 1 FROM tenants WHERE role = 'admin' LIMIT 1`;
  if (rows.length) return;
  await sql`
    INSERT INTO tenants (name, email, password_hash, role)
    VALUES ('Admin', ${config.adminEmail}, ${await bcrypt.hash(config.adminPassword, 10)}, 'admin')`;
}

async function main(): Promise<void> {
  await migrate();
  await seedAdmin();
  await startActiveProxy().catch(function log(err) {
    console.error('xray start failed', err);
  });
  const internal = await buildInternal();
  await internal.listen({ port: internalPort, host: '0.0.0.0' });
  const app = await buildPublic();
  await app.listen({ port: config.port, host: '0.0.0.0' });
  startScheduler(config.schedulerTickMs);
  async function shutdown(): Promise<void> {
    stopScheduler();
    await stopXray();
    await app.close();
    await internal.close();
    await sql.end({ timeout: 5 });
    process.exit(0);
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(function fatal(err) {
  console.error(err);
  process.exit(1);
});
