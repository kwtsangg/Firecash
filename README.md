# Firecash

Firecash is a self-hosted asset tracker that combines a Rust API, a modern React dashboard, and a Postgres database. The backend tracks accounts, assets, transactions, and metrics, while a background worker is intended to ingest market prices and FX rates. The frontend is a polished dashboard with date-range filtering, charts, and account selectors.

## Features
- **Rust API (Axum + SQLx)** with JWT auth, accounts, groups, assets, transactions, and metrics endpoints.
- **React + Vite dashboard** with KPI cards, charts, and modern layout styling.
- **Background worker** for scheduled price and FX refresh tasks.
- **Postgres 18** with migrations for the initial schema.
- **Docker Compose** for local orchestration.

## Product goals & status

| Goal | Status |
| --- | --- |
| Track stock prices and include them in totals | ✅ Asset prices are stored in `price_history` and included in totals. |
| Log periodic income/expense | ✅ Recurring transactions can be scheduled via API. |
| Modern UI with charts and date-range filtering | ✅ Dashboard includes KPIs, charts, and date-range selector. |
| Multiple accounts with grouping | ✅ Accounts and account groups supported in API. |
| Multi-currency support | ✅ Currency codes are stored per account/transaction/asset, totals include currency breakdowns. |
| REST API for database-backed truth + future API keys | 🔄 API key scaffolding exists; access control is JWT for now. |

## Missing / next up
- Wire the frontend to live API data (currently UI uses static mock data).
- Replace the placeholder worker logic with real market data ingestion for equities and FX.
- Add UI workflows for account groups, recurring transactions, and asset price refresh triggers.

## Quick start (Docker)

```bash
# from repo root
cp .env.example .env

# If you see buildx plugin errors, disable BuildKit:
DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0 docker-compose up --build
```

Services will be available at:
- Frontend: http://localhost:8888
- API: http://localhost:8889
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

## CSV import/export

The API supports exporting filtered transactions and importing CSV uploads.

### Export

`GET /api/transactions/export`

Query parameters:
- `start` and `end`: date range filters in `YYYY-MM-DD` format.
- `account_id`: optional account UUID to scope the export.

The response is a `text/csv` attachment with the following columns:
`account_id, amount, currency_code, transaction_type, description, occurred_at`.

### Import

`POST /api/transactions/import` expects a `multipart/form-data` payload with:
- `file`: the CSV upload.
- `mapping`: JSON string defining which CSV columns map to each field.

Mapping JSON example:

```json
{
  "mapping": {
    "account_id": "Account ID",
    "amount": "Amount",
    "currency_code": "Currency",
    "transaction_type": "Type",
    "description": "Memo",
    "occurred_at": "Occurred At"
  }
}
```

Supported datetime formats for `occurred_at` are RFC3339 timestamps (e.g. `2026-04-18T12:00:00Z`)
or `YYYY-MM-DD` dates.

Example CSV:

```csv
Account ID,Amount,Currency,Type,Memo,Occurred At
5d7a7b2e-4e5b-4d1a-9d2a-2dbedc08d7c1,2400,USD,Income,April salary,2026-04-18
5d7a7b2e-4e5b-4d1a-9d2a-2dbedc08d7c1,-320,USD,Expense,Rent,2026-04-20T09:00:00Z
```
