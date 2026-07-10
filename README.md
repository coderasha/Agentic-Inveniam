# Global Asset Intelligence Network (GAIN)

AI-native operating system for private assets. Modules are built one domain at a time with real code — not demos.

## What exists today (verified in repo)

| Area | App / location | Port |
|------|----------------|------|
| Identity | `apps/identity-api` | 3001 |
| Digital Twin Engine | `apps/twin-api` | 3002 |
| Documents … Portfolio OS, Investor CRM | `apps/platform-api` | 3003 |
| Console | `apps/web` | 3000 |

## Not built yet

Compliance, AI Chat/Agents/Marketplace, Analytics, full Administration, OpenSearch, Qdrant, Neo4j production integration, live Fabric/Polygon connectors.

## Quick start

```bash
cp .env.example .env
docker compose -f infrastructure/docker/docker-compose.yml up -d postgres redis
pnpm install
pnpm db:generate && pnpm db:migrate:deploy && pnpm db:seed
pnpm --filter @gain/shared build
pnpm --filter @gain/identity-api dev
pnpm --filter @gain/twin-api dev
pnpm --filter @gain/platform-api dev
pnpm --filter @gain/web dev
```

Docs: [Identity](docs/identity/README.md) · [Twins](docs/twin/README.md) · [Platform](docs/platform/README.md) · [Graph](docs/graph/README.md) · [Provenance](docs/provenance/README.md) · [Trust](docs/trust/README.md) · [Valuation](docs/valuation/README.md) · [Tokenization](docs/tokenization/README.md) · [Marketplace](docs/marketplace/README.md) · [Portfolio](docs/portfolio/README.md) · [CRM](docs/crm/README.md)
