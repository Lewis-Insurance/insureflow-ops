-- ============================================
-- EXTRACTION INTELLIGENCE SYSTEM
-- Carrier templates, learning from corrections, review queues
-- ============================================

-- ============================================
-- 1. CARRIER DOCUMENT TEMPLATES
-- Store carrier-specific document layouts for high-confidence extraction
-- ============================================

CREATE TABLE IF NOT EXISTS carrier_document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Carrier info
  carrier_name TEXT NOT NULL,
  carrier_code TEXT, -- e.g., "TRAV" for Travelers

  -- Document type this template is for
  document_type TEXT NOT NULL, -- dec_page, application, endorsement, certificate
  line_of_business TEXT, -- GL, Auto, WC, Property, Package

  -- Template identification
  template_name TEXT NOT NULL,
  template_description TEXT,

  -- Sample document used to create template
  sample_document_url TEXT,
  sample_document_thumbnail TEXT,

  -- Template configuration
  page_count INTEGER DEFAULT 1,
  orientation TEXT DEFAULT 'portrait', -- portrait, landscape

  -- Matching criteria (how to identify this template)
  match_criteria JSONB DEFAULT '{}', -- text patterns, logo detection, etc.
  match_confidence_threshold NUMERIC(3,2) DEFAULT 0.85,

  -- Statistics
  times_matched INTEGER DEFAULT 0,
  avg_extraction_confidence NUMERIC(5,4) DEFAULT 0,
  last_matched_at TIMESTAMPTZ,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_verified BOOLEAN DEFAULT FALSE, -- manually verified by admin

  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Field zones within a template (where specific data appears)
CREATE TABLE IF NOT EXISTS template_field_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES carrier_document_templates(id) ON DELETE CASCADE,

  -- ACORD field this zone maps to
  acord_field_name TEXT NOT NULL,
  field_label TEXT, -- Human-readable label

  -- Zone location (percentage-based for scale independence)
  page_number INTEGER DEFAULT 1,
  zone_x_percent NUMERIC(5,2) NOT NULL, -- 0-100
  zone_y_percent NUMERIC(5,2) NOT NULL,
  zone_width_percent NUMERIC(5,2) NOT NULL,
  zone_height_percent NUMERIC(5,2) NOT NULL,

  -- Extraction hints
  field_type TEXT DEFAULT 'text', -- text, date, currency, checkbox, table
  expected_format TEXT, -- regex pattern for validation
  preprocessing TEXT[], -- operations like 'trim', 'uppercase', 'remove_currency_symbol'

  -- Confidence tracking
  extraction_success_rate NUMERIC(5,4) DEFAULT 0,
  times_extracted INTEGER DEFAULT 0,
  times_corrected INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for template matching
CREATE INDEX IF NOT EXISTS idx_carrier_templates_carrier ON carrier_document_templates(carrier_name);
CREATE INDEX IF NOT EXISTS idx_carrier_templates_type ON carrier_document_templates(document_type);
CREATE INDEX IF NOT EXISTS idx_carrier_templates_active ON carrier_document_templates(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_template_zones_template ON template_field_zones(template_id);

-- ============================================
-- 2. EXTRACTION LEARNING SYSTEM
-- Track corrections and build patterns over time
-- ============================================

-- Store every correction a user makes
CREATE TABLE IF NOT EXISTS extraction_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to original extraction
  extraction_id UUID NOT NULL REFERENCES document_extractions(id) ON DELETE CASCADE,

  -- What was corrected
  field_name TEXT NOT NULL,
  original_value TEXT,
  corrected_value TEXT NOT NULL,

  -- Context for learning
  source_text_snippet TEXT, -- The raw text around where value was extracted
  document_type TEXT,
  carrier_name TEXT,

  -- Was this a complete miss or wrong value?
  correction_type TEXT DEFAULT 'wrong_value', -- wrong_value, missed_field, false_positive

  -- Confidence of original extraction
  original_confidence NUMERIC(5,4),

  -- Who made the correction
  corrected_by UUID REFERENCES profiles(id),
  corrected_at TIMESTAMPTZ DEFAULT NOW()
);

-- Learned extraction rules (built from corrections)
CREATE TABLE IF NOT EXISTS extraction_learned_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Pattern matching
  source_pattern TEXT NOT NULL, -- What to look for in raw text
  pattern_type TEXT DEFAULT 'contains', -- exact, contains, regex, near_label

  -- Target field
  target_field TEXT NOT NULL,

  -- Scope (when to apply this rule)
  applies_to_carriers TEXT[], -- empty = all carriers
  applies_to_document_types TEXT[], -- empty = all types

  -- Extraction method
  extraction_method TEXT DEFAULT 'direct', -- direct, regex_group, offset, relative_position
  extraction_config JSONB DEFAULT '{}',

  -- Transform
  transform_pipeline TEXT[], -- e.g., ['trim', 'uppercase', 'format_date']

  -- Learning metadata
  learned_from_corrections INTEGER DEFAULT 1, -- how many corrections led to this rule
  confidence_score NUMERIC(5,4) DEFAULT 0.8,

  -- Performance tracking
  times_applied INTEGER DEFAULT 0,
  times_successful INTEGER DEFAULT 0,
  success_rate NUMERIC(5,4) GENERATED ALWAYS AS (
    CASE WHEN times_applied > 0 THEN times_successful::NUMERIC / times_applied ELSE 0 END
  ) STORED,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_verified BOOLEAN DEFAULT FALSE, -- manually approved

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for rule lookup
CREATE INDEX IF NOT EXISTS idx_learned_rules_active ON extraction_learned_rules(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_learned_rules_field ON extraction_learned_rules(target_field);
CREATE INDEX IF NOT EXISTS idx_corrections_extraction ON extraction_corrections(extraction_id);
CREATE INDEX IF NOT EXISTS idx_corrections_field ON extraction_corrections(field_name);

-- ============================================
-- 3. EXTRACTION REVIEW QUEUE
-- Track review status and priority
-- ============================================

-- Add review columns to document_extractions
ALTER TABLE document_extractions
  ADD COLUMN IF NOT EXISTS confidence_tier TEXT DEFAULT 'medium', -- high (>90%), medium (70-90%), low (<70%)
  ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending', -- pending, in_review, approved, rejected
  ADD COLUMN IF NOT EXISTS review_priority INTEGER DEFAULT 50, -- 0-100, higher = more urgent
  ADD COLUMN IF NOT EXISTS auto_applied_fields TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS needs_review_fields TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS flagged_fields TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS matched_template_id UUID REFERENCES carrier_document_templates(id),
  ADD COLUMN IF NOT EXISTS template_match_confidence NUMERIC(5,4);

-- Review assignments
CREATE TABLE IF NOT EXISTS extraction_review_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id UUID NOT NULL REFERENCES document_extractions(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES profiles(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  due_by TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT
);

-- ============================================
-- 4. EXTRACTION PROCESSING CONFIGURATION
-- Configure multi-model ensemble and preprocessing
-- ============================================

CREATE TABLE IF NOT EXISTS extraction_processing_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_name TEXT NOT NULL UNIQUE,

  -- Azure models to use
  azure_models TEXT[] DEFAULT ARRAY['prebuilt-document'],

  -- Preprocessing options
  enable_deskew BOOLEAN DEFAULT TRUE,
  enable_contrast_enhancement BOOLEAN DEFAULT TRUE,
  enable_noise_reduction BOOLEAN DEFAULT FALSE,
  split_multi_page BOOLEAN DEFAULT TRUE,

  -- Confidence thresholds
  auto_apply_threshold NUMERIC(3,2) DEFAULT 0.90,
  review_threshold NUMERIC(3,2) DEFAULT 0.70,
  reject_threshold NUMERIC(3,2) DEFAULT 0.40,

  -- Claude refinement
  enable_claude_refinement BOOLEAN DEFAULT TRUE,
  refinement_on_low_confidence BOOLEAN DEFAULT TRUE,
  max_refinement_attempts INTEGER DEFAULT 2,

  -- Template matching
  enable_template_matching BOOLEAN DEFAULT TRUE,
  template_match_threshold NUMERIC(3,2) DEFAULT 0.85,

  -- Learning
  enable_learning BOOLEAN DEFAULT TRUE,
  min_corrections_for_rule INTEGER DEFAULT 3,

  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default configuration
INSERT INTO extraction_processing_config (
  config_name,
  azure_models,
  is_default
) VALUES (
  'default',
  ARRAY['prebuilt-document', 'prebuilt-invoice', 'prebuilt-layout'],
  TRUE
) ON CONFLICT (config_name) DO NOTHING;

-- ============================================
-- 5. EXTRACTION ANALYTICS
-- Track extraction performance over time
-- ============================================

CREATE TABLE IF NOT EXISTS extraction_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Time bucket
  date DATE NOT NULL,

  -- Metrics
  total_extractions INTEGER DEFAULT 0,
  successful_extractions INTEGER DEFAULT 0,
  failed_extractions INTEGER DEFAULT 0,

  -- Confidence distribution
  high_confidence_count INTEGER DEFAULT 0,
  medium_confidence_count INTEGER DEFAULT 0,
  low_confidence_count INTEGER DEFAULT 0,

  -- Field-level metrics
  total_fields_extracted INTEGER DEFAULT 0,
  fields_auto_applied INTEGER DEFAULT 0,
  fields_manually_reviewed INTEGER DEFAULT 0,
  fields_corrected INTEGER DEFAULT 0,

  -- Template matching
  template_matched_count INTEGER DEFAULT 0,

  -- Learning
  new_rules_created INTEGER DEFAULT 0,
  rules_applied INTEGER DEFAULT 0,

  -- Average processing time
  avg_processing_time_ms INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(date)
);

-- ============================================
-- 6. RLS POLICIES
-- ============================================

ALTER TABLE carrier_document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_field_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_learned_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_review_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_processing_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_analytics ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read templates
CREATE POLICY "authenticated_read_templates" ON carrier_document_templates
FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_manage_templates" ON carrier_document_templates
FOR ALL TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_read_zones" ON template_field_zones
FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_manage_zones" ON template_field_zones
FOR ALL TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_manage_corrections" ON extraction_corrections
FOR ALL TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_read_rules" ON extraction_learned_rules
FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_manage_rules" ON extraction_learned_rules
FOR ALL TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_manage_assignments" ON extraction_review_assignments
FOR ALL TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_read_config" ON extraction_processing_config
FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_manage_config" ON extraction_processing_config
FOR ALL TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_read_analytics" ON extraction_analytics
FOR SELECT TO authenticated USING (true);

-- ============================================
-- 7. FUNCTIONS FOR LEARNING SYSTEM
-- ============================================

-- Function to record a correction and potentially create a learned rule
CREATE OR REPLACE FUNCTION record_extraction_correction(
  p_extraction_id UUID,
  p_field_name TEXT,
  p_original_value TEXT,
  p_corrected_value TEXT,
  p_source_snippet TEXT DEFAULT NULL,
  p_document_type TEXT DEFAULT NULL,
  p_carrier_name TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_correction_id UUID;
  v_similar_corrections INTEGER;
  v_rule_id UUID;
BEGIN
  -- Record the correction
  INSERT INTO extraction_corrections (
    extraction_id,
    field_name,
    original_value,
    corrected_value,
    source_text_snippet,
    document_type,
    carrier_name,
    corrected_by
  ) VALUES (
    p_extraction_id,
    p_field_name,
    p_original_value,
    p_corrected_value,
    p_source_snippet,
    p_document_type,
    p_carrier_name,
    auth.uid()
  ) RETURNING id INTO v_correction_id;

  -- Check if we have enough similar corrections to create a rule
  SELECT COUNT(*) INTO v_similar_corrections
  FROM extraction_corrections
  WHERE field_name = p_field_name
    AND corrected_value = p_corrected_value
    AND source_text_snippet IS NOT NULL
    AND source_text_snippet SIMILAR TO '%' || LEFT(p_source_snippet, 20) || '%';

  -- If we have 3+ similar corrections, create or update a learned rule
  IF v_similar_corrections >= 3 AND p_source_snippet IS NOT NULL THEN
    INSERT INTO extraction_learned_rules (
      source_pattern,
      pattern_type,
      target_field,
      applies_to_carriers,
      applies_to_document_types,
      learned_from_corrections
    ) VALUES (
      LEFT(p_source_snippet, 100),
      'contains',
      p_field_name,
      CASE WHEN p_carrier_name IS NOT NULL THEN ARRAY[p_carrier_name] ELSE '{}' END,
      CASE WHEN p_document_type IS NOT NULL THEN ARRAY[p_document_type] ELSE '{}' END,
      v_similar_corrections
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_rule_id;

    IF v_rule_id IS NOT NULL THEN
      RAISE NOTICE 'Created learned rule % from % corrections', v_rule_id, v_similar_corrections;
    END IF;
  END IF;

  RETURN v_correction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update template field zone statistics
CREATE OR REPLACE FUNCTION update_zone_statistics(
  p_zone_id UUID,
  p_was_successful BOOLEAN,
  p_was_corrected BOOLEAN
) RETURNS VOID AS $$
BEGIN
  UPDATE template_field_zones
  SET
    times_extracted = times_extracted + 1,
    times_corrected = times_corrected + CASE WHEN p_was_corrected THEN 1 ELSE 0 END,
    extraction_success_rate = CASE
      WHEN times_extracted > 0 THEN
        ((extraction_success_rate * times_extracted) + CASE WHEN p_was_successful THEN 1 ELSE 0 END) / (times_extracted + 1)
      ELSE
        CASE WHEN p_was_successful THEN 1 ELSE 0 END
    END
  WHERE id = p_zone_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 8. GRANTS
-- ============================================

GRANT ALL ON carrier_document_templates TO authenticated;
GRANT ALL ON template_field_zones TO authenticated;
GRANT ALL ON extraction_corrections TO authenticated;
GRANT ALL ON extraction_learned_rules TO authenticated;
GRANT ALL ON extraction_review_assignments TO authenticated;
GRANT SELECT ON extraction_processing_config TO authenticated;
GRANT SELECT ON extraction_analytics TO authenticated;
GRANT EXECUTE ON FUNCTION record_extraction_correction TO authenticated;
GRANT EXECUTE ON FUNCTION update_zone_statistics TO authenticated;
