# GAIN Compliance

## Status

Implemented in `@gain/platform-api` under `/api/v1/compliance` (port **3003**).

## Capabilities

| Capability | Detail |
|------------|--------|
| Policies | Named rule sets scoped to a subject type |
| Rule types | `required_field`, `min_trust_score`, `min_provenance_verified`, `forbidden_status`, `required_tag` |
| Checks | Deterministic evaluation against a subject snapshot |
| Findings | Severity-ranked rule failures with open/accepted/remediated/waived |
| Cases | Remediation workflow linked to a check |
| Events | Outbox → `gain.compliance.*` |
| Console | `/compliance` |

## Honest limits

- Not a full RegTech platform (no OFAC screening, regulator filings, or evidence vault automation)
- Caller supplies `subjectSnapshot` — auto-hydration from twins/docs/trust can be wired later
- High/critical findings → check `failed`; medium/low only → `warning`

## APIs

OpenAPI: http://localhost:3003/api/docs

- `POST|GET|PATCH /compliance/policies…`
- `POST|GET /compliance/checks…`
- `GET|PATCH /compliance/findings…`
- `POST|GET|PATCH /compliance/cases…`
