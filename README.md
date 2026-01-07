# Firecash

Firecash is a self-hosted asset tracker that combines a Rust API, a modern React dashboard, and a Postgres database. The backend tracks accounts, assets, transactions, and metrics, while a background worker is intended to ingest market prices and FX rates. The frontend is a polished dashboard with date-range filtering, charts, and account selectors.

## Features
- **Rust API (Axum + SQLx)** with JWT auth, accounts, groups, assets, transactions, and metrics endpoints.
- **React + Vite dashboard** with KPI cards, charts, and modern layout styling.
- **Background worker** for scheduled price and FX refresh tasks.
- **Postgres 18** with migrations for the initial schema.
- **Docker Compose** for local orchestration.

## Quick start (Docker)

```bash
# from repo root
cp .env.example .env

docker compose up --build
```

Services will be available at:
- API: http://localhost:8888
- Frontend: http://localhost:8800
- Postgres: localhost:8801

## Local development

### Backend

```bash
cd backend
cp ../.env.example .env

cargo check
cargo run
```

### Worker

```bash
cd backend
cp ../.env.example .env

cargo run --bin worker
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server runs at http://localhost:5173.

## Environment variables

`docker-compose.yml` and the binaries read the same set of environment variables:

- `DATABASE_URL` (example: `postgres://firecash:firecash@db:5432/firecash`)
- `JWT_SECRET` (used to sign auth tokens)
- `RUST_LOG` (log filter, e.g. `info`)

## Database migrations

Migrations live in `backend/migrations`. The API boots with `sqlx::migrate!()` and will apply them automatically when `DATABASE_URL` is reachable.

## Notes

- The worker is a placeholder scaffold for stock and FX ingestion; hook it up to your preferred data provider.
- The frontend lockfile (`frontend/package-lock.json`) is committed for reproducible installs.
