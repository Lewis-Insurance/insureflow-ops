import type { FeedbackVerb, RiskLevel } from './spine/types';
import type { FloorDecisionPackagePreview } from './types';

export const FLOOR_OPAQUE_REF_PATTERN =
  /^(account|policy|document|work_item|work_request|package):[A-Za-z0-9][A-Za-z0-9:_-]{2,80}$/;

const RAW_UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

export type FloorActionName = 'create_internal_package' | 'feedback';

export interface CreateInternalPackageInput {
  action: 'create_internal_package';
  agency_workspace_id: string;
  idempotency_key: string;
  play_id: string;
  play_version: string;
  clientRef: string;
  policyRef?: string;
  headline?: string;
  summary?: string;
  source?: 'email' | 'slack_forward' | 'crm_button' | 'voice' | 'heartbeat';
}

export interface FeedbackInput {
  action: 'feedback';
  agency_workspace_id: string;
  workRequestRef: string;
  packageRef: string;
  verb: FeedbackVerb;
  actor_id: string;
  field_edits?: Array<{ key: string; from: string; to: string }>;
  kill_reason?: string;
}

export type FloorActionInput = CreateInternalPackageInput | FeedbackInput;

export interface FloorActionValidationError {
  ok: false;
  status: number;
  error: string;
  message: string;
}

export function containsRawUuid(value: unknown): boolean {
  if (typeof value === 'string') return RAW_UUID_PATTERN.test(value);
  if (Array.isArray(value)) return value.some(containsRawUuid);
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(containsRawUuid);
  }
  return false;
}

const RAW_UUID_ALLOWED_FIELDS = new Set([
  'action',
  'agency_workspace_id',
  'actor_id',
  'idempotency_key',
  'play_id',
  'play_version',
  'headline',
  'summary',
  'source',
  'verb',
  'kill_reason',
  'field_edits',
]);

export function containsDisallowedRawUuid(body: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(body)) {
    if (RAW_UUID_ALLOWED_FIELDS.has(key)) continue;
    if (containsRawUuid(value)) return true;
  }
  return false;
}

export function isOpaqueRef(value: string): boolean {
  return FLOOR_OPAQUE_REF_PATTERN.test(value.trim());
}

export function parseUuidFromOpaqueRef(ref: string): string | null {
  const match = ref.match(/^(?:account|policy|document|work_item|work_request|package):([0-9a-f]{32})$/i);
  if (!match) return null;
  const hex = match[1].toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function validateFloorActionBody(body: unknown): FloorActionInput | FloorActionValidationError {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, status: 400, error: 'invalid_body', message: 'Request body must be a JSON object.' };
  }

  const record = body as Record<string, unknown>;
  const action = record.action;

  if (containsDisallowedRawUuid(record)) {
    return {
      ok: false,
      status: 422,
      error: 'opaque_refs_required',
      message: 'Floor actions reject raw UUIDs in the request body. Use opaque account:/work_request:/package: refs.',
    };
  }

  if (action === 'create_internal_package') {
    const agencyWorkspaceId = typeof record.agency_workspace_id === 'string' ? record.agency_workspace_id.trim() : '';
    const idempotencyKey = typeof record.idempotency_key === 'string' ? record.idempotency_key.trim() : '';
    const playId = typeof record.play_id === 'string' ? record.play_id.trim() : '';
    const playVersion = typeof record.play_version === 'string' ? record.play_version.trim() : '';
    const clientRef = typeof record.clientRef === 'string' ? record.clientRef.trim() : '';

    if (!agencyWorkspaceId || !idempotencyKey || !playId || !playVersion || !clientRef) {
      return {
        ok: false,
        status: 400,
        error: 'missing_fields',
        message: 'create_internal_package requires agency_workspace_id, idempotency_key, play_id, play_version, and clientRef.',
      };
    }

    if (!isOpaqueRef(clientRef)) {
      return {
        ok: false,
        status: 400,
        error: 'opaque_refs_required',
        message: 'clientRef must use opaque account:/policy:/document:/work_item:/work_request:/package: form.',
      };
    }

    const policyRef = typeof record.policyRef === 'string' ? record.policyRef.trim() : undefined;
    if (policyRef && !isOpaqueRef(policyRef)) {
      return {
        ok: false,
        status: 400,
        error: 'opaque_refs_required',
        message: 'policyRef must be an opaque reference when provided.',
      };
    }

    const source = record.source;
    const allowedSources = new Set(['email', 'slack_forward', 'crm_button', 'voice', 'heartbeat']);

    return {
      action: 'create_internal_package',
      agency_workspace_id: agencyWorkspaceId,
      idempotency_key: idempotencyKey,
      play_id: playId,
      play_version: playVersion,
      clientRef,
      policyRef,
      headline: typeof record.headline === 'string' ? record.headline.trim() : undefined,
      summary: typeof record.summary === 'string' ? record.summary.trim() : undefined,
      source: typeof source === 'string' && allowedSources.has(source)
        ? (source as CreateInternalPackageInput['source'])
        : 'crm_button',
    };
  }

  if (action === 'feedback') {
    const agencyWorkspaceId = typeof record.agency_workspace_id === 'string' ? record.agency_workspace_id.trim() : '';
    const workRequestRef = typeof record.workRequestRef === 'string' ? record.workRequestRef.trim() : '';
    const packageRef = typeof record.packageRef === 'string' ? record.packageRef.trim() : '';
    const verb = record.verb;
    const actorId = typeof record.actor_id === 'string' ? record.actor_id.trim() : '';

    if (!agencyWorkspaceId || !workRequestRef || !packageRef || !actorId) {
      return {
        ok: false,
        status: 400,
        error: 'missing_fields',
        message: 'feedback requires agency_workspace_id, workRequestRef, packageRef, verb, and actor_id.',
      };
    }

    if (!isOpaqueRef(workRequestRef) || !isOpaqueRef(packageRef)) {
      return {
        ok: false,
        status: 400,
        error: 'opaque_refs_required',
        message: 'workRequestRef and packageRef must use opaque reference form.',
      };
    }

    if (verb !== 'approve' && verb !== 'edit' && verb !== 'kill') {
      return {
        ok: false,
        status: 400,
        error: 'invalid_verb',
        message: 'feedback verb must be approve, edit, or kill.',
      };
    }

    return {
      action: 'feedback',
      agency_workspace_id: agencyWorkspaceId,
      workRequestRef,
      packageRef,
      verb,
      actor_id: actorId,
      field_edits: Array.isArray(record.field_edits)
        ? (record.field_edits as Array<{ key: string; from: string; to: string }>)
        : undefined,
      kill_reason: typeof record.kill_reason === 'string' ? record.kill_reason.trim() : undefined,
    };
  }

  return {
    ok: false,
    status: 400,
    error: 'unsupported_action',
    message: 'action must be create_internal_package or feedback.',
  };
}

export function validateFeedbackActor(actorId: string, jwtUserId: string): FloorActionValidationError | null {
  if (actorId !== jwtUserId) {
    return {
      ok: false,
      status: 403,
      error: 'actor_mismatch',
      message: 'feedback actor_id must match the authenticated user.',
    };
  }
  return null;
}

export function buildPackagePreview(params: {
  packageId: string;
  workRequestId: string;
  playId: string;
  playVersion: string;
  headline: string;
  summary: string;
  risk: RiskLevel;
  clientRef: string;
}): FloorDecisionPackagePreview {
  return {
    packageRef: `package:${params.packageId.replace(/-/g, '')}`,
    revision: 1,
    workRequestRef: `work_request:${params.workRequestId.replace(/-/g, '')}`,
    workRequestId: params.workRequestId,
    playId: params.playId,
    playVersion: params.playVersion,
    title: params.headline,
    summary: params.summary,
    risk: params.risk,
    clientRef: params.clientRef,
    actions: ['approve', 'edit', 'kill'],
  };
}

export function buildStubInternalPackage(params: {
  playId: string;
  playVersion: string;
  clientRef: string;
  headline?: string;
  summary?: string;
}) {
  return {
    play_id: params.playId,
    play_version: params.playVersion,
    headline: params.headline ?? 'Internal Tier 1 package ready',
    summary:
      params.summary ??
      `Phase 0 internal package prepared for ${params.clientRef}. No client or carrier send was attempted.`,
    risk: 'green' as RiskLevel,
    fields: [] as Array<{ key: string; label: string; value: string; locked: boolean; source: 'agent' }>,
    diff: null,
    send_spec: {
      channel: 'email' as const,
      recipient: '[INTERNAL_ONLY]',
      recipient_basis: 'account_of_record' as const,
      authorized_rep_of_record: '[INTERNAL_ONLY]',
      payload: {
        to: '[INTERNAL_ONLY]',
        certificateNumber: 'PHASE0-STUB',
        certificateUrl: 'https://example.invalid/phase0-stub',
        holderName: '[INTERNAL_ONLY]',
      },
    },
    document_ref: null,
  };
}
