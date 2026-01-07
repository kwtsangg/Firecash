FROM rust:1.92 as builder

WORKDIR /app
COPY Cargo.toml Cargo.toml
COPY migrations migrations
COPY src src
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends libssl3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN useradd -m appuser
WORKDIR /app
COPY --from=builder /app/target/release/firecash-api /app/firecash-api
COPY --from=builder /app/target/release/worker /app/firecash-api-worker
COPY --from=builder /app/migrations /app/migrations
USER appuser
EXPOSE 8080
CMD ["/app/firecash-api"]
