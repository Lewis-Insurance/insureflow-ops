import type { PolicyInForceRow } from './types.ts';

function isAutoLine(lineOfBusiness: string | null | undefined): boolean {
  return (lineOfBusiness ?? '').trim().toLowerCase() === 'auto';
}

/** v1: pick one in-force auto policy for Play 4; optional explicit policy wins. */
export function pickInForceAutoPolicy(
  rows: PolicyInForceRow[],
  preferredPolicyId?: string | null,
): PolicyInForceRow | null {
  const candidates = rows.filter((row) => row.in_force && isAutoLine(row.line_of_business));
  if (candidates.length === 0) return null;

  if (preferredPolicyId) {
    const match = candidates.find((row) => row.policy_id === preferredPolicyId);
    if (match) return match;
  }

  return [...candidates].sort((a, b) => {
    const aExp = a.expiration_date ?? '';
    const bExp = b.expiration_date ?? '';
    return bExp.localeCompare(aExp);
  })[0];
}
