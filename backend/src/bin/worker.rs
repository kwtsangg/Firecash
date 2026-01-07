use sqlx::postgres::PgPoolOptions;
use std::time::Duration;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use firecash_api::services::pricing::refresh_asset_prices;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .with(tracing_subscriber::fmt::layer())
        .init();

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://firecash:firecash@db:5432/firecash".into());
    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&database_url)
        .await
        .expect("failed to connect to database");
    sqlx::query("SELECT 1")
        .execute(&pool)
        .await
        .expect("database not reachable");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("failed to run migrations");

    let mut interval = tokio::time::interval(Duration::from_secs(60 * 60));

    loop {
        interval.tick().await;
        if let Err(error) = refresh_recurring_transactions(&pool).await {
            tracing::error!(?error, "failed to refresh recurring transactions");
        }
        if let Err(error) = refresh_fx_rates(&pool).await {
            tracing::error!(?error, "failed to refresh FX rates");
        }
        if let Err(error) = refresh_asset_prices(&pool, None).await {
            tracing::error!(?error, "failed to refresh prices");
        }
    }
}

async fn refresh_fx_rates(pool: &sqlx::PgPool) -> Result<(), sqlx::Error> {
    tracing::info!("refreshing FX rates");
    sqlx::query(
        r#"
        INSERT INTO fx_rates (id, base_currency, quote_currency, rate, recorded_on)
        VALUES (gen_random_uuid(), 'USD', 'USD', 1.0, CURRENT_DATE)
        ON CONFLICT DO NOTHING
        "#,
    )
    .execute(pool)
    .await?;
    Ok(())
}

async fn refresh_recurring_transactions(pool: &sqlx::PgPool) -> Result<(), sqlx::Error> {
    tracing::info!("refreshing recurring transactions");
    sqlx::query(
        r#"
        WITH due AS (
            SELECT id, account_id, amount, currency_code, transaction_type, description,
                   interval_days, next_occurs_at
            FROM recurring_transactions
            WHERE next_occurs_at <= NOW()
            FOR UPDATE SKIP LOCKED
        ),
        inserted AS (
            INSERT INTO transactions (
                id, account_id, amount, currency_code, transaction_type, description, occurred_at
            )
            SELECT gen_random_uuid(), account_id, amount, currency_code, transaction_type,
                   description, next_occurs_at
            FROM due
        )
        UPDATE recurring_transactions rt
        SET next_occurs_at = rt.next_occurs_at + make_interval(days => rt.interval_days)
        FROM due
        WHERE rt.id = due.id
        "#,
    )
    .execute(pool)
    .await?;
    Ok(())
}
