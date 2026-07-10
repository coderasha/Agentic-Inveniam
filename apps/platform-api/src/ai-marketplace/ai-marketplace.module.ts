import {
  Body, Controller, Get, Injectable, Module, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@gain/database';
import { AI_MARKETPLACE_KAFKA_TOPICS, type DomainEvent } from '@gain/shared';
import { v4 as uuidv4 } from 'uuid';
import { AuthorizationService, CurrentPrincipal, type Principal } from '../common/auth';
import { ConflictError, NotFoundError, ValidationError } from '../common/errors';
import { OutboxService, PrismaService } from '../infrastructure/services';
import {
  evaluateInstallEntitlement,
  nextMonthlyPeriodEnd,
} from './entitlement';

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, item) => (
    typeof item === 'bigint'
      ? (item <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(item) : item.toString())
      : item
  ))) as T;
}

function parseNonNegativeInt(raw: unknown, field: string): bigint {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) return BigInt(raw);
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return BigInt(raw);
  throw new ValidationError(`${field} must be a non-negative integer string`);
}

function parseTools(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new ValidationError('tools must be an array of strings');
  return raw.map((item, index) => {
    if (typeof item !== 'string' || item.trim().length === 0) {
      throw new ValidationError(`tools[${index}] must be a non-empty string`);
    }
    return item.trim();
  });
}

@Injectable()
export class AiMarketplaceService {
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

  async createListing(input: Record<string, unknown>, p: Principal) {
    const organizationId = this.orgId(p);
    if (typeof input.name !== 'string' || typeof input.slug !== 'string'
      || typeof input.summary !== 'string') {
      throw new ValidationError('name, slug and summary are required');
    }

    let systemPrompt = typeof input.systemPrompt === 'string' ? input.systemPrompt : '';
    let provider: 'heuristic' | 'openai' = 'heuristic';
    let model = 'gain-heuristic-v1';
    let tools: string[] = [];
    let sourceAgentId: string | undefined;

    if (typeof input.sourceAgentId === 'string') {
      const agent = await this.db.aiAgent.findFirst({
        where: {
          id: input.sourceAgentId,
          organizationId,
          deletedAt: null,
        },
      });
      if (!agent) throw new NotFoundError('AiAgent', input.sourceAgentId);
      sourceAgentId = agent.id;
      systemPrompt = agent.systemPrompt;
      provider = agent.provider as 'heuristic' | 'openai';
      model = agent.model;
      tools = parseTools(agent.tools);
    } else if (!systemPrompt) {
      throw new ValidationError('systemPrompt is required when sourceAgentId is omitted');
    } else {
      provider = (input.provider as 'heuristic' | 'openai' | undefined) ?? 'heuristic';
      if (provider !== 'heuristic' && provider !== 'openai') {
        throw new ValidationError('provider must be heuristic or openai');
      }
      model = typeof input.model === 'string' ? input.model : model;
      tools = parseTools(input.tools);
    }

    const pricingModel = (input.pricingModel as string | undefined) ?? 'free';
    if (!['free', 'per_run', 'monthly'].includes(pricingModel)) {
      throw new ValidationError('pricingModel must be free, per_run, or monthly');
    }
    const category = (input.category as string | undefined) ?? 'general';
    const priceMinor = parseNonNegativeInt(input.priceMinor ?? '0', 'priceMinor');
    const includedRuns = Number(input.includedRuns ?? 0);
    if (!Number.isInteger(includedRuns) || includedRuns < 0) {
      throw new ValidationError('includedRuns must be a non-negative integer');
    }
    if (pricingModel === 'free' && priceMinor !== 0n) {
      throw new ValidationError('free listings must have priceMinor=0');
    }
    if (pricingModel !== 'free' && priceMinor <= 0n) {
      throw new ValidationError('paid listings require priceMinor > 0');
    }

    const listing = await this.db.aiMarketplaceListing.create({
      data: {
        organizationId,
        sourceAgentId,
        name: input.name,
        slug: input.slug,
        summary: input.summary,
        description: input.description as string | undefined,
        category: category as never,
        status: 'draft',
        pricingModel: pricingModel as never,
        priceMinor,
        currencyCode: typeof input.currencyCode === 'string' ? input.currencyCode : 'USD',
        includedRuns,
        systemPrompt,
        provider,
        model,
        tools: json(tools),
        metadata: json(input.metadata ?? {}),
        createdByUserId: p.userId,
      },
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('AI marketplace listing slug already exists');
      }
      throw error;
    });

    await this.emit(
      p, AI_MARKETPLACE_KAFKA_TOPICS.LISTING_CREATED, 'ai_marketplace.listing.created',
      'ai_marketplace_listing', listing.id, { listingId: listing.id, slug: listing.slug },
    );
    return serialize(listing);
  }

  async listListings(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const organizationId = this.orgId(p);
    const catalog = query.catalog === 'true' || query.catalog === '1';

    const where: Prisma.AiMarketplaceListingWhereInput = {
      deletedAt: null,
      ...(catalog
        ? { status: 'published' }
        : {
          organizationId,
          status: query.status as never,
        }),
      category: query.category as never,
      pricingModel: query.pricingModel as never,
    };

    const [items, total] = await this.db.$transaction([
      this.db.aiMarketplaceListing.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { updatedAt: 'desc' },
      }),
      this.db.aiMarketplaceListing.count({ where }),
    ]);
    return serialize({ items, total, page, pageSize });
  }

  async getListing(id: string, p: Principal) {
    const organizationId = this.orgId(p);
    const listing = await this.db.aiMarketplaceListing.findFirst({
      where: {
        id,
        deletedAt: null,
        OR: [
          { organizationId },
          { status: 'published' },
        ],
      },
    });
    if (!listing) throw new NotFoundError('AiMarketplaceListing', id);
    return serialize(listing);
  }

  async updateListing(id: string, input: Record<string, unknown>, p: Principal) {
    const existing = await this.db.aiMarketplaceListing.findFirst({
      where: { id, organizationId: this.orgId(p), deletedAt: null },
    });
    if (!existing) throw new NotFoundError('AiMarketplaceListing', id);
    const version = Number(input.version);
    if (!Number.isInteger(version)) throw new ValidationError('version is required');

    const data: Prisma.AiMarketplaceListingUpdateManyMutationInput = {
      version: { increment: 1 },
    };
    if (typeof input.name === 'string') data.name = input.name;
    if (typeof input.summary === 'string') data.summary = input.summary;
    if (typeof input.description === 'string' || input.description === null) {
      data.description = input.description as string | null;
    }
    if (typeof input.category === 'string') data.category = input.category as never;
    if (typeof input.systemPrompt === 'string') data.systemPrompt = input.systemPrompt;
    if (typeof input.model === 'string') data.model = input.model;
    if (typeof input.provider === 'string') {
      if (input.provider !== 'heuristic' && input.provider !== 'openai') {
        throw new ValidationError('provider must be heuristic or openai');
      }
      data.provider = input.provider;
    }
    if ('tools' in input) data.tools = json(parseTools(input.tools));
    if ('metadata' in input) data.metadata = json(input.metadata ?? {});
    if (typeof input.pricingModel === 'string') {
      if (!['free', 'per_run', 'monthly'].includes(input.pricingModel)) {
        throw new ValidationError('invalid pricingModel');
      }
      data.pricingModel = input.pricingModel as never;
    }
    if ('priceMinor' in input) {
      data.priceMinor = parseNonNegativeInt(input.priceMinor, 'priceMinor');
    }
    if ('includedRuns' in input) {
      const includedRuns = Number(input.includedRuns);
      if (!Number.isInteger(includedRuns) || includedRuns < 0) {
        throw new ValidationError('includedRuns must be a non-negative integer');
      }
      data.includedRuns = includedRuns;
    }

    const result = await this.db.aiMarketplaceListing.updateMany({
      where: { id, organizationId: this.orgId(p), deletedAt: null, version },
      data,
    });
    if (result.count === 0) throw new ConflictError('AI marketplace listing version is stale');
    return this.getListing(id, p);
  }

  async publishListing(id: string, p: Principal) {
    const listing = await this.db.aiMarketplaceListing.findFirst({
      where: { id, organizationId: this.orgId(p), deletedAt: null },
    });
    if (!listing) throw new NotFoundError('AiMarketplaceListing', id);
    if (listing.status === 'archived') {
      throw new ValidationError('Cannot publish an archived listing');
    }
    const updated = await this.db.aiMarketplaceListing.update({
      where: { id },
      data: {
        status: 'published',
        publishedAt: listing.publishedAt ?? new Date(),
        version: { increment: 1 },
      },
    });
    await this.emit(
      p, AI_MARKETPLACE_KAFKA_TOPICS.LISTING_PUBLISHED, 'ai_marketplace.listing.published',
      'ai_marketplace_listing', id, { listingId: id },
    );
    return serialize(updated);
  }

  async unpublishListing(id: string, p: Principal) {
    const listing = await this.db.aiMarketplaceListing.findFirst({
      where: { id, organizationId: this.orgId(p), deletedAt: null },
    });
    if (!listing) throw new NotFoundError('AiMarketplaceListing', id);
    const updated = await this.db.aiMarketplaceListing.update({
      where: { id },
      data: { status: 'unpublished', version: { increment: 1 } },
    });
    await this.emit(
      p, AI_MARKETPLACE_KAFKA_TOPICS.LISTING_UNPUBLISHED, 'ai_marketplace.listing.unpublished',
      'ai_marketplace_listing', id, { listingId: id },
    );
    return serialize(updated);
  }

  async installListing(input: Record<string, unknown>, p: Principal) {
    if (typeof input.listingId !== 'string') {
      throw new ValidationError('listingId is required');
    }
    const organizationId = this.orgId(p);
    const listing = await this.db.aiMarketplaceListing.findFirst({
      where: { id: input.listingId, deletedAt: null, status: 'published' },
    });
    if (!listing) throw new NotFoundError('AiMarketplaceListing', input.listingId);

    const existing = await this.db.aiMarketplaceInstall.findFirst({
      where: { organizationId, listingId: listing.id },
    });
    if (existing) throw new ConflictError('Listing is already installed for this organization');

    const agentSlug = typeof input.agentSlug === 'string'
      ? input.agentSlug
      : `${listing.slug}-installed`;
    const periodStart = new Date();
    const periodEnd = listing.pricingModel === 'monthly'
      ? new Date(nextMonthlyPeriodEnd(periodStart.toISOString()))
      : null;

    const result = await this.db.$transaction(async (tx) => {
      const agent = await tx.aiAgent.create({
        data: {
          organizationId,
          name: listing.name,
          slug: agentSlug,
          description: listing.summary,
          systemPrompt: listing.systemPrompt,
          provider: listing.provider,
          model: listing.model,
          status: 'active',
          tools: listing.tools as Prisma.InputJsonValue,
          metadata: json({
            marketplaceListingId: listing.id,
            installedFromMarketplace: true,
          }),
          createdByUserId: p.userId,
        },
      }).catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictError('Installed agent slug already exists');
        }
        throw error;
      });

      const install = await tx.aiMarketplaceInstall.create({
        data: {
          organizationId,
          listingId: listing.id,
          agentId: agent.id,
          status: 'active',
          pricingModel: listing.pricingModel,
          priceMinor: listing.priceMinor,
          currencyCode: listing.currencyCode,
          includedRuns: listing.includedRuns,
          periodStart,
          periodEnd,
          metadata: json(input.metadata ?? {}),
          createdByUserId: p.userId,
        },
      });

      return { install, agent };
    });

    await this.emit(
      p, AI_MARKETPLACE_KAFKA_TOPICS.INSTALL_CREATED, 'ai_marketplace.install.created',
      'ai_marketplace_install', result.install.id, {
        installId: result.install.id,
        listingId: listing.id,
        agentId: result.agent.id,
      },
    );

    return serialize(result);
  }

  async listInstalls(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.AiMarketplaceInstallWhereInput = {
      organizationId: this.orgId(p),
      status: query.status as never,
      listingId: query.listingId,
    };
    const [items, total] = await this.db.$transaction([
      this.db.aiMarketplaceInstall.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { listing: true },
      }),
      this.db.aiMarketplaceInstall.count({ where }),
    ]);
    return serialize({ items, total, page, pageSize });
  }

  async getInstall(id: string, p: Principal) {
    const install = await this.db.aiMarketplaceInstall.findFirst({
      where: { id, organizationId: this.orgId(p) },
      include: { listing: true },
    });
    if (!install) throw new NotFoundError('AiMarketplaceInstall', id);
    return serialize(install);
  }

  async updateInstall(id: string, input: Record<string, unknown>, p: Principal) {
    await this.getInstall(id, p);
    const data: Prisma.AiMarketplaceInstallUpdateInput = {};
    if (typeof input.status === 'string') {
      if (!['active', 'suspended', 'cancelled'].includes(input.status)) {
        throw new ValidationError('status must be active, suspended, or cancelled');
      }
      data.status = input.status as never;
    }
    if ('metadata' in input) data.metadata = json(input.metadata ?? {});
    const updated = await this.db.aiMarketplaceInstall.update({
      where: { id },
      data,
      include: { listing: true },
    });
    await this.emit(
      p, AI_MARKETPLACE_KAFKA_TOPICS.INSTALL_UPDATED, 'ai_marketplace.install.updated',
      'ai_marketplace_install', id, { installId: id, status: updated.status },
    );
    return serialize(updated);
  }

  async recordUsage(input: Record<string, unknown>, p: Principal) {
    if (typeof input.installId !== 'string') {
      throw new ValidationError('installId is required');
    }
    const units = Number(input.units ?? 1);
    if (!Number.isInteger(units) || units < 1) {
      throw new ValidationError('units must be a positive integer');
    }

    const install = await this.db.aiMarketplaceInstall.findFirst({
      where: { id: input.installId, organizationId: this.orgId(p) },
    });
    if (!install) throw new NotFoundError('AiMarketplaceInstall', input.installId);

    const periodStart = install.periodStart;
    const periodEnd = install.periodEnd;
    const usedAgg = await this.db.aiMarketplaceUsageEvent.aggregate({
      where: {
        installId: install.id,
        createdAt: {
          gte: periodStart,
          ...(periodEnd ? { lt: periodEnd } : {}),
        },
      },
      _sum: { units: true },
    });
    const usedUnits = usedAgg._sum.units ?? 0;

    const decision = evaluateInstallEntitlement(
      {
        status: install.status as never,
        pricingModel: install.pricingModel as never,
        includedRuns: install.includedRuns,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd?.toISOString() ?? null,
      },
      usedUnits,
      units,
    );
    if (!decision.allowed) {
      throw new ValidationError(decision.reason ?? 'Usage not allowed');
    }

    const event = await this.db.aiMarketplaceUsageEvent.create({
      data: {
        organizationId: this.orgId(p),
        installId: install.id,
        units,
        referenceType: typeof input.referenceType === 'string' ? input.referenceType : undefined,
        referenceId: typeof input.referenceId === 'string' ? input.referenceId : undefined,
        metadata: json({
          ...(typeof input.metadata === 'object' && input.metadata
            ? input.metadata as Record<string, unknown>
            : {}),
          billableUnits: decision.billableUnits,
          remainingRuns: decision.remainingRuns,
        }),
        createdByUserId: p.userId,
      },
    });

    await this.emit(
      p, AI_MARKETPLACE_KAFKA_TOPICS.USAGE_RECORDED, 'ai_marketplace.usage.recorded',
      'ai_marketplace_install', install.id, {
        installId: install.id,
        usageEventId: event.id,
        units,
        billableUnits: decision.billableUnits,
      },
    );

    return serialize({
      event,
      entitlement: decision,
      usedUnitsBefore: usedUnits,
      usedUnitsAfter: usedUnits + units,
    });
  }

  async listUsage(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.AiMarketplaceUsageEventWhereInput = {
      organizationId: this.orgId(p),
      installId: query.installId,
    };
    const [items, total] = await this.db.$transaction([
      this.db.aiMarketplaceUsageEvent.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' },
      }),
      this.db.aiMarketplaceUsageEvent.count({ where }),
    ]);
    return serialize({ items, total, page, pageSize });
  }
}

@ApiTags('AI Marketplace')
@ApiBearerAuth()
@Controller({ path: 'ai-marketplace', version: '1' })
export class AiMarketplaceController {
  constructor(
    private readonly service: AiMarketplaceService,
    private readonly auth: AuthorizationService,
  ) {}

  @Post('listings')
  createListing(@Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'ai_marketplace:listing:create');
    return this.service.createListing(body, p);
  }

  @Get('listings')
  listListings(
    @Query() query: Record<string, string | undefined>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'ai_marketplace:listing:read');
    return this.service.listListings(p, query);
  }

  @Get('listings/:id')
  getListing(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'ai_marketplace:listing:read');
    return this.service.getListing(id, p);
  }

  @Patch('listings/:id')
  updateListing(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'ai_marketplace:listing:update');
    return this.service.updateListing(id, body, p);
  }

  @Post('listings/:id/publish')
  publishListing(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'ai_marketplace:listing:publish');
    return this.service.publishListing(id, p);
  }

  @Post('listings/:id/unpublish')
  unpublishListing(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'ai_marketplace:listing:publish');
    return this.service.unpublishListing(id, p);
  }

  @Post('installs')
  installListing(@Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'ai_marketplace:install:create');
    return this.service.installListing(body, p);
  }

  @Get('installs')
  listInstalls(
    @Query() query: Record<string, string | undefined>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'ai_marketplace:install:read');
    return this.service.listInstalls(p, query);
  }

  @Get('installs/:id')
  getInstall(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'ai_marketplace:install:read');
    return this.service.getInstall(id, p);
  }

  @Patch('installs/:id')
  updateInstall(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'ai_marketplace:install:update');
    return this.service.updateInstall(id, body, p);
  }

  @Post('usage')
  recordUsage(@Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'ai_marketplace:usage:record');
    return this.service.recordUsage(body, p);
  }

  @Get('usage')
  listUsage(
    @Query() query: Record<string, string | undefined>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'ai_marketplace:usage:read');
    return this.service.listUsage(p, query);
  }
}

@Module({
  controllers: [AiMarketplaceController],
  providers: [AiMarketplaceService],
})
export class AiMarketplaceModule {}
