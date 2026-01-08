CREATE TABLE IF NOT EXISTS integration_connections (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  provider_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration_logs (
  id UUID PRIMARY KEY,
  integration_id UUID NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS integration_connections_user_id_idx ON integration_connections (user_id);
CREATE INDEX IF NOT EXISTS integration_logs_integration_id_idx ON integration_logs (integration_id);
