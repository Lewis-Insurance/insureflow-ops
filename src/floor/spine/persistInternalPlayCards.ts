import { buildStubInternalPackage } from '../floorAction.ts';
import type { InternalPlayCardPlan } from './internalPlayCards.ts';
import { clientRefForPlan } from './internalPlayCards.ts';

export interface PersistPlayCardsResult {
  created: number;
  idempotent: number;
  skipped: number;
  package_refs: string[];
  errors: string[];
}

export interface PlayCardsDb {
  insertWorkRequest(row: Record<string, unknown>): Promise<{ id: string } | { error: string; code?: string }>;
  findExistingWorkRequest(action: string, idempotencyKey: string): Promise<{ decision_package_id: string | null } | null>;
  findPackageId(packageId: string): Promise<boolean>;
  insertDecisionPackage(row: Record<string, unknown>): Promise<{ id: string; work_request_id: string } | { error: string }>;
  linkWorkRequestPackage(workRequestId: string, packageId: string): Promise<void>;
  insertWorkRequestEvent(row: Record<string, unknown>): Promise<void>;
}

export async function persistInternalPlayCards(
  db: PlayCardsDb,
  agencyWorkspaceId: string,
  plans: InternalPlayCardPlan[],
): Promise<PersistPlayCardsResult> {
  const result: PersistPlayCardsResult = {
    created: 0,
    idempotent: 0,
    skipped: 0,
    package_refs: [],
    errors: [],
  };

  for (const plan of plans) {
    const clientRef = clientRefForPlan(plan);
    const stub = buildStubInternalPackage({
      playId: plan.play_id,
      playVersion: plan.play_version,
      clientRef,
      headline: plan.headline,
      summary: plan.summary,
    });

    const workRequestRow = {
      agency_workspace_id: agencyWorkspaceId,
      action: 'create_internal_package',
      play_id: plan.play_id,
      play_version: plan.play_version,
      source: 'heartbeat',
      client_ref: plan.client_account_id,
      owner_id: plan.owner_id,
      status: 'awaiting_approval',
      idempotency_key: plan.idempotency_key,
      request_body: {
        clientRef,
        policyRef: plan.policy_ref,
        taskId: plan.task_id,
        phase: 1,
        internal_only: true,
      },
    };

    const workRequest = await db.insertWorkRequest(workRequestRow);
    if ('error' in workRequest) {
      if (workRequest.code === '23505') {
        const existing = await db.findExistingWorkRequest('create_internal_package', plan.idempotency_key);
        if (existing?.decision_package_id && (await db.findPackageId(existing.decision_package_id))) {
          result.idempotent += 1;
          result.package_refs.push(`package:${existing.decision_package_id.replace(/-/g, '')}`);
          continue;
        }
      }
      result.errors.push(workRequest.error);
      result.skipped += 1;
      continue;
    }

    const packageRow = {
      work_request_id: workRequest.id,
      play_id: stub.play_id,
      play_version: stub.play_version,
      headline: plan.headline,
      summary: plan.summary,
      risk: plan.risk,
      client_ref: plan.client_account_id,
      document_ref: stub.document_ref,
      fields: stub.fields,
      diff: stub.diff,
      send_spec: stub.send_spec,
    };

    const decisionPackage = await db.insertDecisionPackage(packageRow);
    if ('error' in decisionPackage) {
      result.errors.push(decisionPackage.error);
      result.skipped += 1;
      continue;
    }

    await db.linkWorkRequestPackage(workRequest.id, decisionPackage.id);
    await db.insertWorkRequestEvent({
      work_request_id: workRequest.id,
      from_state: 'received',
      to_state: 'awaiting_approval',
      actor_id: plan.owner_id,
      reason: 'phase1_play_card_created',
    });

    result.created += 1;
    result.package_refs.push(`package:${decisionPackage.id.replace(/-/g, '')}`);
  }

  return result;
}
