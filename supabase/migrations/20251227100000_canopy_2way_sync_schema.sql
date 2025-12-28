-- ============================================================================
-- CANOPY CONNECT 2-WAY SYNC SCHEMA EXTENSION
-- ============================================================================
-- This migration adds tables for:
-- 1. Pull snapshots (audit trail, diffing)
-- 2. Monitoring (2-way read sync)
-- 3. Servicing actions (2-way write sync)
-- 4. Commercial lines support (fleet, business ops, locations, payroll)
-- ============================================================================

-- ============================================================================
-- 1. PULL SNAPSHOTS (AUDIT TRAIL & DIFFING)
-- ============================================================================
-- Store raw Canopy data for every state transition for diffing, debugging, audit

CREATE TABLE IF NOT EXISTS canopy_pull_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pull_id UUID NOT NULL REFERENCES canopy_pulls(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ DEFAULT NOW(),
  event_type TEXT NOT NULL,
  raw_pull_json JSONB NOT NULL,
  raw_webhook_json JSONB,
  data_hash TEXT,  -- SHA256 for deduplication/idempotency
  source TEXT NOT NULL DEFAULT 'webhook'
    CHECK (source IN ('webhook', 'manual_refresh', 'servicing', 'monitoring', 'api_fetch')),
  policy_count INTEGER DEFAULT 0,
  vehicle_count INTEGER DEFAULT 0,
  driver_count INTEGER DEFAULT 0,
  dwelling_count INTEGER DEFAULT 0,
  -- Diff metadata (populated after comparison)
  diff_from_snapshot_id UUID REFERENCES canopy_pull_snapshots(id),
  diff_summary JSONB,  -- Summary of changes detected
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for snapshots
CREATE INDEX IF NOT EXISTS idx_snapshots_pull ON canopy_pull_snapshots(pull_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_event ON canopy_pull_snapshots(event_type);
CREATE INDEX IF NOT EXISTS idx_snapshots_hash ON canopy_pull_snapshots(data_hash);
CREATE INDEX IF NOT EXISTS idx_snapshots_captured ON canopy_pull_snapshots(captured_at DESC);

-- Unique constraint for idempotency (same pull + same hash = duplicate)
CREATE UNIQUE INDEX IF NOT EXISTS idx_snapshots_unique_hash
  ON canopy_pull_snapshots(pull_id, data_hash)
  WHERE data_hash IS NOT NULL;

-- ============================================================================
-- 2. MONITORING TABLE (2-WAY READ SYNC)
-- ============================================================================
-- Track Canopy Monitoring subscriptions for automatic policy refresh

CREATE TABLE IF NOT EXISTS canopy_monitorings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canopy_monitoring_id TEXT UNIQUE NOT NULL,

  -- Link to initial and latest pulls
  initial_pull_id UUID REFERENCES canopy_pulls(id) ON DELETE SET NULL,
  latest_pull_id UUID REFERENCES canopy_pulls(id) ON DELETE SET NULL,

  -- Link to account/lead
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,

  -- Monitoring configuration
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'reconnect_required', 'stopped', 'error', 'expired')),
  refresh_interval_days INTEGER NOT NULL DEFAULT 30
    CHECK (refresh_interval_days >= 30),  -- Canopy minimum is 30 days
  next_refresh_date DATE,

  -- Carrier info
  carrier_name TEXT,
  carrier_code TEXT,
  account_identifier TEXT,  -- Carrier account username/identifier

  -- Reconnection data (stored securely, used when reconnect required)
  reconnect_token TEXT,
  reconnect_url TEXT,
  reconnect_required_at TIMESTAMPTZ,
  reconnect_expires_at TIMESTAMPTZ,

  -- Statistics
  total_refreshes INTEGER DEFAULT 0,
  successful_refreshes INTEGER DEFAULT 0,
  failed_refreshes INTEGER DEFAULT 0,

  -- Timestamps
  last_refresh_at TIMESTAMPTZ,
  last_successful_refresh_at TIMESTAMPTZ,
  error_message TEXT,
  error_code TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  stopped_at TIMESTAMPTZ,

  -- Who created/manages this monitoring
  created_by UUID REFERENCES auth.users(id)
);

-- Indexes for monitoring
CREATE INDEX IF NOT EXISTS idx_monitoring_status ON canopy_monitorings(status);
CREATE INDEX IF NOT EXISTS idx_monitoring_account ON canopy_monitorings(account_id) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_monitoring_lead ON canopy_monitorings(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_monitoring_refresh ON canopy_monitorings(next_refresh_date) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_monitoring_reconnect ON canopy_monitorings(id) WHERE status = 'reconnect_required';
CREATE INDEX IF NOT EXISTS idx_monitoring_carrier ON canopy_monitorings(carrier_name);

-- ============================================================================
-- 3. SERVICING ACTIONS TABLE (2-WAY WRITE SYNC)
-- ============================================================================
-- Track Canopy Servicing actions for carrier policy modifications

CREATE TABLE IF NOT EXISTS canopy_servicing_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canopy_servicing_id TEXT UNIQUE,

  -- Links
  pull_id UUID REFERENCES canopy_pulls(id) ON DELETE SET NULL,
  policy_id UUID REFERENCES canopy_policies(id) ON DELETE SET NULL,
  monitoring_id UUID REFERENCES canopy_monitorings(id) ON DELETE SET NULL,

  -- Action details
  action_type TEXT NOT NULL,  -- 'add_vehicle', 'update_mortgagee', 'add_driver', 'remove_vehicle', etc.
  action_subtype TEXT,        -- More specific action classification
  carrier_id TEXT,
  carrier_name TEXT,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',           -- Action created but not submitted
      'submitted',         -- Sent to Canopy
      'processing',        -- Canopy is processing
      'waiting_confirmation',  -- Awaiting user confirmation
      'confirmed',         -- User confirmed, sent to carrier
      'rejected',          -- User rejected
      'completed',         -- Successfully completed at carrier
      'failed',            -- Failed at carrier
      'cancelled',         -- Cancelled by user
      'expired'            -- Confirmation window expired
    )),

  -- Request/Response data
  request_payload JSONB NOT NULL,
  response_payload JSONB,

  -- Confirmation data (before/after for user review)
  confirmation_data JSONB,
  confirmation_required BOOLEAN DEFAULT FALSE,
  confirmation_deadline TIMESTAMPTZ,

  -- User info
  requested_by UUID REFERENCES auth.users(id),
  confirmed_by UUID REFERENCES auth.users(id),
  confirmation_notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Error handling
  error_code TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ
);

-- Indexes for servicing
CREATE INDEX IF NOT EXISTS idx_servicing_status ON canopy_servicing_actions(status);
CREATE INDEX IF NOT EXISTS idx_servicing_pull ON canopy_servicing_actions(pull_id) WHERE pull_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_servicing_policy ON canopy_servicing_actions(policy_id) WHERE policy_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_servicing_pending ON canopy_servicing_actions(id)
  WHERE status = 'waiting_confirmation';
CREATE INDEX IF NOT EXISTS idx_servicing_action_type ON canopy_servicing_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_servicing_carrier ON canopy_servicing_actions(carrier_name);
CREATE INDEX IF NOT EXISTS idx_servicing_requested_by ON canopy_servicing_actions(requested_by);

-- ============================================================================
-- 4. CARRIER CAPABILITIES CACHE
-- ============================================================================
-- Cache supported actions per carrier (from GET /carriers endpoint)

CREATE TABLE IF NOT EXISTS canopy_carrier_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id TEXT UNIQUE NOT NULL,
  carrier_name TEXT NOT NULL,
  carrier_code TEXT,

  -- Supported features
  supports_monitoring BOOLEAN DEFAULT FALSE,
  supports_servicing BOOLEAN DEFAULT FALSE,

  -- Supported servicing actions (array of action types)
  supported_actions JSONB DEFAULT '[]',
  -- Example: ["add_vehicle", "remove_vehicle", "add_driver", "update_mortgagee"]

  -- Detailed action capabilities
  action_details JSONB DEFAULT '{}',
  -- Example: { "add_vehicle": { "requires_vin": true, "max_vehicles": 10 } }

  -- Cache metadata
  last_fetched_at TIMESTAMPTZ DEFAULT NOW(),
  cache_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
  raw_response JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_carrier_caps_name ON canopy_carrier_capabilities(carrier_name);
CREATE INDEX IF NOT EXISTS idx_carrier_caps_expires ON canopy_carrier_capabilities(cache_expires_at);

-- ============================================================================
-- 5. COMMERCIAL AUTO VEHICLES (FLEET)
-- ============================================================================
-- Commercial vehicles with fleet-specific fields aligned to ACORD 127

CREATE TABLE IF NOT EXISTS canopy_commercial_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES canopy_policies(id) ON DELETE CASCADE,

  -- Canopy identifiers
  canopy_vehicle_id TEXT,

  -- Vehicle identification
  unit_number TEXT,
  vin TEXT,
  year INTEGER,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  trim TEXT,
  serial_number TEXT,

  -- Vehicle classification (ACORD 127 aligned)
  vehicle_type TEXT
    CHECK (vehicle_type IN (
      'truck', 'tractor', 'trailer', 'van', 'bus',
      'pickup', 'sedan', 'suv', 'other'
    )),
  body_type TEXT,
  size_class TEXT,  -- Light, Medium, Heavy, Extra Heavy

  -- Weight and capacity
  gvw INTEGER,                    -- Gross Vehicle Weight
  gcw INTEGER,                    -- Gross Combined Weight
  seating_capacity INTEGER,

  -- Usage
  radius_of_operation INTEGER,    -- Miles from base
  farthest_terminal TEXT,
  annual_mileage INTEGER,

  -- Cargo
  cargo_type TEXT,
  cargo_value NUMERIC(12,2),
  refrigerated BOOLEAN DEFAULT FALSE,
  hazmat BOOLEAN DEFAULT FALSE,

  -- Driver assignment
  assigned_driver_id UUID REFERENCES canopy_drivers(id),

  -- Ownership
  ownership TEXT CHECK (ownership IN ('owned', 'leased', 'financed', 'hired', 'non_owned', 'other')),
  lien_holder TEXT,
  lien_holder_address TEXT,

  -- Coverage values
  liability_limit NUMERIC(12,2),
  physical_damage_avc NUMERIC(12,2),  -- Actual Cash Value
  physical_damage_stated NUMERIC(12,2),
  collision_deductible NUMERIC(12,2),
  comprehensive_deductible NUMERIC(12,2),
  cargo_limit NUMERIC(12,2),
  trailer_interchange NUMERIC(12,2),

  -- Cost factors
  cost_new NUMERIC(12,2),
  current_value NUMERIC(12,2),

  -- Full coverage details
  coverages JSONB DEFAULT '{}',

  -- Raw data
  raw_data JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for commercial vehicles
CREATE INDEX IF NOT EXISTS idx_comm_vehicles_policy ON canopy_commercial_vehicles(policy_id);
CREATE INDEX IF NOT EXISTS idx_comm_vehicles_vin ON canopy_commercial_vehicles(vin) WHERE vin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comm_vehicles_unit ON canopy_commercial_vehicles(unit_number) WHERE unit_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comm_vehicles_type ON canopy_commercial_vehicles(vehicle_type);
CREATE INDEX IF NOT EXISTS idx_comm_vehicles_canopy_id ON canopy_commercial_vehicles(canopy_vehicle_id) WHERE canopy_vehicle_id IS NOT NULL;

-- Unique constraint for idempotent upserts
CREATE UNIQUE INDEX IF NOT EXISTS idx_comm_vehicles_unique
  ON canopy_commercial_vehicles(policy_id, COALESCE(vin, unit_number, id::text));

-- ============================================================================
-- 6. BUSINESS OPERATIONS (GL/BOP)
-- ============================================================================
-- Business entity information aligned to ACORD 125/126

CREATE TABLE IF NOT EXISTS canopy_business_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES canopy_policies(id) ON DELETE CASCADE,

  -- Business identification
  business_name TEXT NOT NULL,
  dba_name TEXT,
  fein TEXT,                      -- Federal Employer ID Number

  -- Legal structure
  business_type TEXT
    CHECK (business_type IN (
      'sole_prop', 'partnership', 'llc', 'corp', 's_corp',
      'nonprofit', 'joint_venture', 'trust', 'government', 'other'
    )),
  legal_entity_type TEXT,
  state_of_incorporation TEXT,

  -- Classification codes (ACORD 125/126)
  naics_code TEXT,
  naics_description TEXT,
  sic_code TEXT,
  sic_description TEXT,
  class_code TEXT,                -- GL class code
  class_description TEXT,

  -- Business details
  years_in_business INTEGER,
  date_business_started DATE,
  years_current_ownership INTEGER,

  -- Operations description
  description_of_operations TEXT,
  products_description TEXT,

  -- Financials
  annual_revenue NUMERIC(14,2),
  annual_gross_sales NUMERIC(14,2),
  annual_payroll NUMERIC(14,2),

  -- Employees
  employee_count INTEGER,
  full_time_count INTEGER,
  part_time_count INTEGER,

  -- Risk factors
  products_completed_ops BOOLEAN DEFAULT FALSE,
  uses_subcontractors BOOLEAN DEFAULT FALSE,
  subcontractor_cost NUMERIC(14,2),
  foreign_operations BOOLEAN DEFAULT FALSE,

  -- Contact
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  website TEXT,

  -- Raw data
  raw_data JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for business operations
CREATE INDEX IF NOT EXISTS idx_business_ops_policy ON canopy_business_operations(policy_id);
CREATE INDEX IF NOT EXISTS idx_business_ops_naics ON canopy_business_operations(naics_code) WHERE naics_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_business_ops_sic ON canopy_business_operations(sic_code) WHERE sic_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_business_ops_fein ON canopy_business_operations(fein) WHERE fein IS NOT NULL;

-- ============================================================================
-- 7. BUSINESS LOCATIONS (COMMERCIAL PROPERTY)
-- ============================================================================
-- Business locations/buildings aligned to ACORD 140

CREATE TABLE IF NOT EXISTS canopy_business_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES canopy_policies(id) ON DELETE CASCADE,

  -- Location identification
  location_number INTEGER DEFAULT 1,
  building_number INTEGER DEFAULT 1,
  location_name TEXT,

  -- Address
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,
  county TEXT,
  country TEXT DEFAULT 'USA',

  -- Property type
  occupancy_type TEXT,            -- Office, Retail, Warehouse, Manufacturing, etc.
  building_ownership TEXT
    CHECK (building_ownership IN ('owned', 'leased', 'other')),
  interest TEXT,                  -- Owner, Tenant, Mortgagee, etc.

  -- Building characteristics (ACORD 140)
  construction_type TEXT,         -- Frame, Joisted Masonry, Non-Combustible, etc.
  iso_construction_code TEXT,     -- ISO construction classification
  year_built INTEGER,
  square_footage INTEGER,
  stories INTEGER,
  basement BOOLEAN DEFAULT FALSE,
  basement_sq_ft INTEGER,

  -- Protection
  protection_class TEXT,          -- ISO protection class 1-10
  fire_district TEXT,
  distance_to_fire_station NUMERIC(5,2),  -- Miles
  distance_to_fire_hydrant NUMERIC(5,2),  -- Feet

  -- Safety systems
  sprinklered BOOLEAN DEFAULT FALSE,
  sprinkler_type TEXT,            -- Wet, Dry, Deluge
  sprinkler_coverage_pct INTEGER,
  alarm_type TEXT,                -- Central, Local, None
  security_system BOOLEAN DEFAULT FALSE,
  fire_extinguishers BOOLEAN DEFAULT FALSE,

  -- Building systems
  roof_type TEXT,
  roof_age INTEGER,
  heating_type TEXT,
  electrical_type TEXT,
  plumbing_type TEXT,
  wiring_update_year INTEGER,
  plumbing_update_year INTEGER,
  heating_update_year INTEGER,
  roof_update_year INTEGER,

  -- Coverage values (ACORD 140)
  building_value NUMERIC(14,2),
  contents_value NUMERIC(14,2),
  business_income_value NUMERIC(14,2),
  extra_expense_value NUMERIC(14,2),
  tenant_improvements NUMERIC(14,2),
  rental_value NUMERIC(14,2),
  equipment_breakdown NUMERIC(14,2),

  -- Deductibles
  property_deductible NUMERIC(12,2),
  wind_hail_deductible NUMERIC(12,2),
  wind_hail_deductible_pct NUMERIC(5,2),
  flood_deductible NUMERIC(12,2),
  earthquake_deductible NUMERIC(12,2),

  -- Special coverages
  flood_zone TEXT,
  earthquake_zone TEXT,
  coastal_zone BOOLEAN DEFAULT FALSE,

  -- Raw data
  raw_data JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for business locations
CREATE INDEX IF NOT EXISTS idx_business_loc_policy ON canopy_business_locations(policy_id);
CREATE INDEX IF NOT EXISTS idx_business_loc_zip ON canopy_business_locations(zip);
CREATE INDEX IF NOT EXISTS idx_business_loc_state ON canopy_business_locations(state);
CREATE INDEX IF NOT EXISTS idx_business_loc_address ON canopy_business_locations(address_line1, city, state);

-- Unique constraint for idempotent upserts
CREATE UNIQUE INDEX IF NOT EXISTS idx_business_loc_unique
  ON canopy_business_locations(policy_id, location_number, building_number);

-- ============================================================================
-- 8. WORKERS COMP PAYROLL
-- ============================================================================
-- Payroll by class code aligned to ACORD 130

CREATE TABLE IF NOT EXISTS canopy_payroll (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES canopy_policies(id) ON DELETE CASCADE,

  -- Location reference (optional)
  location_id UUID REFERENCES canopy_business_locations(id),

  -- State and classification
  state TEXT NOT NULL,
  class_code TEXT NOT NULL,
  class_description TEXT,
  governing_class BOOLEAN DEFAULT FALSE,

  -- Employee counts
  employee_count INTEGER,
  full_time_count INTEGER,
  part_time_count INTEGER,

  -- Payroll amounts
  annual_payroll NUMERIC(14,2) NOT NULL,
  estimated_payroll NUMERIC(14,2),
  actual_payroll NUMERIC(14,2),

  -- Rating
  rate NUMERIC(8,4),
  manual_rate NUMERIC(8,4),
  premium NUMERIC(12,2),

  -- Experience modification
  experience_mod NUMERIC(5,3) DEFAULT 1.000,
  experience_mod_effective_date DATE,

  -- If/any
  if_any_exposure BOOLEAN DEFAULT FALSE,
  if_any_description TEXT,

  -- Raw data
  raw_data JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for payroll
CREATE INDEX IF NOT EXISTS idx_payroll_policy ON canopy_payroll(policy_id);
CREATE INDEX IF NOT EXISTS idx_payroll_state ON canopy_payroll(state);
CREATE INDEX IF NOT EXISTS idx_payroll_class ON canopy_payroll(class_code);
CREATE INDEX IF NOT EXISTS idx_payroll_state_class ON canopy_payroll(state, class_code);

-- Unique constraint for idempotent upserts
CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_unique
  ON canopy_payroll(policy_id, state, class_code);

-- ============================================================================
-- 9. NAMED INSUREDS (ADDITIONAL INSUREDS)
-- ============================================================================
-- Track all named insureds on a policy

CREATE TABLE IF NOT EXISTS canopy_named_insureds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES canopy_policies(id) ON DELETE CASCADE,

  -- Insured type
  insured_type TEXT NOT NULL
    CHECK (insured_type IN (
      'named_insured', 'additional_insured', 'additional_interest',
      'loss_payee', 'mortgagee', 'certificate_holder'
    )),
  is_primary BOOLEAN DEFAULT FALSE,

  -- Entity info
  entity_type TEXT CHECK (entity_type IN ('individual', 'business', 'trust', 'other')),
  name TEXT NOT NULL,
  dba_name TEXT,
  fein TEXT,

  -- Address
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,

  -- Contact
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,

  -- Relationship/interest
  relationship TEXT,
  interest_description TEXT,

  -- For mortgagees/lienholders
  loan_number TEXT,

  -- Raw data
  raw_data JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_named_insureds_policy ON canopy_named_insureds(policy_id);
CREATE INDEX IF NOT EXISTS idx_named_insureds_type ON canopy_named_insureds(insured_type);
CREATE INDEX IF NOT EXISTS idx_named_insureds_name ON canopy_named_insureds(name);

-- ============================================================================
-- 10. POLICY COVERAGES (STRUCTURED)
-- ============================================================================
-- Structured coverage data instead of just JSONB blobs

CREATE TABLE IF NOT EXISTS canopy_policy_coverages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES canopy_policies(id) ON DELETE CASCADE,

  -- Coverage identification
  coverage_code TEXT NOT NULL,
  coverage_name TEXT NOT NULL,
  coverage_type TEXT,             -- Liability, Property, Medical, etc.

  -- Limits
  per_occurrence_limit NUMERIC(14,2),
  aggregate_limit NUMERIC(14,2),
  per_person_limit NUMERIC(14,2),
  per_accident_limit NUMERIC(14,2),

  -- Deductibles
  deductible NUMERIC(12,2),
  deductible_type TEXT,           -- Per Claim, Per Occurrence, Annual Aggregate

  -- Premium
  premium NUMERIC(12,2),

  -- Status
  is_included BOOLEAN DEFAULT TRUE,
  is_optional BOOLEAN DEFAULT FALSE,

  -- Raw data
  raw_data JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coverages_policy ON canopy_policy_coverages(policy_id);
CREATE INDEX IF NOT EXISTS idx_coverages_code ON canopy_policy_coverages(coverage_code);
CREATE INDEX IF NOT EXISTS idx_coverages_type ON canopy_policy_coverages(coverage_type);

-- Unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_coverages_unique
  ON canopy_policy_coverages(policy_id, coverage_code);

-- ============================================================================
-- 11. ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE canopy_pull_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_monitorings ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_servicing_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_carrier_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_commercial_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_business_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_business_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_named_insureds ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_policy_coverages ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 12. RLS POLICIES
-- ============================================================================

-- Pull snapshots: Staff can view all
CREATE POLICY "Staff can view canopy snapshots" ON canopy_pull_snapshots
  FOR SELECT USING (is_canopy_staff());

CREATE POLICY "Service role can manage snapshots" ON canopy_pull_snapshots
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- Monitorings: Staff can view all, manage their own
CREATE POLICY "Staff can view canopy monitorings" ON canopy_monitorings
  FOR SELECT USING (is_canopy_staff());

CREATE POLICY "Staff can insert canopy monitorings" ON canopy_monitorings
  FOR INSERT WITH CHECK (is_canopy_staff());

CREATE POLICY "Staff can update canopy monitorings" ON canopy_monitorings
  FOR UPDATE USING (is_canopy_staff());

CREATE POLICY "Service role can manage monitorings" ON canopy_monitorings
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- Servicing actions: Staff can view all, manage based on access
CREATE POLICY "Staff can view servicing actions" ON canopy_servicing_actions
  FOR SELECT USING (is_canopy_staff());

CREATE POLICY "Staff can insert servicing actions" ON canopy_servicing_actions
  FOR INSERT WITH CHECK (is_canopy_staff());

CREATE POLICY "Staff can update servicing actions" ON canopy_servicing_actions
  FOR UPDATE USING (is_canopy_staff());

CREATE POLICY "Service role can manage servicing" ON canopy_servicing_actions
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- Carrier capabilities: Everyone can read (it's public carrier info)
CREATE POLICY "Anyone can view carrier capabilities" ON canopy_carrier_capabilities
  FOR SELECT USING (TRUE);

CREATE POLICY "Service role can manage carrier caps" ON canopy_carrier_capabilities
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- Commercial vehicles: Access through policy relationship
CREATE POLICY "Staff can view commercial vehicles" ON canopy_commercial_vehicles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM canopy_policies pol
      JOIN canopy_pulls cp ON cp.id = pol.pull_id
      WHERE pol.id = canopy_commercial_vehicles.policy_id
      AND is_canopy_staff()
    )
  );

CREATE POLICY "Service role can manage commercial vehicles" ON canopy_commercial_vehicles
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- Business operations: Access through policy relationship
CREATE POLICY "Staff can view business operations" ON canopy_business_operations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM canopy_policies pol
      JOIN canopy_pulls cp ON cp.id = pol.pull_id
      WHERE pol.id = canopy_business_operations.policy_id
      AND is_canopy_staff()
    )
  );

CREATE POLICY "Service role can manage business operations" ON canopy_business_operations
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- Business locations: Access through policy relationship
CREATE POLICY "Staff can view business locations" ON canopy_business_locations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM canopy_policies pol
      JOIN canopy_pulls cp ON cp.id = pol.pull_id
      WHERE pol.id = canopy_business_locations.policy_id
      AND is_canopy_staff()
    )
  );

CREATE POLICY "Service role can manage business locations" ON canopy_business_locations
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- Payroll: Access through policy relationship
CREATE POLICY "Staff can view payroll" ON canopy_payroll
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM canopy_policies pol
      JOIN canopy_pulls cp ON cp.id = pol.pull_id
      WHERE pol.id = canopy_payroll.policy_id
      AND is_canopy_staff()
    )
  );

CREATE POLICY "Service role can manage payroll" ON canopy_payroll
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- Named insureds: Access through policy relationship
CREATE POLICY "Staff can view named insureds" ON canopy_named_insureds
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM canopy_policies pol
      JOIN canopy_pulls cp ON cp.id = pol.pull_id
      WHERE pol.id = canopy_named_insureds.policy_id
      AND is_canopy_staff()
    )
  );

CREATE POLICY "Service role can manage named insureds" ON canopy_named_insureds
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- Policy coverages: Access through policy relationship
CREATE POLICY "Staff can view policy coverages" ON canopy_policy_coverages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM canopy_policies pol
      JOIN canopy_pulls cp ON cp.id = pol.pull_id
      WHERE pol.id = canopy_policy_coverages.policy_id
      AND is_canopy_staff()
    )
  );

CREATE POLICY "Service role can manage policy coverages" ON canopy_policy_coverages
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- ============================================================================
-- 13. UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at
CREATE TRIGGER canopy_monitorings_updated_at
  BEFORE UPDATE ON canopy_monitorings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER canopy_servicing_actions_updated_at
  BEFORE UPDATE ON canopy_servicing_actions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER canopy_carrier_capabilities_updated_at
  BEFORE UPDATE ON canopy_carrier_capabilities
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER canopy_commercial_vehicles_updated_at
  BEFORE UPDATE ON canopy_commercial_vehicles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER canopy_business_operations_updated_at
  BEFORE UPDATE ON canopy_business_operations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER canopy_business_locations_updated_at
  BEFORE UPDATE ON canopy_business_locations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER canopy_payroll_updated_at
  BEFORE UPDATE ON canopy_payroll
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 14. ADD MISSING COLUMNS TO EXISTING TABLES
-- ============================================================================

-- Add commercial policy types to canopy_policies check constraint
-- First drop the existing constraint, then recreate with commercial types
ALTER TABLE canopy_policies DROP CONSTRAINT IF EXISTS canopy_policies_policy_type_check;
ALTER TABLE canopy_policies ADD CONSTRAINT canopy_policies_policy_type_check
  CHECK (policy_type IN (
    -- Personal lines
    'auto', 'home', 'renters', 'condo', 'umbrella', 'life', 'health',
    -- Commercial lines
    'commercial_auto', 'commercial_property', 'general_liability',
    'bop', 'workers_comp', 'professional_liability', 'cyber',
    'inland_marine', 'commercial_umbrella', 'epli',
    -- Catch-all
    'other'
  ));

-- Add monitoring_id to canopy_pulls for linking
ALTER TABLE canopy_pulls ADD COLUMN IF NOT EXISTS monitoring_id UUID REFERENCES canopy_monitorings(id);
CREATE INDEX IF NOT EXISTS idx_pulls_monitoring ON canopy_pulls(monitoring_id) WHERE monitoring_id IS NOT NULL;

-- Add is_monitoring_refresh flag to identify refresh pulls
ALTER TABLE canopy_pulls ADD COLUMN IF NOT EXISTS is_monitoring_refresh BOOLEAN DEFAULT FALSE;

-- Add encountered_mfa for auth status tracking
ALTER TABLE canopy_pulls ADD COLUMN IF NOT EXISTS encountered_mfa BOOLEAN DEFAULT FALSE;

-- Add sequence tracking for idempotency
ALTER TABLE canopy_pulls ADD COLUMN IF NOT EXISTS webhook_sequence INTEGER;

-- ============================================================================
-- 15. HELPER FUNCTIONS
-- ============================================================================

-- Get monitoring summary for an account
CREATE OR REPLACE FUNCTION get_account_monitoring_summary(p_account_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_monitorings', COUNT(*),
    'active', COUNT(*) FILTER (WHERE status = 'active'),
    'reconnect_required', COUNT(*) FILTER (WHERE status = 'reconnect_required'),
    'stopped', COUNT(*) FILTER (WHERE status = 'stopped'),
    'carriers', jsonb_agg(DISTINCT carrier_name) FILTER (WHERE carrier_name IS NOT NULL),
    'next_refresh', MIN(next_refresh_date) FILTER (WHERE status = 'active')
  ) INTO v_result
  FROM canopy_monitorings
  WHERE account_id = p_account_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get pending servicing actions for a user
CREATE OR REPLACE FUNCTION get_pending_servicing_actions(p_user_id UUID DEFAULT NULL)
RETURNS SETOF canopy_servicing_actions AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM canopy_servicing_actions
  WHERE status = 'waiting_confirmation'
    AND (p_user_id IS NULL OR requested_by = p_user_id)
  ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get commercial data summary for a pull
CREATE OR REPLACE FUNCTION get_canopy_commercial_summary(p_pull_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'pull_id', p_pull_id,
    'commercial_vehicle_count', (
      SELECT COUNT(*) FROM canopy_commercial_vehicles cv
      JOIN canopy_policies pol ON pol.id = cv.policy_id
      WHERE pol.pull_id = p_pull_id
    ),
    'business_operations_count', (
      SELECT COUNT(*) FROM canopy_business_operations bo
      JOIN canopy_policies pol ON pol.id = bo.policy_id
      WHERE pol.pull_id = p_pull_id
    ),
    'location_count', (
      SELECT COUNT(*) FROM canopy_business_locations bl
      JOIN canopy_policies pol ON pol.id = bl.policy_id
      WHERE pol.pull_id = p_pull_id
    ),
    'payroll_entries', (
      SELECT COUNT(*) FROM canopy_payroll py
      JOIN canopy_policies pol ON pol.id = py.policy_id
      WHERE pol.pull_id = p_pull_id
    ),
    'total_payroll', (
      SELECT SUM(annual_payroll) FROM canopy_payroll py
      JOIN canopy_policies pol ON pol.id = py.policy_id
      WHERE pol.pull_id = p_pull_id
    ),
    'total_building_value', (
      SELECT SUM(building_value) FROM canopy_business_locations bl
      JOIN canopy_policies pol ON pol.id = bl.policy_id
      WHERE pol.pull_id = p_pull_id
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 16. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE canopy_pull_snapshots IS 'Raw Canopy pull data snapshots for audit trail and diffing';
COMMENT ON TABLE canopy_monitorings IS 'Canopy Monitoring subscriptions for automatic policy refresh';
COMMENT ON TABLE canopy_servicing_actions IS 'Canopy Servicing actions for carrier policy modifications (2-way sync)';
COMMENT ON TABLE canopy_carrier_capabilities IS 'Cached carrier capabilities (supported actions, features)';
COMMENT ON TABLE canopy_commercial_vehicles IS 'Commercial/fleet vehicles from Canopy (ACORD 127 aligned)';
COMMENT ON TABLE canopy_business_operations IS 'Business operations data from Canopy (ACORD 125/126 aligned)';
COMMENT ON TABLE canopy_business_locations IS 'Business locations/buildings from Canopy (ACORD 140 aligned)';
COMMENT ON TABLE canopy_payroll IS 'Workers comp payroll by class code from Canopy (ACORD 130 aligned)';
COMMENT ON TABLE canopy_named_insureds IS 'Named insureds, additional insureds, and certificate holders';
COMMENT ON TABLE canopy_policy_coverages IS 'Structured coverage data from policies';

COMMENT ON FUNCTION get_account_monitoring_summary IS 'Returns monitoring statistics for an account';
COMMENT ON FUNCTION get_pending_servicing_actions IS 'Returns servicing actions awaiting user confirmation';
COMMENT ON FUNCTION get_canopy_commercial_summary IS 'Returns summary of commercial data for a pull';
