import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { refundCredits, takeCredits } from '../auth.js';
import { sql } from '../db.js';
import { HttpError, idParam, messageSchema, notFound, page, parse } from '../http.js';
import { displayPhone, normalizePhone } from '../phone.js';
import { ownSession } from './sessions.js';

const FUNNEL = sql`
  count(*)::int AS total,
  count(*) FILTER (WHERE status = 'queued')::int AS queued,
  count(*) FILTER (WHERE sent_at IS NOT NULL)::int AS sent,
  count(*) FILTER (WHERE delivered_at IS NOT NULL OR status IN ('delivered','read','replied'))::int AS delivered,
  count(*) FILTER (WHERE read_at IS NOT NULL OR status IN ('read','replied'))::int AS read,
  count(*) FILTER (WHERE replied_at IS NOT NULL)::int AS replied,
  count(*) FILTER (WHERE status = 'failed')::int AS failed,
  count(*) FILTER (WHERE status = 'invalid')::int AS invalid,
  count(*) FILTER (WHERE status = 'opted_out')::int AS opted_out,
  count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled`;

async function ownCampaign(tenantId: number, id: number): Promise<any> {
  const rows = await sql`SELECT * FROM campaigns WHERE id = ${id} AND tenant_id = ${tenantId}`;
  return rows[0] ?? notFound('campaign_not_found');
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function campaignRoutes(app: FastifyInstance): Promise<void> {
  app.get('/campaigns', async function list(request) {
    return sql`
      SELECT c.id, c.name, c.status, c.pause_reason, c.session_id, c.list_id, c.created_at, c.started_at, c.finished_at,
        s.label AS session_label, l.name AS list_name, f.*,
        (SELECT count(*)::int FROM leads WHERE campaign_id = c.id) AS leads
      FROM campaigns c
      JOIN wa_sessions s ON s.id = c.session_id
      JOIN contact_lists l ON l.id = c.list_id
      LEFT JOIN LATERAL (SELECT ${FUNNEL} FROM messages m WHERE m.campaign_id = c.id) f ON TRUE
      WHERE c.tenant_id = ${request.tenant.id}
      ORDER BY c.id DESC`;
  });

  app.post('/campaigns', async function create(request) {
    const body = parse(
      z.object({
        name: z.string().min(1).max(200),
        sessionId: z.number().int(),
        listId: z.number().int(),
        message: messageSchema,
        checkExists: z.boolean().default(true),
        start: z.boolean().default(false),
        ratePerMinute: z.number().int().min(0).max(600).optional(),
        dailyCap: z.number().int().min(0).max(10000000).optional(),
        autoReply: z
          .object({
            keywords: z.array(z.string().min(1).max(200)).min(1).default(['1']),
            match: z.enum(['exact', 'contains', 'any']).default('exact'),
            reply: messageSchema,
            tag: z.string().max(50).nullable().default(null),
          })
          .optional(),
      }),
      request.body,
    );
    const tid = request.tenant.id;
    await ownSession(tid, body.sessionId);
    if (body.ratePerMinute !== undefined || body.dailyCap !== undefined) {
      await sql`
        UPDATE wa_sessions SET
          rate_per_minute = COALESCE(${body.ratePerMinute ?? null}, rate_per_minute),
          daily_cap = COALESCE(${body.dailyCap ?? null}, daily_cap),
          next_send_at = now()
        WHERE id = ${body.sessionId} AND tenant_id = ${tid}`;
    }
    const list = await sql`SELECT 1 FROM contact_lists WHERE id = ${body.listId} AND tenant_id = ${tid}`;
    if (!list.length) throw new HttpError(404, 'list_not_found');
    const [row] = await sql`
      INSERT INTO campaigns (tenant_id, session_id, list_id, name, message, check_exists)
      VALUES (${tid}, ${body.sessionId}, ${body.listId}, ${body.name}, ${sql.json(body.message as any)}, ${body.checkExists})
      RETURNING *`;
    if (body.autoReply) {
      const ar = body.autoReply;
      await sql`
        INSERT INTO rules (tenant_id, session_id, campaign_id, name, keywords, match, reply, tag, active, priority)
        VALUES (${tid}, ${body.sessionId}, ${row.id}, ${body.name + ' — auto'}, ${ar.keywords}, ${ar.match}, ${sql.json(ar.reply as any)}, ${ar.tag}, TRUE, 10)`;
    }
    if (body.start) await startCampaign(row);
    return row;
  });

  app.get('/campaigns/:id', async function get(request) {
    const c = await ownCampaign(request.tenant.id, idParam(request.params));
    const [funnel] = await sql`SELECT ${FUNNEL} FROM messages WHERE campaign_id = ${c.id}`;
    const leads = await sql`SELECT tag, count(*)::int AS count FROM leads WHERE campaign_id = ${c.id} GROUP BY tag ORDER BY count DESC`;
    const hourly = await sql`
      SELECT to_char(date_trunc('hour', sent_at), 'YYYY-MM-DD HH24:00') AS hour, count(*)::int AS sent,
        count(*) FILTER (WHERE replied_at IS NOT NULL)::int AS replied
      FROM messages WHERE campaign_id = ${c.id} AND sent_at IS NOT NULL GROUP BY 1 ORDER BY 1`;
    return { ...c, funnel: funnel, leads: leads, hourly: hourly };
  });

  app.get('/campaigns/:id/messages', async function messages(request) {
    const c = await ownCampaign(request.tenant.id, idParam(request.params));
    const { limit, offset } = page(request.query);
    const status = (request.query as any)?.status as string | undefined;
    const rows = await sql`
      SELECT id, phone, status, error, sent_at, delivered_at, read_at, replied_at FROM messages
      WHERE campaign_id = ${c.id} AND (${status ?? null}::text IS NULL OR status = ${status ?? null})
      ORDER BY id LIMIT ${limit} OFFSET ${offset}`;
    return rows.map((r: any) => ({ ...r, id: String(r.id), display: displayPhone(r.phone) }));
  });

  app.post('/campaigns/:id/start', async function start(request) {
    const c = await ownCampaign(request.tenant.id, idParam(request.params));
    if (c.status !== 'draft') throw new HttpError(409, 'already_started');
    return startCampaign(c);
  });

  app.post('/campaigns/:id/pause', async function pause(request) {
    const c = await ownCampaign(request.tenant.id, idParam(request.params));
    await sql`UPDATE campaigns SET status = 'paused', pause_reason = 'manual' WHERE id = ${c.id} AND status = 'running'`;
    return { ok: true };
  });

  app.post('/campaigns/:id/resume', async function resume(request) {
    const c = await ownCampaign(request.tenant.id, idParam(request.params));
    await sql`UPDATE campaigns SET status = 'running', pause_reason = NULL WHERE id = ${c.id} AND status = 'paused'`;
    return { ok: true };
  });

  app.post('/campaigns/:id/cancel', async function cancel(request) {
    const c = await ownCampaign(request.tenant.id, idParam(request.params));
    await sql`UPDATE messages SET status = 'cancelled' WHERE campaign_id = ${c.id} AND status = 'queued'`;
    await sql`UPDATE campaigns SET status = 'cancelled', finished_at = now() WHERE id = ${c.id} AND status IN ('draft','running','paused')`;
    return { ok: true };
  });

  app.delete('/campaigns/:id', async function remove(request) {
    const c = await ownCampaign(request.tenant.id, idParam(request.params));
    if (c.status === 'running') throw new HttpError(409, 'campaign_running');
    await sql`DELETE FROM campaigns WHERE id = ${c.id}`;
    return { ok: true };
  });

  app.post('/messages', async function send(request) {
    const body = parse(z.object({ sessionId: z.number().int(), phone: z.string(), message: messageSchema }), request.body);
    const s = await ownSession(request.tenant.id, body.sessionId);
    const phone = normalizePhone(body.phone);
    if (!phone) throw new HttpError(400, 'invalid_phone');
    if (!(await takeCredits(request.tenant.id, 1))) throw new HttpError(402, 'no_credits');
    try {
      const [row] = await sql`
        INSERT INTO messages (tenant_id, session_id, phone, content, status, charged)
        VALUES (${request.tenant.id}, ${s.id}, ${phone}, ${sql.json(body.message as any)}, 'queued', TRUE)
        RETURNING id, status, created_at`;
      return { ...row, id: String(row.id) };
    } catch (err) {
      await refundCredits(request.tenant.id, 1);
      throw err;
    }
  });

  app.get('/messages/:id', async function getMessage(request) {
    const rows = await sql`
      SELECT id, session_id, campaign_id, direction, phone, content, status, error, created_at, sent_at, delivered_at, read_at, replied_at
      FROM messages WHERE id = ${String((request.params as any).id)}::bigint AND tenant_id = ${request.tenant.id}`;
    if (!rows[0]) notFound('message_not_found');
    return { ...rows[0], id: String(rows[0].id) };
  });

  app.get('/messages', async function inbox(request) {
    const { limit, offset } = page(request.query);
    const q = request.query as any;
    const phone = q?.phone ? normalizePhone(q.phone) : null;
    const direction = q?.direction ?? null;
    const rows = await sql`
      SELECT id, session_id, campaign_id, direction, phone, content, status, created_at, sent_at FROM messages
      WHERE tenant_id = ${request.tenant.id}
        AND (${phone}::text IS NULL OR phone = ${phone})
        AND (${direction}::text IS NULL OR direction = ${direction})
      ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`;
    return rows.map((r: any) => ({ ...r, id: String(r.id), display: displayPhone(r.phone) }));
  });

  app.get('/rules', async function rules(request) {
    return sql`
      SELECT r.*, (SELECT count(*)::int FROM messages m WHERE m.rule_id = r.id) AS hits
      FROM rules r WHERE r.tenant_id = ${request.tenant.id} ORDER BY r.priority DESC, r.id`;
  });

  const ruleSchema = z.object({
    name: z.string().min(1).max(200),
    sessionId: z.number().int().nullable().default(null),
    campaignId: z.number().int().nullable().default(null),
    keywords: z.array(z.string().min(1).max(200)).max(100).default([]),
    match: z.enum(['exact', 'contains', 'any']).default('exact'),
    reply: messageSchema,
    tag: z.string().max(50).nullable().default(null),
    active: z.boolean().default(true),
    priority: z.number().int().default(0),
  });

  app.post('/rules', async function createRule(request) {
    const b = parse(ruleSchema, request.body);
    if (b.sessionId) await ownSession(request.tenant.id, b.sessionId);
    if (b.campaignId) await ownCampaign(request.tenant.id, b.campaignId);
    const [row] = await sql`
      INSERT INTO rules (tenant_id, session_id, campaign_id, name, keywords, match, reply, tag, active, priority)
      VALUES (${request.tenant.id}, ${b.sessionId}, ${b.campaignId}, ${b.name}, ${b.keywords}, ${b.match}, ${sql.json(b.reply as any)}, ${b.tag}, ${b.active}, ${b.priority})
      RETURNING *`;
    return row;
  });

  app.put('/rules/:id', async function updateRule(request) {
    const id = idParam(request.params);
    const b = parse(ruleSchema, request.body);
    if (b.sessionId) await ownSession(request.tenant.id, b.sessionId);
    if (b.campaignId) await ownCampaign(request.tenant.id, b.campaignId);
    const rows = await sql`
      UPDATE rules SET session_id = ${b.sessionId}, campaign_id = ${b.campaignId}, name = ${b.name}, keywords = ${b.keywords},
        match = ${b.match}, reply = ${sql.json(b.reply as any)}, tag = ${b.tag}, active = ${b.active}, priority = ${b.priority}
      WHERE id = ${id} AND tenant_id = ${request.tenant.id} RETURNING *`;
    return rows[0] ?? notFound();
  });

  app.delete('/rules/:id', async function deleteRule(request) {
    await sql`DELETE FROM rules WHERE id = ${idParam(request.params)} AND tenant_id = ${request.tenant.id}`;
    return { ok: true };
  });

  app.get('/leads', async function leads(request) {
    const { limit, offset } = page(request.query);
    const q = request.query as any;
    const rows = await sql`
      SELECT l.id, l.phone, l.tag, l.text, l.created_at, l.campaign_id, c.name AS campaign_name
      FROM leads l LEFT JOIN campaigns c ON c.id = l.campaign_id
      WHERE l.tenant_id = ${request.tenant.id}
        AND (${q?.tag ?? null}::text IS NULL OR l.tag = ${q?.tag ?? null})
        AND (${q?.campaignId ? Number(q.campaignId) : null}::int IS NULL OR l.campaign_id = ${q?.campaignId ? Number(q.campaignId) : null})
      ORDER BY l.id DESC LIMIT ${limit} OFFSET ${offset}`;
    const tags = await sql`SELECT tag, count(*)::int AS count FROM leads WHERE tenant_id = ${request.tenant.id} GROUP BY tag ORDER BY count DESC`;
    return { tags: tags, items: rows.map((r: any) => ({ ...r, id: String(r.id), display: displayPhone(r.phone) })) };
  });

  app.get('/leads.csv', async function exportLeads(request, reply) {
    const q = request.query as any;
    const rows = await sql`
      SELECT l.phone, l.tag, l.text, l.created_at, c.name AS campaign_name
      FROM leads l LEFT JOIN campaigns c ON c.id = l.campaign_id
      WHERE l.tenant_id = ${request.tenant.id} AND (${q?.tag ?? null}::text IS NULL OR l.tag = ${q?.tag ?? null})
      ORDER BY l.id DESC`;
    const lines = ['phone,tag,text,campaign,created_at'];
    for (const r of rows as any[]) {
      lines.push([displayPhone(r.phone), r.tag, r.text, r.campaign_name, new Date(r.created_at).toISOString()].map(csvEscape).join(','));
    }
    reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', 'attachment; filename="leads.csv"');
    return '﻿' + lines.join('\n');
  });
}

async function startCampaign(c: any): Promise<{ queued: number }> {
  const inserted = await sql`
    INSERT INTO messages (tenant_id, session_id, campaign_id, contact_id, phone, content, status)
    SELECT ${c.tenant_id}, ${c.session_id}, ${c.id}, ct.id, ct.phone, ${sql.json(c.message)}, 'queued'
    FROM contacts ct
    WHERE ct.list_id = ${c.list_id}
      AND NOT EXISTS (SELECT 1 FROM opt_outs o WHERE o.tenant_id = ${c.tenant_id} AND o.phone = ct.phone)
    RETURNING id`;
  await sql`UPDATE campaigns SET status = 'running', started_at = now() WHERE id = ${c.id}`;
  return { queued: inserted.length };
}
