# Global Asset Intelligence Network (GAIN)

AI-native operating system for every private asset.

Modules are implemented one at a time to production quality.

## Monorepo layout

```
apps/
  identity-api/     NestJS Identity microservice
  twin-api/         NestJS Digital Twin Engine
  web/              Next.js console
packages/
  shared/           Zod contracts, permissions, Kafka topics
  database/         Prisma schema + migrations + seed
  tsconfig/         Shared TypeScript configs
infrastructure/
  docker/           Compose + Dockerfiles
  keycloak/         Realm import
  helm/identity/    Kubernetes chart
docs/
  identity/         Identity module docs
  twin/             Digital Twin module docs
```

## Prerequisites

- Node.js 22+
- pnpm 10+
- Docker / Docker Compose

## Quick start

```bash
cp .env.example .env
docker compose -f infrastructure/docker/docker-compose.yml up -d postgres redis
pnpm install
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
pnpm --filter @gain/shared build
pnpm --filter @gain/identity-api dev
pnpm --filter @gain/twin-api dev
pnpm --filter @gain/web dev
```

- Identity API: http://localhost:3001/api/docs
- Twin API: http://localhost:3002/api/docs
- Web console: http://localhost:3000
- Keycloak (optional): http://localhost:8080

## Module status

| Module | Status |
|--------|--------|
| Identity | Foundation complete — see [docs/identity](docs/identity/README.md) |
| Digital Twin Engine | Implemented — see [docs/twin](docs/twin/README.md) |
| Remaining modules | Not started |
