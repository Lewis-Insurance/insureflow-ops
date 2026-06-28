-- Phase-0 (9/n) — Stream-1: lock the 2 log/audit tables Batch 6B left open
-- (campaign_step_executions, coi_audit_log). No fn/edge/trigger writer found -> service-role (bypass)
-- or staff-app writes only; scope write to is_staff() + revoke anon, consistent with the 6B lockdown.
DO $$
DECLARE r record; incl text[] := array['campaign_step_executions','coi_audit_log'];
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
