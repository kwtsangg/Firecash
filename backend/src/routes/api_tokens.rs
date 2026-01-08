use axum::{extract::Path, extract::State, http::StatusCode, Json};
use base64ct::{Base64UrlUnpadded, Encoding};
use chrono::{DateTime, Utc};
use rand_core::{OsRng, RngCore};
use uuid::Uuid;

use crate::{
    audit::record_audit_event,
    auth::{hash_api_token, AuthenticatedUser},
    state::AppState,
};

#[derive(serde::Deserialize)]
pub struct CreateApiTokenRequest {
    pub name: String,
    pub is_read_only: Option<bool>,
    pub expires_at: Option<DateTime<Utc>>,
}

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct ApiTokenSummary {
    pub id: Uuid,
    pub name: String,
    pub token_prefix: Option<String>,
    pub is_read_only: bool,
    pub created_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub revoked_at: Option<DateTime<Utc>>,
    pub expires_at: Option<DateTime<Utc>>,
}

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct ApiTokenCreated {
    pub id: Uuid,
    pub token: String,
    pub token_prefix: String,
    pub is_read_only: bool,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
}

pub async fn list_api_tokens(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> Result<Json<Vec<ApiTokenSummary>>, (StatusCode, String)> {
    let records = sqlx::query_as::<_, ApiTokenSummary>(
        r#"
        SELECT id,
               name,
               token_prefix,
               is_read_only,
               created_at,
               last_used_at,
               revoked_at,
               expires_at
        FROM api_keys
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

pub async fn create_api_token(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Json(payload): Json<CreateApiTokenRequest>,
) -> Result<Json<ApiTokenCreated>, (StatusCode, String)> {
    let name = payload.name.trim();
    if name.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Name is required".into()));
    }

    if let Some(expires_at) = payload.expires_at {
        if expires_at <= Utc::now() {
            return Err((StatusCode::BAD_REQUEST, "Expiry must be in the future".into()));
        }
    }

    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    let token_suffix = Base64UrlUnpadded::encode_string(&bytes);
    let token = format!("fc_{}", token_suffix);
    let token_hash = hash_api_token(&token);
    let token_prefix = token.chars().take(10).collect::<String>();

    let id = Uuid::new_v4();
    let is_read_only = payload.is_read_only.unwrap_or(false);

    let record = sqlx::query_as::<_, ApiTokenCreated>(
        r#"
        INSERT INTO api_keys (
            id,
            user_id,
            name,
            token_hash,
            token_prefix,
            is_read_only,
            expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id,
                  $8 as token,
                  token_prefix,
                  is_read_only,
                  created_at,
                  expires_at
        "#,
    )
    .bind(id)
    .bind(user.id)
    .bind(name)
    .bind(token_hash)
    .bind(&token_prefix)
    .bind(is_read_only)
    .bind(payload.expires_at)
    .bind(&token)
    .fetch_one(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let _ = record_audit_event(
        &state.pool,
        Some(user.id),
        "api_token.created",
        serde_json::json!({ "token_id": id, "name": name, "read_only": is_read_only }),
    )
    .await;

    Ok(Json(record))
}

pub async fn revoke_api_token(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(token_id): Path<Uuid>,
) -> Result<StatusCode, (StatusCode, String)> {
    let result = sqlx::query(
        r#"
        UPDATE api_keys
        SET revoked_at = NOW()
        WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
        "#,
    )
    .bind(token_id)
    .bind(user.id)
    .execute(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Token not found".into()));
    }

    let _ = record_audit_event(
        &state.pool,
        Some(user.id),
        "api_token.revoked",
        serde_json::json!({ "token_id": token_id }),
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}
