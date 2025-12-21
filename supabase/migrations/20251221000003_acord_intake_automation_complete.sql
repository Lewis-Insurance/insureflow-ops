-- ============================================
-- ACORD INTAKE AUTOMATION - COMPLETE SYSTEM
-- Evidence-backed, multi-candidate extraction pipeline
-- ============================================

-- ============================================
-- 0. DOCUMENT QUALITY SCORING
-- Pre-upload and early upload quality assessment
-- ============================================

CREATE TABLE IF NOT EXISTS document_quality_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID, -- Links to document_extractions after upload

  -- Quality Score (0-100)
  overall_score INTEGER NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  quality_tier TEXT NOT NULL CHECK (quality_tier IN ('excellent', 'good', 'acceptable', 'poor', 'unusable')),

  -- Individual Quality Dimensions (0-100 each)
  resolution_score INTEGER,
  resolution_dpi_estimate INTEGER,
  blur_score INTEGER, -- Higher = less blur
  glare_score INTEGER, -- Higher = less glare
  contrast_score INTEGER,
  cropping_score INTEGER, -- Higher = no cut-off
  orientation_score INTEGER, -- 100 = correct, lower if rotated

  -- Document Source Classification
  source_type TEXT CHECK (source_type IN ('native_pdf', 'scanned_pdf', 'photo', 'screenshot', 'fax', 'unknown')),

  -- Quality Issues (array of specific problems)
  quality_issues JSONB DEFAULT '[]', -- [{code, severity, message, remediation}]

  -- Actionable Guidance for User
  user_guidance TEXT[], -- "Retake with better lighting", "Use scanner instead of phone"

  -- Processing Decision
  is_processable BOOLEAN DEFAULT TRUE,
  requires_acknowledgement BOOLEAN DEFAULT FALSE,
  user_acknowledged_at TIMESTAMPTZ,

  assessed_at TIMESTAMPTZ DEFAULT NOW(),
  assessment_method TEXT DEFAULT 'automated' -- automated, manual_override
);

-- ============================================
-- 1. DOCUMENT BUNDLE & PAGE MANAGEMENT
-- Split, classify, and manage document bundles
-- ============================================

-- Enhanced page-level tracking
CREATE TABLE IF NOT EXISTS document_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id UUID NOT NULL REFERENCES document_extractions(id) ON DELETE CASCADE,

  -- Page Identity
  page_index INTEGER NOT NULL, -- 0-based
  page_number INTEGER NOT NULL, -- 1-based for display

  -- Page Classification
  page_type TEXT DEFAULT 'content', -- content, cover_letter, email_body, junk, duplicate, blank
  page_type_confidence NUMERIC(5,4),
  is_document_boundary BOOLEAN DEFAULT FALSE, -- Marks start of new logical document
  logical_document_index INTEGER DEFAULT 0, -- Which logical doc in bundle

  -- Page-level Quality
  quality_score INTEGER,
  orientation_degrees INTEGER DEFAULT 0, -- 0, 90, 180, 270
  was_deskewed BOOLEAN DEFAULT FALSE,
  deskew_angle NUMERIC(5,2),

  -- Rendered Image
  rendered_image_url TEXT, -- PNG/JPEG at target DPI
  rendered_dpi INTEGER DEFAULT 300,
  width_px INTEGER,
  height_px INTEGER,

  -- Duplicate Detection
  content_hash TEXT, -- For deduplication
  is_duplicate_of UUID REFERENCES document_pages(id),

  -- Processing Status
  ocr_status TEXT DEFAULT 'pending', -- pending, processing, complete, failed
  ocr_completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_pages_extraction ON document_pages(extraction_id);
CREATE INDEX IF NOT EXISTS idx_document_pages_hash ON document_pages(content_hash);

-- ============================================
-- 2. OCR & LAYOUT GRAPH (Canonical Structure)
-- Normalized representation of Azure DI output
-- ============================================

-- Store raw Azure DI responses
CREATE TABLE IF NOT EXISTS ocr_raw_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES document_pages(id) ON DELETE CASCADE,

  -- Which model produced this
  model_id TEXT NOT NULL, -- prebuilt-document, prebuilt-invoice, prebuilt-layout, prebuilt-read
  api_version TEXT,

  -- Raw Response (compressed)
  raw_response JSONB NOT NULL,

  -- Metadata
  processing_time_ms INTEGER,
  word_count INTEGER,
  confidence_avg NUMERIC(5,4),

  processed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ocr_raw_page ON ocr_raw_responses(page_id);

-- Normalized Layout Graph - Words
CREATE TABLE IF NOT EXISTS layout_words (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES document_pages(id) ON DELETE CASCADE,
  ocr_source_id UUID NOT NULL REFERENCES ocr_raw_responses(id) ON DELETE CASCADE,

  -- Position in hierarchy
  line_index INTEGER,
  word_index INTEGER,

  -- Content
  content TEXT NOT NULL,

  -- Bounding Box (percentage of page, 0-100 scale)
  bbox_x NUMERIC(7,4) NOT NULL,
  bbox_y NUMERIC(7,4) NOT NULL,
  bbox_width NUMERIC(7,4) NOT NULL,
  bbox_height NUMERIC(7,4) NOT NULL,

  -- Or polygon for rotated text (array of x,y pairs)
  polygon JSONB,

  -- OCR Confidence
  confidence NUMERIC(5,4),

  -- Font/Style hints (if available)
  is_handwritten BOOLEAN DEFAULT FALSE,
  font_style TEXT, -- normal, bold, italic
  font_size_estimate NUMERIC(5,2)
);

CREATE INDEX IF NOT EXISTS idx_layout_words_page ON layout_words(page_id);
CREATE INDEX IF NOT EXISTS idx_layout_words_content ON layout_words USING gin(to_tsvector('english', content));

-- Normalized Layout Graph - Tables
CREATE TABLE IF NOT EXISTS layout_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES document_pages(id) ON DELETE CASCADE,

  -- Table position
  table_index INTEGER,
  row_count INTEGER,
  column_count INTEGER,

  -- Bounding box
  bbox_x NUMERIC(7,4),
  bbox_y NUMERIC(7,4),
  bbox_width NUMERIC(7,4),
  bbox_height NUMERIC(7,4),

  -- Table type hints
  has_header_row BOOLEAN DEFAULT FALSE,
  table_purpose TEXT -- schedule, limits, vehicles, drivers, claims, premiums
);

CREATE TABLE IF NOT EXISTS layout_table_cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES layout_tables(id) ON DELETE CASCADE,

  row_index INTEGER NOT NULL,
  column_index INTEGER NOT NULL,
  row_span INTEGER DEFAULT 1,
  column_span INTEGER DEFAULT 1,

  content TEXT,
  is_header BOOLEAN DEFAULT FALSE,

  bbox_x NUMERIC(7,4),
  bbox_y NUMERIC(7,4),
  bbox_width NUMERIC(7,4),
  bbox_height NUMERIC(7,4)
);

-- Key-Value Pairs from DI
CREATE TABLE IF NOT EXISTS layout_key_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES document_pages(id) ON DELETE CASCADE,

  key_content TEXT,
  key_bbox JSONB, -- {x, y, width, height}

  value_content TEXT,
  value_bbox JSONB,

  confidence NUMERIC(5,4),

  -- Normalized/parsed
  normalized_key TEXT, -- Standardized label
  normalized_value TEXT
);

CREATE INDEX IF NOT EXISTS idx_layout_kv_page ON layout_key_values(page_id);
CREATE INDEX IF NOT EXISTS idx_layout_kv_key ON layout_key_values(normalized_key);

-- Selection Marks / Checkboxes
CREATE TABLE IF NOT EXISTS layout_selection_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES document_pages(id) ON DELETE CASCADE,

  state TEXT CHECK (state IN ('selected', 'unselected', 'uncertain')),

  bbox_x NUMERIC(7,4),
  bbox_y NUMERIC(7,4),
  bbox_width NUMERIC(7,4),
  bbox_height NUMERIC(7,4),

  -- Associated label (nearby text)
  associated_label TEXT,
  label_position TEXT -- left, right, above, below
);

-- ============================================
-- 3. EVIDENCE OBJECTS
-- Every extracted value must have evidence
-- ============================================

CREATE TABLE IF NOT EXISTS extraction_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id UUID NOT NULL REFERENCES document_extractions(id) ON DELETE CASCADE,

  -- Source Location
  page_id UUID REFERENCES document_pages(id),
  page_index INTEGER,

  -- Bounding Box (percentage)
  bbox_x NUMERIC(7,4),
  bbox_y NUMERIC(7,4),
  bbox_width NUMERIC(7,4),
  bbox_height NUMERIC(7,4),

  -- Or word-level references
  word_ids UUID[], -- References to layout_words

  -- Source Text
  snippet_text TEXT NOT NULL,
  context_before TEXT, -- 50 chars before
  context_after TEXT, -- 50 chars after

  -- Extraction Method
  extraction_method TEXT NOT NULL, -- ocr_direct, key_value_pair, table_cell, template_coord, regex_match, label_proximity, llm_inference
  ocr_source TEXT, -- prebuilt-document, prebuilt-invoice, etc.

  -- Confidence
  ocr_confidence NUMERIC(5,4),
  extraction_confidence NUMERIC(5,4),

  -- Timestamps
  extracted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_extraction ON extraction_evidence(extraction_id);
CREATE INDEX IF NOT EXISTS idx_evidence_page ON extraction_evidence(page_id);

-- ============================================
-- 4. CANDIDATE GENERATION
-- Multiple candidates per field with scoring
-- ============================================

CREATE TABLE IF NOT EXISTS field_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id UUID NOT NULL REFERENCES document_extractions(id) ON DELETE CASCADE,

  -- Target Field
  acord_field_name TEXT NOT NULL,
  target_form_number TEXT, -- 125, 126, etc.

  -- Candidate Value
  raw_value TEXT NOT NULL,
  normalized_value TEXT, -- After normalization

  -- Evidence (multiple pieces)
  evidence_ids UUID[] NOT NULL, -- References to extraction_evidence

  -- Scoring Components
  score_overall NUMERIC(5,4) NOT NULL,
  score_ocr_confidence NUMERIC(5,4),
  score_label_proximity NUMERIC(5,4), -- How close to expected label
  score_format_match NUMERIC(5,4), -- Regex/format validation
  score_location_prior NUMERIC(5,4), -- Expected zone on page
  score_template_match NUMERIC(5,4), -- Coordinate extraction
  score_context_anchor NUMERIC(5,4), -- Matches account context

  -- Scoring Metadata
  scoring_weights JSONB, -- Weights used for this extraction
  scoring_version TEXT,

  -- Ranking
  rank INTEGER, -- 1 = best candidate
  is_selected BOOLEAN DEFAULT FALSE, -- Final chosen value
  selection_method TEXT, -- auto_highest, user_selected, llm_selected

  -- Validation Results
  validation_passed BOOLEAN,
  validation_errors JSONB, -- [{code, message, severity}]

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidates_extraction ON field_candidates(extraction_id);
CREATE INDEX IF NOT EXISTS idx_candidates_field ON field_candidates(acord_field_name);
CREATE INDEX IF NOT EXISTS idx_candidates_selected ON field_candidates(extraction_id, is_selected) WHERE is_selected = TRUE;

-- ============================================
-- 5. ACORD FIELD MAP OUTPUT (Schema-Driven)
-- Final output per field with full provenance
-- ============================================

CREATE TABLE IF NOT EXISTS acord_field_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id UUID NOT NULL REFERENCES document_extractions(id) ON DELETE CASCADE,
  acord_form_id UUID REFERENCES acord_forms(id),

  -- Field Identity
  field_name TEXT NOT NULL,
  form_number TEXT,
  section_number INTEGER,

  -- Values
  raw_value TEXT,
  normalized_value TEXT,
  display_value TEXT, -- Formatted for display

  -- Status (core requirement)
  status TEXT NOT NULL CHECK (status IN (
    'AUTO_APPLIED',      -- >= 0.90 confidence, auto-filled
    'NEEDS_REVIEW',      -- 0.70-0.89, quick review
    'NEEDS_VERIFICATION',-- < 0.70, manual check required
    'NOT_FOUND',         -- No evidence found
    'CONFLICT'           -- Multiple conflicting values
  )),

  -- Confidence (calibrated)
  confidence_raw NUMERIC(5,4),
  confidence_calibrated NUMERIC(5,4), -- Adjusted based on historical accuracy

  -- Evidence Trail
  evidence_ids UUID[] NOT NULL DEFAULT '{}',
  primary_evidence_id UUID REFERENCES extraction_evidence(id),

  -- Candidates (if multiple)
  candidate_ids UUID[] DEFAULT '{}',
  selected_candidate_id UUID REFERENCES field_candidates(id),

  -- Conflict Info
  conflict_candidates UUID[], -- Candidates that conflict
  conflict_reason TEXT,
  conflict_resolution_method TEXT, -- user_selected, rule_applied, llm_resolved

  -- Validation Results
  validations JSONB DEFAULT '[]', -- [{rule, passed, message, severity}]
  is_valid BOOLEAN,

  -- Audit
  auto_applied_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  edited_value TEXT, -- If user changed it
  edit_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(extraction_id, field_name, form_number)
);

CREATE INDEX IF NOT EXISTS idx_acord_outputs_extraction ON acord_field_outputs(extraction_id);
CREATE INDEX IF NOT EXISTS idx_acord_outputs_status ON acord_field_outputs(status);
CREATE INDEX IF NOT EXISTS idx_acord_outputs_needs_review ON acord_field_outputs(extraction_id)
  WHERE status IN ('NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'CONFLICT');

-- ============================================
-- 6. REVIEW QUEUE (Enhanced)
-- Micro-questions and clickable highlights
-- ============================================

CREATE TABLE IF NOT EXISTS review_queue_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id UUID NOT NULL REFERENCES document_extractions(id) ON DELETE CASCADE,
  field_output_id UUID NOT NULL REFERENCES acord_field_outputs(id) ON DELETE CASCADE,

  -- Prioritization
  priority_score INTEGER NOT NULL, -- 0-100, higher = more urgent
  priority_factors JSONB, -- Why this priority

  -- Review Type
  review_type TEXT NOT NULL CHECK (review_type IN (
    'quick_confirm',    -- Just verify the value is correct
    'select_candidate', -- Choose from multiple options
    'resolve_conflict', -- Conflicting values need resolution
    'manual_entry',     -- No candidates, need manual input
    'verify_low_conf'   -- Low confidence, careful review
  )),

  -- Micro-Question (user-facing)
  question_text TEXT NOT NULL,
  question_context TEXT,

  -- Choices (for select_candidate / resolve_conflict)
  choices JSONB, -- [{id, label, value, evidence_snippet, confidence}]

  -- Evidence Highlight Info
  highlight_page_index INTEGER,
  highlight_bbox JSONB, -- {x, y, width, height}
  highlight_word_ids UUID[],

  -- Queue Status
  queue_status TEXT DEFAULT 'pending' CHECK (queue_status IN ('pending', 'in_progress', 'completed', 'skipped')),
  assigned_to UUID REFERENCES profiles(id),

  -- Resolution
  resolution_choice_id TEXT, -- Which choice was selected
  resolution_value TEXT, -- Final value
  resolution_method TEXT, -- user_selected, user_typed, marked_not_found
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,

  -- Timing
  time_to_resolve_ms INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_queue_extraction ON review_queue_items(extraction_id);
CREATE INDEX IF NOT EXISTS idx_review_queue_pending ON review_queue_items(queue_status) WHERE queue_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_review_queue_assigned ON review_queue_items(assigned_to) WHERE queue_status IN ('pending', 'in_progress');

-- ============================================
-- 7. VALIDATION ENGINE RULES
-- Configurable validation rules
-- ============================================

CREATE TABLE IF NOT EXISTS validation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Rule Identity
  rule_code TEXT UNIQUE NOT NULL,
  rule_name TEXT NOT NULL,
  rule_description TEXT,

  -- Scope
  applies_to_fields TEXT[], -- Which ACORD fields
  applies_to_forms TEXT[], -- Which form numbers (empty = all)
  applies_to_doc_types TEXT[], -- Which document types

  -- Rule Type
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'format',           -- Regex/format validation
    'range',            -- Numeric range
    'enum',             -- Allowed values
    'required',         -- Must be present
    'conditional',      -- Required if another field has value
    'cross_field',      -- Relationship between fields
    'consistency',      -- Logical consistency
    'external'          -- External lookup/verification
  )),

  -- Rule Configuration
  rule_config JSONB NOT NULL, -- Type-specific config

  -- Error Handling
  severity TEXT DEFAULT 'error' CHECK (severity IN ('error', 'warning', 'info')),
  error_message_template TEXT,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed common validation rules
INSERT INTO validation_rules (rule_code, rule_name, rule_type, rule_config, applies_to_fields, severity) VALUES
-- Date validations
('DATE_FORMAT', 'Date Format Check', 'format', '{"pattern": "^(0[1-9]|1[0-2])/(0[1-9]|[12]\\d|3[01])/(19|20)\\d{2}$"}', ARRAY['EffectiveDate', 'ExpirationDate', 'RetroDate'], 'error'),
('DATE_ORDER', 'Effective Before Expiration', 'cross_field', '{"field1": "EffectiveDate", "field2": "ExpirationDate", "operator": "less_than"}', ARRAY['EffectiveDate', 'ExpirationDate'], 'error'),

-- Policy Number
('POLICY_NUM_FORMAT', 'Policy Number Format', 'format', '{"pattern": "^[A-Z0-9\\-]{5,30}$", "allow_spaces": false}', ARRAY['PolicyNumber'], 'warning'),

-- NAIC Code
('NAIC_FORMAT', 'NAIC Code Format', 'format', '{"pattern": "^\\d{5}$"}', ARRAY['CarrierNAIC'], 'error'),

-- FEIN
('FEIN_FORMAT', 'FEIN Format', 'format', '{"pattern": "^\\d{2}-\\d{7}$"}', ARRAY['FEIN'], 'warning'),

-- ZIP Code
('ZIP_FORMAT', 'ZIP Code Format', 'format', '{"pattern": "^\\d{5}(-\\d{4})?$"}', ARRAY['ZipCode', 'MailingZip'], 'error'),

-- Phone
('PHONE_FORMAT', 'Phone Format', 'format', '{"pattern": "^[\\d\\-\\(\\)\\s\\.]{10,20}$"}', ARRAY['Phone', 'Fax'], 'warning'),

-- Currency/Limits
('CURRENCY_POSITIVE', 'Currency Must Be Positive', 'range', '{"min": 0}', ARRAY['TotalPremium', 'GeneralAggregate', 'EachOccurrence', 'CombinedSingleLimit'], 'error'),
('AGGREGATE_GTE_OCCURRENCE', 'Aggregate >= Occurrence', 'cross_field', '{"field1": "GeneralAggregate", "field2": "EachOccurrence", "operator": "greater_than_or_equal"}', ARRAY['GeneralAggregate', 'EachOccurrence'], 'warning')

ON CONFLICT (rule_code) DO NOTHING;

-- ============================================
-- 8. ENHANCED CORRECTIONS (with error types)
-- ============================================

-- Add error_type to existing corrections table
ALTER TABLE extraction_corrections
  ADD COLUMN IF NOT EXISTS error_type TEXT CHECK (error_type IN (
    'OCR_ERROR',           -- OCR misread the text
    'WRONG_CANDIDATE',     -- Picked wrong candidate
    'MISSING_FIELD',       -- Field existed but wasn't found
    'FALSE_POSITIVE',      -- Extracted value that shouldn't exist
    'NORMALIZATION',       -- Value was correct but normalization failed
    'CONFLICT_RESOLUTION', -- Conflict resolved incorrectly
    'VALIDATION'           -- Validation rule was wrong
  )),
  ADD COLUMN IF NOT EXISTS user_highlighted_bbox JSONB, -- If user highlighted source
  ADD COLUMN IF NOT EXISTS layout_signature TEXT, -- For template learning
  ADD COLUMN IF NOT EXISTS model_versions JSONB; -- {ocr, llm, scoring} versions

-- ============================================
-- 9. ANALYTICS & CALIBRATION
-- ============================================

-- Confidence calibration data
CREATE TABLE IF NOT EXISTS confidence_calibration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Bucket
  confidence_bucket NUMERIC(3,2) NOT NULL, -- 0.00, 0.05, 0.10, ... 1.00
  field_category TEXT, -- Named Insured fields, Date fields, Limit fields, etc.
  carrier_pattern TEXT, -- Carrier name pattern or 'ALL'
  doc_type TEXT,

  -- Observed Accuracy
  sample_count INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  observed_accuracy NUMERIC(5,4) GENERATED ALWAYS AS (
    CASE WHEN sample_count > 0 THEN correct_count::NUMERIC / sample_count ELSE NULL END
  ) STORED,

  -- Calibration Adjustment
  calibration_factor NUMERIC(5,4) DEFAULT 1.0, -- Multiply raw confidence by this

  -- Time Period
  period_start DATE,
  period_end DATE,

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(confidence_bucket, field_category, carrier_pattern, doc_type)
);

-- Extraction performance scorecard
CREATE TABLE IF NOT EXISTS extraction_scorecard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Time Bucket
  date DATE NOT NULL,
  hour INTEGER, -- For hourly granularity if needed

  -- Dimensions
  carrier_name TEXT,
  doc_type TEXT,
  form_number TEXT,
  field_name TEXT, -- NULL for aggregate metrics

  -- Volume Metrics
  extraction_count INTEGER DEFAULT 0,
  field_count INTEGER DEFAULT 0,

  -- Accuracy Metrics
  auto_applied_count INTEGER DEFAULT 0,
  needs_review_count INTEGER DEFAULT 0,
  needs_verification_count INTEGER DEFAULT 0,
  not_found_count INTEGER DEFAULT 0,
  conflict_count INTEGER DEFAULT 0,

  -- Correction Metrics
  correction_count INTEGER DEFAULT 0,
  ocr_error_count INTEGER DEFAULT 0,
  wrong_candidate_count INTEGER DEFAULT 0,

  -- Timing Metrics
  avg_extraction_time_ms INTEGER,
  avg_review_time_ms INTEGER,
  p50_review_time_ms INTEGER,
  p95_review_time_ms INTEGER,

  -- Quality Metrics
  avg_confidence NUMERIC(5,4),
  calibrated_accuracy NUMERIC(5,4),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(date, hour, carrier_name, doc_type, form_number, field_name)
);

CREATE INDEX IF NOT EXISTS idx_scorecard_date ON extraction_scorecard(date);
CREATE INDEX IF NOT EXISTS idx_scorecard_carrier ON extraction_scorecard(carrier_name);

-- Regression test corpus
CREATE TABLE IF NOT EXISTS regression_test_corpus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Test Case Identity
  test_case_name TEXT NOT NULL,
  test_case_description TEXT,

  -- Document (redacted/anonymized)
  document_url TEXT NOT NULL, -- Stored redacted document
  doc_type TEXT NOT NULL,
  carrier_pattern TEXT,

  -- Expected Outputs
  expected_fields JSONB NOT NULL, -- {field_name: {value, must_find, allow_variants[]}}

  -- Test Configuration
  is_critical BOOLEAN DEFAULT FALSE, -- Block deployment on failure
  priority INTEGER DEFAULT 50,

  -- Last Run Results
  last_run_at TIMESTAMPTZ,
  last_run_passed BOOLEAN,
  last_run_results JSONB,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 10. DOCUMENT TYPE CLASSIFIER
-- ML-based classification with user hints
-- ============================================

CREATE TABLE IF NOT EXISTS doc_type_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id UUID NOT NULL REFERENCES document_extractions(id) ON DELETE CASCADE,
  page_id UUID REFERENCES document_pages(id),

  -- Classification Result
  classified_type TEXT NOT NULL,
  confidence NUMERIC(5,4) NOT NULL,

  -- Alternative Types
  alternatives JSONB, -- [{type, confidence}]

  -- Signals Used
  keyword_signals JSONB, -- Keywords that contributed
  layout_signals JSONB, -- Layout patterns matched
  carrier_signals JSONB, -- Carrier-specific indicators

  -- User Hint
  user_provided_type TEXT,
  user_hint_conflicts BOOLEAN DEFAULT FALSE,
  user_confirmed_type TEXT,

  classified_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 11. TEMPLATE LAYOUT SIGNATURES
-- For template matching and drift detection
-- ============================================

ALTER TABLE carrier_document_templates
  ADD COLUMN IF NOT EXISTS layout_signature TEXT, -- Hash of stable anchors
  ADD COLUMN IF NOT EXISTS anchor_labels JSONB, -- [{label, x_percent, y_percent}]
  ADD COLUMN IF NOT EXISTS signature_version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS drift_detected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS drift_details JSONB;

-- ============================================
-- 12. REPROCESSING QUEUE
-- For targeted re-extraction
-- ============================================

CREATE TABLE IF NOT EXISTS reprocessing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id UUID NOT NULL REFERENCES document_extractions(id) ON DELETE CASCADE,

  -- What to reprocess
  reprocess_type TEXT NOT NULL CHECK (reprocess_type IN (
    'page_ocr',          -- Re-OCR specific page
    'region_ocr',        -- Re-OCR specific region/bbox
    'field_candidates',  -- Re-generate candidates for field
    'llm_mapping',       -- Re-run LLM mapping
    'full_extraction'    -- Full re-extraction
  )),

  -- Scope
  target_page_ids UUID[],
  target_field_names TEXT[],
  target_bbox JSONB, -- For region OCR

  -- Reason
  trigger_reason TEXT, -- low_confidence, user_request, validation_failure

  -- Configuration
  reprocess_config JSONB, -- Additional parameters

  -- Status
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,

  -- Results
  result_summary JSONB,
  error_message TEXT,

  queued_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- ============================================
-- 13. SECURITY & AUDIT
-- ============================================

-- Document access log
CREATE TABLE IF NOT EXISTS document_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What was accessed
  document_id UUID,
  extraction_id UUID REFERENCES document_extractions(id) ON DELETE SET NULL,
  page_id UUID,

  -- Who accessed
  user_id UUID REFERENCES profiles(id),
  user_email TEXT,
  user_role TEXT,

  -- Access Details
  access_type TEXT NOT NULL, -- view, download, edit, delete, export
  access_method TEXT, -- web_app, api, background_job
  ip_address INET,
  user_agent TEXT,

  -- What was seen/done
  fields_accessed TEXT[], -- Which fields were viewed
  action_details JSONB, -- Additional action info (sanitized)

  -- Timing
  accessed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_log_user ON document_access_log(user_id);
CREATE INDEX IF NOT EXISTS idx_access_log_document ON document_access_log(extraction_id);
CREATE INDEX IF NOT EXISTS idx_access_log_time ON document_access_log(accessed_at);

-- Retention policy configuration
CREATE TABLE IF NOT EXISTS data_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  policy_name TEXT UNIQUE NOT NULL,
  description TEXT,

  -- What it applies to
  applies_to_table TEXT NOT NULL,

  -- Retention Rules
  retention_days INTEGER NOT NULL,
  delete_after_retention BOOLEAN DEFAULT TRUE,
  archive_before_delete BOOLEAN DEFAULT TRUE,

  -- Exceptions
  exception_conditions JSONB, -- Conditions to keep longer

  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default retention policies
INSERT INTO data_retention_policies (policy_name, applies_to_table, retention_days, description) VALUES
('ocr_raw_responses', 'ocr_raw_responses', 90, 'Keep raw OCR responses for 90 days'),
('document_access_log', 'document_access_log', 365, 'Keep access logs for 1 year'),
('extraction_evidence', 'extraction_evidence', 730, 'Keep evidence for 2 years')
ON CONFLICT (policy_name) DO NOTHING;

-- ============================================
-- 14. RLS POLICIES
-- ============================================

ALTER TABLE document_quality_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocr_raw_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE layout_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE layout_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE layout_table_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE layout_key_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE layout_selection_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE acord_field_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_queue_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE confidence_calibration ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_scorecard ENABLE ROW LEVEL SECURITY;
ALTER TABLE regression_test_corpus ENABLE ROW LEVEL SECURITY;
ALTER TABLE doc_type_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE reprocessing_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_retention_policies ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first to avoid conflicts
DROP POLICY IF EXISTS "authenticated_access" ON document_quality_assessments;
DROP POLICY IF EXISTS "authenticated_access" ON document_pages;
DROP POLICY IF EXISTS "authenticated_access" ON ocr_raw_responses;
DROP POLICY IF EXISTS "authenticated_access" ON layout_words;
DROP POLICY IF EXISTS "authenticated_access" ON layout_tables;
DROP POLICY IF EXISTS "authenticated_access" ON layout_table_cells;
DROP POLICY IF EXISTS "authenticated_access" ON layout_key_values;
DROP POLICY IF EXISTS "authenticated_access" ON layout_selection_marks;
DROP POLICY IF EXISTS "authenticated_access" ON extraction_evidence;
DROP POLICY IF EXISTS "authenticated_access" ON field_candidates;
DROP POLICY IF EXISTS "authenticated_access" ON acord_field_outputs;
DROP POLICY IF EXISTS "authenticated_access" ON review_queue_items;
DROP POLICY IF EXISTS "authenticated_read_rules" ON validation_rules;
DROP POLICY IF EXISTS "authenticated_read_calibration" ON confidence_calibration;
DROP POLICY IF EXISTS "authenticated_read_scorecard" ON extraction_scorecard;
DROP POLICY IF EXISTS "authenticated_access" ON regression_test_corpus;
DROP POLICY IF EXISTS "authenticated_access" ON doc_type_classifications;
DROP POLICY IF EXISTS "authenticated_access" ON reprocessing_queue;
DROP POLICY IF EXISTS "authenticated_insert_log" ON document_access_log;
DROP POLICY IF EXISTS "authenticated_read_log" ON document_access_log;
DROP POLICY IF EXISTS "authenticated_read_retention" ON data_retention_policies;

-- Authenticated users can access their org's data
CREATE POLICY "authenticated_access" ON document_quality_assessments FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated_access" ON document_pages FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated_access" ON ocr_raw_responses FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated_access" ON layout_words FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated_access" ON layout_tables FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated_access" ON layout_table_cells FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated_access" ON layout_key_values FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated_access" ON layout_selection_marks FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated_access" ON extraction_evidence FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated_access" ON field_candidates FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated_access" ON acord_field_outputs FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated_access" ON review_queue_items FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated_read_rules" ON validation_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_calibration" ON confidence_calibration FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_scorecard" ON extraction_scorecard FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_access" ON regression_test_corpus FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated_access" ON doc_type_classifications FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated_access" ON reprocessing_queue FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated_insert_log" ON document_access_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_read_log" ON document_access_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_retention" ON data_retention_policies FOR SELECT TO authenticated USING (true);

-- ============================================
-- 15. HELPER FUNCTIONS
-- ============================================

-- Function to calculate calibrated confidence
CREATE OR REPLACE FUNCTION get_calibrated_confidence(
  p_raw_confidence NUMERIC,
  p_field_category TEXT,
  p_carrier TEXT DEFAULT NULL,
  p_doc_type TEXT DEFAULT NULL
) RETURNS NUMERIC AS $$
DECLARE
  v_bucket NUMERIC;
  v_factor NUMERIC;
BEGIN
  -- Round to nearest 0.05 bucket
  v_bucket := ROUND(p_raw_confidence * 20) / 20;

  -- Look up calibration factor
  SELECT calibration_factor INTO v_factor
  FROM confidence_calibration
  WHERE confidence_bucket = v_bucket
    AND (field_category = p_field_category OR field_category = 'ALL')
    AND (carrier_pattern = p_carrier OR carrier_pattern = 'ALL' OR p_carrier IS NULL)
    AND (doc_type = p_doc_type OR doc_type = 'ALL' OR p_doc_type IS NULL)
  ORDER BY
    CASE WHEN field_category = p_field_category THEN 0 ELSE 1 END,
    CASE WHEN carrier_pattern = p_carrier THEN 0 ELSE 1 END,
    CASE WHEN doc_type = p_doc_type THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_factor IS NULL THEN
    RETURN p_raw_confidence;
  END IF;

  RETURN LEAST(1.0, p_raw_confidence * v_factor);
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to generate review queue items
CREATE OR REPLACE FUNCTION generate_review_queue(
  p_extraction_id UUID
) RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_field RECORD;
BEGIN
  -- Generate queue items for fields needing review
  FOR v_field IN
    SELECT * FROM acord_field_outputs
    WHERE extraction_id = p_extraction_id
      AND status IN ('NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'CONFLICT')
  LOOP
    INSERT INTO review_queue_items (
      extraction_id,
      field_output_id,
      priority_score,
      review_type,
      question_text,
      highlight_page_index,
      highlight_bbox
    )
    SELECT
      p_extraction_id,
      v_field.id,
      CASE
        WHEN v_field.status = 'CONFLICT' THEN 90
        WHEN v_field.status = 'NEEDS_VERIFICATION' THEN 70
        ELSE 50
      END,
      CASE
        WHEN v_field.status = 'CONFLICT' THEN 'resolve_conflict'
        WHEN v_field.status = 'NEEDS_VERIFICATION' THEN 'verify_low_conf'
        WHEN array_length(v_field.candidate_ids, 1) > 1 THEN 'select_candidate'
        ELSE 'quick_confirm'
      END,
      CASE
        WHEN v_field.status = 'CONFLICT' THEN 'Multiple values found for ' || v_field.field_name || '. Which is correct?'
        WHEN v_field.status = 'NEEDS_VERIFICATION' THEN 'Please verify ' || v_field.field_name || ': "' || COALESCE(v_field.normalized_value, 'N/A') || '"'
        ELSE 'Confirm ' || v_field.field_name || ' is "' || COALESCE(v_field.normalized_value, 'N/A') || '"'
      END,
      e.page_index,
      jsonb_build_object('x', e.bbox_x, 'y', e.bbox_y, 'width', e.bbox_width, 'height', e.bbox_height)
    FROM extraction_evidence e
    WHERE e.id = v_field.primary_evidence_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Function to log document access
CREATE OR REPLACE FUNCTION log_document_access(
  p_extraction_id UUID,
  p_access_type TEXT,
  p_fields_accessed TEXT[] DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO document_access_log (
    extraction_id,
    user_id,
    access_type,
    access_method,
    fields_accessed,
    accessed_at
  ) VALUES (
    p_extraction_id,
    auth.uid(),
    p_access_type,
    'web_app',
    p_fields_accessed,
    NOW()
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 16. GRANTS
-- ============================================

GRANT ALL ON document_quality_assessments TO authenticated;
GRANT ALL ON document_pages TO authenticated;
GRANT ALL ON ocr_raw_responses TO authenticated;
GRANT ALL ON layout_words TO authenticated;
GRANT ALL ON layout_tables TO authenticated;
GRANT ALL ON layout_table_cells TO authenticated;
GRANT ALL ON layout_key_values TO authenticated;
GRANT ALL ON layout_selection_marks TO authenticated;
GRANT ALL ON extraction_evidence TO authenticated;
GRANT ALL ON field_candidates TO authenticated;
GRANT ALL ON acord_field_outputs TO authenticated;
GRANT ALL ON review_queue_items TO authenticated;
GRANT SELECT ON validation_rules TO authenticated;
GRANT SELECT ON confidence_calibration TO authenticated;
GRANT SELECT ON extraction_scorecard TO authenticated;
GRANT ALL ON regression_test_corpus TO authenticated;
GRANT ALL ON doc_type_classifications TO authenticated;
GRANT ALL ON reprocessing_queue TO authenticated;
GRANT INSERT, SELECT ON document_access_log TO authenticated;
GRANT SELECT ON data_retention_policies TO authenticated;

GRANT EXECUTE ON FUNCTION get_calibrated_confidence TO authenticated;
GRANT EXECUTE ON FUNCTION generate_review_queue TO authenticated;
GRANT EXECUTE ON FUNCTION log_document_access TO authenticated;
