CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id),
  amount DOUBLE PRECISION NOT NULL,
  currency_code TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Uncategorized',
  merchant TEXT,
  description TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
