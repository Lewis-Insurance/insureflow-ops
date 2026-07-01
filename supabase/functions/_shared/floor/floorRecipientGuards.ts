import type { RecipientBasis } from './types.ts';
import {
  createInternalRecipientGuard,
  isStubInternalSendSpec,
  normalizeRecipientEmail,
  parseInternalSendAllowlist,
  parseInternalSendAllowlist as parseAllowlist,
  type PlayAllowlistMode,
} from './internalSendAllowlist.ts';
import { FloorAuthorizationError } from './types.ts';

export function playAllowlistMode(
  playId: string | null | undefined,
  modesRaw: string | undefined | null,
): PlayAllowlistMode {
  if (!playId) return 'internal';
  return parsePlayAllowlistModes(modesRaw).get(playId) ?? 'internal';
}

/** Stage/release guard: internal allowlist unless play is in client mode. */
export function createTier3ExternalRecipientGuard(args: {
  allowlistRaw: string | undefined | null;
  modesRaw: string | undefined | null;
  resolvePlayId: (workRequestId: string) => Promise<string | null>;
}) {
  const internalGuard = createInternalRecipientGuard(parseAllowlist(args.allowlistRaw));

  return async (recipient: string, workRequestId: string): Promise<void> => {
    const playId = await args.resolvePlayId(workRequestId);
    const mode = playAllowlistMode(playId, args.modesRaw);

    if (mode === 'client') {
      if (isStubInternalSendSpec(recipient)) {
        throw new FloorAuthorizationError('R7: client mode requires account email on file');
      }
      return;
    }

    await internalGuard(recipient);
  };
}

/** Verifies recipient matches account email when play is in client mode. */
export function createAccountOfRecordRecipientGuard(args: {
  modesRaw: string | undefined | null;
  resolveContext: (
    workRequestId: string,
  ) => Promise<{ playId: string | null; accountEmail: string | null }>;
}) {
  return async (
    recipient: string,
    recipientBasis: RecipientBasis,
    workRequestId: string,
  ): Promise<void> => {
    if (recipientBasis !== 'account_of_record') return;

    const { playId, accountEmail } = await args.resolveContext(workRequestId);
    if (playAllowlistMode(playId, args.modesRaw) !== 'client') return;

    const onFile = accountEmail?.trim();
    if (!onFile?.includes('@')) {
      throw new FloorAuthorizationError('R7: account has no email on file for client send');
    }

    if (normalizeRecipientEmail(recipient) !== normalizeRecipientEmail(onFile)) {
      throw new FloorAuthorizationError('R7: recipient does not match account email on file');
    }
  };
}
