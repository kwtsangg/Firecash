use axum::{extract::State, Json};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    auth::AuthenticatedUser,
    models::{CreateTransferRequest, Transfer},
    state::AppState,
};

pub async fn list_transfers(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> Result<Json<Vec<Transfer>>, (axum::http::StatusCode, String)> {
    let records = sqlx::query_as::<_, Transfer>(
        r#"
        SELECT id, from_account_id, to_account_id, amount, currency_code, description, occurred_at
        FROM transfers
        WHERE user_id = $1
        ORDER BY occurred_at DESC
        "#,
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    Ok(Json(records))
}

pub async fn create_transfer(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Json(payload): Json<CreateTransferRequest>,
) -> Result<Json<Transfer>, (axum::http::StatusCode, String)> {
    if payload.amount <= 0.0 {
        return Err((
            axum::http::StatusCode::BAD_REQUEST,
            "Amount must be positive".into(),
        ));
    }
    if payload.from_account_id == payload.to_account_id {
        return Err((axum::http::StatusCode::BAD_REQUEST, "Accounts must differ".into()));
    }

    let mut transaction = state
        .pool
        .begin()
        .await
        .map_err(crate::auth::internal_error)?;

    let accounts = sqlx::query(
        r#"
        SELECT id, user_id
        FROM accounts
        WHERE id = ANY($1)
        "#,
    )
    .bind(vec![payload.from_account_id, payload.to_account_id])
    .fetch_all(&mut *transaction)
    .await
    .map_err(crate::auth::internal_error)?;

    if accounts.len() != 2 {
        return Err((axum::http::StatusCode::BAD_REQUEST, "Account not found".into()));
    }

    for account in accounts {
        let owner_id: Uuid = account
            .try_get("user_id")
            .map_err(crate::auth::internal_error)?;
        if owner_id != user.id {
            return Err((axum::http::StatusCode::FORBIDDEN, "Forbidden".into()));
        }
    }

    let transfer_id = Uuid::new_v4();
    let transfer = sqlx::query_as::<_, Transfer>(
        r#"
        INSERT INTO transfers (
            id, user_id, from_account_id, to_account_id, amount, currency_code, description, occurred_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, from_account_id, to_account_id, amount, currency_code, description, occurred_at
        "#,
    )
    .bind(transfer_id)
    .bind(user.id)
    .bind(payload.from_account_id)
    .bind(payload.to_account_id)
    .bind(payload.amount)
    .bind(&payload.currency_code)
    .bind(payload.description.clone())
    .bind(payload.occurred_at)
    .fetch_one(&mut *transaction)
    .await
    .map_err(crate::auth::internal_error)?;

    let transfer_out_id = Uuid::new_v4();
    let transfer_in_id = Uuid::new_v4();

    sqlx::query(
        r#"
        INSERT INTO transactions (
            id, account_id, amount, currency_code, transaction_type, description, occurred_at, transfer_id, reconciled
        )
        VALUES
            ($1, $2, $3, $4, 'Transfer Out', $5, $6, $7, false),
            ($8, $9, $10, $11, 'Transfer In', $12, $13, $14, false)
        "#,
    )
    .bind(transfer_out_id)
    .bind(payload.from_account_id)
    .bind(-payload.amount)
    .bind(&payload.currency_code)
    .bind(payload.description.clone())
    .bind(payload.occurred_at)
    .bind(transfer_id)
    .bind(transfer_in_id)
    .bind(payload.to_account_id)
    .bind(payload.amount)
    .bind(&payload.currency_code)
    .bind(payload.description)
    .bind(payload.occurred_at)
    .bind(transfer_id)
    .execute(&mut *transaction)
    .await
    .map_err(crate::auth::internal_error)?;

    transaction
        .commit()
        .await
        .map_err(crate::auth::internal_error)?;

    Ok(Json(transfer))
}
