import { containsUnsafeBoundaryPayload } from './floorSafety.ts';

export interface FloorApprovalValidationResult {
  ok: boolean;
  status: number;
  error?: string;
  message?: string;
}

const TOKEN_PATTERN = /^floor_action:[A-Za-z0-9_-]{16,}$/;

function readStringField(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function normalizePayload(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
}

export function validateFloorApprovalTokenForClientEffect(
  surface: 'email-send' | 'send-sms' | string,
  payload: unknown,
): FloorApprovalValidationResult {
  const normalized = normalizePayload(payload);
  const token = readStringField(normalized, ['floor_approval_token', 'floorApprovalToken']);
  const packageRef = readStringField(normalized, ['floor_package_ref', 'floorPackageRef', 'packageRef']);
  const renderedHash = readStringField(normalized, ['floor_rendered_hash', 'floorRenderedHash', 'renderedHash']);
  const approvedBy = readStringField(normalized, ['floor_approved_by_human_ref', 'floorApprovedByHumanRef', 'approvedByHumanRef']);

  if (containsUnsafeBoundaryPayload({ token, packageRef, renderedHash, approvedBy })) {
    return {
      ok: false,
      status: 422,
      error: 'floor_approval_boundary_violation',
      message: `${surface} rejected: Floor approval metadata must use opaque refs only.`,
    };
  }

  if (!token || !packageRef || !renderedHash || !approvedBy) {
    return {
      ok: false,
      status: 403,
      error: 'floor_approval_required',
      message: `${surface} rejected: client-facing sends require a Floor approval token, package ref, rendered hash, and named-human approver ref.`,
    };
  }

  if (!TOKEN_PATTERN.test(token)) {
    return {
      ok: false,
      status: 403,
      error: 'invalid_floor_approval_token',
      message: `${surface} rejected: Floor approval token is not a valid opaque action token.`,
    };
  }

  if (!packageRef.startsWith('package:') || !approvedBy.startsWith('human:')) {
    return {
      ok: false,
      status: 403,
      error: 'invalid_floor_approval_refs',
      message: `${surface} rejected: Floor approval refs must be package:/human: opaque refs.`,
    };
  }

  return { ok: true, status: 200 };
}

export function floorApprovalGateResponse(
  surface: 'email-send' | 'send-sms' | string,
  payload: unknown,
  corsHeaders: Record<string, string>,
): Response | null {
  const result = validateFloorApprovalTokenForClientEffect(surface, payload);
  if (result.ok) return null;

  return new Response(
    JSON.stringify({
      success: false,
      error: result.error,
      message: result.message,
      floor_approval_required: true,
    }),
    { status: result.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}
