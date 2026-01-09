use axum::{extract::State, Json};
use chrono::{Duration, Utc};
use sqlx::{QueryBuilder, Row};

use crate::{
    auth::AuthenticatedUser,
    models::{Account, AccountGroup, Asset, CurrencyTotal, FxRate, HistoryPoint, TotalsResponse, Transaction},
    routes::{account_groups::AccountGroupMembership, assets::AssetPriceStatus},
    state::AppState,
};

#[derive(serde::Serialize)]
pub struct DashboardResponse {
    pub accounts: Vec<Account>,
    pub groups: Vec<AccountGroup>,
    pub memberships: Vec<AccountGroupMembership>,
    pub assets: Vec<Asset>,
    pub transactions: Vec<Transaction>,
    pub history: Vec<HistoryPoint>,
    pub totals: TotalsResponse,
    pub price_status: AssetPriceStatus,
    pub fx_rates: Vec<FxRate>,
}

pub async fn dashboard(
    State(state): State<AppState>,
    user: AuthenticatedUser,
) -> Result<Json<DashboardResponse>, (axum::http::StatusCode, String)> {
    let accounts = sqlx::query_as::<_, Account>(
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
        SELECT id, name, currency_code, created_at
        FROM accounts
        WHERE id IN (SELECT id FROM accessible_accounts)
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
        "#,
    )
    .bind(user.id)
    .bind(100_i64)
    .bind(0_i64)
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let groups = sqlx::query_as::<_, AccountGroup>(
        r#"
        SELECT DISTINCT ag.id, ag.name
        FROM account_groups ag
        LEFT JOIN account_group_users agu ON ag.id = agu.group_id
        WHERE ag.user_id = $1 OR agu.user_id = $1
        ORDER BY name
        LIMIT $2 OFFSET $3
        "#,
    )
    .bind(user.id)
    .bind(100_i64)
    .bind(0_i64)
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let memberships = sqlx::query_as::<_, AccountGroupMembership>(
        r#"
        SELECT agm.group_id, agm.account_id
        FROM account_group_members agm
        INNER JOIN account_groups ag ON agm.group_id = ag.id
        LEFT JOIN account_group_users agu ON ag.id = agu.group_id
        WHERE ag.user_id = $1 OR agu.user_id = $1
        "#,
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await
    .map_err(crate::auth::internal_error)?;

    let mut asset_query = QueryBuilder::new(
        r#"
        WITH accessible_accounts AS (
            SELECT id
            FROM accounts
            WHERE user_id =
        "#,
    );
    asset_query.push_bind(user.id);
    asset_query.push(
        r#"
            UNION
            SELECT agm.account_id
            FROM account_group_members agm
            INNER JOIN account_group_users agu ON agm.group_id = agu.group_id
            WHERE agu.user_id =
        "#,
    );
    asset_query.push_bind(user.id);
    asset_query.push(
        r#"
        )
        SELECT a.id, a.account_id, a.symbol, a.asset_type, a.quantity, a.currency_code, a.created_at
        FROM assets a
        INNER JOIN accounts acc ON a.account_id = acc.id
        WHERE a.account_id IN (SELECT id FROM accessible_accounts)
        ORDER BY a.symbol
        LIMIT
        "#,
    );
    asset_query.push_bind(100_i64);
    asset_query.push(" OFFSET ");
    asset_query.push_bind(0_i64);

    let assets = asset_query
        .build_query_as::<Asset>()
        .fetch_all(&state.pool)
        .await
        .map_err(crate::auth::internal_error)?;

    let mut transaction_query = QueryBuilder::new(
        r#"
        WITH accessible_accounts AS (
            SELECT id
            FROM accounts
            WHERE user_id =
        "#,
    );
    transaction_query.push_bind(user.id);
    transaction_query.push(
        r#"
            UNION
            SELECT agm.account_id
            FROM account_group_members agm
            INNER JOIN account_group_users agu ON agm.group_id = agu.group_id
            WHERE agu.user_id =
        "#,
    );
    transaction_query.push_bind(user.id);
    transaction_query.push(
        r#"
        )
        SELECT t.id, t.account_id, t.amount, t.currency_code, t.transaction_type,
               t.category, t.merchant, t.description, t.occurred_at
        FROM transactions t
        INNER JOIN accounts a ON t.account_id = a.id
        WHERE t.account_id IN (SELECT id FROM accessible_accounts)
        ORDER BY t.occurred_at DESC
        LIMIT
        "#,
    );
    transaction_query.push_bind(100_i64);
    transaction_query.push(" OFFSET ");
    transaction_query.push_bind(0_i64);

    let transactions = transaction_query
        .build_query_as::<Transaction>()
        .fetch_all(&state.pool)
        .await
        .map_err(crate::auth::internal_error)?;

    let today = Utc::now().date_naive();
    let start = today - Duration::days(30);
    let history = sqlx::query_as::<_, HistoryPoint>(
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

    let fx_totals = sqlx::query(
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
    for record in fx_totals {
        let base_currency: String = record
            .try_get("base_currency")
            .map_err(crate::auth::internal_error)?;
        let rate: f64 = record.try_get("rate").map_err(crate::auth::internal_error)?;
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

    let totals = TotalsResponse {
        total: total_in_usd,
        currency_code: "USD".to_string(),
        totals_by_currency,
    };

    let price_status_record = sqlx::query(
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

    let missing_count: i64 = price_status_record
        .try_get("missing_count")
        .map_err(crate::auth::internal_error)?;
    let total_count: i64 = price_status_record
        .try_get("total_count")
        .map_err(crate::auth::internal_error)?;
    let price_status = AssetPriceStatus {
        missing_count,
        total_count,
    };

    let fx_rates = sqlx::query_as::<_, FxRate>(
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

    Ok(Json(DashboardResponse {
        accounts,
        groups,
        memberships,
        assets,
        transactions,
        history,
        totals,
        price_status,
        fx_rates,
    }))
}
