import {
  createInternalRecipientGuard,
  isTier3SendSpec,
  parseInternalSendAllowlist,
} from './internalSendAllowlist.ts';
import { stageClientSend, type StageClientSendDeps } from './stageClientSend.ts';
import type { FloorClientSendApproval, SendSpec } from './types.ts';

export interface ApproveClientSendStagingDb {
  findFloorSendApproval(workRequestId: string): Promise<FloorClientSendApproval | null>;
  insertFloorSendApproval(row: {
    work_request_id: string;
    approver_id: string;
    status: 'approved';
    recipient: string;
    recipient_basis: SendSpec['recipient_basis'];
    send_payload: SendSpec['payload'];
  }): Promise<FloorClientSendApproval>;
}

export interface MaybeStageClientSendOnApproveArgs {
  workRequestId: string;
  approverId: string;
  sendSpec: SendSpec | null | undefined;
  allowlistRaw: string | undefined | null;
  db: ApproveClientSendStagingDb;
  stageDeps: Omit<
    StageClientSendDeps,
    'readApproval' | 'updateApproval' | 'assertRecipientOnFile' | 'assertCertificateAccess'
  >;
}

export type StageClientSendOnApproveResult =
  | { staged: false; reason: 'internal_only' | 'already_staged' }
  | { staged: true; status: 'held'; approvalId: string };

export async function maybeStageClientSendOnApprove(
  args: MaybeStageClientSendOnApproveArgs,
): Promise<StageClientSendOnApproveResult> {
  if (!isTier3SendSpec(args.sendSpec)) {
    return { staged: false, reason: 'internal_only' };
  }

  const sendSpec = args.sendSpec!;
  const existing = await args.db.findFloorSendApproval(args.workRequestId);
  if (existing) {
    return { staged: false, reason: 'already_staged' };
  }

  const allowlist = parseInternalSendAllowlist(args.allowlistRaw);
  const guard = createInternalRecipientGuard(allowlist);

  const approval = await args.db.insertFloorSendApproval({
    work_request_id: args.workRequestId,
    approver_id: args.approverId,
    status: 'approved',
    recipient: sendSpec.recipient,
    recipient_basis: sendSpec.recipient_basis,
    send_payload: sendSpec.payload,
  });

  let current = approval;
  const deps: StageClientSendDeps = {
    ...args.stageDeps,
    readApproval: async (approvalId) => (approvalId === current.id ? current : null),
    updateApproval: async (_approvalId, patch) => {
      current = { ...current, ...patch };
      return current;
    },
    assertRecipientOnFile: async () => {},
    assertCertificateAccess: async () => {},
    assertExternalRecipientAllowed: guard,
  };

  await stageClientSend(
    {
      work_request_id: args.workRequestId,
      approval_id: approval.id,
      send_spec: sendSpec,
    },
    deps,
  );

  return { staged: true, status: 'held', approvalId: approval.id };
}
