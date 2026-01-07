use reqwest::{header, Client};
use serde::Serialize;
use sqlx::{postgres::PgPool, QueryBuilder, Row};
use std::collections::HashMap;
use std::io::{Error as IoError, ErrorKind};
use tracing::warn;
use uuid::Uuid;

#[derive(Serialize)]
pub struct Candle {
    pub date: String,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
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
        let normalized_symbol = symbol.trim().to_uppercase();
        symbol_map.entry(normalized_symbol).or_default().push(asset_id);
        currency_map.insert(asset_id, currency_code);
    }

    let symbols: Vec<String> = symbol_map.keys().cloned().collect();
    let client = Client::new();
    let mut updated = 0usize;

    for chunk in symbols.chunks(50) {
        let prices = fetch_stooq_prices(&client, chunk).await?;
        if prices.is_empty() {
            warn!("stooq returned no prices for {}", chunk.join(","));
            continue;
        }
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
            let currency = currency_from_symbol(symbol);
            prices.insert(symbol.clone(), (price, currency));
        }
    }
    Ok(prices)
}

pub async fn fetch_stooq_candles(
    symbol: &str,
) -> Result<Vec<Candle>, Box<dyn std::error::Error + Send + Sync>> {
    let lookup = stooq_symbol(symbol);
    let url = format!("https://stooq.com/q/d/l/?s={lookup}&i=d");
    let client = Client::new();
    let response = client
        .get(url)
        .header(header::USER_AGENT, "firecash-api")
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(Box::new(IoError::new(
            ErrorKind::Other,
            format!("stooq candle request failed: {}", response.status()),
        )));
    }
    let body = response.text().await?;
    let mut lines = body.lines();
    let _header = lines.next();
    let mut candles = Vec::new();
    for line in lines {
        let parts: Vec<&str> = line.split(',').collect();
        if parts.len() < 5 {
            continue;
        }
        let date = parts[0].to_string();
        let open = parts[1].parse::<f64>();
        let high = parts[2].parse::<f64>();
        let low = parts[3].parse::<f64>();
        let close = parts[4].parse::<f64>();
        if let (Ok(open), Ok(high), Ok(low), Ok(close)) = (open, high, low, close) {
            candles.push(Candle {
                date,
                open,
                high,
                low,
                close,
            });
        }
    }
    Ok(candles)
}

fn stooq_symbol(symbol: &str) -> String {
    if symbol.contains('.') {
        symbol.to_lowercase()
    } else {
        format!("{}.us", symbol.to_lowercase())
    }
}

fn currency_from_symbol(symbol: &str) -> String {
    let symbol = symbol.to_uppercase();
    if symbol.ends_with(".HK") {
        "HKD".to_string()
    } else if symbol.ends_with(".JP") {
        "JPY".to_string()
    } else if symbol.ends_with(".L") {
        "GBP".to_string()
    } else if symbol.ends_with(".TO") {
        "CAD".to_string()
    } else if symbol.ends_with(".SW") {
        "CHF".to_string()
    } else if symbol.ends_with(".DE") || symbol.ends_with(".EU") {
        "EUR".to_string()
    } else {
        "USD".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::{currency_from_symbol, stooq_symbol};

    #[test]
    fn stooq_symbol_defaults_to_us() {
        assert_eq!(stooq_symbol("AAPL"), "aapl.us");
    }

    #[test]
    fn stooq_symbol_preserves_exchange_suffix() {
        assert_eq!(stooq_symbol("0700.HK"), "0700.hk");
    }

    #[test]
    fn currency_mapping_handles_exchange_suffixes() {
        assert_eq!(currency_from_symbol("0700.HK"), "HKD");
        assert_eq!(currency_from_symbol("7203.JP"), "JPY");
        assert_eq!(currency_from_symbol("VOD.L"), "GBP");
        assert_eq!(currency_from_symbol("RY.TO"), "CAD");
        assert_eq!(currency_from_symbol("NESN.SW"), "CHF");
        assert_eq!(currency_from_symbol("BMW.DE"), "EUR");
        assert_eq!(currency_from_symbol("AAPL"), "USD");
    }
}
