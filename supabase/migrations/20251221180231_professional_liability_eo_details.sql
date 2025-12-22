-- =============================================================================
-- Professional Liability / Errors & Omissions (E&O) Policy Details Schema
-- =============================================================================
-- Complete schema for E&O extraction with Azure Document Intelligence
-- evidence catalog support for click-to-highlight functionality.
-- =============================================================================

-- =============================================================================
-- E&O POLICY DETAILS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_eo_details (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,

  -- Policy Identity
  carrier_name TEXT,
  carrier_naic VARCHAR(10),
  policy_number TEXT,
  transaction_type TEXT CHECK (transaction_type IN ('quote', 'bound', 'issued', 'renewal', 'endorsement', 'cancel')),
  named_insured TEXT NOT NULL,
  dba TEXT,
  fein VARCHAR(20),
  mailing_address_street TEXT,
  mailing_address_city TEXT,
  mailing_address_state TEXT,
  mailing_address_zip TEXT,

  -- Dates
  effective_date DATE,
  expiration_date DATE,
  issue_date DATE,

  -- Professional Type
  professional_type TEXT CHECK (professional_type IN (
    'errors_omissions',
    'professional_services',
    'miscellaneous_professional',
    'technology_eo',
    'media_eo',
    'architects_engineers',
    'real_estate_eo',
    'insurance_agents_eo',
    'medical_professional',
    'legal_professional',
    'accounting_eo',
    'other'
  )),
  covered_services TEXT[] DEFAULT '{}',

  -- Policy Form (almost always claims-made for E&O)
  policy_form TEXT NOT NULL CHECK (policy_form IN ('claims_made', 'occurrence')) DEFAULT 'claims_made',
  
  -- Claims-Made Specifics (CRITICAL for E&O)
  retroactive_date DATE,
  full_prior_acts BOOLEAN DEFAULT false,
  continuity_date DATE,
  pending_prior_date DATE,

  -- Extended Reporting Period (ERP / Tail)
  erp_available BOOLEAN DEFAULT false,
  basic_erp_days INTEGER,
  supplemental_erp_available BOOLEAN DEFAULT false,
  supplemental_erp_options JSONB DEFAULT '[]',
  erp_purchased BOOLEAN DEFAULT false,
  erp_purchased_duration_months INTEGER,
  erp_purchased_premium NUMERIC(15, 2),

  -- Limits
  per_claim_limit NUMERIC(15, 2),
  aggregate_limit NUMERIC(15, 2),
  defense_costs TEXT CHECK (defense_costs IN ('inside_limits', 'outside_limits')),
  
  -- Deductible / Retention
  deductible_type TEXT CHECK (deductible_type IN ('deductible', 'sir', 'none')),
  deductible_per_claim NUMERIC(15, 2),
  deductible_aggregate NUMERIC(15, 2),
  deductible_applies_to_defense BOOLEAN DEFAULT false,

  -- Underwriting Information
  years_experience INTEGER,
  professionals_count INTEGER,
  gross_revenue NUMERIC(15, 2),
  prior_claims_last_5_years INTEGER,

  -- Premium
  total_premium NUMERIC(15, 2),
  minimum_premium NUMERIC(15, 2),
  policy_fee NUMERIC(15, 2),
  state_taxes NUMERIC(15, 2),

  -- Evidence tracking
  evidence_ids TEXT[] DEFAULT '{}',
  extraction_confidence NUMERIC(5, 4),
  extraction_status extraction_confidence,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint
  UNIQUE(policy_id)
);

CREATE INDEX idx_eo_details_policy ON policy_eo_details(policy_id);
CREATE INDEX idx_eo_details_professional_type ON policy_eo_details(professional_type);
CREATE INDEX idx_eo_details_evidence ON policy_eo_details USING GIN (evidence_ids);

-- =============================================================================
-- E&O EXCLUSIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_eo_exclusions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,

  -- Exclusion details
  exclusion_type TEXT NOT NULL,
  description TEXT NOT NULL,
  form_number TEXT,
  edition_date DATE,
  is_standard_exclusion BOOLEAN DEFAULT false,
  is_high_impact BOOLEAN DEFAULT false,

  -- Evidence tracking
  evidence_ids TEXT[] DEFAULT '{}',
  extraction_confidence NUMERIC(5, 4),
  extraction_status extraction_confidence,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_eo_exclusions_policy ON policy_eo_exclusions(policy_id);
CREATE INDEX idx_eo_exclusions_type ON policy_eo_exclusions(exclusion_type);
CREATE INDEX idx_eo_exclusions_evidence ON policy_eo_exclusions USING GIN (evidence_ids);

-- =============================================================================
-- E&O ENDORSEMENTS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_eo_endorsements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,

  -- Endorsement details
  form_number TEXT,
  title TEXT NOT NULL,
  edition_date DATE,
  effective_date DATE,
  description TEXT,
  category TEXT,
  is_limitation BOOLEAN DEFAULT false,
  is_enhancement BOOLEAN DEFAULT false,

  -- Evidence tracking
  evidence_ids TEXT[] DEFAULT '{}',
  extraction_confidence NUMERIC(5, 4),
  extraction_status extraction_confidence,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_eo_endorsements_policy ON policy_eo_endorsements(policy_id);
CREATE INDEX idx_eo_endorsements_form ON policy_eo_endorsements(form_number);
CREATE INDEX idx_eo_endorsements_evidence ON policy_eo_endorsements USING GIN (evidence_ids);

-- =============================================================================
-- E&O PRIOR ACTS / CLAIMS HISTORY TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_eo_prior_acts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,

  -- Prior act details
  act_date DATE,
  description TEXT,
  claim_made_date DATE,
  claim_amount NUMERIC(15, 2),
  claim_status TEXT CHECK (claim_status IN ('open', 'closed', 'settled', 'denied')),
  is_reported BOOLEAN DEFAULT false,

  -- Evidence tracking
  evidence_ids TEXT[] DEFAULT '{}',
  extraction_confidence NUMERIC(5, 4),
  extraction_status extraction_confidence,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_eo_prior_acts_policy ON policy_eo_prior_acts(policy_id);
CREATE INDEX idx_eo_prior_acts_date ON policy_eo_prior_acts(act_date);
CREATE INDEX idx_eo_prior_acts_evidence ON policy_eo_prior_acts USING GIN (evidence_ids);

-- =============================================================================
-- E&O EVIDENCE CATALOG TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_eo_evidence_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,

  -- Evidence entries (indexed by evidence ID)
  evidence_entries JSONB NOT NULL DEFAULT '{}',

  -- Evidence indexed by E&O field name
  evidence_by_field JSONB NOT NULL DEFAULT '{}',

  -- Claims-made specific evidence
  claims_made_evidence JSONB NOT NULL DEFAULT '[]',

  -- ERP evidence
  erp_evidence JSONB NOT NULL DEFAULT '[]',

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

CREATE INDEX idx_eo_evidence_policy ON policy_eo_evidence_catalog(policy_id);
CREATE INDEX idx_eo_evidence_document ON policy_eo_evidence_catalog(document_id);
CREATE INDEX idx_eo_evidence_entries ON policy_eo_evidence_catalog USING GIN (evidence_entries);
CREATE INDEX idx_eo_evidence_by_field ON policy_eo_evidence_catalog USING GIN (evidence_by_field);

-- =============================================================================
-- E&O EXTRACTION JOBS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_eo_extraction_jobs (
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
  overall_confidence NUMERIC(5, 4),

  -- Error handling
  error_message TEXT,
  error_stack TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_eo_jobs_policy ON policy_eo_extraction_jobs(policy_id);
CREATE INDEX idx_eo_jobs_status ON policy_eo_extraction_jobs(status);
CREATE INDEX idx_eo_jobs_document ON policy_eo_extraction_jobs(document_id);

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

ALTER TABLE policy_eo_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_eo_exclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_eo_endorsements ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_eo_prior_acts ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_eo_evidence_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_eo_extraction_jobs ENABLE ROW LEVEL SECURITY;

-- Policy details RLS
CREATE POLICY "Users can view E&O details for accessible policies"
  ON policy_eo_details FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_eo_details.policy_id));

CREATE POLICY "Users can insert E&O details for accessible policies"
  ON policy_eo_details FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_eo_details.policy_id));

CREATE POLICY "Users can update E&O details for accessible policies"
  ON policy_eo_details FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_eo_details.policy_id))
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_eo_details.policy_id));

CREATE POLICY "Users can delete E&O details for accessible policies"
  ON policy_eo_details FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_eo_details.policy_id));

-- Exclusions RLS
CREATE POLICY "Users can view E&O exclusions for accessible policies"
  ON policy_eo_exclusions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_eo_exclusions.policy_id));

CREATE POLICY "Users can manage E&O exclusions for accessible policies"
  ON policy_eo_exclusions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_eo_exclusions.policy_id))
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_eo_exclusions.policy_id));

-- Endorsements RLS
CREATE POLICY "Users can view E&O endorsements for accessible policies"
  ON policy_eo_endorsements FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_eo_endorsements.policy_id));

CREATE POLICY "Users can manage E&O endorsements for accessible policies"
  ON policy_eo_endorsements FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_eo_endorsements.policy_id))
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_eo_endorsements.policy_id));

-- Prior acts RLS
CREATE POLICY "Users can view E&O prior acts for accessible policies"
  ON policy_eo_prior_acts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_eo_prior_acts.policy_id));

CREATE POLICY "Users can manage E&O prior acts for accessible policies"
  ON policy_eo_prior_acts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_eo_prior_acts.policy_id))
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_eo_prior_acts.policy_id));

-- Evidence catalog RLS
CREATE POLICY "Users can view evidence for accessible policies"
  ON policy_eo_evidence_catalog FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_eo_evidence_catalog.policy_id));

CREATE POLICY "Users can manage evidence for accessible policies"
  ON policy_eo_evidence_catalog FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_eo_evidence_catalog.policy_id))
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_eo_evidence_catalog.policy_id));

-- Extraction jobs RLS
CREATE POLICY "Users can view extraction jobs for accessible policies"
  ON policy_eo_extraction_jobs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_eo_extraction_jobs.policy_id));

CREATE POLICY "Users can manage extraction jobs for accessible policies"
  ON policy_eo_extraction_jobs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_eo_extraction_jobs.policy_id))
  WITH CHECK (EXISTS (SELECT 1 FROM policies p WHERE p.id = policy_eo_extraction_jobs.policy_id));

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Updated_at triggers
CREATE TRIGGER set_eo_details_updated_at
  BEFORE UPDATE ON policy_eo_details
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_eo_exclusions_updated_at
  BEFORE UPDATE ON policy_eo_exclusions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_eo_endorsements_updated_at
  BEFORE UPDATE ON policy_eo_endorsements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_eo_prior_acts_updated_at
  BEFORE UPDATE ON policy_eo_prior_acts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_eo_evidence_catalog_updated_at
  BEFORE UPDATE ON policy_eo_evidence_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_eo_extraction_jobs_updated_at
  BEFORE UPDATE ON policy_eo_extraction_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE policy_eo_details IS 'Professional Liability / Errors & Omissions policy details with evidence tracking';
COMMENT ON TABLE policy_eo_exclusions IS 'E&O policy exclusions with evidence references';
COMMENT ON TABLE policy_eo_endorsements IS 'E&O policy endorsements with evidence references';
COMMENT ON TABLE policy_eo_prior_acts IS 'Prior acts and claims history for E&O policies';
COMMENT ON TABLE policy_eo_evidence_catalog IS 'Evidence catalog for E&O extraction with click-to-highlight support';
COMMENT ON TABLE policy_eo_extraction_jobs IS 'E&O extraction job tracking and status';

COMMENT ON COLUMN policy_eo_details.policy_form IS 'Almost always claims-made for E&O policies';
COMMENT ON COLUMN policy_eo_details.retroactive_date IS 'CRITICAL: Date before which acts are not covered (claims-made)';
COMMENT ON COLUMN policy_eo_details.full_prior_acts IS 'True if retroactive date is unlimited (full prior acts coverage)';
COMMENT ON COLUMN policy_eo_details.erp_available IS 'Extended Reporting Period (Tail) availability';
COMMENT ON COLUMN policy_eo_details.extraction_status IS 'Uses extraction_confidence ENUM type for type safety';

