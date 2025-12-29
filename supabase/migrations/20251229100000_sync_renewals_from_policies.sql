-- Function to sync/generate renewal records from policies with upcoming expirations
-- This creates renewal records for policies expiring in the next 90 days that don't already have renewal records

CREATE OR REPLACE FUNCTION public.sync_renewals_from_policies(
  p_days_ahead INTEGER DEFAULT 90
)
RETURNS TABLE (
  policies_processed INTEGER,
  renewals_created INTEGER,
  renewals_updated INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policies_processed INTEGER := 0;
  v_renewals_created INTEGER := 0;
  v_renewals_updated INTEGER := 0;
  v_policy RECORD;
BEGIN
  -- Loop through policies with upcoming expirations that don't have renewal records
  FOR v_policy IN
    SELECT
      p.id AS policy_id,
      p.account_id,
      p.policy_number,
      p.line_of_business AS policy_type,
      p.carrier,
      p.expiration_date,
      p.premium,
      p.status AS policy_status
    FROM policies p
    WHERE p.deleted_at IS NULL
      AND p.expiration_date IS NOT NULL
      AND p.expiration_date >= CURRENT_DATE
      AND p.expiration_date <= CURRENT_DATE + (p_days_ahead || ' days')::INTERVAL
      AND p.status IN ('active', 'pending')
      AND NOT EXISTS (
        SELECT 1 FROM renewals r
        WHERE r.policy_id = p.id
          AND r.renewal_date = p.expiration_date
      )
  LOOP
    v_policies_processed := v_policies_processed + 1;

    -- Create renewal record
    INSERT INTO renewals (
      account_id,
      policy_id,
      policy_number,
      policy_type,
      carrier,
      renewal_date,
      expiration_date,
      current_premium,
      status,
      priority,
      created_at,
      updated_at
    ) VALUES (
      v_policy.account_id,
      v_policy.policy_id,
      v_policy.policy_number,
      v_policy.policy_type,
      v_policy.carrier,
      v_policy.expiration_date,
      v_policy.expiration_date,
      v_policy.premium,
      CASE
        WHEN v_policy.expiration_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'in_progress'
        ELSE 'upcoming'
      END,
      CASE
        WHEN v_policy.expiration_date <= CURRENT_DATE + INTERVAL '30 days' THEN 'high'
        WHEN v_policy.expiration_date <= CURRENT_DATE + INTERVAL '60 days' THEN 'medium'
        ELSE 'low'
      END,
      NOW(),
      NOW()
    );

    v_renewals_created := v_renewals_created + 1;
  END LOOP;

  RETURN QUERY SELECT v_policies_processed, v_renewals_created, v_renewals_updated;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.sync_renewals_from_policies(INTEGER) TO authenticated;

-- Add staff-based RLS policies for renewals (the existing policies use account_memberships which may not exist)
-- Drop existing policies if they exist and recreate with is_staff check

DO $$
BEGIN
  -- Try to drop existing policies
  DROP POLICY IF EXISTS "Users can view renewals for their accounts" ON public.renewals;
  DROP POLICY IF EXISTS "Staff can insert renewals" ON public.renewals;
  DROP POLICY IF EXISTS "Staff can update renewals" ON public.renewals;
  DROP POLICY IF EXISTS "Staff can delete renewals" ON public.renewals;
EXCEPTION
  WHEN undefined_object THEN
    NULL;
END $$;

-- Create simpler RLS policies using is_staff function (no parameters - uses auth.uid() internally)
CREATE POLICY "Staff can view all renewals"
  ON public.renewals
  FOR SELECT
  USING (public.is_staff());

CREATE POLICY "Staff can insert renewals"
  ON public.renewals
  FOR INSERT
  WITH CHECK (public.is_staff());

CREATE POLICY "Staff can update renewals"
  ON public.renewals
  FOR UPDATE
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY "Staff can delete renewals"
  ON public.renewals
  FOR DELETE
  USING (public.is_staff());

-- Also fix renewal_campaigns RLS
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view campaigns for their accounts" ON public.renewal_campaigns;
  DROP POLICY IF EXISTS "Staff can manage campaigns" ON public.renewal_campaigns;
EXCEPTION
  WHEN undefined_object THEN
    NULL;
END $$;

CREATE POLICY "Staff can view all campaigns"
  ON public.renewal_campaigns
  FOR SELECT
  USING (public.is_staff());

CREATE POLICY "Staff can manage all campaigns"
  ON public.renewal_campaigns
  FOR ALL
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Also fix renewal_risk_history RLS
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view risk history for their accounts" ON public.renewal_risk_history;
  DROP POLICY IF EXISTS "System can insert risk history" ON public.renewal_risk_history;
EXCEPTION
  WHEN undefined_object THEN
    NULL;
END $$;

CREATE POLICY "Staff can view all risk history"
  ON public.renewal_risk_history
  FOR SELECT
  USING (public.is_staff());

CREATE POLICY "Staff can insert risk history"
  ON public.renewal_risk_history
  FOR INSERT
  WITH CHECK (public.is_staff());

-- Add comment
COMMENT ON FUNCTION public.sync_renewals_from_policies IS 'Generates renewal records from policies with upcoming expirations. Run periodically or after bulk imports.';
