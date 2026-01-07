use axum::{extract::State, Json};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    auth::AuthenticatedUser,
    models::{CreateRecurringTransactionRequest, RecurringTransaction},
    state::AppState,
};

pub async fn list_recurring_transactions(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> Result<Json<Vec<RecurringTransaction>>, (axum::http::StatusCode, String)> {
    let records = sqlx::query_as::<_, RecurringTransaction>(
        r#"
        SELECT rt.id, rt.account_id, rt.amount, rt.currency_code, rt.transaction_type,
               rt.description, rt.interval_days, rt.next_occurs_at
        FROM recurring_transactions rt
        INNER JOIN accounts a ON rt.account_id = a.id
        WHERE a.user_id = $1
        ORDER BY rt.next_occurs_at
        "#,
    )
    .bind(user.id)
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
    let record = sqlx::query_as::<_, RecurringTransaction>(
        r#"
        INSERT INTO recurring_transactions (
            id, account_id, amount, currency_code, transaction_type, description,
            interval_days, next_occurs_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, account_id, amount, currency_code, transaction_type,
                  description, interval_days, next_occurs_at
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
    .fetch_one(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    Ok(Json(record))
}
