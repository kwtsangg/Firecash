use chrono::{NaiveDate, Utc};
use reqwest::{Client, Url};
use serde::Deserialize;
use sqlx::postgres::PgPool;
use std::collections::HashMap;

#[allow(dead_code)]
const SUPPORTED_CURRENCIES: [&str; 5] = ["USD", "EUR", "GBP", "JPY", "HKD"];

#[derive(Deserialize)]
#[allow(dead_code)]
struct FxResponse {
    base: String,
    date: String,
    rates: HashMap<String, f64>,
}

#[allow(dead_code)]
pub async fn refresh_fx_rates(pool: &PgPool) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let client = Client::new();
    let symbols = SUPPORTED_CURRENCIES.join(",");
    let url = Url::parse_with_params(
        "https://api.exchangerate.host/latest",
        &[("base", "USD"), ("symbols", symbols.as_str())],
    )?;
    let response = client.get(url).send().await?;
    let payload: FxResponse = response.json().await?;
    let recorded_on = NaiveDate::parse_from_str(&payload.date, "%Y-%m-%d")
        .unwrap_or_else(|_| Utc::now().date_naive());

    for currency in SUPPORTED_CURRENCIES {
        let rate = if currency == payload.base {
            1.0
        } else {
            payload.rates.get(currency).copied().unwrap_or(1.0)
        };
        sqlx::query(
            r#"
            INSERT INTO fx_rates (id, base_currency, quote_currency, rate, recorded_on)
            VALUES (gen_random_uuid(), $1, $2, $3, $4)
            ON CONFLICT DO NOTHING
            "#,
        )
        .bind(&payload.base)
        .bind(currency)
        .bind(rate)
        .bind(recorded_on)
        .execute(pool)
        .await?;
    }

    Ok(())
}
