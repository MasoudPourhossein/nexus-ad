import type { FastifyInstance } from 'fastify';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { config } from '../config.js';
import { z } from 'zod';
import { runImportJob } from '../csv-import.js';
import { sql } from '../db.js';
import { HttpError, idParam, notFound, page, parse } from '../http.js';
import { displayPhone, latinDigits, normalizePhone } from '../phone.js';

async function ownList(tenantId: number, id: number): Promise<{ id: number; name: string }> {
  const rows = await sql<{ id: number; name: string }[]>`SELECT id, name FROM contact_lists WHERE id = ${id} AND tenant_id = ${tenantId}`;
  return rows[0] ?? notFound('list_not_found');
}

export async function contactRoutes(app: FastifyInstance): Promise<void> {
  app.get('/lists', async function lists(request) {
    return sql`
      SELECT l.id, l.name, l.created_at, (SELECT count(*)::int FROM contacts c WHERE c.list_id = l.id) AS contacts
      FROM contact_lists l WHERE l.tenant_id = ${request.tenant.id} ORDER BY l.id DESC`;
  });

  app.post('/lists', async function create(request) {
    const body = parse(z.object({ name: z.string().min(1).max(200) }), request.body);
    const [row] = await sql`INSERT INTO contact_lists (tenant_id, name) VALUES (${request.tenant.id}, ${body.name}) RETURNING id, name, created_at`;
    return row;
  });

  app.patch('/lists/:id', async function rename(request) {
    const list = await ownList(request.tenant.id, idParam(request.params));
    const body = parse(z.object({ name: z.string().min(1).max(200) }), request.body);
    await sql`UPDATE contact_lists SET name = ${body.name} WHERE id = ${list.id}`;
    return { ok: true };
  });

  app.delete('/lists/:id', async function remove(request) {
    const list = await ownList(request.tenant.id, idParam(request.params));
    await sql`DELETE FROM contact_lists WHERE id = ${list.id}`;
    return { ok: true };
  });

  app.post('/lists/:id/import', async function upload(request) {
    const list = await ownList(request.tenant.id, idParam(request.params));
    const file = await request.file();
    if (!file) throw new HttpError(400, 'file_required');
    const dir = join(config.mediaDir, 'imports');
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${request.tenant.id}_${randomUUID()}.csv`);
    await pipeline(file.file, createWriteStream(path));
    const [job] = await sql<{ id: bigint }[]>`
      INSERT INTO import_jobs (tenant_id, list_id) VALUES (${request.tenant.id}, ${list.id}) RETURNING id`;
    // Run in the background so a 10M-row file is not bound by the request timeout.
    void runImportJob(job.id, path, request.tenant.id, list.id);
    return { jobId: String(job.id) };
  });

  app.get('/import-jobs/:id', async function jobStatus(request) {
    const rows = await sql`
      SELECT id, list_id, status, rows, imported, invalid, duplicates, error, created_at, updated_at
      FROM import_jobs WHERE id = ${String((request.params as any).id)}::bigint AND tenant_id = ${request.tenant.id}`;
    if (!rows[0]) notFound('job_not_found');
    return { ...rows[0], id: String(rows[0].id) };
  });

  app.get('/lists/:id/import-jobs', async function listJobs(request) {
    const list = await ownList(request.tenant.id, idParam(request.params));
    const rows = await sql`SELECT id, status, rows, imported, invalid, duplicates, error, updated_at FROM import_jobs WHERE list_id = ${list.id} ORDER BY id DESC LIMIT 5`;
    return rows.map((r: any) => ({ ...r, id: String(r.id) }));
  });

  app.post('/lists/:id/contacts', async function add(request) {
    const list = await ownList(request.tenant.id, idParam(request.params));
    const body = parse(
      z.object({
        text: z.string().max(5_000_000).optional(),
        contacts: z.array(z.object({ phone: z.string(), name: z.string().optional(), vars: z.record(z.string(), z.string()).optional() })).max(100000).optional(),
      }),
      request.body,
    );
    const { importCsv } = await import('../csv-import.js');
    if (body.contacts) {
      const lines = ['phone,name', ...body.contacts.map((c) => `${c.phone},${(c.name ?? '').replace(/[,\n]/g, ' ')}`)].join('\n');
      return importCsv(Readable.from([lines]), request.tenant.id, list.id);
    }
    const text = (body.text ?? '').split(/[\n,;\s]+/).filter(Boolean).join('\n');
    return importCsv(Readable.from([text]), request.tenant.id, list.id);
  });

  app.get('/lists/:id/contacts', async function contacts(request) {
    const list = await ownList(request.tenant.id, idParam(request.params));
    const { limit, offset } = page(request.query);
    const q = String((request.query as any)?.q ?? '').trim();
    const digits = latinDigits(q).replace(/\D/g, '');
    const national = digits.replace(/^0+/, '');
    const like = `%${digits}%`;
    const likeNat = `%${national}%`;
    const rows = await sql`
      SELECT id, phone, name, vars, created_at FROM contacts
      WHERE list_id = ${list.id} AND (${q} = '' OR (${digits} <> '' AND (phone LIKE ${like} OR phone LIKE ${likeNat})) OR name ILIKE ${'%' + q + '%'})
      ORDER BY id LIMIT ${limit} OFFSET ${offset}`;
    // exact count only when searching or on small lists; otherwise an estimate keeps huge lists instant
    let total: number;
    if (q) {
      const [c] = await sql<{ total: number }[]>`SELECT count(*)::int AS total FROM contacts WHERE list_id = ${list.id} AND ((${digits} <> '' AND (phone LIKE ${like} OR phone LIKE ${likeNat})) OR name ILIKE ${'%' + q + '%'})`;
      total = c.total;
    } else {
      const [lc] = await sql<{ contacts: number }[]>`SELECT (SELECT count(*)::int FROM contacts WHERE list_id = ${list.id}) AS contacts`;
      total = lc.contacts;
    }
    return { total: total, items: rows.map((r: any) => ({ ...r, id: String(r.id), display: displayPhone(r.phone) })) };
  });

  app.delete('/lists/:id/contacts/:cid', async function removeContact(request) {
    const list = await ownList(request.tenant.id, idParam(request.params));
    await sql`DELETE FROM contacts WHERE id = ${Number((request.params as any).cid)} AND list_id = ${list.id}`;
    return { ok: true };
  });

  app.get('/opt-outs', async function optOuts(request) {
    const { limit, offset } = page(request.query);
    const rows = await sql`SELECT phone, created_at FROM opt_outs WHERE tenant_id = ${request.tenant.id} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    return rows.map((r: any) => ({ ...r, display: displayPhone(r.phone) }));
  });

  app.post('/opt-outs', async function addOptOut(request) {
    const body = parse(z.object({ phone: z.string() }), request.body);
    const phone = normalizePhone(body.phone);
    if (!phone) throw new HttpError(400, 'invalid_phone');
    await sql`INSERT INTO opt_outs (tenant_id, phone) VALUES (${request.tenant.id}, ${phone}) ON CONFLICT DO NOTHING`;
    return { ok: true };
  });

  app.delete('/opt-outs/:phone', async function removeOptOut(request) {
    const phone = normalizePhone((request.params as any).phone);
    if (phone) await sql`DELETE FROM opt_outs WHERE tenant_id = ${request.tenant.id} AND phone = ${phone}`;
    return { ok: true };
  });
}
