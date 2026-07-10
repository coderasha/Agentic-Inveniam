export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
};

export type CompletionRequest = {
  systemPrompt?: string;
  messages: ChatMessage[];
  model: string;
};

export type CompletionResult = {
  content: string;
  provider: 'heuristic' | 'openai';
  model: string;
  tokenEstimate: number;
  metadata: Record<string, unknown>;
};

export type AgentRunRequest = {
  systemPrompt: string;
  tools: string[];
  prompt?: string;
  input: Record<string, unknown>;
  model: string;
};

export type AgentRunResult = {
  summary: string;
  steps: Array<Record<string, unknown>>;
  provider: 'heuristic' | 'openai';
  model: string;
  metadata: Record<string, unknown>;
};

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

const MODULE_HINTS: Array<{ match: RegExp; answer: string }> = [
  {
    match: /\b(trust|attestation|anchor)\b/i,
    answer:
      'Trust Engine scores assets from attestations and anchors. Use /trust APIs to compute scores and record offchain anchors.',
  },
  {
    match: /\b(provenance|lineage|hash)\b/i,
    answer:
      'Data Provenance stores hash-chained records and lineage links. Verify chains via /provenance before relying on downstream valuations.',
  },
  {
    match: /\b(valuat|dcf|nav|comps)\b/i,
    answer:
      'Continuous Valuation runs income/DCF/comps/NAV/cost/hybrid models. Create a model then trigger a sync run under /valuations.',
  },
  {
    match: /\b(token|mint|burn|ledger)\b/i,
    answer:
      'Tokenization maintains an offchain ledger (mint/burn/transfer/freeze). Polygon/Fabric connectors remain pending — do not assume on-chain settlement.',
  },
  {
    match: /\b(market|listing|order|trade)\b/i,
    answer:
      'Marketplace supports listings with limit/market orders and matching. Trades are recorded under /marketplace.',
  },
  {
    match: /\b(portfolio|position|nav)\b/i,
    answer:
      'Portfolio OS tracks positions, NAV, and snapshots. Manage holdings via /portfolios.',
  },
  {
    match: /\b(crm|investor|pipeline|commitment)\b/i,
    answer:
      'Investor CRM covers investors, pipeline stages, interactions, and commitments at /crm.',
  },
  {
    match: /\b(compliance|policy|finding|case)\b/i,
    answer:
      'Compliance evaluates deterministic policy rules against a subject snapshot. Findings and cases live under /compliance.',
  },
  {
    match: /\b(twin|digital twin|signal)\b/i,
    answer:
      'Digital Twin Engine models assets with attributes, relationships, signals, and insights on twin-api (:3002).',
  },
  {
    match: /\b(graph|traverse|bfs)\b/i,
    answer:
      'Knowledge Graph is a Postgres property graph synced from twins/docs/assets. Traverse via /graph.',
  },
];

function heuristicChat(request: CompletionRequest): CompletionResult {
  const lastUser = [...request.messages].reverse().find((m) => m.role === 'user');
  const question = lastUser?.content?.trim() || '';
  const hint = MODULE_HINTS.find((item) => item.match.test(question));
  const systemNote = request.systemPrompt
    ? `Agent context: ${request.systemPrompt.slice(0, 240)}${request.systemPrompt.length > 240 ? '…' : ''}\n\n`
    : '';

  let content: string;
  if (!question) {
    content = `${systemNote}Ask a question about GAIN modules (trust, provenance, valuation, tokenization, marketplace, portfolio, CRM, compliance, twins, graph).`;
  } else if (hint) {
    content = `${systemNote}${hint.answer}`;
  } else if (/\b(help|what can you|capabilities)\b/i.test(question)) {
    content = `${systemNote}I am the GAIN heuristic assistant (no external LLM). I can orient you on Identity, Twins, Documents, Assets, Graph, Provenance, Trust, Valuation, Tokenization, Marketplace, Portfolio, CRM, Compliance, and this AI Chat/Agents module. For generative answers, configure OPENAI_API_KEY and select provider=openai.`;
  } else {
    content = `${systemNote}Heuristic reply (provider=heuristic, model=${request.model}): I received “${question.slice(0, 280)}”. I do not invent live portfolio numbers or call external models unless OpenAI is configured. Rephrase with a GAIN module keyword, or run an agent with tools for structured output.`;
  }

  return {
    content,
    provider: 'heuristic',
    model: request.model || 'gain-heuristic-v1',
    tokenEstimate: estimateTokens(content),
    metadata: { mode: 'heuristic', matchedHint: Boolean(hint) },
  };
}

function heuristicAgentRun(request: AgentRunRequest): AgentRunResult {
  const tools = request.tools.length > 0 ? request.tools : ['summarize'];
  const steps = tools.map((tool, index) => {
    const base = {
      step: index + 1,
      tool,
      status: 'completed' as const,
    };
    switch (tool) {
      case 'summarize':
        return {
          ...base,
          result: {
            promptPreview: (request.prompt ?? '').slice(0, 200),
            inputKeys: Object.keys(request.input),
            note: 'Deterministic summary of run input (no LLM).',
          },
        };
      case 'extract_fields':
        return {
          ...base,
          result: {
            fields: Object.entries(request.input).map(([key, value]) => ({
              key,
              type: typeof value,
              present: value !== null && value !== undefined && value !== '',
            })),
          },
        };
      case 'risk_flags': {
        const flags: string[] = [];
        if (Number(request.input.trustScore ?? 1) < 0.5) flags.push('low_trust_score');
        if (request.input.status === 'draft') flags.push('draft_status');
        if (!request.input.name) flags.push('missing_name');
        return { ...base, result: { flags } };
      }
      case 'compliance_hint':
        return {
          ...base,
          result: {
            suggestion:
              'Run POST /compliance/checks with a policyId and subjectSnapshot before proceeding.',
          },
        };
      default:
        return {
          ...base,
          result: {
            acknowledged: true,
            message: `Tool “${tool}” executed heuristically with no external side effects.`,
          },
        };
    }
  });

  const summary = [
    `Agent run completed via heuristic provider (${request.model}).`,
    `System prompt length: ${request.systemPrompt.length}.`,
    `Tools executed: ${tools.join(', ')}.`,
    request.prompt ? `Prompt: ${request.prompt.slice(0, 160)}` : 'No free-form prompt supplied.',
  ].join(' ');

  return {
    summary,
    steps,
    provider: 'heuristic',
    model: request.model || 'gain-heuristic-v1',
    metadata: { toolCount: tools.length },
  };
}

async function openaiChat(
  request: CompletionRequest,
  apiKey: string,
): Promise<CompletionResult> {
  const model = request.model || 'gpt-4o-mini';
  const messages: Array<{ role: string; content: string }> = [];
  if (request.systemPrompt) {
    messages.push({ role: 'system', content: request.systemPrompt });
  }
  for (const message of request.messages) {
    if (message.role === 'tool') continue;
    messages.push({ role: message.role, content: message.content });
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI chat failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { total_tokens?: number };
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('OpenAI returned an empty completion');
  }

  return {
    content,
    provider: 'openai',
    model,
    tokenEstimate: data.usage?.total_tokens ?? estimateTokens(content),
    metadata: { usage: data.usage ?? null },
  };
}

async function openaiAgentRun(
  request: AgentRunRequest,
  apiKey: string,
): Promise<AgentRunResult> {
  const completion = await openaiChat(
    {
      systemPrompt: `${request.systemPrompt}\n\nYou are executing an agent run. Available tools: ${
        request.tools.join(', ') || 'none'
      }. Respond with a concise operational summary.`,
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            prompt: request.prompt ?? null,
            input: request.input,
            tools: request.tools,
          }),
        },
      ],
      model: request.model || 'gpt-4o-mini',
    },
    apiKey,
  );

  return {
    summary: completion.content,
    steps: [
      {
        step: 1,
        tool: 'openai_completion',
        status: 'completed',
        result: { content: completion.content },
      },
    ],
    provider: 'openai',
    model: completion.model,
    metadata: completion.metadata,
  };
}

export function resolveAiProvider(
  requested: 'heuristic' | 'openai' | undefined,
  openaiApiKey: string | undefined,
): 'heuristic' | 'openai' {
  if (requested === 'openai') {
    if (!openaiApiKey) {
      throw new Error(
        'provider=openai requires OPENAI_API_KEY to be configured on platform-api',
      );
    }
    return 'openai';
  }
  return 'heuristic';
}

export async function completeChat(
  provider: 'heuristic' | 'openai',
  request: CompletionRequest,
  openaiApiKey?: string,
): Promise<CompletionResult> {
  if (provider === 'openai') {
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    return openaiChat(request, openaiApiKey);
  }
  return heuristicChat(request);
}

export async function runAgentCompletion(
  provider: 'heuristic' | 'openai',
  request: AgentRunRequest,
  openaiApiKey?: string,
): Promise<AgentRunResult> {
  if (provider === 'openai') {
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    return openaiAgentRun(request, openaiApiKey);
  }
  return heuristicAgentRun(request);
}
