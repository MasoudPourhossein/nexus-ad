ALTER TABLE contacts ADD COLUMN IF NOT EXISTS has_wa BOOLEAN;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS chat_id TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS wa_checked_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS contacts_list_haswa ON contacts (list_id, has_wa);
CREATE INDEX IF NOT EXISTS contacts_unchecked ON contacts (list_id, id) WHERE has_wa IS NULL;

-- global phone→WhatsApp cache so the same number is never re-checked across lists
CREATE TABLE IF NOT EXISTS wa_cache (
  phone TEXT PRIMARY KEY,
  exists BOOLEAN NOT NULL,
  chat_id TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS verify_jobs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  list_id INTEGER NOT NULL REFERENCES contact_lists(id) ON DELETE CASCADE,
  session_id INTEGER REFERENCES wa_sessions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','done','failed','cancelled')),
  total INTEGER NOT NULL DEFAULT 0,
  checked INTEGER NOT NULL DEFAULT 0,
  found INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verify_jobs_list ON verify_jobs (list_id, id DESC);

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS only_whatsapp BOOLEAN NOT NULL DEFAULT FALSE;
