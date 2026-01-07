use reqwest::{header, Client, Url};
use serde::Deserialize;
use sqlx::{postgres::PgPool, QueryBuilder, Row};
use std::collections::HashMap;
use std::io::{Error as IoError, ErrorKind};
use tracing::{info, warn};
use uuid::Uuid;

#[derive(Deserialize)]
struct QuoteResponse {
    #[serde(rename = "quoteResponse")]
    quote_response: QuoteResult,
}

#[derive(Deserialize)]
struct QuoteResult {
    result: Vec<QuoteItem>,
}

#[derive(Deserialize)]
struct QuoteItem {
    symbol: String,
    #[serde(rename = "regularMarketPrice")]
    regular_market_price: Option<f64>,
    currency: Option<String>,
}

pub async fn refresh_asset_prices(
    pool: &PgPool,
    user_id: Option<Uuid>,
) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    let mut query = QueryBuilder::new(
        r#"
        SELECT a.id, a.symbol, a.currency_code
        FROM assets a
        INNER JOIN accounts acc ON a.account_id = acc.id
        "#,
    );

    if let Some(user_id) = user_id {
        query.push(" WHERE acc.user_id = ");
        query.push_bind(user_id);
    }

    let rows = query.build().fetch_all(pool).await?;
    if rows.is_empty() {
        return Ok(0);
    }

    let mut symbol_map: HashMap<String, Vec<Uuid>> = HashMap::new();
    let mut currency_map: HashMap<Uuid, String> = HashMap::new();

    for row in rows {
        let asset_id: Uuid = row.try_get("id")?;
        let symbol: String = row.try_get("symbol")?;
        let currency_code: String = row.try_get("currency_code")?;
        symbol_map.entry(symbol).or_default().push(asset_id);
        currency_map.insert(asset_id, currency_code);
    }

    let symbols: Vec<String> = symbol_map.keys().cloned().collect();
    let client = Client::new();
    let mut updated = 0usize;

    for chunk in symbols.chunks(50) {
        let symbols = chunk.join(",");
        let url = Url::parse_with_params(
            "https://query1.finance.yahoo.com/v7/finance/quote",
            &[("symbols", symbols)],
        )?;
        let response = client
            .get(url)
            .header(header::USER_AGENT, "firecash-api")
            .send()
            .await?;
        if response.status() == reqwest::StatusCode::UNAUTHORIZED
            || response.status() == reqwest::StatusCode::FORBIDDEN
        {
            info!(
                status = %response.status(),
                "quote request unauthorized; falling back to stooq"
            );
            let fallback_prices = fetch_stooq_prices(&client, chunk).await?;
            if fallback_prices.is_empty() {
                warn!("stooq fallback returned no prices");
                return Ok(updated);
            }
            updated += apply_prices(pool, &symbol_map, &currency_map, fallback_prices).await?;
            continue;
        }
        if !response.status().is_success() {
            return Err(Box::new(IoError::new(
                ErrorKind::Other,
                format!("quote request failed: {}", response.status()),
            )));
        }
        let body = response.text().await?;
        let payload: QuoteResponse = serde_json::from_str(&body).map_err(|err| {
            IoError::new(
                ErrorKind::Other,
                format!("failed to decode quote response: {err}. body: {body}"),
            )
        })?;
        let prices = payload
            .quote_response
            .result
            .into_iter()
            .filter_map(|quote| {
                let price = quote.regular_market_price?;
                let currency = quote.currency.unwrap_or_else(|| "USD".to_string());
                Some((quote.symbol, (price, currency)))
            })
            .collect();
        updated += apply_prices(pool, &symbol_map, &currency_map, prices).await?;
    }

    Ok(updated)
}

async fn apply_prices(
    pool: &PgPool,
    symbol_map: &HashMap<String, Vec<Uuid>>,
    currency_map: &HashMap<Uuid, String>,
    prices: HashMap<String, (f64, String)>,
) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    let mut updated = 0usize;
    for (symbol, (price, currency)) in prices {
        if let Some(asset_ids) = symbol_map.get(&symbol) {
            for asset_id in asset_ids {
                let currency_code = currency_map
                    .get(asset_id)
                    .cloned()
                    .unwrap_or_else(|| currency.clone());
                sqlx::query(
                    r#"
                    INSERT INTO price_history (id, asset_id, price, currency_code, recorded_at)
                    VALUES ($1, $2, $3, $4, NOW())
                    "#,
                )
                .bind(Uuid::new_v4())
                .bind(asset_id)
                .bind(price)
                .bind(currency_code)
                .execute(pool)
                .await?;
                updated += 1;
            }
        }
    }
    Ok(updated)
}

async fn fetch_stooq_prices(
    client: &Client,
    symbols: &[String],
) -> Result<HashMap<String, (f64, String)>, Box<dyn std::error::Error + Send + Sync>> {
    let mut prices = HashMap::new();
    for symbol in symbols {
        let lookup = stooq_symbol(symbol);
        let url = format!(
            "https://stooq.com/q/l/?s={lookup}&f=sd2t2ohlcv&h&e=csv"
        );
        let response = client
            .get(url)
            .header(header::USER_AGENT, "firecash-api")
            .send()
            .await?;
        if !response.status().is_success() {
            continue;
        }
        let body = response.text().await?;
        let mut lines = body.lines();
        let _header = lines.next();
        let Some(row) = lines.next() else {
            continue;
        };
        let parts: Vec<&str> = row.split(',').collect();
        if parts.len() < 8 {
            continue;
        }
        let close = parts[6].trim().parse::<f64>();
        if let Ok(price) = close {
            let currency = if symbol.ends_with(".HK") { "HKD" } else { "USD" };
            prices.insert(symbol.clone(), (price, currency.to_string()));
        }
    }
    Ok(prices)
}

fn stooq_symbol(symbol: &str) -> String {
    if symbol.contains('.') {
        symbol.to_lowercase()
    } else {
        format!("{}.us", symbol.to_lowercase())
    }
}
