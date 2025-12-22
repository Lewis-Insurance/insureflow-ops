-- =============================================================================
-- Commercial General Liability (CGL) Policy Details Schema
-- =============================================================================
-- Complete schema for CGL extraction with Azure Document Intelligence
-- evidence catalog support for click-to-highlight functionality.
-- =============================================================================

-- =============================================================================
-- CGL LOCATIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_cgl_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,

  -- Location identity
  location_number INTEGER NOT NULL,
  street TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,

  -- Location details
  description TEXT,
  territory TEXT,
  county TEXT,
  building_type TEXT CHECK (building_type IN ('owned', 'leased', 'rented')),
  square_footage INTEGER,
  year_built INTEGER,
  construction_type TEXT,
  is_primary BOOLEAN DEFAULT false,

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

CREATE INDEX idx_cgl_locations_policy ON policy_cgl_locations(policy_id);
CREATE INDEX idx_cgl_locations_evidence ON policy_cgl_locations USING GIN (evidence_ids);

-- =============================================================================
-- CGL CLASSIFICATIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_cgl_classifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,

  -- Classification identity
  class_code TEXT,
  description TEXT NOT NULL,

  -- Exposure/rating
  exposure_basis TEXT CHECK (exposure_basis IN ('sales', 'payroll', 'area', 'units', 'admissions', 'per_project', 'flat', 'other')),
  exposure_amount NUMERIC(15, 2),
  rate NUMERIC(10, 4),
  premium NUMERIC(15, 2),

  -- Products/Completed Ops flag
  is_products_completed_ops BOOLEAN DEFAULT false,

  -- Link to location
  location_number INTEGER,

  -- Subcontractor info
  subcontractor_costs_included BOOLEAN,
  percent_subcontracted NUMERIC(5, 2),

  -- Evidence tracking
  evidence_ids TEXT[] DEFAULT '{}',
  extraction_confidence NUMERIC(5, 4),
  extraction_status TEXT CHECK (extraction_status IN ('AUTO_APPLIED', 'NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'LOW_CONFIDENCE', 'NOT_FOUND', 'CONFLICT', 'MANUAL')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cgl_classifications_policy ON policy_cgl_classifications(policy_id);
CREATE INDEX idx_cgl_classifications_code ON policy_cgl_classifications(class_code);
CREATE INDEX idx_cgl_classifications_location ON policy_cgl_classifications(location_number);
CREATE INDEX idx_cgl_classifications_evidence ON policy_cgl_classifications USING GIN (evidence_ids);

-- =============================================================================
-- CGL ADDITIONAL INSUREDS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_cgl_additional_insureds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,

  -- AI identity
  name TEXT NOT NULL,
  street TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,

  -- AI type and coverage
  ai_type TEXT NOT NULL CHECK (ai_type IN (
    'ongoing_ops', 'completed_ops', 'both',
    'owners_lessees_contractors', 'managers_lessors',
    'vendors', 'co_owner', 'designated_person', 'other'
  )),
  primary_noncontributory BOOLEAN DEFAULT false,
  waiver_of_subrogation BOOLEAN DEFAULT false,

  -- Applicability
  per_project BOOLEAN DEFAULT false,
  per_location BOOLEAN DEFAULT false,
  project_name TEXT,
  location_number INTEGER,

  -- Dates
  effective_date DATE,
  expiration_date DATE,

  -- Endorsement reference
  endorsement_form TEXT,

  -- Evidence tracking
  evidence_ids TEXT[] DEFAULT '{}',
  extraction_confidence NUMERIC(5, 4),
  extraction_status TEXT CHECK (extraction_status IN ('AUTO_APPLIED', 'NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'LOW_CONFIDENCE', 'NOT_FOUND', 'CONFLICT', 'MANUAL')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cgl_ai_policy ON policy_cgl_additional_insureds(policy_id);
CREATE INDEX idx_cgl_ai_name ON policy_cgl_additional_insureds(name);
CREATE INDEX idx_cgl_ai_type ON policy_cgl_additional_insureds(ai_type);
CREATE INDEX idx_cgl_ai_evidence ON policy_cgl_additional_insureds USING GIN (evidence_ids);

-- =============================================================================
-- CGL ADDITIONAL INTERESTS TABLE (Mortgagees, Loss Payees)
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_cgl_additional_interests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,

  -- Interest identity
  name TEXT NOT NULL,
  street TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,

  -- Interest type
  interest_type TEXT NOT NULL CHECK (interest_type IN (
    'mortgagee', 'loss_payee', 'additional_interest', 'certificate_holder'
  )),

  -- Reference info
  reference_number TEXT,
  location_number INTEGER,

  -- Evidence tracking
  evidence_ids TEXT[] DEFAULT '{}',
  extraction_confidence NUMERIC(5, 4),
  extraction_status TEXT CHECK (extraction_status IN ('AUTO_APPLIED', 'NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'LOW_CONFIDENCE', 'NOT_FOUND', 'CONFLICT', 'MANUAL')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cgl_interests_policy ON policy_cgl_additional_interests(policy_id);
CREATE INDEX idx_cgl_interests_type ON policy_cgl_additional_interests(interest_type);
CREATE INDEX idx_cgl_interests_evidence ON policy_cgl_additional_interests USING GIN (evidence_ids);

-- =============================================================================
-- CGL ENDORSEMENTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_cgl_endorsements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,

  -- Endorsement identity
  form_number TEXT NOT NULL,
  edition_date TEXT,
  description TEXT NOT NULL,

  -- Premium impact
  premium_impact NUMERIC(15, 2),

  -- Relationships
  location_number INTEGER,
  additional_insured_name TEXT,

  -- Evidence tracking
  evidence_ids TEXT[] DEFAULT '{}',
  extraction_confidence NUMERIC(5, 4),
  extraction_status TEXT CHECK (extraction_status IN ('AUTO_APPLIED', 'NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'LOW_CONFIDENCE', 'NOT_FOUND', 'CONFLICT', 'MANUAL')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cgl_endorsements_policy ON policy_cgl_endorsements(policy_id);
CREATE INDEX idx_cgl_endorsements_form ON policy_cgl_endorsements(form_number);
CREATE INDEX idx_cgl_endorsements_evidence ON policy_cgl_endorsements USING GIN (evidence_ids);

-- =============================================================================
-- CGL EVIDENCE CATALOG TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_cgl_evidence_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,

  -- Evidence entries (indexed by evidence ID)
  evidence_entries JSONB NOT NULL DEFAULT '{}',

  -- Evidence indexed by CGL field name
  evidence_by_field JSONB NOT NULL DEFAULT '{}',

  -- Classification table evidence (parsed)
  classification_evidence JSONB NOT NULL DEFAULT '[]',

  -- Location table evidence (parsed)
  location_evidence JSONB NOT NULL DEFAULT '[]',

  -- Additional insured table evidence (parsed)
  additional_insured_evidence JSONB NOT NULL DEFAULT '[]',

  -- Limits evidence
  limits_evidence JSONB NOT NULL DEFAULT '[]',

  -- Azure DI raw response (optional, for debugging)
  azure_raw_response JSONB,

  -- Azure processing metadata
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

CREATE INDEX idx_cgl_evidence_policy ON policy_cgl_evidence_catalog(policy_id);
CREATE INDEX idx_cgl_evidence_document ON policy_cgl_evidence_catalog(document_id);
CREATE INDEX idx_cgl_evidence_entries ON policy_cgl_evidence_catalog USING GIN (evidence_entries);
CREATE INDEX idx_cgl_evidence_by_field ON policy_cgl_evidence_catalog USING GIN (evidence_by_field);

-- =============================================================================
-- CGL EXTRACTION JOBS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_cgl_extraction_jobs (
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

  -- LLM extraction details
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
  classifications_extracted INTEGER DEFAULT 0,
  additional_insureds_extracted INTEGER DEFAULT 0,
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

CREATE INDEX idx_cgl_extraction_jobs_policy ON policy_cgl_extraction_jobs(policy_id);
CREATE INDEX idx_cgl_extraction_jobs_status ON policy_cgl_extraction_jobs(status);
CREATE INDEX idx_cgl_extraction_jobs_created ON policy_cgl_extraction_jobs(created_at DESC);

-- =============================================================================
-- ADD CGL DETAILS COLUMN TO POLICIES TABLE
-- =============================================================================

ALTER TABLE policies
  ADD COLUMN IF NOT EXISTS cgl_details JSONB DEFAULT '{}';

ALTER TABLE policies
  ADD COLUMN IF NOT EXISTS cgl_field_evidence JSONB DEFAULT '{}';

COMMENT ON COLUMN policies.cgl_details IS 'Complete CGL policy details including limits, deductibles, coverage options, and rating modifiers';
COMMENT ON COLUMN policies.cgl_field_evidence IS 'Maps CGL field names to their evidence IDs for click-to-highlight, e.g., {"each_occurrence": ["E0001"], "general_aggregate": ["E0002"]}';

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- CGL Locations
ALTER TABLE policy_cgl_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view locations for accessible policies"
  ON policy_cgl_locations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_locations.policy_id));

CREATE POLICY "Users can insert locations for accessible policies"
  ON policy_cgl_locations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_locations.policy_id));

CREATE POLICY "Users can update locations for accessible policies"
  ON policy_cgl_locations FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_locations.policy_id))
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_locations.policy_id));

CREATE POLICY "Users can delete locations for accessible policies"
  ON policy_cgl_locations FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_locations.policy_id));

-- CGL Classifications
ALTER TABLE policy_cgl_classifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view classifications for accessible policies"
  ON policy_cgl_classifications FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_classifications.policy_id));

CREATE POLICY "Users can insert classifications for accessible policies"
  ON policy_cgl_classifications FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_classifications.policy_id));

CREATE POLICY "Users can update classifications for accessible policies"
  ON policy_cgl_classifications FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_classifications.policy_id))
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_classifications.policy_id));

CREATE POLICY "Users can delete classifications for accessible policies"
  ON policy_cgl_classifications FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_classifications.policy_id));

-- CGL Additional Insureds
ALTER TABLE policy_cgl_additional_insureds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view AIs for accessible policies"
  ON policy_cgl_additional_insureds FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_additional_insureds.policy_id));

CREATE POLICY "Users can insert AIs for accessible policies"
  ON policy_cgl_additional_insureds FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_additional_insureds.policy_id));

CREATE POLICY "Users can update AIs for accessible policies"
  ON policy_cgl_additional_insureds FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_additional_insureds.policy_id))
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_additional_insureds.policy_id));

CREATE POLICY "Users can delete AIs for accessible policies"
  ON policy_cgl_additional_insureds FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_additional_insureds.policy_id));

-- CGL Additional Interests
ALTER TABLE policy_cgl_additional_interests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view interests for accessible policies"
  ON policy_cgl_additional_interests FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_additional_interests.policy_id));

CREATE POLICY "Users can insert interests for accessible policies"
  ON policy_cgl_additional_interests FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_additional_interests.policy_id));

CREATE POLICY "Users can update interests for accessible policies"
  ON policy_cgl_additional_interests FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_additional_interests.policy_id))
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_additional_interests.policy_id));

CREATE POLICY "Users can delete interests for accessible policies"
  ON policy_cgl_additional_interests FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_additional_interests.policy_id));

-- CGL Endorsements
ALTER TABLE policy_cgl_endorsements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view endorsements for accessible policies"
  ON policy_cgl_endorsements FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_endorsements.policy_id));

CREATE POLICY "Users can insert endorsements for accessible policies"
  ON policy_cgl_endorsements FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_endorsements.policy_id));

CREATE POLICY "Users can update endorsements for accessible policies"
  ON policy_cgl_endorsements FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_endorsements.policy_id))
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_endorsements.policy_id));

CREATE POLICY "Users can delete endorsements for accessible policies"
  ON policy_cgl_endorsements FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_endorsements.policy_id));

-- CGL Evidence Catalog
ALTER TABLE policy_cgl_evidence_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view evidence for accessible policies"
  ON policy_cgl_evidence_catalog FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_evidence_catalog.policy_id));

CREATE POLICY "Users can insert evidence for accessible policies"
  ON policy_cgl_evidence_catalog FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_evidence_catalog.policy_id));

CREATE POLICY "Users can update evidence for accessible policies"
  ON policy_cgl_evidence_catalog FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_evidence_catalog.policy_id))
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_evidence_catalog.policy_id));

CREATE POLICY "Users can delete evidence for accessible policies"
  ON policy_cgl_evidence_catalog FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_evidence_catalog.policy_id));

-- CGL Extraction Jobs
ALTER TABLE policy_cgl_extraction_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view extraction jobs for accessible policies"
  ON policy_cgl_extraction_jobs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_extraction_jobs.policy_id));

CREATE POLICY "Users can insert extraction jobs"
  ON policy_cgl_extraction_jobs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_cgl_extraction_jobs.policy_id));

CREATE POLICY "Service role full access to extraction jobs"
  ON policy_cgl_extraction_jobs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- UPDATED TIMESTAMP TRIGGERS
-- =============================================================================

CREATE OR REPLACE FUNCTION update_cgl_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cgl_locations_updated
  BEFORE UPDATE ON policy_cgl_locations
  FOR EACH ROW EXECUTE FUNCTION update_cgl_updated_at();

CREATE TRIGGER trigger_cgl_classifications_updated
  BEFORE UPDATE ON policy_cgl_classifications
  FOR EACH ROW EXECUTE FUNCTION update_cgl_updated_at();

CREATE TRIGGER trigger_cgl_ai_updated
  BEFORE UPDATE ON policy_cgl_additional_insureds
  FOR EACH ROW EXECUTE FUNCTION update_cgl_updated_at();

CREATE TRIGGER trigger_cgl_interests_updated
  BEFORE UPDATE ON policy_cgl_additional_interests
  FOR EACH ROW EXECUTE FUNCTION update_cgl_updated_at();

CREATE TRIGGER trigger_cgl_endorsements_updated
  BEFORE UPDATE ON policy_cgl_endorsements
  FOR EACH ROW EXECUTE FUNCTION update_cgl_updated_at();

CREATE TRIGGER trigger_cgl_evidence_updated
  BEFORE UPDATE ON policy_cgl_evidence_catalog
  FOR EACH ROW EXECUTE FUNCTION update_cgl_updated_at();

CREATE TRIGGER trigger_cgl_extraction_jobs_updated
  BEFORE UPDATE ON policy_cgl_extraction_jobs
  FOR EACH ROW EXECUTE FUNCTION update_cgl_updated_at();
