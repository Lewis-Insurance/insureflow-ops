# ADR 001: Layered R7 approval gates (Fence + Floor)

**Status:** Accepted  
**Date:** July 2026  
**Deciders:** Brian Lewis, Floor architecture review

## Context

The Floor needs orchestration for client sends: recipient basis, cert access, in-force diff, and a 30-second undo hold. The Fence (`clientSendApprovalGate.ts`) already enforces R7 at the provider edge on `email-send`, `send-sms`, `send-coi-email`, and `esign-create-request`. It hashes the exact payload, consumes once, and expires.

The Floor spine adds `stageClientSend` and `releaseHeldClientSend` in `src/floor/spine/stageClientSend.ts`. These solve a different problem than the Fence. Ripping out the Fence would throw away working boundary safety exactly where the client send happens.

The Fence already accepts Floor markers. The approval ref regex at `clientSendApprovalGate.ts:55` is:

```typescript
const APPROVAL_REF_PATTERN = /^(?:sendapproval|floor_action)[:_][A-Za-z0-9_-]{12,}$/;
```

## Decision

Keep both gates and layer them.

1. **Fence (provider edge).** Stays the last-inch boundary. No send reaches Resend or Twilio except through the Fence. Unchanged for manual and non-Floor sends.

2. **Floor (orchestration).** `stageClientSend` writes `floor_client_send_approvals` in held state. `releaseHeldClientSend` is the **sole producer** of a valid `floor_action:` marker for Floor-originated sends. It fires after the 30-second undo hold.

3. **Service-role path.** The release sweeper runs service-side with no human JWT. Extend the Fence with a Floor-origin validation path that checks `floor_approved_by_human_ref` / `approved_by_human_id` against the `floor_client_send_approvals.approver_id` row instead of requiring `approvedByUserId === userId` on a live session.

4. **No third mechanism.** Do not build another approval token system. Fold FU-1 (`canopy-servicing`) under the Fence during Phase 2.

## Consequences

**Positive.** Defense in depth. The Fence keeps content-hash, one-time consume, and expiry at the provider. The Floor keeps orchestration, undo, in-force, and recipient basis. Existing Fence tests stay valid.

**Negative.** Two layers to wire in Phase 2. The service-role mint path is a discrete task, not a one-liner.

**Neutral.** Manual CRM sends still use Fence `sendapproval:` tokens. Floor sends use `floor_action:` tokens minted only by `releaseHeldClientSend`.

**Follow-up.** Phase 2 unifies the approval model and adds the Floor-origin Fence validation path. Phase 2 also closes the cert-access TODO inside the Floor path.
