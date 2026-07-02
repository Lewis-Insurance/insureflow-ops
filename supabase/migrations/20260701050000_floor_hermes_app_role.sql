-- ============================================================================
-- THE FLOOR — hermes_app least-privilege role (Phase 0)
-- Grants on hermes.* schema are applied in lewis-the-floor repo.
-- Does NOT bypass RLS; service_role continues to own edge-function writes.
-- Staged only. Do not apply to prod until Brian clears Phase 0 blockers.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hermes_app') THEN
    CREATE ROLE hermes_app NOLOGIN;
  END IF;
END;
$$;

COMMENT ON ROLE hermes_app IS
  'Least-privilege Floor reader for Hermes runtime. hermes schema grants live in lewis-the-floor.';

GRANT USAGE ON SCHEMA public TO hermes_app;

GRANT SELECT ON public.automation_work_requests TO hermes_app;
GRANT SELECT ON public.automation_work_request_events TO hermes_app;
GRANT SELECT ON public.decision_packages TO hermes_app;
GRANT SELECT ON public.feedback_events TO hermes_app;
GRANT SELECT ON public.floor_client_send_approvals TO hermes_app;
GRANT SELECT ON public.policy_in_force_status TO hermes_app;

GRANT SELECT ON public.accounts TO hermes_app;
GRANT SELECT ON public.policies TO hermes_app;
GRANT SELECT ON public.insured_emails TO hermes_app;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'account_aliases'
  ) THEN
    GRANT SELECT ON public.account_aliases TO hermes_app;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_account(UUID, TEXT, TEXT, TEXT) TO hermes_app;
GRANT EXECUTE ON FUNCTION public.floor_normalize_phone(TEXT) TO hermes_app;
