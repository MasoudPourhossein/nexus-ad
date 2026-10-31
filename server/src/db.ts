import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { config } from './config.js';

export const sql = postgres(config.databaseUrl, {
  max: 20,
  onnotice: function ignore() {},
  types: { bigint: postgres.BigInt },
});

export type Sql = typeof sql;

export async function migrate(): Promise<void> {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const done = await sql`SELECT 1 FROM schema_migrations WHERE name = ${file}`;
    if (done.length) continue;
    const body = await readFile(join(dir, file), 'utf8');
    await sql.begin(async function apply(tx) {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
    });
  }
}
