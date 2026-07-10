import {
  Body, Controller, Get, Injectable, Module, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@gain/database';
import { TOKENIZATION_KAFKA_TOPICS, type DomainEvent } from '@gain/shared';
import { v4 as uuidv4 } from 'uuid';
import { AuthorizationService, CurrentPrincipal, type Principal } from '../common/auth';
import { ConflictError, NotFoundError, ValidationError } from '../common/errors';
import { OutboxService, PrismaService } from '../infrastructure/services';
import {
  applyLedgerOp,
  computeLedgerTxHash,
  settleLedgerEntry,
  type HoldingState,
  type LedgerOpType,
} from './ledger';

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;
const serialize = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value, (_, item) => typeof item === 'bigint'
    ? (item <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(item) : item.toString()) : item)) as T;

@Injectable()
export class TokenizationService {
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

  private parseAmount(raw: unknown): bigint {
    if (typeof raw !== 'string' && typeof raw !== 'number') {
      throw new ValidationError('amount must be a non-negative integer string');
    }
    const text = String(raw);
    if (!/^\d+$/.test(text)) throw new ValidationError('amount must be a non-negative integer');
    const amount = BigInt(text);
    if (amount <= 0n) throw new ValidationError('amount must be positive');
    return amount;
  }

  async getInstrument(id: string, p: Principal) {
    const row = await this.db.tokenInstrument.findFirst({
      where: { id, organizationId: this.orgId(p), deletedAt: null },
    });
    if (!row) throw new NotFoundError('TokenInstrument', id);
    return serialize(row);
  }

  async createInstrument(input: Record<string, unknown>, p: Principal) {
    if (typeof input.name !== 'string' || typeof input.symbol !== 'string'
      || typeof input.subjectType !== 'string' || typeof input.subjectId !== 'string') {
      throw new ValidationError('name, symbol, subjectType and subjectId are required');
    }
    const symbol = input.symbol.toUpperCase();
    if (!/^[A-Z0-9]{2,12}$/.test(symbol)) {
      throw new ValidationError('symbol must be 2-12 uppercase alphanumeric characters');
    }
    const network = (input.network as string | undefined) ?? 'offchain';
    const cap = input.totalSupplyCap != null ? this.parseAmount(input.totalSupplyCap) : null;
    const row = await this.db.tokenInstrument.create({
      data: {
        organizationId: this.orgId(p),
        name: input.name,
        symbol,
        subjectType: input.subjectType as never,
        subjectId: input.subjectId,
        network: network as never,
        decimals: typeof input.decimals === 'number' ? input.decimals : 0,
        totalSupplyCap: cap ?? undefined,
        status: 'active',
        contractRef: network === 'offchain' ? `offchain:${symbol.toLowerCase()}` : undefined,
        metadata: json(input.metadata ?? {}),
      },
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('Token symbol already exists in organization');
      }
      throw error;
    });
    await this.emit(
      p, TOKENIZATION_KAFKA_TOPICS.INSTRUMENT_CREATED, 'tokenization.instrument.created',
      'token_instrument', row.id, { instrumentId: row.id, symbol: row.symbol, network },
    );
    return serialize(row);
  }

  async listInstruments(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.TokenInstrumentWhereInput = {
      organizationId: this.orgId(p),
      deletedAt: null,
      status: query.status as never,
      subjectType: query.subjectType as never,
      subjectId: query.subjectId,
    };
    const [items, total] = await this.db.$transaction([
      this.db.tokenInstrument.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { updatedAt: 'desc' },
      }),
      this.db.tokenInstrument.count({ where }),
    ]);
    return serialize({ items, total, page, pageSize });
  }

  async updateInstrument(id: string, input: Record<string, unknown>, p: Principal) {
    await this.getInstrument(id, p);
    const version = Number(input.version);
    if (!Number.isInteger(version)) throw new ValidationError('version is required');
    const data: Prisma.TokenInstrumentUpdateManyMutationInput = { version: { increment: 1 } };
    if (typeof input.name === 'string') data.name = input.name;
    if (typeof input.status === 'string') data.status = input.status as never;
    if ('metadata' in input) data.metadata = json(input.metadata);
    const result = await this.db.tokenInstrument.updateMany({
      where: { id, organizationId: this.orgId(p), deletedAt: null, version },
      data,
    });
    if (result.count === 0) throw new ConflictError('Token instrument version is stale');
    return this.getInstrument(id, p);
  }

  private async loadHoldings(instrumentId: string): Promise<HoldingState[]> {
    const rows = await this.db.tokenHolding.findMany({ where: { instrumentId } });
    return rows.map((row) => ({
      holderRef: row.holderRef,
      balance: row.balance,
      frozen: row.frozen,
    }));
  }

  private async persistHoldings(
    organizationId: string,
    instrumentId: string,
    holdings: HoldingState[],
  ): Promise<void> {
    for (const holding of holdings) {
      await this.db.tokenHolding.upsert({
        where: {
          instrumentId_holderRef: { instrumentId, holderRef: holding.holderRef },
        },
        create: {
          organizationId,
          instrumentId,
          holderRef: holding.holderRef,
          balance: holding.balance,
          frozen: holding.frozen,
        },
        update: {
          balance: holding.balance,
          frozen: holding.frozen,
        },
      });
    }
  }

  private async appendLedger(
    p: Principal,
    instrument: {
      id: string;
      network: string;
      status: string;
      totalSupply: bigint;
      totalSupplyCap: bigint | null;
    },
    op: {
      type: LedgerOpType;
      fromHolderRef?: string;
      toHolderRef?: string;
      amount: bigint;
      memo?: string;
    },
  ) {
    if (instrument.status === 'frozen' || instrument.status === 'retired') {
      throw new ValidationError(`Instrument is ${instrument.status}`);
    }
    if (instrument.status === 'draft') {
      throw new ValidationError('Activate instrument before ledger operations');
    }

    const holdings = await this.loadHoldings(instrument.id);
    let next;
    try {
      next = applyLedgerOp(
        holdings,
        instrument.totalSupply,
        op,
        instrument.totalSupplyCap,
      );
    } catch (error) {
      throw new ValidationError(String(error).replace(/^Error:\s*/, ''));
    }

    const previous = await this.db.tokenLedgerEntry.findFirst({
      where: { instrumentId: instrument.id },
      orderBy: { createdAt: 'desc' },
    });
    const occurredAtIso = new Date().toISOString();
    const txHash = computeLedgerTxHash({
      instrumentId: instrument.id,
      entryType: op.type,
      fromHolderRef: op.fromHolderRef ?? null,
      toHolderRef: op.toHolderRef ?? null,
      amount: op.amount,
      previousTxHash: previous?.txHash ?? null,
      occurredAtIso,
    });
    const settlement = settleLedgerEntry(instrument.network, txHash);

    const [entry] = await this.db.$transaction([
      this.db.tokenLedgerEntry.create({
        data: {
          organizationId: this.orgId(p),
          instrumentId: instrument.id,
          entryType: op.type as never,
          fromHolderRef: op.fromHolderRef,
          toHolderRef: op.toHolderRef,
          amount: op.amount,
          txHash,
          previousTxHash: previous?.txHash,
          settlementStatus: settlement.status as never,
          settlementRef: settlement.settlementRef ?? undefined,
          memo: op.memo,
          createdByUserId: p.userId,
        },
      }),
      this.db.tokenInstrument.update({
        where: { id: instrument.id },
        data: { totalSupply: next.totalSupply },
      }),
    ]);

    await this.persistHoldings(this.orgId(p), instrument.id, next.holdings);
    return serialize({ entry, totalSupply: next.totalSupply, holdings: next.holdings });
  }

  async mint(id: string, input: Record<string, unknown>, p: Principal) {
    const instrument = await this.db.tokenInstrument.findFirst({
      where: { id, organizationId: this.orgId(p), deletedAt: null },
    });
    if (!instrument) throw new NotFoundError('TokenInstrument', id);
    if (typeof input.toHolderRef !== 'string') throw new ValidationError('toHolderRef is required');
    const result = await this.appendLedger(p, instrument, {
      type: 'mint',
      toHolderRef: input.toHolderRef,
      amount: this.parseAmount(input.amount),
      memo: input.memo as string | undefined,
    });
    await this.emit(
      p, TOKENIZATION_KAFKA_TOPICS.MINTED, 'tokenization.minted',
      'token_instrument', id, { instrumentId: id, amount: String(input.amount) },
    );
    return result;
  }

  async burn(id: string, input: Record<string, unknown>, p: Principal) {
    const instrument = await this.db.tokenInstrument.findFirst({
      where: { id, organizationId: this.orgId(p), deletedAt: null },
    });
    if (!instrument) throw new NotFoundError('TokenInstrument', id);
    if (typeof input.fromHolderRef !== 'string') {
      throw new ValidationError('fromHolderRef is required');
    }
    const result = await this.appendLedger(p, instrument, {
      type: 'burn',
      fromHolderRef: input.fromHolderRef,
      amount: this.parseAmount(input.amount),
      memo: input.memo as string | undefined,
    });
    await this.emit(
      p, TOKENIZATION_KAFKA_TOPICS.BURNED, 'tokenization.burned',
      'token_instrument', id, { instrumentId: id, amount: String(input.amount) },
    );
    return result;
  }

  async transfer(id: string, input: Record<string, unknown>, p: Principal) {
    const instrument = await this.db.tokenInstrument.findFirst({
      where: { id, organizationId: this.orgId(p), deletedAt: null },
    });
    if (!instrument) throw new NotFoundError('TokenInstrument', id);
    if (typeof input.fromHolderRef !== 'string' || typeof input.toHolderRef !== 'string') {
      throw new ValidationError('fromHolderRef and toHolderRef are required');
    }
    const result = await this.appendLedger(p, instrument, {
      type: 'transfer',
      fromHolderRef: input.fromHolderRef,
      toHolderRef: input.toHolderRef,
      amount: this.parseAmount(input.amount),
      memo: input.memo as string | undefined,
    });
    await this.emit(
      p, TOKENIZATION_KAFKA_TOPICS.TRANSFERRED, 'tokenization.transferred',
      'token_instrument', id, { instrumentId: id, amount: String(input.amount) },
    );
    return result;
  }

  async freezeHolding(id: string, input: Record<string, unknown>, p: Principal) {
    const instrument = await this.db.tokenInstrument.findFirst({
      where: { id, organizationId: this.orgId(p), deletedAt: null },
    });
    if (!instrument) throw new NotFoundError('TokenInstrument', id);
    if (typeof input.holderRef !== 'string') throw new ValidationError('holderRef is required');
    const freeze = input.frozen !== false;
    const result = await this.appendLedger(p, instrument, {
      type: freeze ? 'freeze' : 'unfreeze',
      fromHolderRef: input.holderRef,
      amount: 1n,
      memo: input.memo as string | undefined,
    });
    await this.emit(
      p, TOKENIZATION_KAFKA_TOPICS.FROZEN, 'tokenization.frozen',
      'token_instrument', id, { instrumentId: id, holderRef: input.holderRef, frozen: freeze },
    );
    return result;
  }

  async listHoldings(id: string, p: Principal) {
    await this.getInstrument(id, p);
    const items = await this.db.tokenHolding.findMany({
      where: { instrumentId: id, organizationId: this.orgId(p) },
      orderBy: { balance: 'desc' },
    });
    return serialize({ items });
  }

  async listLedger(id: string, p: Principal, query: Record<string, string | undefined>) {
    await this.getInstrument(id, p);
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where = { instrumentId: id, organizationId: this.orgId(p) };
    const [items, total] = await this.db.$transaction([
      this.db.tokenLedgerEntry.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' },
      }),
      this.db.tokenLedgerEntry.count({ where }),
    ]);
    return serialize({ items, total, page, pageSize });
  }
}

@ApiTags('Tokenization')
@ApiBearerAuth()
@Controller({ path: 'tokenization', version: '1' })
export class TokenizationController {
  constructor(
    private readonly service: TokenizationService,
    private readonly auth: AuthorizationService,
  ) {}

  @Post('instruments')
  create(@Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'tokenization:instrument:create');
    return this.service.createInstrument(body, p);
  }

  @Get('instruments')
  list(@Query() query: Record<string, string | undefined>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'tokenization:instrument:read');
    return this.service.listInstruments(p, query);
  }

  @Get('instruments/:id')
  get(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'tokenization:instrument:read');
    return this.service.getInstrument(id, p);
  }

  @Patch('instruments/:id')
  update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'tokenization:instrument:update');
    return this.service.updateInstrument(id, body, p);
  }

  @Post('instruments/:id/mint')
  mint(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'tokenization:mint');
    return this.service.mint(id, body, p);
  }

  @Post('instruments/:id/burn')
  burn(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'tokenization:burn');
    return this.service.burn(id, body, p);
  }

  @Post('instruments/:id/transfer')
  transfer(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'tokenization:transfer');
    return this.service.transfer(id, body, p);
  }

  @Post('instruments/:id/freeze')
  freeze(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'tokenization:freeze');
    return this.service.freezeHolding(id, body, p);
  }

  @Get('instruments/:id/holdings')
  holdings(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'tokenization:ledger:read');
    return this.service.listHoldings(id, p);
  }

  @Get('instruments/:id/ledger')
  ledger(
    @Param('id') id: string,
    @Query() query: Record<string, string | undefined>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'tokenization:ledger:read');
    return this.service.listLedger(id, p, query);
  }
}

@Module({
  controllers: [TokenizationController],
  providers: [TokenizationService],
})
export class TokenizationModule {}
