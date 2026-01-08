# Plugin Registry API

The plugin registry lets the community publish extensions, connectors, and data enrichers for Firecash.

## Endpoints

### List plugins

`GET /api/plugins`

Returns registered plugins, including verification status and tags.

### Register a plugin

`POST /api/plugins`

```json
{
  "name": "firecash-crypto-sync",
  "description": "Syncs crypto holdings from major exchanges.",
  "repo_url": "https://github.com/example/firecash-crypto-sync",
  "docs_url": "https://github.com/example/firecash-crypto-sync#readme",
  "version": "0.1.0",
  "tags": ["crypto", "sync"]
}
```

## Review & verification

- Plugins are visible immediately after registration.
- The core team will verify popular plugins and mark them as verified.
- Avoid submitting plugins that require end users to store secrets in plaintext.

## Recommended metadata

- Include a clear setup guide in your `docs_url`.
- Provide minimal required permissions (use read-only tokens when possible).
- List any background jobs or scheduled refresh cadence.
