import { FloorAuthorizationError, type SendSpec } from './types.ts';

export const INTERNAL_SEND_STUB_RECIPIENT = '[INTERNAL_ONLY]';

export function normalizeRecipientEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Parse comma-separated internal-only recipients from FLOOR_INTERNAL_SEND_ALLOWLIST. */
export function parseInternalSendAllowlist(raw: string | undefined | null): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(',')
      .map(normalizeRecipientEmail)
      .filter((entry) => entry.includes('@')),
  );
}

export function isStubInternalSendSpec(recipient: string | null | undefined): boolean {
  if (!recipient) return true;
  return recipient.trim() === INTERNAL_SEND_STUB_RECIPIENT;
}

/** Tier-3 packages carry a real recipient; Phase 1 internal cards use the stub token. */
export function isTier3SendSpec(sendSpec: SendSpec | null | undefined): boolean {
  if (!sendSpec?.recipient) return false;
  return !isStubInternalSendSpec(sendSpec.recipient);
}

export function createInternalRecipientGuard(allowlist: Set<string>) {
  return async (recipient: string): Promise<void> => {
    const normalized = normalizeRecipientEmail(recipient);
    if (allowlist.size === 0) {
      throw new FloorAuthorizationError(
        'R7: FLOOR_INTERNAL_SEND_ALLOWLIST is empty; all external sends are blocked',
      );
    }
    if (!allowlist.has(normalized)) {
      throw new FloorAuthorizationError(
        `R7: recipient is not on the internal send allowlist (${normalized})`,
      );
    }
  };
}
