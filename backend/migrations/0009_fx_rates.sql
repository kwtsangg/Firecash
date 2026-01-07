CREATE TABLE IF NOT EXISTS fx_rates (
  id UUID PRIMARY KEY,
  base_currency TEXT NOT NULL,
  quote_currency TEXT NOT NULL,
  rate DOUBLE PRECISION NOT NULL,
  recorded_on DATE NOT NULL,
  UNIQUE (base_currency, quote_currency, recorded_on)
);
