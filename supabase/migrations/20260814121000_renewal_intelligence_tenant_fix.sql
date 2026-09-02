-- Forward repair for environments that already have either the legacy out-of-band
-- JSON RPC or 20260814120000's first SECURITY DEFINER implementation.
-- Idempotent policy drops preserve the canonical active-membership policies.

DROP POLICY IF EXISTS "Staff can manage renewals" ON public.renewals;
DROP POLICY IF EXISTS "Staff can view all renewals" ON public.renewals;
DROP POLICY IF EXISTS "Staff can insert renewals" ON public.renewals;
DROP POLICY IF EXISTS "Staff can update renewals" ON public.renewals;
DROP POLICY IF EXISTS "Staff can delete renewals" ON public.renewals;

CREATE POLICY "Staff can insert renewals"
  ON public.renewals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.accounts a
      JOIN public.agency_workspace_memberships awm
        ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE a.id = renewals.account_id
        AND awm.user_id = (SELECT auth.uid())
        AND awm.status = 'active'
        AND awm.role IN ('owner', 'admin', 'producer', 'csr')
    )
  );

CREATE POLICY "Staff can update renewals"
  ON public.renewals
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.accounts a
      JOIN public.agency_workspace_memberships awm
        ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE a.id = renewals.account_id
        AND awm.user_id = (SELECT auth.uid())
        AND awm.status = 'active'
        AND awm.role IN ('owner', 'admin', 'producer', 'csr')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.accounts a
      JOIN public.agency_workspace_memberships awm
        ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE a.id = renewals.account_id
        AND awm.user_id = (SELECT auth.uid())
        AND awm.status = 'active'
        AND awm.role IN ('owner', 'admin', 'producer', 'csr')
    )
  );

CREATE POLICY "Staff can delete renewals"
  ON public.renewals
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.accounts a
      JOIN public.agency_workspace_memberships awm
        ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE a.id = renewals.account_id
        AND awm.user_id = (SELECT auth.uid())
        AND awm.status = 'active'
        AND awm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Staff can manage all campaigns" ON public.renewal_campaigns;
DROP POLICY IF EXISTS "Staff can manage renewal campaigns" ON public.renewal_campaigns;
DROP POLICY IF EXISTS "Staff can view all campaigns" ON public.renewal_campaigns;
DROP POLICY IF EXISTS "Staff can manage campaigns" ON public.renewal_campaigns;
DROP POLICY IF EXISTS "Users can view campaigns for their workspace accounts"
  ON public.renewal_campaigns;

CREATE POLICY "Users can view campaigns for their workspace accounts"
  ON public.renewal_campaigns
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.renewals r
      JOIN public.accounts a
        ON a.id = r.account_id
      JOIN public.agency_workspace_memberships awm
        ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE r.id = renewal_campaigns.renewal_id
        AND r.account_id = renewal_campaigns.account_id
        AND awm.user_id = (SELECT auth.uid())
        AND awm.status = 'active'
    )
  );

CREATE POLICY "Staff can manage campaigns"
  ON public.renewal_campaigns
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.renewals r
      JOIN public.accounts a
        ON a.id = r.account_id
      JOIN public.agency_workspace_memberships awm
        ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE r.id = renewal_campaigns.renewal_id
        AND r.account_id = renewal_campaigns.account_id
        AND awm.user_id = (SELECT auth.uid())
        AND awm.status = 'active'
        AND awm.role IN ('owner', 'admin', 'producer', 'csr')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.renewals r
      JOIN public.accounts a
        ON a.id = r.account_id
      JOIN public.agency_workspace_memberships awm
        ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE r.id = renewal_campaigns.renewal_id
        AND r.account_id = renewal_campaigns.account_id
        AND awm.user_id = (SELECT auth.uid())
        AND awm.status = 'active'
        AND awm.role IN ('owner', 'admin', 'producer', 'csr')
    )
  );

DROP FUNCTION IF EXISTS public.get_renewal_intelligence_summary();

CREATE FUNCTION public.get_renewal_intelligence_summary()
RETURNS TABLE(
  total_renewals integer,
  renewals_next_30_days integer,
  critical_risk integer,
  high_risk integer,
  medium_risk integer,
  low_risk integer,
  avg_risk_score integer,
  active_campaigns integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  WITH caller AS (
    SELECT auth.uid() AS user_id
    WHERE auth.uid() IS NOT NULL
      AND public.is_staff()
  ),
  open_renewals AS (
    SELECT r.risk_level, r.risk_score, r.renewal_date
    FROM public.renewals r
    JOIN public.accounts a
      ON a.id = r.account_id
    WHERE r.status IN ('upcoming', 'in_progress')
      AND EXISTS (
        SELECT 1
        FROM public.agency_workspace_memberships awm
        JOIN caller c
          ON c.user_id = awm.user_id
        WHERE awm.agency_workspace_id = a.agency_workspace_id
          AND awm.status = 'active'
      )
  )
  SELECT
    (SELECT count(*)::int FROM open_renewals),
    (SELECT count(*)::int FROM open_renewals
       WHERE renewal_date >= current_date
         AND renewal_date <= current_date + 30),
    (SELECT count(*)::int FROM open_renewals WHERE risk_level = 'critical'),
    (SELECT count(*)::int FROM open_renewals WHERE risk_level = 'high'),
    (SELECT count(*)::int FROM open_renewals WHERE risk_level = 'medium'),
    (SELECT count(*)::int FROM open_renewals WHERE risk_level = 'low'),
    (SELECT COALESCE(round(avg(COALESCE(risk_score, 0)))::int, 0)
       FROM open_renewals),
    (
      SELECT count(*)::int
      FROM public.renewal_campaigns rc
      JOIN public.renewals rr
        ON rr.id = rc.renewal_id
       AND rr.account_id = rc.account_id
      JOIN public.accounts a
        ON a.id = rc.account_id
      WHERE rc.status = 'active'
        AND EXISTS (
          SELECT 1
          FROM public.agency_workspace_memberships awm
          WHERE awm.user_id = caller.user_id
            AND awm.agency_workspace_id = a.agency_workspace_id
            AND awm.status = 'active'
        )
    )
  FROM caller;
$function$;

REVOKE ALL ON FUNCTION public.get_renewal_intelligence_summary()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_renewal_intelligence_summary()
  TO authenticated;
