-- ============================================================================
-- LEVITATE RELATIONSHIP MARKETING ENGINE - PHASE 1: TEMPLATE VERSIONING
-- ============================================================================
-- This migration adds versioning support to the existing email_templates
-- system and creates SMS template versioning.
-- ============================================================================

-- ============================================================================
-- 1. MARKETING EMAIL TEMPLATES (Enhanced from existing)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.marketing_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,

  -- Identification
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general' CHECK (category IN (
    'general', 'renewal', 'birthday', 'holiday', 'welcome',
    'cross_sell', 'retention', 'survey', 'review_request',
    'educational', 'newsletter', 'referral', 'policy_update'
  )),

  -- Classification
  message_classification TEXT DEFAULT 'marketing' CHECK (message_classification IN (
    'transactional', 'relationship', 'marketing'
  )),

  -- Current version pointer
  current_version_id UUID, -- Will reference marketing_email_template_versions

  -- Line of business targeting
  applies_to_lines TEXT[], -- NULL = all

  -- AI generation tracking
  ai_generated BOOLEAN DEFAULT FALSE,
  ai_certified BOOLEAN DEFAULT FALSE, -- Approved for automated use
  ai_certification_by UUID REFERENCES public.profiles(id),
  ai_certification_at TIMESTAMPTZ,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_archived BOOLEAN DEFAULT FALSE,

  -- Usage tracking
  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  -- Audit
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_marketing_email_templates_org ON public.marketing_email_templates(org_id);
CREATE INDEX idx_marketing_email_templates_category ON public.marketing_email_templates(org_id, category) WHERE is_active = TRUE;

-- RLS
ALTER TABLE public.marketing_email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.marketing_email_templates
FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- ============================================================================
-- 2. MARKETING EMAIL TEMPLATE VERSIONS (IMMUTABLE)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.marketing_email_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  template_id UUID NOT NULL REFERENCES public.marketing_email_templates(id) ON DELETE CASCADE,

  -- Version tracking
  version_number INTEGER NOT NULL,

  -- Content (snapshot - never changes)
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,

  -- Merge fields used
  merge_fields_used TEXT[],

  -- Compliance snapshot
  compliance_validated BOOLEAN DEFAULT FALSE,
  compliance_validated_at TIMESTAMPTZ,
  compliance_issues JSONB, -- [{field: 'subject', issue: 'prohibited_phrase', phrase: 'guarantee'}]

  -- State-specific content
  state_variations JSONB, -- {CA: {footer: '...'}, TX: {footer: '...'}}

  -- Preview
  preview_text TEXT, -- First 100 chars for list display

  -- Audit
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(template_id, version_number)
);

CREATE INDEX idx_template_versions_template ON public.marketing_email_template_versions(template_id, version_number DESC);

-- RLS
ALTER TABLE public.marketing_email_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.marketing_email_template_versions
FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- PREVENT UPDATES (immutable versions)
REVOKE UPDATE ON public.marketing_email_template_versions FROM PUBLIC;
REVOKE UPDATE ON public.marketing_email_template_versions FROM authenticated;

-- Add FK from templates to versions
ALTER TABLE public.marketing_email_templates
  ADD CONSTRAINT marketing_email_templates_current_version_fkey
  FOREIGN KEY (current_version_id) REFERENCES public.marketing_email_template_versions(id);

-- ============================================================================
-- 3. MARKETING SMS TEMPLATES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.marketing_sms_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,

  name TEXT NOT NULL,
  category TEXT,

  -- Current version
  current_version_id UUID,

  -- 10DLC campaign association
  campaign_id TEXT, -- Twilio campaign ID
  campaign_purpose TEXT CHECK (campaign_purpose IN (
    'marketing', 'notifications', 'customer_care', 'delivery_notifications'
  )),

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  -- AI tracking
  ai_generated BOOLEAN DEFAULT FALSE,
  ai_certified BOOLEAN DEFAULT FALSE,

  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.marketing_sms_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.marketing_sms_templates
FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- ============================================================================
-- 4. MARKETING SMS TEMPLATE VERSIONS (IMMUTABLE)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.marketing_sms_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  template_id UUID NOT NULL REFERENCES public.marketing_sms_templates(id) ON DELETE CASCADE,

  version_number INTEGER NOT NULL,

  -- Content
  message_text TEXT NOT NULL,

  -- Segment analysis
  character_count INTEGER,
  segment_count INTEGER, -- Calculated based on encoding
  contains_unicode BOOLEAN DEFAULT FALSE,
  estimated_cost_cents INTEGER,

  -- Compliance
  compliance_validated BOOLEAN DEFAULT FALSE,

  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(template_id, version_number)
);

-- RLS
ALTER TABLE public.marketing_sms_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.marketing_sms_template_versions
FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- PREVENT UPDATES (immutable)
REVOKE UPDATE ON public.marketing_sms_template_versions FROM PUBLIC;
REVOKE UPDATE ON public.marketing_sms_template_versions FROM authenticated;

-- Add FK from templates to versions
ALTER TABLE public.marketing_sms_templates
  ADD CONSTRAINT marketing_sms_templates_current_version_fkey
  FOREIGN KEY (current_version_id) REFERENCES public.marketing_sms_template_versions(id);

-- ============================================================================
-- 5. FUNCTION: Create new template version
-- ============================================================================
CREATE OR REPLACE FUNCTION create_email_template_version(
  p_template_id UUID,
  p_subject TEXT,
  p_body_html TEXT,
  p_body_text TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_org_id UUID;
  v_next_version INTEGER;
  v_version_id UUID;
  v_merge_fields TEXT[];
BEGIN
  -- Get template org_id and next version number
  SELECT org_id INTO v_org_id FROM public.marketing_email_templates WHERE id = p_template_id;

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version
  FROM public.marketing_email_template_versions
  WHERE template_id = p_template_id;

  -- Extract merge fields from content
  SELECT ARRAY_AGG(DISTINCT m[1])
  INTO v_merge_fields
  FROM regexp_matches(p_body_html || ' ' || COALESCE(p_body_text, '') || ' ' || p_subject, '\{\{([^}]+)\}\}', 'g') AS m;

  -- Create version
  INSERT INTO public.marketing_email_template_versions (
    org_id,
    template_id,
    version_number,
    subject,
    body_html,
    body_text,
    merge_fields_used,
    preview_text,
    created_by
  ) VALUES (
    v_org_id,
    p_template_id,
    v_next_version,
    p_subject,
    p_body_html,
    p_body_text,
    v_merge_fields,
    LEFT(regexp_replace(p_body_text, E'\\s+', ' ', 'g'), 100),
    p_created_by
  ) RETURNING id INTO v_version_id;

  -- Update template to point to new version
  UPDATE public.marketing_email_templates
  SET current_version_id = v_version_id,
      updated_at = NOW()
  WHERE id = p_template_id;

  RETURN v_version_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. FUNCTION: Create new SMS template version
-- ============================================================================
CREATE OR REPLACE FUNCTION create_sms_template_version(
  p_template_id UUID,
  p_message_text TEXT,
  p_created_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_org_id UUID;
  v_next_version INTEGER;
  v_version_id UUID;
  v_char_count INTEGER;
  v_segment_count INTEGER;
  v_has_unicode BOOLEAN;
BEGIN
  -- Get template org_id
  SELECT org_id INTO v_org_id FROM public.marketing_sms_templates WHERE id = p_template_id;

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version
  FROM public.marketing_sms_template_versions
  WHERE template_id = p_template_id;

  -- Calculate SMS metrics
  v_char_count := LENGTH(p_message_text);
  v_has_unicode := p_message_text ~ '[^\x00-\x7F]';

  -- Segment calculation (simplified)
  IF v_has_unicode THEN
    v_segment_count := CEIL(v_char_count::DECIMAL / 70);
  ELSE
    IF v_char_count <= 160 THEN
      v_segment_count := 1;
    ELSE
      v_segment_count := CEIL(v_char_count::DECIMAL / 153);
    END IF;
  END IF;

  -- Create version
  INSERT INTO public.marketing_sms_template_versions (
    org_id,
    template_id,
    version_number,
    message_text,
    character_count,
    segment_count,
    contains_unicode,
    estimated_cost_cents,
    created_by
  ) VALUES (
    v_org_id,
    p_template_id,
    v_next_version,
    p_message_text,
    v_char_count,
    v_segment_count,
    v_has_unicode,
    v_segment_count * 1, -- $0.01 per segment estimate
    p_created_by
  ) RETURNING id INTO v_version_id;

  -- Update template to point to new version
  UPDATE public.marketing_sms_templates
  SET current_version_id = v_version_id,
      updated_at = NOW()
  WHERE id = p_template_id;

  RETURN v_version_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 7. FUNCTION: Validate template compliance
-- ============================================================================
CREATE OR REPLACE FUNCTION validate_template_compliance(
  p_version_id UUID,
  p_template_type TEXT DEFAULT 'email'
) RETURNS JSONB AS $$
DECLARE
  v_content TEXT;
  v_issues JSONB := '[]'::JSONB;
  v_phrase RECORD;
  v_org_id UUID;
BEGIN
  -- Get content based on type
  IF p_template_type = 'email' THEN
    SELECT org_id, subject || ' ' || body_html || ' ' || COALESCE(body_text, '')
    INTO v_org_id, v_content
    FROM public.marketing_email_template_versions
    WHERE id = p_version_id;
  ELSE
    SELECT org_id, message_text
    INTO v_org_id, v_content
    FROM public.marketing_sms_template_versions
    WHERE id = p_version_id;
  END IF;

  v_content := LOWER(v_content);

  -- Check prohibited phrases
  FOR v_phrase IN
    SELECT phrase, severity, reason
    FROM public.prohibited_phrases
    WHERE is_active = TRUE
      AND (org_id IS NULL OR org_id = v_org_id)
      AND (applies_to_channels IS NULL OR p_template_type = ANY(applies_to_channels))
  LOOP
    IF v_content LIKE '%' || LOWER(v_phrase.phrase) || '%' THEN
      v_issues := v_issues || jsonb_build_object(
        'field', 'content',
        'issue', 'prohibited_phrase',
        'phrase', v_phrase.phrase,
        'severity', v_phrase.severity,
        'reason', v_phrase.reason
      );
    END IF;
  END LOOP;

  -- Check for unresolved merge fields
  IF v_content ~ '\{\{[^}]*\}\}' THEN
    -- This is okay - merge fields are expected
    NULL;
  END IF;

  -- Update compliance status
  IF p_template_type = 'email' THEN
    UPDATE public.marketing_email_template_versions
    SET compliance_validated = TRUE,
        compliance_validated_at = NOW(),
        compliance_issues = v_issues
    WHERE id = p_version_id;
  ELSE
    UPDATE public.marketing_sms_template_versions
    SET compliance_validated = TRUE
    WHERE id = p_version_id;
  END IF;

  RETURN v_issues;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE public.marketing_email_templates IS 'Levitate: Email templates with versioning for marketing automations';
COMMENT ON TABLE public.marketing_email_template_versions IS 'Levitate: IMMUTABLE versions of email templates';
COMMENT ON TABLE public.marketing_sms_templates IS 'Levitate: SMS templates with versioning';
COMMENT ON TABLE public.marketing_sms_template_versions IS 'Levitate: IMMUTABLE versions of SMS templates';
