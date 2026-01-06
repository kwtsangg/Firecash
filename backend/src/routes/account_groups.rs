use axum::{extract::State, Json};
use uuid::Uuid;

use crate::{
    auth::AuthenticatedUser,
    models::{AccountGroup, CreateAccountGroupRequest},
    state::AppState,
};

pub async fn list_account_groups(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> Result<Json<Vec<AccountGroup>>, (axum::http::StatusCode, String)> {
    let records = sqlx::query_as::<_, AccountGroup>(
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

    Ok(Json(records))
}

pub async fn create_account_group(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Json(payload): Json<CreateAccountGroupRequest>,
) -> Result<Json<AccountGroup>, (axum::http::StatusCode, String)> {
    let id = Uuid::new_v4();
    let record = sqlx::query_as::<_, AccountGroup>(
        r#"
        INSERT INTO account_groups (id, user_id, name)
        VALUES ($1, $2, $3)
        RETURNING id, name
        "#,
    )
    .bind(id)
    .bind(user.id)
    .bind(payload.name)
    .fetch_one(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    for account_id in payload.account_ids {
        sqlx::query(
            r#"
            INSERT INTO account_group_members (group_id, account_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
            "#,
        )
        .bind(id)
        .bind(account_id)
        .execute(&state.pool)
        .await
        .map_err(crate::auth::internal_error)?;
    }

    Ok(Json(record))
}
