CREATE TABLE IF NOT EXISTS recurring_transactions (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id),
  amount DOUBLE PRECISION NOT NULL,
  currency_code TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  description TEXT,
  interval_days INTEGER NOT NULL,
  next_occurs_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_transactions_next_occurs_at
  ON recurring_transactions(next_occurs_at);
