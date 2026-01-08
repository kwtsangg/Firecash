CREATE TABLE IF NOT EXISTS plugin_registry (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  docs_url TEXT,
  version TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  is_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS plugin_registry_name_idx ON plugin_registry (name);
