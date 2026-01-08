mod audit;
mod auth;
mod models;
mod routes;
mod services;
mod state;

use axum::{
    middleware::from_fn_with_state,
    routing::get,
    routing::post,
    routing::put,
    Router,
};
use axum::{body::Body, extract::State, http::Request, middleware::Next, response::Response};
use sqlx::postgres::PgPoolOptions;
use std::net::SocketAddr;
use tower_governor::{governor::GovernorConfigBuilder, GovernorLayer};
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::{audit::record_audit_event, state::AppState};

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

    let admin_emails = std::env::var("ADMIN_EMAILS")
        .unwrap_or_default()
        .split(',')
        .map(|email| email.trim().to_lowercase())
        .filter(|email| !email.is_empty())
        .collect::<Vec<_>>();

    let governor_conf = GovernorConfigBuilder::default()
        .per_second(5)
        .burst_size(20)
        .finish()
        .expect("failed to build rate limit config");

    let state = AppState {
        pool,
        jwt_secret,
        admin_emails,
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/register", post(auth::register))
        .route("/api/login", post(auth::login))
        .route("/api/demo-login", post(auth::demo_login))
        .route("/api/me", get(auth::me).put(auth::update_me))
        .route(
            "/api/tokens",
            get(routes::api_tokens::list_api_tokens)
                .post(routes::api_tokens::create_api_token),
        )
        .route(
            "/api/tokens/{id}/revoke",
            post(routes::api_tokens::revoke_api_token),
        )
        .route(
            "/api/backup/export",
            get(routes::backup::export_backup),
        )
        .route(
            "/api/backup/restore",
            post(routes::backup::restore_backup),
        )
        .route(
            "/api/admin/audit-logs",
            get(routes::admin::list_audit_logs),
        )
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
            "/api/account-groups/memberships",
            get(routes::account_groups::list_account_group_memberships),
        )
        .route(
            "/api/account-groups/{id}",
            put(routes::account_groups::update_account_group)
                .delete(routes::account_groups::delete_account_group),
        )
        .route(
            "/api/account-groups/{id}/members",
            get(routes::account_groups::list_account_group_users)
                .post(routes::account_groups::create_account_group_user),
        )
        .route(
            "/api/account-groups/{id}/members/{user_id}",
            put(routes::account_groups::update_account_group_user)
                .delete(routes::account_groups::delete_account_group_user),
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
        .route(
            "/api/recurring-transactions/{id}/skip",
            post(routes::recurring_transactions::skip_recurring_transaction),
        )
        .route("/api/assets", get(routes::assets::list_assets).post(routes::assets::create_asset))
        .route("/api/assets/prices", get(routes::assets::list_asset_prices))
        .route(
            "/api/assets/performance",
            get(routes::assets::list_asset_performance),
        )
        .route("/api/assets/price-status", get(routes::assets::asset_price_status))
        .route("/api/assets/refresh-prices", post(routes::assets::refresh_prices))
        .route("/api/assets/candles", get(routes::assets::list_candles))
        .route(
            "/api/assets/{id}",
            put(routes::assets::update_asset).delete(routes::assets::delete_asset),
        )
        .route("/api/totals", get(routes::metrics::totals))
        .route("/api/history", get(routes::metrics::history))
        .route("/api/fx-rates", get(routes::metrics::fx_rates))
        .route("/api/fx-rates/refresh", post(routes::metrics::refresh_fx))
        .route(
            "/api/preferences",
            get(routes::preferences::list_preferences)
                .put(routes::preferences::update_preferences),
        )
        .route(
            "/api/integrations",
            get(routes::integrations::list_integrations)
                .post(routes::integrations::create_integration),
        )
        .route(
            "/api/integrations/catalog",
            get(routes::integrations::list_integrations_catalog),
        )
        .route(
            "/api/integrations/{id}/logs",
            get(routes::integrations::list_integration_logs),
        )
        .route(
            "/api/plugins",
            get(routes::plugins::list_plugins).post(routes::plugins::register_plugin),
        )
        .layer(CorsLayer::new().allow_origin(Any).allow_headers(Any))
        .layer(GovernorLayer::new(governor_conf))
        .layer(from_fn_with_state(state.clone(), monitoring_middleware))
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    tracing::info!("Firecash API listening on {}", addr);

    axum::serve(
        tokio::net::TcpListener::bind(addr)
            .await
            .expect("failed to bind address"),
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    .expect("server error");
}

async fn health() -> &'static str {
    "ok"
}

async fn monitoring_middleware(
    State(state): State<AppState>,
    req: Request<Body>,
    next: Next,
) -> Response {
    let method = req.method().to_string();
    let path = req.uri().path().to_string();
    let response = next.run(req).await;
    let status = response.status();

    if status.is_server_error() {
        let _ = record_audit_event(
            &state.pool,
            None,
            "api.error",
            serde_json::json!({
                "method": method,
                "path": path,
                "status": status.as_u16()
            }),
        )
        .await;
    }

    response
}
