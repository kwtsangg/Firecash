# Firecash roadmap

This roadmap captures the next steps to move Firecash from a template into a production-grade, user-friendly money manager for individuals. It prioritizes trust, clarity, and delightful day-to-day usage.

## Current stage (based on code today)
- Backend APIs for accounts, account groups, assets, transactions, recurring transactions, and metrics are in place.
- Frontend UI exists with charts, KPIs, and filters, but it is still wired to mock data.
- Worker scaffolding exists, but market price and FX ingestion are not yet connected.
- Data model supports multi-currency and price history, but import/reconciliation tooling is missing.

## Now (foundation)
- ✅ Create accounts, account groups, and transactions from the UI (API-backed).
- ✅ Use real-time defaults (current dates/ranges) for dashboards and transaction entry.
- Solidify information architecture: clear navigation, breadcrumbs, and consistent page titles.
- Establish accessibility baselines (contrast, keyboard navigation, focus states).
- Standardize empty states and loading patterns so users always know what to do next.
- Replace mock UI data with live API integrations, including loading/error states and optimistic updates.
- Implement core management flows in the UI (account groups, recurring transactions, asset price refresh).

## Next (core money management)
- Budgets by category (monthly/weekly), including alerts when thresholds are exceeded.
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
- Notification center (email/in-app) for large transactions or budget overages.
- Live market data ingestion for assets and FX (scheduled fetch, rate limiting, retries).

## Later (trust + collaboration)
- Data backup/restore and versioned exports (JSON/CSV).
- Security hardening: audit log, SSO-ready auth layer, rate limiting, and monitoring.
- Household sharing with permission roles (view-only, edit, admin).
- Mobile-first responsive UX and offline-friendly views.
- Data privacy controls (PII redaction in exports, configurable retention).

## Long-term (ecosystem + polish)
- API keys and read-only access tokens for integrations.
- Asset performance tracking with refresh scheduling and price sources.
- Integrations: bank sync partners, payroll, and popular budgeting tools.
- Theming, localization, and accessibility certification.
- Community contributions guide, public roadmap voting, and plugin architecture.
