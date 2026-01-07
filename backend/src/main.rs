mod auth;
mod models;
mod routes;
mod state;

use axum::{routing::get, routing::post, routing::put, Router};
use sqlx::postgres::PgPoolOptions;
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::state::AppState;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .with(tracing_subscriber::fmt::layer())
        .init();

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://firecash:firecash@db:5432/firecash".into());
    let jwt_secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| "change-me".into());

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .expect("failed to connect to database");

    auth::ensure_database(&pool)
        .await
        .expect("database not reachable");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("failed to run migrations");

    let state = AppState { pool, jwt_secret };

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/register", post(auth::register))
        .route("/api/login", post(auth::login))
        .route("/api/demo-login", post(auth::demo_login))
        .route("/api/me", get(auth::me).put(auth::update_me))
        .route("/api/accounts", get(routes::accounts::list_accounts).post(routes::accounts::create_account))
        .route(
            "/api/accounts/{id}",
            put(routes::accounts::update_account).delete(routes::accounts::delete_account),
        )
        .route(
            "/api/account-groups",
            get(routes::account_groups::list_account_groups)
                .post(routes::account_groups::create_account_group),
        )
        .route(
            "/api/account-groups/{id}",
            put(routes::account_groups::update_account_group)
                .delete(routes::account_groups::delete_account_group),
        )
        .route(
            "/api/transactions",
            get(routes::transactions::list_transactions)
                .post(routes::transactions::create_transaction),
        )
        .route(
            "/api/transactions/{id}",
            put(routes::transactions::update_transaction)
                .delete(routes::transactions::delete_transaction),
        )
        .route(
            "/api/recurring-transactions",
            get(routes::recurring_transactions::list_recurring_transactions)
                .post(routes::recurring_transactions::create_recurring_transaction),
        )
        .route(
            "/api/recurring-transactions/{id}",
            put(routes::recurring_transactions::update_recurring_transaction)
                .delete(routes::recurring_transactions::delete_recurring_transaction),
        )
        .route("/api/assets", get(routes::assets::list_assets).post(routes::assets::create_asset))
        .route(
            "/api/assets/{id}",
            put(routes::assets::update_asset).delete(routes::assets::delete_asset),
        )
        .route("/api/totals", get(routes::metrics::totals))
        .route("/api/history", get(routes::metrics::history))
        .route("/api/fx-rates", get(routes::metrics::fx_rates))
        .layer(CorsLayer::new().allow_origin(Any).allow_headers(Any))
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    tracing::info!("Firecash API listening on {}", addr);

    axum::serve(
        tokio::net::TcpListener::bind(addr)
            .await
            .expect("failed to bind address"),
        app,
    )
    .await
    .expect("server error");
}

async fn health() -> &'static str {
    "ok"
}
