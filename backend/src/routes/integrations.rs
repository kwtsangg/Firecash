use axum::{extract::Path, extract::State, http::StatusCode, Json};
use chrono::{DateTime, Utc};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    audit::record_audit_event,
    auth::AuthenticatedUser,
    services::integrations::{available_providers, IntegrationProviderCatalog},
    state::AppState,
};

#[derive(serde::Deserialize)]
pub struct CreateIntegrationRequest {
    pub provider_key: String,
    pub display_name: String,
}

#[derive(serde::Serialize)]
pub struct IntegrationSummary {
    pub id: Uuid,
    pub provider_key: String,
    pub display_name: String,
    pub status: String,
    pub last_sync_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub data_source: Option<String>,
    pub refresh_cadence: Option<String>,
}

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct IntegrationLogEntry {
    pub id: Uuid,
    pub level: String,
    pub message: String,
    pub created_at: DateTime<Utc>,
}

#[derive(serde::Serialize)]
pub struct IntegrationCatalogResponse {
    pub providers: Vec<IntegrationProviderCatalog>,
}

pub async fn list_integrations(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> Result<Json<Vec<IntegrationSummary>>, (StatusCode, String)> {
    let providers = available_providers();
    let records = sqlx::query(
        r#"
        SELECT id,
               provider_key,
               display_name,
               status,
               last_sync_at,
               created_at
        FROM integration_connections
        WHERE user_id = $1
        ORDER BY created_at DESC
        "#,
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let summaries = records
        .into_iter()
        .map(|row| {
            let provider_key: String = row
                .try_get("provider_key")
                .map_err(crate::auth::internal_error)?;
            let provider = providers
                .iter()
                .find(|item| item.key == provider_key)
                .cloned();
            Ok(IntegrationSummary {
                id: row.try_get("id").map_err(crate::auth::internal_error)?,
                provider_key,
                display_name: row
                    .try_get("display_name")
                    .map_err(crate::auth::internal_error)?,
                status: row.try_get("status").map_err(crate::auth::internal_error)?,
                last_sync_at: row
                    .try_get("last_sync_at")
                    .map_err(crate::auth::internal_error)?,
                created_at: row
                    .try_get("created_at")
                    .map_err(crate::auth::internal_error)?,
                data_source: provider.as_ref().map(|item| item.data_source.clone()),
                refresh_cadence: provider.as_ref().map(|item| item.refresh_cadence.clone()),
            })
        })
        .collect::<Result<Vec<_>, _>>()?;

    Ok(Json(summaries))
}

pub async fn list_integrations_catalog() -> Result<Json<IntegrationCatalogResponse>, (StatusCode, String)> {
    Ok(Json(IntegrationCatalogResponse {
        providers: available_providers(),
    }))
}

pub async fn create_integration(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Json(payload): Json<CreateIntegrationRequest>,
) -> Result<Json<IntegrationSummary>, (StatusCode, String)> {
    let provider_key = payload.provider_key.trim();
    let display_name = payload.display_name.trim();
    if provider_key.is_empty() || display_name.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Provider and name are required".into()));
    }

    let provider = available_providers()
        .into_iter()
        .find(|item| item.key == provider_key)
        .ok_or((StatusCode::BAD_REQUEST, "Unknown provider".into()))?;

    let id = Uuid::new_v4();
    let record = sqlx::query(
        r#"
        INSERT INTO integration_connections (id, user_id, provider_key, display_name, status)
        VALUES ($1, $2, $3, $4, 'pending')
        RETURNING id, provider_key, display_name, status, last_sync_at, created_at
        "#,
    )
    .bind(id)
    .bind(user.id)
    .bind(&provider.key)
    .bind(display_name)
    .fetch_one(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let _ = record_audit_event(
        &state.pool,
        Some(user.id),
        "integration.created",
        serde_json::json!({ "integration_id": id, "provider": provider.key }),
    )
    .await;

    Ok(Json(IntegrationSummary {
        id: record.try_get("id").map_err(crate::auth::internal_error)?,
        provider_key: record
            .try_get("provider_key")
            .map_err(crate::auth::internal_error)?,
        display_name: record
            .try_get("display_name")
            .map_err(crate::auth::internal_error)?,
        status: record.try_get("status").map_err(crate::auth::internal_error)?,
        last_sync_at: record
            .try_get("last_sync_at")
            .map_err(crate::auth::internal_error)?,
        created_at: record
            .try_get("created_at")
            .map_err(crate::auth::internal_error)?,
        data_source: Some(provider.data_source),
        refresh_cadence: Some(provider.refresh_cadence),
    }))
}

pub async fn list_integration_logs(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(integration_id): Path<Uuid>,
) -> Result<Json<Vec<IntegrationLogEntry>>, (StatusCode, String)> {
    let owner_id: Option<Uuid> = sqlx::query_scalar(
        r#"
        SELECT user_id
        FROM integration_connections
        WHERE id = $1
        "#,
    )
    .bind(integration_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    if owner_id != Some(user.id) {
        return Err((StatusCode::NOT_FOUND, "Integration not found".into()));
    }

    let logs = sqlx::query_as::<_, IntegrationLogEntry>(
        r#"
        SELECT id, level, message, created_at
        FROM integration_logs
        WHERE integration_id = $1
        ORDER BY created_at DESC
        LIMIT 50
        "#,
    )
    .bind(integration_id)
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    Ok(Json(logs))
}
