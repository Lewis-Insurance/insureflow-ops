-- ============================================================================
-- COI module Phase 1: drop the dead acord_generation_jobs queue table.
-- Spec: docs/COI Module/coi-module/01-disposition-and-roadmap.md Section 3 (D4).
--
-- Verified 2026-07-02 (project lrqajzwcmdwahnjyidgv): 0 rows, no incoming FK,
-- no dependent view. Referenced only by the deleted System A dead code
-- (src/lib/acord/generationQueue.ts, supabase/functions/pdf-generation-worker/)
-- and the generated types (regenerated after this migration).
--
-- acord_notifications is intentionally NOT dropped: its notify_acord_status_change
-- trigger writes to it (20251218204626_acord_form_automation_suite.sql).
-- ============================================================================

DROP TABLE IF EXISTS public.acord_generation_jobs;
