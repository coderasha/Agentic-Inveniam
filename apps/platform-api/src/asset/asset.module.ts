import {
  Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@gain/database';
import { AuthorizationService, CurrentPrincipal, type Principal } from '../common/auth';
import { ConflictError, NotFoundError, ValidationError } from '../common/errors';
import { PrismaService } from '../infrastructure/services';

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;
const serialize = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value, (_, item) => typeof item === 'bigint'
    ? (item <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(item) : item.toString()) : item)) as T;

@Injectable()
export class AssetService {
  constructor(private readonly db: PrismaService) {}
  async get(id: string, p: Principal) {
    const asset = await this.db.registeredAsset.findFirst({
      where: { id, organizationId: p.organizationId!, deletedAt: null },
    });
    if (!asset) throw new NotFoundError('Asset', id);
    return asset;
  }
  async create(input: Record<string, unknown>, p: Principal) {
    if (typeof input.name !== 'string' || typeof input.slug !== 'string' ||
      typeof input.assetClass !== 'string') throw new ValidationError('name, slug and assetClass are required');
    return this.db.registeredAsset.create({ data: {
      organizationId: p.organizationId!, name: input.name, slug: input.slug,
      description: input.description as string | undefined, assetClass: input.assetClass as never,
      status: input.status as never, twinId: input.twinId as string | undefined,
      externalReference: input.externalReference as string | undefined,
      currencyCode: input.currencyCode as string | undefined,
      acquisitionDate: input.acquisitionDate ? new Date(input.acquisitionDate as string) : undefined,
      tags: input.tags as string[] | undefined, metadata: json(input.metadata ?? {}),
    } }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('Asset slug or twinId already exists');
      }
      throw error;
    });
  }
  async list(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where = {
      organizationId: p.organizationId!, deletedAt: null,
      status: query.status as never, assetClass: query.assetClass as never,
    };
    const [items, total] = await this.db.$transaction([
      this.db.registeredAsset.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { updatedAt: 'desc' },
      }),
      this.db.registeredAsset.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
  async update(id: string, input: Record<string, unknown>, p: Principal) {
    await this.get(id, p);
    const version = Number(input.version);
    if (!Number.isInteger(version)) throw new ValidationError('version is required');
    const allowed = [
      'name', 'slug', 'description', 'assetClass', 'status', 'twinId',
      'externalReference', 'currencyCode', 'tags',
    ];
    const data: Record<string, unknown> = { version: { increment: 1 } };
    for (const key of allowed) if (key in input) data[key] = input[key];
    if ('metadata' in input) data.metadata = json(input.metadata);
    if ('acquisitionDate' in input) {
      data.acquisitionDate = input.acquisitionDate ? new Date(input.acquisitionDate as string) : null;
    }
    const result = await this.db.registeredAsset.updateMany({
      where: { id, organizationId: p.organizationId!, deletedAt: null, version },
      data: data as never,
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('Asset slug or twinId already exists');
      }
      throw error;
    });
    if (result.count === 0) throw new ConflictError('Asset version is stale');
    return this.get(id, p);
  }
  async remove(id: string, p: Principal): Promise<void> {
    await this.get(id, p);
    await this.db.registeredAsset.update({ where: { id }, data: { deletedAt: new Date() } });
  }
  async value(id: string, input: Record<string, unknown>, p: Principal) {
    await this.get(id, p);
    const amount = input.amountMinor;
    if ((typeof amount !== 'number' && typeof amount !== 'string') ||
      !/^-?\d+$/.test(String(amount))) throw new ValidationError('amountMinor must be an integer');
    if (!input.asOfDate || typeof input.currencyCode !== 'string' || typeof input.methodology !== 'string') {
      throw new ValidationError('asOfDate, currencyCode and methodology are required');
    }
    return serialize(await this.db.assetValuation.create({ data: {
      assetId: id, organizationId: p.organizationId!, asOfDate: new Date(input.asOfDate as string),
      currencyCode: input.currencyCode, amountMinor: BigInt(amount),
      methodology: input.methodology, confidence: input.confidence as number | undefined,
      source: input.source as string | undefined, notes: input.notes as string | undefined,
      createdByUserId: p.userId,
    } }));
  }
  async valuations(id: string, p: Principal) {
    await this.get(id, p);
    return serialize(await this.db.assetValuation.findMany({
      where: { assetId: id, organizationId: p.organizationId! }, orderBy: { asOfDate: 'desc' },
    }));
  }
}

@ApiTags('Assets')
@ApiBearerAuth()
@Controller({ path: 'assets', version: '1' })
export class AssetController {
  constructor(private readonly service: AssetService, private readonly auth: AuthorizationService) {}
  @Post()
  create(@Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'asset:create'); return this.service.create(body, p);
  }
  @Get()
  list(@Query() q: Record<string, string | undefined>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'asset:read'); return this.service.list(p, q);
  }
  @Get(':id')
  get(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'asset:read'); return this.service.get(id, p);
  }
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'asset:update'); return this.service.update(id, body, p);
  }
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'asset:delete'); await this.service.remove(id, p); return { deleted: true };
  }
  @Post(':id/valuations')
  value(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'asset:valuate'); return this.service.value(id, body, p);
  }
  @Get(':id/valuations')
  valuations(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'asset:read'); return this.service.valuations(id, p);
  }
}

@Module({ controllers: [AssetController], providers: [AssetService] })
export class AssetModule {}
