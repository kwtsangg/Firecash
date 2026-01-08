use axum::{extract::State, http::StatusCode, Json};
use chrono::{Duration, Utc};
use sqlx::Row;

use crate::{
    audit::record_audit_event,
    auth::AuthenticatedUser,
    models::{CurrencyTotal, FxRate, HistoryPoint, TotalsResponse},
    services::forex::refresh_fx_rates,
    state::AppState,
};

pub async fn totals(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> Result<Json<TotalsResponse>, (axum::http::StatusCode, String)> {
    let transaction_totals = sqlx::query(
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
        )
        SELECT t.currency_code,
               COALESCE(SUM(
                    CASE WHEN t.transaction_type = 'income' THEN t.amount ELSE -t.amount END
               ), 0.0) as total
        FROM transactions t
        INNER JOIN accounts a ON t.account_id = a.id
        WHERE t.account_id IN (SELECT id FROM accessible_accounts)
        GROUP BY t.currency_code
        "#,
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let asset_totals = sqlx::query(
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
                   ph.recorded_at,
                   ROW_NUMBER() OVER (PARTITION BY ph.asset_id ORDER BY ph.recorded_at DESC) as rn
            FROM price_history ph
        )
        SELECT a.currency_code,
               COALESCE(SUM(
                    CASE WHEN lp.rn = 1 THEN a.quantity * lp.price ELSE 0 END
               ), 0.0) as total
        FROM assets a
        INNER JOIN accounts ac ON a.account_id = ac.id
        LEFT JOIN latest_prices lp ON lp.asset_id = a.id
        WHERE a.account_id IN (SELECT id FROM accessible_accounts)
        GROUP BY a.currency_code
        "#,
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let mut totals = std::collections::HashMap::<String, f64>::new();
    for record in transaction_totals {
        let currency_code: String = record
            .try_get("currency_code")
            .map_err(crate::auth::internal_error)?;
        let total: f64 = record
            .try_get("total")
            .map_err(crate::auth::internal_error)?;
        totals.entry(currency_code).and_modify(|t| *t += total).or_insert(total);
    }
    for record in asset_totals {
        let currency_code: String = record
            .try_get("currency_code")
            .map_err(crate::auth::internal_error)?;
        let total: f64 = record
            .try_get("total")
            .map_err(crate::auth::internal_error)?;
        totals.entry(currency_code).and_modify(|t| *t += total).or_insert(total);
    }

    let fx_rates = sqlx::query(
        r#"
        SELECT DISTINCT ON (base_currency) base_currency, rate
        FROM fx_rates
        WHERE quote_currency = 'USD'
        ORDER BY base_currency, recorded_on DESC
        "#,
    )
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let mut fx_map = std::collections::HashMap::<String, f64>::new();
    for record in fx_rates {
        let base_currency: String = record
            .try_get("base_currency")
            .map_err(crate::auth::internal_error)?;
        let rate: f64 = record
            .try_get("rate")
            .map_err(crate::auth::internal_error)?;
        fx_map.insert(base_currency, rate);
    }

    let mut totals_by_currency = Vec::new();
    let mut total_in_usd = 0.0;
    for (currency_code, total) in totals {
        totals_by_currency.push(CurrencyTotal {
            currency_code: currency_code.clone(),
            total,
        });
        let rate = if currency_code == "USD" {
            Some(1.0)
        } else {
            fx_map.get(&currency_code).copied()
        };
        if let Some(rate) = rate {
            total_in_usd += total * rate;
        }
    }
    totals_by_currency.sort_by(|a, b| a.currency_code.cmp(&b.currency_code));

    Ok(Json(TotalsResponse {
        total: total_in_usd,
        currency_code: "USD".to_string(),
        totals_by_currency,
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
        WITH accessible_accounts AS (
            SELECT id
            FROM accounts
            WHERE user_id = $1
            UNION
            SELECT agm.account_id
            FROM account_group_members agm
            INNER JOIN account_group_users agu ON agm.group_id = agu.group_id
            WHERE agu.user_id = $1
        )
        SELECT DATE(t.occurred_at) as date, COALESCE(SUM(
            CASE WHEN t.transaction_type = 'income' THEN t.amount ELSE -t.amount END
        ), 0.0) as value
        FROM transactions t
        INNER JOIN accounts a ON t.account_id = a.id
        WHERE t.account_id IN (SELECT id FROM accessible_accounts)
          AND t.occurred_at >= $2
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

pub async fn refresh_fx(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> Result<StatusCode, (axum::http::StatusCode, String)> {
    if let Err(err) = refresh_fx_rates(&state.pool).await {
        let _ = record_audit_event(
            &state.pool,
            Some(user.id),
            "worker.error",
            serde_json::json!({ "worker": "fx_rates", "error": err.to_string() }),
        )
        .await;
        return Err((StatusCode::INTERNAL_SERVER_ERROR, err.to_string()));
    }
    Ok(StatusCode::NO_CONTENT)
}
