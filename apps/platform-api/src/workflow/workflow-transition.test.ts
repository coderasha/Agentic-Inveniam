import { describe, expect, it } from 'vitest';
import { shouldCompleteRun } from './workflow.module';

describe('workflow completion transition', () => {
  it('completes only when every task is completed or skipped', () => {
    expect(shouldCompleteRun(['completed', 'skipped', 'completed'])).toBe(true);
    expect(shouldCompleteRun(['completed', 'pending'])).toBe(false);
    expect(shouldCompleteRun([])).toBe(false);
  });
});
