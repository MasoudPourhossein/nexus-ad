import { config } from './config.js';

const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC = '٠١٢٣٤٥٦٧٨٩';

export function latinDigits(input: string): string {
  let out = '';
  for (const ch of input) {
    const p = PERSIAN.indexOf(ch);
    const a = ARABIC.indexOf(ch);
    if (p >= 0) out += String(p);
    else if (a >= 0) out += String(a);
    else out += ch;
  }
  return out;
}

/**
 * Normalize a phone number to international digits without "+".
 * Iranian formats: 0912xxxxxxx, 912xxxxxxx, +98912..., 0098912..., 98912...
 * Returns null when the input is not a plausible phone number.
 */
export function normalizePhone(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  let digits = latinDigits(String(raw)).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  const cc = config.defaultCountryCode;
  if (cc === '98') {
    if (digits.length === 11 && digits.startsWith('09')) return '98' + digits.slice(1);
    if (digits.length === 10 && digits.startsWith('9')) return '98' + digits;
    if (digits.length === 12 && digits.startsWith('989')) return digits;
  } else if (digits.startsWith('0')) {
    digits = cc + digits.slice(1);
  }
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

/** Local display format: 989121234567 -> 09121234567 */
export function displayPhone(phone: string): string {
  if (phone.startsWith('98') && phone.length === 12) return '0' + phone.slice(2);
  return '+' + phone;
}

export function chatIdFor(phone: string): string {
  return `${phone}@c.us`;
}

/** "989121234567@c.us" -> "989121234567"; returns null for groups and LIDs */
export function phoneFromChatId(chatId: string | undefined | null): string | null {
  if (!chatId) return null;
  const [user, server] = chatId.split('@');
  if (server !== 'c.us' && server !== 's.whatsapp.net') return null;
  return normalizePhone(user.split(':')[0]);
}

export function normalizeText(input: string): string {
  return latinDigits(input).replace(/[‌‏‎]/g, '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim().toLowerCase();
}
