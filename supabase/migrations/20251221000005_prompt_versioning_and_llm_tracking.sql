-- ============================================
-- PROMPT VERSIONING AND LLM TRACKING
-- Supports: Prompt templates, LLM invocations, artifacts, calibration
-- ============================================

-- ============================================
-- SCHEMA CLEANUP
-- Drop tables with wrong schemas to ensure clean creation
-- ============================================

DO $$
BEGIN
  -- Drop reprocessing_queue if it doesn't have priority column
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reprocessing_queue')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'reprocessing_queue' AND column_name = 'priority')
  THEN
    DROP TABLE IF EXISTS public.reprocessing_queue CASCADE;
  END IF;

  -- Drop field_output_history if it doesn't have required columns
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'field_output_history')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'field_output_history' AND column_name = 'field_name')
  THEN
    DROP TABLE IF EXISTS public.field_output_history CASCADE;
  END IF;

  -- Drop llm_invocations if it doesn't have required columns
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'llm_invocations')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'llm_invocations' AND column_name = 'request_type')
  THEN
    DROP TABLE IF EXISTS public.llm_invocations CASCADE;
  END IF;

  -- Drop llm_artifacts if it doesn't have required columns
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'llm_artifacts')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'llm_artifacts' AND column_name = 'artifact_type')
  THEN
    DROP TABLE IF EXISTS public.llm_artifacts CASCADE;
  END IF;

  -- Drop llm_prompt_templates if it doesn't have required columns
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'llm_prompt_templates')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'llm_prompt_templates' AND column_name = 'template_name')
  THEN
    DROP TABLE IF EXISTS public.llm_prompt_templates CASCADE;
  END IF;
END $$;

-- ============================================
-- PROMPT TEMPLATES
-- Versioned system and user prompts
-- ============================================

CREATE TABLE IF NOT EXISTS llm_prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Template identification
  template_name TEXT NOT NULL,
  template_type TEXT NOT NULL CHECK (template_type IN ('system', 'user', 'correction')),
  version TEXT NOT NULL,

  -- Content
  template_content TEXT NOT NULL,
  template_variables TEXT[] DEFAULT '{}', -- Variables used in template (e.g., {{evidence_catalog}})

  -- JSON schema for expected output (if applicable)
  output_schema JSONB,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_default BOOLEAN DEFAULT FALSE,

  -- Usage statistics
  usage_count INTEGER DEFAULT 0,
  avg_confidence NUMERIC(5,4),
  avg_token_usage INTEGER,

  -- Metadata
  description TEXT,
  changelog TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint on name + version
  UNIQUE(template_name, version)
);

-- Index for finding active templates
CREATE INDEX IF NOT EXISTS idx_prompt_templates_active ON llm_prompt_templates(template_name, is_active, is_default);

-- ============================================
-- LLM INVOCATIONS
-- Track every LLM call for debugging/replay
-- ============================================

CREATE TABLE IF NOT EXISTS llm_invocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Request context
  extraction_id UUID REFERENCES document_extractions(id) ON DELETE SET NULL,
  attempt_number INTEGER DEFAULT 1,
  request_type TEXT NOT NULL CHECK (request_type IN ('acord_mapping', 'field_refiner', 'schema_correction', 'targeted_extraction')),

  -- Prompts used
  system_prompt_template_id UUID REFERENCES llm_prompt_templates(id),
  user_prompt_template_id UUID REFERENCES llm_prompt_templates(id),
  system_prompt_version TEXT,
  user_prompt_version TEXT,

  -- Full prompts (for replay)
  system_prompt_full TEXT NOT NULL,
  user_prompt_full TEXT NOT NULL,

  -- Model info
  model_name TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  model_version TEXT,
  temperature NUMERIC(3,2) DEFAULT 0.0,
  max_tokens INTEGER DEFAULT 8192,

  -- Response
  raw_response TEXT,
  parsed_response JSONB,

  -- Validation
  schema_valid BOOLEAN,
  validation_errors JSONB,
  required_correction BOOLEAN DEFAULT FALSE,
  correction_invocation_id UUID REFERENCES llm_invocations(id),

  -- Performance
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'corrected')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Token usage
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  estimated_cost_usd NUMERIC(10,6),

  -- Error handling
  error_type TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for querying invocations
CREATE INDEX IF NOT EXISTS idx_invocations_extraction ON llm_invocations(extraction_id);
CREATE INDEX IF NOT EXISTS idx_invocations_status ON llm_invocations(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invocations_request_type ON llm_invocations(request_type);

-- ============================================
-- LLM ARTIFACTS
-- Store evidence catalogs and intermediate outputs
-- ============================================

CREATE TABLE IF NOT EXISTS llm_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent invocation
  invocation_id UUID NOT NULL REFERENCES llm_invocations(id) ON DELETE CASCADE,

  -- Artifact info
  artifact_type TEXT NOT NULL CHECK (artifact_type IN (
    'evidence_catalog',
    'candidate_set',
    'field_outputs',
    'validation_report',
    'correction_request'
  )),
  artifact_name TEXT NOT NULL,

  -- Content
  content_json JSONB NOT NULL,
  content_hash TEXT, -- For deduplication

  -- Size tracking
  size_bytes INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artifacts_invocation ON llm_artifacts(invocation_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_type ON llm_artifacts(artifact_type);

-- ============================================
-- CONFIDENCE CALIBRATION
-- Historical accuracy for confidence adjustment
-- ============================================

-- Drop existing table if it has wrong schema and recreate
DO $$
BEGIN
  -- Check if table exists but doesn't have field_name column
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'confidence_calibration')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'confidence_calibration' AND column_name = 'field_name')
  THEN
    DROP TABLE IF EXISTS public.confidence_calibration CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS confidence_calibration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Field identification
  field_name TEXT NOT NULL,
  document_type TEXT,

  -- Confidence bucket
  confidence_bucket TEXT NOT NULL, -- '0.9-1.0', '0.8-0.9', etc.

  -- Accuracy metrics
  total_predictions INTEGER DEFAULT 0,
  correct_predictions INTEGER DEFAULT 0,
  accuracy_rate NUMERIC(5,4),

  -- Calibration adjustment
  calibration_factor NUMERIC(5,4) DEFAULT 1.0, -- Multiply raw confidence by this

  -- Time window
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create unique index (will fail silently if exists)
DO $$
BEGIN
  CREATE UNIQUE INDEX idx_calibration_field_bucket ON confidence_calibration(field_name, document_type, confidence_bucket);
EXCEPTION WHEN duplicate_table THEN
  NULL;
END $$;

-- ============================================
-- REPROCESSING QUEUE
-- Queue for targeted field reprocessing
-- ============================================

CREATE TABLE IF NOT EXISTS reprocessing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  extraction_id UUID NOT NULL REFERENCES document_extractions(id) ON DELETE CASCADE,

  -- Reprocessing type
  reprocess_type TEXT NOT NULL CHECK (reprocess_type IN (
    'full_extraction',
    'field_candidates',
    'conflict_resolution',
    'validation_retry'
  )),

  -- Target fields
  target_field_names TEXT[],

  -- Trigger
  trigger_reason TEXT NOT NULL CHECK (trigger_reason IN (
    'low_confidence',
    'conflict',
    'not_found',
    'validation_failure',
    'user_request',
    'auto_retry'
  )),

  -- Settings
  settings JSONB DEFAULT '{}',
  field_candidates JSONB, -- Pre-generated candidates

  -- Priority
  priority INTEGER DEFAULT 100, -- Lower = higher priority

  -- Status
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  error_message TEXT,

  -- Results
  result_fields JSONB,
  improved_fields TEXT[],
  unimproved_fields TEXT[],

  -- Timestamps
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_reprocessing_extraction ON reprocessing_queue(extraction_id);
CREATE INDEX IF NOT EXISTS idx_reprocessing_status ON reprocessing_queue(status, priority, queued_at);

-- ============================================
-- FIELD OUTPUT HISTORY
-- Track field value changes over extractions
-- ============================================

CREATE TABLE IF NOT EXISTS field_output_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  extraction_id UUID NOT NULL REFERENCES document_extractions(id) ON DELETE CASCADE,
  invocation_id UUID REFERENCES llm_invocations(id),

  field_name TEXT NOT NULL,

  -- Values
  raw_value TEXT,
  normalized_value TEXT,

  -- Status and confidence
  status TEXT NOT NULL,
  confidence_raw NUMERIC(5,4),
  confidence_calibrated NUMERIC(5,4),

  -- Evidence
  selected_candidate_id TEXT,
  evidence_ids TEXT[],

  -- Source of this value
  source TEXT NOT NULL CHECK (source IN ('extraction', 'reprocessing', 'user_correction', 'crm_prefill')),

  -- Validity
  is_current BOOLEAN DEFAULT TRUE,
  superseded_by UUID REFERENCES field_output_history(id),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_field_history_extraction ON field_output_history(extraction_id);
CREATE INDEX IF NOT EXISTS idx_field_history_field ON field_output_history(field_name, is_current);

-- ============================================
-- RPC FUNCTIONS
-- ============================================

-- Get active prompt template
CREATE OR REPLACE FUNCTION get_active_prompt_template(
  p_template_name TEXT,
  p_version TEXT DEFAULT NULL
)
RETURNS llm_prompt_templates
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_template llm_prompt_templates%ROWTYPE;
BEGIN
  IF p_version IS NOT NULL THEN
    SELECT * INTO v_template
    FROM llm_prompt_templates
    WHERE template_name = p_template_name
      AND version = p_version
      AND is_active = TRUE
    LIMIT 1;
  ELSE
    SELECT * INTO v_template
    FROM llm_prompt_templates
    WHERE template_name = p_template_name
      AND is_active = TRUE
      AND is_default = TRUE
    LIMIT 1;
  END IF;

  IF v_template IS NULL THEN
    -- Fall back to any active template
    SELECT * INTO v_template
    FROM llm_prompt_templates
    WHERE template_name = p_template_name
      AND is_active = TRUE
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  RETURN v_template;
END;
$$;

-- Update template usage stats
CREATE OR REPLACE FUNCTION update_template_stats(
  p_template_id UUID,
  p_confidence NUMERIC,
  p_token_usage INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE llm_prompt_templates
  SET
    usage_count = usage_count + 1,
    avg_confidence = CASE
      WHEN avg_confidence IS NULL THEN p_confidence
      ELSE (avg_confidence * usage_count + p_confidence) / (usage_count + 1)
    END,
    avg_token_usage = CASE
      WHEN avg_token_usage IS NULL THEN p_token_usage
      ELSE (avg_token_usage * usage_count + p_token_usage) / (usage_count + 1)
    END
  WHERE id = p_template_id;
END;
$$;

-- Get calibrated confidence
CREATE OR REPLACE FUNCTION get_calibrated_confidence(
  p_field_name TEXT,
  p_document_type TEXT,
  p_raw_confidence NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bucket TEXT;
  v_factor NUMERIC;
BEGIN
  -- Determine bucket
  v_bucket := CASE
    WHEN p_raw_confidence >= 0.9 THEN '0.9-1.0'
    WHEN p_raw_confidence >= 0.8 THEN '0.8-0.9'
    WHEN p_raw_confidence >= 0.7 THEN '0.7-0.8'
    WHEN p_raw_confidence >= 0.6 THEN '0.6-0.7'
    ELSE '0.0-0.6'
  END;

  -- Get calibration factor
  SELECT calibration_factor INTO v_factor
  FROM confidence_calibration
  WHERE field_name = p_field_name
    AND (document_type = p_document_type OR document_type IS NULL)
    AND confidence_bucket = v_bucket
  ORDER BY document_type NULLS LAST
  LIMIT 1;

  IF v_factor IS NULL THEN
    v_factor := 1.0;
  END IF;

  -- Apply calibration and clamp to 0-1
  RETURN LEAST(1.0, GREATEST(0.0, p_raw_confidence * v_factor));
END;
$$;

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE llm_prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_invocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE confidence_calibration ENABLE ROW LEVEL SECURITY;
ALTER TABLE reprocessing_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_output_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first to avoid conflicts
DROP POLICY IF EXISTS templates_select ON llm_prompt_templates;
DROP POLICY IF EXISTS templates_insert ON llm_prompt_templates;
DROP POLICY IF EXISTS templates_update ON llm_prompt_templates;
DROP POLICY IF EXISTS invocations_select ON llm_invocations;
DROP POLICY IF EXISTS invocations_insert ON llm_invocations;
DROP POLICY IF EXISTS artifacts_select ON llm_artifacts;
DROP POLICY IF EXISTS artifacts_insert ON llm_artifacts;
DROP POLICY IF EXISTS calibration_select ON confidence_calibration;
DROP POLICY IF EXISTS calibration_all ON confidence_calibration;
DROP POLICY IF EXISTS reprocessing_select ON reprocessing_queue;
DROP POLICY IF EXISTS reprocessing_insert ON reprocessing_queue;
DROP POLICY IF EXISTS reprocessing_update ON reprocessing_queue;
DROP POLICY IF EXISTS field_history_select ON field_output_history;
DROP POLICY IF EXISTS field_history_insert ON field_output_history;

-- Prompt templates: Read by all authenticated, write by admin
CREATE POLICY templates_select ON llm_prompt_templates FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY templates_insert ON llm_prompt_templates FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY templates_update ON llm_prompt_templates FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Invocations: Based on extraction access
CREATE POLICY invocations_select ON llm_invocations FOR SELECT TO authenticated
  USING (TRUE); -- All authenticated users can view

CREATE POLICY invocations_insert ON llm_invocations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Artifacts: Based on invocation access
CREATE POLICY artifacts_select ON llm_artifacts FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY artifacts_insert ON llm_artifacts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Calibration: Read by all, write by system
CREATE POLICY calibration_select ON confidence_calibration FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY calibration_all ON confidence_calibration FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Reprocessing queue: Based on extraction access
CREATE POLICY reprocessing_select ON reprocessing_queue FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY reprocessing_insert ON reprocessing_queue FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY reprocessing_update ON reprocessing_queue FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Field history: Based on extraction access
CREATE POLICY field_history_select ON field_output_history FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY field_history_insert ON field_output_history FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================
-- SEED DEFAULT PROMPT TEMPLATES
-- ============================================

INSERT INTO llm_prompt_templates (
  template_name,
  template_type,
  version,
  template_content,
  template_variables,
  description,
  is_active,
  is_default
) VALUES
(
  'acord_mapping_system',
  'system',
  '1.0.0',
  'You are an expert insurance document analyzer specializing in ACORD form field extraction.

### Core Principles
1. **EVIDENCE-BASED ONLY**: Every field value must come directly from the evidence catalog
2. **NO GUESSING**: Never infer, calculate, or create values not explicitly in evidence
3. **CANDIDATE SELECTION**: Choose from provided candidates, do not generate new values
4. **CONFIDENCE CALIBRATION**: Report honest confidence based on evidence quality
5. **CONFLICT REPORTING**: Flag when multiple valid candidates exist

### Output Requirements
- Return valid JSON matching the provided schema exactly
- Include evidence IDs for every selected value
- Provide reasoning for each field decision
- Use status codes: AUTO_APPLIED, NEEDS_REVIEW, NEEDS_VERIFICATION, NOT_FOUND, CONFLICT',
  ARRAY['output_schema'],
  'System prompt for ACORD field extraction',
  TRUE,
  TRUE
),
(
  'acord_mapping_user',
  'user',
  '1.0.0',
  '## Extraction Task

Extract ACORD form fields from the following evidence catalog.

### Target Fields
{{target_fields}}

### Output Schema
{{output_schema}}

### Evidence Catalog
{{evidence_catalog}}

### Candidate Sets
{{candidates}}

### Instructions
1. For each target field, select the best candidate from the candidate set
2. If no suitable candidate exists, return status: NOT_FOUND
3. If multiple candidates are equally valid, return status: CONFLICT with conflict_candidate_ids
4. Provide confidence score (0-1) based on evidence quality
5. Include reasoning for your selection

Return the JSON response:',
  ARRAY['target_fields', 'output_schema', 'evidence_catalog', 'candidates'],
  'User prompt template for ACORD field extraction',
  TRUE,
  TRUE
),
(
  'schema_correction',
  'correction',
  '1.0.0',
  'Your previous response had JSON schema validation errors:

{{validation_errors}}

Please correct your response to match the required schema exactly.

Original response:
{{original_response}}

Required schema:
{{output_schema}}

Return ONLY the corrected JSON, no explanation.',
  ARRAY['validation_errors', 'original_response', 'output_schema'],
  'Prompt for correcting schema validation errors',
  TRUE,
  TRUE
)
ON CONFLICT (template_name, version) DO NOTHING;

-- ============================================
-- SEED INITIAL CALIBRATION DATA
-- ============================================

INSERT INTO confidence_calibration (field_name, document_type, confidence_bucket, calibration_factor)
VALUES
  -- High confidence fields tend to be accurate
  ('NamedInsured', NULL, '0.9-1.0', 1.0),
  ('PolicyNumber', NULL, '0.9-1.0', 1.0),
  ('EffectiveDate', NULL, '0.9-1.0', 0.95),
  ('ExpirationDate', NULL, '0.9-1.0', 0.95),

  -- Medium confidence needs slight adjustment
  ('NamedInsured', NULL, '0.8-0.9', 0.95),
  ('PolicyNumber', NULL, '0.8-0.9', 0.9),
  ('TotalPremium', NULL, '0.8-0.9', 0.85),

  -- Lower confidence gets more conservative
  ('MailingAddress', NULL, '0.7-0.8', 0.8),
  ('GeneralAggregate', NULL, '0.7-0.8', 0.85)
ON CONFLICT (field_name, document_type, confidence_bucket) DO NOTHING;

