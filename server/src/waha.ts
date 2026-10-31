import { config } from './config.js';
import type { MessageContent } from './template.js';

export class WahaError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call<T = any>(method: string, path: string, body?: unknown, raw = false): Promise<T> {
  const headers: Record<string, string> = { accept: raw ? '*/*' : 'application/json' };
  if (config.wahaApiKey) headers['x-api-key'] = config.wahaApiKey;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(config.wahaUrl.replace(/\/$/, '') + path, {
    method: method,
    headers: headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(function empty() {
      return '';
    });
    throw new WahaError(res.status, `WAHA ${method} ${path} -> ${res.status}: ${text.slice(0, 500)}`);
  }
  if (raw) return (await res.arrayBuffer()) as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export interface ProxySettings {
  server: string;
}

export function sessionConfig(proxy: ProxySettings | null) {
  const cfg: Record<string, unknown> = {
    webhooks: [
      {
        url: `${config.internalUrl.replace(/\/$/, '')}/hooks/waha?token=${encodeURIComponent(config.webhookSecret)}`,
        events: ['message', 'message.ack', 'session.status'],
        retries: { policy: 'exponential', delaySeconds: 2, attempts: 5 },
      },
    ],
  };
  if (proxy) cfg.proxy = { server: proxy.server };
  return cfg;
}

export const waha = {
  createSession(name: string, proxy: ProxySettings | null) {
    const body: Record<string, unknown> = { name: name, start: true, config: sessionConfig(proxy) };
    if (config.wahaEngine) body.engine = config.wahaEngine;
    return call('POST', '/api/sessions', body);
  },
  updateSession(name: string, proxy: ProxySettings | null) {
    return call('PUT', `/api/sessions/${encodeURIComponent(name)}`, { name: name, config: sessionConfig(proxy) });
  },
  getSession(name: string) {
    return call('GET', `/api/sessions/${encodeURIComponent(name)}`);
  },
  createGroup(name: string, subject: string, participants: string[]) {
    return call('POST', `/api/${encodeURIComponent(name)}/groups`, {
      name: subject,
      participants: participants.map(function toP(id) { return { id: id }; }),
    });
  },
  addParticipants(name: string, groupId: string, participants: string[]) {
    return call('POST', `/api/${encodeURIComponent(name)}/groups/${encodeURIComponent(groupId)}/participants/add`, {
      participants: participants.map(function toP(id) { return { id: id }; }),
    });
  },
  getParticipants(name: string, groupId: string): Promise<any[]> {
    return call('GET', `/api/${encodeURIComponent(name)}/groups/${encodeURIComponent(groupId)}/participants`);
  },
  createChannel(name: string, title: string, description: string) {
    return call('POST', `/api/${encodeURIComponent(name)}/channels`, { name: title, description: description });
  },
  deleteSession(name: string) {
    return call('DELETE', `/api/sessions/${encodeURIComponent(name)}`);
  },
  restartSession(name: string) {
    return call('POST', `/api/sessions/${encodeURIComponent(name)}/restart`);
  },
  logoutSession(name: string) {
    return call('POST', `/api/sessions/${encodeURIComponent(name)}/logout`);
  },
  qr(name: string): Promise<{ value: string }> {
    return call('GET', `/api/${encodeURIComponent(name)}/auth/qr?format=raw`);
  },
  requestCode(name: string, phoneNumber: string): Promise<{ code: string }> {
    return call('POST', `/api/${encodeURIComponent(name)}/auth/request-code`, { phoneNumber: phoneNumber });
  },
  checkExists(name: string, phone: string): Promise<{ numberExists: boolean; chatId?: string }> {
    return call('GET', `/api/contacts/check-exists?session=${encodeURIComponent(name)}&phone=${encodeURIComponent(phone)}`);
  },
  lidToPhone(name: string, lid: string): Promise<{ lid: string; pn: string | null }> {
    return call('GET', `/api/${encodeURIComponent(name)}/lids/${encodeURIComponent(lid)}`);
  },
  startTyping(name: string, chatId: string) {
    return call('POST', '/api/startTyping', { session: name, chatId: chatId });
  },
  sendSeen(name: string, chatId: string) {
    return call('POST', '/api/sendSeen', { session: name, chatId: chatId });
  },
  async send(name: string, chatId: string, content: MessageContent): Promise<any> {
    const base = { session: name, chatId: chatId };
    if (content.type === 'text' || !content.mediaUrl) {
      return call('POST', '/api/sendText', { ...base, text: content.text ?? '' });
    }
    const file: Record<string, string> = { url: content.mediaUrl };
    if (content.mimetype) file.mimetype = content.mimetype;
    if (content.filename) file.filename = content.filename;
    if (content.type === 'image') return call('POST', '/api/sendImage', { ...base, file: file, caption: content.text });
    if (content.type === 'video') return call('POST', '/api/sendVideo', { ...base, file: file, caption: content.text, convert: true });
    if (content.type === 'voice') return call('POST', '/api/sendVoice', { ...base, file: file, convert: true });
    return call('POST', '/api/sendFile', { ...base, file: file, caption: content.text });
  },
};

/** Extract a message id from engine-specific send responses. */
export function messageIdOf(res: any): string | null {
  const id = res?.id?._serialized ?? res?.id ?? res?.key?.id ?? res?.message?.id ?? null;
  if (id && typeof id === 'object') return id.id ?? id._serialized ?? null;
  return id ? String(id) : null;
}

/** "true_9891...@c.us_3EB0ABC" -> "3EB0ABC"; plain ids are returned as is. */
export function shortId(id: string | null | undefined): string | null {
  if (!id) return null;
  const parts = String(id).split('_');
  return parts[parts.length - 1] || null;
}
