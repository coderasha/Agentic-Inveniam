# GAIN Investor CRM

## Status

Implemented in `@gain/platform-api` under `/api/v1/crm` (port **3003**).

## Capabilities

| Capability | Detail |
|------------|--------|
| Investors | Profiles with type, status, tags, owner |
| Pipeline | Stages: lead → contacted → meeting → diligence → committed → closed (+ lost) |
| Transitions | Validated forward / skip-forward / lost rules |
| Interactions | Notes, calls, meetings, emails |
| Commitments | Soft / hard / funded / cancelled amounts, optional portfolio link |
| Pipeline summary | Stage counts + commitment totals |
| Events | Outbox → `gain.crm.*` |
| Console | `/crm` |

## Honest limits

- Not an LP portal, capital-call engine, or KYC/AML suite
- No email sync / calendar integration
- Commitment amounts are CRM records — they do not auto-create portfolio positions

## APIs

OpenAPI: http://localhost:3003/api/docs

- `GET /crm/pipeline`
- `POST|GET|PATCH|DELETE /crm/investors…`
- `POST|GET /crm/interactions`
- `POST|GET|PATCH /crm/commitments…`
