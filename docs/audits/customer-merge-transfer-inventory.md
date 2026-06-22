# Customer/account merge transfer inventory (Phase 1)

Date: 2026-06-22

## Entity model decision

The current merge UI/hook passes `accounts.id` values as the customer IDs. Phase 1 therefore treats `public.accounts` as the merge root. Rows in `public.customers` are account-linked child records and are reassigned to the survivor account; existing `customer_id` references remain valid because the referenced customer rows are not deleted or rewritten.

## Phase 1 RPCs

Migration: `supabase/migrations/20260622160000_customer_merge_transactional_v1.sql`

- `preview_customer_merge_v1(master, duplicate)` returns summaries, scalar conflicts, transfer counts, warnings, blockers, and the required confirmation phrase.
- `merge_customers_transactional_v1(master, duplicate, confirmation, options)` takes ordered advisory locks, reruns preview/confirmation while locked, blocks on any preview blockers, transfers supported rows in one transaction, writes `merge_history`, marks duplicate flags/groups/reviews, and soft-deletes the duplicate account.

Authorization/tenant safety:

- Both RPCs are `SECURITY DEFINER`, so they explicitly require `public.is_staff()`.
- Preview raises before returning account summaries if the caller is not an active member of the account's `agency_workspace_id`.
- Cross-`org_id` and cross-`agency_workspace_id` merges are blockers, not warnings.

## Explicit Phase 1 transfer coverage

These are transferred by the transactional RPC when the relevant table/column exists:

| Table | FK column | Strategy | Notes |
|---|---:|---|---|
| `customers` | `account_id` | `reassign_fk` | Moves customer child rows to survivor; preserves `customer_id` references. |
| `contacts` | `account_id` | `reassign_fk` | Closes old narrow RPC coverage gap. |
| `policies` | `account_id` | `reassign_fk` | Current browser merge coverage. |
| `quotes` | `account_id` | `reassign_fk` | Current browser merge coverage. |
| `documents` | `account_id` | `reassign_fk` | Does not move storage objects. |
| `tasks` | `account_id` | `reassign_fk` | Does **not** rewrite `tasks.customer_id`; customer rows move instead. |
| `communications` | `account_id` | `reassign_fk` | Current browser merge coverage. |
| `leads` | `account_id` | `reassign_fk` | Current browser merge coverage. |
| `leads` | `converted_account_id` | `reassign_fk` | Current browser merge coverage. |
| `renewals` | `account_id` | `reassign_fk` | Current browser merge coverage. |
| `ao_renewals` | `account_id` | `reassign_fk` | Current browser merge coverage; column is handled even if FK metadata is absent. |
| `canopy_pulls` | `account_id` | `reassign_fk` | Current browser merge coverage. |
| `notes` | `account_id` | `reassign_fk` | Account notes also append duplicate account notes to master. |
| `call_sessions` | `account_id` | `reassign_fk` | Old narrow RPC coverage. |
| `sms_messages` | `account_id` | `reassign_fk` | Old narrow RPC coverage. |
| `account_tags` | `account_id` | `dedupe_then_reassign` | Dedupe by case-insensitive `tag_name`, then move remaining tags. |
| `tags` | `account_id` | `dedupe_then_reassign` | Dedupe by case-insensitive `name`; repoints `customer_tags` before deleting duplicate tag rows. |
| `duplicate_flags` | `account_id` | `append_history_only` | Adds status/resolution columns and marks duplicate flags `merged`; does not move them to survivor. |
| `duplicate_groups` | `entity_ids` | `append_history_only` | Marks matching account duplicate groups `merged`. |
| `duplicate_pair_reviews` | pair columns | `append_history_only` | New normalized pair-review table; matching pair is marked `merged`. |
| `merge_history` | n/a | audit insert | Stores preview, before snapshots, counts, row IDs, scalar changes, warnings, user, timestamp. |

## Customer-linked tables preserved by moving `customers.account_id`

The generated schema shows `customer_id` FKs from at least:

- `customer_tags.customer_id`
- `notes.customer_id`
- `opportunities.customer_id`
- `tasks.customer_id`

Phase 1 does not rewrite those `customer_id` values. Because duplicate account customer rows are reassigned to the survivor account, those references remain valid and follow the customer rows.

## Account/customer FK inventory from generated schema

`src/integrations/supabase/types.ts` currently exposes many account FKs beyond the browser merge path. The preview RPC discovers these live via `information_schema` and includes them in `transferableTables`.

Known account-linked areas include:

- Core/current merge path: `customers`, `contacts`, `policies`, `quotes`, `documents`, `tasks`, `communications`, `leads`, `renewals`, `ao_renewals`, `canopy_pulls`, `notes`, `call_sessions`, `sms_messages`, `account_tags`, `tags`.
- Duplicate workflow: `duplicate_flags`, `duplicate_groups`, `duplicate_pair_reviews`, `merge_history`.
- Additional account-linked tables discovered in generated types that are **not** silently moved in Phase 1: `account_memberships`, `acord_forms`, `ai_conversations`, `ai_module_executions`, `assignment_rules`, `campaign_enrollments`, `canopy_monitorings`, `certificates_of_insurance`, `client_context_cache`, `client_context_embeddings`, `client_context_index_jobs`, `client_happiness_scores`, `client_portal_users`, `collection_access_tokens`, `commercial_business_accounts`, `commission_reports`, `commission_structures`, `communication_history`, `communication_preferences`, `comparison_workspaces`, `consents`, `coverage_gap_analysis`, `crm_prefill_log`, `customer_predictions`, `customer_risk_scores`, `document_analyses`, `document_analysis`, `document_extractions`, `document_processing_queue`, `document_qa_cache`, `extracted_home_insurance`, `extracted_policies`, `household_accounts`, `import_jobs`, `insured_addresses`, `insured_emails`, `insured_phones`, `insured_profiles`, `intake_submissions`, `invoices`, `jobs`, `knowledge_base`, line-specific lead tables, lead source tables, marketing/nurture/review tables, `message_templates`, `offline_queue`, `opportunities`, `parsed_documents`, pipeline tables, portal tables, predictive/retention tables, `premium_payments`, `producer_workload_stats`, `product_recommendations`, `rate_watch_jobs`, `renewal_campaigns`, `renewal_risk_history`, `review_requests`, `reviews`, `scoring_weight_profiles`, `service_tickets`, `submission_packages`, `team_conversations`, and `tickets`.

For those non-covered account FKs, preview returns `strategy: 'manual_review'`. If any duplicate-linked rows exist, preview adds blockers and execution refuses to run. This is intentional fail-closed behavior for Phase 1.

## Likely unique-constraint/blocker cases

Handled safely:

- `account_tags(account_id, tag_name)` / equivalent uniqueness: duplicate tag names are deleted after preserving survivor tags.
- `tags(account_id, lower(name))`: duplicate tag names are collapsed; `customer_tags` are repointed before duplicate tag rows are removed.
- `customer_tags(customer_id, tag_id)` primary key: inserts use `ON CONFLICT DO NOTHING` before old duplicate-tag joins are deleted.

Blocked/warned by design instead of silently moved:

- One-to-one account tables like `customer_risk_scores`, `insured_profiles`, `household_accounts`, and `commercial_business_accounts` can collide on survivor account ID.
- Portal/account membership tables can have uniqueness around account + user/email/invitation and need product-specific resolution.
- Client context/cache/embedding/index-job tables can contain unique `(account_id, source_type, source_id)` or cache-key constraints and may require recomputation instead of direct reassignment.
- Insurance contact detail tables (`insured_emails`, `insured_phones`, `insured_addresses`) have per-account unique/primary indexes; they need field-level dedupe rules before transfer.
- Tables with global unique identifiers (`invoice_number`, ticket/certificate numbers, idempotency keys, Twilio SIDs, portal referral codes) are generally safe from account reassignment collisions but remain unsupported unless specifically covered.

## Scalar merge rules

- Master wins for non-empty scalar conflicts.
- If `fillBlankMasterFields` is true (default), blank master fields may be filled from duplicate for an explicit allowlist: email, phones, address fields, DOB/entity/trust support fields, source/detail, spouse name, and TIN last4.
- Duplicate account notes are appended to master notes by default, with a merge marker.
- Duplicate account is soft-deleted only (`deleted_at`, `merged_into_id`, `merged_at`, `merged_by`).
