use axum::{extract::State, Json};
use crate::{
    auth::AuthenticatedUser,
    models::{Account, CreateAccountRequest},
    state::AppState,
};

pub async fn list_accounts(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> Result<Json<Vec<Account>>, (axum::http::StatusCode, String)> {
    let records = sqlx::query_as::<_, Account>(
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
