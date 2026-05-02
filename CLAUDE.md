# Attest

Identity resolution and trust layer for agent commerce.

## Architecture

Monorepo with npm workspaces:

- `packages/server` — Hono verification API (main service)
- `packages/sdk` — Agent-side SDK + merchant middleware
- `packages/mcp-adapter` — Claude MCP server for attestation
- `packages/shopify-app` — Shopify embedded admin (Remix + Polaris)
- `packages/consent-portal` — Consumer permissions UI (Remix + Tailwind)
- `packages/spec` — Attestation specification v0
- `docs/` — OpenAPI spec

## Development

```bash
npm install          # install all workspace deps
npm run dev          # start server (port 3000)
npm test             # run all tests
npx tsx packages/server/src/demo.ts  # end-to-end demo (no DB needed)
```

Server runs without DATABASE_URL (JWT-only mode, in-memory stores).
Set DATABASE_URL to a Postgres instance for full features.

## Key decisions

- ES256 (ECDSA P-256) for attestation JWTs — compact signatures, broad support
- `jose` library for all JWT operations
- Hono over Express — lighter, faster, Bun/Deno/CF Workers compatible
- `postgres` (porsager) over pg/knex — simpler, tagged template queries
- Spec v0 uses `act` claim (RFC 7519) for human principal delegation

## Testing

Tests use vitest. Server tests inject JWKS directly (no HTTP mocking needed).
No database required for unit tests.

## Deploy

Target: Render (render.yaml in repo root).
Postgres + web service. Schema at `packages/server/src/db/schema.sql`.
