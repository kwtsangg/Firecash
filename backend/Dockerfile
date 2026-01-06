FROM rust:1.75 as builder

WORKDIR /app
COPY Cargo.toml Cargo.toml
COPY migrations migrations
COPY src src
RUN cargo build --release

FROM debian:bookworm-slim
RUN useradd -m appuser
WORKDIR /app
COPY --from=builder /app/target/release/firecash-api /app/firecash-api
COPY --from=builder /app/target/release/worker /app/firecash-api-worker
USER appuser
EXPOSE 8080
CMD ["/app/firecash-api"]
