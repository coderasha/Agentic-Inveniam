# GAIN Platform Domains (Documents, Assets, Workflows, Notifications)

## Status

Implemented in `@gain/platform-api` (port **3003**) with real Prisma models, Nest modules, auth, and console pages.

| Domain | Capabilities |
|--------|----------------|
| Documents | Metadata create, content upload endpoint, versions, links, local filesystem storage adapter, soft delete |
| Asset Registry | Asset CRUD, valuations, optional twin link |
| Workflows | Definitions with steps, runs, task completion transitions |
| Notifications | In-app create + inbox + mark read |

## APIs

OpenAPI: http://localhost:3003/api/docs

## Storage

`DOCUMENT_STORAGE_ROOT` (default `./storage/documents`). S3-compatible adapter can replace the local adapter behind the same port interface later.

## Not claimed as complete platform

Still outstanding: AI Agents/Chat/Marketplace, Analytics, full Administration, OpenSearch/Qdrant/Neo4j production wiring, live Fabric/Polygon connectors.

Module docs live under `docs/` (including [Compliance](../compliance/README.md)).
