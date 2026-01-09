use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::NaiveDate;
use sqlx::{QueryBuilder, Row};
use uuid::Uuid;

use crate::{
    auth::AuthenticatedUser,
    models::{
        CreateTransactionRequest, DailyTransactionTotal, Transaction, UpdateTransactionRequest,
        UpdateTransactionResponse,
    },
    state::AppState,
};

#[derive(serde::Deserialize)]
pub struct TransactionQueryParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub start_date: Option<chrono::DateTime<chrono::Utc>>,
    pub end_date: Option<chrono::DateTime<chrono::Utc>>,
    pub account_id: Option<Uuid>,
    pub account_group_id: Option<Uuid>,
    pub transaction_type: Option<String>,
    pub currency_code: Option<String>,
    pub category: Option<String>,
    pub merchant: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct DailyTotalsQueryParams {
    pub start_date: Option<NaiveDate>,
    pub end_date: Option<NaiveDate>,
    pub account_id: Option<Uuid>,
    pub account_group_id: Option<Uuid>,
    pub currency_code: Option<String>,
}

pub async fn list_transactions(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Query(params): Query<TransactionQueryParams>,
) -> Result<Json<Vec<Transaction>>, (axum::http::StatusCode, String)> {
    let limit = params.limit.unwrap_or(100).max(1).min(200);
    let offset = params.offset.unwrap_or(0).max(0);
    let mut query = QueryBuilder::new(
        r#"
        WITH accessible_accounts AS (
            SELECT id
            FROM accounts
            WHERE user_id =
        "#,
    );
    query.push_bind(user.id);
    query.push(
        r#"
            UNION
            SELECT agm.account_id
            FROM account_group_members agm
            INNER JOIN account_group_users agu ON agm.group_id = agu.group_id
            WHERE agu.user_id =
        "#,
    );
    query.push_bind(user.id);
    query.push(
        r#"
        )
        SELECT t.id, t.account_id, t.amount, t.currency_code, t.transaction_type,
               t.category, t.merchant, t.description, t.occurred_at
        FROM transactions t
        INNER JOIN accounts a ON t.account_id = a.id
        WHERE t.account_id IN (SELECT id FROM accessible_accounts)
        "#,
    );

    if let Some(account_id) = params.account_id {
        query.push(" AND t.account_id = ");
        query.push_bind(account_id);
    }

    if let Some(group_id) = params.account_group_id {
        query.push(
            r#"
            AND EXISTS (
                SELECT 1
                FROM account_group_members agm
                WHERE agm.group_id =
            "#,
        );
        query.push_bind(group_id);
        query.push(" AND agm.account_id = t.account_id)");
    }

    if let Some(start_date) = params.start_date {
        query.push(" AND t.occurred_at >= ");
        query.push_bind(start_date);
    }

    if let Some(end_date) = params.end_date {
        query.push(" AND t.occurred_at <= ");
        query.push_bind(end_date);
    }

    if let Some(transaction_type) = params.transaction_type {
        query.push(" AND t.transaction_type = ");
        query.push_bind(transaction_type);
    }

    if let Some(currency_code) = params.currency_code {
        query.push(" AND t.currency_code = ");
        query.push_bind(currency_code);
    }

    if let Some(category) = params.category {
        query.push(" AND t.category = ");
        query.push_bind(category);
    }

    if let Some(merchant) = params.merchant {
        query.push(" AND t.merchant ILIKE ");
        query.push_bind(format!("%{}%", merchant));
    }

    query.push(" ORDER BY t.occurred_at DESC");
    query.push(" LIMIT ");
    query.push_bind(limit);
    query.push(" OFFSET ");
    query.push_bind(offset);

    let records = query
        .build_query_as::<Transaction>()
        .fetch_all(&state.pool)
        .await
        .map_err(crate::auth::internal_error)?;

    Ok(Json(records))
}

pub async fn daily_totals(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Query(params): Query<DailyTotalsQueryParams>,
) -> Result<Json<Vec<DailyTransactionTotal>>, (axum::http::StatusCode, String)> {
    let mut query = QueryBuilder::new(
        r#"
        WITH accessible_accounts AS (
            SELECT id
            FROM accounts
            WHERE user_id =
        "#,
    );
    query.push_bind(user.id);
    query.push(
        r#"
            UNION
            SELECT agm.account_id
            FROM account_group_members agm
            INNER JOIN account_group_users agu ON agm.group_id = agu.group_id
            WHERE agu.user_id =
        "#,
    );
    query.push_bind(user.id);
    query.push(
        r#"
        )
        SELECT DATE(t.occurred_at) as date,
               t.currency_code,
               COALESCE(SUM(t.amount), 0.0) as total
        FROM transactions t
        INNER JOIN accounts a ON t.account_id = a.id
        WHERE t.account_id IN (SELECT id FROM accessible_accounts)
          AND t.transaction_type = 'expense'
        "#,
    );

    if let Some(account_id) = params.account_id {
        query.push(" AND t.account_id = ");
        query.push_bind(account_id);
    }

    if let Some(group_id) = params.account_group_id {
        query.push(
            r#"
            AND EXISTS (
                SELECT 1
                FROM account_group_members agm
                WHERE agm.group_id =
            "#,
        );
        query.push_bind(group_id);
        query.push(" AND agm.account_id = t.account_id)");
    }

    if let Some(start_date) = params.start_date {
        query.push(" AND DATE(t.occurred_at) >= ");
        query.push_bind(start_date);
    }

    if let Some(end_date) = params.end_date {
        query.push(" AND DATE(t.occurred_at) <= ");
        query.push_bind(end_date);
    }

    if let Some(currency_code) = params.currency_code {
        query.push(" AND t.currency_code = ");
        query.push_bind(currency_code);
    }

    query.push(
        r#"
        GROUP BY DATE(t.occurred_at), t.currency_code
        ORDER BY DATE(t.occurred_at)
        "#,
    );

    let records = query
        .build_query_as::<DailyTransactionTotal>()
        .fetch_all(&state.pool)
        .await
        .map_err(crate::auth::internal_error)?;

    Ok(Json(records))
}

pub async fn create_transaction(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Json(payload): Json<CreateTransactionRequest>,
) -> Result<Json<Transaction>, (axum::http::StatusCode, String)> {
    ensure_account_edit_access(&state, user.id, payload.account_id).await?;

    let id = Uuid::new_v4();
    let record = sqlx::query_as::<_, Transaction>(
        r#"
        INSERT INTO transactions (
            id, account_id, amount, currency_code, transaction_type, category, merchant, description,
            occurred_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, account_id, amount, currency_code, transaction_type, category, merchant,
                  description, occurred_at
        "#,
    )
    .bind(id)
    .bind(payload.account_id)
    .bind(payload.amount)
    .bind(payload.currency_code)
    .bind(payload.transaction_type)
    .bind(payload.category.unwrap_or_else(|| "Uncategorized".into()))
    .bind(payload.merchant)
    .bind(payload.description)
    .bind(payload.occurred_at)
    .fetch_one(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    Ok(Json(record))
}

pub async fn update_transaction(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(transaction_id): Path<Uuid>,
    Json(payload): Json<UpdateTransactionRequest>,
) -> Result<Json<UpdateTransactionResponse>, (axum::http::StatusCode, String)> {
    let account_id: Option<Uuid> = sqlx::query_scalar(
        r#"
        SELECT account_id
        FROM transactions
        WHERE id = $1
        "#,
    )
    .bind(transaction_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let Some(account_id) = account_id else {
        return Err((StatusCode::NOT_FOUND, "Transaction not found".into()));
    };

    ensure_account_edit_access(&state, user.id, account_id).await?;

    if let Some(account_id) = payload.account_id {
        ensure_account_edit_access(&state, user.id, account_id).await?;
    }

    let record = sqlx::query_as::<_, UpdateTransactionResponse>(
        r#"
        UPDATE transactions
        SET account_id = COALESCE($1, account_id),
            amount = COALESCE($2, amount),
            currency_code = COALESCE($3, currency_code),
            transaction_type = COALESCE($4, transaction_type),
            category = COALESCE($5, category),
            merchant = COALESCE($6, merchant),
            description = COALESCE($7, description),
            occurred_at = COALESCE($8, occurred_at)
        WHERE id = $9
        RETURNING id, account_id, amount, currency_code, transaction_type,
                  category, merchant, description, occurred_at
        "#,
    )
    .bind(payload.account_id)
    .bind(payload.amount)
    .bind(payload.currency_code)
    .bind(payload.transaction_type)
    .bind(payload.category)
    .bind(payload.merchant)
    .bind(payload.description)
    .bind(payload.occurred_at)
    .bind(transaction_id)
    .fetch_one(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    Ok(Json(record))
}

pub async fn delete_transaction(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(transaction_id): Path<Uuid>,
) -> Result<StatusCode, (axum::http::StatusCode, String)> {
    let account_id: Option<Uuid> = sqlx::query_scalar(
        r#"
        SELECT account_id
        FROM transactions
        WHERE id = $1
        "#,
    )
    .bind(transaction_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let Some(account_id) = account_id else {
        return Err((StatusCode::NOT_FOUND, "Transaction not found".into()));
    };

    ensure_account_edit_access(&state, user.id, account_id).await?;

    let result = sqlx::query(
        r#"
        DELETE FROM transactions
        WHERE id = $1 AND account_id = $2
        "#,
    )
    .bind(transaction_id)
    .bind(account_id)
    .execute(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Transaction not found".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}

async fn ensure_account_edit_access(
    state: &AppState,
    user_id: Uuid,
    account_id: Uuid,
) -> Result<(), (StatusCode, String)> {
    let record = sqlx::query(
        r#"
        SELECT a.user_id,
               MAX(CASE WHEN agu.role IN ('edit', 'admin') THEN 1 ELSE 0 END) as can_edit
        FROM accounts a
        LEFT JOIN account_group_members agm ON a.id = agm.account_id
        LEFT JOIN account_group_users agu ON agm.group_id = agu.group_id AND agu.user_id = $1
        WHERE a.id = $2
        GROUP BY a.user_id
        "#,
    )
    .bind(user_id)
    .bind(account_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let Some(record) = record else {
        return Err((StatusCode::NOT_FOUND, "Account not found".into()));
    };

    let owner_id: Uuid = record
        .try_get("user_id")
        .map_err(crate::auth::internal_error)?;
    let can_edit: i64 = record
        .try_get("can_edit")
        .map_err(crate::auth::internal_error)?;

    if owner_id != user_id && can_edit == 0 {
        return Err((StatusCode::FORBIDDEN, "Forbidden".into()));
    }

    Ok(())
}
