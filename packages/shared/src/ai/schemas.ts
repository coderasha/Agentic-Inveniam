import { z } from 'zod';
import { paginationQuerySchema } from '../identity/schemas.js';

export const AI_PERMISSIONS = [
  'ai:conversation:create',
  'ai:conversation:read',
  'ai:message:create',
  'ai:agent:create',
  'ai:agent:read',
  'ai:agent:update',
  'ai:agent:run',
  'ai:run:read',
] as const;

export type AiPermission = (typeof AI_PERMISSIONS)[number];

export const aiProviderSchema = z.enum(['heuristic', 'openai']);
export type AiProvider = z.infer<typeof aiProviderSchema>;

export const aiMessageRoleSchema = z.enum(['system', 'user', 'assistant', 'tool']);
export type AiMessageRole = z.infer<typeof aiMessageRoleSchema>;

export const aiAgentStatusSchema = z.enum(['draft', 'active', 'archived']);
export type AiAgentStatus = z.infer<typeof aiAgentStatusSchema>;

export const aiRunStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
]);
export type AiRunStatus = z.infer<typeof aiRunStatusSchema>;

export const createAiConversationSchema = z.object({
  organizationId: z.string().uuid(),
  title: z.string().min(1).max(200).trim().default('New conversation'),
  agentId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type CreateAiConversationInput = z.infer<typeof createAiConversationSchema>;

export const createAiMessageSchema = z.object({
  organizationId: z.string().uuid(),
  conversationId: z.string().uuid(),
  content: z.string().min(1).max(16000),
  provider: aiProviderSchema.optional(),
});
export type CreateAiMessageInput = z.infer<typeof createAiMessageSchema>;

export const createAiAgentSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(200).trim(),
  slug: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().max(2000).optional(),
  systemPrompt: z.string().min(1).max(8000),
  provider: aiProviderSchema.default('heuristic'),
  model: z.string().max(100).default('gain-heuristic-v1'),
  tools: z.array(z.string().min(1).max(64)).max(20).default([]),
  metadata: z.record(z.unknown()).default({}),
});
export type CreateAiAgentInput = z.infer<typeof createAiAgentSchema>;

export const runAiAgentSchema = z.object({
  organizationId: z.string().uuid(),
  agentId: z.string().uuid(),
  input: z.record(z.unknown()).default({}),
  prompt: z.string().min(1).max(8000).optional(),
});
export type RunAiAgentInput = z.infer<typeof runAiAgentSchema>;

export const listAiQuerySchema = paginationQuerySchema.extend({
  status: z.string().optional(),
  agentId: z.string().uuid().optional(),
});

export const AI_KAFKA_TOPICS = {
  CONVERSATION_CREATED: 'gain.ai.conversation.created',
  MESSAGE_CREATED: 'gain.ai.message.created',
  AGENT_CREATED: 'gain.ai.agent.created',
  RUN_COMPLETED: 'gain.ai.run.completed',
  RUN_FAILED: 'gain.ai.run.failed',
} as const;
