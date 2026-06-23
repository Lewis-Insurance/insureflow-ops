# Staging Checklist — Safe Customer Merge Phase 1

Date: 2026-06-23

## Scope
This checklist covers the new Phase 1 safe duplicate-customer merge flow:
- transactional merge preview + execute RPCs
- staged merge review page with typed confirmation
- duplicate detection handoff into the safe merge page
- duplicate triage persistence (`confirmed_duplicate`, `not_duplicate`, `review_later`)

Primary implementation references:
- `supabase/migrations/20260622160000_customer_merge_transactional_v1.sql`
- `src/hooks/useCustomerMerge.ts`
- `src/pages/MergeCustomersPage.tsx`
- `src/components/crm/DuplicateDetection.tsx`
- `docs/audits/customer-merge-transfer-inventory.md`

## Pre-flight
- [ ] Deploy the latest application build to staging.
- [ ] Apply latest Supabase migrations to the staging database.
- [ ] Confirm the new RPCs exist:
  - [ ] `preview_customer_merge_v1`
  - [ ] `merge_customers_transactional_v1`
- [ ] Confirm schema changes exist:
  - [ ] `accounts.merged_into_id`
  - [ ] `accounts.merged_at`
  - [ ] `accounts.merged_by`
  - [ ] `duplicate_pair_reviews`
- [ ] Confirm staff test user has valid access to the relevant `agency_workspace_id`.

## Test data setup
Prepare at least these staging scenarios:
- [ ] Two duplicate accounts in the same workspace/org with linked child records.
- [ ] One pair with conflicting scalar fields (email/phone/address/status).
- [ ] One pair with linked rows in supported transfer tables.
- [ ] One pair with linked rows in unsupported/manual-review tables to force blockers.
- [ ] One account-only duplicate pair surfaced from duplicate detection.
- [ ] One contact duplicate group to confirm merge handoff is not incorrectly enabled.

## Preview RPC validation
### Happy path preview
- [ ] Open `/merge-customers` and select two valid duplicate accounts.
- [ ] Confirm preview loads successfully.
- [ ] Confirm survivor and archived duplicate are clearly labeled.
- [ ] Confirm transfer inventory displays counts by table/relationship.
- [ ] Confirm scalar conflicts display with Phase 1 resolution language.
- [ ] Confirm typed confirmation phrase is shown.

### Blocked preview cases
- [ ] Preview blocks when master and duplicate are the same record.
- [ ] Preview blocks when records belong to different workspaces.
- [ ] Preview blocks when records belong to different orgs.
- [ ] Preview blocks if the duplicate is already merged/archived.
- [ ] Preview blocks when unsupported linked rows exist in manual-review areas.

## Merge execution validation
### Success case
- [ ] Enter the exact confirmation phrase.
- [ ] Execute merge successfully.
- [ ] Confirm success report appears with:
  - [ ] merge ID
  - [ ] transferred counts
  - [ ] deduped counts
  - [ ] warnings (if any)
- [ ] Confirm survivor account opens correctly.
- [ ] Confirm duplicate account is soft-deleted/archived, not hard-deleted.
- [ ] Confirm `accounts.merged_into_id`, `merged_at`, and `merged_by` are populated.
- [ ] Confirm `merge_history` contains audit details.

### Transfer correctness (supported tables)
Verify moved records now belong to the survivor account where present:
- [ ] `customers`
- [ ] `contacts`
- [ ] `policies`
- [ ] `quotes`
- [ ] `documents`
- [ ] `tasks.account_id`
- [ ] `communications`
- [ ] `leads.account_id`
- [ ] `leads.converted_account_id`
- [ ] `renewals`
- [ ] `ao_renewals`
- [ ] `canopy_pulls`
- [ ] `notes`
- [ ] `call_sessions`
- [ ] `sms_messages`

### Dedupe correctness
- [ ] Duplicate tags are not duplicated on survivor.
- [ ] `customer_tags` remain valid after tag dedupe.
- [ ] Duplicate account notes are appended appropriately when expected.

### Confirmation safety
- [ ] Merge button stays disabled until exact phrase matches.
- [ ] Incorrect phrase prevents execution.
- [ ] If blockers are present, execution is disabled/prevented.

## Duplicate detection handoff
- [ ] Run duplicate scan.
- [ ] Confirm scan results render for account duplicate groups.
- [ ] Click **Review & Merge** on an account pair.
- [ ] Confirm navigation to `/merge-customers` with preselected query params.
- [ ] Confirm pair review is persisted as `confirmed_duplicate`.
- [ ] Confirm dismiss action persists `not_duplicate`.
- [ ] Confirm review-later action persists `review_later`.
- [ ] Confirm duplicate group status updates appropriately.
- [ ] Confirm contact duplicate groups do not attempt unsupported account merge flow.

## Failure-path validation
- [ ] Attempt merge with a blocked/manual-review pair and confirm no partial merge occurs.
- [ ] Confirm duplicate account remains active when merge fails.
- [ ] Confirm no partial child-row movement occurs on failed execution.
- [ ] Confirm user receives clear error messaging.

## Regression checks
- [ ] Customers list still loads normally.
- [ ] Customer detail pages still load for survivor and archived duplicate states.
- [ ] Existing non-merge CRM workflows still function.
- [ ] Duplicate detection scanning still completes without runtime errors.

## Known limitations to confirm/accept in staging
- [ ] Full DB runtime validation happened successfully in staging.
- [ ] Manual-review blocker behavior is acceptable for unsupported linked tables.
- [ ] Contact duplicate merge remains intentionally unsupported in this Phase 1 flow.
- [ ] Field-by-field custom survivor value picking is intentionally not included in Phase 1.

## Sign-off
- [ ] Product sign-off
- [ ] Ops sign-off
- [ ] Engineering sign-off
- [ ] Ready for production rollout
