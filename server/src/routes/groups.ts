import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from '../db.js';
import { HttpError, idParam, parse } from '../http.js';
import { chatIdFor, normalizePhone } from '../phone.js';
import { waha } from '../waha.js';
import { ownSession } from './sessions.js';

/** Resolve participant addresses from an explicit phone array or a saved list. */
async function resolveMembers(tenantId: number, body: { phones?: string[]; listId?: number | null }): Promise<string[]> {
  const set = new Set<string>();
  for (const raw of body.phones ?? []) {
    const p = normalizePhone(raw);
    if (p) set.add(p);
  }
  if (body.listId) {
    const list = await sql`SELECT 1 FROM contact_lists WHERE id = ${body.listId} AND tenant_id = ${tenantId}`;
    if (!list.length) throw new HttpError(404, 'list_not_found');
    const rows = await sql<{ phone: string }[]>`SELECT phone FROM contacts WHERE list_id = ${body.listId}`;
    for (const r of rows) set.add(r.phone);
  }
  return [...set].map(chatIdFor);
}

export async function groupRoutes(app: FastifyInstance): Promise<void> {
  const membersSchema = z.object({
    phones: z.array(z.string()).max(100000).optional(),
    listId: z.number().int().nullable().optional(),
  });

  app.get('/sessions/:id/groups', async function listGroups(request) {
    const s = await ownSession(request.tenant.id, idParam(request.params));
    const groups = await waha.listGroups(s.name);
    return (Array.isArray(groups) ? groups : []).map(function pick(g: any) {
      const id = g?.id?._serialized ?? g?.id ?? g?.JID ?? '';
      return { id: String(id), name: g?.name ?? g?.subject ?? g?.Name ?? String(id), participants: g?.participants?.length ?? g?.Participants?.length ?? null };
    });
  });

  app.post('/sessions/:id/groups', async function createGroup(request) {
    const s = await ownSession(request.tenant.id, idParam(request.params));
    const body = parse(
      membersSchema.extend({ subject: z.string().min(1).max(200) }),
      request.body,
    );
    const members = await resolveMembers(request.tenant.id, body);
    // WhatsApp caps how many members can be added at creation; add the rest after.
    const first = members.slice(0, 50);
    const rest = members.slice(50);
    const group = await waha.createGroup(s.name, body.subject, first);
    const groupId: string = group?.id?._serialized ?? group?.id ?? group?.gid?._serialized ?? '';
    const batches: { added: number; failed: number } = { added: first.length, failed: 0 };
    for (let i = 0; i < rest.length; i += 50) {
      try {
        await waha.addParticipants(s.name, groupId, rest.slice(i, i + 50));
        batches.added += Math.min(50, rest.length - i);
      } catch {
        batches.failed += Math.min(50, rest.length - i);
      }
    }
    return { groupId: groupId, members: batches, raw: group };
  });

  app.post('/sessions/:id/groups/:gid/participants', async function addMembers(request) {
    const s = await ownSession(request.tenant.id, idParam(request.params));
    const gid = String((request.params as any).gid);
    const body = parse(membersSchema, request.body);
    const members = await resolveMembers(request.tenant.id, body);
    let added = 0;
    let failed = 0;
    for (let i = 0; i < members.length; i += 50) {
      try {
        await waha.addParticipants(s.name, gid, members.slice(i, i + 50));
        added += Math.min(50, members.length - i);
      } catch {
        failed += Math.min(50, members.length - i);
      }
    }
    return { added: added, failed: failed };
  });

  app.post('/sessions/:id/channels', async function createChannel(request) {
    const s = await ownSession(request.tenant.id, idParam(request.params));
    const body = parse(z.object({ title: z.string().min(1).max(200), description: z.string().max(2000).default('') }), request.body);
    const channel = await waha.createChannel(s.name, body.title, body.description);
    return { channel: channel };
  });
}
