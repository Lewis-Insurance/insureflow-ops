import { runCarrierReconciliationPlay } from './plays/carrierReconciliation.ts';
import { runSuspenseSweepPlay } from './plays/suspenseSweep.ts';
import {
  planCarrierReconciliationCards,
  planSuspenseSweepCards,
  type InternalPlayCardPlan,
} from './internalPlayCards.ts';
import { persistInternalPlayCards, type PersistPlayCardsResult, type PlayCardsDb } from './persistInternalPlayCards.ts';
import type { PolicyInForceRow, SuspenseTaskRow } from './types.ts';

export interface RunInternalPlaysInput {
  agency_workspace_id: string;
  policies: PolicyInForceRow[];
  tasks: SuspenseTaskRow[];
  dayKey?: string;
  play1Limit?: number;
  play3Limit?: number;
  defaultOwnerId?: string | null;
  ownerByAccountId?: Record<string, string | null | undefined>;
}

export interface RunInternalPlaysPlan {
  play1_summary: ReturnType<typeof runCarrierReconciliationPlay>;
  play3_count: number;
  plans: InternalPlayCardPlan[];
}

export function planInternalPlays(input: RunInternalPlaysInput): RunInternalPlaysPlan {
  const dayKey = input.dayKey ?? new Date().toISOString().slice(0, 10);
  const play1Summary = runCarrierReconciliationPlay({ policies: input.policies });
  const play3Items = runSuspenseSweepPlay(input.tasks, new Date(), input.play3Limit ?? 10);

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

  return {
    play1_summary: play1Summary,
    play3_count: play3Items.length,
    plans: [...play1Cards, ...play3Cards],
  };
}

export async function runInternalPlays(
  db: PlayCardsDb,
  input: RunInternalPlaysInput,
): Promise<PersistPlayCardsResult & { play1_summary: RunInternalPlaysPlan['play1_summary']; play3_count: number; planned: number }> {
  const planned = planInternalPlays(input);
  const persisted = await persistInternalPlayCards(db, input.agency_workspace_id, planned.plans);
  return {
    ...persisted,
    play1_summary: planned.play1_summary,
    play3_count: planned.play3_count,
    planned: planned.plans.length,
  };
}
