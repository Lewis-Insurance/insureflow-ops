import { FLOOR_EMAIL_PLAY_VERSION } from '../emailInbound.ts';
import { pickInternalTestRecipient, resolveTier3Recipient } from '../internalSendAllowlist.ts';
import { playAllowlistMode } from '../floorRecipientGuards.ts';
import type {
  DecisionField,
  DecisionPackage,
  DocumentRef,
  RiskLevel,
  SendIdCardEmailRequest,
  SendSpec,
  Tier3EmailSurface,
} from '../types.ts';

export { pickInternalTestRecipient };

export const ID_CARD_PLAY_ID = 'id.card.issue';
export const ID_CARD_PLAY_VERSION = '1.0.0';
export const ID_CARD_AUTHORIZED_REP = 'Landen Lewis';

export interface BuildTier3IdCardPackageArgs {
  playId?: string;
  playVersion?: string;
  clientAccountId: string;
  accountName: string;
  policyNumber: string;
  tier3Recipient: string;
  idCardUrl: string;
  documentRef?: DocumentRef | null;
  fields?: DecisionField[];
  risk?: RiskLevel;
  authorizedRep?: string;
  clientMode?: boolean;
}

export type IdCardInboundPackageRow = Omit<DecisionPackage, 'id' | 'work_request_id' | 'created_at'>;

export function buildTier3IdCardSendSpec(args: {
  internalTestRecipient: string;
  authorizedRep: string;
  insuredName: string;
  policyNumber: string;
  idCardUrl: string;
  sendSurface?: Tier3EmailSurface;
}): SendSpec {
  const payload: SendIdCardEmailRequest = {
    to: args.internalTestRecipient,
    policyNumber: args.policyNumber,
    idCardUrl: args.idCardUrl,
    insuredName: args.insuredName,
  };

  return {
    channel: 'email',
    send_surface: args.sendSurface ?? 'send-id-card-email',
    recipient: args.internalTestRecipient,
    recipient_basis: 'account_of_record',
    authorized_rep_of_record: args.authorizedRep,
    payload,
  };
}

/** Tier-3 ID card package — Approve stages held send (internal allowlist or G4 client email). */
export function buildTier3IdCardPackage(args: BuildTier3IdCardPackageArgs): IdCardInboundPackageRow {
  const playId = args.playId ?? ID_CARD_PLAY_ID;
  const playVersion = args.playVersion ?? ID_CARD_PLAY_VERSION;
  const authorizedRep = args.authorizedRep ?? ID_CARD_AUTHORIZED_REP;
  const risk = args.risk ?? 'green';
  const clientMode = args.clientMode === true;

  return {
    play_id: playId,
    play_version: playVersion,
    headline: clientMode
      ? 'ID card ready — approve to send to client on file'
      : 'ID card ready — one-tap approve (internal test send)',
    summary: clientMode
      ? `In-force auto policy ${args.policyNumber} for ${args.accountName}. Approve sends to the account email on file under ${authorizedRep}.`
      : `In-force auto policy ${args.policyNumber} for ${args.accountName}. Approve sends to the internal test recipient only — not the client on file.`,
    risk,
    client_ref: args.clientAccountId,
    document_ref: args.documentRef ?? null,
    fields: args.fields ?? [],
    diff: null,
    send_spec: buildTier3IdCardSendSpec({
      internalTestRecipient: args.tier3Recipient,
      authorizedRep,
      insuredName: args.accountName,
      policyNumber: args.policyNumber,
      idCardUrl: args.idCardUrl,
    }),
  };
}

export interface ResolveIdCardIntakePackageArgs {
  playId: string;
  playVersion: string;
  clientAccountId: string;
  accountName: string;
  policyNumber: string;
  idCardUrl: string;
  documentRef?: DocumentRef | null;
  allowlistRaw: string | undefined | null;
  accountEmail?: string | null;
  modesRaw?: string | undefined | null;
  authorizedRep?: string;
}

export interface ResolvedIdCardIntakePackage {
  tier3: boolean;
  row: IdCardInboundPackageRow;
}

/** Tier-3 when allowlist configured; otherwise caller should use Phase 1 stub. */
export function resolveIdCardIntakePackage(
  args: ResolveIdCardIntakePackageArgs,
): ResolvedIdCardIntakePackage | null {
  const tier3Recipient = resolveTier3Recipient({
    playId: args.playId,
    accountEmail: args.accountEmail,
    allowlistRaw: args.allowlistRaw,
    modesRaw: args.modesRaw,
  });
  if (!tier3Recipient) return null;

  const clientMode = playAllowlistMode(args.playId, args.modesRaw) === 'client';

  return {
    tier3: true,
    row: buildTier3IdCardPackage({
      playId: args.playId,
      playVersion: args.playVersion,
      clientAccountId: args.clientAccountId,
      accountName: args.accountName,
      policyNumber: args.policyNumber,
      tier3Recipient,
      idCardUrl: args.idCardUrl,
      documentRef: args.documentRef,
      authorizedRep: args.authorizedRep,
      clientMode,
    }),
  };
}
