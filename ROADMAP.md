# Firecash roadmap

This roadmap captures the next steps to move Firecash from a template into a production-grade, user-friendly money manager for individuals. It prioritizes trust, clarity, and delightful day-to-day usage.

## Current stage (based on code today)
- Backend APIs for accounts, account groups, assets, transactions, recurring transactions, and metrics are in place.
- Frontend UI uses live API data for dashboard, accounts, transactions, stocks, and settings, while reports remain a placeholder.
- Worker scaffolding exists, but market price and FX ingestion are not yet connected.
- Data model supports multi-currency and price history, but import/reconciliation tooling is missing.

## Now (foundation)
- ✅ Create accounts, account groups, and transactions from the UI (API-backed).
- ✅ Use real-time defaults (current dates/ranges) for dashboards and transaction entry.
- Solidify information architecture: clear navigation, breadcrumbs, and consistent page titles.
- Establish accessibility baselines (contrast, keyboard navigation, focus states).
- Standardize empty states and loading patterns so users always know what to do next.
- Finish wiring remaining placeholder screens (reports, market overview) to API data.
- Implement core management flows in the UI (recurring transactions, asset price refresh).

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
- Integrations: bank sync partners, payroll, and complementary finance tools.
- Theming, localization, and accessibility certification.
- Community contributions guide, public roadmap voting, and plugin architecture.
