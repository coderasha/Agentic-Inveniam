# Global Asset Intelligence Network (GAIN)

AI-native operating system for every private asset.

This repository currently ships the **Identity** module as a production-ready foundation. Additional modules will be implemented one at a time to completion.

## Monorepo layout

```
apps/
  identity-api/     NestJS Identity microservice (hexagonal)
  web/              Next.js Identity console
packages/
  shared/           Zod contracts, permissions, Kafka topics
  database/         Prisma schema + migrations + seed
  tsconfig/         Shared TypeScript configs
infrastructure/
  docker/           Compose + Dockerfiles
  keycloak/         Realm import
  helm/identity/    Kubernetes chart
docs/identity/      Module documentation
```

## Prerequisites

- Node.js 22+
- pnpm 10+
- Docker / Docker Compose

## Quick start

```bash
cp .env.example .env
docker compose -f infrastructure/docker/docker-compose.yml up -d postgres redis kafka zookeeper keycloak
pnpm install
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
pnpm --filter @gain/shared build
pnpm --filter @gain/identity-api dev
pnpm --filter @gain/web dev
```

- Identity API: http://localhost:3001/api/docs
- Web console: http://localhost:3000
- Keycloak: http://localhost:8080 (admin / admin)
- Seeded user: `admin@gain.network` / `GainAdmin!2026`

## Identity module status

Completed end-to-end:

- Organizations, Users, Memberships
- RBAC roles + permission catalog
- ABAC policies
- Invitations (tokenized)
- API keys (hashed secrets)
- Audit log
- Transactional outbox → Kafka
- Keycloak OIDC JWT + API key auth
- Redis caching
- OpenAPI, health checks, rate limiting, Helm, CI

See [docs/identity/README.md](docs/identity/README.md) for the full module specification.
