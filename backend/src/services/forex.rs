use chrono::{NaiveDate, Utc};
use reqwest::{header, Client, Url};
use serde::Deserialize;
use sqlx::postgres::PgPool;
use std::collections::HashMap;
use std::io::{Error as IoError, ErrorKind};
use tracing::debug;

#[allow(dead_code)]
const SUPPORTED_CURRENCIES: [&str; 5] = ["USD", "EUR", "GBP", "JPY", "HKD"];

#[derive(Deserialize)]
#[allow(dead_code)]
struct FxResponse {
    base: Option<String>,
    date: Option<String>,
    rates: Option<HashMap<String, f64>>,
    success: Option<bool>,
    error: Option<FxError>,
}

#[derive(Deserialize)]
#[allow(dead_code)]
struct FxError {
    info: Option<String>,
    error: Option<String>,
}

#[allow(dead_code)]
pub async fn refresh_fx_rates(pool: &PgPool) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let access_key = std::env::var("FX_ACCESS_KEY").ok();
    if access_key.is_none() {
        debug!("FX_ACCESS_KEY not set; skipping FX refresh");
        return Ok(());
    }
    let client = Client::new();
    let symbols = SUPPORTED_CURRENCIES.join(",");
    let access_key = access_key.expect("checked above");
    let url = Url::parse_with_params(
        "https://api.exchangerate.host/latest",
        &[
            ("base", "USD"),
            ("symbols", symbols.as_str()),
            ("access_key", access_key.as_str()),
        ],
    )?;
    let response = client
        .get(url)
        .header(header::USER_AGENT, "firecash-api")
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(Box::new(IoError::new(
            ErrorKind::Other,
            format!("fx rate request failed: {}", response.status()),
        )));
    }
    let body = response.text().await?;
    let payload: FxResponse = serde_json::from_str(&body).map_err(|err| {
        IoError::new(
            ErrorKind::Other,
            format!("failed to decode fx response: {err}. body: {body}"),
        )
    })?;
    if payload.success == Some(false) {
        let message = payload
            .error
            .and_then(|error| error.info.or(error.error))
            .unwrap_or_else(|| "fx API returned an error".to_string());
        return Err(Box::new(IoError::new(ErrorKind::Other, message)));
    }
    let base = payload
        .base
        .ok_or_else(|| IoError::new(ErrorKind::Other, "fx response missing base"))?;
    let date = payload
        .date
        .ok_or_else(|| IoError::new(ErrorKind::Other, "fx response missing date"))?;
    let rates = payload
        .rates
        .ok_or_else(|| IoError::new(ErrorKind::Other, "fx response missing rates"))?;
    let recorded_on = NaiveDate::parse_from_str(&date, "%Y-%m-%d")
        .unwrap_or_else(|_| Utc::now().date_naive());

    for currency in SUPPORTED_CURRENCIES {
        let rate = if currency == base {
            1.0
        } else {
            rates.get(currency).copied().unwrap_or(1.0)
        };
        sqlx::query(
            r#"
            INSERT INTO fx_rates (id, base_currency, quote_currency, rate, recorded_on)
            VALUES (gen_random_uuid(), $1, $2, $3, $4)
            ON CONFLICT DO NOTHING
            "#,
        )
        .bind(&base)
        .bind(currency)
        .bind(rate)
        .bind(recorded_on)
        .execute(pool)
        .await?;
    }

    Ok(())
}
