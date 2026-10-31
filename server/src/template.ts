import { displayPhone } from './phone.js';

export interface MessageContent {
  type: 'text' | 'image' | 'file' | 'video' | 'voice';
  text?: string;
  mediaUrl?: string;
  filename?: string;
  mimetype?: string;
}

export function render(template: string | undefined, vars: Record<string, unknown>): string | undefined {
  if (template === undefined) return undefined;
  return template.replace(/\{\{?\s*([\w؀-ۿ.-]+)\s*\}?\}/g, function replace(match, key: string) {
    const value = vars[key];
    if (value === undefined || value === null) return match;
    return String(value);
  });
}

export function renderContent(content: MessageContent, contact: { phone: string; name?: string | null; vars?: Record<string, unknown> }): MessageContent {
  const vars: Record<string, unknown> = {
    ...(contact.vars ?? {}),
    phone: displayPhone(contact.phone),
    name: contact.name ?? '',
  };
  return { ...content, text: render(content.text, vars) };
}
