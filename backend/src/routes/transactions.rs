use axum::{extract::State, Json};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    auth::AuthenticatedUser,
    models::{CreateTransactionRequest, Transaction},
    state::AppState,
};

pub async fn list_transactions(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> Result<Json<Vec<Transaction>>, (axum::http::StatusCode, String)> {
    let records = sqlx::query_as::<_, Transaction>(
        r#"
        SELECT t.id, t.account_id, t.category_id, t.payee_id, t.amount, t.currency_code,
               t.transaction_type, t.description, t.occurred_at
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

    if let Some(category_id) = payload.category_id {
        let category_owner = sqlx::query(
            r#"
            SELECT user_id
            FROM categories
            WHERE id = $1
            "#,
        )
        .bind(category_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(crate::auth::internal_error)?;

        let Some(category_owner) = category_owner else {
            return Err((axum::http::StatusCode::NOT_FOUND, "Category not found".into()));
        };

        let category_owner_id: Uuid = category_owner
            .try_get("user_id")
            .map_err(crate::auth::internal_error)?;
        if category_owner_id != user.id {
            return Err((axum::http::StatusCode::FORBIDDEN, "Forbidden".into()));
        }
    }

    if let Some(payee_id) = payload.payee_id {
        let payee_owner = sqlx::query(
            r#"
            SELECT user_id
            FROM payees
            WHERE id = $1
            "#,
        )
        .bind(payee_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(crate::auth::internal_error)?;

        let Some(payee_owner) = payee_owner else {
            return Err((axum::http::StatusCode::NOT_FOUND, "Payee not found".into()));
        };

        let payee_owner_id: Uuid = payee_owner.try_get("user_id").map_err(crate::auth::internal_error)?;
        if payee_owner_id != user.id {
            return Err((axum::http::StatusCode::FORBIDDEN, "Forbidden".into()));
        }
    }

    let id = Uuid::new_v4();
    let record = sqlx::query_as::<_, Transaction>(
        r#"
        INSERT INTO transactions (
            id, account_id, category_id, payee_id, amount, currency_code, transaction_type, description, occurred_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, account_id, category_id, payee_id, amount, currency_code, transaction_type, description, occurred_at
        "#,
    )
    .bind(id)
    .bind(payload.account_id)
    .bind(payload.category_id)
    .bind(payload.payee_id)
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
