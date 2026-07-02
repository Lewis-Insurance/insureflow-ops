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

/** First allowlist entry (sorted) for deterministic dev/test sends. */
export function pickInternalTestRecipient(allowlistRaw: string | undefined | null): string | null {
  const allowlist = parseInternalSendAllowlist(allowlistRaw);
  if (allowlist.size === 0) return null;
  return [...allowlist].sort()[0];
}

export type PlayAllowlistMode = 'internal' | 'client';

/** Parse per-play send modes: "id.card.issue=internal,coi.issue=client". */
export function parsePlayAllowlistModes(raw: string | undefined | null): Map<string, PlayAllowlistMode> {
  const modes = new Map<string, PlayAllowlistMode>();
  if (!raw?.trim()) return modes;

  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed.includes('=')) continue;
    const [playId, modeRaw] = trimmed.split('=').map((part) => part.trim().toLowerCase());
    if (!playId) continue;
    if (modeRaw === 'client' || modeRaw === 'internal') {
      modes.set(playId, modeRaw);
    }
  }

  return modes;
}

export function resolveTier3Recipient(args: {
  playId: string;
  accountEmail?: string | null;
  allowlistRaw: string | undefined | null;
  modesRaw?: string | undefined | null;
}): string | null {
  const modes = parsePlayAllowlistModes(args.modesRaw);
  const mode = modes.get(args.playId) ?? 'internal';

  if (mode === 'client') {
    const email = args.accountEmail?.trim();
    if (!email?.includes('@')) return null;
    return normalizeRecipientEmail(email);
  }

  return pickInternalTestRecipient(args.allowlistRaw);
}
