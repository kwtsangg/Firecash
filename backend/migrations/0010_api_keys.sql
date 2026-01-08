CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  token TEXT,
  token_hash TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  is_read_only BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS api_keys_user_id_idx ON api_keys (user_id);
CREATE INDEX IF NOT EXISTS api_keys_token_hash_idx ON api_keys (token_hash);
