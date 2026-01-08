use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    audit::record_audit_event,
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
        SELECT DISTINCT ag.id, ag.name
        FROM account_groups ag
        LEFT JOIN account_group_users agu ON ag.id = agu.group_id
        WHERE ag.user_id = $1 OR agu.user_id = $1
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

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct AccountGroupMembership {
    pub group_id: Uuid,
    pub account_id: Uuid,
}

pub async fn list_account_group_memberships(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> Result<Json<Vec<AccountGroupMembership>>, (axum::http::StatusCode, String)> {
    let records = sqlx::query_as::<_, AccountGroupMembership>(
        r#"
        SELECT agm.group_id, agm.account_id
        FROM account_group_members agm
        INNER JOIN account_groups ag ON agm.group_id = ag.id
        LEFT JOIN account_group_users agu ON ag.id = agu.group_id
        WHERE ag.user_id = $1 OR agu.user_id = $1
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
    if !payload.account_ids.is_empty() {
        let owned_count: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(*)
            FROM accounts
            WHERE user_id = $1 AND id = ANY($2)
            "#,
        )
        .bind(user.id)
        .bind(&payload.account_ids)
        .fetch_one(&state.pool)
        .await
        .map_err(crate::auth::internal_error)?;

        if owned_count != payload.account_ids.len() as i64 {
            return Err((StatusCode::FORBIDDEN, "Forbidden".into()));
        }
    }

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

    sqlx::query(
        r#"
        INSERT INTO account_group_users (group_id, user_id, role)
        VALUES ($1, $2, 'admin')
        ON CONFLICT DO NOTHING
        "#,
    )
    .bind(id)
    .bind(user.id)
    .execute(&state.pool)
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

    let _ = record_audit_event(
        &state.pool,
        Some(user.id),
        "account_group.created",
        serde_json::json!({ "group_id": id }),
    )
    .await;

    Ok(Json(record))
}

pub async fn update_account_group(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(group_id): Path<Uuid>,
    Json(payload): Json<UpdateAccountGroupRequest>,
) -> Result<Json<UpdateAccountGroupResponse>, (axum::http::StatusCode, String)> {
    ensure_group_admin(&state, group_id, user.id).await?;

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

    let _ = record_audit_event(
        &state.pool,
        Some(user.id),
        "account_group.updated",
        serde_json::json!({ "group_id": group_id }),
    )
    .await;

    Ok(Json(record))
}

pub async fn delete_account_group(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(group_id): Path<Uuid>,
) -> Result<StatusCode, (axum::http::StatusCode, String)> {
    ensure_group_admin(&state, group_id, user.id).await?;

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

    let _ = record_audit_event(
        &state.pool,
        Some(user.id),
        "account_group.deleted",
        serde_json::json!({ "group_id": group_id }),
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct AccountGroupUser {
    pub user_id: Uuid,
    pub name: String,
    pub email: String,
    pub role: String,
}

#[derive(serde::Deserialize)]
pub struct CreateAccountGroupUserRequest {
    pub email: String,
    pub role: String,
}

#[derive(serde::Deserialize)]
pub struct UpdateAccountGroupUserRequest {
    pub role: String,
}

pub async fn list_account_group_users(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(group_id): Path<Uuid>,
) -> Result<Json<Vec<AccountGroupUser>>, (StatusCode, String)> {
    ensure_group_member(&state, group_id, user.id).await?;

    let records = sqlx::query_as::<_, AccountGroupUser>(
        r#"
        SELECT u.id as user_id, u.name, u.email, agu.role
        FROM account_group_users agu
        INNER JOIN users u ON agu.user_id = u.id
        WHERE agu.group_id = $1
        ORDER BY u.name
        "#,
    )
    .bind(group_id)
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    Ok(Json(records))
}

pub async fn create_account_group_user(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(group_id): Path<Uuid>,
    Json(payload): Json<CreateAccountGroupUserRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    ensure_group_admin(&state, group_id, user.id).await?;
    let role = normalize_role(&payload.role)?;

    let user_id: Option<Uuid> = sqlx::query_scalar(
        r#"
        SELECT id
        FROM users
        WHERE email = $1
        "#,
    )
    .bind(payload.email.trim().to_lowercase())
    .fetch_optional(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let Some(user_id) = user_id else {
        return Err((StatusCode::NOT_FOUND, "User not found".into()));
    };

    sqlx::query(
        r#"
        INSERT INTO account_group_users (group_id, user_id, role)
        VALUES ($1, $2, $3)
        ON CONFLICT (group_id, user_id)
        DO UPDATE SET role = EXCLUDED.role
        "#,
    )
    .bind(group_id)
    .bind(user_id)
    .bind(role)
    .execute(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let _ = record_audit_event(
        &state.pool,
        Some(user.id),
        "account_group.member_added",
        serde_json::json!({ "group_id": group_id, "user_id": user_id }),
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn update_account_group_user(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path((group_id, target_user_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateAccountGroupUserRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    ensure_group_admin(&state, group_id, user.id).await?;
    let role = normalize_role(&payload.role)?;

    sqlx::query(
        r#"
        UPDATE account_group_users
        SET role = $1
        WHERE group_id = $2 AND user_id = $3
        "#,
    )
    .bind(role)
    .bind(group_id)
    .bind(target_user_id)
    .execute(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let _ = record_audit_event(
        &state.pool,
        Some(user.id),
        "account_group.member_updated",
        serde_json::json!({ "group_id": group_id, "user_id": target_user_id }),
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn delete_account_group_user(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path((group_id, target_user_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, (StatusCode, String)> {
    ensure_group_admin(&state, group_id, user.id).await?;

    let admin_count: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM account_group_users
        WHERE group_id = $1 AND role = 'admin'
        "#,
    )
    .bind(group_id)
    .fetch_one(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    if admin_count <= 1 {
        let target_role: Option<String> = sqlx::query_scalar(
            r#"
            SELECT role
            FROM account_group_users
            WHERE group_id = $1 AND user_id = $2
            "#,
        )
        .bind(group_id)
        .bind(target_user_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(crate::auth::internal_error)?;

        if matches!(target_role.as_deref(), Some("admin")) {
            return Err((StatusCode::BAD_REQUEST, "At least one admin required".into()));
        }
    }

    sqlx::query(
        r#"
        DELETE FROM account_group_users
        WHERE group_id = $1 AND user_id = $2
        "#,
    )
    .bind(group_id)
    .bind(target_user_id)
    .execute(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let _ = record_audit_event(
        &state.pool,
        Some(user.id),
        "account_group.member_removed",
        serde_json::json!({ "group_id": group_id, "user_id": target_user_id }),
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

async fn ensure_group_member(
    state: &AppState,
    group_id: Uuid,
    user_id: Uuid,
) -> Result<(), (StatusCode, String)> {
    let record = sqlx::query(
        r#"
        SELECT ag.id as group_id, agu.role
        FROM account_groups ag
        LEFT JOIN account_group_users agu
          ON ag.id = agu.group_id AND agu.user_id = $2
        WHERE ag.id = $1
        "#,
    )
    .bind(group_id)
    .bind(user_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let Some(record) = record else {
        return Err((StatusCode::NOT_FOUND, "Account group not found".into()));
    };

    let role: Option<String> = record
        .try_get("role")
        .map_err(crate::auth::internal_error)?;

    if role.is_none() {
        return Err((StatusCode::FORBIDDEN, "Forbidden".into()));
    }

    Ok(())
}

async fn ensure_group_admin(
    state: &AppState,
    group_id: Uuid,
    user_id: Uuid,
) -> Result<(), (StatusCode, String)> {
    let record = sqlx::query(
        r#"
        SELECT ag.id as group_id, agu.role
        FROM account_groups ag
        LEFT JOIN account_group_users agu
          ON ag.id = agu.group_id AND agu.user_id = $2
        WHERE ag.id = $1
        "#,
    )
    .bind(group_id)
    .bind(user_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let Some(record) = record else {
        return Err((StatusCode::NOT_FOUND, "Account group not found".into()));
    };

    let role: Option<String> = record
        .try_get("role")
        .map_err(crate::auth::internal_error)?;

    if role.as_deref() != Some("admin") {
        return Err((StatusCode::FORBIDDEN, "Forbidden".into()));
    }

    Ok(())
}

fn normalize_role(role: &str) -> Result<String, (StatusCode, String)> {
    let normalized = role.trim().to_lowercase();
    match normalized.as_str() {
        "view" | "edit" | "admin" => Ok(normalized),
        _ => Err((StatusCode::BAD_REQUEST, "Invalid role".into())),
    }
}
