-- =============================================================================
-- Commercial Auto / Business Auto Policy Details
-- =============================================================================
-- Comprehensive BAP (Business Auto Policy) data storage including:
-- - Policy identity and dates
-- - Coverage forms with symbols
-- - Vehicle schedule
-- - Driver schedule
-- - Additional insureds/loss payees
-- - Premium breakdown
-- =============================================================================

-- Add bap_details JSONB column to policies
ALTER TABLE policies
  ADD COLUMN IF NOT EXISTS bap_details JSONB,
  ADD COLUMN IF NOT EXISTS bap_field_evidence JSONB DEFAULT '{}';

COMMENT ON COLUMN policies.bap_details IS 'Commercial Auto/BAP policy details including coverage, vehicles, drivers';
COMMENT ON COLUMN policies.bap_field_evidence IS 'Maps BAP field names to evidence IDs for click-to-highlight';

-- =============================================================================
-- VEHICLE SCHEDULE TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_bap_vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,

  -- Vehicle identification
  unit_number TEXT,
  vin TEXT NOT NULL,
  year INTEGER NOT NULL,
  make TEXT NOT NULL,
  model TEXT NOT NULL,

  -- Classification
  body_type TEXT,
  gvw INTEGER, -- Gross vehicle weight
  vehicle_class TEXT,
  use_type TEXT CHECK (use_type IN ('service', 'retail', 'artisan', 'trucking', 'commercial', 'pleasure')),

  -- Garaging
  garaging_zip TEXT,
  garaging_state TEXT,

  -- Valuation
  cost_new NUMERIC(12, 2),
  stated_amount NUMERIC(12, 2),
  actual_cash_value NUMERIC(12, 2),

  -- Physical damage deductibles
  comprehensive_deductible NUMERIC(10, 2),
  collision_deductible NUMERIC(10, 2),

  -- Special equipment
  special_equipment_coverage NUMERIC(10, 2),

  -- Driver assignment
  primary_driver_name TEXT,

  -- Vehicle-level endorsements
  endorsements TEXT[],

  -- Evidence tracking
  evidence_ids TEXT[] DEFAULT '{}',
  extraction_confidence NUMERIC(5, 4),
  extraction_status TEXT CHECK (extraction_status IN ('AUTO_APPLIED', 'NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'LOW_CONFIDENCE', 'NOT_FOUND', 'CONFLICT', 'MANUAL')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_bap_vehicles_policy ON policy_bap_vehicles(policy_id);
CREATE INDEX idx_bap_vehicles_vin ON policy_bap_vehicles(vin);
CREATE INDEX idx_bap_vehicles_unit ON policy_bap_vehicles(unit_number);
CREATE INDEX idx_bap_vehicles_state ON policy_bap_vehicles(garaging_state);

-- Unique constraint on policy + VIN
CREATE UNIQUE INDEX idx_bap_vehicles_policy_vin ON policy_bap_vehicles(policy_id, vin);

-- RLS for vehicles
ALTER TABLE policy_bap_vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view vehicles for accessible policies"
  ON policy_bap_vehicles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_bap_vehicles.policy_id));

CREATE POLICY "Users can insert vehicles for accessible policies"
  ON policy_bap_vehicles FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_bap_vehicles.policy_id));

CREATE POLICY "Users can update vehicles for accessible policies"
  ON policy_bap_vehicles FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_bap_vehicles.policy_id))
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_bap_vehicles.policy_id));

CREATE POLICY "Users can delete vehicles for accessible policies"
  ON policy_bap_vehicles FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_bap_vehicles.policy_id));

-- =============================================================================
-- DRIVER SCHEDULE TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_bap_drivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,

  -- Driver info
  name TEXT NOT NULL,
  date_of_birth DATE,
  license_number TEXT, -- Often suppressed for privacy
  license_state TEXT,
  relationship TEXT CHECK (relationship IN ('employee', 'owner', 'family', 'other')),
  driver_type TEXT CHECK (driver_type IN ('rated', 'excluded', 'occasional')),

  -- MVR info
  violations_points INTEGER,
  accidents_count INTEGER,
  mvr_status TEXT CHECK (mvr_status IN ('clean', 'minor', 'major')),
  sr22_required BOOLEAN DEFAULT FALSE,

  -- Evidence tracking
  evidence_ids TEXT[] DEFAULT '{}',
  extraction_confidence NUMERIC(5, 4),
  extraction_status TEXT CHECK (extraction_status IN ('AUTO_APPLIED', 'NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'LOW_CONFIDENCE', 'NOT_FOUND', 'CONFLICT', 'MANUAL')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_bap_drivers_policy ON policy_bap_drivers(policy_id);
CREATE INDEX idx_bap_drivers_name ON policy_bap_drivers(name);
CREATE INDEX idx_bap_drivers_type ON policy_bap_drivers(driver_type);

-- RLS for drivers
ALTER TABLE policy_bap_drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view drivers for accessible policies"
  ON policy_bap_drivers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_bap_drivers.policy_id));

CREATE POLICY "Users can insert drivers for accessible policies"
  ON policy_bap_drivers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_bap_drivers.policy_id));

CREATE POLICY "Users can update drivers for accessible policies"
  ON policy_bap_drivers FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_bap_drivers.policy_id))
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_bap_drivers.policy_id));

CREATE POLICY "Users can delete drivers for accessible policies"
  ON policy_bap_drivers FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_bap_drivers.policy_id));

-- =============================================================================
-- ADDITIONAL INTERESTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_bap_interests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,

  -- Interest info
  name TEXT NOT NULL,
  address_street TEXT,
  address_city TEXT,
  address_state TEXT,
  address_zip TEXT,
  relationship TEXT,

  -- Coverage type
  interest_type TEXT NOT NULL CHECK (interest_type IN ('additional_insured', 'loss_payee', 'lienholder', 'lessor', 'additional_interest')),

  -- Vehicle links
  vehicle_vins TEXT[],
  vehicle_unit_numbers TEXT[],

  -- Evidence tracking
  evidence_ids TEXT[] DEFAULT '{}',
  extraction_confidence NUMERIC(5, 4),
  extraction_status TEXT CHECK (extraction_status IN ('AUTO_APPLIED', 'NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'LOW_CONFIDENCE', 'NOT_FOUND', 'CONFLICT', 'MANUAL')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_bap_interests_policy ON policy_bap_interests(policy_id);
CREATE INDEX idx_bap_interests_type ON policy_bap_interests(interest_type);
CREATE INDEX idx_bap_interests_vins ON policy_bap_interests USING GIN (vehicle_vins);

-- RLS for interests
ALTER TABLE policy_bap_interests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view interests for accessible policies"
  ON policy_bap_interests FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_bap_interests.policy_id));

CREATE POLICY "Users can insert interests for accessible policies"
  ON policy_bap_interests FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_bap_interests.policy_id));

CREATE POLICY "Users can update interests for accessible policies"
  ON policy_bap_interests FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_bap_interests.policy_id))
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_bap_interests.policy_id));

CREATE POLICY "Users can delete interests for accessible policies"
  ON policy_bap_interests FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_bap_interests.policy_id));

-- =============================================================================
-- COVERAGE DETAILS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_bap_coverages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,

  -- Coverage identification
  coverage_name TEXT NOT NULL,
  coverage_type TEXT NOT NULL CHECK (coverage_type IN (
    'liability', 'comprehensive', 'collision', 'medical_payments',
    'um', 'uim', 'pip', 'hired_auto', 'non_owned_auto',
    'towing_labor', 'rental_reimbursement', 'gap', 'other'
  )),

  -- Symbols
  symbols TEXT[] NOT NULL DEFAULT '{}',

  -- Limits
  limit_amount NUMERIC(12, 2),
  limit_type TEXT CHECK (limit_type IN ('csl', 'split', 'per_accident', 'per_person', 'per_day', 'per_occurrence')),

  -- Split limits (if applicable)
  bi_per_person NUMERIC(12, 2),
  bi_per_accident NUMERIC(12, 2),
  pd_per_accident NUMERIC(12, 2),

  -- Deductible
  deductible NUMERIC(10, 2),

  -- Options
  is_stacked BOOLEAN,
  is_rejected BOOLEAN,
  rejection_date DATE,
  state_specific TEXT, -- State-specific notes

  -- Evidence tracking
  evidence_ids TEXT[] DEFAULT '{}',
  extraction_confidence NUMERIC(5, 4),
  extraction_status TEXT CHECK (extraction_status IN ('AUTO_APPLIED', 'NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'LOW_CONFIDENCE', 'NOT_FOUND', 'CONFLICT', 'MANUAL')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_bap_coverages_policy ON policy_bap_coverages(policy_id);
CREATE INDEX idx_bap_coverages_type ON policy_bap_coverages(coverage_type);
CREATE INDEX idx_bap_coverages_symbols ON policy_bap_coverages USING GIN (symbols);

-- Unique constraint on policy + coverage type
CREATE UNIQUE INDEX idx_bap_coverages_policy_type ON policy_bap_coverages(policy_id, coverage_type);

-- RLS for coverages
ALTER TABLE policy_bap_coverages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view coverages for accessible policies"
  ON policy_bap_coverages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_bap_coverages.policy_id));

CREATE POLICY "Users can insert coverages for accessible policies"
  ON policy_bap_coverages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_bap_coverages.policy_id));

CREATE POLICY "Users can update coverages for accessible policies"
  ON policy_bap_coverages FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_bap_coverages.policy_id))
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_bap_coverages.policy_id));

CREATE POLICY "Users can delete coverages for accessible policies"
  ON policy_bap_coverages FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_bap_coverages.policy_id));

-- =============================================================================
-- EVIDENCE CATALOG FOR BAP
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_bap_evidence_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,

  -- Evidence entries
  evidence_entries JSONB NOT NULL DEFAULT '{}',
  evidence_by_field JSONB NOT NULL DEFAULT '{}',

  -- Vehicle table evidence
  vehicle_evidence JSONB NOT NULL DEFAULT '[]',

  -- Driver table evidence
  driver_evidence JSONB NOT NULL DEFAULT '[]',

  -- Coverage evidence
  coverage_evidence JSONB NOT NULL DEFAULT '[]',

  -- Azure DI metadata
  azure_raw_response JSONB,
  azure_model_id TEXT DEFAULT 'prebuilt-document',
  azure_processing_time_ms INTEGER,
  azure_page_count INTEGER,
  azure_avg_confidence NUMERIC(5, 4),

  -- Statistics
  total_entries INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bap_evidence_policy ON policy_bap_evidence_catalog(policy_id);
CREATE INDEX idx_bap_evidence_entries ON policy_bap_evidence_catalog USING GIN (evidence_entries);

-- RLS for evidence catalog
ALTER TABLE policy_bap_evidence_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view evidence for accessible policies"
  ON policy_bap_evidence_catalog FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_bap_evidence_catalog.policy_id));

CREATE POLICY "Users can insert evidence for accessible policies"
  ON policy_bap_evidence_catalog FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_bap_evidence_catalog.policy_id));

CREATE POLICY "Users can update evidence for accessible policies"
  ON policy_bap_evidence_catalog FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_bap_evidence_catalog.policy_id))
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_bap_evidence_catalog.policy_id));

-- =============================================================================
-- EXTRACTION JOB TRACKING FOR BAP
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_bap_extraction_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,

  -- Job status
  status TEXT NOT NULL CHECK (status IN ('pending', 'ocr_processing', 'extracting', 'completed', 'failed')) DEFAULT 'pending',

  -- Processing stages
  ocr_started_at TIMESTAMPTZ,
  ocr_completed_at TIMESTAMPTZ,
  extraction_started_at TIMESTAMPTZ,
  extraction_completed_at TIMESTAMPTZ,

  -- Azure DI details
  azure_operation_id TEXT,
  azure_model_id TEXT DEFAULT 'prebuilt-document',
  azure_processing_time_ms INTEGER,

  -- LLM extraction details
  llm_model TEXT DEFAULT 'claude-sonnet-4-20250514',
  llm_tokens_input INTEGER,
  llm_tokens_output INTEGER,
  llm_latency_ms INTEGER,

  -- Results summary
  vehicles_extracted INTEGER DEFAULT 0,
  drivers_extracted INTEGER DEFAULT 0,
  coverages_extracted INTEGER DEFAULT 0,
  interests_extracted INTEGER DEFAULT 0,
  overall_confidence NUMERIC(5, 4),

  -- Error handling
  error_message TEXT,
  error_details JSONB,
  retry_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_bap_extraction_jobs_policy ON policy_bap_extraction_jobs(policy_id);
CREATE INDEX idx_bap_extraction_jobs_status ON policy_bap_extraction_jobs(status);
CREATE INDEX idx_bap_extraction_jobs_created ON policy_bap_extraction_jobs(created_at DESC);

-- RLS for extraction jobs
ALTER TABLE policy_bap_extraction_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view extraction jobs for accessible policies"
  ON policy_bap_extraction_jobs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_bap_extraction_jobs.policy_id));

CREATE POLICY "Users can insert extraction jobs"
  ON policy_bap_extraction_jobs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_bap_extraction_jobs.policy_id));

CREATE POLICY "Service role full access to extraction jobs"
  ON policy_bap_extraction_jobs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- UPDATED TIMESTAMP TRIGGERS
-- =============================================================================

CREATE OR REPLACE FUNCTION update_bap_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_bap_vehicles_updated
  BEFORE UPDATE ON policy_bap_vehicles
  FOR EACH ROW EXECUTE FUNCTION update_bap_updated_at();

CREATE TRIGGER trigger_bap_drivers_updated
  BEFORE UPDATE ON policy_bap_drivers
  FOR EACH ROW EXECUTE FUNCTION update_bap_updated_at();

CREATE TRIGGER trigger_bap_interests_updated
  BEFORE UPDATE ON policy_bap_interests
  FOR EACH ROW EXECUTE FUNCTION update_bap_updated_at();

CREATE TRIGGER trigger_bap_coverages_updated
  BEFORE UPDATE ON policy_bap_coverages
  FOR EACH ROW EXECUTE FUNCTION update_bap_updated_at();

CREATE TRIGGER trigger_bap_evidence_updated
  BEFORE UPDATE ON policy_bap_evidence_catalog
  FOR EACH ROW EXECUTE FUNCTION update_bap_updated_at();

CREATE TRIGGER trigger_bap_extraction_jobs_updated
  BEFORE UPDATE ON policy_bap_extraction_jobs
  FOR EACH ROW EXECUTE FUNCTION update_bap_updated_at();

-- =============================================================================
-- GIN INDEXES FOR EVIDENCE ARRAY LOOKUPS
-- =============================================================================

CREATE INDEX idx_bap_vehicles_evidence ON policy_bap_vehicles USING GIN (evidence_ids);
CREATE INDEX idx_bap_drivers_evidence ON policy_bap_drivers USING GIN (evidence_ids);
CREATE INDEX idx_bap_interests_evidence ON policy_bap_interests USING GIN (evidence_ids);
CREATE INDEX idx_bap_coverages_evidence ON policy_bap_coverages USING GIN (evidence_ids);
