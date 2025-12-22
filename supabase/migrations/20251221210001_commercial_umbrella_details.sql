-- =============================================================================
-- Commercial Umbrella / Excess Liability Policy Details Schema
-- =============================================================================
-- Complete schema for Umbrella/Excess extraction with Azure Document Intelligence
-- evidence catalog support for click-to-highlight functionality.
--
-- Key tables:
-- - policy_umbrella_underlying: Underlying policy schedule
-- - policy_umbrella_additional_insureds: AI schedule
-- - policy_umbrella_endorsements: Endorsements with high-impact flags
-- - policy_umbrella_evidence_catalog: Evidence for click-to-highlight
-- - policy_umbrella_extraction_jobs: Job tracking
-- =============================================================================

-- =============================================================================
-- UNDERLYING POLICY SCHEDULE
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_umbrella_underlying (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,

  -- Underlying policy type
  underlying_type TEXT NOT NULL CHECK (underlying_type IN (
    'general_liability', 'commercial_auto', 'employers_liability',
    'workers_compensation', 'professional_liability', 'hired_non_owned_auto',
    'employee_benefits', 'other'
  )),

  -- Underlying carrier and policy
  carrier TEXT NOT NULL,
  underlying_policy_number TEXT,
  effective_date DATE,
  expiration_date DATE,

  -- Limits (flexible structure for different underlying types)
  each_occurrence NUMERIC(15, 2),
  general_aggregate NUMERIC(15, 2),
  auto_csl NUMERIC(15, 2),
  auto_bi_per_person NUMERIC(15, 2),
  auto_bi_per_accident NUMERIC(15, 2),
  auto_pd NUMERIC(15, 2),
  el_per_accident NUMERIC(15, 2),
  el_disease_policy NUMERIC(15, 2),
  el_disease_employee NUMERIC(15, 2),
  other_limit NUMERIC(15, 2),
  limit_description TEXT,

  -- Compliance flags
  meets_requirements BOOLEAN,
  has_term_mismatch BOOLEAN DEFAULT false,
  compliance_notes TEXT,

  -- Evidence tracking
  evidence_ids TEXT[] DEFAULT '{}',
  extraction_confidence NUMERIC(5, 4),
  extraction_status TEXT CHECK (extraction_status IN ('AUTO_APPLIED', 'NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'LOW_CONFIDENCE', 'NOT_FOUND', 'CONFLICT', 'MANUAL')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint per policy/underlying type
  UNIQUE(policy_id, underlying_type, underlying_policy_number)
);

CREATE INDEX idx_umbrella_underlying_policy ON policy_umbrella_underlying(policy_id);
CREATE INDEX idx_umbrella_underlying_type ON policy_umbrella_underlying(underlying_type);
CREATE INDEX idx_umbrella_underlying_evidence ON policy_umbrella_underlying USING GIN (evidence_ids);

-- =============================================================================
-- UNDERLYING REQUIREMENTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_umbrella_requirements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,

  -- Required minimums
  gl_each_occurrence NUMERIC(15, 2),
  gl_general_aggregate NUMERIC(15, 2),
  auto_liability NUMERIC(15, 2),
  el_per_accident NUMERIC(15, 2),
  el_disease_policy NUMERIC(15, 2),
  el_disease_employee NUMERIC(15, 2),

  -- Other requirements
  other_requirements TEXT[],

  -- Evidence tracking
  evidence_ids TEXT[] DEFAULT '{}',
  extraction_confidence NUMERIC(5, 4),
  extraction_status TEXT CHECK (extraction_status IN ('AUTO_APPLIED', 'NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'LOW_CONFIDENCE', 'NOT_FOUND', 'CONFLICT', 'MANUAL')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(policy_id)
);

CREATE INDEX idx_umbrella_requirements_policy ON policy_umbrella_requirements(policy_id);

-- =============================================================================
-- UMBRELLA ADDITIONAL INSUREDS
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_umbrella_additional_insureds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,

  -- AI Details
  name TEXT NOT NULL,
  street TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,

  -- AI Type
  ai_type TEXT NOT NULL CHECK (ai_type IN ('blanket', 'scheduled', 'follow_underlying')),

  -- Coverage extensions
  primary_noncontributory BOOLEAN DEFAULT false,
  waiver_of_subrogation BOOLEAN DEFAULT false,

  -- Project specific
  project_name TEXT,

  -- Evidence tracking
  evidence_ids TEXT[] DEFAULT '{}',
  extraction_confidence NUMERIC(5, 4),
  extraction_status TEXT CHECK (extraction_status IN ('AUTO_APPLIED', 'NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'LOW_CONFIDENCE', 'NOT_FOUND', 'CONFLICT', 'MANUAL')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_umbrella_ai_policy ON policy_umbrella_additional_insureds(policy_id);
CREATE INDEX idx_umbrella_ai_type ON policy_umbrella_additional_insureds(ai_type);
CREATE INDEX idx_umbrella_ai_evidence ON policy_umbrella_additional_insureds USING GIN (evidence_ids);

-- =============================================================================
-- UMBRELLA ENDORSEMENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_umbrella_endorsements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,

  -- Endorsement details
  form_number TEXT NOT NULL,
  title TEXT NOT NULL,
  edition_date TEXT,
  effective_date DATE,

  -- Category (high-impact flagging)
  category TEXT CHECK (category IN (
    'designated_underlying', 'auto_liability', 'employers_liability',
    'professional_liability', 'pollution', 'abuse_molestation',
    'assault_battery', 'communicable_disease', 'residential_work',
    'height_limitation', 'eifs_stucco', 'liquor_liability',
    'cyber', 'territory_limitation', 'aircraft_watercraft', 'other'
  )),

  -- Impact flags
  is_limitation BOOLEAN DEFAULT false,
  is_enhancement BOOLEAN DEFAULT false,
  impact_description TEXT,
  premium_impact NUMERIC(15, 2),

  -- Evidence tracking
  evidence_ids TEXT[] DEFAULT '{}',
  extraction_confidence NUMERIC(5, 4),
  extraction_status TEXT CHECK (extraction_status IN ('AUTO_APPLIED', 'NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'LOW_CONFIDENCE', 'NOT_FOUND', 'CONFLICT', 'MANUAL')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_umbrella_endorsements_policy ON policy_umbrella_endorsements(policy_id);
CREATE INDEX idx_umbrella_endorsements_category ON policy_umbrella_endorsements(category);
CREATE INDEX idx_umbrella_endorsements_limitation ON policy_umbrella_endorsements(is_limitation) WHERE is_limitation = true;
CREATE INDEX idx_umbrella_endorsements_evidence ON policy_umbrella_endorsements USING GIN (evidence_ids);

-- =============================================================================
-- UMBRELLA EVIDENCE CATALOG TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_umbrella_evidence_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,

  -- Evidence entries
  evidence_entries JSONB NOT NULL DEFAULT '{}',
  evidence_by_field JSONB NOT NULL DEFAULT '{}',

  -- Structured evidence
  limits_evidence JSONB NOT NULL DEFAULT '[]',
  underlying_evidence JSONB NOT NULL DEFAULT '[]',
  retention_evidence JSONB NOT NULL DEFAULT '[]',
  endorsement_evidence JSONB NOT NULL DEFAULT '[]',

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

CREATE INDEX idx_umbrella_evidence_policy ON policy_umbrella_evidence_catalog(policy_id);
CREATE INDEX idx_umbrella_evidence_document ON policy_umbrella_evidence_catalog(document_id);
CREATE INDEX idx_umbrella_evidence_entries ON policy_umbrella_evidence_catalog USING GIN (evidence_entries);

-- =============================================================================
-- UMBRELLA EXTRACTION JOBS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_umbrella_extraction_jobs (
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

  underlying_policies_extracted INTEGER DEFAULT 0,
  additional_insureds_extracted INTEGER DEFAULT 0,
  endorsements_extracted INTEGER DEFAULT 0,

  -- Compliance results
  compliance_issues_count INTEGER DEFAULT 0,

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

CREATE INDEX idx_umbrella_extraction_jobs_policy ON policy_umbrella_extraction_jobs(policy_id);
CREATE INDEX idx_umbrella_extraction_jobs_status ON policy_umbrella_extraction_jobs(status);
CREATE INDEX idx_umbrella_extraction_jobs_created ON policy_umbrella_extraction_jobs(created_at DESC);

-- =============================================================================
-- ADD UMBRELLA DETAILS COLUMNS TO POLICIES TABLE
-- =============================================================================

ALTER TABLE policies
  ADD COLUMN IF NOT EXISTS umbrella_details JSONB DEFAULT '{}';

ALTER TABLE policies
  ADD COLUMN IF NOT EXISTS umbrella_field_evidence JSONB DEFAULT '{}';

COMMENT ON COLUMN policies.umbrella_details IS 'Complete Commercial Umbrella/Excess policy details including limits, retention, underlying schedule, drop-down, endorsements';
COMMENT ON COLUMN policies.umbrella_field_evidence IS 'Maps Umbrella field names to evidence IDs for click-to-highlight';

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- Underlying Policies
ALTER TABLE policy_umbrella_underlying ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view umbrella underlying for accessible policies"
  ON policy_umbrella_underlying FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_umbrella_underlying.policy_id));

CREATE POLICY "Users can insert umbrella underlying for accessible policies"
  ON policy_umbrella_underlying FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_umbrella_underlying.policy_id));

CREATE POLICY "Users can update umbrella underlying for accessible policies"
  ON policy_umbrella_underlying FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_umbrella_underlying.policy_id))
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_umbrella_underlying.policy_id));

CREATE POLICY "Users can delete umbrella underlying for accessible policies"
  ON policy_umbrella_underlying FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_umbrella_underlying.policy_id));

-- Underlying Requirements
ALTER TABLE policy_umbrella_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view umbrella requirements for accessible policies"
  ON policy_umbrella_requirements FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_umbrella_requirements.policy_id));

CREATE POLICY "Users can insert umbrella requirements for accessible policies"
  ON policy_umbrella_requirements FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_umbrella_requirements.policy_id));

CREATE POLICY "Users can update umbrella requirements for accessible policies"
  ON policy_umbrella_requirements FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_umbrella_requirements.policy_id))
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_umbrella_requirements.policy_id));

CREATE POLICY "Users can delete umbrella requirements for accessible policies"
  ON policy_umbrella_requirements FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_umbrella_requirements.policy_id));

-- Additional Insureds
ALTER TABLE policy_umbrella_additional_insureds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view umbrella AIs for accessible policies"
  ON policy_umbrella_additional_insureds FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_umbrella_additional_insureds.policy_id));

CREATE POLICY "Users can insert umbrella AIs for accessible policies"
  ON policy_umbrella_additional_insureds FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_umbrella_additional_insureds.policy_id));

CREATE POLICY "Users can update umbrella AIs for accessible policies"
  ON policy_umbrella_additional_insureds FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_umbrella_additional_insureds.policy_id))
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_umbrella_additional_insureds.policy_id));

CREATE POLICY "Users can delete umbrella AIs for accessible policies"
  ON policy_umbrella_additional_insureds FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_umbrella_additional_insureds.policy_id));

-- Endorsements
ALTER TABLE policy_umbrella_endorsements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view umbrella endorsements for accessible policies"
  ON policy_umbrella_endorsements FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_umbrella_endorsements.policy_id));

CREATE POLICY "Users can insert umbrella endorsements for accessible policies"
  ON policy_umbrella_endorsements FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_umbrella_endorsements.policy_id));

CREATE POLICY "Users can update umbrella endorsements for accessible policies"
  ON policy_umbrella_endorsements FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_umbrella_endorsements.policy_id))
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_umbrella_endorsements.policy_id));

CREATE POLICY "Users can delete umbrella endorsements for accessible policies"
  ON policy_umbrella_endorsements FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_umbrella_endorsements.policy_id));

-- Evidence Catalog
ALTER TABLE policy_umbrella_evidence_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view umbrella evidence for accessible policies"
  ON policy_umbrella_evidence_catalog FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_umbrella_evidence_catalog.policy_id));

CREATE POLICY "Users can insert umbrella evidence for accessible policies"
  ON policy_umbrella_evidence_catalog FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_umbrella_evidence_catalog.policy_id));

CREATE POLICY "Users can update umbrella evidence for accessible policies"
  ON policy_umbrella_evidence_catalog FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_umbrella_evidence_catalog.policy_id))
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_umbrella_evidence_catalog.policy_id));

CREATE POLICY "Users can delete umbrella evidence for accessible policies"
  ON policy_umbrella_evidence_catalog FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_umbrella_evidence_catalog.policy_id));

-- Extraction Jobs
ALTER TABLE policy_umbrella_extraction_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view umbrella extraction jobs for accessible policies"
  ON policy_umbrella_extraction_jobs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_umbrella_extraction_jobs.policy_id));

CREATE POLICY "Users can insert umbrella extraction jobs"
  ON policy_umbrella_extraction_jobs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_umbrella_extraction_jobs.policy_id));

CREATE POLICY "Service role full access to umbrella extraction jobs"
  ON policy_umbrella_extraction_jobs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- UPDATE TIMESTAMP TRIGGERS
-- =============================================================================

CREATE OR REPLACE FUNCTION update_umbrella_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_umbrella_underlying_updated
  BEFORE UPDATE ON policy_umbrella_underlying
  FOR EACH ROW EXECUTE FUNCTION update_umbrella_updated_at();

CREATE TRIGGER trigger_umbrella_requirements_updated
  BEFORE UPDATE ON policy_umbrella_requirements
  FOR EACH ROW EXECUTE FUNCTION update_umbrella_updated_at();

CREATE TRIGGER trigger_umbrella_ai_updated
  BEFORE UPDATE ON policy_umbrella_additional_insureds
  FOR EACH ROW EXECUTE FUNCTION update_umbrella_updated_at();

CREATE TRIGGER trigger_umbrella_endorsements_updated
  BEFORE UPDATE ON policy_umbrella_endorsements
  FOR EACH ROW EXECUTE FUNCTION update_umbrella_updated_at();

CREATE TRIGGER trigger_umbrella_evidence_updated
  BEFORE UPDATE ON policy_umbrella_evidence_catalog
  FOR EACH ROW EXECUTE FUNCTION update_umbrella_updated_at();

CREATE TRIGGER trigger_umbrella_extraction_jobs_updated
  BEFORE UPDATE ON policy_umbrella_extraction_jobs
  FOR EACH ROW EXECUTE FUNCTION update_umbrella_updated_at();
