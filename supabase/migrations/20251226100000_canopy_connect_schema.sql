-- ============================================================================
-- CANOPY CONNECT INTEGRATION SCHEMA
-- ============================================================================
-- This migration creates the complete database schema for Canopy Connect
-- integration - "Plaid for Insurance" data import platform.
-- ============================================================================

-- ============================================================================
-- 1. CORE TABLES
-- ============================================================================

-- Main pull tracking table - tracks each Canopy data import session
CREATE TABLE IF NOT EXISTS canopy_pulls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canopy_pull_id TEXT UNIQUE NOT NULL,           -- Canopy's pull identifier
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'authenticated', 'processing', 'complete', 'error', 'expired')),
  carrier_count INTEGER DEFAULT 0,
  policy_count INTEGER DEFAULT 0,
  consent_token TEXT,                            -- Encrypted consent reference
  error_message TEXT,
  error_code TEXT,
  metadata JSONB DEFAULT '{}',
  initiated_by UUID REFERENCES auth.users(id),   -- Staff member who initiated
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Policies extracted from Canopy
CREATE TABLE IF NOT EXISTS canopy_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pull_id UUID NOT NULL REFERENCES canopy_pulls(id) ON DELETE CASCADE,
  canopy_policy_id TEXT,                         -- Canopy's policy ID
  carrier_name TEXT NOT NULL,
  carrier_code TEXT,
  carrier_naic_code TEXT,                        -- NAIC carrier code
  policy_number TEXT,
  policy_type TEXT NOT NULL
    CHECK (policy_type IN ('auto', 'home', 'renters', 'condo', 'umbrella', 'life', 'health', 'other')),
  effective_date DATE,
  expiration_date DATE,
  premium_amount NUMERIC(12,2),
  premium_frequency TEXT
    CHECK (premium_frequency IN ('annual', 'semi-annual', 'quarterly', 'monthly', 'other')),
  status TEXT
    CHECK (status IN ('active', 'cancelled', 'expired', 'pending', 'unknown')),
  deductible NUMERIC(12,2),
  coverage_limits JSONB DEFAULT '{}',
  named_insureds JSONB DEFAULT '[]',             -- Array of insured persons
  additional_interests JSONB DEFAULT '[]',       -- Lienholders, additional insureds
  raw_data JSONB DEFAULT '{}',                   -- Full Canopy response for debugging
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vehicles from auto policies
CREATE TABLE IF NOT EXISTS canopy_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES canopy_policies(id) ON DELETE CASCADE,
  vin TEXT,
  year INTEGER,
  make TEXT,
  model TEXT,
  trim TEXT,
  body_type TEXT,
  usage_type TEXT
    CHECK (usage_type IN ('commute', 'pleasure', 'business', 'farm', 'other')),
  annual_mileage INTEGER,
  ownership TEXT
    CHECK (ownership IN ('owned', 'leased', 'financed', 'other')),
  garage_address TEXT,
  garage_city TEXT,
  garage_state TEXT,
  garage_zip TEXT,
  -- Coverage details per vehicle
  liability_bi NUMERIC(12,2),                    -- Bodily Injury per person
  liability_bi_total NUMERIC(12,2),              -- BI per accident
  liability_pd NUMERIC(12,2),                    -- Property Damage
  collision_deductible NUMERIC(12,2),
  comprehensive_deductible NUMERIC(12,2),
  uninsured_motorist NUMERIC(12,2),
  underinsured_motorist NUMERIC(12,2),
  medical_payments NUMERIC(12,2),
  rental_reimbursement NUMERIC(8,2),
  towing_labor NUMERIC(8,2),
  coverages JSONB DEFAULT '{}',                  -- Additional coverage details
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drivers from auto policies
CREATE TABLE IF NOT EXISTS canopy_drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES canopy_policies(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  middle_name TEXT,
  suffix TEXT,
  date_of_birth DATE,
  gender TEXT CHECK (gender IN ('male', 'female', 'other', 'unknown')),
  marital_status TEXT
    CHECK (marital_status IN ('single', 'married', 'divorced', 'widowed', 'domestic_partner', 'separated', 'unknown')),
  license_number TEXT,
  license_state TEXT,
  license_status TEXT
    CHECK (license_status IN ('valid', 'suspended', 'revoked', 'expired', 'permit', 'unknown')),
  license_issue_date DATE,
  license_expiration_date DATE,
  relation_to_insured TEXT
    CHECK (relation_to_insured IN ('self', 'spouse', 'child', 'parent', 'other_relative', 'employee', 'other')),
  is_primary BOOLEAN DEFAULT FALSE,
  is_excluded BOOLEAN DEFAULT FALSE,
  sr22_required BOOLEAN DEFAULT FALSE,
  occupation TEXT,
  education_level TEXT,
  -- Driving record
  years_licensed INTEGER,
  violations JSONB DEFAULT '[]',                 -- Array of violations
  accidents JSONB DEFAULT '[]',                  -- Array of accidents
  claims JSONB DEFAULT '[]',                     -- Array of claims
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dwellings from home/renters/condo policies
CREATE TABLE IF NOT EXISTS canopy_dwellings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES canopy_policies(id) ON DELETE CASCADE,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  county TEXT,
  property_type TEXT
    CHECK (property_type IN ('single_family', 'condo', 'townhouse', 'mobile_home', 'apartment', 'multi_family', 'other')),
  occupancy_type TEXT
    CHECK (occupancy_type IN ('owner_occupied', 'tenant', 'vacant', 'seasonal', 'other')),
  year_built INTEGER,
  square_footage INTEGER,
  stories INTEGER,
  construction_type TEXT,
  exterior_type TEXT,
  roof_type TEXT,
  roof_year INTEGER,
  foundation_type TEXT,
  heating_type TEXT,
  electrical_type TEXT,
  plumbing_type TEXT,
  -- Coverage amounts
  dwelling_coverage NUMERIC(12,2),               -- Coverage A
  other_structures NUMERIC(12,2),                -- Coverage B
  personal_property NUMERIC(12,2),               -- Coverage C
  loss_of_use NUMERIC(12,2),                     -- Coverage D
  liability_coverage NUMERIC(12,2),              -- Coverage E
  medical_payments NUMERIC(12,2),                -- Coverage F
  deductible NUMERIC(12,2),
  wind_hail_deductible NUMERIC(12,2),
  hurricane_deductible NUMERIC(12,2),
  flood_coverage BOOLEAN DEFAULT FALSE,
  earthquake_coverage BOOLEAN DEFAULT FALSE,
  -- Property features
  swimming_pool BOOLEAN DEFAULT FALSE,
  trampoline BOOLEAN DEFAULT FALSE,
  dog_breed TEXT,
  security_system BOOLEAN DEFAULT FALSE,
  fire_alarm BOOLEAN DEFAULT FALSE,
  sprinkler_system BOOLEAN DEFAULT FALSE,
  deadbolt_locks BOOLEAN DEFAULT FALSE,
  gated_community BOOLEAN DEFAULT FALSE,
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documents/ID cards from Canopy
CREATE TABLE IF NOT EXISTS canopy_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES canopy_policies(id) ON DELETE CASCADE,
  document_type TEXT
    CHECK (document_type IN ('id_card', 'dec_page', 'policy_doc', 'endorsement', 'certificate', 'other')),
  file_url TEXT,                                 -- Canopy-provided URL (temporary)
  file_name TEXT,
  mime_type TEXT,
  file_size INTEGER,
  downloaded BOOLEAN DEFAULT FALSE,
  storage_path TEXT,                             -- Supabase storage path after download
  storage_bucket TEXT DEFAULT 'canopy-documents',
  download_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  downloaded_at TIMESTAMPTZ
);

-- Claims history from Canopy
CREATE TABLE IF NOT EXISTS canopy_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES canopy_policies(id) ON DELETE CASCADE,
  claim_number TEXT,
  claim_date DATE,
  close_date DATE,
  claim_type TEXT,
  claim_category TEXT,
  status TEXT
    CHECK (status IN ('open', 'closed', 'pending', 'denied', 'unknown')),
  amount_paid NUMERIC(12,2),
  amount_reserved NUMERIC(12,2),
  deductible_applied NUMERIC(12,2),
  description TEXT,
  at_fault BOOLEAN,
  subrogation BOOLEAN DEFAULT FALSE,
  claimant_name TEXT,
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Data enrichment cache (VIN decodes, property data, etc.)
CREATE TABLE IF NOT EXISTS canopy_enrichment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('vehicle', 'property', 'driver', 'carrier')),
  entity_id UUID NOT NULL,
  enrichment_source TEXT NOT NULL,               -- nhtsa, zillow, lexisnexis, etc.
  enrichment_type TEXT,                          -- vin_decode, property_value, mvr, etc.
  enrichment_data JSONB DEFAULT '{}',
  confidence_score NUMERIC(3,2),                 -- 0.00 to 1.00
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  error_message TEXT
);

-- Webhook event log for debugging and replay
CREATE TABLE IF NOT EXISTS canopy_webhook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  pull_id TEXT,
  payload JSONB NOT NULL,
  headers JSONB DEFAULT '{}',
  signature TEXT,
  signature_valid BOOLEAN,
  processed BOOLEAN DEFAULT FALSE,
  processing_error TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- ============================================================================
-- 2. INDEXES FOR PERFORMANCE
-- ============================================================================

-- Pulls table indexes
CREATE INDEX IF NOT EXISTS idx_canopy_pulls_status ON canopy_pulls(status);
CREATE INDEX IF NOT EXISTS idx_canopy_pulls_lead ON canopy_pulls(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_canopy_pulls_account ON canopy_pulls(account_id) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_canopy_pulls_created ON canopy_pulls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_canopy_pulls_initiated_by ON canopy_pulls(initiated_by);

-- Policies table indexes
CREATE INDEX IF NOT EXISTS idx_canopy_policies_pull ON canopy_policies(pull_id);
CREATE INDEX IF NOT EXISTS idx_canopy_policies_type ON canopy_policies(policy_type);
CREATE INDEX IF NOT EXISTS idx_canopy_policies_carrier ON canopy_policies(carrier_name);
CREATE INDEX IF NOT EXISTS idx_canopy_policies_expiration ON canopy_policies(expiration_date)
  WHERE status = 'active';

-- Vehicles table indexes
CREATE INDEX IF NOT EXISTS idx_canopy_vehicles_policy ON canopy_vehicles(policy_id);
CREATE INDEX IF NOT EXISTS idx_canopy_vehicles_vin ON canopy_vehicles(vin) WHERE vin IS NOT NULL;

-- Drivers table indexes
CREATE INDEX IF NOT EXISTS idx_canopy_drivers_policy ON canopy_drivers(policy_id);
CREATE INDEX IF NOT EXISTS idx_canopy_drivers_license ON canopy_drivers(license_number, license_state)
  WHERE license_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_canopy_drivers_primary ON canopy_drivers(policy_id) WHERE is_primary = TRUE;

-- Dwellings table indexes
CREATE INDEX IF NOT EXISTS idx_canopy_dwellings_policy ON canopy_dwellings(policy_id);
CREATE INDEX IF NOT EXISTS idx_canopy_dwellings_zip ON canopy_dwellings(zip) WHERE zip IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_canopy_dwellings_address ON canopy_dwellings(address_line1, city, state);

-- Documents table indexes
CREATE INDEX IF NOT EXISTS idx_canopy_documents_policy ON canopy_documents(policy_id);
CREATE INDEX IF NOT EXISTS idx_canopy_documents_undownloaded ON canopy_documents(id)
  WHERE downloaded = FALSE AND file_url IS NOT NULL;

-- Claims table indexes
CREATE INDEX IF NOT EXISTS idx_canopy_claims_policy ON canopy_claims(policy_id);
CREATE INDEX IF NOT EXISTS idx_canopy_claims_date ON canopy_claims(claim_date DESC);

-- Enrichment table indexes
CREATE INDEX IF NOT EXISTS idx_canopy_enrichment_entity ON canopy_enrichment(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_canopy_enrichment_source ON canopy_enrichment(enrichment_source);
CREATE INDEX IF NOT EXISTS idx_canopy_enrichment_expiry ON canopy_enrichment(expires_at)
  WHERE expires_at IS NOT NULL;

-- Webhook log indexes
CREATE INDEX IF NOT EXISTS idx_canopy_webhook_event ON canopy_webhook_log(event_type);
CREATE INDEX IF NOT EXISTS idx_canopy_webhook_pull ON canopy_webhook_log(pull_id) WHERE pull_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_canopy_webhook_unprocessed ON canopy_webhook_log(received_at)
  WHERE processed = FALSE;

-- ============================================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE canopy_pulls ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_dwellings ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_enrichment ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_webhook_log ENABLE ROW LEVEL SECURITY;

-- Staff roles that can access Canopy data
CREATE OR REPLACE FUNCTION is_canopy_staff()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.role IN ('admin', 'staff', 'producer', 'csr', 'owner')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Pulls: Staff can see all pulls, or pulls they initiated
CREATE POLICY "Staff can view all canopy pulls" ON canopy_pulls
  FOR SELECT USING (is_canopy_staff());

CREATE POLICY "Staff can insert canopy pulls" ON canopy_pulls
  FOR INSERT WITH CHECK (is_canopy_staff());

CREATE POLICY "Staff can update canopy pulls" ON canopy_pulls
  FOR UPDATE USING (is_canopy_staff());

-- Policies: Access through pull relationship
CREATE POLICY "Staff can view canopy policies" ON canopy_policies
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM canopy_pulls cp
      WHERE cp.id = canopy_policies.pull_id
      AND is_canopy_staff()
    )
  );

CREATE POLICY "Service role can insert canopy policies" ON canopy_policies
  FOR INSERT WITH CHECK (TRUE);  -- Webhook handler uses service role

-- Vehicles: Access through policy relationship
CREATE POLICY "Staff can view canopy vehicles" ON canopy_vehicles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM canopy_policies pol
      JOIN canopy_pulls cp ON cp.id = pol.pull_id
      WHERE pol.id = canopy_vehicles.policy_id
      AND is_canopy_staff()
    )
  );

CREATE POLICY "Service role can insert canopy vehicles" ON canopy_vehicles
  FOR INSERT WITH CHECK (TRUE);

-- Drivers: Access through policy relationship
CREATE POLICY "Staff can view canopy drivers" ON canopy_drivers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM canopy_policies pol
      JOIN canopy_pulls cp ON cp.id = pol.pull_id
      WHERE pol.id = canopy_drivers.policy_id
      AND is_canopy_staff()
    )
  );

CREATE POLICY "Service role can insert canopy drivers" ON canopy_drivers
  FOR INSERT WITH CHECK (TRUE);

-- Dwellings: Access through policy relationship
CREATE POLICY "Staff can view canopy dwellings" ON canopy_dwellings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM canopy_policies pol
      JOIN canopy_pulls cp ON cp.id = pol.pull_id
      WHERE pol.id = canopy_dwellings.policy_id
      AND is_canopy_staff()
    )
  );

CREATE POLICY "Service role can insert canopy dwellings" ON canopy_dwellings
  FOR INSERT WITH CHECK (TRUE);

-- Documents: Access through policy relationship
CREATE POLICY "Staff can view canopy documents" ON canopy_documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM canopy_policies pol
      JOIN canopy_pulls cp ON cp.id = pol.pull_id
      WHERE pol.id = canopy_documents.policy_id
      AND is_canopy_staff()
    )
  );

CREATE POLICY "Service role can manage canopy documents" ON canopy_documents
  FOR ALL WITH CHECK (TRUE);

-- Claims: Access through policy relationship
CREATE POLICY "Staff can view canopy claims" ON canopy_claims
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM canopy_policies pol
      JOIN canopy_pulls cp ON cp.id = pol.pull_id
      WHERE pol.id = canopy_claims.policy_id
      AND is_canopy_staff()
    )
  );

CREATE POLICY "Service role can insert canopy claims" ON canopy_claims
  FOR INSERT WITH CHECK (TRUE);

-- Enrichment: Staff can view all enrichment data
CREATE POLICY "Staff can view canopy enrichment" ON canopy_enrichment
  FOR SELECT USING (is_canopy_staff());

CREATE POLICY "Service role can manage canopy enrichment" ON canopy_enrichment
  FOR ALL WITH CHECK (TRUE);

-- Webhook log: Admin only for viewing, service role for inserting
CREATE POLICY "Admin can view webhook log" ON canopy_webhook_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  );

CREATE POLICY "Service role can insert webhook log" ON canopy_webhook_log
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Service role can update webhook log" ON canopy_webhook_log
  FOR UPDATE WITH CHECK (TRUE);

-- ============================================================================
-- 4. HELPER FUNCTIONS
-- ============================================================================

-- Update updated_at on canopy_pulls
CREATE OR REPLACE FUNCTION update_canopy_pulls_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER canopy_pulls_updated_at
  BEFORE UPDATE ON canopy_pulls
  FOR EACH ROW
  EXECUTE FUNCTION update_canopy_pulls_updated_at();

-- Get pull summary statistics
CREATE OR REPLACE FUNCTION get_canopy_pull_summary(p_pull_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_summary JSONB;
BEGIN
  SELECT jsonb_build_object(
    'pull_id', cp.id,
    'status', cp.status,
    'policy_count', (SELECT COUNT(*) FROM canopy_policies WHERE pull_id = cp.id),
    'vehicle_count', (
      SELECT COUNT(*) FROM canopy_vehicles cv
      JOIN canopy_policies pol ON pol.id = cv.policy_id
      WHERE pol.pull_id = cp.id
    ),
    'driver_count', (
      SELECT COUNT(*) FROM canopy_drivers cd
      JOIN canopy_policies pol ON pol.id = cd.policy_id
      WHERE pol.pull_id = cp.id
    ),
    'dwelling_count', (
      SELECT COUNT(*) FROM canopy_dwellings dw
      JOIN canopy_policies pol ON pol.id = dw.policy_id
      WHERE pol.pull_id = cp.id
    ),
    'document_count', (
      SELECT COUNT(*) FROM canopy_documents doc
      JOIN canopy_policies pol ON pol.id = doc.policy_id
      WHERE pol.pull_id = cp.id
    ),
    'carriers', (
      SELECT jsonb_agg(DISTINCT carrier_name)
      FROM canopy_policies
      WHERE pull_id = cp.id
    ),
    'policy_types', (
      SELECT jsonb_agg(DISTINCT policy_type)
      FROM canopy_policies
      WHERE pull_id = cp.id
    ),
    'created_at', cp.created_at,
    'completed_at', cp.completed_at
  ) INTO v_summary
  FROM canopy_pulls cp
  WHERE cp.id = p_pull_id;

  RETURN v_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. ANALYTICS VIEW
-- ============================================================================

CREATE OR REPLACE VIEW canopy_analytics AS
SELECT
  DATE_TRUNC('day', cp.created_at) as date,
  COUNT(DISTINCT cp.id) as total_pulls,
  COUNT(DISTINCT CASE WHEN cp.status = 'complete' THEN cp.id END) as completed_pulls,
  COUNT(DISTINCT CASE WHEN cp.status = 'error' THEN cp.id END) as failed_pulls,
  COUNT(DISTINCT pol.id) as total_policies,
  COUNT(DISTINCT CASE WHEN pol.policy_type = 'auto' THEN pol.id END) as auto_policies,
  COUNT(DISTINCT CASE WHEN pol.policy_type IN ('home', 'renters', 'condo') THEN pol.id END) as property_policies,
  AVG(pol.premium_amount) as avg_premium,
  COUNT(DISTINCT cv.id) as total_vehicles,
  COUNT(DISTINCT cd.id) as total_drivers,
  COUNT(DISTINCT dw.id) as total_dwellings
FROM canopy_pulls cp
LEFT JOIN canopy_policies pol ON pol.pull_id = cp.id
LEFT JOIN canopy_vehicles cv ON cv.policy_id = pol.id
LEFT JOIN canopy_drivers cd ON cd.policy_id = pol.id
LEFT JOIN canopy_dwellings dw ON dw.policy_id = pol.id
GROUP BY 1
ORDER BY 1 DESC;

-- ============================================================================
-- 6. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE canopy_pulls IS 'Tracks each Canopy Connect data import session';
COMMENT ON TABLE canopy_policies IS 'Insurance policies extracted from Canopy pulls';
COMMENT ON TABLE canopy_vehicles IS 'Vehicles from auto insurance policies';
COMMENT ON TABLE canopy_drivers IS 'Drivers from auto insurance policies';
COMMENT ON TABLE canopy_dwellings IS 'Properties from home/renters/condo policies';
COMMENT ON TABLE canopy_documents IS 'Documents (ID cards, dec pages) from Canopy';
COMMENT ON TABLE canopy_claims IS 'Claims history from Canopy policies';
COMMENT ON TABLE canopy_enrichment IS 'Cached enrichment data (VIN decodes, property values)';
COMMENT ON TABLE canopy_webhook_log IS 'Log of all Canopy webhook events for debugging';

COMMENT ON FUNCTION is_canopy_staff IS 'Returns TRUE if current user has staff-level access to Canopy data';
COMMENT ON FUNCTION get_canopy_pull_summary IS 'Returns a summary of a Canopy pull including counts';
