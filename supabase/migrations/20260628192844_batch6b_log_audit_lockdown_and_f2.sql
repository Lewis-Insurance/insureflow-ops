-- Batch 6B + F2 — lock the append-only log/audit tier; convert its two INVOKER trigger
-- writers to SECURITY DEFINER so they keep writing after the public policies are removed.
-- All writer functions are owned by postgres (BYPASSRLS), and the service-role edge writers
-- (canopy_webhook_log, collection_audit_log) bypass RLS too — so dropping the {public} write
-- policy + revoking anon cannot break the legitimate write path. Left OPEN (flagged):
-- campaign_step_executions, coi_audit_log (no confirmed writer), and public-flow
-- jobs/job_events/intake_submissions/comparison_sessions/leads.
-- DOWN: ALTER FUNCTION ... SECURITY INVOKER; recreate dropped policies as USING/CHECK(true); re-grant anon.
ALTER FUNCTION public.log_audit() SECURITY DEFINER;
ALTER FUNCTION public.log_audit() SET search_path = public;
ALTER FUNCTION public.update_lead_score_on_canopy_complete() SECURITY DEFINER;
ALTER FUNCTION public.update_lead_score_on_canopy_complete() SET search_path = public;

DO $$
DECLARE r record;
  incl text[] := array['audit_logs','automation_executions','campaign_enrollments','collection_token_audit',
    'document_access_log','generated_tasks_log','producer_workload_stats','profile_access_logs',
    'task_activity_feed','task_generation_log','canopy_webhook_log','collection_audit_log'];
BEGIN
  FOR r IN SELECT tablename, policyname, cmd FROM pg_policies
    WHERE schemaname='public' AND tablename=ANY(incl) AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
      AND (coalesce(qual,'')='true' OR coalesce(with_check,'')='true') AND roles::text<>'{service_role}'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    IF r.cmd='INSERT' THEN EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_staff())', r.policyname, r.tablename);
    ELSIF r.cmd='UPDATE' THEN EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff())', r.policyname, r.tablename);
    ELSIF r.cmd='DELETE' THEN EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_staff())', r.policyname, r.tablename);
    ELSE EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff())', r.policyname, r.tablename);
    END IF;
  END LOOP;
  FOREACH r.tablename IN ARRAY incl LOOP EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon', r.tablename); END LOOP;
END $$;
