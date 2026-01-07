use reqwest::{Client, Url};
use serde::Deserialize;
use sqlx::{postgres::PgPool, QueryBuilder, Row};
use std::collections::HashMap;
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
        let response = client.get(url).send().await?;
        let payload: QuoteResponse = response.json().await?;
        for quote in payload.quote_response.result {
            let Some(price) = quote.regular_market_price else {
                continue;
            };
            let currency = quote.currency.unwrap_or_else(|| "USD".to_string());
            if let Some(asset_ids) = symbol_map.get(&quote.symbol) {
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
    }

    Ok(updated)
}
