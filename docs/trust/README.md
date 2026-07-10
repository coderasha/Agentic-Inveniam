# GAIN Trust Engine

## Status

Implemented in `@gain/platform-api` under `/api/v1/trust` (port **3003**).

## Capabilities

| Capability | Detail |
|------------|--------|
| Attestations | Subject-scoped statements with confidence/weight, optional provenance link |
| Trust scores | Deterministic score from attestations + verified provenance + anchors |
| Grades | A–F thresholds |
| Anchors | Off-chain hash receipts today; non-`offchain` networks stay `pending` until a connector exists |
| Events | Outbox → `gain.trust.*` |
| Console | `/trust` |

## Scoring (honest)

`score = clamp(0.55 * attestation + 0.37 * provenance + anchorBonus + 0.08)`

- Expired/revoked attestations are ignored
- Disputed/revoked provenance penalizes the provenance component
- Anchored offchain receipts add `+0.08`; failed anchors subtract `0.05`

This is an explicit, testable policy — not a black-box ML model.

## APIs

OpenAPI: http://localhost:3003/api/docs

- `POST|GET /trust/attestations`
- `POST /trust/attestations/:id/revoke`
- `GET /trust/scores`
- `GET /trust/scores/:subjectType/:subjectId`
- `POST /trust/scores/:subjectType/:subjectId/compute`
- `POST|GET /trust/anchors`

## Not claimed

Fabric/Polygon on-chain anchoring, third-party notary networks, continuous re-scoring workers, AI-generated attestations.
