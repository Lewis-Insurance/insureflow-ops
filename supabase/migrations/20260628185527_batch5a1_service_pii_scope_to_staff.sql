-- Batch 5A (tier 1) — scope service-written customer-PII tables to staff.
-- These 28 tables are written ONLY by edge functions (service_role, which BYPASSES RLS)
-- and read by the staff app. They carried a {public}/USING(true) ALL policy, so anon +
-- any authenticated user could read/write customer policy data. Replace each wide-open
-- non-service write/ALL policy with an is_staff() policy (staff keep full access; broader
-- pre-existing staff policies like is_canopy_staff() survive alongside), and revoke anon
-- write grants. service_role edge-function writes unaffected (bypass RLS). Verified
-- SAFE-WITH-FLAGS by adversarial review (0 portal users / 0 non-staff profiles today).
-- DOWN: recreate dropped policies as USING(true)/WITH CHECK(true); GRANT INSERT,UPDATE,DELETE ... TO anon.
DO $$
DECLARE r record;
  incl text[] := array[
    'canopy_addresses','canopy_agents','canopy_business_locations','canopy_business_operations',
    'canopy_carrier_capabilities','canopy_claims','canopy_commercial_vehicles','canopy_documents',
    'canopy_drivers','canopy_driving_records','canopy_dwellings','canopy_enrichment','canopy_loss_events',
    'canopy_monitorings','canopy_named_insureds','canopy_payroll','canopy_policies','canopy_policy_coverages',
    'canopy_pull_snapshots','canopy_servicing_actions','canopy_vehicles','account_churn_risk_scores',
    'policy_renewal_risk_scores','coverage_gap_opportunities','document_analysis','document_analysis_jobs',
    'document_insights','document_processing_queue'];
BEGIN
  FOR r IN
    SELECT tablename, policyname, cmd FROM pg_policies
    WHERE schemaname='public' AND tablename = ANY(incl)
      AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
      AND (coalesce(qual,'')='true' OR coalesce(with_check,'')='true')
      AND roles::text <> '{service_role}'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    IF r.cmd='INSERT' THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_staff())', r.policyname, r.tablename);
    ELSIF r.cmd='UPDATE' THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff())', r.policyname, r.tablename);
    ELSIF r.cmd='DELETE' THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_staff())', r.policyname, r.tablename);
    ELSE
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff())', r.policyname, r.tablename);
    END IF;
  END LOOP;
  FOREACH r.tablename IN ARRAY incl LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon', r.tablename);
  END LOOP;
END $$;
