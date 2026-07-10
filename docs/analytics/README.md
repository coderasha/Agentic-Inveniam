# GAIN Analytics

## Status

Implemented in `@gain/platform-api` under `/api/v1/analytics` (port **3003**).

## Capabilities

| Capability | Detail |
|------------|--------|
| Overview | Live org counts across assets, docs, portfolios, CRM, marketplace, compliance, trust, valuation, AI, workflows, provenance, graph |
| Derived KPIs | Pass/fail rates, completion rates, fill intensity, findings density |
| Series | Daily buckets (≤93 days) for supported metric keys |
| Snapshots | Persist overview + derived KPIs; compare two snapshots |
| Reports | Saved metric selections; run against live overview |
| Events | Outbox → `gain.analytics.*` |
| Console | `/analytics` |

## Honest limits

- Not a warehouse/BI product (no OLAP, dbt, scheduled ETL, or cross-tenant benchmarks)
- Series uses SQL `date_trunc` on operational tables — fine for org-scale, not petabyte analytics
- Twin counts live on twin-api and are not included in this overview yet
- No charting library / export to CSV/PDF yet

## APIs

OpenAPI: http://localhost:3003/api/docs

- `GET /analytics/overview`
- `GET /analytics/series?metric=&from=&to=`
- `POST|GET /analytics/snapshots…`
- `GET /analytics/snapshots/:currentId/compare/:previousId`
- `POST|GET|PATCH|DELETE /analytics/reports…`
- `POST /analytics/reports/:id/run`
