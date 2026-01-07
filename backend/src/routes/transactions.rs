use axum::{extract::Path, extract::State, Json};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    auth::AuthenticatedUser,
    models::{CreateTransactionRequest, ReconcileTransactionRequest, Transaction},
    state::AppState,
};

pub async fn list_transactions(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> Result<Json<Vec<Transaction>>, (axum::http::StatusCode, String)> {
    let records = sqlx::query_as::<_, Transaction>(
        r#"
        SELECT t.id, t.account_id, t.amount, t.currency_code, t.transaction_type,
               t.description, t.occurred_at, t.transfer_id, t.reconciled
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
            id, account_id, amount, currency_code, transaction_type, description, occurred_at, transfer_id, reconciled
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, false)
        RETURNING id, account_id, amount, currency_code, transaction_type, description, occurred_at, transfer_id, reconciled
        "#,
    )
    .bind(id)
    .bind(payload.account_id)
    .bind(payload.amount)
    .bind(payload.currency_code)
    .bind(payload.transaction_type)
    .bind(payload.description)
    .bind(payload.occurred_at)
    .fetch_one(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    Ok(Json(record))
}

pub async fn reconcile_transaction(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(transaction_id): Path<Uuid>,
    Json(payload): Json<ReconcileTransactionRequest>,
) -> Result<Json<Transaction>, (axum::http::StatusCode, String)> {
    let account_owner = sqlx::query(
        r#"
        SELECT a.user_id
        FROM transactions t
        INNER JOIN accounts a ON t.account_id = a.id
        WHERE t.id = $1
        "#,
    )
    .bind(transaction_id)
    .fetch_one(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let owner_id: Uuid = account_owner
        .try_get("user_id")
        .map_err(crate::auth::internal_error)?;

    if owner_id != user.id {
        return Err((axum::http::StatusCode::FORBIDDEN, "Forbidden".into()));
    }

    let record = sqlx::query_as::<_, Transaction>(
        r#"
        UPDATE transactions
        SET reconciled = $1
        WHERE id = $2
        RETURNING id, account_id, amount, currency_code, transaction_type, description, occurred_at, transfer_id, reconciled
        "#,
    )
    .bind(payload.reconciled)
    .bind(transaction_id)
    .fetch_one(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    Ok(Json(record))
}
