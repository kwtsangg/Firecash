use axum::{extract::{Path, Query, State}, http::StatusCode, Json};
use sqlx::Row;
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
        WITH accessible_accounts AS (
            SELECT id
            FROM accounts
            WHERE user_id = $1
            UNION
            SELECT agm.account_id
            FROM account_group_members agm
            INNER JOIN account_group_users agu ON agm.group_id = agu.group_id
            WHERE agu.user_id = $1
        )
        SELECT id, name, currency_code, created_at
        FROM accounts
        WHERE id IN (SELECT id FROM accessible_accounts)
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
    ensure_account_edit_access(&state, user.id, account_id).await?;

    let record = sqlx::query_as::<_, UpdateAccountResponse>(
        r#"
        UPDATE accounts
        SET name = COALESCE($1, name),
            currency_code = COALESCE($2, currency_code)
        WHERE id = $3
        RETURNING id, name, currency_code, created_at
        "#,
    )
    .bind(payload.name)
    .bind(payload.currency_code)
    .bind(account_id)
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
    ensure_account_edit_access(&state, user.id, account_id).await?;

    let result = sqlx::query(
        r#"
        DELETE FROM accounts
        WHERE id = $1
        "#,
    )
    .bind(account_id)
    .execute(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Account not found".into()));
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
