CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id),
  symbol TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  quantity DOUBLE PRECISION NOT NULL,
  currency_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
