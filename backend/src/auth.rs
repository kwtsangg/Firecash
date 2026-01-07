use argon2::{
    password_hash::{rand_core::OsRng, SaltString},
    Argon2, PasswordHash, PasswordHasher, PasswordVerifier,
};
use axum::{
    extract::{FromRequestParts, State},
    http::{request::Parts, StatusCode},
    Json,
};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::state::AppState;

#[derive(Serialize, Deserialize)]
struct Claims {
    sub: String,
    exp: usize,
}

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub name: String,
    pub email: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user_id: Uuid,
}

#[derive(Clone)]
pub struct AuthenticatedUser {
    pub id: Uuid,
}

impl FromRequestParts<AppState> for AuthenticatedUser {
    type Rejection = (StatusCode, String);

    fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> impl std::future::Future<Output = Result<Self, Self::Rejection>> + Send {
        let jwt_secret = state.jwt_secret.clone();
        async move {
            let auth_header = parts
                .headers
                .get(axum::http::header::AUTHORIZATION)
                .and_then(|value| value.to_str().ok())
                .ok_or((StatusCode::UNAUTHORIZED, "Missing auth header".into()))?;

            let token = auth_header
                .strip_prefix("Bearer ")
                .ok_or((StatusCode::UNAUTHORIZED, "Invalid auth header".into()))?;

            let claims = decode::<Claims>(
                token,
                &DecodingKey::from_secret(jwt_secret.as_bytes()),
                &Validation::default(),
            )
            .map_err(|_| (StatusCode::UNAUTHORIZED, "Invalid token".into()))?;

            let id = Uuid::parse_str(&claims.claims.sub)
                .map_err(|_| (StatusCode::UNAUTHORIZED, "Invalid user id".into()))?;

            Ok(Self { id })
        }
    }
}

pub async fn register(
    State(state): State<AppState>,
    Json(payload): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    let password_hash = hash_password(&payload.password)?;
    let user_id = Uuid::new_v4();

    sqlx::query(
        r#"
        INSERT INTO users (id, name, email, password_hash)
        VALUES ($1, $2, $3, $4)
        "#,
    )
    .bind(user_id)
    .bind(payload.name)
    .bind(payload.email)
    .bind(password_hash)
    .execute(&state.pool)
    .await
    .map_err(internal_error)?;

    let token = issue_token(&state.jwt_secret, user_id)?;
    Ok(Json(AuthResponse { token, user_id }))
}

pub async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    let record = sqlx::query(
        r#"
        SELECT id, password_hash
        FROM users
        WHERE email = $1
        "#,
    )
    .bind(payload.email)
    .fetch_one(&state.pool)
    .await
    .map_err(|_| (StatusCode::UNAUTHORIZED, "Invalid credentials".into()))?;

    let password_hash: String = record
        .try_get("password_hash")
        .map_err(internal_error)?;
    let user_id: Uuid = record.try_get("id").map_err(internal_error)?;

    verify_password(&payload.password, &password_hash)?;

    let token = issue_token(&state.jwt_secret, user_id)?;
    Ok(Json(AuthResponse {
        token,
        user_id,
    }))
}

fn issue_token(secret: &str, user_id: Uuid) -> Result<String, (StatusCode, String)> {
    let exp = (Utc::now() + Duration::days(7)).timestamp() as usize;
    let claims = Claims {
        sub: user_id.to_string(),
        exp,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(internal_error)
}

fn hash_password(password: &str) -> Result<String, (StatusCode, String)> {
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(internal_error)?;
    Ok(hash.to_string())
}

fn verify_password(password: &str, hash: &str) -> Result<(), (StatusCode, String)> {
    let parsed = PasswordHash::new(hash).map_err(internal_error)?;
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Invalid credentials".into()))
}

pub fn internal_error<E: std::fmt::Display>(error: E) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
}

pub async fn ensure_database(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query("SELECT 1")
        .execute(pool)
        .await
        .map(|_| ())
}
