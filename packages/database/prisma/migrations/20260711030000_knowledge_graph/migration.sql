-- CreateEnum
CREATE TYPE "GraphNodeKind" AS ENUM ('twin', 'document', 'asset', 'organization', 'user', 'workflow', 'claim', 'external', 'custom');

-- CreateEnum
CREATE TYPE "GraphEdgeSource" AS ENUM ('manual', 'twin_relationship', 'document_link', 'asset_twin', 'inferred');

-- CreateTable
CREATE TABLE "graph_nodes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kind" "GraphNodeKind" NOT NULL,
    "label" VARCHAR(300) NOT NULL,
    "external_id" UUID,
    "properties" JSONB NOT NULL DEFAULT '{}',
    "source_system" VARCHAR(100) NOT NULL DEFAULT 'manual',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "graph_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graph_edges" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "from_node_id" UUID NOT NULL,
    "to_node_id" UUID NOT NULL,
    "relationship_type" VARCHAR(100) NOT NULL,
    "label" VARCHAR(200),
    "weight" DOUBLE PRECISION,
    "properties" JSONB NOT NULL DEFAULT '{}',
    "source" "GraphEdgeSource" NOT NULL DEFAULT 'manual',
    "source_ref" VARCHAR(200),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "graph_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graph_sync_runs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "status" VARCHAR(40) NOT NULL,
    "nodes_upserted" INTEGER NOT NULL DEFAULT 0,
    "edges_upserted" INTEGER NOT NULL DEFAULT 0,
    "details" JSONB NOT NULL DEFAULT '{}',
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "created_by_user_id" UUID,

    CONSTRAINT "graph_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "graph_nodes_organization_id_kind_idx" ON "graph_nodes"("organization_id", "kind");

-- CreateIndex
CREATE INDEX "graph_nodes_organization_id_label_idx" ON "graph_nodes"("organization_id", "label");

-- CreateIndex
CREATE INDEX "graph_nodes_deleted_at_idx" ON "graph_nodes"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "graph_nodes_organization_id_kind_external_id_key" ON "graph_nodes"("organization_id", "kind", "external_id");

-- CreateIndex
CREATE INDEX "graph_edges_organization_id_relationship_type_idx" ON "graph_edges"("organization_id", "relationship_type");

-- CreateIndex
CREATE INDEX "graph_edges_from_node_id_idx" ON "graph_edges"("from_node_id");

-- CreateIndex
CREATE INDEX "graph_edges_to_node_id_idx" ON "graph_edges"("to_node_id");

-- CreateIndex
CREATE INDEX "graph_edges_source_ref_idx" ON "graph_edges"("source_ref");

-- CreateIndex
CREATE INDEX "graph_edges_deleted_at_idx" ON "graph_edges"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "graph_edges_organization_id_from_node_id_to_node_id_relationship_type_source_key" ON "graph_edges"("organization_id", "from_node_id", "to_node_id", "relationship_type", "source");

-- CreateIndex
CREATE INDEX "graph_sync_runs_organization_id_started_at_idx" ON "graph_sync_runs"("organization_id", "started_at");

-- AddForeignKey
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_from_node_id_fkey" FOREIGN KEY ("from_node_id") REFERENCES "graph_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_to_node_id_fkey" FOREIGN KEY ("to_node_id") REFERENCES "graph_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
