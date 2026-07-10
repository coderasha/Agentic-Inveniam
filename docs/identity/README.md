# GAIN Identity Module

## 1. Functional Overview

Identity is the trust root of GAIN. It owns:

- **Organizations** — multi-tenant boundaries with hierarchy, settings, soft delete, version history
- **Users** — human identities linked to Keycloak subjects (JIT provisioning supported)
- **Memberships** — user↔organization relationships with role assignments
- **Roles & Permissions** — RBAC catalog (`identity:*`) plus custom org roles
- **ABAC Policies** — attribute conditions with deny-overrides-allow evaluation
- **Invitations** — hashed single-use tokens, expiry, accept/revoke flows
- **API Keys** — machine identities; raw secret returned once, SHA-256 stored
- **Audit Log** — immutable action trail with correlation IDs
- **Sessions** — Keycloak session metadata storage model
- **Outbox** — reliable domain event publication to Kafka

## 2. Architecture

Hexagonal / Clean Architecture inside a NestJS microservice:

```
presentation/   Controllers, guards, filters, OpenAPI
application/    Use-case services, authorization
domain/         Ports, errors, auth types
infrastructure/ Prisma, Redis, Kafka, Keycloak JWKS, crypto
```

Patterns in use:

- Repository ports + Prisma adapters
- Strategy-style auth (Bearer JWT | API key)
- Outbox + relay (Saga-friendly eventual publish)
- Optimistic locking via `version`
- Soft delete + version history tables

## 3. Folder Structure

```
apps/identity-api/src/
  application/identity/
  domain/identity/
  infrastructure/{persistence,cache,messaging,auth,crypto}/
  presentation/{controllers,guards,filters,decorators}/
  config/
apps/web/src/app/identity/
packages/shared/src/identity/
packages/database/prisma/
```

## 4. Database Schema

Prisma models (PostgreSQL):

`organizations`, `organization_versions`, `users`, `user_versions`, `roles`, `memberships`, `membership_roles`, `invitations`, `invitation_roles`, `api_keys`, `api_key_roles`, `user_sessions`, `abac_policies`, `audit_logs`, `outbox_messages`

Guarantees:

- UUID PKs, FKs, indexes
- Soft delete columns where applicable
- Optimistic locking (`version`)
- Snapshot version history for orgs/users
- Secrets stored only as hashes

Migration: `packages/database/prisma/migrations/20260710120000_identity_init`

## 5. API Design

Base: `/api/v1`

| Method | Path | Auth | Permission |
|--------|------|------|------------|
| POST | `/organizations` | Bearer/API key | `identity:organization:create` |
| GET | `/organizations` | Bearer/API key | `identity:organization:read` |
| GET | `/organizations/:id` | Bearer/API key | `identity:organization:read` |
| PATCH | `/organizations/:id` | Bearer/API key | `identity:organization:update` |
| DELETE | `/organizations/:id` | Bearer/API key | `identity:organization:delete` |
| * | `/users`, `/memberships`, `/roles`, `/invitations`, `/api-keys`, `/audit-logs`, `/abac-policies` | scoped similarly | see permission catalog |
| POST | `/invitations/accept` | Public | — |
| GET | `/health`, `/health/live`, `/health/ready` | Public | — |

Headers:

- `Authorization: Bearer <access_token>` or `x-api-key: <secret>`
- `x-organization-id` — active org context
- `x-correlation-id` — request tracing

OpenAPI: `/api/docs`

Kafka topics: see `IDENTITY_KAFKA_TOPICS` in `@gain/shared`.

## 6. UI Design

Next.js Identity console (`/identity/*`):

- Organizations, Users, Roles, Invitations, API Keys, Audit
- Loading / empty / error states on every list page
- Org context selection persisted in Zustand
- Keycloak login via NextAuth
- Enterprise dark console aesthetic (IBM Plex)

## 7. Backend Implementation

NestJS 11 service with:

- Zod validation at application boundary
- Global auth guard + throttling + helmet + pino logging
- Domain errors mapped to RFC-style JSON error envelopes
- Redis cache for organization reads
- Outbox relay every 2s

## 8. Frontend Implementation

- React 19 + Next.js App Router
- TanStack Query for server state
- Zustand for org context
- Shared Zod types from `@gain/shared`

## 9. Smart Contracts

Not required for Identity. On-chain identity anchors (DID / wallet binding) are deferred to Tokenization / Trust Engine modules.

## 10. AI Integration

Identity exposes stable principal + permission context for downstream agents:

- `userId`, `organizationId`, `permissions`, `roles`, `correlationId`
- Audit events feed agent memory / compliance agents
- API keys enable agent-to-service auth without interactive OIDC

Full LangGraph agent orchestration belongs in the AI Agents module (next after Identity verification).

## 11. Tests

```bash
pnpm --filter @gain/shared test
pnpm --filter @gain/identity-api test
```

Coverage includes schema contracts, crypto hashing, RBAC/ABAC authorization.

## 12. Deployment

Local:

```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d
```

Kubernetes:

```bash
helm upgrade --install gain-identity infrastructure/helm/identity
```

CI: `.github/workflows/ci.yml`

## 13. Security

- Keycloak OIDC + JWKS verification (`jose`)
- API key SHA-256 hashing, timing-safe compare
- Invitation token hashing
- RBAC + ABAC deny overrides
- Soft delete (no hard wipe of audit)
- Secrets via env / K8s secrets (never committed)
- Helmet, CORS allowlist, rate limiting
- Pino redaction of Authorization / API keys / passwords
- OWASP-aligned input validation (Zod)

## 14. Performance

- Indexed list queries with pagination
- Redis cache for org get-by-id (60s TTL)
- Kafka async via outbox (non-blocking request path)
- Connection pooling via Prisma
- Horizontal scale via Helm HPA

## 15. Documentation

This file is the module contract. OpenAPI is the live API contract. Shared package exports are the cross-service contract.
