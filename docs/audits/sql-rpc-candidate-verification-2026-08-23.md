# Independent verification — SQL/RLS/RPC candidates (2026-08-23)

Commit under test: `e4e7c6c6a61685066add54c5d4a79473d7392bbb`  
Verifier run: `bc-25b7e70b-c835-4caa-ae14-5296b71a66a9`  
Method: full migration replay analysis in `supabase/migrations/` (no invented tables). Later migrations searched for DROP POLICY / CREATE OR REPLACE / REVOKE that would close each hole.

Machine-readable findings: [sql-rpc-vuln-hunt-2026-08-23-findings.json](./sql-rpc-vuln-hunt-2026-08-23-findings.json)

## Verdict

**All 10 candidates CONFIRMED.** None rejected. No replacement hunt required.

Tenancy hardening (`20260702190000` / `20260702200000`) locked layout/OCR/extraction children and `review_queue_items`, but left these siblings and RPCs open. `20260814180000` only hardened `rollback_import_batch` / outbox helpers.

## Candidate results

| # | Object | Verdict | Final policy / grant state | One migration (primary) |
|---|--------|---------|----------------------------|-------------------------|
| 1 | `enrichment_cache` | **CONFIRM** CRITICAL | `enrichment_cache_all` FOR ALL `USING (auth.uid() IS NOT NULL)`; never dropped | `20251218204626_acord_form_automation_suite.sql` |
| 2 | `field_output_history` | **CONFIRM** CRITICAL | `field_history_select` SELECT `USING (TRUE)` | `20251221000005_prompt_versioning_and_llm_tracking.sql` |
| 3 | `extraction_review_queue` + `review_responses` | **CONFIRM** CRITICAL | SELECT `USING (TRUE)` + UPDATE `auth.uid() IS NOT NULL` | `20251221000006_extraction_enhancements.sql` |
| 4 | `document_evidence_items` + `get_evidence_item` | **CONFIRM** CRITICAL | Misnamed Staff policies = `auth.uid() IS NOT NULL`; DEFINER RPC no gate, EXECUTE to authenticated | `20251222160000_explore_document_minimal_delta.sql` |
| 5 | `coi_build_line` | **CONFIRM** HIGH | DEFINER, no `is_staff`; EXECUTE to authenticated. Contrast: `get_master_coi` gated same file | `20260702172000_master_coi_rpcs.sql` |
| 6 | `sync_renewals_from_policies` | **CONFIRM** HIGH | DEFINER, no auth, mass INSERT renewals; EXECUTE authenticated. Distinct from staff-gated `sync_policies_to_renewals` in `20260702090000` | `20260410000012_sync_renewals_from_policies.sql` |
| 7 | `portal_branding` | **CONFIRM** HIGH | `authenticated_manage_portal_branding` FOR ALL `auth.uid() IS NOT NULL` ORs with earlier active-only SELECT | `20251222240000_document_collection_portal_security.sql` |
| 8 | `llm_prompt_templates` | **CONFIRM** HIGH | `templates_update` any-auth; `templates_select` TRUE | `20251221000005_prompt_versioning_and_llm_tracking.sql` |
| 9 | `get_collection_status_summary` | **CONFIRM** HIGH | DEFINER, no auth; aggregates by caller `p_workspace_id`; EXECUTE authenticated. Bypasses later owner-scoped table RLS | `20251222220000_document_collection_module.sql` |
| 10 | `reprocessing_queue` | **CONFIRM** HIGH (wording corrected) | After replay: `00003` table DROPped (no `priority`) so `authenticated_access` CASCADE-gone; surviving hole is `reprocessing_select` `USING (TRUE)` + INSERT/UPDATE any-auth from `00005`. Still any-login dump/mutate | `20251221000005_prompt_versioning_and_llm_tracking.sql` |

### #10 correction note

Candidate text said `FOR ALL USING(true)` citing `authenticated_access` in `20251221000003`. On ordered migration replay that policy does **not** survive: `20251221000005` drops `reprocessing_queue` (missing `priority`) then recreates open SELECT/INSERT/UPDATE policies. Vulnerability remains confirmed under the corrected final-state policies.

### `build_coi_line`

No function named `build_coi_line` exists. Only `coi_build_line` (candidate 5).

## Attack model

Attacker = authenticated customer portal user (`is_staff = false`) with Supabase anon key + user JWT. PostgREST `/rest/v1/<table>` and `/rest/v1/rpc/<fn>`.

## New-issue hunt

Skipped: all 10 candidates confirmed (brief: hunt 1–3 new only if candidates fail). Residuals noted but not filed: `extraction_global_conflicts` SELECT TRUE, `search_document_chunks` unguarded DEFINER, `enrichment_usage` / `carrier_portals` ALL `auth.uid()`, `confidence_calibration` SELECT TRUE.
