import {
  Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@gain/database';
import { GRAPH_KAFKA_TOPICS, type DomainEvent } from '@gain/shared';
import { v4 as uuidv4 } from 'uuid';
import { AuthorizationService, CurrentPrincipal, type Principal } from '../common/auth';
import { ConflictError, NotFoundError, ValidationError } from '../common/errors';
import { OutboxService, PrismaService } from '../infrastructure/services';
import { expandNeighborhood, type GraphDirection } from './traversal';

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

@Injectable()
export class GraphService {
  constructor(
    private readonly db: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  private orgId(p: Principal): string {
    if (!p.organizationId) throw new ValidationError('x-organization-id is required');
    return p.organizationId;
  }

  private async emit(
    p: Principal,
    topic: string,
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const event: DomainEvent = {
      eventId: uuidv4(),
      eventType,
      aggregateType,
      aggregateId,
      occurredAt: new Date().toISOString(),
      correlationId: p.correlationId,
      actorUserId: p.userId,
      organizationId: this.orgId(p),
      payload,
      metadata: {},
    };
    await this.outbox.enqueue(event, topic);
  }

  async getNode(id: string, p: Principal) {
    const node = await this.db.graphNode.findFirst({
      where: { id, organizationId: this.orgId(p), deletedAt: null },
    });
    if (!node) throw new NotFoundError('GraphNode', id);
    return node;
  }

  async createNode(input: Record<string, unknown>, p: Principal) {
    const organizationId = this.orgId(p);
    if (typeof input.kind !== 'string' || typeof input.label !== 'string') {
      throw new ValidationError('kind and label are required');
    }
    const node = await this.db.graphNode.create({
      data: {
        organizationId,
        kind: input.kind as never,
        label: input.label,
        externalId: input.externalId as string | undefined,
        properties: json(input.properties ?? {}),
        sourceSystem: (input.sourceSystem as string | undefined) ?? 'manual',
      },
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('Graph node already exists for kind/externalId');
      }
      throw error;
    });
    await this.emit(
      p, GRAPH_KAFKA_TOPICS.NODE_CREATED, 'graph.node.created', 'graph_node', node.id,
      { nodeId: node.id, kind: node.kind },
    );
    return node;
  }

  async listNodes(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.GraphNodeWhereInput = {
      organizationId: this.orgId(p),
      deletedAt: null,
      kind: query.kind as never,
      ...(query.q
        ? { label: { contains: query.q, mode: 'insensitive' as const } }
        : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.graphNode.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { updatedAt: 'desc' },
      }),
      this.db.graphNode.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async updateNode(id: string, input: Record<string, unknown>, p: Principal) {
    await this.getNode(id, p);
    const version = Number(input.version);
    if (!Number.isInteger(version)) throw new ValidationError('version is required');
    const data: Prisma.GraphNodeUpdateManyMutationInput = { version: { increment: 1 } };
    if (typeof input.label === 'string') data.label = input.label;
    if ('properties' in input) data.properties = json(input.properties);
    const result = await this.db.graphNode.updateMany({
      where: { id, organizationId: this.orgId(p), deletedAt: null, version },
      data,
    });
    if (result.count === 0) throw new ConflictError('Graph node version is stale');
    const node = await this.getNode(id, p);
    await this.emit(
      p, GRAPH_KAFKA_TOPICS.NODE_UPDATED, 'graph.node.updated', 'graph_node', node.id,
      { nodeId: node.id },
    );
    return node;
  }

  async removeNode(id: string, p: Principal): Promise<void> {
    await this.getNode(id, p);
    const now = new Date();
    await this.db.$transaction([
      this.db.graphNode.update({ where: { id }, data: { deletedAt: now } }),
      this.db.graphEdge.updateMany({
        where: {
          organizationId: this.orgId(p),
          deletedAt: null,
          OR: [{ fromNodeId: id }, { toNodeId: id }],
        },
        data: { deletedAt: now },
      }),
    ]);
  }

  async createEdge(input: Record<string, unknown>, p: Principal) {
    const organizationId = this.orgId(p);
    if (typeof input.fromNodeId !== 'string' || typeof input.toNodeId !== 'string'
      || typeof input.relationshipType !== 'string') {
      throw new ValidationError('fromNodeId, toNodeId and relationshipType are required');
    }
    if (input.fromNodeId === input.toNodeId) {
      throw new ValidationError('Self-edges are not allowed');
    }
    await this.getNode(input.fromNodeId, p);
    await this.getNode(input.toNodeId, p);
    const edge = await this.db.graphEdge.create({
      data: {
        organizationId,
        fromNodeId: input.fromNodeId,
        toNodeId: input.toNodeId,
        relationshipType: input.relationshipType,
        label: input.label as string | undefined,
        weight: typeof input.weight === 'number' ? input.weight : undefined,
        properties: json(input.properties ?? {}),
        source: 'manual',
      },
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('Graph edge already exists');
      }
      throw error;
    });
    await this.emit(
      p, GRAPH_KAFKA_TOPICS.EDGE_CREATED, 'graph.edge.created', 'graph_edge', edge.id,
      { edgeId: edge.id, relationshipType: edge.relationshipType },
    );
    return edge;
  }

  async listEdges(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.GraphEdgeWhereInput = {
      organizationId: this.orgId(p),
      deletedAt: null,
      relationshipType: query.relationshipType,
      fromNodeId: query.fromNodeId,
      toNodeId: query.toNodeId,
    };
    const [items, total] = await this.db.$transaction([
      this.db.graphEdge.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' },
      }),
      this.db.graphEdge.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async removeEdge(id: string, p: Principal): Promise<void> {
    const edge = await this.db.graphEdge.findFirst({
      where: { id, organizationId: this.orgId(p), deletedAt: null },
    });
    if (!edge) throw new NotFoundError('GraphEdge', id);
    await this.db.graphEdge.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.emit(
      p, GRAPH_KAFKA_TOPICS.EDGE_DELETED, 'graph.edge.deleted', 'graph_edge', id,
      { edgeId: id },
    );
  }

  async neighborhood(p: Principal, query: Record<string, string | undefined>) {
    if (!query.nodeId) throw new ValidationError('nodeId is required');
    await this.getNode(query.nodeId, p);
    const depth = Math.max(1, Math.min(5, Number(query.depth) || 2));
    const direction = (query.direction as GraphDirection | undefined) ?? 'both';
    const edges = await this.db.graphEdge.findMany({
      where: { organizationId: this.orgId(p), deletedAt: null },
      select: { id: true, fromNodeId: true, toNodeId: true, relationshipType: true },
    });
    const expanded = expandNeighborhood(query.nodeId, edges, depth, direction);
    const [nodes, edgeRows] = await Promise.all([
      this.db.graphNode.findMany({
        where: { id: { in: expanded.nodeIds }, organizationId: this.orgId(p), deletedAt: null },
      }),
      this.db.graphEdge.findMany({
        where: { id: { in: expanded.edgeIds }, organizationId: this.orgId(p), deletedAt: null },
      }),
    ]);
    return { nodes, edges: edgeRows, depthByNodeId: expanded.depthByNodeId, rootNodeId: query.nodeId };
  }

  async subgraph(p: Principal, query: Record<string, string | undefined>) {
    const limit = Math.min(500, Math.max(1, Number(query.limit) || 200));
    const organizationId = this.orgId(p);
    const [nodes, edges] = await Promise.all([
      this.db.graphNode.findMany({
        where: { organizationId, deletedAt: null },
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      this.db.graphEdge.findMany({
        where: { organizationId, deletedAt: null },
        take: limit * 2,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { nodes, edges };
  }

  async stats(p: Principal) {
    const organizationId = this.orgId(p);
    const [nodeCount, edgeCount, byKind, lastSync] = await Promise.all([
      this.db.graphNode.count({ where: { organizationId, deletedAt: null } }),
      this.db.graphEdge.count({ where: { organizationId, deletedAt: null } }),
      this.db.graphNode.groupBy({
        by: ['kind'],
        where: { organizationId, deletedAt: null },
        _count: { _all: true },
      }),
      this.db.graphSyncRun.findFirst({
        where: { organizationId },
        orderBy: { startedAt: 'desc' },
      }),
    ]);
    return {
      nodeCount,
      edgeCount,
      byKind: Object.fromEntries(byKind.map((row) => [row.kind, row._count._all])),
      lastSync,
    };
  }

  private async upsertProjectedNode(args: {
    organizationId: string;
    kind: 'twin' | 'document' | 'asset' | 'organization' | 'user' | 'workflow';
    externalId: string;
    label: string;
    properties?: Record<string, unknown>;
    sourceSystem: string;
  }) {
    const existing = await this.db.graphNode.findFirst({
      where: {
        organizationId: args.organizationId,
        kind: args.kind,
        externalId: args.externalId,
      },
    });
    if (existing) {
      return this.db.graphNode.update({
        where: { id: existing.id },
        data: {
          label: args.label,
          properties: json(args.properties ?? {}),
          sourceSystem: args.sourceSystem,
          deletedAt: null,
          version: { increment: 1 },
        },
      });
    }
    return this.db.graphNode.create({
      data: {
        organizationId: args.organizationId,
        kind: args.kind,
        externalId: args.externalId,
        label: args.label,
        properties: json(args.properties ?? {}),
        sourceSystem: args.sourceSystem,
      },
    });
  }

  private async upsertProjectedEdge(args: {
    organizationId: string;
    fromNodeId: string;
    toNodeId: string;
    relationshipType: string;
    source: 'twin_relationship' | 'document_link' | 'asset_twin';
    sourceRef: string;
    label?: string;
    properties?: Record<string, unknown>;
  }) {
    const existing = await this.db.graphEdge.findFirst({
      where: {
        organizationId: args.organizationId,
        fromNodeId: args.fromNodeId,
        toNodeId: args.toNodeId,
        relationshipType: args.relationshipType,
        source: args.source,
      },
    });
    if (existing) {
      return this.db.graphEdge.update({
        where: { id: existing.id },
        data: {
          label: args.label,
          properties: json(args.properties ?? {}),
          sourceRef: args.sourceRef,
          deletedAt: null,
        },
      });
    }
    return this.db.graphEdge.create({
      data: {
        organizationId: args.organizationId,
        fromNodeId: args.fromNodeId,
        toNodeId: args.toNodeId,
        relationshipType: args.relationshipType,
        label: args.label,
        properties: json(args.properties ?? {}),
        source: args.source,
        sourceRef: args.sourceRef,
      },
    });
  }

  async sync(p: Principal) {
    const organizationId = this.orgId(p);
    const run = await this.db.graphSyncRun.create({
      data: {
        organizationId,
        status: 'running',
        createdByUserId: p.userId,
      },
    });

    let nodesUpserted = 0;
    let edgesUpserted = 0;
    const nodeByKey = new Map<string, string>();

    const remember = (kind: string, externalId: string, nodeId: string) => {
      nodeByKey.set(`${kind}:${externalId}`, nodeId);
    };

    const twins = await this.db.digitalTwin.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true, slug: true, assetClass: true, status: true },
    });
    for (const twin of twins) {
      const node = await this.upsertProjectedNode({
        organizationId,
        kind: 'twin',
        externalId: twin.id,
        label: twin.name,
        properties: { slug: twin.slug, assetClass: twin.assetClass, status: twin.status },
        sourceSystem: 'twin_engine',
      });
      remember('twin', twin.id, node.id);
      nodesUpserted += 1;
    }

    const documents = await this.db.document.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, title: true, category: true, status: true },
    });
    for (const doc of documents) {
      const node = await this.upsertProjectedNode({
        organizationId,
        kind: 'document',
        externalId: doc.id,
        label: doc.title,
        properties: { category: doc.category, status: doc.status },
        sourceSystem: 'document_management',
      });
      remember('document', doc.id, node.id);
      nodesUpserted += 1;
    }

    const assets = await this.db.registeredAsset.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true, slug: true, twinId: true, assetClass: true, status: true },
    });
    for (const asset of assets) {
      const node = await this.upsertProjectedNode({
        organizationId,
        kind: 'asset',
        externalId: asset.id,
        label: asset.name,
        properties: { slug: asset.slug, assetClass: asset.assetClass, status: asset.status },
        sourceSystem: 'asset_registry',
      });
      remember('asset', asset.id, node.id);
      nodesUpserted += 1;
    }

    const twinRels = await this.db.twinRelationship.findMany({
      where: { organizationId, deletedAt: null },
    });
    for (const rel of twinRels) {
      const fromNodeId = nodeByKey.get(`twin:${rel.fromTwinId}`);
      const toNodeId = nodeByKey.get(`twin:${rel.toTwinId}`);
      if (!fromNodeId || !toNodeId) continue;
      await this.upsertProjectedEdge({
        organizationId,
        fromNodeId,
        toNodeId,
        relationshipType: rel.relationshipType,
        source: 'twin_relationship',
        sourceRef: rel.id,
        label: rel.label ?? undefined,
        properties: (rel.metadata as Record<string, unknown>) ?? {},
      });
      edgesUpserted += 1;
    }

    const docLinks = await this.db.documentLink.findMany({
      where: { organizationId, deletedAt: null },
    });
    for (const link of docLinks) {
      const fromNodeId = nodeByKey.get(`document:${link.documentId}`);
      const toKey = `${link.targetType}:${link.targetId}`;
      let toNodeId = nodeByKey.get(toKey);
      if (!toNodeId && ['twin', 'asset', 'organization', 'user', 'workflow'].includes(link.targetType)) {
        const node = await this.upsertProjectedNode({
          organizationId,
          kind: link.targetType as 'twin' | 'asset' | 'organization' | 'user' | 'workflow',
          externalId: link.targetId,
          label: `${link.targetType}:${link.targetId.slice(0, 8)}`,
          properties: { projectedFrom: 'document_link' },
          sourceSystem: 'document_management',
        });
        toNodeId = node.id;
        remember(link.targetType, link.targetId, node.id);
        nodesUpserted += 1;
      }
      if (!fromNodeId || !toNodeId) continue;
      await this.upsertProjectedEdge({
        organizationId,
        fromNodeId,
        toNodeId,
        relationshipType: link.relationship,
        source: 'document_link',
        sourceRef: link.id,
      });
      edgesUpserted += 1;
    }

    for (const asset of assets) {
      if (!asset.twinId) continue;
      const fromNodeId = nodeByKey.get(`asset:${asset.id}`);
      const toNodeId = nodeByKey.get(`twin:${asset.twinId}`);
      if (!fromNodeId || !toNodeId) continue;
      await this.upsertProjectedEdge({
        organizationId,
        fromNodeId,
        toNodeId,
        relationshipType: 'represents',
        source: 'asset_twin',
        sourceRef: asset.id,
      });
      edgesUpserted += 1;
    }

    const completed = await this.db.graphSyncRun.update({
      where: { id: run.id },
      data: {
        status: 'completed',
        nodesUpserted,
        edgesUpserted,
        completedAt: new Date(),
        details: json({
          twins: twins.length,
          documents: documents.length,
          assets: assets.length,
          twinRelationships: twinRels.length,
          documentLinks: docLinks.length,
        }),
      },
    });

    await this.emit(
      p, GRAPH_KAFKA_TOPICS.SYNC_COMPLETED, 'graph.sync.completed', 'graph_sync_run', completed.id,
      { nodesUpserted, edgesUpserted },
    );

    return completed;
  }
}

@ApiTags('Knowledge Graph')
@ApiBearerAuth()
@Controller({ path: 'graph', version: '1' })
export class GraphController {
  constructor(
    private readonly service: GraphService,
    private readonly auth: AuthorizationService,
  ) {}

  @Get('stats')
  stats(@CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'graph:node:read');
    return this.service.stats(p);
  }

  @Get('subgraph')
  subgraph(@Query() query: Record<string, string | undefined>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'graph:traverse');
    return this.service.subgraph(p, query);
  }

  @Get('neighborhood')
  neighborhood(@Query() query: Record<string, string | undefined>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'graph:traverse');
    return this.service.neighborhood(p, query);
  }

  @Post('sync')
  sync(@CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'graph:sync');
    return this.service.sync(p);
  }

  @Post('nodes')
  createNode(@Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'graph:node:create');
    return this.service.createNode(body, p);
  }

  @Get('nodes')
  listNodes(@Query() query: Record<string, string | undefined>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'graph:node:read');
    return this.service.listNodes(p, query);
  }

  @Get('nodes/:id')
  getNode(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'graph:node:read');
    return this.service.getNode(id, p);
  }

  @Patch('nodes/:id')
  updateNode(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'graph:node:update');
    return this.service.updateNode(id, body, p);
  }

  @Delete('nodes/:id')
  removeNode(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'graph:node:delete');
    return this.service.removeNode(id, p);
  }

  @Post('edges')
  createEdge(@Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'graph:edge:create');
    return this.service.createEdge(body, p);
  }

  @Get('edges')
  listEdges(@Query() query: Record<string, string | undefined>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'graph:edge:read');
    return this.service.listEdges(p, query);
  }

  @Delete('edges/:id')
  removeEdge(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'graph:edge:delete');
    return this.service.removeEdge(id, p);
  }
}

@Module({
  controllers: [GraphController],
  providers: [GraphService],
})
export class GraphModule {}
