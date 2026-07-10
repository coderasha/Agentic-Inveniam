import {
  Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@gain/database';
import { AuthorizationService, CurrentPrincipal, type Principal } from '../common/auth';
import { ConflictError, NotFoundError, ValidationError } from '../common/errors';
import { PrismaService } from '../infrastructure/services';

export interface WorkflowStep { key: string; name: string; input?: unknown }
export function parseSteps(definition: unknown): WorkflowStep[] {
  if (!definition || typeof definition !== 'object' ||
    !Array.isArray((definition as { steps?: unknown }).steps)) {
    throw new ValidationError('definition.steps must be an array');
  }
  const steps = (definition as { steps: unknown[] }).steps;
  if (steps.length === 0) throw new ValidationError('definition.steps must not be empty');
  const parsed = steps.map((step) => {
    if (!step || typeof step !== 'object') throw new ValidationError('Each workflow step must be an object');
    const item = step as Record<string, unknown>;
    if (typeof item.key !== 'string' || !item.key.trim() ||
      typeof item.name !== 'string' || !item.name.trim()) {
      throw new ValidationError('Each workflow step requires key and name');
    }
    return { key: item.key, name: item.name, input: item.input };
  });
  if (new Set(parsed.map((step) => step.key)).size !== parsed.length) {
    throw new ValidationError('Workflow step keys must be unique');
  }
  return parsed;
}
export function shouldCompleteRun(statuses: string[]): boolean {
  return statuses.length > 0 && statuses.every((status) => status === 'completed' || status === 'skipped');
}
const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

@Injectable()
export class WorkflowService {
  constructor(private readonly db: PrismaService) {}
  async get(id: string, p: Principal) {
    const row = await this.db.workflowDefinition.findFirst({
      where: { id, organizationId: p.organizationId!, deletedAt: null },
    });
    if (!row) throw new NotFoundError('Workflow', id);
    return row;
  }
  async create(input: Record<string, unknown>, p: Principal) {
    if (typeof input.name !== 'string' || typeof input.slug !== 'string') {
      throw new ValidationError('name and slug are required');
    }
    parseSteps(input.definition);
    return this.db.workflowDefinition.create({ data: {
      organizationId: p.organizationId!, name: input.name, slug: input.slug,
      description: input.description as string | undefined, status: input.status as never,
      definition: json(input.definition),
    } }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('Workflow slug already exists');
      }
      throw error;
    });
  }
  async list(p: Principal, q: Record<string, string | undefined>) {
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(q.pageSize) || 20));
    const where = { organizationId: p.organizationId!, deletedAt: null, status: q.status as never };
    const [items, total] = await this.db.$transaction([
      this.db.workflowDefinition.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { updatedAt: 'desc' },
      }),
      this.db.workflowDefinition.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
  async update(id: string, input: Record<string, unknown>, p: Principal) {
    const current = await this.get(id, p);
    if (Number(input.version) !== current.version) throw new ConflictError('Workflow version is stale');
    if ('definition' in input) parseSteps(input.definition);
    const data: Record<string, unknown> = { version: { increment: 1 } };
    for (const key of ['name', 'slug', 'description', 'status']) if (key in input) data[key] = input[key];
    if ('definition' in input) data.definition = json(input.definition);
    return this.db.workflowDefinition.update({ where: { id }, data: data as never });
  }
  async remove(id: string, p: Principal): Promise<void> {
    await this.get(id, p);
    await this.db.workflowDefinition.update({ where: { id }, data: { deletedAt: new Date() } });
  }
  async createRun(id: string, context: unknown, p: Principal) {
    const workflow = await this.get(id, p);
    const steps = parseSteps(workflow.definition);
    return this.db.workflowRun.create({
      data: {
        organizationId: p.organizationId!, workflowId: id, context: json(context ?? {}),
        createdByUserId: p.userId,
        tasks: { create: steps.map((step) => ({
          key: step.key, name: step.name, input: json(step.input ?? {}),
        })) },
      },
      include: { tasks: true },
    });
  }
  async getRun(id: string, p: Principal) {
    const run = await this.db.workflowRun.findFirst({
      where: { id, organizationId: p.organizationId! }, include: { tasks: true },
    });
    if (!run) throw new NotFoundError('Workflow run', id);
    return run;
  }
  async start(id: string, p: Principal) {
    await this.getRun(id, p);
    const result = await this.db.workflowRun.updateMany({
      where: { id, organizationId: p.organizationId!, status: 'pending' },
      data: { status: 'running', startedAt: new Date() },
    });
    if (result.count === 0) throw new ConflictError('Only pending workflow runs can be started');
    return this.getRun(id, p);
  }
  async completeTask(id: string, output: unknown, p: Principal) {
    const task = await this.db.workflowTask.findFirst({
      where: { id, run: { organizationId: p.organizationId! } }, include: { run: true },
    });
    if (!task) throw new NotFoundError('Workflow task', id);
    if (task.run.status !== 'running') throw new ConflictError('Workflow run is not running');
    if (task.status === 'completed' || task.status === 'skipped') {
      throw new ConflictError('Workflow task is already complete');
    }
    return this.db.$transaction(async (tx) => {
      const updated = await tx.workflowTask.update({
        where: { id }, data: { status: 'completed', output: json(output ?? {}), completedAt: new Date() },
      });
      const tasks = await tx.workflowTask.findMany({ where: { runId: task.runId }, select: { status: true } });
      if (shouldCompleteRun(tasks.map((item) => item.status))) {
        await tx.workflowRun.update({
          where: { id: task.runId }, data: { status: 'completed', completedAt: new Date() },
        });
      }
      return updated;
    });
  }
  async listRuns(p: Principal, workflowId?: string) {
    if (workflowId) await this.get(workflowId, p);
    return this.db.workflowRun.findMany({
      where: { organizationId: p.organizationId!, workflowId },
      include: { tasks: true }, orderBy: { createdAt: 'desc' },
    });
  }
  async listTasks(runId: string, p: Principal) {
    await this.getRun(runId, p);
    return this.db.workflowTask.findMany({ where: { runId }, orderBy: { createdAt: 'asc' } });
  }
}

@ApiTags('Workflows')
@ApiBearerAuth()
@Controller({ path: 'workflows', version: '1' })
export class WorkflowController {
  constructor(private readonly service: WorkflowService, private readonly auth: AuthorizationService) {}
  @Post()
  create(@Body() b: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'workflow:create'); return this.service.create(b, p);
  }
  @Get()
  list(@Query() q: Record<string, string | undefined>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'workflow:read'); return this.service.list(p, q);
  }
  @Get(':id')
  get(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'workflow:read'); return this.service.get(id, p);
  }
  @Patch(':id')
  update(@Param('id') id: string, @Body() b: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'workflow:update'); return this.service.update(id, b, p);
  }
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'workflow:delete'); await this.service.remove(id, p); return { deleted: true };
  }
  @Post(':id/runs')
  run(@Param('id') id: string, @Body() b: { context?: unknown }, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'workflow:run'); return this.service.createRun(id, b.context, p);
  }
  @Get(':id/runs')
  runs(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'workflow:read'); return this.service.listRuns(p, id);
  }
}

@ApiTags('Workflow runs')
@ApiBearerAuth()
@Controller({ path: 'workflow-runs', version: '1' })
export class WorkflowRunController {
  constructor(private readonly service: WorkflowService, private readonly auth: AuthorizationService) {}
  @Get()
  runs(@CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'workflow:read'); return this.service.listRuns(p);
  }
  @Post(':id/start')
  start(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'workflow:run'); return this.service.start(id, p);
  }
  @Get(':id/tasks')
  tasks(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'workflow:read'); return this.service.listTasks(id, p);
  }
}

@ApiTags('Workflow tasks')
@ApiBearerAuth()
@Controller({ path: 'workflow-tasks', version: '1' })
export class WorkflowTaskController {
  constructor(private readonly service: WorkflowService, private readonly auth: AuthorizationService) {}
  @Post(':id/complete')
  complete(@Param('id') id: string, @Body() b: { output?: unknown }, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'workflow:run'); return this.service.completeTask(id, b.output, p);
  }
}

@Module({
  controllers: [WorkflowController, WorkflowRunController, WorkflowTaskController],
  providers: [WorkflowService],
})
export class WorkflowModule {}
