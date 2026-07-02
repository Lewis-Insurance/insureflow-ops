import { runCarrierReconciliationPlay } from './plays/carrierReconciliation.ts';
import { runCoverageGapRoundoutPlay } from './plays/coverageGapRoundout.ts';
import {
  detectNonpayCancelCandidates,
  summarizeNonpayCancelWatch,
} from './plays/nonpayCancelWatch.ts';
import {
  runOpenItemNudgePlay,
  summarizeOpenItemNudgePlay,
  type OpenQuoteRow,
} from './plays/openItemNudge.ts';
import { runSuspenseSweepPlay } from './plays/suspenseSweep.ts';
import {
  planCarrierReconciliationCards,
  planCoverageGapRoundoutCards,
  planNonpayCancelWatchCards,
  planOpenItemNudgeCards,
  planSuspenseSweepCards,
  type InternalPlayCardPlan,
} from './internalPlayCards.ts';
import { persistInternalPlayCards, type PersistPlayCardsResult, type PlayCardsDb } from './persistInternalPlayCards.ts';
import type { CoverageGapOpportunityRow } from './plays/coverageGapRoundout.ts';
import type { PolicyInForceRow, SuspenseTaskRow } from './types.ts';

export interface RunInternalPlaysInput {
  agency_workspace_id: string;
  policies: PolicyInForceRow[];
  tasks: SuspenseTaskRow[];
  coverageGapOpportunities?: CoverageGapOpportunityRow[];
  openQuotes?: OpenQuoteRow[];
  dayKey?: string;
  play1Limit?: number;
  play3Limit?: number;
  play4Limit?: number;
  play5Limit?: number;
  play6Limit?: number;
  defaultOwnerId?: string | null;
  gapRoundoutOwnerId?: string | null;
  openItemNudgeOwnerId?: string | null;
  nonpayWatchOwnerId?: string | null;
  ownerByAccountId?: Record<string, string | null | undefined>;
  /** When set, only persist cards for these play_ids. */
  playIds?: string[];
}

export interface RunInternalPlaysPlan {
  play1_summary: ReturnType<typeof runCarrierReconciliationPlay>;
  play3_count: number;
  play4_summary: ReturnType<typeof runCoverageGapRoundoutPlay>;
  play5_summary: ReturnType<typeof summarizeOpenItemNudgePlay>;
  play6_summary: ReturnType<typeof summarizeNonpayCancelWatch>;
  plans: InternalPlayCardPlan[];
}

export function planInternalPlays(input: RunInternalPlaysInput): RunInternalPlaysPlan {
  const dayKey = input.dayKey ?? new Date().toISOString().slice(0, 10);
  const play1Summary = runCarrierReconciliationPlay({ policies: input.policies });
  const play3Items = runSuspenseSweepPlay(input.tasks, new Date(), input.play3Limit ?? 10);
  const gapOpportunities = input.coverageGapOpportunities ?? [];
  const play4Summary = runCoverageGapRoundoutPlay(gapOpportunities);
  const play5Items = runOpenItemNudgePlay(
    input.openQuotes ?? [],
    input.tasks,
    new Date(),
    input.play5Limit ?? 5,
  );
  const play5Summary = summarizeOpenItemNudgePlay(play5Items);
  const nonpayCandidates = detectNonpayCancelCandidates(input.policies);
  const play6Summary = summarizeNonpayCancelWatch(nonpayCandidates);

  const play1Cards = planCarrierReconciliationCards(input.policies, play1Summary, {
    dayKey,
    limit: input.play1Limit ?? 10,
    defaultOwnerId: input.defaultOwnerId ?? null,
    ownerByAccountId: input.ownerByAccountId,
  });
  const play3Cards = planSuspenseSweepCards(play3Items, input.tasks, {
    dayKey,
    limit: input.play3Limit ?? 10,
  });
  const play4Cards = planCoverageGapRoundoutCards(gapOpportunities, play4Summary, {
    dayKey,
    limit: input.play4Limit ?? 5,
    defaultOwnerId: input.gapRoundoutOwnerId ?? input.defaultOwnerId ?? null,
    ownerByAccountId: input.ownerByAccountId,
  });
  const play5Cards = planOpenItemNudgeCards(play5Items, {
    dayKey,
    limit: input.play5Limit ?? 5,
    defaultOwnerId: input.openItemNudgeOwnerId ?? input.defaultOwnerId ?? null,
    ownerByAccountId: input.ownerByAccountId,
  });
  const play6Cards = planNonpayCancelWatchCards(nonpayCandidates, {
    dayKey,
    limit: input.play6Limit ?? 5,
    defaultOwnerId: input.nonpayWatchOwnerId ?? input.defaultOwnerId ?? null,
    ownerByAccountId: input.ownerByAccountId,
  });

  let plans = [...play1Cards, ...play3Cards, ...play4Cards, ...play5Cards, ...play6Cards];
  if (input.playIds?.length) {
    const allowed = new Set(input.playIds);
    plans = plans.filter((plan) => allowed.has(plan.play_id));
  }

  return {
    play1_summary: play1Summary,
    play3_count: play3Items.length,
    play4_summary: play4Summary,
    play5_summary: play5Summary,
    play6_summary: play6Summary,
    plans,
  };
}

export async function runInternalPlays(
  db: PlayCardsDb,
  input: RunInternalPlaysInput,
): Promise<
  PersistPlayCardsResult & {
    play1_summary: RunInternalPlaysPlan['play1_summary'];
    play3_count: number;
    play4_summary: RunInternalPlaysPlan['play4_summary'];
    play5_summary: RunInternalPlaysPlan['play5_summary'];
    play6_summary: RunInternalPlaysPlan['play6_summary'];
    planned: number;
  }
> {
  const planned = planInternalPlays(input);
  const persisted = await persistInternalPlayCards(db, input.agency_workspace_id, planned.plans);
  return {
    ...persisted,
    play1_summary: planned.play1_summary,
    play3_count: planned.play3_count,
    play4_summary: planned.play4_summary,
    play5_summary: planned.play5_summary,
    play6_summary: planned.play6_summary,
    planned: planned.plans.length,
  };
}
