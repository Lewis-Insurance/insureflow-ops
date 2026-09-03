-- intake-v4 migration M1: stop seeding pipeline_stages on every new account.
--
-- ledger version: pending
--
-- NEEDS LANDEN APPROVAL BEFORE PROD APPLY. Apply through the Supabase management API
-- (MCP apply_migration) only. Never run a CLI push against production.
--
-- What this does
--   Drops one trigger: setup_account_pipeline_stages on public.accounts.
--   That trigger calls create_default_pipeline_stages(NEW.id), which inserts seven
--   rows into public.pipeline_stages for every account ever created. The table has
--   reached 111,909 rows and nothing reads it: the only reader in the app,
--   src/integrations/supabase/hooks/usePipelineStages.ts, queries account_memberships
--   for staff and therefore always returns empty. No edge function references the
--   table (repo and deployed source both checked, report section 10.3).
--
-- What this does NOT do
--   The pipeline_stages table itself stays. So do the foreign keys from leads
--   (pipeline_stage_id, previous_stage_id), pipeline_automation_rules,
--   pipeline_metrics and pipeline_stage_transitions, and the four leads triggers that
--   write stage history. Dropping the table is a separate cleanup step with its own
--   dependency evidence. This migration only stops the growth.
--
-- Blast radius
--   New accounts stop getting seven stage rows. Existing rows are untouched. The
--   function create_default_pipeline_stages stays in place, so the down script is a
--   one line trigger recreate.
--
-- Smoke test after apply
--   1. count rows in pipeline_stages
--   2. create one account
--   3. count again; the number must be identical

drop trigger if exists setup_account_pipeline_stages on public.accounts;

-- >>> DOWN BEGIN
/*
create trigger setup_account_pipeline_stages
  after insert on public.accounts
  for each row execute function setup_default_pipeline_stages();
*/
-- >>> DOWN END
