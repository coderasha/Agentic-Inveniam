import {
  Body, Controller, Get, Injectable, Module, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@gain/database';
import { MARKETPLACE_KAFKA_TOPICS, type DomainEvent } from '@gain/shared';
import { createHash } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { AuthorizationService, CurrentPrincipal, type Principal } from '../common/auth';
import { ConflictError, NotFoundError, ValidationError } from '../common/errors';
import { OutboxService, PrismaService } from '../infrastructure/services';
import { matchOrderAgainstListing } from './matching';

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;
const serialize = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value, (_, item) => typeof item === 'bigint'
    ? (item <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(item) : item.toString()) : item)) as T;

@Injectable()
export class MarketplaceService {
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

  private parsePositiveInt(raw: unknown, field: string): bigint {
    if (typeof raw !== 'string' && typeof raw !== 'number') {
      throw new ValidationError(`${field} must be a positive integer`);
    }
    const text = String(raw);
    if (!/^\d+$/.test(text)) throw new ValidationError(`${field} must be a positive integer`);
    const value = BigInt(text);
    if (value <= 0n) throw new ValidationError(`${field} must be positive`);
    return value;
  }

  async createListing(input: Record<string, unknown>, p: Principal) {
    if (typeof input.title !== 'string' || typeof input.sellerRef !== 'string'
      || typeof input.subjectType !== 'string' || typeof input.subjectId !== 'string') {
      throw new ValidationError('title, sellerRef, subjectType and subjectId are required');
    }
    const quantity = this.parsePositiveInt(input.quantity, 'quantity');
    const priceMinor = this.parsePositiveInt(input.priceMinor, 'priceMinor');
    const listing = await this.db.marketplaceListing.create({
      data: {
        organizationId: this.orgId(p),
        subjectType: input.subjectType as never,
        subjectId: input.subjectId,
        title: input.title,
        description: input.description as string | undefined,
        sellerRef: input.sellerRef,
        currencyCode: (input.currencyCode as string | undefined) ?? 'USD',
        priceMinor,
        quantity,
        quantityRemaining: quantity,
        status: 'open',
        expiresAt: input.expiresAt ? new Date(input.expiresAt as string) : undefined,
        metadata: json(input.metadata ?? {}),
        createdByUserId: p.userId,
      },
    });
    await this.emit(
      p, MARKETPLACE_KAFKA_TOPICS.LISTING_CREATED, 'marketplace.listing.created',
      'marketplace_listing', listing.id, { listingId: listing.id, title: listing.title },
    );
    return serialize(listing);
  }

  async listListings(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.MarketplaceListingWhereInput = {
      organizationId: this.orgId(p),
      deletedAt: null,
      status: query.status as never,
      subjectType: query.subjectType as never,
      subjectId: query.subjectId,
    };
    const [items, total] = await this.db.$transaction([
      this.db.marketplaceListing.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' },
      }),
      this.db.marketplaceListing.count({ where }),
    ]);
    return serialize({ items, total, page, pageSize });
  }

  async getListing(id: string, p: Principal) {
    const listing = await this.db.marketplaceListing.findFirst({
      where: { id, organizationId: this.orgId(p), deletedAt: null },
    });
    if (!listing) throw new NotFoundError('MarketplaceListing', id);
    return serialize(listing);
  }

  async updateListing(id: string, input: Record<string, unknown>, p: Principal) {
    await this.getListing(id, p);
    const version = Number(input.version);
    if (!Number.isInteger(version)) throw new ValidationError('version is required');
    const data: Prisma.MarketplaceListingUpdateManyMutationInput = { version: { increment: 1 } };
    if (typeof input.title === 'string') data.title = input.title;
    if (typeof input.description === 'string' || input.description === null) {
      data.description = input.description as string | null;
    }
    if ('metadata' in input) data.metadata = json(input.metadata);
    const result = await this.db.marketplaceListing.updateMany({
      where: {
        id, organizationId: this.orgId(p), deletedAt: null, version,
        status: { in: ['open', 'draft', 'partially_filled'] },
      },
      data,
    });
    if (result.count === 0) throw new ConflictError('Listing cannot be updated (stale or closed)');
    return this.getListing(id, p);
  }

  async cancelListing(id: string, p: Principal) {
    const listing = await this.db.marketplaceListing.findFirst({
      where: { id, organizationId: this.orgId(p), deletedAt: null },
    });
    if (!listing) throw new NotFoundError('MarketplaceListing', id);
    if (!['open', 'partially_filled', 'draft'].includes(listing.status)) {
      throw new ValidationError(`Cannot cancel listing in status ${listing.status}`);
    }
    const updated = await this.db.marketplaceListing.update({
      where: { id },
      data: { status: 'cancelled' },
    });
    await this.emit(
      p, MARKETPLACE_KAFKA_TOPICS.LISTING_CANCELLED, 'marketplace.listing.cancelled',
      'marketplace_listing', id, { listingId: id },
    );
    return serialize(updated);
  }

  async placeOrder(input: Record<string, unknown>, p: Principal) {
    if (typeof input.listingId !== 'string' || typeof input.buyerRef !== 'string') {
      throw new ValidationError('listingId and buyerRef are required');
    }
    const listing = await this.db.marketplaceListing.findFirst({
      where: { id: input.listingId, organizationId: this.orgId(p), deletedAt: null },
    });
    if (!listing) throw new NotFoundError('MarketplaceListing', input.listingId);

    const quantity = this.parsePositiveInt(input.quantity, 'quantity');
    const orderType = (input.orderType as 'limit' | 'market' | undefined) ?? 'limit';
    let priceMinor: bigint | null = null;
    if (orderType === 'limit') {
      if (input.priceMinor == null) throw new ValidationError('priceMinor is required for limit orders');
      priceMinor = this.parsePositiveInt(input.priceMinor, 'priceMinor');
    }

    const match = matchOrderAgainstListing(
      {
        priceMinor: listing.priceMinor,
        quantityRemaining: listing.quantityRemaining,
        status: listing.status,
        sellerRef: listing.sellerRef,
        expiresAt: listing.expiresAt?.toISOString() ?? null,
      },
      { orderType, priceMinor, quantity, buyerRef: input.buyerRef },
    );

    if (!match.accepted) {
      throw new ValidationError(match.reason ?? 'order rejected');
    }

    const order = await this.db.marketplaceOrder.create({
      data: {
        organizationId: this.orgId(p),
        listingId: listing.id,
        buyerRef: input.buyerRef,
        orderType,
        priceMinor: priceMinor ?? undefined,
        quantity,
        filledQuantity: match.orderFilledQuantity,
        status: match.orderStatus as never,
        metadata: json(input.metadata ?? {}),
        createdByUserId: p.userId,
      },
    });

    await this.emit(
      p, MARKETPLACE_KAFKA_TOPICS.ORDER_PLACED, 'marketplace.order.placed',
      'marketplace_order', order.id, { orderId: order.id, listingId: listing.id },
    );

    let trade = null;
    if (match.fill) {
      const settlementRef = `mkt:${createHash('sha256')
        .update(`${order.id}:${match.fill.quantity}:${match.fill.priceMinor}`)
        .digest('hex')
        .slice(0, 24)}`;

      const [updatedListing, createdTrade] = await this.db.$transaction([
        this.db.marketplaceListing.update({
          where: { id: listing.id },
          data: {
            quantityRemaining: match.listingQuantityRemaining,
            status: match.listingStatus as never,
          },
        }),
        this.db.marketplaceTrade.create({
          data: {
            organizationId: this.orgId(p),
            listingId: listing.id,
            orderId: order.id,
            sellerRef: listing.sellerRef,
            buyerRef: input.buyerRef,
            priceMinor: match.fill.priceMinor,
            quantity: match.fill.quantity,
            notionalMinor: match.fill.notionalMinor,
            currencyCode: listing.currencyCode,
            status: 'settled',
            settlementRef,
          },
        }),
      ]);

      trade = createdTrade;
      await this.emit(
        p, MARKETPLACE_KAFKA_TOPICS.TRADE_EXECUTED, 'marketplace.trade.executed',
        'marketplace_trade', createdTrade.id, {
          tradeId: createdTrade.id,
          listingId: listing.id,
          orderId: order.id,
          quantity: match.fill.quantity.toString(),
          priceMinor: match.fill.priceMinor.toString(),
          listingStatus: updatedListing.status,
        },
      );
    }

    return serialize({ order, trade, matchReason: match.reason ?? null });
  }

  async listOrders(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.MarketplaceOrderWhereInput = {
      organizationId: this.orgId(p),
      status: query.status as never,
      listingId: query.listingId,
    };
    const [items, total] = await this.db.$transaction([
      this.db.marketplaceOrder.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' },
      }),
      this.db.marketplaceOrder.count({ where }),
    ]);
    return serialize({ items, total, page, pageSize });
  }

  async cancelOrder(id: string, p: Principal) {
    const order = await this.db.marketplaceOrder.findFirst({
      where: { id, organizationId: this.orgId(p) },
    });
    if (!order) throw new NotFoundError('MarketplaceOrder', id);
    if (!['open', 'partially_filled'].includes(order.status)) {
      throw new ValidationError(`Cannot cancel order in status ${order.status}`);
    }
    // Only cancel unfilled remainder — filled quantity stays
    const updated = await this.db.marketplaceOrder.update({
      where: { id },
      data: { status: 'cancelled' },
    });
    await this.emit(
      p, MARKETPLACE_KAFKA_TOPICS.ORDER_CANCELLED, 'marketplace.order.cancelled',
      'marketplace_order', id, { orderId: id },
    );
    return serialize(updated);
  }

  async listTrades(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.MarketplaceTradeWhereInput = {
      organizationId: this.orgId(p),
      listingId: query.listingId,
      orderId: query.orderId,
    };
    const [items, total] = await this.db.$transaction([
      this.db.marketplaceTrade.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' },
      }),
      this.db.marketplaceTrade.count({ where }),
    ]);
    return serialize({ items, total, page, pageSize });
  }
}

@ApiTags('Marketplace')
@ApiBearerAuth()
@Controller({ path: 'marketplace', version: '1' })
export class MarketplaceController {
  constructor(
    private readonly service: MarketplaceService,
    private readonly auth: AuthorizationService,
  ) {}

  @Post('listings')
  createListing(@Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'marketplace:listing:create');
    return this.service.createListing(body, p);
  }

  @Get('listings')
  listListings(@Query() query: Record<string, string | undefined>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'marketplace:listing:read');
    return this.service.listListings(p, query);
  }

  @Get('listings/:id')
  getListing(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'marketplace:listing:read');
    return this.service.getListing(id, p);
  }

  @Patch('listings/:id')
  updateListing(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'marketplace:listing:update');
    return this.service.updateListing(id, body, p);
  }

  @Post('listings/:id/cancel')
  cancelListing(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'marketplace:listing:cancel');
    return this.service.cancelListing(id, p);
  }

  @Post('orders')
  placeOrder(@Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'marketplace:order:create');
    return this.service.placeOrder(body, p);
  }

  @Get('orders')
  listOrders(@Query() query: Record<string, string | undefined>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'marketplace:order:read');
    return this.service.listOrders(p, query);
  }

  @Post('orders/:id/cancel')
  cancelOrder(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'marketplace:order:cancel');
    return this.service.cancelOrder(id, p);
  }

  @Get('trades')
  listTrades(@Query() query: Record<string, string | undefined>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'marketplace:trade:read');
    return this.service.listTrades(p, query);
  }
}

@Module({
  controllers: [MarketplaceController],
  providers: [MarketplaceService],
})
export class MarketplaceModule {}
