# GAIN AI Chat & Agents

## Status

Implemented in `@gain/platform-api` under `/api/v1/ai` (port **3003**).

## Capabilities

| Capability | Detail |
|------------|--------|
| Agents | Named agents with system prompt, provider, model, tools |
| Conversations | Org-scoped threads optionally bound to an agent |
| Messages | User message → assistant completion (persisted) |
| Runs | Synchronous agent execution with step output |
| Providers | `heuristic` (default, local) · `openai` when `OPENAI_API_KEY` is set |
| Events | Outbox → `gain.ai.*` |
| Console | `/ai` |

## Honest limits

- Heuristic provider does **not** call an LLM; replies are deterministic module-aware text / tool stubs
- Requesting `provider=openai` without `OPENAI_API_KEY` fails explicitly (no fake success)
- No streaming, RAG, tool side-effects against other modules, or multi-agent orchestration yet
- AI Marketplace (catalog/billing) is a separate module — see `docs/ai-marketplace/README.md`

## APIs

OpenAPI: http://localhost:3003/api/docs

- `POST|GET|PATCH /ai/agents…`
- `POST /ai/agents/:id/runs`
- `POST|GET /ai/conversations…`
- `POST /ai/messages`
- `GET /ai/runs…`
