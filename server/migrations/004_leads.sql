ALTER TABLE rules ADD COLUMN IF NOT EXISTS tag TEXT;
CREATE TABLE IF NOT EXISTS leads (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id INTEGER REFERENCES wa_sessions(id) ON DELETE SET NULL,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
  rule_id INTEGER REFERENCES rules(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  tag TEXT NOT NULL,
  text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone, tag, campaign_id)
);
CREATE INDEX IF NOT EXISTS leads_tenant_tag ON leads (tenant_id, tag, created_at DESC);
