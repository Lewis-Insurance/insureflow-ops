import { FLOOR_EMAIL_PLAY_VERSION } from '../emailInbound.ts';
import { pickInternalTestRecipient } from '../internalSendAllowlist.ts';
import type {
  CoverageDiff,
  DecisionField,
  DecisionPackage,
  DocumentRef,
  RiskLevel,
  SendSpec,
} from '../types.ts';

export { pickInternalTestRecipient };

export interface BuildTier3CoiInboundPackageArgs {
  playId?: string;
  playVersion?: string;
  clientAccountId: string;
  senderIdentity: string;
  internalTestRecipient: string;
  authorizedRep?: string;
  holderName?: string;
  certificateNumber?: string;
  certificateUrl?: string;
  coverageDiff?: CoverageDiff | null;
  fields?: DecisionField[];
  documentRef?: DocumentRef | null;
  risk?: RiskLevel;
}

export type CoiInboundPackageRow = Omit<DecisionPackage, 'id' | 'work_request_id' | 'created_at'>;

function defaultCertificateNumber(clientAccountId: string): string {
  const suffix = clientAccountId.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `COI-TEST-${suffix}`;
}

export function buildTier3CoiInboundSendSpec(args: {
  internalTestRecipient: string;
  authorizedRep: string;
  holderName: string;
  certificateNumber: string;
  certificateUrl: string;
}): SendSpec {
  return {
    channel: 'email',
    recipient: args.internalTestRecipient,
    recipient_basis: 'approved_holder',
    authorized_rep_of_record: args.authorizedRep,
    payload: {
      to: args.internalTestRecipient,
      certificateNumber: args.certificateNumber,
      certificateUrl: args.certificateUrl,
      holderName: args.holderName,
    },
  };
}

/** Tier-3 COI package for inbound email — Approve stages held send to allowlist only. */
export function buildTier3CoiInboundPackage(
  args: BuildTier3CoiInboundPackageArgs,
): CoiInboundPackageRow {
  const playId = args.playId ?? 'coi.issue';
  const playVersion = args.playVersion ?? FLOOR_EMAIL_PLAY_VERSION;
  const authorizedRep = args.authorizedRep ?? 'Tori Hill';
  const holderName = args.holderName ?? 'Certificate Holder (internal test)';
  const certificateNumber = args.certificateNumber ?? defaultCertificateNumber(args.clientAccountId);
  const certificateUrl = args.certificateUrl ?? 'https://example.invalid/floor/coi-internal-test.pdf';
  const diff = args.coverageDiff ?? null;
  const risk = args.risk ?? diff?.overall ?? 'yellow';

  return {
    play_id: playId,
    play_version: playVersion,
    headline: 'COI request — one-tap approve (internal test send)',
    summary:
      `Inbound COI from ${args.senderIdentity}. Approve sends to the internal test recipient only — not the requester.`,
    risk,
    client_ref: args.clientAccountId,
    document_ref: args.documentRef ?? null,
    fields: args.fields ?? [],
    diff,
    send_spec: buildTier3CoiInboundSendSpec({
      internalTestRecipient: args.internalTestRecipient,
      authorizedRep,
      holderName,
      certificateNumber,
      certificateUrl,
    }),
  };
}

export interface ResolveCoiIntakePackageArgs {
  playId: string;
  playVersion: string;
  clientAccountId: string;
  clientOpaqueRef: string;
  senderIdentity: string;
  allowlistRaw: string | undefined | null;
  authorizedRep?: string;
}

export interface ResolvedCoiIntakePackage {
  tier3: boolean;
  row: CoiInboundPackageRow;
}

/** Tier-3 when allowlist configured; otherwise caller should use Phase 1 stub. */
export function resolveCoiIntakePackage(args: ResolveCoiIntakePackageArgs): ResolvedCoiIntakePackage | null {
  const internalTestRecipient = pickInternalTestRecipient(args.allowlistRaw);
  if (!internalTestRecipient) return null;

  return {
    tier3: true,
    row: buildTier3CoiInboundPackage({
      playId: args.playId,
      playVersion: args.playVersion,
      clientAccountId: args.clientAccountId,
      senderIdentity: args.senderIdentity,
      internalTestRecipient,
      authorizedRep: args.authorizedRep,
    }),
  };
}
