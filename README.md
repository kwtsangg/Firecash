# Firecash

Firecash is a self-hosted asset tracker that combines a Rust API, a modern React dashboard, and a Postgres database. The backend tracks accounts, assets, transactions, and metrics, and a background worker refreshes recurring transactions, asset prices (Stooq), and optional FX rates (exchangerate.host). The frontend ships a polished dashboard with date-range filtering, charts, account selectors, and integrations management wired to the API.

## Features
- **Rust API (Axum + SQLx)** with JWT auth, accounts, account groups, assets, transactions, recurring transactions, metrics, and preferences.
- **React + Vite dashboard** with KPI cards, charts, stocks, market overview, reports, and settings.
- **Background worker** that posts recurring transactions and refreshes prices (Stooq) plus FX rates (exchangerate.host with `FX_ACCESS_KEY`).
- **Integrations + API tokens** for external providers, with audit logging.
- **Backup & restore** (JSON and CSV exports) from the settings UI.
- **Postgres 18** with migrations for the core schema.
- **Docker Compose** for local orchestration.

## Product goals & status

| Goal | Status |
| --- | --- |
| Track stock prices and include them in totals | ✅ Asset prices are stored in `price_history` and included in totals. |
| Log periodic income/expense | ✅ Recurring transactions can be scheduled via API. |
| Modern UI with charts and date-range filtering | ✅ Dashboard, stocks, and reports include charts and filters. |
| Multiple accounts with grouping | ✅ Accounts and account groups supported in API. |
| Multi-currency support | ✅ Currency codes are stored per account/transaction/asset, totals include currency breakdowns (FX refresh optional). |
| Daily expense tracking views | 🔄 Transactions are captured, but daily-focused insights are still missing. |
| Benchmark portfolio vs S&P 500 | 🔄 Asset performance uses a composite benchmark, SPX comparison is not wired yet. |
| REST API for database-backed truth + API tokens | ✅ JWT auth plus read-only/full API tokens are available. |

## Missing / next up
- Expand reports with richer insights (category breakdowns, trend deltas, and export flows).
- Add daily expense tracking views (today/timeline, budget vs actual, streaks).
- Build portfolio benchmark comparisons (S&P 500/SPY) and growth curves.
- Add reconciliation and import tools (CSV/OFX) for transactions.

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

## API overview

All API routes are prefixed with `/api` and require a JWT from `/api/login` (except register/login).

### Accounts
- `GET /api/accounts?limit=100&offset=0`
- `POST /api/accounts`
- `PUT /api/accounts/:id`
- `DELETE /api/accounts/:id`

### Account groups
- `GET /api/account-groups?limit=100&offset=0`
- `POST /api/account-groups`
- `PUT /api/account-groups/:id`
- `DELETE /api/account-groups/:id`

### Assets
- `GET /api/assets?limit=100&offset=0&start_date=<iso>&end_date=<iso>&account_id=<uuid>&account_group_id=<uuid>&currency_code=USD`
- `POST /api/assets`
- `PUT /api/assets/:id`
- `DELETE /api/assets/:id`

### Transactions
- `GET /api/transactions?limit=100&offset=0&start_date=<iso>&end_date=<iso>&account_id=<uuid>&account_group_id=<uuid>&transaction_type=income&currency_code=USD`
- `POST /api/transactions`
- `PUT /api/transactions/:id`
- `DELETE /api/transactions/:id`

### Recurring transactions
- `GET /api/recurring-transactions?limit=100&offset=0`
- `POST /api/recurring-transactions`
- `PUT /api/recurring-transactions/:id`
- `DELETE /api/recurring-transactions/:id`

### Metrics
- `GET /api/totals`
- `GET /api/history`
- `GET /api/fx-rates`

### Assets (market data)
- `GET /api/assets/prices`
- `GET /api/assets/performance`
- `GET /api/assets/price-status`
- `POST /api/assets/refresh-prices`
- `GET /api/assets/candles?symbol=SPY`

### Integrations
- `GET /api/integrations`
- `POST /api/integrations`
- `GET /api/integrations/catalog`
- `GET /api/integrations/:id/logs`

### Preferences & tokens
- `GET /api/preferences`
- `PUT /api/preferences`
- `GET /api/tokens`
- `POST /api/tokens`
- `POST /api/tokens/:id/revoke`

### Backups
- `GET /api/backup/export?format=json`
- `POST /api/backup/restore`

## Database migrations

Migrations live in `backend/migrations`. The API boots with `sqlx::migrate!()` and will apply them automatically when `DATABASE_URL` is reachable.

## Notes

- The worker already ingests Stooq prices and optional FX rates; set `FX_ACCESS_KEY` to enable FX refresh.
- The frontend lockfile (`frontend/package-lock.json`) is committed for reproducible installs.
