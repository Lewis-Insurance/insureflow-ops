-- ============================================================================
-- CANOPY COMMERCIAL LINES ACORD PREFILL
-- ============================================================================
-- Extends get_canopy_quote_prefill to include commercial lines data
-- Maps Canopy data to ACORD form fields for: 125, 126, 127, 130, 140
-- ============================================================================

-- ============================================================================
-- 1. COMMERCIAL ACORD PREFILL FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION get_canopy_commercial_prefill(p_pull_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'pull_id', cp.id,
    'status', cp.status,
    -- ACORD 125 - Commercial Insurance Application (General Info)
    'acord_125', (
      SELECT jsonb_build_object(
        'applicant_name', bo.business_name,
        'dba_name', bo.dba_name,
        'fein', bo.fein,
        'entity_type', bo.business_type,
        'legal_entity_type', bo.legal_entity_type,
        'sic_code', bo.sic_code,
        'naics_code', bo.naics_code,
        'business_description', bo.description_of_operations,
        'years_in_business', bo.years_in_business,
        'years_current_mgmt', bo.years_current_ownership,
        'annual_gross_receipts', bo.annual_revenue,
        'employee_count', bo.employee_count,
        'part_time_employees', bo.part_time_count
      )
      FROM canopy_business_operations bo
      JOIN canopy_policies pol ON pol.id = bo.policy_id
      WHERE pol.pull_id = cp.id
      LIMIT 1
    ),
    -- ACORD 126 - General Liability Section
    'acord_126', (
      SELECT jsonb_build_object(
        'business_info', jsonb_build_object(
          'name', bo.business_name,
          'description', bo.description_of_operations,
          'uses_subcontractors', bo.uses_subcontractors,
          'subcontractor_cost', bo.subcontractor_cost,
          'products_completed_ops', bo.products_completed_ops,
          'foreign_operations', bo.foreign_operations
        ),
        'locations', (
          SELECT jsonb_agg(jsonb_build_object(
            'location_number', bl.location_number,
            'address', bl.address_line1,
            'city', bl.city,
            'state', bl.state,
            'zip', bl.zip,
            'is_owned', bl.is_owned,
            'square_footage', bl.square_footage
          ))
          FROM canopy_business_locations bl
          WHERE bl.policy_id = pol.id
        ),
        'coverages', (
          SELECT jsonb_agg(jsonb_build_object(
            'coverage_code', pc.coverage_code,
            'description', pc.coverage_description,
            'limit', pc.limit_amount,
            'per_occurrence', pc.per_occurrence,
            'aggregate', pc.aggregate,
            'deductible', pc.deductible
          ))
          FROM canopy_policy_coverages pc
          WHERE pc.policy_id = pol.id
        )
      )
      FROM canopy_business_operations bo
      JOIN canopy_policies pol ON pol.id = bo.policy_id
      WHERE pol.pull_id = cp.id AND pol.policy_type IN ('general_liability', 'bop')
      LIMIT 1
    ),
    -- ACORD 127 - Commercial Auto Section
    'acord_127', (
      SELECT jsonb_build_object(
        'fleet_vehicles', (
          SELECT jsonb_agg(jsonb_build_object(
            'unit_number', cv.unit_number,
            'year', cv.year,
            'make', cv.make,
            'model', cv.model,
            'vin', cv.vin,
            'vehicle_type', cv.vehicle_type,
            'gvw', cv.gvw,
            'radius', cv.radius_of_operation,
            'farthest_terminal', cv.farthest_terminal,
            'vehicle_use', cv.vehicle_use,
            'is_owned', cv.is_owned,
            'is_leased', cv.is_leased,
            'is_hired', cv.is_hired,
            'is_non_owned', cv.is_non_owned,
            'liability_limit', cv.liability_limit,
            'physical_damage', cv.physical_damage,
            'cargo_limit', cv.cargo_limit
          ))
          FROM canopy_commercial_vehicles cv
          JOIN canopy_policies pol ON pol.id = cv.policy_id
          WHERE pol.pull_id = cp.id
        ),
        'drivers', (
          SELECT jsonb_agg(jsonb_build_object(
            'first_name', cd.first_name,
            'last_name', cd.last_name,
            'dob', cd.date_of_birth,
            'license_number', cd.license_number,
            'license_state', cd.license_state,
            'years_licensed', cd.years_licensed,
            'violations', cd.violations,
            'accidents', cd.accidents
          ))
          FROM canopy_drivers cd
          JOIN canopy_policies pol ON pol.id = cd.policy_id
          WHERE pol.pull_id = cp.id AND pol.policy_type = 'commercial_auto'
        )
      )
    ),
    -- ACORD 130 - Workers Compensation
    'acord_130', (
      SELECT jsonb_build_object(
        'business_info', jsonb_build_object(
          'name', bo.business_name,
          'fein', bo.fein,
          'entity_type', bo.business_type,
          'legal_entity_type', bo.legal_entity_type,
          'years_in_business', bo.years_in_business
        ),
        'payroll_classes', (
          SELECT jsonb_agg(jsonb_build_object(
            'state', py.state,
            'class_code', py.class_code,
            'description', py.class_description,
            'employee_count', py.employee_count,
            'annual_payroll', py.annual_payroll,
            'rate', py.rate,
            'premium', py.estimated_premium
          ))
          FROM canopy_payroll py
          JOIN canopy_policies pol ON pol.id = py.policy_id
          WHERE pol.pull_id = cp.id
        ),
        'experience_mod', (
          SELECT py.experience_mod
          FROM canopy_payroll py
          JOIN canopy_policies pol ON pol.id = py.policy_id
          WHERE pol.pull_id = cp.id AND py.experience_mod IS NOT NULL
          LIMIT 1
        )
      )
      FROM canopy_business_operations bo
      JOIN canopy_policies pol ON pol.id = bo.policy_id
      WHERE pol.pull_id = cp.id AND pol.policy_type = 'workers_comp'
      LIMIT 1
    ),
    -- ACORD 140 - Commercial Property
    'acord_140', (
      SELECT jsonb_build_object(
        'locations', (
          SELECT jsonb_agg(jsonb_build_object(
            'location_number', bl.location_number,
            'address', jsonb_build_object(
              'line1', bl.address_line1,
              'line2', bl.address_line2,
              'city', bl.city,
              'state', bl.state,
              'zip', bl.zip,
              'county', bl.county
            ),
            'building', jsonb_build_object(
              'description', bl.building_description,
              'construction_type', bl.construction_type,
              'year_built', bl.year_built,
              'square_footage', bl.square_footage,
              'stories', bl.stories,
              'fire_class', bl.fire_protection_class,
              'sprinklered', bl.sprinklered,
              'alarm_type', bl.alarm_type
            ),
            'coverages', jsonb_build_object(
              'building', bl.building_coverage,
              'bpp', bl.bpp_coverage,
              'business_income', bl.business_income,
              'extra_expense', bl.extra_expense,
              'tenant_improvements', bl.tenant_improvements
            ),
            'ownership', CASE WHEN bl.is_owned THEN 'owned' WHEN bl.is_leased THEN 'leased' ELSE 'other' END
          ))
          FROM canopy_business_locations bl
          JOIN canopy_policies pol ON pol.id = bl.policy_id
          WHERE pol.pull_id = cp.id AND pol.policy_type IN ('commercial_property', 'bop')
        )
      )
    ),
    -- Named/Additional Insureds (for all commercial lines)
    'named_insureds', (
      SELECT jsonb_agg(jsonb_build_object(
        'name', ni.name,
        'type', ni.insured_type,
        'address', jsonb_build_object(
          'line1', ni.address_line1,
          'city', ni.city,
          'state', ni.state,
          'zip', ni.zip
        ),
        'interest_type', ni.interest_type,
        'is_mortgagee', ni.is_mortgagee,
        'is_loss_payee', ni.is_loss_payee,
        'is_additional_insured', ni.is_additional_insured
      ))
      FROM canopy_named_insureds ni
      JOIN canopy_policies pol ON pol.id = ni.policy_id
      WHERE pol.pull_id = cp.id
    ),
    -- All coverages structured
    'all_coverages', (
      SELECT jsonb_agg(jsonb_build_object(
        'policy_type', pol.policy_type,
        'coverage_code', pc.coverage_code,
        'description', pc.coverage_description,
        'limit', pc.limit_amount,
        'per_occurrence', pc.per_occurrence,
        'aggregate', pc.aggregate,
        'deductible', pc.deductible,
        'premium', pc.premium
      ))
      FROM canopy_policy_coverages pc
      JOIN canopy_policies pol ON pol.id = pc.policy_id
      WHERE pol.pull_id = cp.id
    )
  ) INTO v_result
  FROM canopy_pulls cp
  WHERE cp.id = p_pull_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_canopy_commercial_prefill IS 'Returns Canopy commercial data structured for ACORD form pre-fill (125, 126, 127, 130, 140)';

-- ============================================================================
-- 2. ENHANCED PREFILL FUNCTION (PERSONAL + COMMERCIAL)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_canopy_acord_prefill(p_pull_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_personal JSONB;
  v_commercial JSONB;
  v_has_commercial BOOLEAN;
BEGIN
  -- Get personal lines data
  v_personal := get_canopy_quote_prefill(p_pull_id);

  -- Check if there are commercial policies
  SELECT EXISTS (
    SELECT 1 FROM canopy_policies
    WHERE pull_id = p_pull_id
    AND policy_type IN (
      'commercial_auto', 'general_liability', 'bop',
      'workers_comp', 'commercial_property', 'professional_liability',
      'd_and_o', 'cyber', 'epli', 'commercial_umbrella'
    )
  ) INTO v_has_commercial;

  IF v_has_commercial THEN
    v_commercial := get_canopy_commercial_prefill(p_pull_id);

    -- Merge personal and commercial
    RETURN v_personal || jsonb_build_object(
      'has_commercial', TRUE,
      'commercial', v_commercial
    );
  ELSE
    RETURN v_personal || jsonb_build_object('has_commercial', FALSE);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_canopy_acord_prefill IS 'Returns combined personal and commercial Canopy data for ACORD form pre-fill';

-- ============================================================================
-- 3. ACORD FIELD MAPPING VIEW
-- ============================================================================

CREATE OR REPLACE VIEW canopy_acord_field_map AS
WITH policy_data AS (
  SELECT
    cp.id AS pull_id,
    pol.id AS policy_id,
    pol.policy_type,
    pol.carrier_name,
    pol.policy_number,
    pol.effective_date,
    pol.expiration_date,
    pol.premium_amount
  FROM canopy_pulls cp
  JOIN canopy_policies pol ON pol.pull_id = cp.id
)
SELECT
  pd.pull_id,
  pd.policy_type,
  -- Common fields (all ACORD forms)
  bo.business_name AS applicant_name,
  bo.dba_name,
  bo.fein,
  bo.business_type AS entity_type,
  bo.legal_entity_type,
  pd.carrier_name AS current_carrier,
  pd.policy_number AS current_policy_number,
  pd.effective_date,
  pd.expiration_date,
  pd.premium_amount AS current_premium,
  -- ACORD 125 fields
  bo.sic_code,
  bo.naics_code,
  bo.description_of_operations AS business_description,
  bo.years_in_business,
  bo.annual_revenue AS gross_receipts,
  bo.employee_count AS full_time_employees,
  bo.part_time_count AS part_time_employees,
  -- Workers Comp specific (ACORD 130)
  py.experience_mod,
  -- Location count
  (SELECT COUNT(*) FROM canopy_business_locations bl WHERE bl.policy_id = pd.policy_id) AS location_count,
  -- Vehicle count (for commercial auto)
  (SELECT COUNT(*) FROM canopy_commercial_vehicles cv WHERE cv.policy_id = pd.policy_id) AS commercial_vehicle_count,
  -- Personal auto vehicle count
  (SELECT COUNT(*) FROM canopy_vehicles v WHERE v.policy_id = pd.policy_id) AS personal_vehicle_count
FROM policy_data pd
LEFT JOIN canopy_business_operations bo ON bo.policy_id = pd.policy_id
LEFT JOIN canopy_payroll py ON py.policy_id = pd.policy_id;

COMMENT ON VIEW canopy_acord_field_map IS 'Flattened view mapping Canopy data to ACORD form fields';

-- ============================================================================
-- 4. GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION get_canopy_commercial_prefill TO authenticated;
GRANT EXECUTE ON FUNCTION get_canopy_acord_prefill TO authenticated;
GRANT SELECT ON canopy_acord_field_map TO authenticated;
