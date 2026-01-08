use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use sqlx::{QueryBuilder, Row};
use uuid::Uuid;

use crate::{
    auth::AuthenticatedUser,
    models::{
        CreateTransactionRequest, Transaction, UpdateTransactionRequest, UpdateTransactionResponse,
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

pub async fn list_transactions(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Query(params): Query<TransactionQueryParams>,
) -> Result<Json<Vec<Transaction>>, (axum::http::StatusCode, String)> {
    let limit = params.limit.unwrap_or(100).max(1).min(200);
    let offset = params.offset.unwrap_or(0).max(0);
    let mut query = QueryBuilder::new(
        r#"
        SELECT t.id, t.account_id, t.amount, t.currency_code, t.transaction_type,
               t.category, t.merchant, t.description, t.occurred_at
        FROM transactions t
        INNER JOIN accounts a ON t.account_id = a.id
        WHERE a.user_id =
        "#,
    );
    query.push_bind(user.id);

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

pub async fn create_transaction(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Json(payload): Json<CreateTransactionRequest>,
) -> Result<Json<Transaction>, (axum::http::StatusCode, String)> {
    let account_owner = sqlx::query(
        r#"
        SELECT user_id
        FROM accounts
        WHERE id = $1
        "#,
    )
    .bind(payload.account_id)
    .fetch_one(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let owner_id: Uuid = account_owner
        .try_get("user_id")
        .map_err(crate::auth::internal_error)?;

    if owner_id != user.id {
        return Err((axum::http::StatusCode::FORBIDDEN, "Forbidden".into()));
    }

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
    let owner_id: Option<Uuid> = sqlx::query_scalar(
        r#"
        SELECT a.user_id
        FROM transactions t
        INNER JOIN accounts a ON t.account_id = a.id
        WHERE t.id = $1
        "#,
    )
    .bind(transaction_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let Some(owner_id) = owner_id else {
        return Err((StatusCode::NOT_FOUND, "Transaction not found".into()));
    };

    if owner_id != user.id {
        return Err((StatusCode::FORBIDDEN, "Forbidden".into()));
    }

    if let Some(account_id) = payload.account_id {
        let account_owner: Option<Uuid> = sqlx::query_scalar(
            r#"
            SELECT user_id
            FROM accounts
            WHERE id = $1
            "#,
        )
        .bind(account_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(crate::auth::internal_error)?;

        if account_owner != Some(user.id) {
            return Err((StatusCode::FORBIDDEN, "Forbidden".into()));
        }
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
    let result = sqlx::query(
        r#"
        DELETE FROM transactions t
        USING accounts a
        WHERE t.account_id = a.id
          AND a.user_id = $1
          AND t.id = $2
        "#,
    )
    .bind(user.id)
    .bind(transaction_id)
    .execute(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Transaction not found".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}
