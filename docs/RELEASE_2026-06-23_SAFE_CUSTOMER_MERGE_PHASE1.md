# Release Notes — Safe Customer Merge Phase 1

Date: 2026-06-23

## Summary
This release replaces the old browser-driven duplicate customer merge path with a safer Phase 1 workflow built around server-side preview and transactional execution.

The main goal is to reduce partial merges, improve auditability, and route duplicate review into one safer merge process.

## What changed

### 1) Transactional customer merge backend
Added a new backend foundation in:
- `supabase/migrations/20260622160000_customer_merge_transactional_v1.sql`

This introduces:
- `preview_customer_merge_v1(master, duplicate)`
- `merge_customers_transactional_v1(master, duplicate, confirmation, options)`
- `duplicate_pair_reviews`
- merge metadata on `accounts` (`merged_into_id`, `merged_at`, `merged_by`)
- richer merge audit/history behavior

### 2) Safer merge review UI
Updated:
- `src/hooks/useCustomerMerge.ts`
- `src/pages/MergeCustomersPage.tsx`

The merge page now supports:
- survivor vs archived duplicate review
- server-side preview before execution
- blockers and warnings
- transfer counts by table/relationship
- scalar conflict summaries
- exact typed confirmation phrase
- post-merge success summary

### 3) Duplicate detection now hands off to the safe flow
Updated:
- `src/components/crm/DuplicateDetection.tsx`

Duplicate detection now:
- routes account merge review into `/merge-customers`
- persists duplicate triage decisions (`confirmed_duplicate`, `not_duplicate`, `review_later`)
- avoids using the old fragmented direct final-merge path for account merges

## Why this matters
Previously, duplicate customer merges were executed through client-side sequential updates. That created risk of partial merges if something failed midway.

This Phase 1 release moves the critical merge decision and execution path toward:
- transactional behavior
- stronger safety checks
- clearer operator review
- better auditability
- fail-closed handling for unsupported linked data

## Supported Phase 1 transfer behavior
Phase 1 explicitly supports transactional handling for the core currently known merge path, including areas like:
- customers
- contacts
- policies
- quotes
- documents
- tasks
- communications
- leads
- renewals
- AO renewals
- canopy pulls
- notes
- call sessions
- SMS messages
- tags/tag joins

Reference:
- `docs/audits/customer-merge-transfer-inventory.md`

## Intentional Phase 1 limitations
This release does **not** yet include:
- field-by-field custom survivor value selection
- contact duplicate merge support in the safe merge flow
- bulk merge workflows
- self-service rollback/unmerge
- full automation/tasking around duplicate review

Unsupported linked-table situations are designed to block merge execution rather than allow silent partial movement.

## Verification completed before push
- production build passed
- focused linting on Phase 1 files passed
- static review of migration/RPC/client wiring completed
- compatibility fix applied for `replaceAll`
- generated types cleanup applied

## Remaining rollout note
Runtime database execution of the new merge RPCs should still be validated in staging if not already done in your deployment path. Use:
- `docs/STAGING_CHECKLIST_2026-06-23_SAFE_CUSTOMER_MERGE_PHASE1.md`

## Additional cleanup pushed alongside this work
A small AO Renewals follow-up was also pushed:
- clearer denied-term display in add/edit quote modals
- safer reapplication behavior for the AO denied-quote migration constraint

## Recommended next steps
1. Run the staging checklist.
2. Validate at least one successful merge and one blocked merge.
3. Confirm duplicate detection triage persistence.
4. Roll out to production after staging sign-off.
5. Plan Phase 2 for richer conflict resolution and broader duplicate workflow unification.
