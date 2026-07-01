import type { CoverageDiff, CoverageDiffLine, RiskLevel } from './types.ts';

export function computeCoverageDiffOverall(lines: CoverageDiffLine[]): RiskLevel {
  if (lines.some((line) => line.status === 'not_backed')) return 'red';
  if (lines.some((line) => line.status === 'short')) return 'red';
  if (lines.length === 0) return 'yellow';
  return 'green';
}

export function buildCoverageDiff(lines: CoverageDiffLine[]): CoverageDiff {
  return {
    lines,
    overall: computeCoverageDiffOverall(lines),
  };
}

export function assertInForceForTier3Send(inForce: boolean, policyId: string): void {
  if (!inForce) {
    throw new Error(`Floor: policy ${policyId} is not in force; Tier 3 send blocked`);
  }
}

/**
 * In-force logic mirrors policy_in_force_status view (Spine D).
 * Kept in TS for unit tests without DB.
 */
export function evaluatePolicyInForce(input: {
  status: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  cancelled_at: string | null;
  deleted_at: string | null;
  asOf?: Date;
}): boolean {
  if (input.deleted_at) return false;
  if (input.cancelled_at) return false;

  const status = (input.status ?? '').toLowerCase();
  if (status === 'cancelled' || status === 'expired' || status === 'pending_cancel') {
    return false;
  }

  const asOf = input.asOf ?? new Date();
  const today = asOf.toISOString().slice(0, 10);

  if (input.expiration_date && input.expiration_date < today) return false;
  if (input.effective_date && input.effective_date > today) return false;

  return status === 'active' || status === 'bound' || status === 'pending';
}
