# GAIN Data Provenance

## Status

Implemented in `@gain/platform-api` under `/api/v1/provenance` (port **3003**).

## Capabilities

| Capability | Detail |
|------------|--------|
| Records | Subject-scoped provenance with content SHA-256 + hash chain |
| Chain integrity | Recomputes `chainHash` from previous hash + content + subject + timestamp |
| Links | `derived_from`, `supersedes`, `corroborates`, `contradicts`, `extracted_from`, `attests` |
| Lineage walk | Ancestors / descendants / both over provenance links |
| Lifecycle | `recorded` → `verified` or `revoked` |
| Events | Outbox → `gain.provenance.*` |
| Console | `/provenance` |

## APIs

OpenAPI: http://localhost:3003/api/docs

- `POST /provenance/records`
- `GET /provenance/records`
- `GET /provenance/records/:id`
- `POST /provenance/records/:id/verify`
- `POST /provenance/records/:id/revoke`
- `GET /provenance/subjects/:subjectType/:subjectId`
- `GET /provenance/subjects/:subjectType/:subjectId/chain`
- `GET /provenance/lineage/:recordId`
- `POST|GET /provenance/links`

## Not claimed

Trust scoring / attestations — see [Trust Engine](../trust/README.md). On-chain anchoring and automatic capture hooks on every document upload are still outstanding.
