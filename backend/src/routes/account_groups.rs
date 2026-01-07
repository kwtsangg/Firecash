use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use uuid::Uuid;

use crate::{
    auth::AuthenticatedUser,
    models::{
        AccountGroup, CreateAccountGroupRequest, UpdateAccountGroupRequest,
        UpdateAccountGroupResponse,
    },
    state::AppState,
};

#[derive(serde::Deserialize)]
pub struct PaginationParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

pub async fn list_account_groups(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Query(params): Query<PaginationParams>,
) -> Result<Json<Vec<AccountGroup>>, (axum::http::StatusCode, String)> {
    let limit = params.limit.unwrap_or(100).max(1).min(200);
    let offset = params.offset.unwrap_or(0).max(0);
    let records = sqlx::query_as::<_, AccountGroup>(
        r#"
        SELECT id, name
        FROM account_groups
        WHERE user_id = $1
        ORDER BY name
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

pub async fn update_account_group(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(group_id): Path<Uuid>,
    Json(payload): Json<UpdateAccountGroupRequest>,
) -> Result<Json<UpdateAccountGroupResponse>, (axum::http::StatusCode, String)> {
    let mut tx = state
        .pool
        .begin()
        .await
        .map_err(crate::auth::internal_error)?;

    let record = sqlx::query_as::<_, UpdateAccountGroupResponse>(
        r#"
        UPDATE account_groups
        SET name = COALESCE($1, name)
        WHERE id = $2 AND user_id = $3
        RETURNING id, name
        "#,
    )
    .bind(payload.name)
    .bind(group_id)
    .bind(user.id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(crate::auth::internal_error)?;

    let Some(record) = record else {
        return Err((StatusCode::NOT_FOUND, "Account group not found".into()));
    };

    if let Some(account_ids) = payload.account_ids {
        if !account_ids.is_empty() {
            let owned_count: i64 = sqlx::query_scalar(
                r#"
                SELECT COUNT(*)
                FROM accounts
                WHERE user_id = $1 AND id = ANY($2)
                "#,
            )
            .bind(user.id)
            .bind(&account_ids)
            .fetch_one(&mut *tx)
            .await
            .map_err(crate::auth::internal_error)?;

            if owned_count != account_ids.len() as i64 {
                return Err((StatusCode::FORBIDDEN, "Forbidden".into()));
            }
        }

        sqlx::query(
            r#"
            DELETE FROM account_group_members
            WHERE group_id = $1
            "#,
        )
        .bind(group_id)
        .execute(&mut *tx)
        .await
        .map_err(crate::auth::internal_error)?;

        for account_id in account_ids {
            sqlx::query(
                r#"
                INSERT INTO account_group_members (group_id, account_id)
                VALUES ($1, $2)
                ON CONFLICT DO NOTHING
                "#,
            )
            .bind(group_id)
            .bind(account_id)
            .execute(&mut *tx)
            .await
            .map_err(crate::auth::internal_error)?;
        }
    }

    tx.commit().await.map_err(crate::auth::internal_error)?;
    Ok(Json(record))
}

pub async fn delete_account_group(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(group_id): Path<Uuid>,
) -> Result<StatusCode, (axum::http::StatusCode, String)> {
    let mut tx = state
        .pool
        .begin()
        .await
        .map_err(crate::auth::internal_error)?;

    let exists = sqlx::query_scalar::<_, i64>(
        r#"
        SELECT 1
        FROM account_groups
        WHERE id = $1 AND user_id = $2
        "#,
    )
    .bind(group_id)
    .bind(user.id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(crate::auth::internal_error)?;

    if exists.is_none() {
        return Err((StatusCode::NOT_FOUND, "Account group not found".into()));
    }

    sqlx::query(
        r#"
        DELETE FROM account_group_members
        WHERE group_id = $1
        "#,
    )
    .bind(group_id)
    .execute(&mut *tx)
    .await
    .map_err(crate::auth::internal_error)?;

    sqlx::query(
        r#"
        DELETE FROM account_groups
        WHERE id = $1
        "#,
    )
    .bind(group_id)
    .execute(&mut *tx)
    .await
    .map_err(crate::auth::internal_error)?;

    tx.commit().await.map_err(crate::auth::internal_error)?;

    Ok(StatusCode::NO_CONTENT)
}
