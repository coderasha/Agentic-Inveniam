# GAIN Digital Twin Engine

## 1. Functional Overview

The Digital Twin Engine gives every private asset a living, AI-augmented digital twin.

Capabilities:

- Create / update / soft-delete twins per organization
- Asset class + lifecycle stage modeling
- Structured attributes with typed values and confidence
- Twin-to-twin relationships (ownership, collateral, dependency)
- Signal ingestion (events/telemetry)
- Deterministic insight generation (summary/risk heuristics; LangGraph agents plug in later)
- Completeness scoring and publish gate (≥50%)
- Version snapshots, Redis cache, Kafka outbox events

## 2. Architecture

Microservice `@gain/twin-api` (NestJS, hexagonal):

```
presentation/   Controllers, auth guard, filters, health
application/    Twin/Attribute/Relationship/Signal/Insight services + scoring
domain/         Ports, models, errors
infrastructure/ Prisma, Redis, Kafka, JWKS/dev token verifiers, outbox relay
```

Auth: Keycloak JWT (or gated `IDENTITY_DEV_AUTH_SECRET` HS256). Permissions from JWT `permissions` claim. Org scope via `x-organization-id`.

## 3. Folder Structure

```
apps/twin-api/src/
packages/shared/src/twin/
packages/database/prisma/ (digital_twins*, twin_*)
apps/web/src/app/twins/
docs/twin/
```

## 4. Database Schema

Tables: `digital_twins`, `twin_versions`, `twin_attributes`, `twin_relationships`, `twin_signals`, `twin_insights`  
Migration: `20260711010000_digital_twin_engine`

## 5. API Design

Base: `http://localhost:3002/api/v1`

| Method | Path | Permission |
|--------|------|------------|
| POST | `/twins` | `twin:create` |
| GET | `/twins` | `twin:read` |
| GET | `/twins/:id` | `twin:read` |
| PATCH | `/twins/:id` | `twin:update` |
| DELETE | `/twins/:id` | `twin:delete` |
| POST | `/twins/:id/publish` | `twin:publish` |
| POST/GET | `/twins/:id/attributes` | update/read |
| POST/GET | `/twins/:id/relationships` | update/read |
| POST/GET | `/twins/:id/signals` | ingest/read |
| POST/GET | `/twins/:id/insights` | generate/read |

OpenAPI: `/api/docs`

## 6. UI Design

Console routes:

- `/twins` — list + create
- `/twins/[id]` — detail, publish, generate insight
- `/twins/graph` — relationship entry point

Loading / empty / error states included. Org context from Identity store.

## 7–8. Backend / Frontend Implementation

See `apps/twin-api` and `apps/web/src/app/twins`.

## 9. Smart Contracts

Not required. Twins stay off-chain; future Trust Engine may anchor hashes.

## 10. AI Integration

Current: deterministic heuristic insights from attributes + signals.  
Next: LangGraph multi-agent valuation/risk workflows with RAG over twin evidence.

## 11. Tests

```bash
pnpm --filter @gain/twin-api test
```

## 12. Deployment

Run with Identity stack. Port **3002**. Add to Compose/Helm as `twin-api` (same env pattern as identity-api).

## 13. Security

JWT verification, RBAC `twin:*`, org scoping, soft delete, no secrets in twin payloads.

## 14. Performance

Indexed org/status queries, Redis get-by-id cache (60s), async Kafka via outbox.

## 15. Documentation

This file + OpenAPI.
