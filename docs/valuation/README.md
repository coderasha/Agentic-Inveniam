# GAIN Continuous Valuation

## Status

Implemented in `@gain/platform-api` under `/api/v1/valuations` (port **3003**).

## Capabilities

| Capability | Detail |
|------------|--------|
| Models | Named reusable methodologies with parameters |
| Runs | Queued → running → completed/failed (executed synchronously today) |
| Engines | `income`, `dcf`, `market_comps`, `nav`, `cost`, `hybrid`, `manual`, `external` |
| Asset bridge | Completed asset-subject runs also write `asset_valuations` snapshots |
| Events | Outbox → `gain.valuation.*` |
| Console | `/valuations` |

## Honest limits

- No live market-data providers
- No async worker / cron continuous revaluation loop yet (API is re-runnable on demand)
- Hybrid recursively invokes child methodologies using the same inputs

## APIs

OpenAPI: http://localhost:3003/api/docs

- `POST|GET|PATCH /valuations/models…`
- `POST|GET /valuations/runs…`
- `POST /valuations/runs/:id/cancel`
