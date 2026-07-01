import type { PolicyInForceRow, RiskLevel, SuspenseSweepItem, SuspenseTaskRow } from './types.ts';
import type { CarrierReconciliationPlayResult } from './plays/carrierReconciliation.ts';
import type { CoverageGapOpportunityRow } from './plays/coverageGapRoundout.ts';
import type { CoverageGapRoundoutPlayResult } from './plays/coverageGapRoundout.ts';
import type { NonpayCancelCandidate } from './plays/nonpayCancelWatch.ts';
import type { OpenItemNudgeItem } from './plays/openItemNudge.ts';

export interface InternalPlayCardPlan {
  play_id: string;
  play_version: string;
  idempotency_key: string;
  client_account_id: string;
  owner_id: string | null;
  headline: string;
  summary: string;
  risk: RiskLevel;
  policy_ref: string | null;
  task_id: string | null;
}

function accountOpaqueRef(accountId: string): string {
  return `account:${accountId.replace(/-/g, '')}`;
}

function policyOpaqueRef(policyId: string): string {
  return `policy:${policyId.replace(/-/g, '')}`;
}

/** Play 1: one internal card per lapsed policy with a resolvable account. */
export function planCarrierReconciliationCards(
  policies: PolicyInForceRow[],
  summary: CarrierReconciliationPlayResult,
  opts: {
    dayKey: string;
    limit?: number;
    defaultOwnerId?: string | null;
    ownerByAccountId?: Record<string, string | null | undefined>;
  },
): InternalPlayCardPlan[] {
  const limit = opts.limit ?? 10;
  const lapsed = policies.filter((row) => !row.in_force && row.account_id);

  return lapsed.slice(0, limit).map((row) => ({
    play_id: summary.play_id,
    play_version: summary.play_version,
    idempotency_key: `play1:${summary.play_id}:${row.policy_id}:${opts.dayKey}`,
    client_account_id: row.account_id!,
    owner_id: opts.ownerByAccountId?.[row.account_id!] ?? opts.defaultOwnerId ?? null,
    headline: 'Policy not in force — review',
    summary: `Policy ${policyOpaqueRef(row.policy_id)} is not in force as of ${summary.evaluated_at.slice(0, 10)}. Internal review only; no client send.`,
    risk: 'yellow' as RiskLevel,
    policy_ref: policyOpaqueRef(row.policy_id),
    task_id: null,
  }));
}

/** Play 3: internal nudge cards for ranked open suspense tasks. */
export function planSuspenseSweepCards(
  items: SuspenseSweepItem[],
  tasks: SuspenseTaskRow[],
  opts: { dayKey: string; limit?: number },
): InternalPlayCardPlan[] {
  const limit = opts.limit ?? 10;
  const byId = new Map(tasks.map((task) => [task.id, task]));

  const plans: InternalPlayCardPlan[] = [];
  for (const item of items) {
    if (plans.length >= limit) break;
    const task = byId.get(item.task_id);
    if (!task?.account_id) continue;

    plans.push({
      play_id: 'suspense.sweep',
      play_version: '1.0.0',
      idempotency_key: `play3:suspense.sweep:${item.task_id}:${opts.dayKey}`,
      client_account_id: task.account_id,
      owner_id: item.owner_id,
      headline: 'Suspense follow-up',
      summary: `${item.title} — ${item.reason}. Internal owner nudge; no client send.`,
      risk: item.severity_score >= 75 ? ('red' as RiskLevel) : ('yellow' as RiskLevel),
      policy_ref: null,
      task_id: item.task_id,
    });
  }

  return plans;
}

/** Play 4: internal cards for new coverage gap opportunities. */
export function planCoverageGapRoundoutCards(
  opportunities: CoverageGapOpportunityRow[],
  summary: CoverageGapRoundoutPlayResult,
  opts: {
    dayKey: string;
    limit?: number;
    defaultOwnerId?: string | null;
    ownerByAccountId?: Record<string, string | null | undefined>;
  },
): InternalPlayCardPlan[] {
  const limit = opts.limit ?? 5;

  return opportunities.slice(0, limit).map((row) => ({
    play_id: summary.play_id,
    play_version: summary.play_version,
    idempotency_key: `play4:${summary.play_id}:${row.id}:${opts.dayKey}`,
    client_account_id: row.account_id,
    owner_id: opts.ownerByAccountId?.[row.account_id] ?? opts.defaultOwnerId ?? null,
    headline: 'Coverage gap — roundout review',
    summary: `${row.rationale?.trigger_reason ?? row.recommended_next_step ?? 'Gap detected'}. Internal review only; no client send.`,
    risk: (row.severity === 'high' ? 'red' : row.severity === 'medium' ? 'yellow' : 'green') as RiskLevel,
    policy_ref: null,
    task_id: null,
  }));
}

/** Play 5: nudge cards for open quotes and non-suspense tasks. */
export function planOpenItemNudgeCards(
  items: OpenItemNudgeItem[],
  opts: { dayKey: string; limit?: number },
): InternalPlayCardPlan[] {
  const limit = opts.limit ?? 5;

  return items.slice(0, limit).map((item) => ({
    play_id: 'open.item.nudge',
    play_version: '1.0.0',
    idempotency_key: `play5:open.item.nudge:${item.kind}:${item.item_id}:${opts.dayKey}`,
    client_account_id: item.account_id,
    owner_id: null,
    headline: item.kind === 'quote' ? 'Open quote follow-up' : 'Open item follow-up',
    summary: `${item.title} — ${item.reason}. Internal owner nudge; no client send.`,
    risk: item.severity_score >= 50 ? ('yellow' as RiskLevel) : ('green' as RiskLevel),
    policy_ref: null,
    task_id: item.kind === 'task' ? item.item_id : null,
  }));
}

/** Play 6: watchlist cards for non-pay cancel candidates. */
export function planNonpayCancelWatchCards(
  candidates: NonpayCancelCandidate[],
  opts: { dayKey: string; limit?: number; defaultOwnerId?: string | null },
): InternalPlayCardPlan[] {
  const limit = opts.limit ?? 5;

  return candidates.slice(0, limit).map((row) => ({
    play_id: 'nonpay.cancel.watch',
    play_version: '1.0.0',
    idempotency_key: `play6:nonpay.cancel.watch:${row.policy_id}:${opts.dayKey}`,
    client_account_id: row.account_id!,
    owner_id: opts.defaultOwnerId ?? null,
    headline: 'Non-pay cancel watch',
    summary: `${row.reason}. Policy ${policyOpaqueRef(row.policy_id)}. Internal watch only.`,
    risk: 'red' as RiskLevel,
    policy_ref: policyOpaqueRef(row.policy_id),
    task_id: null,
  }));
}

export function clientRefForPlan(plan: InternalPlayCardPlan): string {
  return accountOpaqueRef(plan.client_account_id);
}
