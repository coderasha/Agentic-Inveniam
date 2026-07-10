# GAIN AI Marketplace

## Status

Implemented in `@gain/platform-api` under `/api/v1/ai-marketplace` (port **3003**).

## Capabilities

| Capability | Detail |
|------------|--------|
| Listings | Draft/publish agent templates (prompt, tools, provider, pricing metadata) |
| Catalog | `?catalog=true` lists published listings across orgs (read) |
| Install | Clones listing into an org `AiAgent` + entitlement record |
| Usage | Metered units with deterministic quota/entitlement checks |
| Pricing models | `free`, `per_run`, `monthly` (informational + quota; no payments) |
| Events | Outbox → `gain.ai_marketplace.*` |
| Console | `/ai-marketplace` |

## Honest limits

- **No payment rail**, invoicing, Stripe, escrow, or revenue share
- Cross-org catalog is read/install only — publisher billing is not automated
- Usage recording is explicit via API (not auto-hooked into every agent run yet)
- Not a public app store with reviews, search ranking, or version upgrades

## APIs

OpenAPI: http://localhost:3003/api/docs

- `POST|GET|PATCH /ai-marketplace/listings…`
- `POST /ai-marketplace/listings/:id/publish|unpublish`
- `POST|GET|PATCH /ai-marketplace/installs…`
- `POST|GET /ai-marketplace/usage…`
