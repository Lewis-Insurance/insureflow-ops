import type { SendCOIEmailRequest } from './types.ts';

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
  hashPayload: (payload: SendCOIEmailRequest) => Promise<string>;
  insertClientSendApproval: (row: {
    approval_ref: string;
    surface: 'send-coi-email';
    content_hash: string;
    approved_by_user_id: string;
    expires_at: string;
  }) => Promise<void>;
  now?: () => Date;
  expiresInMinutes?: number;
}

export interface MintedFloorFenceApproval {
  approvalRef: string;
  markedPayload: SendCOIEmailRequest & {
    client_send_approval: {
      approval_ref: string;
      approved_by_human_id: string;
    };
  };
}

/** Sole producer of valid floor_action: markers for COI sends (releaseHeldClientSend only). */
export async function mintFloorFenceApprovalForCoi(
  payload: SendCOIEmailRequest,
  approverId: string,
  deps: MintFloorFenceApprovalDeps,
): Promise<MintedFloorFenceApproval> {
  const approvalRef = mintFloorActionToken();
  const contentHash = await deps.hashPayload(payload);
  const now = deps.now?.() ?? new Date();
  const expiresMinutes = deps.expiresInMinutes ?? 15;
  const expiresAt = new Date(now.getTime() + expiresMinutes * 60 * 1000).toISOString();

  await deps.insertClientSendApproval({
    approval_ref: approvalRef,
    surface: 'send-coi-email',
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
