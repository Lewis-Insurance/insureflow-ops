import { describe, it, expect } from 'vitest';
import {
  assertDistinctApprover,
  canApproveGate,
  isAllowedStaffGateTransition,
  isValidStaffGateInsert,
  SelfApprovalError,
} from '@/integrations/coterie/approval';

// Separation of duties on approval gates (MEDIUM-9). RLS + a BEFORE UPDATE
// trigger enforce these authoritatively server-side; these unit-test the
// mirrored client-side rules so the named-human approver is provably
// non-forgeable — important because Phase 2 wires bind/send to gate status.
describe('approval gate separation of duties', () => {
  it('rejects self-approval (approver === requester)', () => {
    expect(canApproveGate({ approverId: 'user-1', requestedBy: 'user-1' })).toBe(false);
    expect(() =>
      assertDistinctApprover({ approverId: 'user-1', requestedBy: 'user-1' }),
    ).toThrow(SelfApprovalError);
  });

  it('allows a distinct, identified approver', () => {
    expect(canApproveGate({ approverId: 'manager-1', requestedBy: 'user-1' })).toBe(true);
    expect(() =>
      assertDistinctApprover({ approverId: 'manager-1', requestedBy: 'user-1' }),
    ).not.toThrow();
  });

  it('rejects an unidentified approver', () => {
    expect(canApproveGate({ approverId: null, requestedBy: 'user-1' })).toBe(false);
    expect(canApproveGate({ approverId: undefined, requestedBy: 'user-1' })).toBe(false);
    expect(() => assertDistinctApprover({ approverId: null, requestedBy: 'user-1' })).toThrow(
      SelfApprovalError,
    );
  });

  // A4: a gate whose requester is unknown can NEVER be approved (previously a
  // null requester was treated as "distinct", which let it slip through).
  it('rejects approval when the requester is missing (A4)', () => {
    expect(canApproveGate({ approverId: 'manager-1', requestedBy: null })).toBe(false);
    expect(canApproveGate({ approverId: 'manager-1', requestedBy: undefined })).toBe(false);
    expect(() => assertDistinctApprover({ approverId: 'manager-1', requestedBy: null })).toThrow(
      SelfApprovalError,
    );
    expect(() =>
      assertDistinctApprover({ approverId: 'manager-1', requestedBy: undefined }),
    ).toThrow(/missing its requester/i);
  });

  it('explains WHY an approval is refused (clear pre-flight UX)', () => {
    expect(() => assertDistinctApprover({ approverId: null, requestedBy: 'user-1' })).toThrow(
      /signed in/i,
    );
    expect(() =>
      assertDistinctApprover({ approverId: 'user-1', requestedBy: 'user-1' }),
    ).toThrow(/cannot approve a quote you requested/i);
  });
});

// A1: mirror of the staff INSERT WITH CHECK. A staff-created gate must be a
// fresh, self-requested, undecided gate (pre-approved/system gates are service
// role only).
describe('isValidStaffGateInsert (A1 — staff INSERT WITH CHECK mirror)', () => {
  it('accepts a fresh, self-requested, pending gate', () => {
    expect(
      isValidStaffGateInsert({
        status: 'pending',
        approvedBy: null,
        approvedAt: null,
        requestedBy: 'user-1',
        actorId: 'user-1',
      }),
    ).toBe(true);
  });

  it('rejects inserting an already-approved (pre-decided) gate', () => {
    expect(
      isValidStaffGateInsert({
        status: 'approved',
        approvedBy: 'user-1',
        approvedAt: new Date().toISOString(),
        requestedBy: 'user-1',
        actorId: 'user-1',
      }),
    ).toBe(false);
  });

  it('rejects a pending gate that already carries an approver', () => {
    expect(
      isValidStaffGateInsert({
        status: 'pending',
        approvedBy: 'manager-1',
        approvedAt: null,
        requestedBy: 'user-1',
        actorId: 'user-1',
      }),
    ).toBe(false);
    expect(
      isValidStaffGateInsert({
        status: 'pending',
        approvedBy: null,
        approvedAt: new Date().toISOString(),
        requestedBy: 'user-1',
        actorId: 'user-1',
      }),
    ).toBe(false);
  });

  it('rejects requesting on behalf of someone else, or with no requester', () => {
    expect(
      isValidStaffGateInsert({
        status: 'pending',
        requestedBy: 'someone-else',
        actorId: 'user-1',
      }),
    ).toBe(false);
    expect(
      isValidStaffGateInsert({ status: 'pending', requestedBy: null, actorId: 'user-1' }),
    ).toBe(false);
  });
});

// A2/A3: mirror of the BEFORE UPDATE trigger for staff (non-service-role).
describe('isAllowedStaffGateTransition (A2/A3 — trigger mirror)', () => {
  it('allows the normal approve/deny transition out of pending', () => {
    expect(
      isAllowedStaffGateTransition({
        oldStatus: 'pending',
        newStatus: 'approved',
        oldRequestedBy: 'user-1',
        newRequestedBy: 'user-1',
        newApprovedBy: 'manager-1',
        newApprovedAt: new Date().toISOString(),
      }),
    ).toBe(true);
    expect(
      isAllowedStaffGateTransition({
        oldStatus: 'pending',
        newStatus: 'denied',
        oldRequestedBy: 'user-1',
        newRequestedBy: 'user-1',
        newApprovedBy: 'user-1',
        newApprovedAt: new Date().toISOString(),
      }),
    ).toBe(true);
  });

  it('rejects mutating requested_by (A2 immutability)', () => {
    expect(
      isAllowedStaffGateTransition({
        oldStatus: 'pending',
        newStatus: 'approved',
        oldRequestedBy: 'user-1',
        newRequestedBy: 'manager-1', // rewritten to dodge the distinct-approver check
        newApprovedBy: 'manager-1',
        newApprovedAt: new Date().toISOString(),
      }),
    ).toBe(false);
  });

  it('rejects reverting a decided gate back to pending (A3)', () => {
    expect(
      isAllowedStaffGateTransition({
        oldStatus: 'approved',
        newStatus: 'pending',
        oldRequestedBy: 'user-1',
        newRequestedBy: 'user-1',
      }),
    ).toBe(false);
    expect(
      isAllowedStaffGateTransition({
        oldStatus: 'denied',
        newStatus: 'pending',
        oldRequestedBy: 'user-1',
        newRequestedBy: 'user-1',
      }),
    ).toBe(false);
  });

  it('rejects retaining approver fields on a pending/expired gate (A3 stale fields)', () => {
    expect(
      isAllowedStaffGateTransition({
        oldStatus: 'pending',
        newStatus: 'expired',
        oldRequestedBy: 'user-1',
        newRequestedBy: 'user-1',
        newApprovedBy: 'manager-1', // forged approver on an expired gate
      }),
    ).toBe(false);
    // Expiring a pending gate with the approver fields cleared is fine.
    expect(
      isAllowedStaffGateTransition({
        oldStatus: 'pending',
        newStatus: 'expired',
        oldRequestedBy: 'user-1',
        newRequestedBy: 'user-1',
        newApprovedBy: null,
        newApprovedAt: null,
      }),
    ).toBe(true);
  });
});
