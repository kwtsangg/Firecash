use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    auth::AuthenticatedUser,
    models::{
        CreateRecurringTransactionRequest, RecurringTransaction, UpdateRecurringTransactionRequest,
        UpdateRecurringTransactionResponse,
    },
    state::AppState,
};

#[derive(serde::Deserialize)]
pub struct PaginationParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

pub async fn list_recurring_transactions(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Query(params): Query<PaginationParams>,
) -> Result<Json<Vec<RecurringTransaction>>, (axum::http::StatusCode, String)> {
    let limit = params.limit.unwrap_or(100).max(1).min(200);
    let offset = params.offset.unwrap_or(0).max(0);
    let records = sqlx::query_as::<_, RecurringTransaction>(
        r#"
        SELECT rt.id, rt.account_id, rt.amount, rt.currency_code, rt.transaction_type,
               rt.description, rt.interval_days, rt.next_occurs_at, rt.is_enabled
        FROM recurring_transactions rt
        INNER JOIN accounts a ON rt.account_id = a.id
        WHERE a.user_id = $1
        ORDER BY rt.next_occurs_at
        LIMIT $2 OFFSET $3
        "#,
    )
    .bind(user.id)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    Ok(Json(records))
}

pub async fn create_recurring_transaction(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Json(payload): Json<CreateRecurringTransactionRequest>,
) -> Result<Json<RecurringTransaction>, (axum::http::StatusCode, String)> {
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
    let is_enabled = payload.is_enabled.unwrap_or(true);
    let record = sqlx::query_as::<_, RecurringTransaction>(
        r#"
        INSERT INTO recurring_transactions (
            id, account_id, amount, currency_code, transaction_type, description,
            interval_days, next_occurs_at, is_enabled
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, account_id, amount, currency_code, transaction_type,
                  description, interval_days, next_occurs_at, is_enabled
        "#,
    )
    .bind(id)
    .bind(payload.account_id)
    .bind(payload.amount)
    .bind(payload.currency_code)
    .bind(payload.transaction_type)
    .bind(payload.description)
    .bind(payload.interval_days)
    .bind(payload.next_occurs_at)
    .bind(is_enabled)
    .fetch_one(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    Ok(Json(record))
}

pub async fn update_recurring_transaction(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(recurring_id): Path<Uuid>,
    Json(payload): Json<UpdateRecurringTransactionRequest>,
) -> Result<Json<UpdateRecurringTransactionResponse>, (axum::http::StatusCode, String)> {
    let owner_id: Option<Uuid> = sqlx::query_scalar(
        r#"
        SELECT a.user_id
        FROM recurring_transactions rt
        INNER JOIN accounts a ON rt.account_id = a.id
        WHERE rt.id = $1
        "#,
    )
    .bind(recurring_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let Some(owner_id) = owner_id else {
        return Err((StatusCode::NOT_FOUND, "Recurring transaction not found".into()));
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

    let record = sqlx::query_as::<_, UpdateRecurringTransactionResponse>(
        r#"
        UPDATE recurring_transactions
        SET account_id = COALESCE($1, account_id),
            amount = COALESCE($2, amount),
            currency_code = COALESCE($3, currency_code),
            transaction_type = COALESCE($4, transaction_type),
            description = COALESCE($5, description),
            interval_days = COALESCE($6, interval_days),
            next_occurs_at = COALESCE($7, next_occurs_at),
            is_enabled = COALESCE($8, is_enabled)
        WHERE id = $9
        RETURNING id, account_id, amount, currency_code, transaction_type,
                  description, interval_days, next_occurs_at, is_enabled
        "#,
    )
    .bind(payload.account_id)
    .bind(payload.amount)
    .bind(payload.currency_code)
    .bind(payload.transaction_type)
    .bind(payload.description)
    .bind(payload.interval_days)
    .bind(payload.next_occurs_at)
    .bind(payload.is_enabled)
    .bind(recurring_id)
    .fetch_one(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    Ok(Json(record))
}

pub async fn skip_recurring_transaction(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(recurring_id): Path<Uuid>,
) -> Result<Json<UpdateRecurringTransactionResponse>, (axum::http::StatusCode, String)> {
    let record = sqlx::query_as::<_, UpdateRecurringTransactionResponse>(
        r#"
        UPDATE recurring_transactions rt
        SET next_occurs_at = rt.next_occurs_at + make_interval(days => rt.interval_days)
        FROM accounts a
        WHERE rt.account_id = a.id
          AND a.user_id = $1
          AND rt.id = $2
        RETURNING rt.id, rt.account_id, rt.amount, rt.currency_code, rt.transaction_type,
                  rt.description, rt.interval_days, rt.next_occurs_at, rt.is_enabled
        "#,
    )
    .bind(user.id)
    .bind(recurring_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let Some(record) = record else {
        return Err((StatusCode::NOT_FOUND, "Recurring transaction not found".into()));
    };

    Ok(Json(record))
}

pub async fn delete_recurring_transaction(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(recurring_id): Path<Uuid>,
) -> Result<StatusCode, (axum::http::StatusCode, String)> {
    let result = sqlx::query(
        r#"
        DELETE FROM recurring_transactions rt
        USING accounts a
        WHERE rt.account_id = a.id
          AND a.user_id = $1
          AND rt.id = $2
        "#,
    )
    .bind(user.id)
    .bind(recurring_id)
    .execute(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Recurring transaction not found".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}
