-- =============================================================================
-- Workers' Compensation Evidence Catalog
-- =============================================================================
-- Stores Azure Document Intelligence OCR results with evidence tracking
-- for click-to-highlight and audit trail functionality.
-- =============================================================================

-- WC Evidence Catalog Table
CREATE TABLE IF NOT EXISTS policy_wc_evidence_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,

  -- Evidence entries (indexed by evidence ID)
  evidence_entries JSONB NOT NULL DEFAULT '{}',

  -- Evidence indexed by WC field name
  evidence_by_field JSONB NOT NULL DEFAULT '{}',

  -- Classification table evidence (parsed)
  classification_evidence JSONB NOT NULL DEFAULT '[]',

  -- Officer table evidence (parsed)
  officer_evidence JSONB NOT NULL DEFAULT '[]',

  -- Experience mod evidence
  experience_mod_evidence JSONB NOT NULL DEFAULT '[]',

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

-- Create indexes for fast lookups
CREATE INDEX idx_wc_evidence_policy ON policy_wc_evidence_catalog(policy_id);
CREATE INDEX idx_wc_evidence_document ON policy_wc_evidence_catalog(document_id);
CREATE INDEX idx_wc_evidence_entries ON policy_wc_evidence_catalog USING GIN (evidence_entries);
CREATE INDEX idx_wc_evidence_by_field ON policy_wc_evidence_catalog USING GIN (evidence_by_field);

-- RLS for evidence catalog
ALTER TABLE policy_wc_evidence_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view evidence for accessible policies"
  ON policy_wc_evidence_catalog
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM policies p
      WHERE p.id = policy_wc_evidence_catalog.policy_id
    )
  );

CREATE POLICY "Users can insert evidence for accessible policies"
  ON policy_wc_evidence_catalog
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM policies p
      WHERE p.id = policy_wc_evidence_catalog.policy_id
    )
  );

CREATE POLICY "Users can update evidence for accessible policies"
  ON policy_wc_evidence_catalog
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM policies p
      WHERE p.id = policy_wc_evidence_catalog.policy_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM policies p
      WHERE p.id = policy_wc_evidence_catalog.policy_id
    )
  );

CREATE POLICY "Users can delete evidence for accessible policies"
  ON policy_wc_evidence_catalog
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM policies p
      WHERE p.id = policy_wc_evidence_catalog.policy_id
    )
  );

-- =============================================================================
-- Add evidence_ids columns to WC tables
-- =============================================================================

-- Add evidence tracking to classifications
ALTER TABLE policy_wc_classifications
  ADD COLUMN IF NOT EXISTS evidence_ids TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS extraction_confidence NUMERIC(5, 4),
  ADD COLUMN IF NOT EXISTS extraction_status TEXT CHECK (extraction_status IN ('AUTO_APPLIED', 'NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'LOW_CONFIDENCE', 'NOT_FOUND', 'CONFLICT', 'MANUAL'));

-- Add evidence tracking to officers
ALTER TABLE policy_wc_officers
  ADD COLUMN IF NOT EXISTS evidence_ids TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS extraction_confidence NUMERIC(5, 4),
  ADD COLUMN IF NOT EXISTS extraction_status TEXT CHECK (extraction_status IN ('AUTO_APPLIED', 'NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'LOW_CONFIDENCE', 'NOT_FOUND', 'CONFLICT', 'MANUAL'));

-- Add evidence tracking to states
ALTER TABLE policy_wc_states
  ADD COLUMN IF NOT EXISTS evidence_ids TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS extraction_confidence NUMERIC(5, 4),
  ADD COLUMN IF NOT EXISTS extraction_status TEXT CHECK (extraction_status IN ('AUTO_APPLIED', 'NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'LOW_CONFIDENCE', 'NOT_FOUND', 'CONFLICT', 'MANUAL'));

-- Add evidence tracking to experience mods
ALTER TABLE policy_wc_experience_mods
  ADD COLUMN IF NOT EXISTS evidence_ids TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS extraction_confidence NUMERIC(5, 4),
  ADD COLUMN IF NOT EXISTS extraction_status TEXT CHECK (extraction_status IN ('AUTO_APPLIED', 'NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'LOW_CONFIDENCE', 'NOT_FOUND', 'CONFLICT', 'MANUAL'));

-- =============================================================================
-- Add evidence tracking to policy wc_details
-- =============================================================================

-- Add field-level evidence tracking to policies table for WC
-- This stores evidence IDs for each top-level WC field
ALTER TABLE policies
  ADD COLUMN IF NOT EXISTS wc_field_evidence JSONB DEFAULT '{}';

COMMENT ON COLUMN policies.wc_field_evidence IS 'Maps WC field names to their evidence IDs for click-to-highlight, e.g., {"experience_mod": ["E0001", "E0002"], "fein": ["E0003"]}';

-- =============================================================================
-- WC Extraction Job Tracking
-- =============================================================================

CREATE TABLE IF NOT EXISTS policy_wc_extraction_jobs (
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

  classifications_extracted INTEGER DEFAULT 0,
  officers_extracted INTEGER DEFAULT 0,
  states_extracted INTEGER DEFAULT 0,

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

CREATE INDEX idx_wc_extraction_jobs_policy ON policy_wc_extraction_jobs(policy_id);
CREATE INDEX idx_wc_extraction_jobs_status ON policy_wc_extraction_jobs(status);
CREATE INDEX idx_wc_extraction_jobs_created ON policy_wc_extraction_jobs(created_at DESC);

-- RLS for extraction jobs
ALTER TABLE policy_wc_extraction_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view extraction jobs for accessible policies"
  ON policy_wc_extraction_jobs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM policies p
      WHERE p.id = policy_wc_extraction_jobs.policy_id
    )
  );

CREATE POLICY "Users can insert extraction jobs"
  ON policy_wc_extraction_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM policies p
      WHERE p.id = policy_wc_extraction_jobs.policy_id
    )
  );

CREATE POLICY "Service role full access to extraction jobs"
  ON policy_wc_extraction_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- Updated timestamp trigger
-- =============================================================================

CREATE OR REPLACE FUNCTION update_wc_evidence_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_wc_evidence_updated
  BEFORE UPDATE ON policy_wc_evidence_catalog
  FOR EACH ROW
  EXECUTE FUNCTION update_wc_evidence_updated_at();

CREATE TRIGGER trigger_wc_extraction_jobs_updated
  BEFORE UPDATE ON policy_wc_extraction_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_wc_evidence_updated_at();

-- =============================================================================
-- Add indexes for evidence array lookups
-- =============================================================================

CREATE INDEX idx_wc_classifications_evidence ON policy_wc_classifications USING GIN (evidence_ids);
CREATE INDEX idx_wc_officers_evidence ON policy_wc_officers USING GIN (evidence_ids);
CREATE INDEX idx_wc_states_evidence ON policy_wc_states USING GIN (evidence_ids);
CREATE INDEX idx_wc_experience_mods_evidence ON policy_wc_experience_mods USING GIN (evidence_ids);
