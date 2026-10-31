import type { FastifyInstance } from 'fastify';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { importCsv } from '../csv-import.js';
import { sql } from '../db.js';
import { HttpError, idParam, notFound, page, parse } from '../http.js';
import { displayPhone, normalizePhone } from '../phone.js';

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
    return importCsv(file.file, request.tenant.id, list.id);
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
    const like = `%${normalizePhone(q) ?? q}%`;
    const rows = await sql`
      SELECT id, phone, name, vars, created_at FROM contacts
      WHERE list_id = ${list.id} AND (${q} = '' OR phone LIKE ${like} OR name ILIKE ${'%' + q + '%'})
      ORDER BY id LIMIT ${limit} OFFSET ${offset}`;
    const [{ total }] = await sql<{ total: number }[]>`SELECT count(*)::int AS total FROM contacts WHERE list_id = ${list.id}`;
    return { total: total, items: rows.map((r: any) => ({ ...r, display: displayPhone(r.phone) })) };
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
