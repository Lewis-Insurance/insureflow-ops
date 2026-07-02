import type { SendCOIEmailRequest, SendIdCardEmailRequest, Tier3EmailPayload, Tier3EmailSurface } from './types.ts';

export const FLOOR_ACTION_TOKEN_PREFIX = 'floor_action:';

/** Mint an opaque Floor action token for Fence consumption (ADR 001). */
export function mintFloorActionToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${FLOOR_ACTION_TOKEN_PREFIX}${hex}`;
}

export function isFloorActionApprovalRef(approvalRef: string): boolean {
  return approvalRef.startsWith(FLOOR_ACTION_TOKEN_PREFIX);
}

export interface MintFloorFenceApprovalDeps {
  hashPayload: (surface: Tier3EmailSurface, payload: Tier3EmailPayload) => Promise<string>;
  insertClientSendApproval: (row: {
    approval_ref: string;
    surface: Tier3EmailSurface;
    content_hash: string;
    approved_by_user_id: string;
    expires_at: string;
  }) => Promise<void>;
  now?: () => Date;
  expiresInMinutes?: number;
}

export interface MintedFloorFenceApproval<TPayload extends Tier3EmailPayload> {
  approvalRef: string;
  markedPayload: TPayload & {
    client_send_approval: {
      approval_ref: string;
      approved_by_human_id: string;
    };
  };
}

/** Sole producer of valid floor_action: markers for Tier-3 email sends (releaseHeldClientSend only). */
export async function mintFloorFenceApprovalForSurface<TPayload extends Tier3EmailPayload>(
  surface: Tier3EmailSurface,
  payload: TPayload,
  approverId: string,
  deps: MintFloorFenceApprovalDeps,
): Promise<MintedFloorFenceApproval<TPayload>> {
  const approvalRef = mintFloorActionToken();
  const contentHash = await deps.hashPayload(surface, payload);
  const now = deps.now?.() ?? new Date();
  const expiresMinutes = deps.expiresInMinutes ?? 15;
  const expiresAt = new Date(now.getTime() + expiresMinutes * 60 * 1000).toISOString();

  await deps.insertClientSendApproval({
    approval_ref: approvalRef,
    surface,
    content_hash: contentHash,
    approved_by_user_id: approverId,
    expires_at: expiresAt,
  });

  return {
    approvalRef,
    markedPayload: {
      ...payload,
      client_send_approval: {
        approval_ref: approvalRef,
        approved_by_human_id: approverId,
      },
    },
  };
}

/** @deprecated Use mintFloorFenceApprovalForSurface('send-coi-email', ...) */
export async function mintFloorFenceApprovalForCoi(
  payload: SendCOIEmailRequest,
  approverId: string,
  deps: MintFloorFenceApprovalDeps,
): Promise<MintedFloorFenceApproval<SendCOIEmailRequest>> {
  return mintFloorFenceApprovalForSurface('send-coi-email', payload, approverId, deps);
}

/** @deprecated Use mintFloorFenceApprovalForSurface('send-id-card-email', ...) */
export async function mintFloorFenceApprovalForIdCard(
  payload: SendIdCardEmailRequest,
  approverId: string,
  deps: MintFloorFenceApprovalDeps,
): Promise<MintedFloorFenceApproval<SendIdCardEmailRequest>> {
  return mintFloorFenceApprovalForSurface('send-id-card-email', payload, approverId, deps);
}
