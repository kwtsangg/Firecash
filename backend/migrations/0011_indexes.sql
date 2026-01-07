CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_next_occurs_at
  ON recurring_transactions(next_occurs_at);
CREATE INDEX IF NOT EXISTS idx_assets_account_id ON assets(account_id);
CREATE INDEX IF NOT EXISTS idx_price_history_asset_id ON price_history(asset_id);
CREATE INDEX IF NOT EXISTS idx_fx_rates_base_quote ON fx_rates(base_currency, quote_currency);
