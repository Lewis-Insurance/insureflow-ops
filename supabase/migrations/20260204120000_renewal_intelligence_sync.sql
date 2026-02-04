-- Renewal Intelligence System: Sync policies to renewals and aggregate risk indicators
-- This migration creates functions to:
-- 1. Sync policies nearing expiration to the renewals table
-- 2. Aggregate risk indicators from communications, claims, and payments
-- 3. Provide a way to refresh all renewal data

-- ============================================================================
-- FUNCTION: sync_policies_to_renewals
-- Copies policies expiring within N days to the renewals table
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_policies_to_renewals(days_ahead INTEGER DEFAULT 90)
RETURNS TABLE (
  synced_count INTEGER,
  updated_count INTEGER,
  new_count INTEGER
) AS $$
DECLARE
  v_synced_count INTEGER := 0;
  v_updated_count INTEGER := 0;
  v_new_count INTEGER := 0;
  v_policy RECORD;
  v_existing_id UUID;
BEGIN
  -- Find all active policies expiring within the specified days
  FOR v_policy IN
    SELECT
      p.id AS policy_id,
      p.account_id,
      p.policy_number,
      p.line_of_business AS policy_type,
      COALESCE(c.name, p.carrier) AS carrier,
      p.expiration_date AS renewal_date,
      p.premium AS current_premium,
      p.premium AS renewal_premium, -- Initially same, can be updated later
      p.status
    FROM public.policies p
    LEFT JOIN public.carriers c ON p.carrier_id = c.id
    WHERE p.status IN ('active', 'pending')
      AND p.expiration_date IS NOT NULL
      AND p.expiration_date >= CURRENT_DATE
      AND p.expiration_date <= CURRENT_DATE + (days_ahead || ' days')::INTERVAL
      AND p.account_id IS NOT NULL
  LOOP
    -- Check if renewal already exists for this policy
    SELECT id INTO v_existing_id
    FROM public.renewals
    WHERE policy_id = v_policy.policy_id;

    IF v_existing_id IS NOT NULL THEN
      -- Update existing renewal
      UPDATE public.renewals
      SET
        policy_number = v_policy.policy_number,
        policy_type = v_policy.policy_type,
        carrier = v_policy.carrier,
        renewal_date = v_policy.renewal_date,
        current_premium = v_policy.current_premium,
        updated_at = NOW()
      WHERE id = v_existing_id;

      v_updated_count := v_updated_count + 1;
    ELSE
      -- Insert new renewal
      INSERT INTO public.renewals (
        account_id,
        policy_id,
        policy_number,
        policy_type,
        carrier,
        renewal_date,
        current_premium,
        renewal_premium,
        status,
        risk_level,
        created_at,
        updated_at
      ) VALUES (
        v_policy.account_id,
        v_policy.policy_id,
        v_policy.policy_number,
        v_policy.policy_type,
        v_policy.carrier,
        v_policy.renewal_date,
        v_policy.current_premium,
        v_policy.renewal_premium,
        'upcoming',
        'low', -- Default until risk is calculated
        NOW(),
        NOW()
      );

      v_new_count := v_new_count + 1;
    END IF;

    v_synced_count := v_synced_count + 1;
  END LOOP;

  RETURN QUERY SELECT v_synced_count, v_updated_count, v_new_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: aggregate_renewal_risk_indicators
-- Updates renewals with data from communications, claims, and payments
-- ============================================================================
CREATE OR REPLACE FUNCTION public.aggregate_renewal_risk_indicators()
RETURNS TABLE (
  updated_count INTEGER
) AS $$
DECLARE
  v_updated_count INTEGER := 0;
  v_renewal RECORD;
  v_last_contact TIMESTAMP WITH TIME ZONE;
  v_contact_count INTEGER;
  v_has_recent_claims BOOLEAN;
  v_has_payment_issues BOOLEAN;
  v_days_since_contact INTEGER;
BEGIN
  -- Process each renewal
  FOR v_renewal IN
    SELECT r.id, r.account_id, r.policy_id
    FROM public.renewals r
    WHERE r.status IN ('upcoming', 'in_progress')
  LOOP
    -- Get last contact date and contact count from communications
    SELECT
      MAX(occurred_at),
      COUNT(*)
    INTO v_last_contact, v_contact_count
    FROM public.communications
    WHERE account_id = v_renewal.account_id
      AND deleted_at IS NULL;

    -- Calculate days since last contact
    IF v_last_contact IS NOT NULL THEN
      v_days_since_contact := EXTRACT(DAY FROM (NOW() - v_last_contact))::INTEGER;
    ELSE
      v_days_since_contact := 999; -- No contact ever
    END IF;

    -- Check for recent claims (within last 12 months)
    SELECT EXISTS(
      SELECT 1
      FROM public.claims c
      WHERE c.policy_id = v_renewal.policy_id
        AND c.loss_date >= CURRENT_DATE - INTERVAL '12 months'
    ) INTO v_has_recent_claims;

    -- Check for payment issues (unpaid invoices past due)
    SELECT EXISTS(
      SELECT 1
      FROM public.invoices i
      WHERE i.account_id = v_renewal.account_id
        AND i.status IN ('open', 'overdue')
        AND i.due_at < NOW()
        AND i.deleted_at IS NULL
    ) INTO v_has_payment_issues;

    -- Update the renewal with aggregated data
    UPDATE public.renewals
    SET
      last_contact_date = v_last_contact,
      days_since_last_contact = v_days_since_contact,
      contact_count = COALESCE(v_contact_count, 0),
      has_recent_claims = COALESCE(v_has_recent_claims, false),
      has_payment_issues = COALESCE(v_has_payment_issues, false),
      updated_at = NOW()
    WHERE id = v_renewal.id;

    v_updated_count := v_updated_count + 1;
  END LOOP;

  RETURN QUERY SELECT v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: calculate_renewal_risk_scores
-- Calculates risk scores based on aggregated indicators (runs in database)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.calculate_renewal_risk_scores()
RETURNS TABLE (
  processed_count INTEGER,
  critical_count INTEGER,
  high_count INTEGER,
  medium_count INTEGER,
  low_count INTEGER
) AS $$
DECLARE
  v_processed INTEGER := 0;
  v_critical INTEGER := 0;
  v_high INTEGER := 0;
  v_medium INTEGER := 0;
  v_low INTEGER := 0;
  v_renewal RECORD;
  v_score INTEGER;
  v_level TEXT;
BEGIN
  FOR v_renewal IN
    SELECT *
    FROM public.renewals
    WHERE status IN ('upcoming', 'in_progress')
  LOOP
    v_score := 0;

    -- Factor 1: No contact in 6+ months (20 points)
    IF v_renewal.days_since_last_contact >= 180 THEN
      v_score := v_score + 20;
    ELSIF v_renewal.days_since_last_contact >= 90 THEN
      v_score := v_score + 10;
    END IF;

    -- Factor 2: Price increase >15% (25 points)
    IF v_renewal.price_change_pct IS NOT NULL AND v_renewal.price_change_pct > 15 THEN
      v_score := v_score + 25;
    ELSIF v_renewal.price_change_pct IS NOT NULL AND v_renewal.price_change_pct > 10 THEN
      v_score := v_score + 15;
    END IF;

    -- Factor 3: Recent claims (15 points)
    IF v_renewal.has_recent_claims = true THEN
      v_score := v_score + 15;
    END IF;

    -- Factor 4: Payment issues (10 points)
    IF v_renewal.has_payment_issues = true THEN
      v_score := v_score + 10;
    END IF;

    -- Factor 5: Low engagement / few contacts (15 points)
    IF COALESCE(v_renewal.contact_count, 0) < 2 THEN
      v_score := v_score + 15;
    ELSIF COALESCE(v_renewal.contact_count, 0) < 5 THEN
      v_score := v_score + 8;
    END IF;

    -- Factor 6: Competitor activity (20 points)
    IF v_renewal.competitor_activity_detected = true THEN
      v_score := v_score + 20;
    END IF;

    -- Determine risk level
    IF v_score >= 75 THEN
      v_level := 'critical';
      v_critical := v_critical + 1;
    ELSIF v_score >= 50 THEN
      v_level := 'high';
      v_high := v_high + 1;
    ELSIF v_score >= 25 THEN
      v_level := 'medium';
      v_medium := v_medium + 1;
    ELSE
      v_level := 'low';
      v_low := v_low + 1;
    END IF;

    -- Update the renewal
    UPDATE public.renewals
    SET
      risk_score = v_score,
      risk_level = v_level,
      last_risk_calculation = NOW(),
      updated_at = NOW()
    WHERE id = v_renewal.id;

    v_processed := v_processed + 1;
  END LOOP;

  RETURN QUERY SELECT v_processed, v_critical, v_high, v_medium, v_low;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: refresh_renewal_intelligence
-- Master function that runs the full pipeline
-- ============================================================================
CREATE OR REPLACE FUNCTION public.refresh_renewal_intelligence(days_ahead INTEGER DEFAULT 90)
RETURNS TABLE (
  policies_synced INTEGER,
  indicators_updated INTEGER,
  risks_calculated INTEGER,
  critical_risk INTEGER,
  high_risk INTEGER,
  medium_risk INTEGER,
  low_risk INTEGER
) AS $$
DECLARE
  v_sync_result RECORD;
  v_indicator_result RECORD;
  v_risk_result RECORD;
BEGIN
  -- Step 1: Sync policies to renewals
  SELECT * INTO v_sync_result FROM public.sync_policies_to_renewals(days_ahead);

  -- Step 2: Aggregate risk indicators
  SELECT * INTO v_indicator_result FROM public.aggregate_renewal_risk_indicators();

  -- Step 3: Calculate risk scores
  SELECT * INTO v_risk_result FROM public.calculate_renewal_risk_scores();

  RETURN QUERY SELECT
    v_sync_result.synced_count,
    v_indicator_result.updated_count,
    v_risk_result.processed_count,
    v_risk_result.critical_count,
    v_risk_result.high_count,
    v_risk_result.medium_count,
    v_risk_result.low_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Grant permissions
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.sync_policies_to_renewals(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aggregate_renewal_risk_indicators() TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_renewal_risk_scores() TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_renewal_intelligence(INTEGER) TO authenticated;

-- ============================================================================
-- Add missing columns to renewals table if they don't exist
-- ============================================================================
DO $$
BEGIN
  -- Add has_recent_claims if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'renewals' AND column_name = 'has_recent_claims') THEN
    ALTER TABLE public.renewals ADD COLUMN has_recent_claims BOOLEAN DEFAULT false;
  END IF;

  -- Add contact_count if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'renewals' AND column_name = 'contact_count') THEN
    ALTER TABLE public.renewals ADD COLUMN contact_count INTEGER DEFAULT 0;
  END IF;

  -- Add risk_calculated_at if missing (alias for last_risk_calculation)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'renewals' AND column_name = 'risk_calculated_at') THEN
    ALTER TABLE public.renewals ADD COLUMN risk_calculated_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

-- Add helpful comment
COMMENT ON FUNCTION public.refresh_renewal_intelligence IS
'Master function to refresh all renewal intelligence data. Call this to:
1. Sync policies expiring within N days to renewals table
2. Aggregate risk indicators from communications, claims, payments
3. Calculate risk scores for all renewals

Usage: SELECT * FROM refresh_renewal_intelligence(90);
Returns count of processed items and risk distribution.';
