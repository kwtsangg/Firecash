use axum::{extract::State, Json};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    auth::AuthenticatedUser,
    models::{Asset, CreateAssetRequest},
    state::AppState,
};

pub async fn list_assets(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> Result<Json<Vec<Asset>>, (axum::http::StatusCode, String)> {
    let records = sqlx::query_as::<_, Asset>(
        r#"
        SELECT a.id, a.account_id, a.symbol, a.asset_type, a.quantity, a.currency_code
        FROM assets a
        INNER JOIN accounts acc ON a.account_id = acc.id
        WHERE acc.user_id = $1
        ORDER BY a.symbol
        "#,
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    Ok(Json(records))
}

pub async fn create_asset(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Json(payload): Json<CreateAssetRequest>,
) -> Result<Json<Asset>, (axum::http::StatusCode, String)> {
    let owner = sqlx::query(
        r#"
        SELECT user_id
        FROM accounts
        WHERE id = $1
        "#,
    )
    .bind(payload.account_id)
    .fetch_one(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let owner_id: Uuid = owner.try_get("user_id").map_err(crate::auth::internal_error)?;
    if owner_id != user.id {
        return Err((axum::http::StatusCode::FORBIDDEN, "Forbidden".into()));
    }

    let id = Uuid::new_v4();
    let record = sqlx::query_as::<_, Asset>(
        r#"
        INSERT INTO assets (
            id, account_id, symbol, asset_type, quantity, currency_code
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, account_id, symbol, asset_type, quantity, currency_code
        "#,
    )
    .bind(id)
    .bind(payload.account_id)
    .bind(payload.symbol)
    .bind(payload.asset_type)
    .bind(payload.quantity)
    .bind(payload.currency_code)
    .fetch_one(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    Ok(Json(record))
}
