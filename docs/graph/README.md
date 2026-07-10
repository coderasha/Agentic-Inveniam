# GAIN Knowledge Graph

## Status

Implemented in `@gain/platform-api` under `/api/v1/graph` (port **3003**).

Postgres stores a heterogeneous property graph. Neo4j is **not** wired yet; this module is the production graph store and projection layer until a Neo4j adapter is added behind the same API.

## Capabilities

| Capability | Detail |
|------------|--------|
| Nodes | Kinds: twin, document, asset, organization, user, workflow, claim, external, custom |
| Edges | Typed relationships with source provenance (`manual`, `twin_relationship`, `document_link`, `asset_twin`, `inferred`) |
| Sync | Projects Digital Twin relationships, Document links, and Asset↔Twin bridges into graph nodes/edges |
| Traverse | BFS neighborhood (depth 1–5) and org subgraph export |
| Events | Outbox → Kafka topics `gain.graph.*` |
| Console | `/graph` — sync, visualize, create custom nodes/edges, neighborhood focus |

## APIs

OpenAPI: http://localhost:3003/api/docs

- `POST /graph/sync`
- `GET /graph/stats`
- `GET /graph/subgraph`
- `GET /graph/neighborhood?nodeId=&depth=&direction=`
- `POST|GET|PATCH|DELETE /graph/nodes…`
- `POST|GET|DELETE /graph/edges…`

Permissions: `graph:node:*`, `graph:edge:*`, `graph:sync`, `graph:traverse`.

## Design notes

- Does **not** duplicate twin relationship storage — sync reads `twin_relationships` / `document_links` / `registered_assets.twin_id`.
- Manual nodes/edges are first-class for claims and analyst annotations.
- Soft-delete on nodes cascades soft-delete to incident edges.

## Not claimed

Data Provenance and Trust Engine are separate modules. Neo4j production cluster and GraphQL federation are not wired.
