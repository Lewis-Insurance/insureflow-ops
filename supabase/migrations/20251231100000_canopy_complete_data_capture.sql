-- ============================================================================
-- CANOPY CONNECT - COMPLETE DATA CAPTURE
-- ============================================================================
-- This migration adds tables and columns to capture ALL data from Canopy API:
-- 1. NEW TABLES: driving_records, loss_events, agents, addresses
-- 2. EXPANDED: dwellings (property_data, mortgagee), claims, vehicles, policies
-- ============================================================================

-- ============================================================================
-- 1. NEW TABLE: CANOPY DRIVING RECORDS
-- ============================================================================
-- Captures driving_records[] array from Canopy - separate from driver violations
-- Contains accident/violation incidents with at-fault flags

CREATE TABLE IF NOT EXISTS canopy_driving_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pull_id UUID REFERENCES canopy_pulls(id) ON DELETE CASCADE,
  policy_id UUID REFERENCES canopy_policies(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES canopy_drivers(id) ON DELETE SET NULL,

  -- Canopy identifiers
  canopy_driving_record_id TEXT,
  canopy_driver_id TEXT,

  -- Incident details
  incident_date DATE,
  incident_type TEXT,              -- 'ACCIDENT', 'VIOLATION'
  violation_type TEXT,             -- 'SPEEDING', 'DUI', 'RECKLESS_DRIVING', etc.
  is_at_fault BOOLEAN,

  -- Additional details
  description TEXT,
  points INTEGER,
  state TEXT,

  -- Raw data for debugging
  raw_data JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for driving records
CREATE INDEX IF NOT EXISTS idx_driving_records_pull ON canopy_driving_records(pull_id);
CREATE INDEX IF NOT EXISTS idx_driving_records_policy ON canopy_driving_records(policy_id);
CREATE INDEX IF NOT EXISTS idx_driving_records_driver ON canopy_driving_records(driver_id);
CREATE INDEX IF NOT EXISTS idx_driving_records_canopy_driver ON canopy_driving_records(canopy_driver_id);
CREATE INDEX IF NOT EXISTS idx_driving_records_type ON canopy_driving_records(incident_type);
CREATE INDEX IF NOT EXISTS idx_driving_records_date ON canopy_driving_records(incident_date DESC);

-- Unique constraint for idempotent upserts
CREATE UNIQUE INDEX IF NOT EXISTS idx_driving_records_unique
  ON canopy_driving_records(canopy_driving_record_id)
  WHERE canopy_driving_record_id IS NOT NULL;

-- ============================================================================
-- 2. NEW TABLE: CANOPY LOSS EVENTS
-- ============================================================================
-- Captures loss_events[] array from Canopy - commercial loss history
-- Different from claims - these are historical business losses

CREATE TABLE IF NOT EXISTS canopy_loss_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pull_id UUID REFERENCES canopy_pulls(id) ON DELETE CASCADE,
  policy_id UUID REFERENCES canopy_policies(id) ON DELETE CASCADE,

  -- Canopy identifiers
  canopy_loss_event_id TEXT,

  -- Loss event details
  date_of_occurrence DATE,
  type TEXT,                       -- 'BURGLARY_AND_THEFT', 'FIRE', 'WATER_DAMAGE', etc.
  date_of_claim DATE,

  -- Financial details (stored in cents for precision)
  amount_paid_cents INTEGER,
  amount_reserved_cents INTEGER,

  -- Status flags
  is_subrogation BOOLEAN DEFAULT FALSE,
  is_claim_open BOOLEAN DEFAULT FALSE,

  -- Additional details
  description TEXT,
  location TEXT,

  -- Raw data for debugging
  raw_data JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for loss events
CREATE INDEX IF NOT EXISTS idx_loss_events_pull ON canopy_loss_events(pull_id);
CREATE INDEX IF NOT EXISTS idx_loss_events_policy ON canopy_loss_events(policy_id);
CREATE INDEX IF NOT EXISTS idx_loss_events_type ON canopy_loss_events(type);
CREATE INDEX IF NOT EXISTS idx_loss_events_date ON canopy_loss_events(date_of_occurrence DESC);
CREATE INDEX IF NOT EXISTS idx_loss_events_open ON canopy_loss_events(id) WHERE is_claim_open = TRUE;

-- Unique constraint for idempotent upserts
CREATE UNIQUE INDEX IF NOT EXISTS idx_loss_events_unique
  ON canopy_loss_events(canopy_loss_event_id)
  WHERE canopy_loss_event_id IS NOT NULL;

-- ============================================================================
-- 3. NEW TABLE: CANOPY AGENTS
-- ============================================================================
-- Captures agents[] array from Canopy - incumbent agent information
-- Valuable competitive intelligence for quoting

CREATE TABLE IF NOT EXISTS canopy_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pull_id UUID REFERENCES canopy_pulls(id) ON DELETE CASCADE,

  -- Canopy identifiers
  canopy_agent_id TEXT,
  canopy_address_id TEXT,

  -- Agent details
  agency_name TEXT,
  agent_full_name TEXT,
  phone_number TEXT,
  email TEXT,

  -- Address (denormalized for simplicity)
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,

  -- Policy associations (array of Canopy policy IDs this agent handles)
  policy_ids JSONB DEFAULT '[]',

  -- Raw data for debugging
  raw_data JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for agents
CREATE INDEX IF NOT EXISTS idx_agents_pull ON canopy_agents(pull_id);
CREATE INDEX IF NOT EXISTS idx_agents_agency ON canopy_agents(agency_name);
CREATE INDEX IF NOT EXISTS idx_agents_name ON canopy_agents(agent_full_name);
CREATE INDEX IF NOT EXISTS idx_agents_email ON canopy_agents(email) WHERE email IS NOT NULL;

-- Unique constraint for idempotent upserts
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_unique
  ON canopy_agents(canopy_agent_id)
  WHERE canopy_agent_id IS NOT NULL;

-- ============================================================================
-- 4. NEW TABLE: CANOPY ADDRESSES
-- ============================================================================
-- Captures addresses[] array from Canopy - normalized address storage
-- Different address types: MAILING, PHYSICAL, INCIDENT_LOCATION, etc.

CREATE TABLE IF NOT EXISTS canopy_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pull_id UUID REFERENCES canopy_pulls(id) ON DELETE CASCADE,

  -- Canopy identifier
  canopy_address_id TEXT,

  -- Address details
  full_address TEXT,
  number TEXT,                     -- Street number
  street TEXT,
  type TEXT,                       -- Street type: 'St', 'Ave', 'Blvd', etc.
  sec_unit_type TEXT,              -- 'Apartment', 'Suite', 'Unit', etc.
  sec_unit_num TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  county TEXT,
  country TEXT,

  -- Address nature/type
  address_nature TEXT,             -- 'MAILING', 'PHYSICAL', 'INCIDENT_LOCATION', 'LIENHOLDER', 'MORTGAGEE', 'AGENCY_LOCATION'

  -- Raw data for debugging
  raw_data JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for addresses
CREATE INDEX IF NOT EXISTS idx_addresses_pull ON canopy_addresses(pull_id);
CREATE INDEX IF NOT EXISTS idx_addresses_nature ON canopy_addresses(address_nature);
CREATE INDEX IF NOT EXISTS idx_addresses_zip ON canopy_addresses(zip);
CREATE INDEX IF NOT EXISTS idx_addresses_city_state ON canopy_addresses(city, state);

-- Unique constraint for idempotent upserts
CREATE UNIQUE INDEX IF NOT EXISTS idx_addresses_unique
  ON canopy_addresses(canopy_address_id)
  WHERE canopy_address_id IS NOT NULL;

-- ============================================================================
-- 5. EXPAND CANOPY_POLICIES TABLE
-- ============================================================================

-- Add name and description fields
ALTER TABLE canopy_policies ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE canopy_policies ADD COLUMN IF NOT EXISTS description TEXT;

-- Add date fields
ALTER TABLE canopy_policies ADD COLUMN IF NOT EXISTS renewal_date DATE;
ALTER TABLE canopy_policies ADD COLUMN IF NOT EXISTS canceled_date DATE;

-- Add status flags
ALTER TABLE canopy_policies ADD COLUMN IF NOT EXISTS limited_access BOOLEAN DEFAULT FALSE;
ALTER TABLE canopy_policies ADD COLUMN IF NOT EXISTS paid_in_full BOOLEAN;
ALTER TABLE canopy_policies ADD COLUMN IF NOT EXISTS is_monoline BOOLEAN DEFAULT FALSE;

-- Add business type (for commercial policies)
ALTER TABLE canopy_policies ADD COLUMN IF NOT EXISTS form_of_business TEXT;

-- Indexes for new policy fields
CREATE INDEX IF NOT EXISTS idx_policies_renewal ON canopy_policies(renewal_date)
  WHERE renewal_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_policies_canceled ON canopy_policies(canceled_date)
  WHERE canceled_date IS NOT NULL;

-- ============================================================================
-- 6. EXPAND CANOPY_VEHICLES TABLE
-- ============================================================================

-- Add Canopy identifier
ALTER TABLE canopy_vehicles ADD COLUMN IF NOT EXISTS canopy_vehicle_id TEXT;

-- Add series2 field
ALTER TABLE canopy_vehicles ADD COLUMN IF NOT EXISTS series2 TEXT;

-- Add purchase and status fields
ALTER TABLE canopy_vehicles ADD COLUMN IF NOT EXISTS purchase_date DATE;
ALTER TABLE canopy_vehicles ADD COLUMN IF NOT EXISTS is_removed BOOLEAN DEFAULT FALSE;

-- Add lien holder fields
ALTER TABLE canopy_vehicles ADD COLUMN IF NOT EXISTS lien_holder_name TEXT;
ALTER TABLE canopy_vehicles ADD COLUMN IF NOT EXISTS lien_holder_address_line1 TEXT;
ALTER TABLE canopy_vehicles ADD COLUMN IF NOT EXISTS lien_holder_city TEXT;
ALTER TABLE canopy_vehicles ADD COLUMN IF NOT EXISTS lien_holder_state TEXT;
ALTER TABLE canopy_vehicles ADD COLUMN IF NOT EXISTS lien_holder_zip TEXT;

-- Add features as JSONB
ALTER TABLE canopy_vehicles ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '{}';

-- Add per-mile premium field (for usage-based insurance)
ALTER TABLE canopy_vehicles ADD COLUMN IF NOT EXISTS per_mile_premium_tenth_of_cents INTEGER;

-- Indexes for new vehicle fields
CREATE INDEX IF NOT EXISTS idx_vehicles_canopy_id ON canopy_vehicles(canopy_vehicle_id)
  WHERE canopy_vehicle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_removed ON canopy_vehicles(id)
  WHERE is_removed = TRUE;

-- ============================================================================
-- 7. EXPAND CANOPY_DRIVERS TABLE
-- ============================================================================

-- Add Canopy identifier
ALTER TABLE canopy_drivers ADD COLUMN IF NOT EXISTS canopy_driver_id TEXT;

-- Add age fields
ALTER TABLE canopy_drivers ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE canopy_drivers ADD COLUMN IF NOT EXISTS age_on_date DATE;
ALTER TABLE canopy_drivers ADD COLUMN IF NOT EXISTS age_licensed INTEGER;

-- Add education field (separate from education_level for exact API match)
ALTER TABLE canopy_drivers ADD COLUMN IF NOT EXISTS education TEXT;

-- Index for Canopy driver ID
CREATE INDEX IF NOT EXISTS idx_drivers_canopy_id ON canopy_drivers(canopy_driver_id)
  WHERE canopy_driver_id IS NOT NULL;

-- ============================================================================
-- 8. EXPAND CANOPY_DWELLINGS TABLE
-- ============================================================================

-- Add Canopy identifier
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS canopy_dwelling_id TEXT;

-- Add mortgagee information
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS mortgagee_name TEXT;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS mortgage_loan_number TEXT;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS mortgagee_address_line1 TEXT;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS mortgagee_city TEXT;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS mortgagee_state TEXT;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS mortgagee_zip TEXT;

-- Add valuation fields (stored in cents for precision)
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS replacement_cost_cents INTEGER;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS cash_value_cents INTEGER;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS loss_settlement_type TEXT;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS extended_replacement_cost_percent INTEGER;

-- Add property_data fields (from Canopy's property_data object)
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS property_data_fetched BOOLEAN DEFAULT FALSE;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS apn TEXT;                          -- Assessor's Parcel Number
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS property_class TEXT;               -- 'SINGLE_FAMILY_RESIDENCE_TOWNHOUSE', etc.
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS property_sub_type TEXT;            -- 'RESIDENTIAL', 'COMMERCIAL', etc.

-- Add construction details from property_data
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS wall_type TEXT;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS frame_type TEXT;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS roof_cover TEXT;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS roof_shape TEXT;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS cooling_type TEXT;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS heating_fuel TEXT;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS energy_type TEXT;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS sewer_type TEXT;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS building_shape TEXT;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS construction_quality TEXT;

-- Add detailed room/size info from property_data
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS num_beds INTEGER;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS num_baths_full INTEGER;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS num_baths_partial INTEGER;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS num_units INTEGER;

-- Add fireplace details
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS has_fireplace BOOLEAN DEFAULT FALSE;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS num_fireplaces INTEGER;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS fireplace_type TEXT;

-- Add pool details
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS has_pool BOOLEAN DEFAULT FALSE;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS pool_type TEXT;

-- Add garage details
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS garage_type TEXT;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS garage_square_ft INTEGER;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS num_parking_spaces INTEGER;

-- Add valuation data from property_data (in cents)
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS assessed_improvement_value_cents INTEGER;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS assessed_land_value_cents INTEGER;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS assessed_total_value_cents INTEGER;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS market_improvement_value_cents INTEGER;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS market_land_value_cents INTEGER;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS market_total_value_cents INTEGER;

-- Add owner information from property_data
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS owner1_first_name TEXT;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS owner1_last_name TEXT;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS owner2_first_name TEXT;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS owner2_last_name TEXT;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS owner3_first_name TEXT;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS owner3_last_name TEXT;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS owner4_first_name TEXT;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS owner4_last_name TEXT;

-- Add mortgage data from property_data
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS first_mortgage_amount_cents INTEGER;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS first_mortgage_lender TEXT;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS second_mortgage_amount_cents INTEGER;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS second_mortgage_lender TEXT;

-- Add purchase history from property_data
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS purchase_date DATE;
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS purchase_price_cents INTEGER;

-- Add property_data last update
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS property_data_last_update DATE;

-- Full property_data JSONB for fields we haven't normalized
ALTER TABLE canopy_dwellings ADD COLUMN IF NOT EXISTS property_data JSONB DEFAULT '{}';

-- Indexes for new dwelling fields
CREATE INDEX IF NOT EXISTS idx_dwellings_canopy_id ON canopy_dwellings(canopy_dwelling_id)
  WHERE canopy_dwelling_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dwellings_mortgagee ON canopy_dwellings(mortgagee_name)
  WHERE mortgagee_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dwellings_apn ON canopy_dwellings(apn)
  WHERE apn IS NOT NULL;

-- ============================================================================
-- 9. EXPAND CANOPY_CLAIMS TABLE
-- ============================================================================

-- Add Canopy identifier
ALTER TABLE canopy_claims ADD COLUMN IF NOT EXISTS canopy_claim_id TEXT;

-- Add entity linking fields (Canopy IDs to link to specific entities)
ALTER TABLE canopy_claims ADD COLUMN IF NOT EXISTS canopy_dwelling_id TEXT;
ALTER TABLE canopy_claims ADD COLUMN IF NOT EXISTS canopy_vehicle_id TEXT;
ALTER TABLE canopy_claims ADD COLUMN IF NOT EXISTS canopy_address_id TEXT;
ALTER TABLE canopy_claims ADD COLUMN IF NOT EXISTS canopy_driver_id TEXT;

-- Add carrier claim identifier
ALTER TABLE canopy_claims ADD COLUMN IF NOT EXISTS carrier_claim_identifier TEXT;

-- Add claim representative contact info
ALTER TABLE canopy_claims ADD COLUMN IF NOT EXISTS representative_name TEXT;
ALTER TABLE canopy_claims ADD COLUMN IF NOT EXISTS representative_phone TEXT;
ALTER TABLE canopy_claims ADD COLUMN IF NOT EXISTS representative_email TEXT;

-- Indexes for new claim fields
CREATE INDEX IF NOT EXISTS idx_claims_canopy_id ON canopy_claims(canopy_claim_id)
  WHERE canopy_claim_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_claims_carrier_id ON canopy_claims(carrier_claim_identifier)
  WHERE carrier_claim_identifier IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_claims_canopy_vehicle ON canopy_claims(canopy_vehicle_id)
  WHERE canopy_vehicle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_claims_canopy_dwelling ON canopy_claims(canopy_dwelling_id)
  WHERE canopy_dwelling_id IS NOT NULL;

-- ============================================================================
-- 10. EXPAND CANOPY_PULLS TABLE
-- ============================================================================

-- Add consumer contact details (multiple phone types)
ALTER TABLE canopy_pulls ADD COLUMN IF NOT EXISTS consumer_first_name TEXT;
ALTER TABLE canopy_pulls ADD COLUMN IF NOT EXISTS consumer_middle_name TEXT;
ALTER TABLE canopy_pulls ADD COLUMN IF NOT EXISTS consumer_last_name TEXT;
ALTER TABLE canopy_pulls ADD COLUMN IF NOT EXISTS consumer_email TEXT;
ALTER TABLE canopy_pulls ADD COLUMN IF NOT EXISTS account_email TEXT;
ALTER TABLE canopy_pulls ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE canopy_pulls ADD COLUMN IF NOT EXISTS mobile_phone TEXT;
ALTER TABLE canopy_pulls ADD COLUMN IF NOT EXISTS home_phone TEXT;
ALTER TABLE canopy_pulls ADD COLUMN IF NOT EXISTS work_phone TEXT;
ALTER TABLE canopy_pulls ADD COLUMN IF NOT EXISTS work_phone_extension TEXT;

-- Add Canopy integration details
ALTER TABLE canopy_pulls ADD COLUMN IF NOT EXISTS widget_id TEXT;
ALTER TABLE canopy_pulls ADD COLUMN IF NOT EXISTS team_id TEXT;
ALTER TABLE canopy_pulls ADD COLUMN IF NOT EXISTS public_alias TEXT;
ALTER TABLE canopy_pulls ADD COLUMN IF NOT EXISTS public_url TEXT;

-- Add carrier/provider info
ALTER TABLE canopy_pulls ADD COLUMN IF NOT EXISTS insurance_provider_name TEXT;

-- Add archive/deletion tracking
ALTER TABLE canopy_pulls ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
ALTER TABLE canopy_pulls ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Add data availability flags
ALTER TABLE canopy_pulls ADD COLUMN IF NOT EXISTS no_policies BOOLEAN DEFAULT FALSE;
ALTER TABLE canopy_pulls ADD COLUMN IF NOT EXISTS no_drivers BOOLEAN DEFAULT FALSE;
ALTER TABLE canopy_pulls ADD COLUMN IF NOT EXISTS no_documents BOOLEAN DEFAULT FALSE;
ALTER TABLE canopy_pulls ADD COLUMN IF NOT EXISTS no_claims BOOLEAN DEFAULT FALSE;
ALTER TABLE canopy_pulls ADD COLUMN IF NOT EXISTS no_loss_events BOOLEAN DEFAULT FALSE;

-- Add skipped product types
ALTER TABLE canopy_pulls ADD COLUMN IF NOT EXISTS skipped_product_types JSONB DEFAULT '[]';

-- Add pull type
ALTER TABLE canopy_pulls ADD COLUMN IF NOT EXISTS pull_type TEXT;  -- 'PULLING_DATA', etc.

-- Indexes for new pull fields
CREATE INDEX IF NOT EXISTS idx_pulls_archived ON canopy_pulls(id)
  WHERE is_archived = TRUE;
CREATE INDEX IF NOT EXISTS idx_pulls_provider ON canopy_pulls(insurance_provider_name)
  WHERE insurance_provider_name IS NOT NULL;

-- ============================================================================
-- 11. EXPAND CANOPY_DOCUMENTS TABLE
-- ============================================================================

-- Add Canopy identifier
ALTER TABLE canopy_documents ADD COLUMN IF NOT EXISTS canopy_document_id TEXT;

-- Add title and date fields
ALTER TABLE canopy_documents ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE canopy_documents ADD COLUMN IF NOT EXISTS date_added TIMESTAMPTZ;

-- Add Canopy policy ID for linking
ALTER TABLE canopy_documents ADD COLUMN IF NOT EXISTS canopy_policy_id TEXT;

-- Index for Canopy document ID
CREATE INDEX IF NOT EXISTS idx_documents_canopy_id ON canopy_documents(canopy_document_id)
  WHERE canopy_document_id IS NOT NULL;

-- ============================================================================
-- 12. ENABLE ROW LEVEL SECURITY ON NEW TABLES
-- ============================================================================

ALTER TABLE canopy_driving_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_loss_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_addresses ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 13. RLS POLICIES FOR NEW TABLES
-- ============================================================================

-- Driving Records: Access through pull relationship
CREATE POLICY "Staff can view driving records" ON canopy_driving_records
  FOR SELECT USING (is_canopy_staff());

CREATE POLICY "Service role can manage driving records" ON canopy_driving_records
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- Loss Events: Access through pull relationship
CREATE POLICY "Staff can view loss events" ON canopy_loss_events
  FOR SELECT USING (is_canopy_staff());

CREATE POLICY "Service role can manage loss events" ON canopy_loss_events
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- Agents: Access through pull relationship
CREATE POLICY "Staff can view agents" ON canopy_agents
  FOR SELECT USING (is_canopy_staff());

CREATE POLICY "Service role can manage agents" ON canopy_agents
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- Addresses: Access through pull relationship
CREATE POLICY "Staff can view addresses" ON canopy_addresses
  FOR SELECT USING (is_canopy_staff());

CREATE POLICY "Service role can manage addresses" ON canopy_addresses
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- ============================================================================
-- 14. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE canopy_driving_records IS 'MVR driving records from Canopy - accidents, violations, at-fault incidents';
COMMENT ON TABLE canopy_loss_events IS 'Commercial loss history from Canopy - theft, fire, water damage events';
COMMENT ON TABLE canopy_agents IS 'Incumbent agent information from Canopy - agency, agent name, contact details';
COMMENT ON TABLE canopy_addresses IS 'Normalized addresses from Canopy with address_nature classification';

COMMENT ON COLUMN canopy_dwellings.property_data IS 'Full Canopy property_data object for fields not individually normalized';
COMMENT ON COLUMN canopy_dwellings.replacement_cost_cents IS 'Dwelling replacement cost in cents from Canopy';
COMMENT ON COLUMN canopy_dwellings.loss_settlement_type IS 'REPLACEMENT_COST or ACTUAL_CASH_VALUE';

COMMENT ON COLUMN canopy_claims.carrier_claim_identifier IS 'Carrier-assigned claim number (e.g., HO-12345, AU-54321)';
COMMENT ON COLUMN canopy_claims.representative_name IS 'Claim representative contact name';

COMMENT ON COLUMN canopy_pulls.skipped_product_types IS 'Array of product types skipped during pull (e.g., ["personal"])';
COMMENT ON COLUMN canopy_pulls.pull_type IS 'Type of pull operation (e.g., PULLING_DATA)';
