use axum::{
    extract::{Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    audit::record_audit_event,
    auth::AuthenticatedUser,
    models::{Account, AccountGroup, Asset, RecurringTransaction, Transaction},
    state::AppState,
};

const SCHEMA_VERSION: i32 = 1;

#[derive(Deserialize)]
pub struct ExportQuery {
    pub format: Option<String>,
    pub include_pii: Option<bool>,
}

#[derive(Serialize, Deserialize)]
pub struct BackupMetadata {
    pub schema_version: i32,
    pub exported_at: DateTime<Utc>,
    pub format: String,
    pub include_pii: bool,
}

#[derive(Serialize, Deserialize)]
pub struct BackupPayload {
    pub metadata: BackupMetadata,
    pub accounts: Vec<Account>,
    pub account_groups: Vec<AccountGroup>,
    pub account_group_members: Vec<AccountGroupMember>,
    pub transactions: Vec<Transaction>,
    pub recurring_transactions: Vec<RecurringTransaction>,
    pub assets: Vec<Asset>,
    pub preferences: Vec<BackupPreference>,
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct AccountGroupMember {
    pub group_id: Uuid,
    pub account_id: Uuid,
}

#[derive(Serialize, Deserialize)]
pub struct BackupPreference {
    pub key: String,
    pub value: serde_json::Value,
}

#[derive(Deserialize)]
pub struct RestoreRequest {
    pub confirm: bool,
    pub payload: BackupPayload,
}

pub async fn export_backup(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Query(params): Query<ExportQuery>,
) -> Result<Response, (StatusCode, String)> {
    let format = params
        .format
        .unwrap_or_else(|| "json".to_string())
        .to_lowercase();
    let include_pii = params.include_pii.unwrap_or(true);

    if format != "json" && format != "csv" {
        return Err((StatusCode::BAD_REQUEST, "Unsupported format".into()));
    }

    if format == "csv" {
        let mut csv = String::new();
        let metadata = BackupMetadata {
            schema_version: SCHEMA_VERSION,
            exported_at: Utc::now(),
            format: format.clone(),
            include_pii,
        };
        csv.push_str(&format!(
            "#{}\n",
            serde_json::to_string(&metadata).unwrap_or_default()
        ));
        csv.push_str("id,account_id,amount,currency_code,transaction_type,category,merchant,description,occurred_at\n");
        let rows = sqlx::query_as::<_, Transaction>(
            r#"
            SELECT t.id, t.account_id, t.amount, t.currency_code, t.transaction_type,
                   t.category, t.merchant, t.description, t.occurred_at
            FROM transactions t
            INNER JOIN accounts a ON t.account_id = a.id
            WHERE a.user_id = $1
            ORDER BY t.occurred_at DESC
            "#,
        )
        .bind(user.id)
        .fetch_all(&state.pool)
        .await
        .map_err(crate::auth::internal_error)?;

        for mut transaction in rows {
            if !include_pii {
                transaction.merchant = None;
                transaction.description = None;
            }
            csv.push_str(&format!(
                "{},{},{},{},{},{},{},{},{}\n",
                transaction.id,
                transaction.account_id,
                transaction.amount,
                transaction.currency_code,
                transaction.transaction_type,
                transaction.category.replace(',', " "),
                transaction.merchant.unwrap_or_default().replace(',', " "),
                transaction.description.unwrap_or_default().replace(',', " "),
                transaction.occurred_at
            ));
        }

        let _ = record_audit_event(
            &state.pool,
            Some(user.id),
            "backup.export_csv",
            serde_json::json!({ "include_pii": include_pii }),
        )
        .await;

        let response = Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "text/csv")
            .header(
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"firecash-transactions.csv\"",
            )
            .body(csv.into())
            .map_err(crate::auth::internal_error)?;
        return Ok(response);
    }

    let accounts = sqlx::query_as::<_, Account>(
        r#"
        SELECT id, name, currency_code, created_at
        FROM accounts
        WHERE user_id = $1
        ORDER BY created_at DESC
        "#,
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let account_groups = sqlx::query_as::<_, AccountGroup>(
        r#"
        SELECT id, name
        FROM account_groups
        WHERE user_id = $1
        ORDER BY name
        "#,
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let account_group_members = sqlx::query_as::<_, AccountGroupMember>(
        r#"
        SELECT agm.group_id, agm.account_id
        FROM account_group_members agm
        INNER JOIN account_groups ag ON agm.group_id = ag.id
        WHERE ag.user_id = $1
        "#,
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let mut transactions = sqlx::query_as::<_, Transaction>(
        r#"
        SELECT t.id, t.account_id, t.amount, t.currency_code, t.transaction_type,
               t.category, t.merchant, t.description, t.occurred_at
        FROM transactions t
        INNER JOIN accounts a ON t.account_id = a.id
        WHERE a.user_id = $1
        ORDER BY t.occurred_at DESC
        "#,
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    if !include_pii {
        for transaction in &mut transactions {
            transaction.merchant = None;
            transaction.description = None;
        }
    }

    let recurring_transactions = sqlx::query_as::<_, RecurringTransaction>(
        r#"
        SELECT rt.id, rt.account_id, rt.amount, rt.currency_code, rt.transaction_type,
               rt.description, rt.interval_days, rt.next_occurs_at, rt.is_enabled
        FROM recurring_transactions rt
        INNER JOIN accounts a ON rt.account_id = a.id
        WHERE a.user_id = $1
        ORDER BY rt.next_occurs_at DESC
        "#,
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let assets = sqlx::query_as::<_, Asset>(
        r#"
        SELECT a.id, a.account_id, a.symbol, a.asset_type, a.quantity, a.currency_code, a.created_at
        FROM assets a
        INNER JOIN accounts acc ON a.account_id = acc.id
        WHERE acc.user_id = $1
        ORDER BY a.created_at DESC
        "#,
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let prefs_rows = sqlx::query(
        r#"
        SELECT key, value
        FROM user_preferences
        WHERE user_id = $1
        "#,
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let preferences = prefs_rows
        .into_iter()
        .map(|row| {
            let key = row.try_get("key").map_err(crate::auth::internal_error)?;
            let value = row
                .try_get("value")
                .map_err(crate::auth::internal_error)?;
            Ok(BackupPreference { key, value })
        })
        .collect::<Result<Vec<_>, _>>()?;

    let metadata = BackupMetadata {
        schema_version: SCHEMA_VERSION,
        exported_at: Utc::now(),
        format,
        include_pii,
    };

    let payload = BackupPayload {
        metadata,
        accounts,
        account_groups,
        account_group_members,
        transactions,
        recurring_transactions,
        assets,
        preferences,
    };

    let _ = record_audit_event(
        &state.pool,
        Some(user.id),
        "backup.export_json",
        serde_json::json!({ "include_pii": include_pii }),
    )
    .await;

    Ok(Json(payload).into_response())
}

pub async fn restore_backup(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Json(payload): Json<RestoreRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    if !payload.confirm {
        return Err((StatusCode::BAD_REQUEST, "Restore confirmation required".into()));
    }

    let metadata = &payload.payload.metadata;
    if metadata.schema_version != SCHEMA_VERSION {
        return Err((StatusCode::BAD_REQUEST, "Unsupported schema version".into()));
    }

    let mut tx = state
        .pool
        .begin()
        .await
        .map_err(crate::auth::internal_error)?;

    let group_ids: Vec<Uuid> = sqlx::query_scalar(
        r#"
        SELECT id
        FROM account_groups
        WHERE user_id = $1
        "#,
    )
    .bind(user.id)
    .fetch_all(&mut *tx)
    .await
    .map_err(crate::auth::internal_error)?;

    if !group_ids.is_empty() {
        sqlx::query(
            r#"
            DELETE FROM account_group_users
            WHERE group_id = ANY($1)
            "#,
        )
        .bind(&group_ids)
        .execute(&mut *tx)
        .await
        .map_err(crate::auth::internal_error)?;

        sqlx::query(
            r#"
            DELETE FROM account_group_members
            WHERE group_id = ANY($1)
            "#,
        )
        .bind(&group_ids)
        .execute(&mut *tx)
        .await
        .map_err(crate::auth::internal_error)?;
    }

    sqlx::query(
        r#"
        DELETE FROM assets
        USING accounts
        WHERE assets.account_id = accounts.id
          AND accounts.user_id = $1
        "#,
    )
    .bind(user.id)
    .execute(&mut *tx)
    .await
    .map_err(crate::auth::internal_error)?;

    sqlx::query(
        r#"
        DELETE FROM recurring_transactions
        USING accounts
        WHERE recurring_transactions.account_id = accounts.id
          AND accounts.user_id = $1
        "#,
    )
    .bind(user.id)
    .execute(&mut *tx)
    .await
    .map_err(crate::auth::internal_error)?;

    sqlx::query(
        r#"
        DELETE FROM transactions
        USING accounts
        WHERE transactions.account_id = accounts.id
          AND accounts.user_id = $1
        "#,
    )
    .bind(user.id)
    .execute(&mut *tx)
    .await
    .map_err(crate::auth::internal_error)?;

    sqlx::query(
        r#"
        DELETE FROM account_groups
        WHERE user_id = $1
        "#,
    )
    .bind(user.id)
    .execute(&mut *tx)
    .await
    .map_err(crate::auth::internal_error)?;

    sqlx::query(
        r#"
        DELETE FROM accounts
        WHERE user_id = $1
        "#,
    )
    .bind(user.id)
    .execute(&mut *tx)
    .await
    .map_err(crate::auth::internal_error)?;

    sqlx::query(
        r#"
        DELETE FROM user_preferences
        WHERE user_id = $1
        "#,
    )
    .bind(user.id)
    .execute(&mut *tx)
    .await
    .map_err(crate::auth::internal_error)?;

    for account in &payload.payload.accounts {
        sqlx::query(
            r#"
            INSERT INTO accounts (id, user_id, name, currency_code, created_at)
            VALUES ($1, $2, $3, $4, $5)
            "#,
        )
        .bind(account.id)
        .bind(user.id)
        .bind(&account.name)
        .bind(&account.currency_code)
        .bind(account.created_at)
        .execute(&mut *tx)
        .await
        .map_err(crate::auth::internal_error)?;
    }

    for group in &payload.payload.account_groups {
        sqlx::query(
            r#"
            INSERT INTO account_groups (id, user_id, name)
            VALUES ($1, $2, $3)
            "#,
        )
        .bind(group.id)
        .bind(user.id)
        .bind(&group.name)
        .execute(&mut *tx)
        .await
        .map_err(crate::auth::internal_error)?;

        sqlx::query(
            r#"
            INSERT INTO account_group_users (group_id, user_id, role)
            VALUES ($1, $2, 'admin')
            ON CONFLICT DO NOTHING
            "#,
        )
        .bind(group.id)
        .bind(user.id)
        .execute(&mut *tx)
        .await
        .map_err(crate::auth::internal_error)?;
    }

    for membership in &payload.payload.account_group_members {
        sqlx::query(
            r#"
            INSERT INTO account_group_members (group_id, account_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
            "#,
        )
        .bind(membership.group_id)
        .bind(membership.account_id)
        .execute(&mut *tx)
        .await
        .map_err(crate::auth::internal_error)?;
    }

    for transaction in &payload.payload.transactions {
        sqlx::query(
            r#"
            INSERT INTO transactions (
                id, account_id, amount, currency_code, transaction_type, category, merchant,
                description, occurred_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            "#,
        )
        .bind(transaction.id)
        .bind(transaction.account_id)
        .bind(transaction.amount)
        .bind(&transaction.currency_code)
        .bind(&transaction.transaction_type)
        .bind(&transaction.category)
        .bind(&transaction.merchant)
        .bind(&transaction.description)
        .bind(transaction.occurred_at)
        .execute(&mut *tx)
        .await
        .map_err(crate::auth::internal_error)?;
    }

    for recurring in &payload.payload.recurring_transactions {
        sqlx::query(
            r#"
            INSERT INTO recurring_transactions (
                id, account_id, amount, currency_code, transaction_type, description,
                interval_days, next_occurs_at, is_enabled
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            "#,
        )
        .bind(recurring.id)
        .bind(recurring.account_id)
        .bind(recurring.amount)
        .bind(&recurring.currency_code)
        .bind(&recurring.transaction_type)
        .bind(&recurring.description)
        .bind(recurring.interval_days)
        .bind(recurring.next_occurs_at)
        .bind(recurring.is_enabled)
        .execute(&mut *tx)
        .await
        .map_err(crate::auth::internal_error)?;
    }

    for asset in &payload.payload.assets {
        sqlx::query(
            r#"
            INSERT INTO assets (
                id, account_id, symbol, asset_type, quantity, currency_code, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            "#,
        )
        .bind(asset.id)
        .bind(asset.account_id)
        .bind(&asset.symbol)
        .bind(&asset.asset_type)
        .bind(asset.quantity)
        .bind(&asset.currency_code)
        .bind(asset.created_at)
        .execute(&mut *tx)
        .await
        .map_err(crate::auth::internal_error)?;
    }

    for preference in &payload.payload.preferences {
        sqlx::query(
            r#"
            INSERT INTO user_preferences (user_id, key, value)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, key)
            DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
            "#,
        )
        .bind(user.id)
        .bind(&preference.key)
        .bind(&preference.value)
        .execute(&mut *tx)
        .await
        .map_err(crate::auth::internal_error)?;
    }

    tx.commit().await.map_err(crate::auth::internal_error)?;

    let _ = record_audit_event(
        &state.pool,
        Some(user.id),
        "backup.restore",
        serde_json::json!({ "schema_version": metadata.schema_version }),
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}
