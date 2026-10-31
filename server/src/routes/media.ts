import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { HttpError } from '../http.js';

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/webm': 'webm', 'audio/wav': 'wav',
  'application/pdf': 'pdf', 'application/zip': 'zip',
};

function extFor(mime: string, fallback: string): string {
  if (EXT[mime]) return EXT[mime];
  const guess = fallback.includes('.') ? fallback.split('.').pop()! : '';
  return (guess || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
}

/** Uploaded media is saved to disk and served to WAHA over the internal URL. */
export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  app.post('/media', async function upload(request) {
    const file = await request.file();
    if (!file) throw new HttpError(400, 'file_required');
    const mime = file.mimetype || 'application/octet-stream';
    const ext = extFor(mime, file.filename ?? '');
    const id = `${request.tenant.id}_${randomUUID()}.${ext}`;
    await mkdir(config.mediaDir, { recursive: true });
    await pipeline(file.file, createWriteStream(join(config.mediaDir, id)));
    if (file.file.truncated) throw new HttpError(413, 'file_too_large');
    return {
      mediaUrl: `${config.internalUrl.replace(/\/$/, '')}/media/${id}`,
      mimetype: mime,
      filename: file.filename ?? id,
    };
  });
}
