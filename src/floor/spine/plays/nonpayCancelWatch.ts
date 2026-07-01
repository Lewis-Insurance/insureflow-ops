import type { PolicyInForceRow } from '../types.ts';

export interface NonpayCancelCandidate {
  policy_id: string;
  account_id: string | null;
  policy_number: string;
  reason: string;
}

export interface NonpayCancelWatchPlayResult {
  play_id: 'nonpay.cancel.watch';
  play_version: '1.0.0';
  tier: 1;
  candidate_count: number;
}

/**
 * Play 6 scaffold: detect non-pay cancel risk candidates.
 * FL statutory notice window placeholder — Brian gate before production rules.
 */
export function detectNonpayCancelCandidates(policies: PolicyInForceRow[]): NonpayCancelCandidate[] {
  return policies
    .filter((row) => row.in_force && row.account_id)
    .filter((row) => {
      const bap = row.bap_details as Record<string, unknown> | null;
      const statusHint = String(bap?.payment_status ?? bap?.billing_status ?? '').toLowerCase();
      return statusHint.includes('nonpay') || statusHint.includes('cancel');
    })
    .map((row) => ({
      policy_id: row.policy_id,
      account_id: row.account_id,
      policy_number: row.policy_number,
      reason: 'Non-pay / cancel signal in policy spine (FL notice-day rules pending Brian gate)',
    }));
}

export function summarizeNonpayCancelWatch(candidates: NonpayCancelCandidate[]): NonpayCancelWatchPlayResult {
  return {
    play_id: 'nonpay.cancel.watch',
    play_version: '1.0.0',
    tier: 1,
    candidate_count: candidates.length,
  };
}
