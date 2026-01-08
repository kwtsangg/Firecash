CREATE TABLE IF NOT EXISTS account_group_users (
    group_id UUID NOT NULL REFERENCES account_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id),
    CONSTRAINT account_group_users_role_check CHECK (role IN ('view', 'edit', 'admin'))
);

INSERT INTO account_group_users (group_id, user_id, role)
SELECT id, user_id, 'admin'
FROM account_groups
ON CONFLICT DO NOTHING;
