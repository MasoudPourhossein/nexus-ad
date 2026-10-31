import { parse as csvParse } from 'csv-parse';
import { createReadStream } from 'node:fs';
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

async function insertBatch(tenantId: number, listId: number, rows: Pending[]): Promise<number> {
  if (!rows.length) return 0;
  const inserted = await sql`
    INSERT INTO contacts (tenant_id, list_id, phone, name, vars)
    SELECT ${tenantId}, ${listId}, x.phone, x.name, x.vars
    FROM jsonb_to_recordset(${sql.json(rows as any)}) AS x(phone text, name text, vars jsonb)
    ON CONFLICT (list_id, phone) DO NOTHING
    RETURNING id`;
  return inserted.length;
}

const BATCH = 5000;

/**
 * Stream a CSV into a list. No size limit. Resilient: a failing batch is retried
 * row-by-row so one bad row never aborts a 10M-row import. onProgress is called
 * periodically so a background job can report live counts.
 */
export async function importCsv(
  stream: Readable,
  tenantId: number,
  listId: number,
  onProgress?: (r: ImportResult) => void,
): Promise<ImportResult> {
  const parser = stream.pipe(
    csvParse({ bom: true, relax_column_count: true, relax_quotes: true, skip_empty_lines: true, trim: true, delimiter: [',', ';', '\t'] }),
  );
  const result: ImportResult = { rows: 0, imported: 0, invalid: 0, duplicates: 0 };
  let columns: { phone: number; name: number } | null = null;
  let header: string[] | null = null;
  let first = true;
  let batch: Pending[] = [];
  let lastReport = Date.now();

  async function flush(): Promise<void> {
    if (!batch.length) return;
    const unique = new Map<string, Pending>();
    for (const p of batch) if (!unique.has(p.phone)) unique.set(p.phone, p);
    result.duplicates += batch.length - unique.size;
    const values = [...unique.values()];
    batch = [];
    try {
      const n = await insertBatch(tenantId, listId, values);
      result.imported += n;
      result.duplicates += values.length - n;
    } catch {
      // one bad value must not kill the whole import: retry row by row
      for (const row of values) {
        try {
          const n = await insertBatch(tenantId, listId, [row]);
          if (n) result.imported += 1;
          else result.duplicates += 1;
        } catch {
          result.invalid += 1;
        }
      }
    }
    if (onProgress && Date.now() - lastReport > 1000) {
      lastReport = Date.now();
      onProgress({ ...result });
    }
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
        if (i !== columns!.phone && h && record[i] !== undefined) {
          const v = String(record[i]);
          if (v.length <= 500) vars[h] = v;
        }
      });
    }
    const name = columns!.name >= 0 ? (record[columns!.name] || null) : null;
    batch.push({ phone: phone, name: name, vars: vars });
    if (batch.length >= BATCH) await flush();
  }
  await flush();
  return result;
}

/** Background runner: import a file already saved to disk and track a job row. */
export async function runImportJob(jobId: bigint, filePath: string, tenantId: number, listId: number): Promise<void> {
  try {
    const result = await importCsv(createReadStream(filePath), tenantId, listId, function onProgress(r) {
      void sql`UPDATE import_jobs SET rows=${r.rows}, imported=${r.imported}, invalid=${r.invalid}, duplicates=${r.duplicates}, updated_at=now() WHERE id=${jobId}`.catch(function ignore() {});
    });
    await sql`UPDATE import_jobs SET status='done', rows=${result.rows}, imported=${result.imported}, invalid=${result.invalid}, duplicates=${result.duplicates}, updated_at=now() WHERE id=${jobId}`;
  } catch (err: any) {
    await sql`UPDATE import_jobs SET status='failed', error=${String(err?.message ?? err).slice(0, 300)}, updated_at=now() WHERE id=${jobId}`.catch(function ignore() {});
  } finally {
    const { unlink } = await import('node:fs/promises');
    await unlink(filePath).catch(function ignore() {});
  }
}
