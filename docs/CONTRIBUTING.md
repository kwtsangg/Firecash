# Contributing to Firecash

Thanks for helping improve Firecash! This guide outlines how to propose changes, ship fixes, and collaborate with the community.

## Quick start

1. Fork the repository and create a branch: `git checkout -b feature/your-change`.
2. Install dependencies for the services you plan to touch.
3. Keep changes focused and add tests where possible.
4. Open a pull request with a clear summary and screenshots for UI updates.

## Workflow expectations

- **Issue first**: For large changes, open an issue or discussion before investing time.
- **Small PRs**: Keep pull requests limited to one scope or feature.
- **Accessible UI**: Ensure new UI has labels, helpful helper text, and keyboard support.
- **Security**: Never commit secrets. Use `.env` for local secrets.

## Backend changes

- Run database migrations with `sqlx::migrate!` by starting the API locally.
- Document new endpoints in `docs/` when adding integration or plugin APIs.
- Emit audit logs for security-sensitive actions (tokens, admin operations).

## Frontend changes

- Match the existing component patterns and styles.
- Add screenshots for notable visual updates.
- Confirm responsive layout on mobile widths.

## Community standards

- Be respectful and assume positive intent.
- Provide actionable feedback and clear reproduction steps for bugs.
- Moderators may close issues that do not follow the code of conduct.
