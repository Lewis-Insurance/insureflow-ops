-- ============================================
-- CRON SECRET INFRASTRUCTURE
-- ============================================
-- This migration sets up the infrastructure for secure cron job authentication.
-- The actual secret value must be inserted manually via the runbook.
--
-- IMPORTANT: Do NOT put the actual secret value in this migration file.
-- See: docs/CRON_SECRET_RUNBOOK.md for manual steps.
-- ============================================

-- Ensure required extensions are available
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================
-- HELPER FUNCTION FOR VAULT SECRET ACCESS
-- ============================================
-- This function provides controlled access to vault secrets.
-- Only the database owner (used by pg_cron) can call it.

CREATE SCHEMA IF NOT EXISTS internal;

CREATE OR REPLACE FUNCTION internal.get_vault_secret(p_name text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = vault, public
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = p_name
  LIMIT 1;
$$;

-- Revoke public access - only db owner can use this
REVOKE ALL ON FUNCTION internal.get_vault_secret(text) FROM PUBLIC;

COMMENT ON FUNCTION internal.get_vault_secret(text) IS
  'Safely retrieves a decrypted secret from Supabase Vault. Used by pg_cron for authenticated edge function calls.';

-- ============================================
-- HELPER FUNCTION TO BUILD CRON HEADERS
-- ============================================
-- Returns the headers needed for authenticated cron calls

CREATE OR REPLACE FUNCTION internal.get_cron_headers()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = internal, vault, public
AS $$
  SELECT jsonb_build_object(
    'Content-Type', 'application/json',
    'X-Cron-Secret', COALESCE(internal.get_vault_secret('CRON_SECRET'), '')
  );
$$;

REVOKE ALL ON FUNCTION internal.get_cron_headers() FROM PUBLIC;

COMMENT ON FUNCTION internal.get_cron_headers() IS
  'Returns headers for pg_cron HTTP calls with X-Cron-Secret authentication. Omits Authorization header (not needed with cron secret).';

-- ============================================
-- UPDATE EXISTING CRON JOBS
-- ============================================
-- Note: These updates will fail until the CRON_SECRET is inserted into Vault.
-- That's intentional - it forces the manual runbook step.

-- First, unschedule any existing jobs that will be replaced
SELECT cron.unschedule('nurture-campaign-auto-enrollment') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'nurture-campaign-auto-enrollment'
);

SELECT cron.unschedule('daily-renewal-risk-calculation') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-renewal-risk-calculation'
);

-- ============================================
-- AUTOMATION PROCESSOR CRON JOBS
-- ============================================
-- These are commented out until the secret is inserted.
-- Run these AFTER completing the runbook (docs/CRON_SECRET_RUNBOOK.md).
-- Copy each block to SQL editor and execute individually.

-- [STEP 4.1] Process automation triggers every 5 minutes
-- SELECT cron.schedule(
--   'automation-process-triggers',
--   '*/5 * * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://lrqajzwcmdwahnjyidgv.supabase.co/functions/v1/automation-processor',
--     headers := internal.get_cron_headers(),
--     body := '{"action": "process_triggers"}'::jsonb
--   );
--   $$
-- );

-- [STEP 4.2] Execute scheduled automation stages every 5 minutes
-- SELECT cron.schedule(
--   'automation-execute-stages',
--   '*/5 * * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://lrqajzwcmdwahnjyidgv.supabase.co/functions/v1/automation-processor',
--     headers := internal.get_cron_headers(),
--     body := '{"action": "execute_stages"}'::jsonb
--   );
--   $$
-- );

-- [STEP 4.3] Check automation goals every 15 minutes
-- SELECT cron.schedule(
--   'automation-check-goals',
--   '*/15 * * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://lrqajzwcmdwahnjyidgv.supabase.co/functions/v1/automation-processor',
--     headers := internal.get_cron_headers(),
--     body := '{"action": "check_goals"}'::jsonb
--   );
--   $$
-- );

-- [STEP 4.4] Cleanup old automation executions daily at 3 AM
-- SELECT cron.schedule(
--   'automation-cleanup',
--   '0 3 * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://lrqajzwcmdwahnjyidgv.supabase.co/functions/v1/automation-processor',
--     headers := internal.get_cron_headers(),
--     body := '{"action": "cleanup"}'::jsonb
--   );
--   $$
-- );

-- [STEP 4.5] Daily renewal risk batch calculation at 2 AM
-- SELECT cron.schedule(
--   'daily-renewal-risk-calculation',
--   '0 2 * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://lrqajzwcmdwahnjyidgv.supabase.co/functions/v1/renewal-risk-batch',
--     headers := internal.get_cron_headers(),
--     body := '{"days_ahead": 120}'::jsonb
--   );
--   $$
-- );

-- ============================================
-- VERIFICATION VIEW
-- ============================================
-- View to check cron job status

CREATE OR REPLACE VIEW internal.cron_job_status AS
SELECT
  jobid,
  jobname,
  schedule,
  active,
  (SELECT COUNT(*) FROM cron.job_run_details WHERE job_run_details.jobid = job.jobid AND status = 'succeeded') as success_count,
  (SELECT COUNT(*) FROM cron.job_run_details WHERE job_run_details.jobid = job.jobid AND status = 'failed') as failure_count,
  (SELECT MAX(end_time) FROM cron.job_run_details WHERE job_run_details.jobid = job.jobid) as last_run
FROM cron.job;

COMMENT ON VIEW internal.cron_job_status IS
  'Shows status of all pg_cron jobs including success/failure counts.';

-- ============================================
-- NOTES
-- ============================================
-- After running this migration:
-- 1. Follow docs/CRON_SECRET_RUNBOOK.md to insert the secret into Vault
-- 2. Uncomment the cron.schedule calls above and run them
-- 3. Verify jobs are working via: SELECT * FROM internal.cron_job_status;
