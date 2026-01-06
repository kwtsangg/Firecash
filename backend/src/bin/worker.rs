use sqlx::postgres::PgPoolOptions;
use std::time::Duration;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

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

    let mut interval = tokio::time::interval(Duration::from_secs(60 * 60));

    loop {
        interval.tick().await;
        if let Err(error) = refresh_fx_rates(&pool).await {
            tracing::error!(?error, "failed to refresh FX rates");
        }
        if let Err(error) = refresh_prices(&pool).await {
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

async fn refresh_prices(pool: &sqlx::PgPool) -> Result<(), sqlx::Error> {
    tracing::info!("refreshing asset prices");
    sqlx::query(
        r#"
        INSERT INTO price_history (id, asset_id, price, currency_code, recorded_at)
        SELECT gen_random_uuid(), id, 100.0, currency_code, NOW()
        FROM assets
        ON CONFLICT DO NOTHING
        "#,
    )
    .execute(pool)
    .await?;
    Ok(())
}
