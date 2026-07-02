# Batch 4C — Wave 6 cleanup — BLOCKED (NOT executed)

**Status:** intentionally **NOT run.** This is the only remaining-work item deliberately left undone.

## What 4C would do (destructive)
- Drop the dead `customer_id` columns and the `customers` table.
- Archive the ~14,187 soft-deleted import rows (hard-remove from hot tables after archiving).

## Why it is blocked
The handoff gates 4C on **"after the dedup review queues are closed."** Those queues are still **open**:
they were just packaged for Brian's assistant in the Batch 3 Cleanup Kit and have not come back yet —
- B1 Duplicates: 63 clusters awaiting Same/Different/Unsure
- B2 Households: 11 MEDIUM/LOW pairs awaiting decisions
- B3 Business or Personal: 9 awaiting decisions

Archiving/dropping before those decisions are applied risks (a) hard-removing rows a pending merge still
needs to re-parent, and (b) destroying the audit trail the merges rely on for reversibility. Soft-delete-only
+ reversibility are core invariants.

## Preconditions to unblock 4C (do these first, in order)
1. Assistant returns the Cleanup Kit; re-import applies the definitive B1/B2/B3 decisions (per `cleanup-kit/README-reimport.md`); "Unsure" routed to Brian and resolved.
2. Confirm zero open items in the dedup/household review queues.
3. **2A:** confirm PITR is enabled (recoverable-to-the-minute) before any destructive archive/drop.
4. Snapshot `customers` + the ~14,187 soft-deleted rows to a `cleanup.*`/archive table; verify counts.
5. Only then: drop `customer_id`/`customers` and archive, as a versioned migration with dry-run → verify.

Owner of the go/no-go: **Brian (+ architect).**
