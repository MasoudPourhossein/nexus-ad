import type { MessageContent } from '../template.js';
import { whatsapp } from './whatsapp.js';

/**
 * A messenger backend. WhatsApp (WAHA) is the first one.
 * To add Bale, Rubika, Eitaa, etc.: implement this interface in a new file,
 * register it below, and post its incoming events to /hooks/<provider>.
 */
export interface MessengerProvider {
  id: string;
  title: string;
  /** Recipient address for a normalized phone number. */
  addressFor(phone: string): string;
  /** Returns the provider message id. */
  send(session: string, to: string, content: MessageContent): Promise<string | null>;
  exists?(session: string, phone: string): Promise<boolean>;
}

const registry: Record<string, MessengerProvider> = {
  [whatsapp.id]: whatsapp,
};

export function getProvider(id: string | null | undefined): MessengerProvider {
  const p = registry[id ?? 'whatsapp'];
  if (!p) throw new Error(`Unknown provider ${id}`);
  return p;
}

export function listProviders(): { id: string; title: string }[] {
  return Object.values(registry).map((p) => ({ id: p.id, title: p.title }));
}
