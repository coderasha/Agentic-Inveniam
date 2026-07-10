import { describe, expect, it } from 'vitest';
import {
  canTransitionPipeline,
  summarizePipeline,
  totalCommitmentsMinor,
} from './pipeline';

describe('CRM pipeline', () => {
  it('allows forward and lost transitions', () => {
    expect(canTransitionPipeline('lead', 'meeting')).toBe(true);
    expect(canTransitionPipeline('diligence', 'committed')).toBe(true);
    expect(canTransitionPipeline('meeting', 'lost')).toBe(true);
    expect(canTransitionPipeline('closed', 'lost')).toBe(false);
    expect(canTransitionPipeline('committed', 'lead')).toBe(false);
  });

  it('summarizes pipeline counts', () => {
    expect(
      summarizePipeline([
        { pipelineStage: 'lead' },
        { pipelineStage: 'lead' },
        { pipelineStage: 'closed' },
      ]),
    ).toEqual({
      lead: 2,
      contacted: 0,
      meeting: 0,
      diligence: 0,
      committed: 0,
      closed: 1,
      lost: 0,
    });
  });

  it('totals commitments by status', () => {
    const totals = totalCommitmentsMinor([
      { amountMinor: 100n, status: 'soft' },
      { amountMinor: 200n, status: 'hard' },
      { amountMinor: 50n, status: 'cancelled' },
      { amountMinor: 25n, status: 'funded' },
    ]);
    expect(totals.soft).toBe(100n);
    expect(totals.hard).toBe(200n);
    expect(totals.funded).toBe(25n);
    expect(totals.cancelled).toBe(50n);
    expect(totals.active).toBe(325n);
  });
});
