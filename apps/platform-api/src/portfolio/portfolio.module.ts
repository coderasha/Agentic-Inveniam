import {
  Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@gain/database';
import { PORTFOLIO_KAFKA_TOPICS, type DomainEvent } from '@gain/shared';
import { v4 as uuidv4 } from 'uuid';
import { AuthorizationService, CurrentPrincipal, type Principal } from '../common/auth';
import { ConflictError, NotFoundError, ValidationError } from '../common/errors';
import { OutboxService, PrismaService } from '../infrastructure/services';
import { computePortfolioNav, resolveMarketValueMinor } from './nav';

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;
const serialize = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value, (_, item) => {
    if (typeof item === 'bigint') {
      return item <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(item) : item.toString();
    }
    if (item instanceof Prisma.Decimal) return item.toString();
    return item;
  })) as T;

@Injectable()
export class PortfolioService {
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

  private parseMoney(raw: unknown, field: string, allowZero = true): bigint {
    if (typeof raw !== 'string' && typeof raw !== 'number') {
      throw new ValidationError(`${field} must be an integer string`);
    }
    const text = String(raw);
    if (!/^\d+$/.test(text)) throw new ValidationError(`${field} must be a non-negative integer`);
    const value = BigInt(text);
    if (!allowZero && value <= 0n) throw new ValidationError(`${field} must be positive`);
    return value;
  }

  async create(input: Record<string, unknown>, p: Principal) {
    if (typeof input.name !== 'string' || typeof input.slug !== 'string') {
      throw new ValidationError('name and slug are required');
    }
    const portfolio = await this.db.portfolio.create({
      data: {
        organizationId: this.orgId(p),
        name: input.name,
        slug: input.slug,
        description: input.description as string | undefined,
        baseCurrency: (input.baseCurrency as string | undefined) ?? 'USD',
        status: 'active',
        metadata: json(input.metadata ?? {}),
      },
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('Portfolio slug already exists');
      }
      throw error;
    });
    await this.emit(
      p, PORTFOLIO_KAFKA_TOPICS.CREATED, 'portfolio.created',
      'portfolio', portfolio.id, { portfolioId: portfolio.id, slug: portfolio.slug },
    );
    return serialize(portfolio);
  }

  async list(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.PortfolioWhereInput = {
      organizationId: this.orgId(p),
      deletedAt: null,
      status: query.status as never,
    };
    const [items, total] = await this.db.$transaction([
      this.db.portfolio.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { updatedAt: 'desc' },
      }),
      this.db.portfolio.count({ where }),
    ]);
    return serialize({ items, total, page, pageSize });
  }

  async get(id: string, p: Principal) {
    const portfolio = await this.db.portfolio.findFirst({
      where: { id, organizationId: this.orgId(p), deletedAt: null },
      include: { positions: { where: { deletedAt: null }, orderBy: { updatedAt: 'desc' } } },
    });
    if (!portfolio) throw new NotFoundError('Portfolio', id);
    return serialize(portfolio);
  }

  async update(id: string, input: Record<string, unknown>, p: Principal) {
    await this.get(id, p);
    const version = Number(input.version);
    if (!Number.isInteger(version)) throw new ValidationError('version is required');
    const data: Prisma.PortfolioUpdateManyMutationInput = { version: { increment: 1 } };
    if (typeof input.name === 'string') data.name = input.name;
    if (typeof input.description === 'string' || input.description === null) {
      data.description = input.description as string | null;
    }
    if (typeof input.status === 'string') data.status = input.status as never;
    if (typeof input.baseCurrency === 'string') data.baseCurrency = input.baseCurrency;
    if ('metadata' in input) data.metadata = json(input.metadata);
    const result = await this.db.portfolio.updateMany({
      where: { id, organizationId: this.orgId(p), deletedAt: null, version },
      data,
    });
    if (result.count === 0) throw new ConflictError('Portfolio version is stale');
    const updated = await this.get(id, p);
    await this.emit(
      p, PORTFOLIO_KAFKA_TOPICS.UPDATED, 'portfolio.updated',
      'portfolio', id, { portfolioId: id },
    );
    return updated;
  }

  async remove(id: string, p: Principal): Promise<void> {
    await this.get(id, p);
    await this.db.portfolio.update({ where: { id }, data: { deletedAt: new Date(), status: 'archived' } });
  }

  async upsertPosition(portfolioId: string, input: Record<string, unknown>, p: Principal) {
    await this.get(portfolioId, p);
    if (typeof input.subjectType !== 'string' || typeof input.subjectId !== 'string'
      || typeof input.label !== 'string' || input.quantity == null) {
      throw new ValidationError('subjectType, subjectId, label and quantity are required');
    }
    const quantity = new Prisma.Decimal(String(input.quantity));
    const costBasisMinor = this.parseMoney(input.costBasisMinor ?? '0', 'costBasisMinor');
    let latestAssetValuation: bigint | null = null;
    if (input.subjectType === 'asset') {
      const valuation = await this.db.assetValuation.findFirst({
        where: { assetId: input.subjectId, organizationId: this.orgId(p) },
        orderBy: { asOfDate: 'desc' },
      });
      latestAssetValuation = valuation?.amountMinor ?? null;
    }
    const marketValueMinor = resolveMarketValueMinor({
      marketValueMinor: input.marketValueMinor != null
        ? this.parseMoney(input.marketValueMinor, 'marketValueMinor')
        : null,
      costBasisMinor,
      latestAssetValuationMinor: latestAssetValuation,
    });

    const existing = await this.db.portfolioPosition.findFirst({
      where: {
        portfolioId,
        subjectType: input.subjectType as never,
        subjectId: input.subjectId,
      },
    });

    const position = existing
      ? await this.db.portfolioPosition.update({
        where: { id: existing.id },
        data: {
          label: input.label,
          quantity,
          costBasisMinor,
          marketValueMinor,
          weightHint: typeof input.weightHint === 'number' ? input.weightHint : undefined,
          metadata: json(input.metadata ?? {}),
          deletedAt: null,
        },
      })
      : await this.db.portfolioPosition.create({
        data: {
          organizationId: this.orgId(p),
          portfolioId,
          subjectType: input.subjectType as never,
          subjectId: input.subjectId,
          label: input.label,
          quantity,
          costBasisMinor,
          marketValueMinor,
          weightHint: typeof input.weightHint === 'number' ? input.weightHint : undefined,
          metadata: json(input.metadata ?? {}),
        },
      });

    await this.emit(
      p, PORTFOLIO_KAFKA_TOPICS.POSITION_UPSERTED, 'portfolio.position.upserted',
      'portfolio_position', position.id, { portfolioId, positionId: position.id },
    );
    return serialize(position);
  }

  async removePosition(portfolioId: string, positionId: string, p: Principal): Promise<void> {
    await this.get(portfolioId, p);
    const position = await this.db.portfolioPosition.findFirst({
      where: { id: positionId, portfolioId, organizationId: this.orgId(p), deletedAt: null },
    });
    if (!position) throw new NotFoundError('PortfolioPosition', positionId);
    await this.db.portfolioPosition.update({
      where: { id: positionId },
      data: { deletedAt: new Date() },
    });
  }

  async nav(portfolioId: string, p: Principal) {
    const portfolio = await this.get(portfolioId, p);
    const positions = (portfolio.positions as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      label: String(row.label),
      subjectType: String(row.subjectType),
      quantity: Number(row.quantity),
      costBasisMinor: BigInt(String(row.costBasisMinor ?? 0)),
      marketValueMinor: BigInt(String(row.marketValueMinor ?? 0)),
    }));
    return serialize({
      portfolioId,
      baseCurrency: portfolio.baseCurrency,
      ...computePortfolioNav(positions),
    });
  }

  async createSnapshot(portfolioId: string, p: Principal, input: Record<string, unknown> = {}) {
    const portfolio = await this.db.portfolio.findFirst({
      where: { id: portfolioId, organizationId: this.orgId(p), deletedAt: null },
      include: { positions: { where: { deletedAt: null } } },
    });
    if (!portfolio) throw new NotFoundError('Portfolio', portfolioId);

    const nav = computePortfolioNav(
      portfolio.positions.map((row) => ({
        id: row.id,
        label: row.label,
        subjectType: row.subjectType,
        quantity: Number(row.quantity),
        costBasisMinor: row.costBasisMinor,
        marketValueMinor: row.marketValueMinor,
      })),
    );
    const asOfDate = input.asOfDate ? new Date(input.asOfDate as string) : new Date();
    const snapshot = await this.db.portfolioSnapshot.create({
      data: {
        organizationId: this.orgId(p),
        portfolioId,
        asOfDate,
        baseCurrency: portfolio.baseCurrency,
        navMinor: nav.navMinor,
        costBasisMinor: nav.costBasisMinor,
        unrealizedPnlMinor: nav.unrealizedPnlMinor,
        positionCount: nav.positionCount,
        breakdown: json({
          weights: nav.weights.map((w) => ({
            ...w,
            marketValueMinor: w.marketValueMinor.toString(),
          })),
        }),
        createdByUserId: p.userId,
      },
    });
    await this.emit(
      p, PORTFOLIO_KAFKA_TOPICS.SNAPSHOT_CREATED, 'portfolio.snapshot.created',
      'portfolio_snapshot', snapshot.id, {
        portfolioId,
        navMinor: snapshot.navMinor.toString(),
      },
    );
    return serialize(snapshot);
  }

  async listSnapshots(portfolioId: string, p: Principal, query: Record<string, string | undefined>) {
    await this.get(portfolioId, p);
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where = { portfolioId, organizationId: this.orgId(p) };
    const [items, total] = await this.db.$transaction([
      this.db.portfolioSnapshot.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { asOfDate: 'desc' },
      }),
      this.db.portfolioSnapshot.count({ where }),
    ]);
    return serialize({ items, total, page, pageSize });
  }
}

@ApiTags('Portfolio OS')
@ApiBearerAuth()
@Controller({ path: 'portfolios', version: '1' })
export class PortfolioController {
  constructor(
    private readonly service: PortfolioService,
    private readonly auth: AuthorizationService,
  ) {}

  @Post()
  create(@Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'portfolio:create');
    return this.service.create(body, p);
  }

  @Get()
  list(@Query() query: Record<string, string | undefined>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'portfolio:read');
    return this.service.list(p, query);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'portfolio:read');
    return this.service.get(id, p);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'portfolio:update');
    return this.service.update(id, body, p);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'portfolio:delete');
    return this.service.remove(id, p);
  }

  @Post(':id/positions')
  upsertPosition(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'portfolio:position:manage');
    return this.service.upsertPosition(id, body, p);
  }

  @Delete(':id/positions/:positionId')
  removePosition(
    @Param('id') id: string,
    @Param('positionId') positionId: string,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'portfolio:position:manage');
    return this.service.removePosition(id, positionId, p);
  }

  @Get(':id/nav')
  nav(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'portfolio:nav:read');
    return this.service.nav(id, p);
  }

  @Post(':id/snapshots')
  createSnapshot(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'portfolio:snapshot:create');
    return this.service.createSnapshot(id, p, body);
  }

  @Get(':id/snapshots')
  listSnapshots(
    @Param('id') id: string,
    @Query() query: Record<string, string | undefined>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'portfolio:snapshot:read');
    return this.service.listSnapshots(id, p, query);
  }
}

@Module({
  controllers: [PortfolioController],
  providers: [PortfolioService],
})
export class PortfolioModule {}
