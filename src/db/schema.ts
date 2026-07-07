import type { Pool } from 'pg'

export const schemaSql = `
CREATE TABLE IF NOT EXISTS messages (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  from_email text NOT NULL,
  to_email text NOT NULL,
  subject text NOT NULL,
  text_body text,
  html_body text,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);

CREATE TABLE IF NOT EXISTS delivery_jobs (
  id text PRIMARY KEY,
  message_id text NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  status text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  leased_until timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery_events (
  id text PRIMARY KEY,
  message_id text NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  job_id text REFERENCES delivery_jobs(id) ON DELETE SET NULL,
  type text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  tenant_id text NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL,
  message_id text NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  response_body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, key)
);

CREATE INDEX IF NOT EXISTS messages_tenant_created_at_idx ON messages (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS delivery_jobs_status_next_attempt_at_idx ON delivery_jobs (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS delivery_jobs_message_id_idx ON delivery_jobs (message_id);
CREATE INDEX IF NOT EXISTS delivery_events_message_created_at_idx ON delivery_events (message_id, created_at);
CREATE INDEX IF NOT EXISTS delivery_events_type_created_at_idx ON delivery_events (type, created_at);
`

export async function migrate(pool: Pool): Promise<void> {
  await pool.query(schemaSql)
}

