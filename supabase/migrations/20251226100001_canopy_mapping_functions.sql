-- ============================================================================
-- CANOPY CONNECT DATA MAPPING FUNCTIONS
-- ============================================================================
-- Functions to map Canopy imported data to the Lewis Insurance leads system
-- ============================================================================

-- ============================================================================
-- 1. MAP CANOPY PULL TO NEW LEAD
-- ============================================================================
-- Creates a new lead from Canopy pull data

CREATE OR REPLACE FUNCTION map_canopy_to_lead(p_pull_id UUID)
RETURNS UUID AS $$
DECLARE
  v_lead_id UUID;
  v_primary_driver RECORD;
  v_first_policy RECORD;
  v_insurance_types TEXT[];
  v_address_parts RECORD;
  v_current_premium NUMERIC;
  v_current_carrier TEXT;
  v_expiration_date DATE;
BEGIN
  -- Verify pull exists and is complete
  IF NOT EXISTS (
    SELECT 1 FROM canopy_pulls WHERE id = p_pull_id AND status = 'complete'
  ) THEN
    RAISE EXCEPTION 'Canopy pull % not found or not complete', p_pull_id;
  END IF;

  -- Get primary driver info (for contact details)
  SELECT cd.* INTO v_primary_driver
  FROM canopy_drivers cd
  JOIN canopy_policies cp ON cp.id = cd.policy_id
  WHERE cp.pull_id = p_pull_id
    AND cd.is_primary = TRUE
  ORDER BY cp.created_at
  LIMIT 1;

  -- If no primary driver, try to get any driver
  IF v_primary_driver IS NULL THEN
    SELECT cd.* INTO v_primary_driver
    FROM canopy_drivers cd
    JOIN canopy_policies cp ON cp.id = cd.policy_id
    WHERE cp.pull_id = p_pull_id
    ORDER BY cp.created_at
    LIMIT 1;
  END IF;

  -- Get first policy for basic info
  SELECT * INTO v_first_policy
  FROM canopy_policies
  WHERE pull_id = p_pull_id
  ORDER BY created_at
  LIMIT 1;

  -- Collect all insurance types from this pull
  SELECT ARRAY_AGG(DISTINCT policy_type) INTO v_insurance_types
  FROM canopy_policies
  WHERE pull_id = p_pull_id;

  -- Get address from dwelling if available, otherwise from vehicle
  SELECT
    COALESCE(dw.address_line1, cv.garage_address) as address,
    COALESCE(dw.city, cv.garage_city) as city,
    COALESCE(dw.state, cv.garage_state) as state,
    COALESCE(dw.zip, cv.garage_zip) as zip
  INTO v_address_parts
  FROM canopy_policies cp
  LEFT JOIN canopy_dwellings dw ON dw.policy_id = cp.id
  LEFT JOIN canopy_vehicles cv ON cv.policy_id = cp.id
  WHERE cp.pull_id = p_pull_id
    AND (dw.id IS NOT NULL OR cv.id IS NOT NULL)
  LIMIT 1;

  -- Calculate total current premium
  SELECT
    SUM(premium_amount),
    MAX(carrier_name),
    MAX(expiration_date)
  INTO v_current_premium, v_current_carrier, v_expiration_date
  FROM canopy_policies
  WHERE pull_id = p_pull_id AND status = 'active';

  -- Create the lead
  INSERT INTO leads (
    first_name,
    last_name,
    -- Email and phone would need to come from Canopy if available
    -- or be collected separately via intake form
    address,
    city,
    state,
    zip,
    insurance_types,
    lead_source,
    lead_score,
    status,
    metadata,
    created_at,
    updated_at
  ) VALUES (
    COALESCE(v_primary_driver.first_name, 'Unknown'),
    COALESCE(v_primary_driver.last_name, 'Customer'),
    v_address_parts.address,
    v_address_parts.city,
    v_address_parts.state,
    v_address_parts.zip,
    v_insurance_types,
    'canopy_import',
    75,  -- Higher base score for verified Canopy data
    'qualified',
    jsonb_build_object(
      'canopy_pull_id', p_pull_id,
      'current_premium', v_current_premium,
      'current_carrier', v_current_carrier,
      'policy_expiration', v_expiration_date,
      'imported_at', NOW()
    ),
    NOW(),
    NOW()
  )
  RETURNING id INTO v_lead_id;

  -- Link pull to the new lead
  UPDATE canopy_pulls
  SET lead_id = v_lead_id, updated_at = NOW()
  WHERE id = p_pull_id;

  -- Map drivers to lead_auto_drivers
  INSERT INTO lead_auto_drivers (
    lead_id,
    first_name,
    last_name,
    date_of_birth,
    gender,
    marital_status,
    license_number,
    license_state,
    relation_to_insured,
    years_licensed,
    accidents_violations
  )
  SELECT
    v_lead_id,
    cd.first_name,
    cd.last_name,
    cd.date_of_birth,
    cd.gender,
    cd.marital_status,
    cd.license_number,
    cd.license_state,
    cd.relation_to_insured,
    cd.years_licensed,
    jsonb_build_object(
      'violations', cd.violations,
      'accidents', cd.accidents,
      'claims', cd.claims
    )
  FROM canopy_drivers cd
  JOIN canopy_policies cp ON cp.id = cd.policy_id
  WHERE cp.pull_id = p_pull_id;

  -- Map vehicles to lead_auto_vehicles
  INSERT INTO lead_auto_vehicles (
    lead_id,
    year,
    make,
    model,
    vin,
    ownership,
    primary_use,
    annual_mileage,
    garage_address,
    safety_features
  )
  SELECT
    v_lead_id,
    cv.year,
    cv.make,
    cv.model,
    cv.vin,
    cv.ownership,
    cv.usage_type,
    cv.annual_mileage,
    CONCAT_WS(', ', cv.garage_address, cv.garage_city, cv.garage_state, cv.garage_zip),
    cv.coverages  -- Using coverages field to store additional vehicle info
  FROM canopy_vehicles cv
  JOIN canopy_policies cp ON cp.id = cv.policy_id
  WHERE cp.pull_id = p_pull_id;

  RETURN v_lead_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2. MAP CANOPY PULL TO EXISTING ACCOUNT
-- ============================================================================
-- Attaches Canopy pull data to an existing account for renewals/upsells

CREATE OR REPLACE FUNCTION map_canopy_to_account(
  p_pull_id UUID,
  p_account_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_policy_count INTEGER;
BEGIN
  -- Verify pull exists and is complete
  IF NOT EXISTS (
    SELECT 1 FROM canopy_pulls WHERE id = p_pull_id AND status = 'complete'
  ) THEN
    RAISE EXCEPTION 'Canopy pull % not found or not complete', p_pull_id;
  END IF;

  -- Verify account exists
  IF NOT EXISTS (
    SELECT 1 FROM accounts WHERE id = p_account_id
  ) THEN
    RAISE EXCEPTION 'Account % not found', p_account_id;
  END IF;

  -- Link pull to account
  UPDATE canopy_pulls
  SET account_id = p_account_id, updated_at = NOW()
  WHERE id = p_pull_id;

  -- Update account metadata with Canopy info
  UPDATE accounts
  SET
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'canopy_last_import', NOW(),
      'canopy_pull_id', p_pull_id
    ),
    updated_at = NOW()
  WHERE id = p_account_id;

  -- Get policy count for confirmation
  SELECT COUNT(*) INTO v_policy_count
  FROM canopy_policies
  WHERE pull_id = p_pull_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. CALCULATE ENHANCED LEAD SCORE FOR CANOPY DATA
-- ============================================================================
-- Updates lead score based on Canopy data quality

CREATE OR REPLACE FUNCTION calculate_canopy_lead_score(p_lead_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_base_score INTEGER := 75;  -- Canopy leads start higher
  v_bonus INTEGER := 0;
  v_pull RECORD;
  v_days_to_expiration INTEGER;
  v_has_bundling_opportunity BOOLEAN;
  v_clean_driving_record BOOLEAN;
  v_policy_count INTEGER;
BEGIN
  -- Get the Canopy pull for this lead
  SELECT * INTO v_pull
  FROM canopy_pulls
  WHERE lead_id = p_lead_id AND status = 'complete'
  ORDER BY completed_at DESC
  LIMIT 1;

  IF v_pull IS NULL THEN
    -- No Canopy data, return base score
    RETURN 50;
  END IF;

  -- +20 points for having verified Canopy data
  v_bonus := v_bonus + 20;

  -- Check policy expiration (highest priority leads)
  SELECT
    EXTRACT(DAY FROM MIN(expiration_date) - CURRENT_DATE)::INTEGER
  INTO v_days_to_expiration
  FROM canopy_policies
  WHERE pull_id = v_pull.id AND status = 'active';

  IF v_days_to_expiration IS NOT NULL THEN
    IF v_days_to_expiration <= 30 THEN
      v_bonus := v_bonus + 15;  -- Expiring within 30 days
    ELSIF v_days_to_expiration <= 60 THEN
      v_bonus := v_bonus + 10;  -- Expiring within 60 days
    ELSIF v_days_to_expiration <= 90 THEN
      v_bonus := v_bonus + 5;   -- Expiring within 90 days
    END IF;
  END IF;

  -- Check for bundling opportunity (auto + home)
  SELECT COUNT(DISTINCT policy_type) INTO v_policy_count
  FROM canopy_policies
  WHERE pull_id = v_pull.id;

  -- If they only have one type, there's bundling opportunity
  IF v_policy_count = 1 THEN
    v_bonus := v_bonus + 10;  -- Single policy = bundling opportunity
  END IF;

  -- Check for clean driving record (no violations/accidents)
  SELECT NOT EXISTS (
    SELECT 1 FROM canopy_drivers cd
    JOIN canopy_policies cp ON cp.id = cd.policy_id
    WHERE cp.pull_id = v_pull.id
      AND (
        jsonb_array_length(cd.violations) > 0
        OR jsonb_array_length(cd.accidents) > 0
      )
  ) INTO v_clean_driving_record;

  IF v_clean_driving_record THEN
    v_bonus := v_bonus + 5;
  END IF;

  -- Cap total score at 100
  RETURN LEAST(v_base_score + v_bonus, 100);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. TRIGGER TO AUTO-UPDATE LEAD SCORE
-- ============================================================================

CREATE OR REPLACE FUNCTION update_lead_score_on_canopy_complete()
RETURNS TRIGGER AS $$
BEGIN
  -- When a Canopy pull completes, update the lead score
  IF NEW.status = 'complete' AND OLD.status != 'complete' AND NEW.lead_id IS NOT NULL THEN
    UPDATE leads
    SET
      lead_score = calculate_canopy_lead_score(NEW.lead_id),
      updated_at = NOW()
    WHERE id = NEW.lead_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER canopy_pull_complete_trigger
  AFTER UPDATE ON canopy_pulls
  FOR EACH ROW
  EXECUTE FUNCTION update_lead_score_on_canopy_complete();

-- ============================================================================
-- 5. GET CANOPY DATA FOR QUOTE PRE-FILL
-- ============================================================================
-- Returns structured data ready for quote form pre-fill

CREATE OR REPLACE FUNCTION get_canopy_quote_prefill(p_pull_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'pull_id', cp.id,
    'status', cp.status,
    'policies', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', pol.id,
        'type', pol.policy_type,
        'carrier', pol.carrier_name,
        'premium', pol.premium_amount,
        'expiration', pol.expiration_date,
        'coverages', pol.coverage_limits
      ))
      FROM canopy_policies pol
      WHERE pol.pull_id = cp.id
    ),
    'vehicles', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', cv.id,
        'year', cv.year,
        'make', cv.make,
        'model', cv.model,
        'vin', cv.vin,
        'usage', cv.usage_type,
        'mileage', cv.annual_mileage,
        'ownership', cv.ownership,
        'garage_zip', cv.garage_zip,
        'current_coverages', jsonb_build_object(
          'liability_bi', cv.liability_bi,
          'liability_pd', cv.liability_pd,
          'collision', cv.collision_deductible,
          'comprehensive', cv.comprehensive_deductible,
          'uninsured', cv.uninsured_motorist
        )
      ))
      FROM canopy_vehicles cv
      JOIN canopy_policies pol ON pol.id = cv.policy_id
      WHERE pol.pull_id = cp.id
    ),
    'drivers', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', cd.id,
        'first_name', cd.first_name,
        'last_name', cd.last_name,
        'dob', cd.date_of_birth,
        'gender', cd.gender,
        'marital_status', cd.marital_status,
        'license_number', cd.license_number,
        'license_state', cd.license_state,
        'relation', cd.relation_to_insured,
        'is_primary', cd.is_primary,
        'years_licensed', cd.years_licensed,
        'violations', cd.violations,
        'accidents', cd.accidents
      ))
      FROM canopy_drivers cd
      JOIN canopy_policies pol ON pol.id = cd.policy_id
      WHERE pol.pull_id = cp.id
    ),
    'dwellings', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', dw.id,
        'address', jsonb_build_object(
          'line1', dw.address_line1,
          'line2', dw.address_line2,
          'city', dw.city,
          'state', dw.state,
          'zip', dw.zip
        ),
        'property_type', dw.property_type,
        'year_built', dw.year_built,
        'square_footage', dw.square_footage,
        'construction', dw.construction_type,
        'roof_type', dw.roof_type,
        'roof_year', dw.roof_year,
        'current_coverages', jsonb_build_object(
          'dwelling', dw.dwelling_coverage,
          'personal_property', dw.personal_property,
          'liability', dw.liability_coverage,
          'deductible', dw.deductible
        )
      ))
      FROM canopy_dwellings dw
      JOIN canopy_policies pol ON pol.id = dw.policy_id
      WHERE pol.pull_id = cp.id
    ),
    'claims_history', (
      SELECT jsonb_agg(jsonb_build_object(
        'date', cl.claim_date,
        'type', cl.claim_type,
        'status', cl.status,
        'amount', cl.amount_paid,
        'at_fault', cl.at_fault
      ))
      FROM canopy_claims cl
      JOIN canopy_policies pol ON pol.id = cl.policy_id
      WHERE pol.pull_id = cp.id
    )
  ) INTO v_result
  FROM canopy_pulls cp
  WHERE cp.id = p_pull_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. COMMENTS
-- ============================================================================

COMMENT ON FUNCTION map_canopy_to_lead IS 'Creates a new lead from Canopy pull data with driver/vehicle mapping';
COMMENT ON FUNCTION map_canopy_to_account IS 'Links Canopy pull data to an existing account for renewals';
COMMENT ON FUNCTION calculate_canopy_lead_score IS 'Calculates enhanced lead score based on Canopy data quality';
COMMENT ON FUNCTION get_canopy_quote_prefill IS 'Returns structured Canopy data for quote form pre-fill';
