# GAIN Portfolio OS

## Status

Implemented in `@gain/platform-api` under `/api/v1/portfolios` (port **3003**).

## Capabilities

| Capability | Detail |
|------------|--------|
| Portfolios | Named org-scoped books with base currency |
| Positions | Links to asset / twin / token_instrument / custom with qty, cost, mark |
| Marking | Explicit `marketValueMinor`, else latest `asset_valuations`, else cost basis |
| NAV | Deterministic aggregation + position weights |
| Snapshots | Point-in-time NAV / cost / unrealized P&L records |
| Events | Outbox → `gain.portfolio.*` |
| Console | `/portfolios` |

## Honest limits

- Not a full portfolio management system (no cash ledger, FX conversion, commitment schedules, or waterfall)
- Asset marks pull latest valuation when subject is `asset` and no explicit mark is provided
- No scheduled NAV jobs yet — snapshots are on-demand

## APIs

OpenAPI: http://localhost:3003/api/docs

- `POST|GET|PATCH|DELETE /portfolios…`
- `POST|DELETE /portfolios/:id/positions…`
- `GET /portfolios/:id/nav`
- `POST|GET /portfolios/:id/snapshots`
