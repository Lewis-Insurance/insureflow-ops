-- ============================================
-- COVERAGE COMPARISON SYSTEM
-- Evidence-backed document comparison using ACORD extraction architecture
-- ============================================

-- ============================================
-- 1. ENHANCE WORKSPACE_DOCUMENTS
-- Add comparison-specific columns
-- ============================================

ALTER TABLE workspace_documents
  ADD COLUMN IF NOT EXISTS doc_role VARCHAR(10) CHECK (doc_role IN ('A', 'B', 'reference')),
  ADD COLUMN IF NOT EXISTS quality_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS quality_tier VARCHAR(20) CHECK (quality_tier IN ('excellent', 'good', 'acceptable', 'poor', 'unusable')),
  ADD COLUMN IF NOT EXISTS document_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS page_count INTEGER,
  ADD COLUMN IF NOT EXISTS file_size_bytes INTEGER,
  ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100);

-- Index for finding documents by role
CREATE INDEX IF NOT EXISTS idx_workspace_docs_role ON workspace_documents(workspace_id, doc_role);

-- ============================================
-- 2. COMPARISON EVIDENCE CATALOG
-- Store evidence catalog per document (reuses ACORD evidence structure)
-- ============================================

CREATE TABLE IF NOT EXISTS comparison_evidence_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  workspace_document_id UUID NOT NULL REFERENCES workspace_documents(id) ON DELETE CASCADE,

  -- Evidence catalog (same structure as ACORD extraction)
  evidence_entries JSONB NOT NULL DEFAULT '{}',  -- Record<evidenceId, EvidenceEntry>
  evidence_by_potential_field JSONB NOT NULL DEFAULT '{}',  -- Record<fieldName, evidenceId[]>
  evidence_by_page JSONB NOT NULL DEFAULT '{}',  -- Record<pageNumber, evidenceId[]>
  evidence_by_source_type JSONB NOT NULL DEFAULT '{}',  -- Record<sourceType, evidenceId[]>

  -- Catalog statistics
  catalog_stats JSONB NOT NULL DEFAULT '{}',  -- {totalEntries, avgConfidence, pageCount, bySourceType}

  -- Azure Document Intelligence raw response
  azure_raw_response JSONB,
  azure_model_used VARCHAR(50),
  azure_confidence_score NUMERIC(5,4),
  azure_processing_time_ms INTEGER,

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(workspace_document_id)
);

CREATE INDEX IF NOT EXISTS idx_evidence_catalog_workspace ON comparison_evidence_catalog(workspace_id);
CREATE INDEX IF NOT EXISTS idx_evidence_catalog_status ON comparison_evidence_catalog(status);

-- ============================================
-- 3. POLICY SNAPSHOTS
-- Structured extraction per document (PolicySnapshot schema)
-- ============================================

CREATE TABLE IF NOT EXISTS policy_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  workspace_document_id UUID NOT NULL REFERENCES workspace_documents(id) ON DELETE CASCADE,
  evidence_catalog_id UUID REFERENCES comparison_evidence_catalog(id) ON DELETE SET NULL,

  -- Document role in comparison
  doc_role VARCHAR(10) NOT NULL CHECK (doc_role IN ('A', 'B')),

  -- Extraction results (same structure as FieldResult from ACORD extraction)
  field_results JSONB NOT NULL DEFAULT '{}',  -- Record<fieldName, FieldResult>

  -- Global conflicts detected during extraction
  global_conflicts JSONB DEFAULT '[]',

  -- Notes for human review
  notes_for_review TEXT[],

  -- Document classification (detected during extraction)
  detected_doc_type VARCHAR(50),  -- dec_page, quote, policy, endorsement, etc.
  detected_carrier VARCHAR(100),
  detected_lob VARCHAR(50),  -- GL, Auto, WC, Property, Umbrella, etc.
  classification_confidence NUMERIC(5,4),

  -- Extraction quality metrics
  extraction_confidence NUMERIC(5,4),
  total_fields INTEGER DEFAULT 0,
  auto_applied_count INTEGER DEFAULT 0,
  needs_review_count INTEGER DEFAULT 0,
  needs_verification_count INTEGER DEFAULT 0,
  low_confidence_count INTEGER DEFAULT 0,
  not_found_count INTEGER DEFAULT 0,
  conflict_count INTEGER DEFAULT 0,

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'extracting', 'extracted', 'reviewed', 'failed')),
  error_message TEXT,

  -- Review tracking
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  user_corrections JSONB DEFAULT '{}',

  -- LLM metadata
  llm_model_used VARCHAR(50),
  prompt_version VARCHAR(20),
  tokens_input INTEGER,
  tokens_output INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(workspace_id, doc_role)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_workspace ON policy_snapshots(workspace_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_status ON policy_snapshots(status);
CREATE INDEX IF NOT EXISTS idx_snapshots_doc_role ON policy_snapshots(workspace_id, doc_role);

-- ============================================
-- 4. COMPARISON RESULTS
-- Field-level differences between PolicySnapshot A and B
-- ============================================

CREATE TABLE IF NOT EXISTS comparison_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  snapshot_a_id UUID NOT NULL REFERENCES policy_snapshots(id) ON DELETE CASCADE,
  snapshot_b_id UUID NOT NULL REFERENCES policy_snapshots(id) ON DELETE CASCADE,

  -- Field-level differences
  field_differences JSONB NOT NULL DEFAULT '[]',  -- Array<ComparisonDifference>

  -- Differences grouped by category
  differences_by_category JSONB NOT NULL DEFAULT '{}',  -- Record<category, Array<ComparisonDifference>>

  -- Summary metrics
  total_fields_compared INTEGER DEFAULT 0,
  unchanged_count INTEGER DEFAULT 0,
  increased_count INTEGER DEFAULT 0,
  decreased_count INTEGER DEFAULT 0,
  added_count INTEGER DEFAULT 0,
  removed_count INTEGER DEFAULT 0,
  modified_count INTEGER DEFAULT 0,

  -- Severity distribution
  critical_count INTEGER DEFAULT 0,
  high_count INTEGER DEFAULT 0,
  medium_count INTEGER DEFAULT 0,
  low_count INTEGER DEFAULT 0,

  -- Coverage gap analysis
  coverage_gaps JSONB DEFAULT '[]',  -- Array<CoverageGap>
  critical_gaps_count INTEGER DEFAULT 0,

  -- Global mismatches (insured, carrier, LOB differ between A and B)
  global_mismatches JSONB DEFAULT '[]',  -- Array<GlobalMismatch>
  has_insured_mismatch BOOLEAN DEFAULT FALSE,
  has_carrier_mismatch BOOLEAN DEFAULT FALSE,
  has_lob_mismatch BOOLEAN DEFAULT FALSE,
  has_date_mismatch BOOLEAN DEFAULT FALSE,

  -- LLM-generated content
  executive_summary TEXT,
  recommendations TEXT[],
  key_findings TEXT[],

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'comparing', 'completed', 'failed')),
  error_message TEXT,

  -- Review tracking
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_comparison_results_workspace ON comparison_results(workspace_id);
CREATE INDEX IF NOT EXISTS idx_comparison_results_status ON comparison_results(status);

-- ============================================
-- 5. COMPARISON REPORTS
-- Generated PDF/HTML report artifacts
-- ============================================

CREATE TABLE IF NOT EXISTS comparison_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comparison_result_id UUID NOT NULL REFERENCES comparison_results(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Report files (stored in Supabase Storage)
  html_url TEXT,
  pdf_url TEXT,

  -- Report metadata
  report_type VARCHAR(20) DEFAULT 'standard' CHECK (report_type IN ('standard', 'executive', 'detailed', 'client_facing')),
  report_title TEXT,

  -- Customization options used
  include_evidence BOOLEAN DEFAULT TRUE,
  include_recommendations BOOLEAN DEFAULT TRUE,
  include_gap_analysis BOOLEAN DEFAULT TRUE,
  branding_config JSONB DEFAULT '{}',  -- {logo_url, primary_color, agency_name}

  -- Generation tracking
  generated_at TIMESTAMPTZ,
  generated_by UUID REFERENCES profiles(id),
  generation_time_ms INTEGER,

  -- Download tracking
  download_count INTEGER DEFAULT 0,
  last_downloaded_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comparison_reports_result ON comparison_reports(comparison_result_id);
CREATE INDEX IF NOT EXISTS idx_comparison_reports_workspace ON comparison_reports(workspace_id);

-- ============================================
-- 6. COMPARISON PROMPT RUNS
-- Track all LLM invocations for debugging/replay
-- ============================================

CREATE TABLE IF NOT EXISTS comparison_prompt_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  policy_snapshot_id UUID REFERENCES policy_snapshots(id) ON DELETE CASCADE,
  comparison_result_id UUID REFERENCES comparison_results(id) ON DELETE CASCADE,

  -- Prompt identification
  prompt_type VARCHAR(50) NOT NULL CHECK (prompt_type IN ('extraction', 'comparison', 'summary', 'qa', 'report', 'retry')),
  prompt_version VARCHAR(20),

  -- Prompt hashes for deduplication/caching
  system_prompt_hash VARCHAR(16),
  user_prompt_hash VARCHAR(16),

  -- Request details
  request_payload JSONB,  -- Full prompt content (may be large)
  model_used VARCHAR(50),
  temperature NUMERIC(3,2),
  max_tokens INTEGER,

  -- Response details
  response_payload JSONB,  -- Full LLM response
  response_parsed JSONB,   -- Parsed/validated output

  -- Metrics
  tokens_input INTEGER,
  tokens_output INTEGER,
  latency_ms INTEGER,
  cost_cents NUMERIC(10,4),

  -- Validation
  schema_valid BOOLEAN,
  validation_errors JSONB,
  correction_attempted BOOLEAN DEFAULT FALSE,
  correction_run_id UUID REFERENCES comparison_prompt_runs(id),

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'corrected')),
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prompt_runs_workspace ON comparison_prompt_runs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_prompt_runs_snapshot ON comparison_prompt_runs(policy_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_prompt_runs_type ON comparison_prompt_runs(prompt_type);
CREATE INDEX IF NOT EXISTS idx_prompt_runs_status ON comparison_prompt_runs(status);

-- ============================================
-- 7. COMPARISON Q&A SESSIONS
-- Track Q&A conversations about comparisons
-- ============================================

CREATE TABLE IF NOT EXISTS comparison_qa_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  comparison_result_id UUID REFERENCES comparison_results(id) ON DELETE SET NULL,

  -- Session metadata
  session_started_at TIMESTAMPTZ DEFAULT NOW(),
  session_ended_at TIMESTAMPTZ,

  -- Q&A history
  messages JSONB DEFAULT '[]',  -- Array<{role, content, evidence_ids, timestamp}>

  -- Metrics
  total_questions INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,

  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qa_sessions_workspace ON comparison_qa_sessions(workspace_id);

-- ============================================
-- 8. RLS POLICIES
-- ============================================

ALTER TABLE comparison_evidence_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparison_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparison_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparison_prompt_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparison_qa_sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can access comparison evidence for their workspaces" ON comparison_evidence_catalog;
DROP POLICY IF EXISTS "Users can access policy snapshots for their workspaces" ON policy_snapshots;
DROP POLICY IF EXISTS "Users can access comparison results for their workspaces" ON comparison_results;
DROP POLICY IF EXISTS "Users can access comparison reports for their workspaces" ON comparison_reports;
DROP POLICY IF EXISTS "Users can access prompt runs for their workspaces" ON comparison_prompt_runs;
DROP POLICY IF EXISTS "Users can access QA sessions for their workspaces" ON comparison_qa_sessions;

-- Create policies based on workspace ownership
CREATE POLICY "Users can access comparison evidence for their workspaces"
  ON comparison_evidence_catalog FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = comparison_evidence_catalog.workspace_id
      AND w.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can access policy snapshots for their workspaces"
  ON policy_snapshots FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = policy_snapshots.workspace_id
      AND w.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can access comparison results for their workspaces"
  ON comparison_results FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = comparison_results.workspace_id
      AND w.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can access comparison reports for their workspaces"
  ON comparison_reports FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = comparison_reports.workspace_id
      AND w.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can access prompt runs for their workspaces"
  ON comparison_prompt_runs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = comparison_prompt_runs.workspace_id
      AND w.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can access QA sessions for their workspaces"
  ON comparison_qa_sessions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = comparison_qa_sessions.workspace_id
      AND w.created_by = auth.uid()
    )
  );

-- ============================================
-- 9. TRIGGERS
-- ============================================

-- Updated at trigger for comparison_evidence_catalog
CREATE OR REPLACE FUNCTION update_comparison_evidence_catalog_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_comparison_evidence_catalog_updated ON comparison_evidence_catalog;
CREATE TRIGGER trg_comparison_evidence_catalog_updated
  BEFORE UPDATE ON comparison_evidence_catalog
  FOR EACH ROW
  EXECUTE FUNCTION update_comparison_evidence_catalog_timestamp();

-- Updated at trigger for policy_snapshots
CREATE OR REPLACE FUNCTION update_policy_snapshot_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_policy_snapshot_updated ON policy_snapshots;
CREATE TRIGGER trg_policy_snapshot_updated
  BEFORE UPDATE ON policy_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION update_policy_snapshot_timestamp();

-- Updated at trigger for comparison_results
CREATE OR REPLACE FUNCTION update_comparison_result_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_comparison_result_updated ON comparison_results;
CREATE TRIGGER trg_comparison_result_updated
  BEFORE UPDATE ON comparison_results
  FOR EACH ROW
  EXECUTE FUNCTION update_comparison_result_timestamp();

-- ============================================
-- 10. HELPER FUNCTIONS
-- ============================================

-- Function to validate exactly 2 documents with A/B roles for comparison
CREATE OR REPLACE FUNCTION validate_comparison_documents(p_workspace_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_doc_count INTEGER;
  v_doc_a_count INTEGER;
  v_doc_b_count INTEGER;
  v_result JSONB;
BEGIN
  SELECT COUNT(*) INTO v_doc_count
  FROM workspace_documents
  WHERE workspace_id = p_workspace_id;

  SELECT COUNT(*) INTO v_doc_a_count
  FROM workspace_documents
  WHERE workspace_id = p_workspace_id AND doc_role = 'A';

  SELECT COUNT(*) INTO v_doc_b_count
  FROM workspace_documents
  WHERE workspace_id = p_workspace_id AND doc_role = 'B';

  IF v_doc_count != 2 THEN
    RETURN jsonb_build_object(
      'valid', FALSE,
      'error', 'Coverage comparison requires exactly 2 documents',
      'doc_count', v_doc_count
    );
  END IF;

  IF v_doc_a_count != 1 OR v_doc_b_count != 1 THEN
    RETURN jsonb_build_object(
      'valid', FALSE,
      'error', 'Documents must have roles A and B assigned',
      'doc_a_count', v_doc_a_count,
      'doc_b_count', v_doc_b_count
    );
  END IF;

  RETURN jsonb_build_object(
    'valid', TRUE,
    'doc_count', v_doc_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get comparison summary for a workspace
CREATE OR REPLACE FUNCTION get_comparison_summary(p_workspace_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result comparison_results%ROWTYPE;
  v_snapshot_a policy_snapshots%ROWTYPE;
  v_snapshot_b policy_snapshots%ROWTYPE;
BEGIN
  SELECT * INTO v_result
  FROM comparison_results
  WHERE workspace_id = p_workspace_id;

  IF v_result IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT * INTO v_snapshot_a
  FROM policy_snapshots
  WHERE id = v_result.snapshot_a_id;

  SELECT * INTO v_snapshot_b
  FROM policy_snapshots
  WHERE id = v_result.snapshot_b_id;

  RETURN jsonb_build_object(
    'status', v_result.status,
    'total_differences', v_result.total_fields_compared - v_result.unchanged_count,
    'critical_count', v_result.critical_count,
    'high_count', v_result.high_count,
    'coverage_gaps', v_result.critical_gaps_count,
    'has_insured_mismatch', v_result.has_insured_mismatch,
    'has_carrier_mismatch', v_result.has_carrier_mismatch,
    'executive_summary', v_result.executive_summary,
    'snapshot_a', jsonb_build_object(
      'carrier', v_snapshot_a.detected_carrier,
      'doc_type', v_snapshot_a.detected_doc_type,
      'confidence', v_snapshot_a.extraction_confidence
    ),
    'snapshot_b', jsonb_build_object(
      'carrier', v_snapshot_b.detected_carrier,
      'doc_type', v_snapshot_b.detected_doc_type,
      'confidence', v_snapshot_b.extraction_confidence
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 11. GRANTS
-- ============================================

GRANT ALL ON comparison_evidence_catalog TO authenticated;
GRANT ALL ON policy_snapshots TO authenticated;
GRANT ALL ON comparison_results TO authenticated;
GRANT ALL ON comparison_reports TO authenticated;
GRANT ALL ON comparison_prompt_runs TO authenticated;
GRANT ALL ON comparison_qa_sessions TO authenticated;
GRANT EXECUTE ON FUNCTION validate_comparison_documents TO authenticated;
GRANT EXECUTE ON FUNCTION get_comparison_summary TO authenticated;
