import type { InboundMessage, ResolveResult, RouteDecision, WorkRequestState } from './types.ts';
import { mailSkillRouter, normalizeSender } from './mailSkillRouter.ts';
import type { MailSkillRouterDeps } from './mailSkillRouter.ts';
import { shouldForceIdentityPick } from './resolveAccount.ts';

export type AuthVerdict = InboundMessage['spf'];

const COI_FILENAME_PATTERN =
  /coi|certificate.?of.?insurance|acord.?25|cert.?holder|evidence.?of.?insurance/i;

export const FLOOR_EMAIL_PLAY_VERSION = '1.0.0';

export function parseAuthVerdict(value: unknown): AuthVerdict {
  const normalized = String(value ?? 'none').trim().toLowerCase();
  if (normalized === 'pass') return 'pass';
  if (normalized === 'fail' || normalized === 'hardfail' || normalized === 'softfail') return 'fail';
  if (normalized === 'neutral' || normalized === 'none' || normalized === '') return 'none';
  return 'none';
}

/** Parse SPF/DKIM/DMARC from common inbound webhook field names (Postmark, Parseur, etc.). */
export function parseEmailAuthVerdicts(body: Record<string, unknown>): Pick<InboundMessage, 'spf' | 'dkim' | 'dmarc'> {
  return {
    spf: parseAuthVerdict(body.spf ?? body.SPF ?? body.spfResult ?? body['Received-SPF']),
    dkim: parseAuthVerdict(body.dkim ?? body.DKIM ?? body.dkimResult),
    dmarc: parseAuthVerdict(body.dmarc ?? body.DMARC ?? body.dmarcResult),
  };
}

export function classifyInboundAttachments(
  attachments: InboundMessage['attachments'] = [],
): string {
  if (!attachments.length) return 'unknown';

  for (const attachment of attachments) {
    const filename = (attachment.filename ?? '').toLowerCase();
    const contentType = (attachment.contentType ?? '').toLowerCase();

    if (COI_FILENAME_PATTERN.test(filename)) return 'coi';
    if (contentType.includes('pdf') && /cert|coi|acord/.test(filename)) return 'coi';
  }

  return 'unknown';
}

export function buildInboundMessageFromPayload(
  body: Record<string, unknown>,
  attachments: InboundMessage['attachments'] = [],
): InboundMessage {
  const auth = parseEmailAuthVerdicts(body);
  const forwardedFrom =
    typeof body.forwardedFrom === 'string'
      ? body.forwardedFrom
      : typeof body['X-Forwarded-From'] === 'string'
        ? body['X-Forwarded-From']
        : null;

  return {
    from: String(body.from ?? ''),
    forwardedFrom,
    attachments,
    ...auth,
  };
}

export function buildEmailIdempotencyKey(messageId: string): string {
  const trimmed = messageId.trim();
  return trimmed ? `email:${trimmed}` : `email:${crypto.randomUUID()}`;
}

export function deriveWorkRequestStatus(resolveResult: ResolveResult): WorkRequestState {
  return shouldForceIdentityPick(resolveResult) ? 'needs_identity' : 'awaiting_approval';
}

export function playMetadataForAction(action: string): { play_id: string; play_version: string } {
  return {
    play_id: action,
    play_version: FLOOR_EMAIL_PLAY_VERSION,
  };
}

export function isFloorEmailIntakeEnabled(env: Record<string, string | undefined> = {}): boolean {
  const value = env.FLOOR_COCKPIT_ENABLED ?? env.FLOOR_EMAIL_INTAKE_ENABLED ?? '';
  return value === 'true' || value === '1';
}

export interface FloorEmailIntakeInput {
  body: Record<string, unknown>;
  attachments: InboundMessage['attachments'];
  resolveResult: ResolveResult;
  routerDeps: MailSkillRouterDeps;
}

export interface FloorEmailIntakeResult {
  handled: boolean;
  route: RouteDecision;
  workRequestStatus?: WorkRequestState;
  senderIdentity?: string;
  action?: string;
}

/**
 * resolveAccount-first, then mailSkillRouter. Returns handled=true when a WorkRequest should be created.
 */
export async function evaluateFloorEmailIntake(
  input: FloorEmailIntakeInput,
): Promise<FloorEmailIntakeResult> {
  const inbound = buildInboundMessageFromPayload(input.body, input.attachments);
  const route = await mailSkillRouter(inbound, input.routerDeps);

  if (route.route === 'fall_through') {
    return { handled: false, route };
  }

  return {
    handled: true,
    route,
    workRequestStatus: deriveWorkRequestStatus(input.resolveResult),
    senderIdentity: route.sender_identity,
    action: route.action,
  };
}

export function senderEmailFromInbound(body: Record<string, unknown>): string {
  const inbound = buildInboundMessageFromPayload(body);
  return normalizeSender(inbound);
}
