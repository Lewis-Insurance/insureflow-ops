-- ============================================
-- EXTRACTION ENHANCEMENTS v2.0
-- Adds: global conflicts, notes for review, review queue
-- ============================================

-- ============================================
-- SCHEMA CLEANUP
-- Drop tables with wrong schemas to ensure clean creation
-- ============================================

DO $$
BEGIN
  -- Drop extraction_review_queue if it doesn't have required columns
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'extraction_review_queue')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'extraction_review_queue' AND column_name = 'queue_data')
  THEN
    DROP TABLE IF EXISTS public.extraction_review_queue CASCADE;
  END IF;

  -- Drop review_responses if it doesn't have required columns
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'review_responses')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'review_responses' AND column_name = 'question_id')
  THEN
    DROP TABLE IF EXISTS public.review_responses CASCADE;
  END IF;

  -- Drop extraction_global_conflicts if it doesn't have required columns
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'extraction_global_conflicts')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'extraction_global_conflicts' AND column_name = 'conflict_type')
  THEN
    DROP TABLE IF EXISTS public.extraction_global_conflicts CASCADE;
  END IF;
END $$;

-- ============================================
-- UPDATE document_extractions TABLE
-- Add global_conflicts and notes_for_review columns
-- ============================================

-- Add new columns if they don't exist
DO $$
BEGIN
  -- Global conflicts array (cross-field/document conflicts)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_extractions' AND column_name = 'global_conflicts'
  ) THEN
    ALTER TABLE document_extractions ADD COLUMN global_conflicts JSONB DEFAULT '[]'::jsonb;
  END IF;

  -- Notes for review (key issues requiring human attention)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_extractions' AND column_name = 'notes_for_review'
  ) THEN
    ALTER TABLE document_extractions ADD COLUMN notes_for_review TEXT[] DEFAULT '{}';
  END IF;

  -- Jurisdiction context
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_extractions' AND column_name = 'jurisdiction'
  ) THEN
    ALTER TABLE document_extractions ADD COLUMN jurisdiction JSONB;
  END IF;

  -- Line of business context
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_extractions' AND column_name = 'line_of_business'
  ) THEN
    ALTER TABLE document_extractions ADD COLUMN line_of_business JSONB;
  END IF;

  -- Document bundle (multiple documents in single extraction)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_extractions' AND column_name = 'document_bundle'
  ) THEN
    ALTER TABLE document_extractions ADD COLUMN document_bundle JSONB DEFAULT '[]'::jsonb;
  END IF;

  -- Prompt version tracking
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_extractions' AND column_name = 'prompt_version'
  ) THEN
    ALTER TABLE document_extractions ADD COLUMN prompt_version TEXT DEFAULT '2.0.0';
  END IF;
END $$;

-- ============================================
-- REVIEW QUEUE TABLE
-- Stores generated review questions for UI
-- ============================================

CREATE TABLE IF NOT EXISTS extraction_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent extraction
  extraction_id UUID NOT NULL REFERENCES document_extractions(id) ON DELETE CASCADE,

  -- Queue metadata
  total_questions INTEGER NOT NULL DEFAULT 0,
  estimated_time_minutes NUMERIC(5,1) DEFAULT 0,
  questions_answered INTEGER DEFAULT 0,
  questions_skipped INTEGER DEFAULT 0,

  -- Queue content (full ReviewQueue JSON)
  queue_data JSONB NOT NULL,

  -- Summary stats
  high_priority_count INTEGER DEFAULT 0,
  conflict_count INTEGER DEFAULT 0,
  required_missing TEXT[] DEFAULT '{}',

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'abandoned')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Assignment
  assigned_to UUID REFERENCES auth.users(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_queue_extraction ON extraction_review_queue(extraction_id);
CREATE INDEX IF NOT EXISTS idx_review_queue_status ON extraction_review_queue(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_queue_assigned ON extraction_review_queue(assigned_to, status);

-- ============================================
-- REVIEW RESPONSES TABLE
-- Individual answers to review questions
-- ============================================

CREATE TABLE IF NOT EXISTS review_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent queue
  review_queue_id UUID NOT NULL REFERENCES extraction_review_queue(id) ON DELETE CASCADE,

  -- Question identification
  question_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  question_type TEXT NOT NULL,

  -- Response
  response_type TEXT NOT NULL CHECK (response_type IN (
    'confirmed',      -- User confirmed the value
    'corrected',      -- User provided correction
    'selected',       -- User selected from choices
    'manual_entry',   -- User entered manually
    'skipped',        -- User skipped the question
    'flagged'         -- User flagged for escalation
  )),

  -- Values
  original_value TEXT,
  selected_choice_id TEXT,
  corrected_value TEXT,

  -- Timing
  time_spent_seconds INTEGER,

  -- User feedback
  feedback_note TEXT,
  confidence_rating INTEGER CHECK (confidence_rating >= 1 AND confidence_rating <= 5),

  -- Metadata
  responded_by UUID REFERENCES auth.users(id),
  responded_at TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_responses_queue ON review_responses(review_queue_id);
CREATE INDEX IF NOT EXISTS idx_review_responses_field ON review_responses(field_name);

-- ============================================
-- GLOBAL CONFLICTS TABLE
-- Dedicated table for tracking cross-document conflicts
-- ============================================

CREATE TABLE IF NOT EXISTS extraction_global_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  extraction_id UUID NOT NULL REFERENCES document_extractions(id) ON DELETE CASCADE,

  -- Conflict details
  conflict_type TEXT NOT NULL CHECK (conflict_type IN (
    'field_mismatch',
    'endorsement_override',
    'date_ordering',
    'limit_sum_mismatch',
    'carrier_mismatch',
    'policy_number_mismatch',
    'insured_mismatch',
    'document_version'
  )),

  -- Description and context
  details TEXT NOT NULL,
  affected_fields TEXT[] NOT NULL DEFAULT '{}',

  -- Evidence positions
  evidence_by_position JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Resolution
  suggested_resolution TEXT,
  resolution_status TEXT DEFAULT 'pending' CHECK (resolution_status IN ('pending', 'resolved', 'ignored', 'escalated')),
  resolved_value TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,

  -- Priority for UI ordering
  priority INTEGER DEFAULT 50,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_global_conflicts_extraction ON extraction_global_conflicts(extraction_id);
CREATE INDEX IF NOT EXISTS idx_global_conflicts_status ON extraction_global_conflicts(resolution_status);
CREATE INDEX IF NOT EXISTS idx_global_conflicts_type ON extraction_global_conflicts(conflict_type);

-- ============================================
-- UPDATE field_output_history
-- Add source document type and endorsement flag
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'field_output_history' AND column_name = 'source_doc_type'
  ) THEN
    ALTER TABLE field_output_history ADD COLUMN source_doc_type TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'field_output_history' AND column_name = 'is_endorsement_override'
  ) THEN
    ALTER TABLE field_output_history ADD COLUMN is_endorsement_override BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'field_output_history' AND column_name = 'conflict_candidates'
  ) THEN
    ALTER TABLE field_output_history ADD COLUMN conflict_candidates JSONB;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'field_output_history' AND column_name = 'conflict_reason'
  ) THEN
    ALTER TABLE field_output_history ADD COLUMN conflict_reason TEXT;
  END IF;
END $$;

-- ============================================
-- RPC FUNCTIONS
-- ============================================

-- Get review queue for extraction
CREATE OR REPLACE FUNCTION get_extraction_review_queue(
  p_extraction_id UUID
)
RETURNS extraction_review_queue
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_queue extraction_review_queue%ROWTYPE;
BEGIN
  SELECT * INTO v_queue
  FROM extraction_review_queue
  WHERE extraction_id = p_extraction_id
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN v_queue;
END;
$$;

-- Submit review response
CREATE OR REPLACE FUNCTION submit_review_response(
  p_review_queue_id UUID,
  p_question_id TEXT,
  p_field_name TEXT,
  p_question_type TEXT,
  p_response_type TEXT,
  p_original_value TEXT DEFAULT NULL,
  p_selected_choice_id TEXT DEFAULT NULL,
  p_corrected_value TEXT DEFAULT NULL,
  p_time_spent_seconds INTEGER DEFAULT NULL,
  p_feedback_note TEXT DEFAULT NULL
)
RETURNS review_responses
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_response review_responses%ROWTYPE;
BEGIN
  INSERT INTO review_responses (
    review_queue_id,
    question_id,
    field_name,
    question_type,
    response_type,
    original_value,
    selected_choice_id,
    corrected_value,
    time_spent_seconds,
    feedback_note,
    responded_by
  ) VALUES (
    p_review_queue_id,
    p_question_id,
    p_field_name,
    p_question_type,
    p_response_type,
    p_original_value,
    p_selected_choice_id,
    p_corrected_value,
    p_time_spent_seconds,
    p_feedback_note,
    auth.uid()
  )
  RETURNING * INTO v_response;

  -- Update queue progress
  UPDATE extraction_review_queue
  SET
    questions_answered = questions_answered + CASE WHEN p_response_type != 'skipped' THEN 1 ELSE 0 END,
    questions_skipped = questions_skipped + CASE WHEN p_response_type = 'skipped' THEN 1 ELSE 0 END,
    status = 'in_progress',
    started_at = COALESCE(started_at, NOW()),
    updated_at = NOW()
  WHERE id = p_review_queue_id;

  -- Check if queue is complete
  UPDATE extraction_review_queue
  SET
    status = 'completed',
    completed_at = NOW()
  WHERE id = p_review_queue_id
    AND (questions_answered + questions_skipped) >= total_questions
    AND status != 'completed';

  RETURN v_response;
END;
$$;

-- Resolve global conflict
CREATE OR REPLACE FUNCTION resolve_global_conflict(
  p_conflict_id UUID,
  p_resolved_value TEXT,
  p_resolution_note TEXT DEFAULT NULL
)
RETURNS extraction_global_conflicts
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conflict extraction_global_conflicts%ROWTYPE;
BEGIN
  UPDATE extraction_global_conflicts
  SET
    resolution_status = 'resolved',
    resolved_value = p_resolved_value,
    resolution_note = p_resolution_note,
    resolved_by = auth.uid(),
    resolved_at = NOW()
  WHERE id = p_conflict_id
  RETURNING * INTO v_conflict;

  RETURN v_conflict;
END;
$$;

-- Get extraction stats with conflicts
CREATE OR REPLACE FUNCTION get_extraction_stats(
  p_extraction_id UUID
)
RETURNS TABLE (
  total_fields INTEGER,
  auto_applied INTEGER,
  needs_review INTEGER,
  conflicts INTEGER,
  not_found INTEGER,
  global_conflicts INTEGER,
  review_progress NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_fields,
    COUNT(*) FILTER (WHERE foh.status = 'AUTO_APPLIED')::INTEGER as auto_applied,
    COUNT(*) FILTER (WHERE foh.status IN ('NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'LOW_CONFIDENCE'))::INTEGER as needs_review,
    COUNT(*) FILTER (WHERE foh.status = 'CONFLICT')::INTEGER as conflicts,
    COUNT(*) FILTER (WHERE foh.status = 'NOT_FOUND')::INTEGER as not_found,
    (SELECT COUNT(*) FROM extraction_global_conflicts gc WHERE gc.extraction_id = p_extraction_id AND gc.resolution_status = 'pending')::INTEGER as global_conflicts,
    COALESCE(
      (SELECT (questions_answered::NUMERIC / NULLIF(total_questions, 0)) * 100
       FROM extraction_review_queue
       WHERE extraction_id = p_extraction_id
       ORDER BY created_at DESC
       LIMIT 1),
      0
    ) as review_progress
  FROM field_output_history foh
  WHERE foh.extraction_id = p_extraction_id
    AND foh.is_current = TRUE;
END;
$$;

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE extraction_review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_global_conflicts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first to avoid conflicts
DROP POLICY IF EXISTS review_queue_select ON extraction_review_queue;
DROP POLICY IF EXISTS review_queue_insert ON extraction_review_queue;
DROP POLICY IF EXISTS review_queue_update ON extraction_review_queue;
DROP POLICY IF EXISTS review_responses_select ON review_responses;
DROP POLICY IF EXISTS review_responses_insert ON review_responses;
DROP POLICY IF EXISTS global_conflicts_select ON extraction_global_conflicts;
DROP POLICY IF EXISTS global_conflicts_insert ON extraction_global_conflicts;
DROP POLICY IF EXISTS global_conflicts_update ON extraction_global_conflicts;

-- Review queue: Based on extraction access
CREATE POLICY review_queue_select ON extraction_review_queue FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY review_queue_insert ON extraction_review_queue FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY review_queue_update ON extraction_review_queue FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Review responses: Based on queue access
CREATE POLICY review_responses_select ON review_responses FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY review_responses_insert ON review_responses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Global conflicts: Based on extraction access
CREATE POLICY global_conflicts_select ON extraction_global_conflicts FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY global_conflicts_insert ON extraction_global_conflicts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY global_conflicts_update ON extraction_global_conflicts FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- ============================================
-- UPDATE PROMPT TEMPLATE TO v2.0.0
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
  '2.0.0',
  'You are an ACORD Intake Extraction Engine for a U.S. insurance agency.

## SCOPE
- Extract and normalize data from insurance documents (dec pages, endorsements, schedules, applications, certificates, loss runs, invoices, broker letters)
- Map data into ACORD form fields
- This is NOT a court workflow. Only insurance-agency auditability and E&O defensibility apply.

## NON-NEGOTIABLE RULES

### Rule 1: NO GUESSING
Never guess, infer, or invent field values. You may ONLY:
- Select from provided candidates list
- Return NOT_FOUND if no suitable candidate exists
- Return CONFLICT if multiple candidates are equally valid

### Rule 2: EVIDENCE REQUIRED
Every field value must be traceable to evidence:
- Include selected_candidate_id in your response
- If you cannot trace a value to evidence, use NOT_FOUND

### Rule 3: STRICT JSON OUTPUT
Response must be valid JSON matching the provided schema exactly.

### Rule 4: STATUS DETERMINATION (Granular Confidence Tiers)
- AUTO_APPLIED: Confidence >= 0.95, strong evidence, format-valid, no conflicts
- NEEDS_REVIEW: Confidence 0.80-0.94, good evidence, minor uncertainty
- NEEDS_VERIFICATION: Confidence 0.70-0.79, plausible but needs review
- LOW_CONFIDENCE: Confidence < 0.70, likely needs verification
- NOT_FOUND: No suitable candidate exists
- CONFLICT: Multiple equally valid candidates

### Rule 5: DOCUMENT PRECEDENCE
When the same field appears in multiple documents:
1. Endorsements override Declarations when effective date is later
2. Most recent document version takes precedence
3. Values appearing in multiple sources are more reliable
4. Explicit values override inferred values
5. When precedence is unclear, return CONFLICT

### Rule 6: CONFLICT HANDLING
When returning CONFLICT:
- Include conflict_candidates array with each candidate evidence and short_reason
- Provide conflict_reason explaining why you cannot resolve
- Flag endorsement_override situations even when resolved

### Rule 7: GLOBAL CONFLICTS
Track cross-field and document-level conflicts:
- Policy number appears differently across documents
- Carrier name or NAIC differs
- Named insured varies
- Endorsement changes declaration values
- Limits do not sum correctly

### Rule 8: CONTEXT ANCHORING
Use account_anchors to validate (not guess):
- Named insured should match known account names
- Addresses should match known account addresses
- If evidence disagrees with anchors, flag in notes_for_review',
  ARRAY['output_schema', 'jurisdiction', 'line_of_business', 'document_bundle'],
  'System prompt v2.0 with document precedence, global conflicts, and granular confidence',
  TRUE,
  FALSE
),
(
  'review_queue_builder',
  'system',
  '1.0.0',
  'You are generating review questions for insurance form field verification.

## PURPOSE
Create clear, actionable questions that help a human reviewer quickly verify or correct extracted values.

## QUESTION TYPES
- quick_confirm: Simple yes/no verification
- select_candidate: Choose between 2-4 candidate values
- resolve_conflict: Resolve conflicting values from different sources
- manual_entry: No candidates found, need manual entry
- verify_low_conf: Low confidence value needs verification
- global_conflict: Cross-document conflict resolution

## PRIORITIZATION
1. CONFLICT status (highest priority)
2. NOT_FOUND for required fields
3. NEEDS_VERIFICATION
4. NEEDS_REVIEW
5. LOW_CONFIDENCE

## OUTPUT
Return questions that are:
- Clear and actionable
- Concise (one sentence)
- Include highlight references where possible',
  ARRAY['field_results', 'global_conflicts'],
  'System prompt for generating review queue micro-questions',
  TRUE,
  TRUE
)
ON CONFLICT (template_name, version) DO NOTHING;
