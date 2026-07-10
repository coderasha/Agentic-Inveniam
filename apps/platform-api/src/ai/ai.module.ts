import {
  Body, Controller, Get, Injectable, Module, Param, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@gain/database';
import { AI_KAFKA_TOPICS, type DomainEvent } from '@gain/shared';
import { v4 as uuidv4 } from 'uuid';
import { AuthorizationService, CurrentPrincipal, type Principal } from '../common/auth';
import { ConflictError, NotFoundError, ValidationError } from '../common/errors';
import { OutboxService, PrismaService } from '../infrastructure/services';
import {
  completeChat,
  resolveAiProvider,
  runAgentCompletion,
  type ChatMessage,
} from './providers';

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

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
export class AiService {
  constructor(
    private readonly db: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  private orgId(p: Principal): string {
    if (!p.organizationId) throw new ValidationError('x-organization-id is required');
    return p.organizationId;
  }

  private openaiKey(): string | undefined {
    const key = process.env.OPENAI_API_KEY?.trim();
    return key || undefined;
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

  async createAgent(input: Record<string, unknown>, p: Principal) {
    if (typeof input.name !== 'string' || typeof input.slug !== 'string'
      || typeof input.systemPrompt !== 'string') {
      throw new ValidationError('name, slug and systemPrompt are required');
    }
    let provider: 'heuristic' | 'openai';
    try {
      provider = resolveAiProvider(
        input.provider as 'heuristic' | 'openai' | undefined,
        this.openaiKey(),
      );
    } catch (error) {
      throw new ValidationError(error instanceof Error ? error.message : 'Invalid AI provider');
    }
    const agent = await this.db.aiAgent.create({
      data: {
        organizationId: this.orgId(p),
        name: input.name,
        slug: input.slug,
        description: input.description as string | undefined,
        systemPrompt: input.systemPrompt,
        provider,
        model: typeof input.model === 'string' ? input.model : 'gain-heuristic-v1',
        status: 'draft',
        tools: json(parseTools(input.tools)),
        metadata: json(input.metadata ?? {}),
        createdByUserId: p.userId,
      },
    }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('AI agent slug already exists');
      }
      throw error;
    });
    await this.emit(
      p, AI_KAFKA_TOPICS.AGENT_CREATED, 'ai.agent.created',
      'ai_agent', agent.id, { agentId: agent.id, slug: agent.slug },
    );
    return agent;
  }

  async listAgents(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.AiAgentWhereInput = {
      organizationId: this.orgId(p),
      deletedAt: null,
      status: query.status as never,
    };
    const [items, total] = await this.db.$transaction([
      this.db.aiAgent.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { updatedAt: 'desc' },
      }),
      this.db.aiAgent.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getAgent(id: string, p: Principal) {
    const agent = await this.db.aiAgent.findFirst({
      where: { id, organizationId: this.orgId(p), deletedAt: null },
    });
    if (!agent) throw new NotFoundError('AiAgent', id);
    return agent;
  }

  async updateAgent(id: string, input: Record<string, unknown>, p: Principal) {
    await this.getAgent(id, p);
    const version = Number(input.version);
    if (!Number.isInteger(version)) throw new ValidationError('version is required');
    const data: Prisma.AiAgentUpdateManyMutationInput = { version: { increment: 1 } };
    if (typeof input.name === 'string') data.name = input.name;
    if (typeof input.description === 'string' || input.description === null) {
      data.description = input.description as string | null;
    }
    if (typeof input.systemPrompt === 'string') data.systemPrompt = input.systemPrompt;
    if (typeof input.status === 'string') data.status = input.status as never;
    if (typeof input.model === 'string') data.model = input.model;
    if ('provider' in input) {
      try {
        data.provider = resolveAiProvider(
          input.provider as 'heuristic' | 'openai' | undefined,
          this.openaiKey(),
        );
      } catch (error) {
        throw new ValidationError(error instanceof Error ? error.message : 'Invalid AI provider');
      }
    }
    if ('tools' in input) data.tools = json(parseTools(input.tools));
    if ('metadata' in input) data.metadata = json(input.metadata ?? {});
    const result = await this.db.aiAgent.updateMany({
      where: { id, organizationId: this.orgId(p), deletedAt: null, version },
      data,
    });
    if (result.count === 0) throw new ConflictError('AI agent version is stale');
    return this.getAgent(id, p);
  }

  async createConversation(input: Record<string, unknown>, p: Principal) {
    const organizationId = this.orgId(p);
    let agentId: string | undefined;
    if (typeof input.agentId === 'string') {
      await this.getAgent(input.agentId, p);
      agentId = input.agentId;
    }
    const conversation = await this.db.aiConversation.create({
      data: {
        organizationId,
        agentId,
        title: typeof input.title === 'string' ? input.title : 'New conversation',
        metadata: json(input.metadata ?? {}),
        createdByUserId: p.userId,
      },
    });
    await this.emit(
      p, AI_KAFKA_TOPICS.CONVERSATION_CREATED, 'ai.conversation.created',
      'ai_conversation', conversation.id, { conversationId: conversation.id, agentId },
    );
    return conversation;
  }

  async listConversations(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.AiConversationWhereInput = {
      organizationId: this.orgId(p),
      deletedAt: null,
      agentId: query.agentId,
    };
    const [items, total] = await this.db.$transaction([
      this.db.aiConversation.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { updatedAt: 'desc' },
      }),
      this.db.aiConversation.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getConversation(id: string, p: Principal) {
    const conversation = await this.db.aiConversation.findFirst({
      where: { id, organizationId: this.orgId(p), deletedAt: null },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, take: 200 },
        agent: true,
      },
    });
    if (!conversation) throw new NotFoundError('AiConversation', id);
    return conversation;
  }

  async createMessage(input: Record<string, unknown>, p: Principal) {
    if (typeof input.conversationId !== 'string' || typeof input.content !== 'string') {
      throw new ValidationError('conversationId and content are required');
    }
    const content = input.content.trim();
    if (!content) throw new ValidationError('content must not be empty');

    const conversation = await this.getConversation(input.conversationId, p);
    const agent = conversation.agentId
      ? await this.getAgent(conversation.agentId, p)
      : null;

    let provider: 'heuristic' | 'openai';
    try {
      provider = resolveAiProvider(
        (input.provider as 'heuristic' | 'openai' | undefined)
          ?? (agent?.provider as 'heuristic' | 'openai' | undefined),
        this.openaiKey(),
      );
    } catch (error) {
      throw new ValidationError(error instanceof Error ? error.message : 'Invalid AI provider');
    }

    const model = agent?.model ?? 'gain-heuristic-v1';
    const history: ChatMessage[] = conversation.messages.map((message) => ({
      role: message.role as ChatMessage['role'],
      content: message.content,
    }));
    history.push({ role: 'user', content });

    const userMessage = await this.db.aiMessage.create({
      data: {
        organizationId: this.orgId(p),
        conversationId: conversation.id,
        role: 'user',
        content,
        createdByUserId: p.userId,
      },
    });

    let completion;
    try {
      completion = await completeChat(
        provider,
        {
          systemPrompt: agent?.systemPrompt,
          messages: history,
          model,
        },
        this.openaiKey(),
      );
    } catch (error) {
      throw new ValidationError(
        error instanceof Error ? error.message : 'AI completion failed',
      );
    }

    const assistantMessage = await this.db.aiMessage.create({
      data: {
        organizationId: this.orgId(p),
        conversationId: conversation.id,
        role: 'assistant',
        content: completion.content,
        provider: completion.provider,
        model: completion.model,
        tokenEstimate: completion.tokenEstimate,
        metadata: json(completion.metadata),
      },
    });

    await this.db.aiConversation.update({
      where: { id: conversation.id },
      data: {
        updatedAt: new Date(),
        title: conversation.title === 'New conversation'
          ? content.slice(0, 80)
          : conversation.title,
      },
    });

    await this.emit(
      p, AI_KAFKA_TOPICS.MESSAGE_CREATED, 'ai.message.created',
      'ai_conversation', conversation.id, {
        conversationId: conversation.id,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        provider: completion.provider,
      },
    );

    return {
      userMessage,
      assistantMessage,
      conversationId: conversation.id,
    };
  }

  async runAgent(input: Record<string, unknown>, p: Principal) {
    if (typeof input.agentId !== 'string') {
      throw new ValidationError('agentId is required');
    }
    const agent = await this.getAgent(input.agentId, p);
    if (agent.status === 'archived') {
      throw new ValidationError('Cannot run an archived agent');
    }

    let provider: 'heuristic' | 'openai';
    try {
      provider = resolveAiProvider(agent.provider as 'heuristic' | 'openai', this.openaiKey());
    } catch (error) {
      throw new ValidationError(error instanceof Error ? error.message : 'Invalid AI provider');
    }

    const tools = parseTools(agent.tools);
    const runInput = (input.input && typeof input.input === 'object' && !Array.isArray(input.input))
      ? input.input as Record<string, unknown>
      : {};
    const prompt = typeof input.prompt === 'string' ? input.prompt : undefined;

    const run = await this.db.aiAgentRun.create({
      data: {
        organizationId: this.orgId(p),
        agentId: agent.id,
        status: 'running',
        provider,
        model: agent.model,
        input: json(runInput),
        prompt,
        startedAt: new Date(),
        createdByUserId: p.userId,
      },
    });

    try {
      const result = await runAgentCompletion(
        provider,
        {
          systemPrompt: agent.systemPrompt,
          tools,
          prompt,
          input: runInput,
          model: agent.model,
        },
        this.openaiKey(),
      );
      const completed = await this.db.aiAgentRun.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          output: json({
            summary: result.summary,
            steps: result.steps,
            metadata: result.metadata,
          }),
          completedAt: new Date(),
        },
      });
      await this.emit(
        p, AI_KAFKA_TOPICS.RUN_COMPLETED, 'ai.run.completed',
        'ai_agent_run', completed.id, {
          runId: completed.id,
          agentId: agent.id,
          provider,
        },
      );
      return completed;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Agent run failed';
      const failed = await this.db.aiAgentRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          errorMessage: message.slice(0, 2000),
          completedAt: new Date(),
        },
      });
      await this.emit(
        p, AI_KAFKA_TOPICS.RUN_FAILED, 'ai.run.failed',
        'ai_agent_run', failed.id, {
          runId: failed.id,
          agentId: agent.id,
          error: message.slice(0, 500),
        },
      );
      return failed;
    }
  }

  async listRuns(p: Principal, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: Prisma.AiAgentRunWhereInput = {
      organizationId: this.orgId(p),
      status: query.status as never,
      agentId: query.agentId,
    };
    const [items, total] = await this.db.$transaction([
      this.db.aiAgentRun.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' },
      }),
      this.db.aiAgentRun.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getRun(id: string, p: Principal) {
    const run = await this.db.aiAgentRun.findFirst({
      where: { id, organizationId: this.orgId(p) },
    });
    if (!run) throw new NotFoundError('AiAgentRun', id);
    return run;
  }
}

@ApiTags('AI')
@ApiBearerAuth()
@Controller({ path: 'ai', version: '1' })
export class AiController {
  constructor(
    private readonly service: AiService,
    private readonly auth: AuthorizationService,
  ) {}

  @Post('agents')
  createAgent(@Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'ai:agent:create');
    return this.service.createAgent(body, p);
  }

  @Get('agents')
  listAgents(@Query() query: Record<string, string | undefined>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'ai:agent:read');
    return this.service.listAgents(p, query);
  }

  @Get('agents/:id')
  getAgent(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'ai:agent:read');
    return this.service.getAgent(id, p);
  }

  @Patch('agents/:id')
  updateAgent(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'ai:agent:update');
    return this.service.updateAgent(id, body, p);
  }

  @Post('agents/:id/runs')
  runAgent(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'ai:agent:run');
    return this.service.runAgent({ ...body, agentId: id }, p);
  }

  @Post('conversations')
  createConversation(@Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'ai:conversation:create');
    return this.service.createConversation(body, p);
  }

  @Get('conversations')
  listConversations(
    @Query() query: Record<string, string | undefined>,
    @CurrentPrincipal() p: Principal,
  ) {
    this.auth.require(p, 'ai:conversation:read');
    return this.service.listConversations(p, query);
  }

  @Get('conversations/:id')
  getConversation(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'ai:conversation:read');
    return this.service.getConversation(id, p);
  }

  @Post('messages')
  createMessage(@Body() body: Record<string, unknown>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'ai:message:create');
    return this.service.createMessage(body, p);
  }

  @Get('runs')
  listRuns(@Query() query: Record<string, string | undefined>, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'ai:run:read');
    return this.service.listRuns(p, query);
  }

  @Get('runs/:id')
  getRun(@Param('id') id: string, @CurrentPrincipal() p: Principal) {
    this.auth.require(p, 'ai:run:read');
    return this.service.getRun(id, p);
  }
}

@Module({
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
