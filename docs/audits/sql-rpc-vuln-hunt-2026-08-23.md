# SQL / RPC vulnerability hunt — 2026-08-23

Commit: `e4e7c6c6a61685066add54c5d4a79473d7392bbb`  
Run: `bc-25b7e70b-c835-4caa-ae14-5296b71a66a9`  
Scope: `/workspace/supabase/migrations/` PostgREST-reachable RLS + SECURITY DEFINER RPCs  
Machine-readable: [sql-rpc-vuln-hunt-2026-08-23-findings.json](./sql-rpc-vuln-hunt-2026-08-23-findings.json)

## Summary

10 **NEW** HIGH/CRITICAL findings (4 critical, 6 high). Already-reported objects (intake_*, rate_watch_*, llm_invocations/artifacts, lead_commercial_insurance, bundle_snapshots, renewal_report_artifacts, get_ao_renewal_rate_watch_summary, get_pulls_without_monitoring, coi-certificates storage) were excluded. Batch 5A1/5A2/6B DO-block rewrites were simulated so fixed ALL/true policies are not re-reported.

## Critical

1. **enrichment_cache** — FOR ALL `auth.uid() IS NOT NULL`; VIN/property/business enrichment JSON dump+write.
2. **field_output_history** — SELECT `USING(TRUE)`; extracted field raw/normalized values (distinct from llm_artifacts).
3. **extraction_review_queue** (+ **review_responses**) — SELECT TRUE + any-auth UPDATE of `queue_data`.
4. **document_evidence_items** — misnamed Staff policies are only `auth.uid() IS NOT NULL`; plus unguarded `get_evidence_item` DEFINER.

## High

5. **coi_build_line** — DEFINER, no auth; full COI line JSON by `policy_id` (unlike gated `get_master_coi`).
6. **sync_renewals_from_policies** — DEFINER, no auth; mass-inserts renewals (distinct from hardened `sync_policies_to_renewals`).
7. **portal_branding** — FOR ALL `auth.uid() IS NOT NULL`; cross-tenant branding takeover.
8. **llm_prompt_templates** — any-auth UPDATE poisons extraction prompts.
9. **get_collection_status_summary** — DEFINER, no auth; collection progress by workspace UUID.
10. **reprocessing_queue** — FOR ALL `USING(true)`; read/rewrite reprocessing jobs.

## Rejected (sampled)

- `acord_templates` ALL true → batch5a2 → `is_staff()`
- `acord_generation_jobs` → table dropped
- `rollback_import_batch` → fixed in `20260814180000`
- `customers_search_v1` → invoker wrapper over staff-gated `unified_customer_search`
- Canopy / predictive ALL true → batch5a1 staff rewrite
- Global `is_staff()` cross-tenant class (skipped per brief)
