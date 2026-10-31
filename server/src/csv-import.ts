import { parse as csvParse } from 'csv-parse';
import type { Readable } from 'node:stream';
import { sql } from './db.js';
import { normalizePhone, normalizeText } from './phone.js';

const PHONE_HEADERS = ['phone', 'mobile', 'number', 'tel', 'cell', 'whatsapp', 'شماره', 'موبایل', 'تلفن', 'شماره موبایل', 'shomare'];
const NAME_HEADERS = ['name', 'fullname', 'full name', 'نام', 'اسم', 'نام و نام خانوادگی'];

export interface ImportResult {
  rows: number;
  imported: number;
  invalid: number;
  duplicates: number;
}

interface Pending {
  phone: string;
  name: string | null;
  vars: Record<string, string>;
}

function detectColumns(header: string[]): { phone: number; name: number } | null {
  const norm = header.map((h) => normalizeText(String(h ?? '')));
  const phone = norm.findIndex((h) => PHONE_HEADERS.includes(h));
  const name = norm.findIndex((h) => NAME_HEADERS.includes(h));
  if (phone >= 0) return { phone: phone, name: name };
  return null;
}

/** Stream a CSV into a list. No size limit: rows are inserted in batches. */
export async function importCsv(stream: Readable, tenantId: number, listId: number): Promise<ImportResult> {
  const parser = stream.pipe(
    csvParse({ bom: true, relax_column_count: true, skip_empty_lines: true, trim: true, delimiter: [',', ';', '\t'] }),
  );
  const result: ImportResult = { rows: 0, imported: 0, invalid: 0, duplicates: 0 };
  let columns: { phone: number; name: number } | null = null;
  let header: string[] | null = null;
  let first = true;
  let batch: Pending[] = [];

  async function flush(): Promise<void> {
    if (!batch.length) return;
    const unique = new Map<string, Pending>();
    for (const p of batch) if (!unique.has(p.phone)) unique.set(p.phone, p);
    result.duplicates += batch.length - unique.size;
    const values = [...unique.values()];
    const inserted = await sql`
      INSERT INTO contacts (tenant_id, list_id, phone, name, vars)
      SELECT ${tenantId}, ${listId}, x.phone, x.name, x.vars
      FROM jsonb_to_recordset(${sql.json(values as any)}) AS x(phone text, name text, vars jsonb)
      ON CONFLICT (list_id, phone) DO NOTHING
      RETURNING id`;
    result.imported += inserted.length;
    result.duplicates += values.length - inserted.length;
    batch = [];
  }

  for await (const record of parser as AsyncIterable<string[]>) {
    if (first) {
      first = false;
      columns = detectColumns(record);
      if (columns) {
        header = record.map((h) => String(h).trim());
        continue;
      }
      columns = { phone: record.findIndex((cell) => normalizePhone(cell) !== null), name: -1 };
      if (columns.phone < 0) columns.phone = 0;
      if (record.length > 1) columns.name = columns.phone === 0 ? 1 : 0;
    }
    result.rows += 1;
    const phone = normalizePhone(record[columns!.phone]);
    if (!phone) {
      result.invalid += 1;
      continue;
    }
    const vars: Record<string, string> = {};
    if (header) {
      header.forEach(function add(h, i) {
        if (i !== columns!.phone && h && record[i] !== undefined) vars[h] = record[i];
      });
    }
    const name = columns!.name >= 0 ? (record[columns!.name] || null) : null;
    batch.push({ phone: phone, name: name, vars: vars });
    if (batch.length >= 2000) await flush();
  }
  await flush();
  return result;
}
