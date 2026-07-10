export type PipelineStage =
  | 'lead'
  | 'contacted'
  | 'meeting'
  | 'diligence'
  | 'committed'
  | 'closed'
  | 'lost';

const ORDER: PipelineStage[] = [
  'lead',
  'contacted',
  'meeting',
  'diligence',
  'committed',
  'closed',
];

/** Allowed CRM pipeline transitions (forward, skip-forward, or to lost). */
export function canTransitionPipeline(
  from: PipelineStage,
  to: PipelineStage,
): boolean {
  if (from === to) return true;
  if (to === 'lost') return from !== 'closed';
  if (from === 'lost') return to === 'lead' || to === 'contacted';
  if (from === 'closed') return false;
  const fromIdx = ORDER.indexOf(from);
  const toIdx = ORDER.indexOf(to);
  if (fromIdx < 0 || toIdx < 0) return false;
  return toIdx >= fromIdx;
}

export function summarizePipeline(
  investors: Array<{ pipelineStage: string }>,
): Record<string, number> {
  const summary: Record<string, number> = {
    lead: 0,
    contacted: 0,
    meeting: 0,
    diligence: 0,
    committed: 0,
    closed: 0,
    lost: 0,
  };
  for (const investor of investors) {
    const stage = investor.pipelineStage;
    if (stage in summary) summary[stage] = (summary[stage] ?? 0) + 1;
  }
  return summary;
}

export function totalCommitmentsMinor(
  commitments: Array<{ amountMinor: bigint; status: string }>,
): { soft: bigint; hard: bigint; funded: bigint; cancelled: bigint; active: bigint } {
  const totals = {
    soft: 0n,
    hard: 0n,
    funded: 0n,
    cancelled: 0n,
    active: 0n,
  };
  for (const row of commitments) {
    if (row.status === 'soft') totals.soft += row.amountMinor;
    else if (row.status === 'hard') totals.hard += row.amountMinor;
    else if (row.status === 'funded') totals.funded += row.amountMinor;
    else if (row.status === 'cancelled') totals.cancelled += row.amountMinor;
    if (row.status === 'soft' || row.status === 'hard' || row.status === 'funded') {
      totals.active += row.amountMinor;
    }
  }
  return totals;
}
