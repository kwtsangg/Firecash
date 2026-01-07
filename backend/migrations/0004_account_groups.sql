CREATE TABLE IF NOT EXISTS account_groups (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS account_group_members (
  group_id UUID NOT NULL REFERENCES account_groups(id),
  account_id UUID NOT NULL REFERENCES accounts(id),
  PRIMARY KEY (group_id, account_id)
);
