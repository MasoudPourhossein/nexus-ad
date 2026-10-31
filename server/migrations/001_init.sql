CREATE TABLE IF NOT EXISTS plans (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC(14,2) NOT NULL DEFAULT 0,
  message_quota INTEGER NOT NULL DEFAULT 0,
  session_limit INTEGER NOT NULL DEFAULT 1,
  duration_days INTEGER NOT NULL DEFAULT 30,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenants (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
  plan_id INTEGER REFERENCES plans(id) ON DELETE SET NULL,
  plan_expires_at TIMESTAMPTZ,
  credits INTEGER NOT NULL DEFAULT 0,
  session_limit INTEGER,
  webhook_url TEXT,
  opt_out_keywords TEXT[] NOT NULL DEFAULT ARRAY['لغو','laghv','stop','unsubscribe'],
  opt_out_reply TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wa_sessions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'STARTING',
  phone TEXT,
  rate_per_minute INTEGER NOT NULL DEFAULT 10,
  daily_cap INTEGER NOT NULL DEFAULT 500,
  next_send_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contact_lists (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contacts (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  list_id INTEGER NOT NULL REFERENCES contact_lists(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT,
  vars JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (list_id, phone)
);
CREATE INDEX IF NOT EXISTS contacts_tenant_phone ON contacts (tenant_id, phone);

CREATE TABLE IF NOT EXISTS opt_outs (
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, phone)
);

CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id INTEGER NOT NULL REFERENCES wa_sessions(id) ON DELETE CASCADE,
  list_id INTEGER NOT NULL REFERENCES contact_lists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  message JSONB NOT NULL,
  check_exists BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','paused','done','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id INTEGER NOT NULL REFERENCES wa_sessions(id) ON DELETE CASCADE,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id BIGINT REFERENCES contacts(id) ON DELETE SET NULL,
  rule_id INTEGER,
  direction TEXT NOT NULL DEFAULT 'out' CHECK (direction IN ('in','out')),
  phone TEXT NOT NULL,
  content JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  wa_id TEXT,
  short_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS messages_queue ON messages (session_id, id) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS messages_campaign ON messages (campaign_id, status);
CREATE INDEX IF NOT EXISTS messages_short ON messages (session_id, short_id);
CREATE INDEX IF NOT EXISTS messages_phone ON messages (session_id, phone, id DESC);
CREATE INDEX IF NOT EXISTS messages_sent_day ON messages (session_id, sent_at);

CREATE TABLE IF NOT EXISTS rules (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id INTEGER REFERENCES wa_sessions(id) ON DELETE CASCADE,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  keywords TEXT[] NOT NULL,
  match TEXT NOT NULL DEFAULT 'exact' CHECK (match IN ('exact','contains','any')),
  reply JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());
