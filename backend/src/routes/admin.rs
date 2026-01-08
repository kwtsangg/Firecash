use axum::{extract::Query, extract::State, http::StatusCode, Json};
use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::Row;
use uuid::Uuid;

use crate::{auth::{is_admin, AuthenticatedUser}, state::AppState};

#[derive(serde::Deserialize)]
pub struct AuditLogQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Serialize)]
pub struct AuditLogEntry {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub user_name: Option<String>,
    pub user_email: Option<String>,
    pub action: String,
    pub context: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

pub async fn list_audit_logs(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Query(params): Query<AuditLogQuery>,
) -> Result<Json<Vec<AuditLogEntry>>, (StatusCode, String)> {
    let is_admin = is_admin(&state, user.id).await?;
    if !is_admin {
        return Err((StatusCode::FORBIDDEN, "Forbidden".into()));
    }

    let limit = params.limit.unwrap_or(100).max(1).min(200);
    let offset = params.offset.unwrap_or(0).max(0);

    let rows = sqlx::query(
        r#"
        SELECT al.id,
               al.user_id,
               u.name as user_name,
               u.email as user_email,
               al.action,
               al.context,
               al.created_at
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        ORDER BY al.created_at DESC
        LIMIT $1 OFFSET $2
        "#,
    )
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let entries = rows
        .into_iter()
        .map(|row| {
            let entry = AuditLogEntry {
                id: row.try_get("id").map_err(crate::auth::internal_error)?,
                user_id: row.try_get("user_id").map_err(crate::auth::internal_error)?,
                user_name: row
                    .try_get("user_name")
                    .map_err(crate::auth::internal_error)?,
                user_email: row
                    .try_get("user_email")
                    .map_err(crate::auth::internal_error)?,
                action: row
                    .try_get("action")
                    .map_err(crate::auth::internal_error)?,
                context: row
                    .try_get("context")
                    .map_err(crate::auth::internal_error)?,
                created_at: row
                    .try_get("created_at")
                    .map_err(crate::auth::internal_error)?,
            };
            Ok(entry)
        })
        .collect::<Result<Vec<_>, _>>()?;

    Ok(Json(entries))
}
