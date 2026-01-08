use axum::{extract::State, http::StatusCode, Json};
use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::{audit::record_audit_event, auth::AuthenticatedUser, state::AppState};

#[derive(serde::Deserialize)]
pub struct RegisterPluginRequest {
    pub name: String,
    pub description: String,
    pub repo_url: String,
    pub docs_url: Option<String>,
    pub version: String,
    pub tags: Option<Vec<String>>,
}

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct PluginRegistryEntry {
    pub id: Uuid,
    pub name: String,
    pub description: String,
    pub repo_url: String,
    pub docs_url: Option<String>,
    pub version: String,
    pub tags: Vec<String>,
    pub is_verified: bool,
    pub created_at: DateTime<Utc>,
}

pub async fn list_plugins(
    State(state): State<AppState>,
    _user: AuthenticatedUser,
) -> Result<Json<Vec<PluginRegistryEntry>>, (StatusCode, String)> {
    let records = sqlx::query_as::<_, PluginRegistryEntry>(
        r#"
        SELECT id,
               name,
               description,
               repo_url,
               docs_url,
               version,
               tags,
               is_verified,
               created_at
        FROM plugin_registry
        ORDER BY created_at DESC
        "#,
    )
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    Ok(Json(records))
}

pub async fn register_plugin(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Json(payload): Json<RegisterPluginRequest>,
) -> Result<Json<PluginRegistryEntry>, (StatusCode, String)> {
    let name = payload.name.trim();
    let description = payload.description.trim();
    let repo_url = payload.repo_url.trim();
    let version = payload.version.trim();
    if name.is_empty() || description.is_empty() || repo_url.is_empty() || version.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Name, description, repo, and version are required".into()));
    }

    let id = Uuid::new_v4();
    let tags = payload.tags.unwrap_or_default();
    let record = sqlx::query_as::<_, PluginRegistryEntry>(
        r#"
        INSERT INTO plugin_registry (
            id,
            user_id,
            name,
            description,
            repo_url,
            docs_url,
            version,
            tags
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id,
                  name,
                  description,
                  repo_url,
                  docs_url,
                  version,
                  tags,
                  is_verified,
                  created_at
        "#,
    )
    .bind(id)
    .bind(user.id)
    .bind(name)
    .bind(description)
    .bind(repo_url)
    .bind(payload.docs_url)
    .bind(version)
    .bind(tags)
    .fetch_one(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let _ = record_audit_event(
        &state.pool,
        Some(user.id),
        "plugin.registered",
        serde_json::json!({ "plugin_id": id, "name": name }),
    )
    .await;

    Ok(Json(record))
}
