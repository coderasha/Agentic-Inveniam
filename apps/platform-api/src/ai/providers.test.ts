import { describe, expect, it } from 'vitest';
import {
  completeChat,
  resolveAiProvider,
  runAgentCompletion,
} from './providers';

describe('ai providers', () => {
  it('defaults to heuristic and rejects openai without key', () => {
    expect(resolveAiProvider(undefined, undefined)).toBe('heuristic');
    expect(resolveAiProvider('heuristic', undefined)).toBe('heuristic');
    expect(() => resolveAiProvider('openai', undefined)).toThrow(/OPENAI_API_KEY/);
    expect(resolveAiProvider('openai', 'sk-test')).toBe('openai');
  });

  it('returns module-aware heuristic chat replies', async () => {
    const trust = await completeChat('heuristic', {
      messages: [{ role: 'user', content: 'How does trust scoring work?' }],
      model: 'gain-heuristic-v1',
    });
    expect(trust.provider).toBe('heuristic');
    expect(trust.content).toMatch(/Trust Engine/i);

    const generic = await completeChat('heuristic', {
      systemPrompt: 'You are a portfolio analyst.',
      messages: [{ role: 'user', content: 'Tell me something random' }],
      model: 'gain-heuristic-v1',
    });
    expect(generic.content).toMatch(/Heuristic reply/);
    expect(generic.content).toMatch(/portfolio analyst/);
  });

  it('executes heuristic agent tools deterministically', async () => {
    const result = await runAgentCompletion('heuristic', {
      systemPrompt: 'Assess readiness',
      tools: ['extract_fields', 'risk_flags', 'compliance_hint'],
      prompt: 'Check this asset',
      input: { name: 'Tower', trustScore: 0.2, status: 'draft' },
      model: 'gain-heuristic-v1',
    });
    expect(result.provider).toBe('heuristic');
    expect(result.steps).toHaveLength(3);
    const risk = result.steps[1]?.result as { flags: string[] };
    expect(risk.flags).toEqual(
      expect.arrayContaining(['low_trust_score', 'draft_status']),
    );
  });
});
