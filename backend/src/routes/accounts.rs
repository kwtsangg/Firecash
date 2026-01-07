use axum::{extract::{Path, Query, State}, http::StatusCode, Json};
use uuid::Uuid;
use crate::{
    auth::AuthenticatedUser,
    models::{Account, CreateAccountRequest, UpdateAccountRequest, UpdateAccountResponse},
    state::AppState,
};

#[derive(serde::Deserialize)]
pub struct PaginationParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

pub async fn list_accounts(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Query(params): Query<PaginationParams>,
) -> Result<Json<Vec<Account>>, (axum::http::StatusCode, String)> {
    let limit = params.limit.unwrap_or(100).max(1).min(200);
    let offset = params.offset.unwrap_or(0).max(0);
    let records = sqlx::query_as::<_, Account>(
        r#"
        SELECT id, name, currency_code, created_at
        FROM accounts
        WHERE user_id = $1
        ORDER BY created_at DESC
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

pub async fn create_account(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Json(payload): Json<CreateAccountRequest>,
) -> Result<Json<Account>, (axum::http::StatusCode, String)> {
    let id = Uuid::new_v4();
    let record = sqlx::query_as::<_, Account>(
        r#"
        INSERT INTO accounts (id, user_id, name, currency_code)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, currency_code, created_at
        "#,
    )
    .bind(id)
    .bind(user.id)
    .bind(payload.name)
    .bind(payload.currency_code)
    .fetch_one(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    Ok(Json(record))
}

pub async fn update_account(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(account_id): Path<Uuid>,
    Json(payload): Json<UpdateAccountRequest>,
) -> Result<Json<UpdateAccountResponse>, (axum::http::StatusCode, String)> {
    let record = sqlx::query_as::<_, UpdateAccountResponse>(
        r#"
        UPDATE accounts
        SET name = COALESCE($1, name),
            currency_code = COALESCE($2, currency_code)
        WHERE id = $3 AND user_id = $4
        RETURNING id, name, currency_code, created_at
        "#,
    )
    .bind(payload.name)
    .bind(payload.currency_code)
    .bind(account_id)
    .bind(user.id)
    .fetch_optional(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    match record {
        Some(record) => Ok(Json(record)),
        None => Err((StatusCode::NOT_FOUND, "Account not found".into())),
    }
}

pub async fn delete_account(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(account_id): Path<Uuid>,
) -> Result<StatusCode, (axum::http::StatusCode, String)> {
    let result = sqlx::query(
        r#"
        DELETE FROM accounts
        WHERE id = $1 AND user_id = $2
        "#,
    )
    .bind(account_id)
    .bind(user.id)
    .execute(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Account not found".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}
