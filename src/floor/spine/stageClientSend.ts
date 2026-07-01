import { CLIENT_SEND_UNDO_HOLD_SECONDS } from './constants.ts';
import {
  mintFloorFenceApprovalForSurface,
  type MintFloorFenceApprovalDeps,
} from './mintFloorFenceApproval.ts';
import {
  FloorAuthorizationError,
  FLOOR_SEND_SURFACE_KEY,
  type FloorClientSendApproval,
  type RecipientBasis,
  type SendCOIEmailRequest,
  type SendIdCardEmailRequest,
  type SendSpec,
  type Tier3EmailPayload,
  type Tier3EmailSurface,
} from './types.ts';

export type StoredSendPayload = Tier3EmailPayload & Record<string, unknown>;

export interface StageClientSendDeps {
  now: () => Date;
  readApproval: (approvalId: string) => Promise<FloorClientSendApproval | null>;
  assertRecipientOnFile: (
    recipient: string,
    basis: RecipientBasis,
    workRequestId: string,
  ) => Promise<void> | void;
  assertCertificateAccess?: (
    approverId: string,
    certificateNumber: string,
  ) => Promise<void> | void;
  assertPolicyInForce?: (
    approverId: string,
    policyNumber: string,
  ) => Promise<void> | void;
  assertExternalRecipientAllowed: (recipient: string) => Promise<void> | void;
  updateApproval: (
    approvalId: string,
    patch: Partial<FloorClientSendApproval>,
  ) => Promise<FloorClientSendApproval>;
  invokeTier3EmailSend: (
    surface: Tier3EmailSurface,
    payload: StoredSendPayload,
  ) => Promise<{
    success: boolean;
    messageId?: string;
  }>;
  logEmail: (payload: {
    workRequestId: string;
    messageId?: string;
    success: boolean;
    surface: Tier3EmailSurface;
  }) => Promise<void>;
  mintFloorFenceApproval?: MintFloorFenceApprovalDeps;
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

export function readSendSurfaceFromStoredPayload(payload: StoredSendPayload): Tier3EmailSurface {
  const surface = payload[FLOOR_SEND_SURFACE_KEY];
  return surface === 'send-id-card-email' ? 'send-id-card-email' : 'send-coi-email';
}

export function wrapPayloadWithSurface(
  surface: Tier3EmailSurface,
  payload: Tier3EmailPayload,
): StoredSendPayload {
  return {
    [FLOOR_SEND_SURFACE_KEY]: surface,
    ...payload,
  };
}

export function stripFloorSendMetadata(payload: StoredSendPayload): Tier3EmailPayload {
  const { [FLOOR_SEND_SURFACE_KEY]: _surface, ...rest } = payload;
  return rest as Tier3EmailPayload;
}

function assertCoiPayloadMatches(sendSpec: SendSpec): SendCOIEmailRequest {
  const payload = sendSpec.payload as SendCOIEmailRequest;
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

function assertIdCardPayloadMatches(sendSpec: SendSpec): SendIdCardEmailRequest {
  const payload = sendSpec.payload as SendIdCardEmailRequest;
  if (
    !payload
    || typeof payload.to !== 'string'
    || typeof payload.policyNumber !== 'string'
    || typeof payload.idCardUrl !== 'string'
    || typeof payload.insuredName !== 'string'
  ) {
    throw new Error('Floor: send_spec.payload must match SendIdCardEmailRequest');
  }

  if (payload.to !== sendSpec.recipient) {
    throw new FloorAuthorizationError(
      'R7: send_spec.payload.to must match on-file recipient, never body-supplied override',
    );
  }

  return payload;
}

function assertSendSpecPayloadMatches(sendSpec: SendSpec): Tier3EmailPayload {
  if (sendSpec.send_surface === 'send-id-card-email') {
    return assertIdCardPayloadMatches(sendSpec);
  }
  return assertCoiPayloadMatches(sendSpec);
}

/**
 * The ONLY function that should call the mail provider for Floor Tier 3 sends.
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
  const surface = args.send_spec.send_surface;

  await deps.assertRecipientOnFile(
    args.send_spec.recipient,
    args.send_spec.recipient_basis,
    args.work_request_id,
  );

  if (surface === 'send-id-card-email') {
    const idPayload = payload as SendIdCardEmailRequest;
    if (deps.assertPolicyInForce) {
      await deps.assertPolicyInForce(approval.approver_id, idPayload.policyNumber);
    }
  } else {
    const coiPayload = payload as SendCOIEmailRequest;
    if (deps.assertCertificateAccess) {
      await deps.assertCertificateAccess(approval.approver_id, coiPayload.certificateNumber);
    }
  }

  await deps.assertExternalRecipientAllowed(args.send_spec.recipient);

  const storedPayload = wrapPayloadWithSurface(surface, payload);
  const holdUntil = new Date(deps.now().getTime() + CLIENT_SEND_UNDO_HOLD_SECONDS * 1000);
  await deps.updateApproval(args.approval_id, {
    status: 'held',
    hold_until: holdUntil.toISOString(),
    send_payload: storedPayload,
  });

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

  const storedPayload = approval.send_payload as StoredSendPayload;
  const surface = readSendSurfaceFromStoredPayload(storedPayload);
  const payload = stripFloorSendMetadata(storedPayload);
  let sendPayload: StoredSendPayload = storedPayload;

  if (deps.mintFloorFenceApproval) {
    const minted = await mintFloorFenceApprovalForSurface(
      surface,
      payload,
      approval.approver_id,
      deps.mintFloorFenceApproval,
    );
    sendPayload = wrapPayloadWithSurface(surface, minted.markedPayload);
    await deps.updateApproval(approvalId, {
      send_payload: sendPayload,
    });
  }

  const result = await deps.invokeTier3EmailSend(surface, sendPayload);
  await deps.logEmail({
    workRequestId: approval.work_request_id,
    messageId: result.messageId,
    success: result.success,
    surface,
  });

  await deps.updateApproval(approvalId, {
    status: result.success ? 'sent' : 'failed_delivery',
    message_id: result.messageId ?? null,
  });

  return result.success
    ? { status: 'sent', messageId: result.messageId }
    : { status: 'failed_delivery' };
}

/** @deprecated Use invokeTier3EmailSend */
export type CoiSendPayload = SendCOIEmailRequest & Record<string, unknown>;
