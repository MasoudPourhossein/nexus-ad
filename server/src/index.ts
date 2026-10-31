import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { createReadStream, existsSync as fileExists } from 'node:fs';
import bcrypt from 'bcryptjs';
import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authenticate } from './auth.js';
import { config } from './config.js';
import { join as pathJoin } from 'node:path';
import { migrate, sql } from './db.js';
import { registerGuard } from './guard.js';
import { HttpError, sendError } from './http.js';
import { handleWahaEvent } from './incoming.js';
import { adminRoutes } from './routes/admin.js';
import { campaignRoutes } from './routes/campaigns.js';
import { contactRoutes } from './routes/contacts.js';
import { mediaRoutes } from './routes/media.js';
import { groupRoutes } from './routes/groups.js';
import { coreRoutes } from './routes/core.js';
import { sessionRoutes } from './routes/sessions.js';
import { startScheduler, stopScheduler } from './sender.js';
import { startActiveProxy } from './settings.js';
import { stopXray } from './xray.js';

function joinMedia(id: string): string { return pathJoin(config.mediaDir, id); }
const basePath = ('/' + (process.env.NEXUS_BASE_PATH ?? '').replace(/^\/+|\/+$/g, '')).replace(/^\/$/, '');
const internalPort = Number(process.env.NEXUS_INTERNAL_PORT ?? 3101);
const webDir = process.env.NEXUS_WEB_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'web', 'dist');

function httpsOptions(): { key: Buffer; cert: Buffer } | undefined {
  const cert = process.env.NEXUS_TLS_CERT;
  const key = process.env.NEXUS_TLS_KEY;
  if (cert && key && existsSync(cert) && existsSync(key)) return { cert: readFileSync(cert), key: readFileSync(key) };
  return undefined;
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
    requestTimeout: Number(process.env.NEXUS_REQUEST_TIMEOUT_MS ?? 30_000),
    connectionTimeout: Number(process.env.NEXUS_CONNECTION_TIMEOUT_MS ?? 20_000),
    maxParamLength: 200,
    ...(https ? { https: https } : {}),
  } as any) as unknown as FastifyInstance;
  errorHandler(app);
  registerGuard(app, !!https);
  await app.register(cors, { origin: process.env.NEXUS_CORS_ORIGIN ? process.env.NEXUS_CORS_ORIGIN.split(',') : false });
  await app.register(jwt, { secret: config.jwtSecret });
  await app.register(multipart, { limits: { fileSize: config.maxUploadBytes, files: 1 } });

  await app.register(
    async function api(scope) {
      await scope.register(coreRoutes);
      await scope.register(async function tenantScope(t) {
        t.addHook('preHandler', authenticate);
        await t.register(sessionRoutes);
        await t.register(contactRoutes);
        await t.register(mediaRoutes);
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
    if ((request.query as any)?.token !== config.webhookSecret) {
      console.warn('[hook] rejected: bad token');
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const b = request.body as any;
    console.log(`[hook] event=${b?.event} session=${b?.session}`);
    handleWahaEvent(b).catch(function log(err) {
      console.error('[hook] handling failed', err);
    });
    return { ok: true };
  });
  app.get('/media/:id', async function media(request, reply) {
    const id = String((request.params as any).id).replace(/[^a-zA-Z0-9._-]/g, '');
    const path = joinMedia(id);
    if (!id || !fileExists(path)) return reply.code(404).send({ error: 'not_found' });
    return reply.send(createReadStream(path));
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
