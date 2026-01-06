FROM rust:1.75 as builder

WORKDIR /app
COPY Cargo.toml Cargo.toml
COPY src src
RUN cargo build --release

FROM debian:bookworm-slim
RUN useradd -m appuser
WORKDIR /app
COPY --from=builder /app/target/release/firecash-api /app/firecash-api
USER appuser
EXPOSE 8080
CMD ["/app/firecash-api"]
