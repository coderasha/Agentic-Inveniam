import {
  Body, Controller, Get, Injectable, Module, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@gain/database';
import { VALUATION_KAFKA_TOPICS, type DomainEvent } from '@gain/shared';
import { v4 as uuidv4 } from 'uuid';
import { AuthorizationService, CurrentPrincipal, type Principal } from '../common/auth';
import { ConflictError, NotFoundError, ValidationError } from '../common/errors';
import { OutboxService, PrismaService } from '../infrastructure/services';
import { executeValuation, type ValuationMethodology } from './engine';

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;
const serialize = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value, (_, item) => typeof item === 'bigint'
    ? (item <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(item) : item.toString()) : item)) as T;

@Injectable()
export class ValuationService {
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

  async createModel(input: Record<string, unknown>, p: Principal) {
    if (typeof input.name !== 'string' || typeof input.slug !== 'string'
      || typeof input.methodology !== 'string') {
      throw new ValidationError('name, slug and methodology are required');
    }
    const model = await this.db.valuationModel.create({
      data: {
        organizationId: this.orgId(p),
        name: input.name,
        slug: input.slug,
        methodology: input.methodology as never,
        description: input.description as string | undefined,
        parameters: json(input.parameters ?? {}),
        status: 'active',
      },
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('Valuation model slug already exists');
      }
      throw error;
    });
    await this.emit(
      p, VALUATION_KAFKA_TOPICS.MODEL_CREATED, 'valuation.model.created',
      'valuation_model', model.id, { modelId: model.id, methodology: model.methodology },
    );
    return model;
  }

  async listModels(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.ValuationModelWhereInput = {
      organizationId: this.orgId(p),
      deletedAt: null,
      status: query.status as never,
    };
    const [items, total] = await this.db.$transaction([
      this.db.valuationModel.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { updatedAt: 'desc' },
      }),
      this.db.valuationModel.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getModel(id: string, p: Principal) {
    const model = await this.db.valuationModel.findFirst({
      where: { id, organizationId: this.orgId(p), deletedAt: null },
    });
    if (!model) throw new NotFoundError('ValuationModel', id);
    return model;
  }

  async updateModel(id: string, input: Record<string, unknown>, p: Principal) {
    await this.getModel(id, p);
    const version = Number(input.version);
    if (!Number.isInteger(version)) throw new ValidationError('version is required');
    const data: Prisma.ValuationModelUpdateManyMutationInput = { version: { increment: 1 } };
    if (typeof input.name === 'string') data.name = input.name;
    if (typeof input.description === 'string' || input.description === null) {
      data.description = input.description as string | null;
    }
    if (typeof input.status === 'string') data.status = input.status as never;
    if ('parameters' in input) data.parameters = json(input.parameters);
    const result = await this.db.valuationModel.updateMany({
      where: { id, organizationId: this.orgId(p), deletedAt: null, version },
      data,
    });
    if (result.count === 0) throw new ConflictError('Valuation model version is stale');
    return this.getModel(id, p);
  }

  async createRun(input: Record<string, unknown>, p: Principal) {
    if (typeof input.modelId !== 'string' || typeof input.subjectType !== 'string'
      || typeof input.subjectId !== 'string' || typeof input.asOfDate !== 'string') {
      throw new ValidationError('modelId, subjectType, subjectId and asOfDate are required');
    }
    const model = await this.getModel(input.modelId, p);
    if (model.status !== 'active') throw new ValidationError('Model must be active to run');

    const run = await this.db.valuationRun.create({
      data: {
        organizationId: this.orgId(p),
        modelId: model.id,
        subjectType: input.subjectType as never,
        subjectId: input.subjectId,
        asOfDate: new Date(input.asOfDate),
        currencyCode: (input.currencyCode as string | undefined) ?? 'USD',
        inputs: json(input.inputs ?? {}),
        status: 'queued',
        createdByUserId: p.userId,
      },
    });

    await this.emit(
      p, VALUATION_KAFKA_TOPICS.RUN_QUEUED, 'valuation.run.queued',
      'valuation_run', run.id, { runId: run.id, modelId: model.id },
    );

    return this.executeRun(run.id, p);
  }

  async executeRun(id: string, p: Principal) {
    const run = await this.db.valuationRun.findFirst({
      where: { id, organizationId: this.orgId(p) },
      include: { model: true },
    });
    if (!run) throw new NotFoundError('ValuationRun', id);
    if (run.status === 'cancelled') throw new ValidationError('Run was cancelled');

    await this.db.valuationRun.update({
      where: { id },
      data: { status: 'running', startedAt: new Date() },
    });

    try {
      const result = executeValuation({
        methodology: run.model.methodology as ValuationMethodology,
        parameters: (run.model.parameters as Record<string, unknown>) ?? {},
        inputs: (run.inputs as Record<string, unknown>) ?? {},
      });

      const completed = await this.db.valuationRun.update({
        where: { id },
        data: {
          status: 'completed',
          amountMinor: result.amountMinor,
          confidence: result.confidence,
          outputs: json(result.outputs),
          completedAt: new Date(),
          errorMessage: null,
        },
      });

      // Persist snapshot onto registered asset when subject is an asset
      if (run.subjectType === 'asset') {
        await this.db.assetValuation.create({
          data: {
            assetId: run.subjectId,
            organizationId: this.orgId(p),
            asOfDate: run.asOfDate,
            currencyCode: run.currencyCode,
            amountMinor: result.amountMinor,
            methodology: run.model.methodology,
            confidence: result.confidence,
            source: `valuation_run:${run.id}`,
            notes: `Continuous valuation run ${run.id}`,
            createdByUserId: p.userId,
          },
        }).catch(() => undefined);
      }

      await this.emit(
        p, VALUATION_KAFKA_TOPICS.RUN_COMPLETED, 'valuation.run.completed',
        'valuation_run', id, {
          runId: id,
          amountMinor: result.amountMinor.toString(),
          confidence: result.confidence,
        },
      );
      return serialize(completed);
    } catch (error) {
      const failed = await this.db.valuationRun.update({
        where: { id },
        data: {
          status: 'failed',
          errorMessage: String(error).slice(0, 2000),
          completedAt: new Date(),
        },
      });
      await this.emit(
        p, VALUATION_KAFKA_TOPICS.RUN_FAILED, 'valuation.run.failed',
        'valuation_run', id, { runId: id, error: String(error).slice(0, 500) },
      );
      return serialize(failed);
    }
  }

  async listRuns(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.ValuationRunWhereInput = {
      organizationId: this.orgId(p),
      status: query.status as never,
      subjectType: query.subjectType as never,
      subjectId: query.subjectId,
      modelId: query.modelId,
    };
    const [items, total] = await this.db.$transaction([
      this.db.valuationRun.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' },
      }),
      this.db.valuationRun.count({ where }),
    ]);
    return serialize({ items, total, page, pageSize });
  }

  async getRun(id: string, p: Principal) {
    const run = await this.db.valuationRun.findFirst({
      where: { id, organizationId: this.orgId(p) },
    });
    if (!run) throw new NotFoundError('ValuationRun', id);
    return serialize(run);
  }

  async cancelRun(id: string, p: Principal) {
    const run = await this.getRun(id, p);
    if (!['queued', 'running'].includes(String(run.status))) {
      throw new ValidationError('Only queued or running valuations can be cancelled');
    }
    return serialize(await this.db.valuationRun.update({
      where: { id },
      data: { status: 'cancelled', completedAt: new Date() },
    }));
  }
}

@ApiTags('Continuous Valuation')
@ApiBearerAuth()
@Controller({ path: 'valuations', version: '1' })
export class ValuationController {
  constructor(
    private readonly service: ValuationService,
    private readonly auth: AuthorizationService,
  ) {}

  @Post('models')
  createModel(@Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'valuation:model:create');
    return this.service.createModel(body, p);
  }

  @Get('models')
  listModels(@Query() query: Record<string, string | undefined>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'valuation:model:read');
    return this.service.listModels(p, query);
  }

  @Get('models/:id')
  getModel(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'valuation:model:read');
    return this.service.getModel(id, p);
  }

  @Patch('models/:id')
  updateModel(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'valuation:model:update');
    return this.service.updateModel(id, body, p);
  }

  @Post('runs')
  createRun(@Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'valuation:run:create');
    return this.service.createRun(body, p);
  }

  @Get('runs')
  listRuns(@Query() query: Record<string, string | undefined>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'valuation:run:read');
    return this.service.listRuns(p, query);
  }

  @Get('runs/:id')
  getRun(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'valuation:run:read');
    return this.service.getRun(id, p);
  }

  @Post('runs/:id/cancel')
  cancelRun(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'valuation:run:cancel');
    return this.service.cancelRun(id, p);
  }
}

@Module({
  controllers: [ValuationController],
  providers: [ValuationService],
})
export class ValuationModule {}
