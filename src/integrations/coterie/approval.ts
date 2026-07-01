/**
 * Separation-of-duties rule for carrier approval gates.
 *
 * The named human who APPROVES a gate must be a different identified user than
 * the one who REQUESTED it. This is enforced authoritatively server-side by RLS
 * (the approve-transition `WITH CHECK` in
 * `supabase/migrations/20260701120000_coterie_quote_schema.sql`). This pure
 * helper mirrors the rule so the frontend can give a friendly pre-flight error
 * instead of a raw RLS rejection, and so the rule itself is unit-tested even
 * though enforcement lives in the database.
 *
 * It matters now (not just in Phase 2) because Phase 2 will wire bind/send to
 * gate status: a self-approvable gate would make the named-human approver
 * forgeable.
 */

export interface ApproverCheck {
  /** The user attempting to approve (auth.uid()). */
  approverId?: string | null;
  /** The user who requested the gate (carrier_approval_gates.requested_by). */
  requestedBy?: string | null;
}

/**
 * True only when an IDENTIFIED approver who is a DIFFERENT identified user than
 * the requester is approving. Mirrors the (hardened) RLS approve predicate
 * `approved_by = auth.uid() AND requested_by IS NOT NULL AND approved_by IS
 * DISTINCT FROM requested_by`.
 *
 * A missing requester now returns `false` (A4): a gate whose requester is
 * unknown can NOT be approved, closing the prior "null requester counts as
 * distinct" loophole. The authoritative enforcement is RLS + the BEFORE UPDATE
 * trigger; this just lets the UI fail fast with a clear message.
 */
export function canApproveGate({ approverId, requestedBy }: ApproverCheck): boolean {
  if (!approverId) return false;
  if (!requestedBy) return false;
  return approverId !== requestedBy;
}

export class SelfApprovalError extends Error {
  constructor(
    message = 'You cannot approve a quote you requested. A different reviewer must approve it.',
  ) {
    super(message);
    this.name = 'SelfApprovalError';
  }
}

/**
 * Throw {@link SelfApprovalError} unless a distinct, identified approver acts.
 * The message is tailored to WHY the approval is refused so the UX is clear.
 */
export function assertDistinctApprover(check: ApproverCheck): void {
  if (canApproveGate(check)) return;
  if (!check.approverId) {
    throw new SelfApprovalError('You must be signed in to approve this request.');
  }
  if (!check.requestedBy) {
    throw new SelfApprovalError(
      'This approval is missing its requester, so it cannot be approved. Refresh and try again.',
    );
  }
  throw new SelfApprovalError();
}

// ---------------------------------------------------------------------------
// Server-side gate lifecycle rules, mirrored as PURE predicates.
//
// The DATABASE is the authoritative enforcer (the carrier_approval_gates RLS
// WITH CHECK + the BEFORE UPDATE trigger in
// `supabase/migrations/20260701120000_coterie_quote_schema.sql`). These mirrors
// exist so the rules are unit-tested in Vitest and so the same logic is
// available to the client — they are intentionally kept in lockstep with the
// SQL and the edge function.
// ---------------------------------------------------------------------------

export interface StaffGateInsert {
  status?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  requestedBy?: string | null;
  /** The acting user (auth.uid()). */
  actorId?: string | null;
}

/**
 * Mirrors the staff INSERT `WITH CHECK` (A1): a staff-created gate must be a
 * FRESH, self-requested, undecided gate — `pending`, no approver recorded, and
 * `requested_by = auth.uid()`. Pre-approved / system gates are possible ONLY via
 * the service role.
 */
export function isValidStaffGateInsert(gate: StaffGateInsert): boolean {
  return (
    gate.status === 'pending' &&
    !gate.approvedBy &&
    !gate.approvedAt &&
    !!gate.requestedBy &&
    gate.requestedBy === gate.actorId
  );
}

export interface StaffGateTransition {
  oldStatus: string;
  newStatus: string;
  oldRequestedBy?: string | null;
  newRequestedBy?: string | null;
  newApprovedBy?: string | null;
  newApprovedAt?: string | null;
}

/**
 * Mirrors the BEFORE UPDATE trigger for NON-service-role (staff) callers
 * (A2/A3):
 *   - `requested_by` is immutable,
 *   - a decided gate (`approved`/`denied`) cannot be reverted to `pending`,
 *   - a `pending`/`expired` gate must not retain approver fields.
 * (The distinct-approver rule for the approve transition itself is
 * {@link canApproveGate}.)
 */
export function isAllowedStaffGateTransition(t: StaffGateTransition): boolean {
  const oldReq = t.oldRequestedBy ?? null;
  const newReq = t.newRequestedBy ?? null;
  // requested_by immutable (mirrors NEW.requested_by IS DISTINCT FROM OLD...).
  if (newReq !== oldReq) return false;
  // A decided gate cannot be reopened by staff.
  if ((t.oldStatus === 'approved' || t.oldStatus === 'denied') && t.newStatus === 'pending') {
    return false;
  }
  // A non-decided gate must not carry approver fields.
  if (
    (t.newStatus === 'pending' || t.newStatus === 'expired') &&
    (!!t.newApprovedBy || !!t.newApprovedAt)
  ) {
    return false;
  }
  return true;
}
