import { CLIENT_SEND_UNDO_HOLD_SECONDS } from './constants.ts';
import {
  FloorAuthorizationError,
  type FloorClientSendApproval,
  type RecipientBasis,
  type SendCOIEmailRequest,
  type SendSpec,
} from './types.ts';

export interface StageClientSendDeps {
  now: () => Date;
  readApproval: (approvalId: string) => Promise<FloorClientSendApproval | null>;
  assertRecipientOnFile: (
    recipient: string,
    basis: RecipientBasis,
    workRequestId: string,
  ) => Promise<void> | void;
  assertCertificateAccess: (
    approverId: string,
    certificateNumber: string,
  ) => Promise<void> | void;
  assertExternalRecipientAllowed: (recipient: string) => Promise<void> | void;
  updateApproval: (
    approvalId: string,
    patch: Partial<FloorClientSendApproval>,
  ) => Promise<FloorClientSendApproval>;
  invokeSendCOIEmail: (payload: SendCOIEmailRequest) => Promise<{
    success: boolean;
    messageId?: string;
  }>;
  logEmail: (payload: {
    workRequestId: string;
    messageId?: string;
    success: boolean;
  }) => Promise<void>;
}

export interface StageClientSendArgs {
  work_request_id: string;
  approval_id: string;
  send_spec: SendSpec;
}

export type StageClientSendResult = {
  status: 'held' | 'sent' | 'delivered' | 'failed_delivery';
  messageId?: string;
};

function assertSendSpecPayloadMatches(sendSpec: SendSpec): SendCOIEmailRequest {
  const payload = sendSpec.payload;
  if (
    !payload
    || typeof payload.to !== 'string'
    || typeof payload.certificateNumber !== 'string'
    || typeof payload.certificateUrl !== 'string'
    || typeof payload.holderName !== 'string'
  ) {
    throw new Error('Floor: send_spec.payload must match SendCOIEmailRequest');
  }

  if (payload.to !== sendSpec.recipient) {
    throw new FloorAuthorizationError(
      'R7: send_spec.payload.to must match on-file recipient, never body-supplied override',
    );
  }

  return payload;
}

/**
 * The ONLY function that should call the mail provider for Floor Tier 3 sends.
 * Wraps send-coi-email request shape exactly.
 */
export async function stageClientSend(
  args: StageClientSendArgs,
  deps: StageClientSendDeps,
): Promise<StageClientSendResult> {
  const approval = await deps.readApproval(args.approval_id);
  if (!approval || approval.status !== 'approved' || !approval.approver_id) {
    throw new FloorAuthorizationError('R7: no valid approval row');
  }

  const payload = assertSendSpecPayloadMatches(args.send_spec);

  await deps.assertRecipientOnFile(
    args.send_spec.recipient,
    args.send_spec.recipient_basis,
    args.work_request_id,
  );
  await deps.assertCertificateAccess(approval.approver_id, payload.certificateNumber);
  await deps.assertExternalRecipientAllowed(args.send_spec.recipient);

  const holdUntil = new Date(deps.now().getTime() + CLIENT_SEND_UNDO_HOLD_SECONDS * 1000);
  await deps.updateApproval(args.approval_id, {
    status: 'held',
    hold_until: holdUntil.toISOString(),
    send_payload: payload,
  });

  // Undo window: send fires only via releaseHeldClientSend after hold_until.
  return { status: 'held' };
}

/** Release a held send after undo window expires (called by sweeper/cron). */
export async function releaseHeldClientSend(
  approvalId: string,
  deps: StageClientSendDeps,
): Promise<StageClientSendResult> {
  const approval = await deps.readApproval(approvalId);
  if (!approval || approval.status !== 'held') {
    throw new FloorAuthorizationError('Floor: approval not in held state');
  }
  if (approval.hold_until && new Date(approval.hold_until) > deps.now()) {
    return { status: 'held' };
  }

  const payload = approval.send_payload;
  const result = await deps.invokeSendCOIEmail(payload);
  await deps.logEmail({
    workRequestId: approval.work_request_id,
    messageId: result.messageId,
    success: result.success,
  });

  await deps.updateApproval(approvalId, {
    status: result.success ? 'sent' : 'failed_delivery',
    message_id: result.messageId ?? null,
  });

  return result.success
    ? { status: 'sent', messageId: result.messageId }
    : { status: 'failed_delivery' };
}
