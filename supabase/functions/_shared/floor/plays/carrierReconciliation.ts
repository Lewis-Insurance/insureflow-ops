import type { PolicyInForceRow } from '../types.ts';

export interface CarrierReconciliationPlayInput {
  policies: PolicyInForceRow[];
}

export interface CarrierReconciliationPlayResult {
  play_id: 'carrier.reconcile';
  play_version: '1.0.0';
  tier: 1;
  in_force_count: number;
  lapsed_count: number;
  evaluated_at: string;
  policy_ids_lapsed: string[];
}

/** Play 1 stub: summarize in-force spine from policy_in_force_status rows. */
export function runCarrierReconciliationPlay(
  input: CarrierReconciliationPlayInput,
): CarrierReconciliationPlayResult {
  const lapsed = input.policies.filter((row) => !row.in_force);
  const inForce = input.policies.filter((row) => row.in_force);
  const evaluatedAt = input.policies[0]?.evaluated_at ?? new Date().toISOString();

  return {
    play_id: 'carrier.reconcile',
    play_version: '1.0.0',
    tier: 1,
    in_force_count: inForce.length,
    lapsed_count: lapsed.length,
    evaluated_at: evaluatedAt,
    policy_ids_lapsed: lapsed.map((row) => row.policy_id),
  };
}
