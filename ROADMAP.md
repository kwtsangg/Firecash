# Firecash roadmap

This roadmap captures the next steps to move Firecash from a template into a production-grade, user-friendly money manager for individuals. It prioritizes trust, clarity, and delightful day-to-day usage.

## Current stage (based on code today)
- Backend APIs for accounts, account groups, assets, transactions, recurring transactions, and metrics are in place.
- Frontend UI uses live API data for dashboard, accounts, transactions, stocks, reports, integrations, and settings (including backups and API tokens).
- Worker runs scheduled recurring transactions plus Stooq price refreshes; FX refreshes when `FX_ACCESS_KEY` is set.
- Data model supports multi-currency, categories, merchant labels, and price history, but import/reconciliation tooling is missing.

## Now (foundation)
- ✅ Create accounts, account groups, and transactions from the UI (API-backed).
- ✅ Use real-time defaults (current dates/ranges) for dashboards and transaction entry.
- Solidify information architecture: clear navigation, breadcrumbs, and consistent page titles.
- Establish accessibility baselines (contrast, keyboard navigation, focus states).
- Standardize empty states and loading patterns so users always know what to do next.
- ✅ Wire reports and market overview screens to API data.
- Implement core management flows in the UI (recurring transactions, asset price refresh).

## Immediate tasks (bug fix + UX polish)
- **Bug fix: report snapshots truncate data beyond 100 transactions.**
  - Add a report summary endpoint (server-side aggregation) or request transactions with explicit date filters and pagination so reports remain accurate for high-volume users.
  - Ensure KPIs and last-30-day cashflow calculations match the API results.
- **Bug fix: asset performance uses a placeholder composite benchmark.**
  - Introduce an S&P 500 benchmark series (SPY candles) and compute relative return vs the benchmark for each holding and portfolio total.
- **UX upgrades for core money management flows.**
  - Add a daily expense view (today + last 7 days) with quick-add, category tags, and streak cues.
  - Provide budget vs actual progress for top categories, with color-coded deltas and drilldowns.
  - Improve transaction editing with bulk edit, inline category/merchant editing, and saved filters.

## Next (core money management)
- Transaction categories + merchant labeling, with bulk edit support and category rules.
- Import/export tools (CSV/OFX) with mapping, validation, and duplicate detection.
- Account group membership management in the UI (read + update).
- Recurring transaction creation and editing workflows (templates, skip/adjust single occurrence).
- Cashflow calendar and bill reminders (upcoming bills, due dates, alerts).
- Powerful search and filters (date, amount, category, account, merchant, tags).
- Reconciliation experience: match imported statements to ledger entries and highlight variances.

## Soon (insights + automation)
- Reports: spending by category, cashflow trends, and net worth projections.
- Savings goals and progress tracking with recommended monthly targets.
- Smart categorization: merchant-based rules + optional ML suggestions.
- Notification center (email/in-app) for large transactions.
- Harden market data ingestion for assets and FX (scheduling, rate limiting, retries, provider fallback).
- Portfolio growth curves vs S&P 500 benchmark (price normalization + time-weighted return).

## Later (trust + collaboration)
- Data backup/restore and versioned exports (JSON/CSV).
- Security hardening: audit log, SSO-ready auth layer, rate limiting, and monitoring.
- Household sharing with permission roles (view-only, edit, admin).
- Mobile-first responsive UX and offline-friendly views.
- Data privacy controls (PII redaction in exports, configurable retention).

## Long-term (ecosystem + polish)
- Scoped API tokens with fine-grained permissions + OAuth for partner integrations.
- Asset performance tracking with additional price sources and caching.
- Integrations: bank sync partners, payroll, and complementary finance tools.
- Theming, localization, and accessibility certification.
- Community contributions guide, public roadmap voting, and plugin architecture.
