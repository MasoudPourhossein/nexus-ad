import type { FastifyReply } from 'fastify';
import { z } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(400, 'validation_error', result.error.issues);
  }
  return result.data;
}

export function notFound(what = 'not_found'): never {
  throw new HttpError(404, what);
}

export function idParam(params: unknown): number {
  const id = Number((params as any)?.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'invalid_id');
  return id;
}

export function page(query: any): { limit: number; offset: number } {
  const limit = Math.min(200, Math.max(1, Number(query?.limit ?? 50)));
  const p = Math.max(1, Number(query?.page ?? 1));
  return { limit: limit, offset: (p - 1) * limit };
}

export function sendError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof HttpError) {
    return reply.code(err.status).send({ error: err.message, details: err.details });
  }
  return reply.code(500).send({ error: 'internal_error' });
}

export const messageSchema = z.object({
  type: z.enum(['text', 'image', 'file', 'video', 'voice']).default('text'),
  text: z.string().max(4096).optional(),
  mediaUrl: z.string().url().optional(),
  filename: z.string().max(255).optional(),
  mimetype: z.string().max(100).optional(),
}).refine((m) => m.type === 'text' ? !!m.text : !!m.mediaUrl, { message: 'text or mediaUrl is required' });
