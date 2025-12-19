-- ============================================
-- ACORD FORM AUTOMATION SUITE v3.0
-- Migration: 20251218204626
-- ============================================

-- ACORD Form Templates (versioned, with field inventory)
CREATE TABLE IF NOT EXISTS acord_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_number VARCHAR(10) NOT NULL,
  form_name TEXT NOT NULL,
  version VARCHAR(20) NOT NULL,
  is_current BOOLEAN DEFAULT FALSE,
  effective_date DATE,
  sunset_date DATE,
  pdf_type VARCHAR(20) NOT NULL DEFAULT 'acroform',
  pdf_template_url TEXT NOT NULL,
  field_inventory JSONB NOT NULL DEFAULT '[]',
  field_schema JSONB NOT NULL DEFAULT '[]',
  section_definitions JSONB DEFAULT '[]',
  validation_rules JSONB DEFAULT '[]',
  signature_anchors JSONB DEFAULT '[]',
  repeater_configs JSONB DEFAULT '[]',
  template_source VARCHAR(20) NOT NULL DEFAULT 'acord_portal',
  license_notes TEXT,
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(form_number, version)
);

-- Ensure only one current template per form number
CREATE UNIQUE INDEX IF NOT EXISTS idx_acord_templates_current
ON acord_templates(form_number) WHERE is_current = TRUE;

-- Custom Intake Templates
CREATE TABLE IF NOT EXISTS intake_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  intake_type VARCHAR(20) DEFAULT 'acord',
  questions JSONB NOT NULL DEFAULT '[]',
  dynamic_sections JSONB DEFAULT '{}',
  settings JSONB DEFAULT '{}',
  branding JSONB DEFAULT '{}',
  is_published BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- First-Class Field Mappings (not embedded in JSONB)
CREATE TABLE IF NOT EXISTS intake_acord_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_template_id UUID REFERENCES intake_templates(id) ON DELETE CASCADE,
  intake_question_id TEXT NOT NULL,
  acord_form_number VARCHAR(10) NOT NULL,
  acord_field_name TEXT NOT NULL,
  transform_type VARCHAR(20) DEFAULT 'direct',
  transform_config JSONB DEFAULT '{}',
  is_repeater_field BOOLEAN DEFAULT FALSE,
  repeater_config_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(intake_template_id, intake_question_id, acord_form_number, acord_field_name)
);

CREATE INDEX IF NOT EXISTS idx_mappings_intake ON intake_acord_mappings(intake_template_id);
CREATE INDEX IF NOT EXISTS idx_mappings_acord ON intake_acord_mappings(acord_form_number);

-- Intake Submissions (secure tokens - store hash, not raw)
CREATE TABLE IF NOT EXISTS intake_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES intake_templates(id),
  account_id UUID REFERENCES accounts(id),
  access_token_hash VARCHAR(64) NOT NULL,
  token_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  responses JSONB DEFAULT '{}',
  draft_responses JSONB,
  last_draft_save TIMESTAMPTZ,
  client_name TEXT,
  client_email TEXT,
  client_ip INET,
  status VARCHAR(20) DEFAULT 'draft',
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intake_submissions_token ON intake_submissions(access_token_hash);
CREATE INDEX IF NOT EXISTS idx_intake_submissions_account ON intake_submissions(account_id);
CREATE INDEX IF NOT EXISTS idx_intake_submissions_status ON intake_submissions(status);

-- Rate Limiting for Public Intakes
CREATE TABLE IF NOT EXISTS intake_rate_limits (
  ip_address INET PRIMARY KEY,
  request_count INTEGER DEFAULT 1,
  first_request_at TIMESTAMPTZ DEFAULT NOW(),
  blocked_until TIMESTAMPTZ
);

-- Generated ACORD Forms
CREATE TABLE IF NOT EXISTS acord_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id),
  template_id UUID REFERENCES acord_templates(id),
  intake_submission_id UUID REFERENCES intake_submissions(id),
  field_values JSONB NOT NULL DEFAULT '{}',
  pdf_url TEXT,
  pdf_generated_at TIMESTAMPTZ,
  has_addendum BOOLEAN DEFAULT FALSE,
  addendum_url TEXT,
  cloned_from UUID REFERENCES acord_forms(id),
  signature_status VARCHAR(20) DEFAULT 'unsigned',
  signature_request_id TEXT,
  signed_pdf_url TEXT,
  signed_at TIMESTAMPTZ,
  submission_status VARCHAR(20) DEFAULT 'draft',
  submitted_to_carrier TEXT,
  submitted_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  row_version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acord_forms_account ON acord_forms(account_id);
CREATE INDEX IF NOT EXISTS idx_acord_forms_template ON acord_forms(template_id);
CREATE INDEX IF NOT EXISTS idx_acord_forms_status ON acord_forms(submission_status);

-- Section-Level Completion Tracking
CREATE TABLE IF NOT EXISTS acord_form_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acord_form_id UUID REFERENCES acord_forms(id) ON DELETE CASCADE,
  section_number INTEGER NOT NULL,
  section_name TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'incomplete',
  assigned_to UUID REFERENCES profiles(id),
  completed_by UUID REFERENCES profiles(id),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  UNIQUE(acord_form_id, section_number)
);

CREATE INDEX IF NOT EXISTS idx_acord_sections_form ON acord_form_sections(acord_form_id);
CREATE INDEX IF NOT EXISTS idx_acord_sections_assigned ON acord_form_sections(assigned_to);

-- Field-Level Audit Trail (E&O Protection)
CREATE TABLE IF NOT EXISTS acord_field_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acord_form_id UUID REFERENCES acord_forms(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  is_encrypted BOOLEAN DEFAULT FALSE,
  changed_by UUID REFERENCES profiles(id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  change_source VARCHAR(20) NOT NULL,
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_acord_audit_form ON acord_field_audit(acord_form_id);
CREATE INDEX IF NOT EXISTS idx_acord_audit_timestamp ON acord_field_audit(changed_at);
CREATE INDEX IF NOT EXISTS idx_acord_audit_field ON acord_field_audit(field_name);

-- Enrichment Cache (90-day TTL)
CREATE TABLE IF NOT EXISTS enrichment_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lookup_key TEXT NOT NULL,
  lookup_type VARCHAR(20) NOT NULL,
  data JSONB NOT NULL,
  source VARCHAR(50) NOT NULL,
  cost_cents INTEGER DEFAULT 0,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days'),
  UNIQUE(lookup_key, lookup_type)
);

CREATE INDEX IF NOT EXISTS idx_enrichment_cache_expiry ON enrichment_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_enrichment_cache_lookup ON enrichment_cache(lookup_key, lookup_type);

-- Enrichment Usage Tracking (for quotas)
CREATE TABLE IF NOT EXISTS enrichment_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  lookup_type VARCHAR(20) NOT NULL,
  lookup_key TEXT NOT NULL,
  cost_cents INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index on user_id and created_at for efficient monthly quota queries
CREATE INDEX IF NOT EXISTS idx_enrichment_usage_user_month
ON enrichment_usage(user_id, created_at);

-- Carrier Portal Registry
CREATE TABLE IF NOT EXISTS carrier_portals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_name TEXT NOT NULL,
  carrier_code VARCHAR(20),
  submission_url TEXT,
  portal_login_url TEXT,
  required_forms TEXT[] DEFAULT '{}',
  required_documents TEXT[] DEFAULT '{}',
  submission_checklist JSONB DEFAULT '[]',
  producer_codes JSONB DEFAULT '{}',
  validation_overrides JSONB DEFAULT '{}',
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_carrier_portals_active ON carrier_portals(is_active);

-- Carrier-Specific Field Requirements
CREATE TABLE IF NOT EXISTS carrier_field_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id UUID REFERENCES carrier_portals(id),
  acord_form_number VARCHAR(10) NOT NULL,
  field_name TEXT NOT NULL,
  requirement_type VARCHAR(20) NOT NULL,
  notes TEXT,
  UNIQUE(carrier_id, acord_form_number, field_name)
);

-- Submission Packages
CREATE TABLE IF NOT EXISTS submission_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id),
  carrier_id UUID REFERENCES carrier_portals(id),
  name TEXT NOT NULL,
  documents JSONB NOT NULL DEFAULT '[]',
  package_url TEXT,
  package_generated_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'draft',
  submitted_via VARCHAR(20),
  submitted_at TIMESTAMPTZ,
  submission_reference TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submission_packages_account ON submission_packages(account_id);
CREATE INDEX IF NOT EXISTS idx_submission_packages_carrier ON submission_packages(carrier_id);

-- PDF Generation Job Queue
CREATE TABLE IF NOT EXISTS acord_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key VARCHAR(64) UNIQUE,
  form_ids UUID[] NOT NULL,
  job_type VARCHAR(20) DEFAULT 'generate',
  requested_by UUID REFERENCES profiles(id),
  status VARCHAR(20) DEFAULT 'queued',
  current_form_id UUID,
  progress_percent INTEGER DEFAULT 0,
  attempt_count INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  next_attempt_at TIMESTAMPTZ,
  error_message TEXT,
  result_urls JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON acord_generation_jobs(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_requested ON acord_generation_jobs(requested_by);

-- Notifications
CREATE TABLE IF NOT EXISTS acord_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acord_form_id UUID REFERENCES acord_forms(id),
  notification_type VARCHAR(30) NOT NULL,
  recipient_id UUID REFERENCES profiles(id),
  sent_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acord_notifications_recipient ON acord_notifications(recipient_id, read_at);

-- ============================================
-- TRIGGERS
-- ============================================

-- Status Change Notification Trigger
CREATE OR REPLACE FUNCTION notify_acord_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.submission_status IS DISTINCT FROM NEW.submission_status THEN
    INSERT INTO acord_notifications (acord_form_id, notification_type, recipient_id)
    VALUES (NEW.id, 'status_' || NEW.submission_status, NEW.created_by);
  END IF;
  IF OLD.signature_status IS DISTINCT FROM NEW.signature_status THEN
    INSERT INTO acord_notifications (acord_form_id, notification_type, recipient_id)
    VALUES (NEW.id, 'signature_' || NEW.signature_status, NEW.created_by);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_acord_status_change ON acord_forms;
CREATE TRIGGER trg_acord_status_change
AFTER UPDATE ON acord_forms
FOR EACH ROW
EXECUTE FUNCTION notify_acord_status_change();

-- Updated At Trigger for acord_templates
CREATE OR REPLACE FUNCTION update_acord_template_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_acord_template_updated ON acord_templates;
CREATE TRIGGER trg_acord_template_updated
BEFORE UPDATE ON acord_templates
FOR EACH ROW
EXECUTE FUNCTION update_acord_template_timestamp();

-- Updated At Trigger for intake_templates
DROP TRIGGER IF EXISTS trg_intake_template_updated ON intake_templates;
CREATE TRIGGER trg_intake_template_updated
BEFORE UPDATE ON intake_templates
FOR EACH ROW
EXECUTE FUNCTION update_acord_template_timestamp();

-- Updated At Trigger for acord_forms
DROP TRIGGER IF EXISTS trg_acord_form_updated ON acord_forms;
CREATE TRIGGER trg_acord_form_updated
BEFORE UPDATE ON acord_forms
FOR EACH ROW
EXECUTE FUNCTION update_acord_template_timestamp();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE acord_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE acord_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE acord_field_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE acord_form_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrichment_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrichment_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE carrier_portals ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE acord_generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE acord_notifications ENABLE ROW LEVEL SECURITY;

-- ACORD Templates: Everyone can read, only admins can write
DROP POLICY IF EXISTS acord_templates_read ON acord_templates;
CREATE POLICY acord_templates_read ON acord_templates FOR SELECT USING (true);

DROP POLICY IF EXISTS acord_templates_write ON acord_templates;
CREATE POLICY acord_templates_write ON acord_templates FOR ALL
USING (auth.uid() IS NOT NULL);

-- Intake Templates: Users can manage their own
DROP POLICY IF EXISTS intake_templates_select ON intake_templates;
CREATE POLICY intake_templates_select ON intake_templates FOR SELECT USING (true);

DROP POLICY IF EXISTS intake_templates_insert ON intake_templates;
CREATE POLICY intake_templates_insert ON intake_templates FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS intake_templates_update ON intake_templates;
CREATE POLICY intake_templates_update ON intake_templates FOR UPDATE
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS intake_templates_delete ON intake_templates;
CREATE POLICY intake_templates_delete ON intake_templates FOR DELETE
USING (created_by = auth.uid());

-- Intake Submissions: Public can create (for intake portal), users can view their own
DROP POLICY IF EXISTS intake_submissions_select ON intake_submissions;
CREATE POLICY intake_submissions_select ON intake_submissions FOR SELECT USING (true);

DROP POLICY IF EXISTS intake_submissions_insert ON intake_submissions;
CREATE POLICY intake_submissions_insert ON intake_submissions FOR INSERT
WITH CHECK (true);

DROP POLICY IF EXISTS intake_submissions_update ON intake_submissions;
CREATE POLICY intake_submissions_update ON intake_submissions FOR UPDATE
USING (true);

-- ACORD Forms: Users can manage forms
DROP POLICY IF EXISTS acord_forms_all ON acord_forms;
CREATE POLICY acord_forms_all ON acord_forms FOR ALL
USING (auth.uid() IS NOT NULL);

-- Audit Trail: Read-only for authenticated users
DROP POLICY IF EXISTS acord_audit_select ON acord_field_audit;
CREATE POLICY acord_audit_select ON acord_field_audit FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS acord_audit_insert ON acord_field_audit;
CREATE POLICY acord_audit_insert ON acord_field_audit FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Form Sections: Users can manage
DROP POLICY IF EXISTS acord_sections_all ON acord_form_sections;
CREATE POLICY acord_sections_all ON acord_form_sections FOR ALL
USING (auth.uid() IS NOT NULL);

-- Enrichment Cache: All authenticated users can read/write
DROP POLICY IF EXISTS enrichment_cache_all ON enrichment_cache;
CREATE POLICY enrichment_cache_all ON enrichment_cache FOR ALL
USING (auth.uid() IS NOT NULL);

-- Enrichment Usage: Users can see their own
DROP POLICY IF EXISTS enrichment_usage_all ON enrichment_usage;
CREATE POLICY enrichment_usage_all ON enrichment_usage FOR ALL
USING (auth.uid() IS NOT NULL);

-- Carrier Portals: All can read
DROP POLICY IF EXISTS carrier_portals_all ON carrier_portals;
CREATE POLICY carrier_portals_all ON carrier_portals FOR ALL
USING (auth.uid() IS NOT NULL);

-- Submission Packages: Users can manage
DROP POLICY IF EXISTS submission_packages_all ON submission_packages;
CREATE POLICY submission_packages_all ON submission_packages FOR ALL
USING (auth.uid() IS NOT NULL);

-- Generation Jobs: Users can manage
DROP POLICY IF EXISTS generation_jobs_all ON acord_generation_jobs;
CREATE POLICY generation_jobs_all ON acord_generation_jobs FOR ALL
USING (auth.uid() IS NOT NULL);

-- Notifications: Users see their own
DROP POLICY IF EXISTS acord_notifications_select ON acord_notifications;
CREATE POLICY acord_notifications_select ON acord_notifications FOR SELECT
USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS acord_notifications_update ON acord_notifications;
CREATE POLICY acord_notifications_update ON acord_notifications FOR UPDATE
USING (recipient_id = auth.uid());

-- ============================================
-- VIEWS
-- ============================================

-- View: Current ACORD Templates Only
CREATE OR REPLACE VIEW current_acord_templates AS
SELECT * FROM acord_templates WHERE is_current = TRUE;

-- View: Form Completion Progress
CREATE OR REPLACE VIEW acord_form_progress AS
SELECT
  af.id,
  af.account_id,
  at.form_number,
  at.form_name,
  af.submission_status,
  af.signature_status,
  COUNT(afs.id) as total_sections,
  COUNT(CASE WHEN afs.status = 'complete' THEN 1 END) as completed_sections,
  ROUND(
    COUNT(CASE WHEN afs.status = 'complete' THEN 1 END)::numeric /
    NULLIF(COUNT(afs.id), 0) * 100,
    0
  ) as completion_percentage,
  af.created_at,
  af.updated_at
FROM acord_forms af
JOIN acord_templates at ON af.template_id = at.id
LEFT JOIN acord_form_sections afs ON af.id = afs.acord_form_id
GROUP BY af.id, af.account_id, at.form_number, at.form_name,
         af.submission_status, af.signature_status, af.created_at, af.updated_at;

-- View: Audit History with User Names
CREATE OR REPLACE VIEW acord_audit_history AS
SELECT
  afa.id,
  afa.acord_form_id,
  af.account_id,
  at.form_number,
  afa.field_name,
  afa.old_value,
  afa.new_value,
  afa.change_source,
  afa.changed_at,
  p.full_name as changed_by_name,
  afa.changed_by
FROM acord_field_audit afa
JOIN acord_forms af ON afa.acord_form_id = af.id
JOIN acord_templates at ON af.template_id = at.id
LEFT JOIN profiles p ON afa.changed_by = p.id
ORDER BY afa.changed_at DESC;

-- View: Enrichment Usage Summary
CREATE OR REPLACE VIEW enrichment_usage_summary AS
SELECT
  user_id,
  date_trunc('month', created_at) as month,
  lookup_type,
  COUNT(*) as lookup_count,
  SUM(cost_cents) as total_cost_cents
FROM enrichment_usage
GROUP BY user_id, date_trunc('month', created_at), lookup_type;

-- ============================================
-- SEED DATA: Common Carriers
-- ============================================

INSERT INTO carrier_portals (carrier_name, carrier_code, submission_url, portal_login_url, required_forms, notes, is_active)
VALUES
  ('Progressive Commercial', 'PROG', 'https://www.progressivecommercial.com', 'https://www.foragentsonly.com', ARRAY['125', '126', '127'], 'ForAgentsOnly portal', true),
  ('Hartford', 'HART', 'https://www.thehartford.com/business-insurance', 'https://agentservices.thehartford.com', ARRAY['125', '126', '140'], 'Agent services portal', true),
  ('Travelers', 'TRAV', 'https://www.travelers.com/small-business-insurance', 'https://agentservices.travelers.com', ARRAY['125', '126', '130', '140'], 'Agent services portal', true),
  ('Liberty Mutual', 'LIBM', 'https://business.libertymutual.com', 'https://www.libertymutualagent.com', ARRAY['125', '126', '127'], 'Liberty Mutual Agent portal', true),
  ('Nationwide', 'NATW', 'https://www.nationwide.com/business', 'https://agent.nationwide.com', ARRAY['125', '126', '127', '130'], 'Nationwide agent portal', true),
  ('CNA', 'CNA', 'https://www.cna.com', 'https://www.cnaagent.com', ARRAY['125', '126', '140'], 'CNA agent portal', true),
  ('AmTrust', 'AMTR', 'https://amtrustfinancial.com', 'https://agentlink.amtrustgroup.com', ARRAY['125', '130'], 'Workers comp focus', true),
  ('Markel', 'MARK', 'https://www.markel.com', 'https://markelonline.com', ARRAY['125', '126'], 'Specialty lines', true)
ON CONFLICT DO NOTHING;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE acord_templates IS 'Versioned ACORD form templates with field schemas and validation rules';
COMMENT ON TABLE intake_templates IS 'Custom client-facing intake forms that map to ACORD forms';
COMMENT ON TABLE intake_acord_mappings IS 'First-class field mappings between intake questions and ACORD fields';
COMMENT ON TABLE intake_submissions IS 'Client responses to intake forms with secure token access';
COMMENT ON TABLE acord_forms IS 'Generated ACORD forms with field values and signature/submission status';
COMMENT ON TABLE acord_field_audit IS 'Field-level change tracking for E&O protection';
COMMENT ON TABLE enrichment_cache IS '90-day cache for property/business/VIN enrichment data';
COMMENT ON TABLE enrichment_usage IS 'Track enrichment lookups per user for quota management';
COMMENT ON TABLE carrier_portals IS 'Registry of carrier submission portals and requirements';
COMMENT ON TABLE submission_packages IS 'Bundled documents for carrier submission';
COMMENT ON TABLE acord_generation_jobs IS 'Queue for background PDF generation jobs';
