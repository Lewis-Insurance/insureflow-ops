-- SEC-004 fix: RLS anon-key bypass on 6 tables
-- Resolves BLA-396 — consolidates fixes from overwatch/bla-375 and overwatch/bla-376
-- Tables patched: analytics_job_runs, ceo_digest_runs, ceo_digest_settings,
--                 coverage_limit_standards, coverage_gap_rules,
--                 scoring_weight_profiles, retention_model_configs
--
-- Root cause: policies created without a TO clause apply to ALL roles including
-- the anon role, allowing unauthenticated reads via the anon key.
-- Fix pattern: scope service-role policies to TO service_role; add TO authenticated
-- to all user-facing SELECT policies.

-- ============================================================
-- 1. analytics_job_runs
-- ============================================================

-- Drop world-readable FOR ALL policy (no TO clause → applies to anon)
DROP POLICY IF EXISTS "Service role can manage job runs" ON public.analytics_job_runs;

-- Drop leaky SELECT policy (no TO clause; agency_workspace_id IS NULL rows exposed to anon)
DROP POLICY IF EXISTS "Admins can view job runs" ON public.analytics_job_runs;

CREATE POLICY "Admins can view job runs"
  ON public.analytics_job_runs
  FOR SELECT
  TO authenticated
  USING (
    agency_workspace_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.agency_workspace_memberships m
      WHERE m.agency_workspace_id = analytics_job_runs.agency_workspace_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
        AND m.status = 'active'
    )
  );

CREATE POLICY "Service role can manage job runs"
  ON public.analytics_job_runs
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- ============================================================
-- 2. ceo_digest_runs
-- ============================================================

-- Drop world-readable FOR ALL policy (no TO clause → applies to anon)
DROP POLICY IF EXISTS "Service role can manage digest runs" ON public.ceo_digest_runs;

-- Drop SELECT policy missing TO clause
DROP POLICY IF EXISTS "Agency admins can view digest runs" ON public.ceo_digest_runs;

CREATE POLICY "Agency admins can view digest runs"
  ON public.ceo_digest_runs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agency_workspace_memberships m
      WHERE m.agency_workspace_id = ceo_digest_runs.agency_workspace_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
        AND m.status = 'active'
    )
  );

CREATE POLICY "Service role can manage digest runs"
  ON public.ceo_digest_runs
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- ============================================================
-- 3. ceo_digest_settings
-- ============================================================

-- Drop world-readable FOR ALL policy (no TO clause → applies to anon)
DROP POLICY IF EXISTS "Service role can manage digest settings" ON public.ceo_digest_settings;

-- Scope remaining user policies to TO authenticated (defensive — they use auth.uid()
-- which returns NULL for anon, so they currently block data access, but scoping
-- makes intent explicit and prevents future regression).
DROP POLICY IF EXISTS "Agency admins can view digest settings" ON public.ceo_digest_settings;
DROP POLICY IF EXISTS "Agency admins can insert digest settings" ON public.ceo_digest_settings;
DROP POLICY IF EXISTS "Agency admins can update digest settings" ON public.ceo_digest_settings;

CREATE POLICY "Agency admins can view digest settings"
  ON public.ceo_digest_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agency_workspace_memberships m
      WHERE m.agency_workspace_id = ceo_digest_settings.agency_workspace_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
        AND m.status = 'active'
    )
  );

CREATE POLICY "Agency admins can insert digest settings"
  ON public.ceo_digest_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agency_workspace_memberships m
      WHERE m.agency_workspace_id = ceo_digest_settings.agency_workspace_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
        AND m.status = 'active'
    )
  );

CREATE POLICY "Agency admins can update digest settings"
  ON public.ceo_digest_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agency_workspace_memberships m
      WHERE m.agency_workspace_id = ceo_digest_settings.agency_workspace_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
        AND m.status = 'active'
    )
  );

CREATE POLICY "Service role can manage digest settings"
  ON public.ceo_digest_settings
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- ============================================================
-- 4. coverage_limit_standards
-- ============================================================

-- "Anyone can view system coverage standards" has no TO clause — anon can read
-- rows where agency_workspace_id IS NULL.  Scope to authenticated.
DROP POLICY IF EXISTS "Anyone can view system coverage standards" ON public.coverage_limit_standards;
DROP POLICY IF EXISTS "Agency members can view their coverage standards" ON public.coverage_limit_standards;
DROP POLICY IF EXISTS "Agency admins can manage coverage standards" ON public.coverage_limit_standards;

CREATE POLICY "Anyone can view system coverage standards"
  ON public.coverage_limit_standards
  FOR SELECT
  TO authenticated
  USING (agency_workspace_id IS NULL);

CREATE POLICY "Agency members can view their coverage standards"
  ON public.coverage_limit_standards
  FOR SELECT
  TO authenticated
  USING (
    agency_workspace_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.agency_workspace_memberships awm
      WHERE awm.agency_workspace_id = coverage_limit_standards.agency_workspace_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

CREATE POLICY "Agency admins can manage coverage standards"
  ON public.coverage_limit_standards
  FOR ALL
  TO authenticated
  USING (
    agency_workspace_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.agency_workspace_memberships awm
      WHERE awm.agency_workspace_id = coverage_limit_standards.agency_workspace_id
        AND awm.user_id = auth.uid()
        AND awm.role IN ('owner', 'admin')
        AND awm.status = 'active'
    )
  );

-- ============================================================
-- 5. coverage_gap_rules
-- ============================================================

-- Both existing policies lack TO clause — rows with NULL agency_workspace_id
-- are readable by anon.  Scope to authenticated.
DROP POLICY IF EXISTS "Users can view coverage gap rules" ON public.coverage_gap_rules;
DROP POLICY IF EXISTS "Admins can manage coverage gap rules" ON public.coverage_gap_rules;

CREATE POLICY "Users can view coverage gap rules"
  ON public.coverage_gap_rules
  FOR SELECT
  TO authenticated
  USING (
    agency_workspace_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.agency_workspace_memberships m
      WHERE m.agency_workspace_id = coverage_gap_rules.agency_workspace_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

CREATE POLICY "Admins can manage coverage gap rules"
  ON public.coverage_gap_rules
  FOR ALL
  TO authenticated
  USING (
    agency_workspace_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.agency_workspace_memberships m
      WHERE m.agency_workspace_id = coverage_gap_rules.agency_workspace_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
        AND m.status = 'active'
    )
  );

-- ============================================================
-- 6. scoring_weight_profiles
-- ============================================================

-- Existing SELECT policies lack TO clause — anon can read system-default rows.
DROP POLICY IF EXISTS "Anyone can view system weight profiles" ON public.scoring_weight_profiles;
DROP POLICY IF EXISTS "Agency members can view their weight profiles" ON public.scoring_weight_profiles;
DROP POLICY IF EXISTS "Agency admins can manage weight profiles" ON public.scoring_weight_profiles;

CREATE POLICY "Anyone can view system weight profiles"
  ON public.scoring_weight_profiles
  FOR SELECT
  TO authenticated
  USING (agency_workspace_id IS NULL AND account_id IS NULL);

CREATE POLICY "Agency members can view their weight profiles"
  ON public.scoring_weight_profiles
  FOR SELECT
  TO authenticated
  USING (
    agency_workspace_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.agency_workspace_memberships awm
      WHERE awm.agency_workspace_id = scoring_weight_profiles.agency_workspace_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  );

CREATE POLICY "Agency admins can manage weight profiles"
  ON public.scoring_weight_profiles
  FOR ALL
  TO authenticated
  USING (
    agency_workspace_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM public.agency_workspace_memberships awm
      WHERE awm.agency_workspace_id = scoring_weight_profiles.agency_workspace_id
        AND awm.user_id = auth.uid()
        AND awm.role IN ('owner', 'admin')
        AND awm.status = 'active'
    )
  );

-- ============================================================
-- 7. retention_model_configs
-- ============================================================

-- "Agency admins can manage retention configs" lacks TO clause — rows with
-- NULL agency_workspace_id (the default model) are readable by anon.
DROP POLICY IF EXISTS "Agency admins can manage retention configs" ON public.retention_model_configs;

CREATE POLICY "Agency admins can manage retention configs"
  ON public.retention_model_configs
  FOR ALL
  TO authenticated
  USING (
    agency_workspace_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.agency_workspace_memberships m
      WHERE m.agency_workspace_id = retention_model_configs.agency_workspace_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
        AND m.status = 'active'
    )
  );
