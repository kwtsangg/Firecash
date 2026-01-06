use axum::{routing::get, Router};
use std::net::SocketAddr;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .with(tracing_subscriber::fmt::layer())
        .init();

    let app = Router::new().route("/health", get(health));

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
