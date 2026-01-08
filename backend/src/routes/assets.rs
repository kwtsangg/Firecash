use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Utc};
use sqlx::{QueryBuilder, Row};
use uuid::Uuid;

use crate::{
    audit::record_audit_event,
    auth::AuthenticatedUser,
    models::{Asset, CreateAssetRequest, UpdateAssetRequest, UpdateAssetResponse},
    services::pricing::{fetch_stooq_candles, refresh_asset_prices, Candle},
    state::AppState,
};

#[derive(serde::Deserialize)]
pub struct AssetQueryParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub start_date: Option<chrono::DateTime<chrono::Utc>>,
    pub end_date: Option<chrono::DateTime<chrono::Utc>>,
    pub account_id: Option<Uuid>,
    pub account_group_id: Option<Uuid>,
    pub currency_code: Option<String>,
}

#[derive(serde::Serialize)]
pub struct AssetPriceStatus {
    pub missing_count: i64,
    pub total_count: i64,
}

#[derive(serde::Serialize)]
pub struct AssetPrice {
    pub asset_id: Uuid,
    pub symbol: String,
    pub price: Option<f64>,
    pub currency_code: String,
    pub recorded_at: Option<DateTime<Utc>>,
}

#[derive(serde::Serialize)]
pub struct RefreshPricesResponse {
    pub updated: usize,
}

#[derive(serde::Deserialize)]
pub struct CandleQuery {
    pub symbol: String,
}

#[derive(serde::Serialize)]
pub struct CandleResponse {
    pub symbol: String,
    pub candles: Vec<Candle>,
}

pub async fn list_assets(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Query(params): Query<AssetQueryParams>,
) -> Result<Json<Vec<Asset>>, (axum::http::StatusCode, String)> {
    let limit = params.limit.unwrap_or(100).max(1).min(200);
    let offset = params.offset.unwrap_or(0).max(0);
    let mut query = QueryBuilder::new(
        r#"
        WITH accessible_accounts AS (
            SELECT id
            FROM accounts
            WHERE user_id =
        "#,
    );
    query.push_bind(user.id);
    query.push(
        r#"
            UNION
            SELECT agm.account_id
            FROM account_group_members agm
            INNER JOIN account_group_users agu ON agm.group_id = agu.group_id
            WHERE agu.user_id =
        "#,
    );
    query.push_bind(user.id);
    query.push(
        r#"
        )
        SELECT a.id, a.account_id, a.symbol, a.asset_type, a.quantity, a.currency_code, a.created_at
        FROM assets a
        INNER JOIN accounts acc ON a.account_id = acc.id
        WHERE a.account_id IN (SELECT id FROM accessible_accounts)
        "#,
    );

    if let Some(account_id) = params.account_id {
        query.push(" AND a.account_id = ");
        query.push_bind(account_id);
    }

    if let Some(group_id) = params.account_group_id {
        query.push(
            r#"
            AND EXISTS (
                SELECT 1
                FROM account_group_members agm
                WHERE agm.group_id =
            "#,
        );
        query.push_bind(group_id);
        query.push(" AND agm.account_id = a.account_id)");
    }

    if let Some(start_date) = params.start_date {
        query.push(" AND a.created_at >= ");
        query.push_bind(start_date);
    }

    if let Some(end_date) = params.end_date {
        query.push(" AND a.created_at <= ");
        query.push_bind(end_date);
    }

    if let Some(currency_code) = params.currency_code {
        query.push(" AND a.currency_code = ");
        query.push_bind(currency_code);
    }

    query.push(" ORDER BY a.symbol");
    query.push(" LIMIT ");
    query.push_bind(limit);
    query.push(" OFFSET ");
    query.push_bind(offset);

    let records = query
        .build_query_as::<Asset>()
        .fetch_all(&state.pool)
        .await
        .map_err(crate::auth::internal_error)?;

    Ok(Json(records))
}

pub async fn list_asset_prices(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> Result<Json<Vec<AssetPrice>>, (axum::http::StatusCode, String)> {
    let records = sqlx::query(
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
        ),
        latest_prices AS (
            SELECT ph.asset_id,
                   ph.price,
                   ph.currency_code,
                   ph.recorded_at,
                   ROW_NUMBER() OVER (PARTITION BY ph.asset_id ORDER BY ph.recorded_at DESC) as rn
            FROM price_history ph
        )
        SELECT a.id as asset_id,
               a.symbol,
               a.currency_code as asset_currency,
               lp.price,
               lp.currency_code as price_currency,
               lp.recorded_at
        FROM assets a
        INNER JOIN accounts acc ON a.account_id = acc.id
        LEFT JOIN latest_prices lp ON lp.asset_id = a.id AND lp.rn = 1
        WHERE a.account_id IN (SELECT id FROM accessible_accounts)
        ORDER BY a.symbol
        "#,
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let prices = records
        .into_iter()
        .map(|row| {
            let asset_id: Uuid = row
                .try_get("asset_id")
                .map_err(crate::auth::internal_error)?;
            let symbol: String = row
                .try_get("symbol")
                .map_err(crate::auth::internal_error)?;
            let asset_currency: String = row
                .try_get("asset_currency")
                .map_err(crate::auth::internal_error)?;
            let price: Option<f64> = row
                .try_get("price")
                .map_err(crate::auth::internal_error)?;
            let price_currency: Option<String> = row
                .try_get("price_currency")
                .map_err(crate::auth::internal_error)?;
            let recorded_at: Option<DateTime<Utc>> = row
                .try_get("recorded_at")
                .map_err(crate::auth::internal_error)?;
            Ok(AssetPrice {
                asset_id,
                symbol,
                price,
                currency_code: price_currency.unwrap_or(asset_currency),
                recorded_at,
            })
        })
        .collect::<Result<Vec<_>, _>>()?;

    Ok(Json(prices))
}

pub async fn asset_price_status(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> Result<Json<AssetPriceStatus>, (axum::http::StatusCode, String)> {
    let record = sqlx::query(
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
        ),
        latest_prices AS (
            SELECT ph.asset_id,
                   ph.price,
                   ROW_NUMBER() OVER (PARTITION BY ph.asset_id ORDER BY ph.recorded_at DESC) as rn
            FROM price_history ph
        )
        SELECT COUNT(*) FILTER (WHERE lp.price IS NULL) as missing_count,
               COUNT(*) as total_count
        FROM assets a
        INNER JOIN accounts acc ON a.account_id = acc.id
        LEFT JOIN latest_prices lp ON lp.asset_id = a.id AND lp.rn = 1
        WHERE a.account_id IN (SELECT id FROM accessible_accounts)
        "#,
    )
    .bind(user.id)
    .fetch_one(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let missing_count: i64 = record
        .try_get("missing_count")
        .map_err(crate::auth::internal_error)?;
    let total_count: i64 = record
        .try_get("total_count")
        .map_err(crate::auth::internal_error)?;

    Ok(Json(AssetPriceStatus {
        missing_count,
        total_count,
    }))
}

pub async fn refresh_prices(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> Result<Json<RefreshPricesResponse>, (axum::http::StatusCode, String)> {
    let updated = match refresh_asset_prices(&state.pool, Some(user.id)).await {
        Ok(updated) => updated,
        Err(err) => {
            let _ = record_audit_event(
                &state.pool,
                Some(user.id),
                "worker.error",
                serde_json::json!({ "worker": "asset_pricing", "error": err.to_string() }),
            )
            .await;
            return Err((StatusCode::INTERNAL_SERVER_ERROR, err.to_string()));
        }
    };

    Ok(Json(RefreshPricesResponse { updated }))
}

pub async fn list_candles(
    Query(query): Query<CandleQuery>,
) -> Result<Json<CandleResponse>, (axum::http::StatusCode, String)> {
    let symbol = query.symbol.trim().to_uppercase();
    if symbol.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "symbol is required".into()));
    }
    let candles = fetch_stooq_candles(&symbol)
        .await
        .map_err(|err| (StatusCode::BAD_REQUEST, err.to_string()))?;
    Ok(Json(CandleResponse { symbol, candles }))
}

pub async fn create_asset(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Json(payload): Json<CreateAssetRequest>,
) -> Result<Json<Asset>, (axum::http::StatusCode, String)> {
    let symbol = payload.symbol.trim().to_uppercase();
    ensure_account_edit_access(&state, user.id, payload.account_id).await?;

    let id = Uuid::new_v4();
    let record = sqlx::query_as::<_, Asset>(
        r#"
        INSERT INTO assets (
            id, account_id, symbol, asset_type, quantity, currency_code
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, account_id, symbol, asset_type, quantity, currency_code, created_at
        "#,
    )
    .bind(id)
    .bind(payload.account_id)
    .bind(symbol)
    .bind(payload.asset_type)
    .bind(payload.quantity)
    .bind(payload.currency_code)
    .fetch_one(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    Ok(Json(record))
}

pub async fn update_asset(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(asset_id): Path<Uuid>,
    Json(payload): Json<UpdateAssetRequest>,
) -> Result<Json<UpdateAssetResponse>, (axum::http::StatusCode, String)> {
    let account_id: Option<Uuid> = sqlx::query_scalar(
        r#"
        SELECT account_id
        FROM assets
        WHERE id = $1
        "#,
    )
    .bind(asset_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let Some(account_id) = account_id else {
        return Err((StatusCode::NOT_FOUND, "Asset not found".into()));
    };

    ensure_account_edit_access(&state, user.id, account_id).await?;

    if let Some(account_id) = payload.account_id {
        ensure_account_edit_access(&state, user.id, account_id).await?;
    }

    let normalized_symbol = payload
        .symbol
        .as_ref()
        .map(|symbol| symbol.trim().to_uppercase());
    let record = sqlx::query_as::<_, UpdateAssetResponse>(
        r#"
        UPDATE assets
        SET account_id = COALESCE($1, account_id),
            symbol = COALESCE($2, symbol),
            asset_type = COALESCE($3, asset_type),
            quantity = COALESCE($4, quantity),
            currency_code = COALESCE($5, currency_code)
        WHERE id = $6
        RETURNING id, account_id, symbol, asset_type, quantity, currency_code, created_at
        "#,
    )
    .bind(payload.account_id)
    .bind(normalized_symbol.as_deref())
    .bind(payload.asset_type)
    .bind(payload.quantity)
    .bind(payload.currency_code)
    .bind(asset_id)
    .fetch_one(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    Ok(Json(record))
}

pub async fn delete_asset(
    State(state): State<AppState>,
    user: AuthenticatedUser,
    Path(asset_id): Path<Uuid>,
) -> Result<StatusCode, (axum::http::StatusCode, String)> {
    let account_id: Option<Uuid> = sqlx::query_scalar(
        r#"
        SELECT account_id
        FROM assets
        WHERE id = $1
        "#,
    )
    .bind(asset_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let Some(account_id) = account_id else {
        return Err((StatusCode::NOT_FOUND, "Asset not found".into()));
    };

    ensure_account_edit_access(&state, user.id, account_id).await?;

    let result = sqlx::query(
        r#"
        DELETE FROM assets
        WHERE id = $1 AND account_id = $2
        "#,
    )
    .bind(asset_id)
    .bind(account_id)
    .execute(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Asset not found".into()));
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
