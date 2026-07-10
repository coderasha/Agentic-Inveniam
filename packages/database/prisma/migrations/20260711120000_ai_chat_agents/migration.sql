-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('heuristic', 'openai');

-- CreateEnum
CREATE TYPE "AiMessageRole" AS ENUM ('system', 'user', 'assistant', 'tool');

-- CreateEnum
CREATE TYPE "AiAgentStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "AiRunStatus" AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "ai_agents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000),
    "system_prompt" VARCHAR(8000) NOT NULL,
    "provider" "AiProvider" NOT NULL DEFAULT 'heuristic',
    "model" VARCHAR(100) NOT NULL DEFAULT 'gain-heuristic-v1',
    "status" "AiAgentStatus" NOT NULL DEFAULT 'draft',
    "tools" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "ai_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "agent_id" UUID,
    "title" VARCHAR(200) NOT NULL DEFAULT 'New conversation',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" "AiMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "provider" "AiProvider",
    "model" VARCHAR(100),
    "token_estimate" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_agent_runs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "status" "AiRunStatus" NOT NULL DEFAULT 'queued',
    "provider" "AiProvider" NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "input" JSONB NOT NULL DEFAULT '{}',
    "prompt" VARCHAR(8000),
    "output" JSONB,
    "error_message" VARCHAR(2000),
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_agents_organization_id_status_idx" ON "ai_agents"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ai_agents_organization_id_slug_key" ON "ai_agents"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "ai_conversations_organization_id_updated_at_idx" ON "ai_conversations"("organization_id", "updated_at");

-- CreateIndex
CREATE INDEX "ai_conversations_agent_id_idx" ON "ai_conversations"("agent_id");

-- CreateIndex
CREATE INDEX "ai_messages_conversation_id_created_at_idx" ON "ai_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_messages_organization_id_created_at_idx" ON "ai_messages"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_agent_runs_organization_id_status_created_at_idx" ON "ai_agent_runs"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "ai_agent_runs_agent_id_created_at_idx" ON "ai_agent_runs"("agent_id", "created_at");

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "ai_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_runs" ADD CONSTRAINT "ai_agent_runs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "ai_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
