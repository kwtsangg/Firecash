use argon2::{
    password_hash::{rand_core::OsRng, SaltString},
    Argon2, PasswordHash, PasswordHasher, PasswordVerifier,
};
use axum::{
    extract::{FromRequestParts, State},
    http::{request::Parts, Method, StatusCode},
    Json,
};
use chrono::{Duration, Utc};
use hex::encode as hex_encode;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::{audit::record_audit_event, state::AppState};

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

#[derive(Deserialize)]
pub struct UpdateProfileRequest {
    pub name: Option<String>,
    pub email: Option<String>,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user_id: Uuid,
}

#[derive(Serialize)]
pub struct UserProfile {
    pub id: Uuid,
    pub name: String,
    pub email: String,
}

#[derive(Clone)]
pub struct AuthenticatedUser {
    pub id: Uuid,
}

pub async fn is_admin(
    state: &AppState,
    user_id: Uuid,
) -> Result<bool, (StatusCode, String)> {
    if state.admin_emails.is_empty() {
        return Ok(false);
    }
    let email: Option<String> = sqlx::query_scalar(
        r#"
        SELECT email
        FROM users
        WHERE id = $1
        "#,
    )
    .bind(user_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(internal_error)?;

    Ok(email
        .map(|value| state.admin_emails.contains(&value.to_lowercase()))
        .unwrap_or(false))
}

impl FromRequestParts<AppState> for AuthenticatedUser {
    type Rejection = (StatusCode, String);

    fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> impl std::future::Future<Output = Result<Self, Self::Rejection>> + Send {
        let jwt_secret = state.jwt_secret.clone();
        let pool = state.pool.clone();
        async move {
            let auth_header = parts
                .headers
                .get(axum::http::header::AUTHORIZATION)
                .and_then(|value| value.to_str().ok())
                .ok_or((StatusCode::UNAUTHORIZED, "Missing auth header".into()))?;

            let token = auth_header
                .strip_prefix("Bearer ")
                .ok_or((StatusCode::UNAUTHORIZED, "Invalid auth header".into()))?;

            if let Ok(claims) = decode::<Claims>(
                token,
                &DecodingKey::from_secret(jwt_secret.as_bytes()),
                &Validation::default(),
            ) {
                let id = Uuid::parse_str(&claims.claims.sub)
                    .map_err(|_| (StatusCode::UNAUTHORIZED, "Invalid user id".into()))?;
                return Ok(Self {
                    id,
                });
            }

            if !token.starts_with("fc_") {
                return Err((StatusCode::UNAUTHORIZED, "Invalid token".into()));
            }

            let token_hash = hash_api_token(token);
            let record = sqlx::query(
                r#"
                SELECT id, user_id, is_read_only
                FROM api_keys
                WHERE (token_hash = $1 OR token = $2)
                  AND revoked_at IS NULL
                  AND (expires_at IS NULL OR expires_at > NOW())
                "#,
            )
            .bind(&token_hash)
            .bind(token)
            .fetch_optional(&pool)
            .await
            .map_err(internal_error)?;

            let Some(record) = record else {
                return Err((StatusCode::UNAUTHORIZED, "Invalid token".into()));
            };

            let user_id: Uuid = record.try_get("user_id").map_err(internal_error)?;
            let is_read_only: bool = record.try_get("is_read_only").map_err(internal_error)?;
            let token_id: Uuid = record.try_get("id").map_err(internal_error)?;

            let _ = sqlx::query(
                r#"
                UPDATE api_keys
                SET last_used_at = NOW()
                WHERE id = $1
                "#,
            )
            .bind(token_id)
            .execute(&pool)
            .await;

            if is_read_only && !is_read_only_method(&parts.method) {
                return Err((StatusCode::FORBIDDEN, "Read-only token".into()));
            }

            Ok(Self { id: user_id })
        }
    }
}

pub async fn register(
    State(state): State<AppState>,
    Json(payload): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    let email = payload.email.clone();
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

    let _ = record_audit_event(
        &state.pool,
        Some(user_id),
        "user.register",
        serde_json::json!({ "email": email }),
    )
    .await;

    let token = issue_token(&state.jwt_secret, user_id)?;
    Ok(Json(AuthResponse { token, user_id }))
}

pub async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    let email = payload.email.clone();
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

    let _ = record_audit_event(
        &state.pool,
        Some(user_id),
        "user.login",
        serde_json::json!({ "email": email }),
    )
    .await;

    let token = issue_token(&state.jwt_secret, user_id)?;
    Ok(Json(AuthResponse {
        token,
        user_id,
    }))
}

pub async fn demo_login(
    State(state): State<AppState>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    let demo_email = "demo@firecash.app";
    let demo_name = "Demo User";
    let demo_password = "demo-password";

    let record = sqlx::query(
        r#"
        SELECT id, password_hash
        FROM users
        WHERE email = $1
        "#,
    )
    .bind(demo_email)
    .fetch_optional(&state.pool)
    .await
    .map_err(internal_error)?;

    let user_id = if let Some(record) = record {
        let user_id: Uuid = record.try_get("id").map_err(internal_error)?;
        let password_hash: String = record.try_get("password_hash").map_err(internal_error)?;
        if verify_password(demo_password, &password_hash).is_err() {
            let next_hash = hash_password(demo_password)?;
            sqlx::query(
                r#"
                UPDATE users
                SET password_hash = $1
                WHERE id = $2
                "#,
            )
            .bind(next_hash)
            .bind(user_id)
            .execute(&state.pool)
            .await
            .map_err(internal_error)?;
        }
        user_id
    } else {
        let user_id = Uuid::new_v4();
        let password_hash = hash_password(demo_password)?;
        sqlx::query(
            r#"
            INSERT INTO users (id, name, email, password_hash)
            VALUES ($1, $2, $3, $4)
            "#,
        )
        .bind(user_id)
        .bind(demo_name)
        .bind(demo_email)
        .bind(password_hash)
        .execute(&state.pool)
        .await
        .map_err(internal_error)?;
        user_id
    };

    seed_demo_data(&state.pool, user_id).await?;

    let _ = record_audit_event(
        &state.pool,
        Some(user_id),
        "user.demo_login",
        serde_json::json!({ "email": demo_email }),
    )
    .await;

    let token = issue_token(&state.jwt_secret, user_id)?;
    Ok(Json(AuthResponse { token, user_id }))
}

pub async fn me(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> Result<Json<UserProfile>, (StatusCode, String)> {
    let record = sqlx::query(
        r#"
        SELECT id, name, email
        FROM users
        WHERE id = $1
        "#,
    )
    .bind(user.id)
    .fetch_one(&state.pool)
    .await
    .map_err(internal_error)?;

    Ok(Json(UserProfile {
        id: record.try_get("id").map_err(internal_error)?,
        name: record.try_get("name").map_err(internal_error)?,
        email: record.try_get("email").map_err(internal_error)?,
    }))
}

pub async fn update_me(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Json(payload): Json<UpdateProfileRequest>,
) -> Result<Json<UserProfile>, (StatusCode, String)> {
    let record = sqlx::query(
        r#"
        UPDATE users
        SET name = COALESCE($1, name),
            email = COALESCE($2, email)
        WHERE id = $3
        RETURNING id, name, email
        "#,
    )
    .bind(payload.name)
    .bind(payload.email)
    .bind(user.id)
    .fetch_one(&state.pool)
    .await
    .map_err(internal_error)?;

    let _ = record_audit_event(
        &state.pool,
        Some(user.id),
        "user.profile_updated",
        serde_json::json!({ "name": record.try_get::<String, _>("name").ok() }),
    )
    .await;

    Ok(Json(UserProfile {
        id: record.try_get("id").map_err(internal_error)?,
        name: record.try_get("name").map_err(internal_error)?,
        email: record.try_get("email").map_err(internal_error)?,
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

fn is_read_only_method(method: &Method) -> bool {
    matches!(method, &Method::GET | &Method::HEAD | &Method::OPTIONS)
}

pub fn hash_api_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex_encode(hasher.finalize())
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

async fn seed_demo_data(
    pool: &PgPool,
    user_id: Uuid,
) -> Result<(), (StatusCode, String)> {
    let existing_accounts: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)::bigint
        FROM accounts
        WHERE user_id = $1
        "#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(internal_error)?;

    let existing_assets: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)::bigint
        FROM assets
        WHERE account_id IN (
            SELECT id
            FROM accounts
            WHERE user_id = $1
        )
        "#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(internal_error)?;

    let existing_transactions: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)::bigint
        FROM transactions
        WHERE account_id IN (
            SELECT id
            FROM accounts
            WHERE user_id = $1
        )
        "#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(internal_error)?;

    let existing_price_history: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)::bigint
        FROM price_history
        WHERE asset_id IN (
            SELECT id
            FROM assets
            WHERE account_id IN (
                SELECT id
                FROM accounts
                WHERE user_id = $1
            )
        )
        "#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(internal_error)?;

    let existing_fx_rates: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)::bigint
        FROM fx_rates
        "#,
    )
    .fetch_one(pool)
    .await
    .map_err(internal_error)?;

    let needs_reseed = existing_accounts < 2
        || existing_assets < 1
        || existing_transactions < 3
        || existing_price_history < 1;

    if !needs_reseed {
        if existing_fx_rates < 1 {
            sqlx::query(
                r#"
                INSERT INTO fx_rates (id, base_currency, quote_currency, rate, recorded_on)
                VALUES ($1, $2, $3, $4, CURRENT_DATE)
                ON CONFLICT DO NOTHING
                "#,
            )
            .bind(Uuid::new_v4())
            .bind("USD")
            .bind("USD")
            .bind(1.0_f64)
            .execute(pool)
            .await
            .map_err(internal_error)?;
        }
        return Ok(());
    }

    let checking_id = Uuid::new_v4();
    let brokerage_id = Uuid::new_v4();
    let group_id = Uuid::new_v4();

    let mut tx = pool.begin().await.map_err(internal_error)?;

    sqlx::query(
        r#"
        DELETE FROM price_history
        WHERE asset_id IN (
            SELECT id
            FROM assets
            WHERE account_id IN (
                SELECT id
                FROM accounts
                WHERE user_id = $1
            )
        )
        "#,
    )
    .bind(user_id)
    .execute(&mut *tx)
    .await
    .map_err(internal_error)?;

    sqlx::query(
        r#"
        DELETE FROM assets
        WHERE account_id IN (
            SELECT id
            FROM accounts
            WHERE user_id = $1
        )
        "#,
    )
    .bind(user_id)
    .execute(&mut *tx)
    .await
    .map_err(internal_error)?;

    sqlx::query(
        r#"
        DELETE FROM transactions
        WHERE account_id IN (
            SELECT id
            FROM accounts
            WHERE user_id = $1
        )
        "#,
    )
    .bind(user_id)
    .execute(&mut *tx)
    .await
    .map_err(internal_error)?;

    sqlx::query(
        r#"
        DELETE FROM account_group_members
        WHERE account_id IN (
            SELECT id
            FROM accounts
            WHERE user_id = $1
        )
        OR group_id IN (
            SELECT id
            FROM account_groups
            WHERE user_id = $1
        )
        "#,
    )
    .bind(user_id)
    .execute(&mut *tx)
    .await
    .map_err(internal_error)?;

    sqlx::query(
        r#"
        DELETE FROM account_group_users
        WHERE user_id = $1
        "#,
    )
    .bind(user_id)
    .execute(&mut *tx)
    .await
    .map_err(internal_error)?;

    sqlx::query(
        r#"
        DELETE FROM account_groups
        WHERE user_id = $1
        "#,
    )
    .bind(user_id)
    .execute(&mut *tx)
    .await
    .map_err(internal_error)?;

    sqlx::query(
        r#"
        DELETE FROM accounts
        WHERE user_id = $1
        "#,
    )
    .bind(user_id)
    .execute(&mut *tx)
    .await
    .map_err(internal_error)?;

    sqlx::query(
        r#"
        INSERT INTO account_groups (id, user_id, name)
        VALUES ($1, $2, $3)
        "#,
    )
    .bind(group_id)
    .bind(user_id)
    .bind("Investments")
    .execute(&mut *tx)
    .await
    .map_err(internal_error)?;

    sqlx::query(
        r#"
        INSERT INTO account_group_users (group_id, user_id, role)
        VALUES ($1, $2, 'admin')
        ON CONFLICT DO NOTHING
        "#,
    )
    .bind(group_id)
    .bind(user_id)
    .execute(&mut *tx)
    .await
    .map_err(internal_error)?;

    sqlx::query(
        r#"
        INSERT INTO accounts (id, user_id, name, currency_code)
        VALUES ($1, $2, $3, $4),
               ($5, $6, $7, $8)
        "#,
    )
    .bind(checking_id)
    .bind(user_id)
    .bind("Everyday Checking")
    .bind("USD")
    .bind(brokerage_id)
    .bind(user_id)
    .bind("Brokerage")
    .bind("USD")
    .execute(&mut *tx)
    .await
    .map_err(internal_error)?;

    sqlx::query(
        r#"
        INSERT INTO account_group_members (group_id, account_id)
        VALUES ($1, $2)
        "#,
    )
    .bind(group_id)
    .bind(brokerage_id)
    .execute(&mut *tx)
    .await
    .map_err(internal_error)?;

    let asset_id = Uuid::new_v4();
    sqlx::query(
        r#"
        INSERT INTO assets (id, account_id, symbol, asset_type, quantity, currency_code)
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
    )
    .bind(asset_id)
    .bind(brokerage_id)
    .bind("AAPL")
    .bind("Stock")
    .bind(12.0_f64)
    .bind("USD")
    .execute(&mut *tx)
    .await
    .map_err(internal_error)?;

    sqlx::query(
        r#"
        INSERT INTO price_history (id, asset_id, price, currency_code, recorded_at)
        VALUES ($1, $2, $3, $4, NOW() - INTERVAL '7 days'),
               ($5, $6, $7, $8, NOW() - INTERVAL '3 days'),
               ($9, $10, $11, $12, NOW())
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(asset_id)
    .bind(182.0_f64)
    .bind("USD")
    .bind(Uuid::new_v4())
    .bind(asset_id)
    .bind(188.0_f64)
    .bind("USD")
    .bind(Uuid::new_v4())
    .bind(asset_id)
    .bind(191.5_f64)
    .bind("USD")
    .execute(&mut *tx)
    .await
    .map_err(internal_error)?;

    sqlx::query(
        r#"
        INSERT INTO transactions (id, account_id, amount, currency_code, transaction_type, description, occurred_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW() - INTERVAL '14 days'),
               ($7, $8, $9, $10, $11, $12, NOW() - INTERVAL '7 days'),
               ($13, $14, $15, $16, $17, $18, NOW() - INTERVAL '1 day')
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(checking_id)
    .bind(3200.0_f64)
    .bind("USD")
    .bind("income")
    .bind("Monthly salary")
    .bind(Uuid::new_v4())
    .bind(checking_id)
    .bind(850.0_f64)
    .bind("USD")
    .bind("expense")
    .bind("Rent")
    .bind(Uuid::new_v4())
    .bind(checking_id)
    .bind(140.0_f64)
    .bind("USD")
    .bind("expense")
    .bind("Utilities")
    .execute(&mut *tx)
    .await
    .map_err(internal_error)?;

    sqlx::query(
        r#"
        INSERT INTO fx_rates (id, base_currency, quote_currency, rate, recorded_on)
        VALUES ($1, $2, $3, $4, CURRENT_DATE)
        ON CONFLICT DO NOTHING
        "#,
    )
    .bind(Uuid::new_v4())
    .bind("USD")
    .bind("USD")
    .bind(1.0_f64)
    .execute(&mut *tx)
    .await
    .map_err(internal_error)?;

    tx.commit().await.map_err(internal_error)?;

    Ok(())
}
