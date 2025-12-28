-- ============================================================================
-- FIX CANOPY 2-WAY SYNC SCHEMA ALIGNMENT
-- ============================================================================
-- Aligns database schema with Edge Function code and React hooks
-- Fixes column name mismatches identified in audit
-- ============================================================================

-- ============================================================================
-- 1. FIX canopy_pull_snapshots
-- ============================================================================
-- Code uses: snapshot_type, snapshot_data
-- Schema has: event_type, raw_pull_json, raw_webhook_json, source

-- Add the columns the code expects
ALTER TABLE canopy_pull_snapshots
  ADD COLUMN IF NOT EXISTS snapshot_type TEXT
    CHECK (snapshot_type IN ('initial', 'refresh', 'update'));

ALTER TABLE canopy_pull_snapshots
  ADD COLUMN IF NOT EXISTS snapshot_data JSONB;

-- Make event_type nullable since code doesn't always set it
ALTER TABLE canopy_pull_snapshots
  ALTER COLUMN event_type DROP NOT NULL;

-- Make raw_pull_json nullable since code uses snapshot_data instead
ALTER TABLE canopy_pull_snapshots
  ALTER COLUMN raw_pull_json DROP NOT NULL;

-- Make source nullable with default
ALTER TABLE canopy_pull_snapshots
  ALTER COLUMN source DROP NOT NULL;

-- ============================================================================
-- 2. FIX canopy_monitorings
-- ============================================================================
-- Code uses: next_refresh_due, refresh_count
-- Schema has: next_refresh_date, total_refreshes

-- Add aliases or rename columns
ALTER TABLE canopy_monitorings
  ADD COLUMN IF NOT EXISTS next_refresh_due TIMESTAMPTZ;

ALTER TABLE canopy_monitorings
  ADD COLUMN IF NOT EXISTS refresh_count INTEGER DEFAULT 0;

-- Sync existing data
UPDATE canopy_monitorings
SET next_refresh_due = next_refresh_date,
    refresh_count = total_refreshes
WHERE next_refresh_due IS NULL;

-- ============================================================================
-- 3. FIX canopy_servicing_actions
-- ============================================================================
-- Code uses: request_data, carrier_response
-- Schema has: request_payload, response_payload

ALTER TABLE canopy_servicing_actions
  ADD COLUMN IF NOT EXISTS request_data JSONB;

ALTER TABLE canopy_servicing_actions
  ADD COLUMN IF NOT EXISTS carrier_response JSONB;

-- Sync existing data
UPDATE canopy_servicing_actions
SET request_data = request_payload,
    carrier_response = response_payload
WHERE request_data IS NULL;

-- ============================================================================
-- 4. FIX canopy_carrier_capabilities
-- ============================================================================
-- Code uses: pull_id, cached_at
-- Schema has: carrier_id (as key), last_fetched_at

ALTER TABLE canopy_carrier_capabilities
  ADD COLUMN IF NOT EXISTS pull_id UUID REFERENCES canopy_pulls(id);

ALTER TABLE canopy_carrier_capabilities
  ADD COLUMN IF NOT EXISTS cached_at TIMESTAMPTZ DEFAULT NOW();

-- Add index for pull_id lookups
CREATE INDEX IF NOT EXISTS idx_carrier_caps_pull ON canopy_carrier_capabilities(pull_id);

-- Add unique constraint for upsert on pull_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'canopy_carrier_capabilities_pull_id_key'
  ) THEN
    ALTER TABLE canopy_carrier_capabilities ADD CONSTRAINT canopy_carrier_capabilities_pull_id_key UNIQUE (pull_id);
  END IF;
END $$;

-- ============================================================================
-- 5. FIX canopy_commercial_vehicles
-- ============================================================================
-- Code uses: vehicle_use, is_owned, is_leased, is_hired, is_non_owned, driver_id, physical_damage
-- Schema has: primary_use, ownership (enum), assigned_driver_id, physical_damage_avc/stated

ALTER TABLE canopy_commercial_vehicles
  ADD COLUMN IF NOT EXISTS vehicle_use TEXT;

ALTER TABLE canopy_commercial_vehicles
  ADD COLUMN IF NOT EXISTS is_owned BOOLEAN DEFAULT FALSE;

ALTER TABLE canopy_commercial_vehicles
  ADD COLUMN IF NOT EXISTS is_leased BOOLEAN DEFAULT FALSE;

ALTER TABLE canopy_commercial_vehicles
  ADD COLUMN IF NOT EXISTS is_hired BOOLEAN DEFAULT FALSE;

ALTER TABLE canopy_commercial_vehicles
  ADD COLUMN IF NOT EXISTS is_non_owned BOOLEAN DEFAULT FALSE;

ALTER TABLE canopy_commercial_vehicles
  ADD COLUMN IF NOT EXISTS driver_id UUID;

ALTER TABLE canopy_commercial_vehicles
  ADD COLUMN IF NOT EXISTS physical_damage TEXT;

ALTER TABLE canopy_commercial_vehicles
  ADD COLUMN IF NOT EXISTS hired_auto BOOLEAN DEFAULT FALSE;

ALTER TABLE canopy_commercial_vehicles
  ADD COLUMN IF NOT EXISTS non_owned_auto BOOLEAN DEFAULT FALSE;

ALTER TABLE canopy_commercial_vehicles
  ADD COLUMN IF NOT EXISTS fleet_size INTEGER;

-- ============================================================================
-- 6. FIX canopy_business_operations
-- ============================================================================
-- Code uses: entity_type, business_description, subcontractors_used, part_time_employees
-- Schema has: business_type, description_of_operations, uses_subcontractors, part_time_count

ALTER TABLE canopy_business_operations
  ADD COLUMN IF NOT EXISTS entity_type TEXT;

ALTER TABLE canopy_business_operations
  ADD COLUMN IF NOT EXISTS business_description TEXT;

ALTER TABLE canopy_business_operations
  ADD COLUMN IF NOT EXISTS subcontractors_used BOOLEAN DEFAULT FALSE;

ALTER TABLE canopy_business_operations
  ADD COLUMN IF NOT EXISTS part_time_employees INTEGER;

ALTER TABLE canopy_business_operations
  ADD COLUMN IF NOT EXISTS professional_services BOOLEAN DEFAULT FALSE;

ALTER TABLE canopy_business_operations
  ADD COLUMN IF NOT EXISTS has_liquor_exposure BOOLEAN DEFAULT FALSE;

-- Sync existing data
UPDATE canopy_business_operations
SET entity_type = business_type,
    business_description = description_of_operations,
    subcontractors_used = uses_subcontractors,
    part_time_employees = part_time_count
WHERE entity_type IS NULL;

-- ============================================================================
-- 7. FIX canopy_business_locations
-- ============================================================================
-- Code uses: is_owned, is_leased, building_description, fire_protection_class, building_coverage, bpp_coverage
-- Schema has: building_ownership (enum), protection_class, building_value, contents_value

ALTER TABLE canopy_business_locations
  ADD COLUMN IF NOT EXISTS is_owned BOOLEAN DEFAULT FALSE;

ALTER TABLE canopy_business_locations
  ADD COLUMN IF NOT EXISTS is_leased BOOLEAN DEFAULT FALSE;

ALTER TABLE canopy_business_locations
  ADD COLUMN IF NOT EXISTS building_description TEXT;

ALTER TABLE canopy_business_locations
  ADD COLUMN IF NOT EXISTS fire_protection_class TEXT;

ALTER TABLE canopy_business_locations
  ADD COLUMN IF NOT EXISTS building_coverage NUMERIC(14,2);

ALTER TABLE canopy_business_locations
  ADD COLUMN IF NOT EXISTS bpp_coverage NUMERIC(14,2);

ALTER TABLE canopy_business_locations
  ADD COLUMN IF NOT EXISTS business_income NUMERIC(14,2);

ALTER TABLE canopy_business_locations
  ADD COLUMN IF NOT EXISTS extra_expense NUMERIC(14,2);

ALTER TABLE canopy_business_locations
  ADD COLUMN IF NOT EXISTS tenant_improvements NUMERIC(14,2);

-- Sync existing data
UPDATE canopy_business_locations
SET is_owned = (building_ownership = 'owned'),
    is_leased = (building_ownership = 'leased'),
    fire_protection_class = protection_class,
    building_coverage = building_value,
    bpp_coverage = contents_value
WHERE fire_protection_class IS NULL;

-- ============================================================================
-- 8. FIX canopy_payroll
-- ============================================================================
-- Code uses: estimated_premium
-- Schema has: premium

ALTER TABLE canopy_payroll
  ADD COLUMN IF NOT EXISTS estimated_premium NUMERIC(14,2);

-- Make annual_payroll nullable
ALTER TABLE canopy_payroll
  ALTER COLUMN annual_payroll DROP NOT NULL;

-- Sync existing data
UPDATE canopy_payroll
SET estimated_premium = premium
WHERE estimated_premium IS NULL;

-- ============================================================================
-- 9. FIX canopy_named_insureds
-- ============================================================================
-- Code uses: interest_type, is_mortgagee, is_loss_payee, is_additional_insured, endorsement_number
-- Schema has: insured_type enum

ALTER TABLE canopy_named_insureds
  ADD COLUMN IF NOT EXISTS interest_type TEXT;

ALTER TABLE canopy_named_insureds
  ADD COLUMN IF NOT EXISTS is_mortgagee BOOLEAN DEFAULT FALSE;

ALTER TABLE canopy_named_insureds
  ADD COLUMN IF NOT EXISTS is_loss_payee BOOLEAN DEFAULT FALSE;

ALTER TABLE canopy_named_insureds
  ADD COLUMN IF NOT EXISTS is_additional_insured BOOLEAN DEFAULT FALSE;

ALTER TABLE canopy_named_insureds
  ADD COLUMN IF NOT EXISTS endorsement_number TEXT;

-- Sync existing data
UPDATE canopy_named_insureds
SET is_mortgagee = (insured_type = 'mortgagee'),
    is_loss_payee = (insured_type = 'loss_payee'),
    is_additional_insured = (insured_type = 'additional_insured')
WHERE is_mortgagee IS NULL;

-- ============================================================================
-- 10. FIX canopy_policy_coverages
-- ============================================================================
-- Code uses: coverage_description, limit_amount, per_occurrence, aggregate, effective_date, expiration_date
-- Schema has: coverage_name, per_occurrence_limit, aggregate_limit

ALTER TABLE canopy_policy_coverages
  ADD COLUMN IF NOT EXISTS coverage_description TEXT;

ALTER TABLE canopy_policy_coverages
  ADD COLUMN IF NOT EXISTS limit_amount NUMERIC(14,2);

ALTER TABLE canopy_policy_coverages
  ADD COLUMN IF NOT EXISTS per_occurrence NUMERIC(14,2);

ALTER TABLE canopy_policy_coverages
  ADD COLUMN IF NOT EXISTS aggregate NUMERIC(14,2);

ALTER TABLE canopy_policy_coverages
  ADD COLUMN IF NOT EXISTS effective_date DATE;

ALTER TABLE canopy_policy_coverages
  ADD COLUMN IF NOT EXISTS expiration_date DATE;

-- Sync existing data
UPDATE canopy_policy_coverages
SET coverage_description = coverage_name,
    per_occurrence = per_occurrence_limit,
    aggregate = aggregate_limit
WHERE coverage_description IS NULL;

-- ============================================================================
-- 11. ADDITIONAL INDEXES FOR NEW COLUMNS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_snapshots_type ON canopy_pull_snapshots(snapshot_type);

COMMENT ON TABLE canopy_pull_snapshots IS 'Audit trail of all Canopy data pulls with full payload storage for change detection';
COMMENT ON TABLE canopy_monitorings IS 'Tracks monitoring status for automatic policy refresh via Canopy Monitoring API';
COMMENT ON TABLE canopy_servicing_actions IS 'Tracks 2-way sync write operations via Canopy Servicing API';

-- ============================================================================
-- 12. RPC FUNCTION FOR PULLS WITHOUT MONITORING
-- ============================================================================

CREATE OR REPLACE FUNCTION get_pulls_without_monitoring(p_completed_before TIMESTAMPTZ)
RETURNS TABLE (
  id UUID,
  canopy_pull_id TEXT,
  lead_id UUID,
  account_id UUID,
  completed_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cp.id,
    cp.canopy_pull_id,
    cp.lead_id,
    cp.account_id,
    cp.completed_at
  FROM canopy_pulls cp
  WHERE cp.status = 'complete'
    AND cp.completed_at <= p_completed_before
    AND NOT EXISTS (
      SELECT 1 FROM canopy_monitorings cm WHERE cm.pull_id = cp.id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_pulls_without_monitoring TO authenticated;
