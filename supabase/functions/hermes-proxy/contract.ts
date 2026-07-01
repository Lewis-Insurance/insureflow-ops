import { containsUnsafeBoundaryPayload } from '../_shared/floorSafety.ts';

export interface HermesProxyContextRefs {
  account_ref: string;
  policy_ref?: string;
  document_refs?: string[];
  work_item_ref?: string;
}

export interface HermesProxyDecisionRequest {
  action: 'prepare_decpage_decision';
  context: HermesProxyContextRefs;
}

export interface VerifiedHumanIdentity {
  userId: string;
  userEmail?: string;
  workspaceId?: string;
}

export interface FloorProxyRequest {
  surface: 'insureflow';
  action: 'decision_package.request';
  prototype_track: true;
  identity: {
    human_ref: string;
    workspace_ref: string;
    named_human: true;
  };
  context: HermesProxyContextRefs;
}

export interface FloorLintResult {
  rule: `R${number}`;
  status: 'pass' | 'warn' | 'block';
  detail: string;
}

export interface FloorDecisionPackagePayload {
  package_ref: string;
  revision: number;
  rendered_hash: string;
  title: string;
  summary: string;
  confidence: number;
  lint_results: FloorLintResult[];
  evidence: Array<{ citation_ref: string; label: string; detail: string }>;
  actions: {
    approve_ref: string;
    edit_ref: string;
    kill_ref: string;
  };
}

export interface HermesProxyResponsePayload {
  ok: true;
  source: 'floor-synthetic' | 'floor-runtime';
  floor_request: FloorProxyRequest;
  decision_package: FloorDecisionPackagePayload;
}

export type HermesProxyBuildResult =
  | { ok: true; floorRequest: FloorProxyRequest }
  | { ok: false; status: number; error: string; message: string };

const OPAQUE_REF_PATTERN = /^(account|policy|document|work_item):[A-Za-z0-9][A-Za-z0-9:_-]{2,80}$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function contextRefsFromRequest(request: HermesProxyDecisionRequest): HermesProxyContextRefs | null {
  if (!isObject(request) || request.action !== 'prepare_decpage_decision' || !isObject(request.context)) return null;

  const accountRef = readString(request.context.account_ref);
  if (!accountRef) return null;

  const refs: HermesProxyContextRefs = { account_ref: accountRef };
  const policyRef = readString(request.context.policy_ref);
  const workItemRef = readString(request.context.work_item_ref);
  if (policyRef) refs.policy_ref = policyRef;
  if (workItemRef) refs.work_item_ref = workItemRef;

  if (Array.isArray(request.context.document_refs)) {
    refs.document_refs = request.context.document_refs.filter((ref): ref is string => typeof ref === 'string' && ref.trim().length > 0);
  }

  return refs;
}

function refsAreOpaque(context: HermesProxyContextRefs): boolean {
  const refs = [context.account_ref, context.policy_ref, context.work_item_ref, ...(context.document_refs ?? [])].filter(
    (ref): ref is string => Boolean(ref),
  );
  return refs.every((ref) => OPAQUE_REF_PATTERN.test(ref));
}

async function opaqueRef(kind: 'human' | 'workspace', raw: string | undefined): Promise<string> {
  const source = raw?.trim() || 'synthetic-internal';
  const data = new TextEncoder().encode(`${kind}:${source}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `${kind}:${hex.slice(0, 24)}`;
}

export async function buildHermesProxyFloorRequest(
  request: HermesProxyDecisionRequest,
  identity: VerifiedHumanIdentity,
): Promise<HermesProxyBuildResult> {
  if (containsUnsafeBoundaryPayload(request)) {
    return {
      ok: false,
      status: 422,
      error: 'r9_boundary_violation',
      message: 'hermes-proxy accepts opaque record references only; raw PII, UUIDs, signed URLs, and storage paths are blocked.',
    };
  }

  const context = contextRefsFromRequest(request);
  if (!context || !refsAreOpaque(context)) {
    return {
      ok: false,
      status: 400,
      error: 'opaque_refs_required',
      message: 'hermes-proxy requires account_ref and optional policy/document/work-item refs in opaque account:/policy:/document:/work_item: form.',
    };
  }

  if (!identity.userId) {
    return {
      ok: false,
      status: 401,
      error: 'named_human_required',
      message: 'hermes-proxy requires a verified authenticated human.',
    };
  }

  return {
    ok: true,
    floorRequest: {
      surface: 'insureflow',
      action: 'decision_package.request',
      prototype_track: true,
      identity: {
        human_ref: await opaqueRef('human', identity.userId),
        workspace_ref: await opaqueRef('workspace', identity.workspaceId ?? identity.userEmail),
        named_human: true,
      },
      context,
    },
  };
}

export function buildSyntheticDecPageDecisionPackage(floorRequest: FloorProxyRequest): FloorDecisionPackagePayload {
  return {
    package_ref: 'package:phase3_1_decpage_flagship_synthetic',
    revision: 1,
    rendered_hash: 'sha256:synthetic_decpage_flagship_v1',
    title: 'Synthetic dec-page decision ready',
    summary:
      'Synthetic Phase 3.1 dec-page package prepared for the referenced account. Paid-in-full evidence is handled as a deterministic R3 fact; no client/carrier send is available in this prototype.',
    confidence: 0.91,
    lint_results: [
      { rule: 'R1', status: 'pass', detail: 'Decision package has a concrete servicing outcome.' },
      { rule: 'R2', status: 'pass', detail: 'Evidence is cited by opaque document/work-item references only.' },
      { rule: 'R3', status: 'pass', detail: 'Paid-in-full status handled as deterministic fact, not model inference.' },
      { rule: 'R4', status: 'pass', detail: 'No external send/action is present.' },
      { rule: 'R5', status: 'pass', detail: 'Named-human approval is required before any future client effect.' },
      { rule: 'R6', status: 'pass', detail: 'Exact rendered hash is present for approval coupling.' },
      { rule: 'R7', status: 'pass', detail: 'Approval-before-send remains server-side.' },
      { rule: 'R8', status: 'pass', detail: 'Operator can approve, edit, or kill.' },
      { rule: 'R9', status: 'pass', detail: 'Payload uses opaque refs only; raw PII/UUID/storage URLs are absent.' },
    ],
    evidence: [
      {
        citation_ref: floorRequest.context.document_refs?.[0] ?? 'document:synthetic_decpage_fixture',
        label: 'Synthetic declaration-page fixture',
        detail: 'Internal-only fixture; no live document was read.',
      },
      {
        citation_ref: floorRequest.context.work_item_ref ?? 'work_item:synthetic_phase3_1_decpage',
        label: 'Floor surfaced work item',
        detail: 'Prototype dec-page review prepared by the Floor spine.',
      },
    ],
    actions: {
      approve_ref: 'floor_action:syntheticApproveDecPage001',
      edit_ref: 'floor_action:syntheticEditDecPage001',
      kill_ref: 'floor_action:syntheticKillDecPage001',
    },
  };
}

export function buildHermesProxySyntheticResponse(floorRequest: FloorProxyRequest): HermesProxyResponsePayload {
  return {
    ok: true,
    source: 'floor-synthetic',
    floor_request: floorRequest,
    decision_package: buildSyntheticDecPageDecisionPackage(floorRequest),
  };
}
