use axum::{extract::State, Json};
use chrono::{Duration, Utc};
use sqlx::Row;

use crate::{
    auth::AuthenticatedUser,
    models::{FxRate, HistoryPoint, TotalsResponse},
    state::AppState,
};

pub async fn totals(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> Result<Json<TotalsResponse>, (axum::http::StatusCode, String)> {
    let record = sqlx::query(
        r#"
        SELECT COALESCE(SUM(
            CASE WHEN t.transaction_type = 'income' THEN t.amount ELSE -t.amount END
        ), 0.0) as total
        FROM transactions t
        INNER JOIN accounts a ON t.account_id = a.id
        WHERE a.user_id = $1
        "#,
    )
    .bind(user.id)
    .fetch_one(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    Ok(Json(TotalsResponse {
        total: record
            .try_get("total")
            .map_err(crate::auth::internal_error)?,
        currency_code: "USD".to_string(),
    }))
}

pub async fn history(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> Result<Json<Vec<HistoryPoint>>, (axum::http::StatusCode, String)> {
    let today = Utc::now().date_naive();
    let start = today - Duration::days(30);

    let records = sqlx::query_as::<_, HistoryPoint>(
        r#"
        SELECT DATE(t.occurred_at) as date, COALESCE(SUM(
            CASE WHEN t.transaction_type = 'income' THEN t.amount ELSE -t.amount END
        ), 0.0) as value
        FROM transactions t
        INNER JOIN accounts a ON t.account_id = a.id
        WHERE a.user_id = $1 AND t.occurred_at >= $2
        GROUP BY DATE(t.occurred_at)
        ORDER BY DATE(t.occurred_at)
        "#,
    )
    .bind(user.id)
    .bind(start)
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    Ok(Json(records))
}

pub async fn fx_rates(
    State(state): State<AppState>,
    _user: AuthenticatedUser,
) -> Result<Json<Vec<FxRate>>, (axum::http::StatusCode, String)> {
    let today = Utc::now().date_naive();
    let records = sqlx::query_as::<_, FxRate>(
        r#"
        SELECT base_currency, quote_currency, rate, recorded_on
        FROM fx_rates
        WHERE recorded_on >= $1
        ORDER BY recorded_on DESC
        "#,
    )
    .bind(today - Duration::days(7))
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    Ok(Json(records))
}
