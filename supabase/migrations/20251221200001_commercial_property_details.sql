-- =============================================================================
-- Commercial Property Policy Details Schema
-- =============================================================================
-- Complete schema for Commercial Property extraction with Azure Document Intelligence
-- evidence catalog support for click-to-highlight functionality.
-- =============================================================================

-- =============================================================================
-- PROPERTY LOCATIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_property_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,

  -- Location identity
  location_number INTEGER NOT NULL,
  street TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,

  -- Location details
  territory TEXT,
  county TEXT,
  protection_class TEXT,
  fire_district TEXT,
  fire_department TEXT,
  hydrant_distance_feet INTEGER,
  occupancy TEXT,

  -- Evidence tracking
  evidence_ids TEXT[] DEFAULT '{}',
  extraction_confidence NUMERIC(5, 4),
  extraction_status TEXT CHECK (extraction_status IN ('AUTO_APPLIED', 'NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'LOW_CONFIDENCE', 'NOT_FOUND', 'CONFLICT', 'MANUAL')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint
  UNIQUE(policy_id, location_number)
);

CREATE INDEX idx_property_locations_policy ON policy_property_locations(policy_id);
CREATE INDEX idx_property_locations_evidence ON policy_property_locations USING GIN (evidence_ids);

-- =============================================================================
-- PROPERTY BUILDINGS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_property_buildings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,

  -- Building identity
  building_number INTEGER NOT NULL,
  location_number INTEGER NOT NULL,
  description TEXT,

  -- Construction details
  construction_type TEXT CHECK (construction_type IN ('frame', 'joisted_masonry', 'noncombustible', 'masonry_noncombustible', 'modified_fire_resistive', 'fire_resistive')),
  iso_construction_class INTEGER,
  occupancy TEXT,
  year_built INTEGER,
  square_footage INTEGER,
  stories INTEGER,

  -- Roof details
  roof_type TEXT,
  roof_age INTEGER,
  roof_updated_year INTEGER,

  -- Renovations
  electrical_update_year INTEGER,
  plumbing_update_year INTEGER,
  hvac_update_year INTEGER,

  -- Safety systems
  has_sprinklers BOOLEAN,
  sprinkler_type TEXT CHECK (sprinkler_type IN ('wet', 'dry', 'deluge', 'preaction', 'partial')),
  has_burglar_alarm BOOLEAN,
  has_fire_alarm BOOLEAN,
  alarm_type TEXT CHECK (alarm_type IN ('local', 'central_station', 'proprietary')),

  -- Valuation
  valuation_basis TEXT CHECK (valuation_basis IN ('replacement_cost', 'actual_cash_value', 'functional_replacement', 'stated_amount', 'agreed_value')),
  coinsurance_percent INTEGER,
  is_agreed_value BOOLEAN DEFAULT false,
  agreed_value_expiration DATE,

  -- Evidence tracking
  evidence_ids TEXT[] DEFAULT '{}',
  extraction_confidence NUMERIC(5, 4),
  extraction_status TEXT CHECK (extraction_status IN ('AUTO_APPLIED', 'NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'LOW_CONFIDENCE', 'NOT_FOUND', 'CONFLICT', 'MANUAL')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint
  UNIQUE(policy_id, location_number, building_number)
);

CREATE INDEX idx_property_buildings_policy ON policy_property_buildings(policy_id);
CREATE INDEX idx_property_buildings_location ON policy_property_buildings(location_number);
CREATE INDEX idx_property_buildings_evidence ON policy_property_buildings USING GIN (evidence_ids);

-- =============================================================================
-- BUILDING COVERAGE LIMITS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_property_building_coverages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,

  -- Building reference
  building_number INTEGER NOT NULL,
  location_number INTEGER NOT NULL,

  -- Core limits
  building_limit NUMERIC(15, 2),
  bpp_limit NUMERIC(15, 2),
  tenant_improvements_limit NUMERIC(15, 2),
  stock_limit NUMERIC(15, 2),
  property_of_others_limit NUMERIC(15, 2),

  -- Additional limits
  outdoor_property_limit NUMERIC(15, 2),
  signs_limit NUMERIC(15, 2),
  valuable_papers_limit NUMERIC(15, 2),
  accounts_receivable_limit NUMERIC(15, 2),
  edp_equipment_limit NUMERIC(15, 2),
  edp_media_limit NUMERIC(15, 2),
  special_equipment_limit NUMERIC(15, 2),
  special_equipment_description TEXT,

  -- Evidence tracking
  evidence_ids TEXT[] DEFAULT '{}',
  extraction_confidence NUMERIC(5, 4),
  extraction_status TEXT CHECK (extraction_status IN ('AUTO_APPLIED', 'NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'LOW_CONFIDENCE', 'NOT_FOUND', 'CONFLICT', 'MANUAL')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint
  UNIQUE(policy_id, location_number, building_number)
);

CREATE INDEX idx_property_coverages_policy ON policy_property_building_coverages(policy_id);
CREATE INDEX idx_property_coverages_evidence ON policy_property_building_coverages USING GIN (evidence_ids);

-- =============================================================================
-- PROPERTY DEDUCTIBLES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_property_deductibles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,

  -- Deductible details
  name TEXT NOT NULL,
  peril TEXT NOT NULL CHECK (peril IN ('aop', 'wind_hail', 'named_storm', 'hurricane', 'flood', 'earthquake', 'water_damage', 'theft', 'vandalism', 'freeze')),
  amount NUMERIC(15, 2) NOT NULL,
  deductible_type TEXT NOT NULL CHECK (deductible_type IN ('flat', 'percentage_tiv', 'percentage_building', 'percentage_claim')),
  percentage NUMERIC(5, 2),
  applies_to TEXT CHECK (applies_to IN ('per_occurrence', 'per_building', 'per_location', 'policy', 'tiv')),
  state_conditions TEXT[],

  -- Evidence tracking
  evidence_ids TEXT[] DEFAULT '{}',
  extraction_confidence NUMERIC(5, 4),
  extraction_status TEXT CHECK (extraction_status IN ('AUTO_APPLIED', 'NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'LOW_CONFIDENCE', 'NOT_FOUND', 'CONFLICT', 'MANUAL')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_property_deductibles_policy ON policy_property_deductibles(policy_id);
CREATE INDEX idx_property_deductibles_peril ON policy_property_deductibles(peril);
CREATE INDEX idx_property_deductibles_evidence ON policy_property_deductibles USING GIN (evidence_ids);

-- =============================================================================
-- PROPERTY INTERESTS (MORTGAGEES/LOSS PAYEES)
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_property_interests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,

  -- Interest details
  interest_type TEXT NOT NULL CHECK (interest_type IN ('mortgagee', 'loss_payee', 'lenders_loss_payable', 'additional_insured', 'additional_interest')),
  name TEXT NOT NULL,
  street TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  loan_number TEXT,

  -- Property reference
  location_number INTEGER,
  building_number INTEGER,

  -- Evidence tracking
  evidence_ids TEXT[] DEFAULT '{}',
  extraction_confidence NUMERIC(5, 4),
  extraction_status TEXT CHECK (extraction_status IN ('AUTO_APPLIED', 'NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'LOW_CONFIDENCE', 'NOT_FOUND', 'CONFLICT', 'MANUAL')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_property_interests_policy ON policy_property_interests(policy_id);
CREATE INDEX idx_property_interests_type ON policy_property_interests(interest_type);
CREATE INDEX idx_property_interests_evidence ON policy_property_interests USING GIN (evidence_ids);

-- =============================================================================
-- PROPERTY ENDORSEMENTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_property_endorsements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,

  -- Endorsement details
  form_number TEXT NOT NULL,
  title TEXT NOT NULL,
  edition_date TEXT,
  effective_date DATE,
  category TEXT CHECK (category IN ('wind_hail', 'water_damage', 'ordinance_or_law', 'protective_safeguards', 'vacancy', 'margin_clause', 'coinsurance', 'acv', 'roof', 'flood_quake', 'named_storm', 'other')),
  is_limitation BOOLEAN DEFAULT false,
  premium_impact NUMERIC(15, 2),

  -- Property reference
  location_number INTEGER,
  building_number INTEGER,

  -- Evidence tracking
  evidence_ids TEXT[] DEFAULT '{}',
  extraction_confidence NUMERIC(5, 4),
  extraction_status TEXT CHECK (extraction_status IN ('AUTO_APPLIED', 'NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'LOW_CONFIDENCE', 'NOT_FOUND', 'CONFLICT', 'MANUAL')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_property_endorsements_policy ON policy_property_endorsements(policy_id);
CREATE INDEX idx_property_endorsements_category ON policy_property_endorsements(category);
CREATE INDEX idx_property_endorsements_evidence ON policy_property_endorsements USING GIN (evidence_ids);

-- =============================================================================
-- PROPERTY EVIDENCE CATALOG TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_property_evidence_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,

  -- Evidence entries
  evidence_entries JSONB NOT NULL DEFAULT '{}',
  evidence_by_field JSONB NOT NULL DEFAULT '{}',

  -- Structured evidence
  location_evidence JSONB NOT NULL DEFAULT '[]',
  building_evidence JSONB NOT NULL DEFAULT '[]',
  coverage_evidence JSONB NOT NULL DEFAULT '[]',
  deductible_evidence JSONB NOT NULL DEFAULT '[]',

  -- Azure DI metadata
  azure_raw_response JSONB,
  azure_model_id TEXT DEFAULT 'prebuilt-document',
  azure_processing_time_ms INTEGER,
  azure_page_count INTEGER,
  azure_avg_confidence NUMERIC(5, 4),

  -- Statistics
  total_entries INTEGER DEFAULT 0,
  entries_by_source_type JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_property_evidence_policy ON policy_property_evidence_catalog(policy_id);
CREATE INDEX idx_property_evidence_document ON policy_property_evidence_catalog(document_id);
CREATE INDEX idx_property_evidence_entries ON policy_property_evidence_catalog USING GIN (evidence_entries);

-- =============================================================================
-- PROPERTY EXTRACTION JOBS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_property_extraction_jobs (
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

  -- LLM details
  llm_model TEXT DEFAULT 'claude-sonnet-4-20250514',
  llm_tokens_input INTEGER,
  llm_tokens_output INTEGER,
  llm_latency_ms INTEGER,

  -- Results summary
  fields_extracted INTEGER DEFAULT 0,
  fields_auto_applied INTEGER DEFAULT 0,
  fields_needs_review INTEGER DEFAULT 0,
  fields_not_found INTEGER DEFAULT 0,
  fields_conflict INTEGER DEFAULT 0,

  locations_extracted INTEGER DEFAULT 0,
  buildings_extracted INTEGER DEFAULT 0,
  deductibles_extracted INTEGER DEFAULT 0,
  endorsements_extracted INTEGER DEFAULT 0,

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

CREATE INDEX idx_property_extraction_jobs_policy ON policy_property_extraction_jobs(policy_id);
CREATE INDEX idx_property_extraction_jobs_status ON policy_property_extraction_jobs(status);
CREATE INDEX idx_property_extraction_jobs_created ON policy_property_extraction_jobs(created_at DESC);

-- =============================================================================
-- ADD PROPERTY DETAILS COLUMNS TO POLICIES TABLE
-- =============================================================================

ALTER TABLE policies
  ADD COLUMN IF NOT EXISTS property_details JSONB DEFAULT '{}';

ALTER TABLE policies
  ADD COLUMN IF NOT EXISTS property_field_evidence JSONB DEFAULT '{}';

COMMENT ON COLUMN policies.property_details IS 'Complete Commercial Property policy details including valuation, BI, O&L, deductibles, safeguards';
COMMENT ON COLUMN policies.property_field_evidence IS 'Maps Property field names to evidence IDs for click-to-highlight';

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- Property Locations
ALTER TABLE policy_property_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view property locations for accessible policies"
  ON policy_property_locations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_locations.policy_id));

CREATE POLICY "Users can insert property locations for accessible policies"
  ON policy_property_locations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_locations.policy_id));

CREATE POLICY "Users can update property locations for accessible policies"
  ON policy_property_locations FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_locations.policy_id))
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_locations.policy_id));

CREATE POLICY "Users can delete property locations for accessible policies"
  ON policy_property_locations FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_locations.policy_id));

-- Property Buildings
ALTER TABLE policy_property_buildings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view property buildings for accessible policies"
  ON policy_property_buildings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_buildings.policy_id));

CREATE POLICY "Users can insert property buildings for accessible policies"
  ON policy_property_buildings FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_buildings.policy_id));

CREATE POLICY "Users can update property buildings for accessible policies"
  ON policy_property_buildings FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_buildings.policy_id))
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_buildings.policy_id));

CREATE POLICY "Users can delete property buildings for accessible policies"
  ON policy_property_buildings FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_buildings.policy_id));

-- Property Building Coverages
ALTER TABLE policy_property_building_coverages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view property coverages for accessible policies"
  ON policy_property_building_coverages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_building_coverages.policy_id));

CREATE POLICY "Users can insert property coverages for accessible policies"
  ON policy_property_building_coverages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_building_coverages.policy_id));

CREATE POLICY "Users can update property coverages for accessible policies"
  ON policy_property_building_coverages FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_building_coverages.policy_id))
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_building_coverages.policy_id));

CREATE POLICY "Users can delete property coverages for accessible policies"
  ON policy_property_building_coverages FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_building_coverages.policy_id));

-- Property Deductibles
ALTER TABLE policy_property_deductibles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view property deductibles for accessible policies"
  ON policy_property_deductibles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_deductibles.policy_id));

CREATE POLICY "Users can insert property deductibles for accessible policies"
  ON policy_property_deductibles FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_deductibles.policy_id));

CREATE POLICY "Users can update property deductibles for accessible policies"
  ON policy_property_deductibles FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_deductibles.policy_id))
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_deductibles.policy_id));

CREATE POLICY "Users can delete property deductibles for accessible policies"
  ON policy_property_deductibles FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_deductibles.policy_id));

-- Property Interests
ALTER TABLE policy_property_interests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view property interests for accessible policies"
  ON policy_property_interests FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_interests.policy_id));

CREATE POLICY "Users can insert property interests for accessible policies"
  ON policy_property_interests FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_interests.policy_id));

CREATE POLICY "Users can update property interests for accessible policies"
  ON policy_property_interests FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_interests.policy_id))
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_interests.policy_id));

CREATE POLICY "Users can delete property interests for accessible policies"
  ON policy_property_interests FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_interests.policy_id));

-- Property Endorsements
ALTER TABLE policy_property_endorsements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view property endorsements for accessible policies"
  ON policy_property_endorsements FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_endorsements.policy_id));

CREATE POLICY "Users can insert property endorsements for accessible policies"
  ON policy_property_endorsements FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_endorsements.policy_id));

CREATE POLICY "Users can update property endorsements for accessible policies"
  ON policy_property_endorsements FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_endorsements.policy_id))
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_endorsements.policy_id));

CREATE POLICY "Users can delete property endorsements for accessible policies"
  ON policy_property_endorsements FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_endorsements.policy_id));

-- Property Evidence Catalog
ALTER TABLE policy_property_evidence_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view property evidence for accessible policies"
  ON policy_property_evidence_catalog FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_evidence_catalog.policy_id));

CREATE POLICY "Users can insert property evidence for accessible policies"
  ON policy_property_evidence_catalog FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_evidence_catalog.policy_id));

CREATE POLICY "Users can update property evidence for accessible policies"
  ON policy_property_evidence_catalog FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_evidence_catalog.policy_id))
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_evidence_catalog.policy_id));

CREATE POLICY "Users can delete property evidence for accessible policies"
  ON policy_property_evidence_catalog FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_evidence_catalog.policy_id));

-- Property Extraction Jobs
ALTER TABLE policy_property_extraction_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view property extraction jobs for accessible policies"
  ON policy_property_extraction_jobs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_extraction_jobs.policy_id));

CREATE POLICY "Users can insert property extraction jobs"
  ON policy_property_extraction_jobs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_property_extraction_jobs.policy_id));

CREATE POLICY "Service role full access to property extraction jobs"
  ON policy_property_extraction_jobs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- UPDATE TIMESTAMP TRIGGERS
-- =============================================================================

CREATE OR REPLACE FUNCTION update_property_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_property_locations_updated
  BEFORE UPDATE ON policy_property_locations
  FOR EACH ROW EXECUTE FUNCTION update_property_updated_at();

CREATE TRIGGER trigger_property_buildings_updated
  BEFORE UPDATE ON policy_property_buildings
  FOR EACH ROW EXECUTE FUNCTION update_property_updated_at();

CREATE TRIGGER trigger_property_coverages_updated
  BEFORE UPDATE ON policy_property_building_coverages
  FOR EACH ROW EXECUTE FUNCTION update_property_updated_at();

CREATE TRIGGER trigger_property_deductibles_updated
  BEFORE UPDATE ON policy_property_deductibles
  FOR EACH ROW EXECUTE FUNCTION update_property_updated_at();

CREATE TRIGGER trigger_property_interests_updated
  BEFORE UPDATE ON policy_property_interests
  FOR EACH ROW EXECUTE FUNCTION update_property_updated_at();

CREATE TRIGGER trigger_property_endorsements_updated
  BEFORE UPDATE ON policy_property_endorsements
  FOR EACH ROW EXECUTE FUNCTION update_property_updated_at();

CREATE TRIGGER trigger_property_evidence_updated
  BEFORE UPDATE ON policy_property_evidence_catalog
  FOR EACH ROW EXECUTE FUNCTION update_property_updated_at();

CREATE TRIGGER trigger_property_extraction_jobs_updated
  BEFORE UPDATE ON policy_property_extraction_jobs
  FOR EACH ROW EXECUTE FUNCTION update_property_updated_at();
