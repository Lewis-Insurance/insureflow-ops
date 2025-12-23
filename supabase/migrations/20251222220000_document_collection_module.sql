-- ============================================================================
-- DOCUMENT COLLECTION MODULE
-- Client portal + email intake for document requests
-- ALIGNED with existing architecture: workspaces, documents, portal infrastructure
-- ============================================================================

-- ============================================================================
-- 1. COLLECTION REQUIREMENTS
-- Defines what documents are needed for a collection packet
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.collection_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Link to workspace (packet) with task_type = 'document_collection'
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Document type (matches our existing doc kinds)
  doc_type TEXT NOT NULL CHECK (doc_type IN (
    'acord_125', 'acord_126', 'acord_130', 'acord_131', 'acord_140',
    'loss_run', 'payment_doc', 'carrier_supplementary', 'statement_of_no_loss',
    'dec_page', 'prior_policy', 'id_card', 'certificate', 'application',
    'endorsement', 'invoice', 'signed_app', 'proof_of_prior', 'renewal_dec',
    'driver_license', 'mvr', 'photos', 'other'
  )),
  
  -- Requirement details
  label TEXT NOT NULL, -- Display label e.g. "Loss Runs (5 years)"
  instructions TEXT, -- Client-facing instructions
  is_required BOOLEAN DEFAULT TRUE,
  min_quantity INTEGER DEFAULT 1,
  max_quantity INTEGER DEFAULT 10,
  
  -- File constraints
  accepted_file_types TEXT[] DEFAULT ARRAY['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'],
  max_file_size_mb INTEGER DEFAULT 25,
  
  -- ACORD linkage (if this requirement feeds an ACORD form)
  acord_form_id UUID REFERENCES public.acord_forms(id) ON DELETE SET NULL,
  acord_template_id UUID REFERENCES public.acord_templates(id) ON DELETE SET NULL,
  
  -- Status tracking
  status TEXT DEFAULT 'not_requested' CHECK (status IN (
    'not_requested', 'requested', 'uploaded', 'processing', 
    'needs_review', 'accepted', 'rejected', 'expired'
  )),
  
  -- Ordering
  display_order INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collection_reqs_workspace ON collection_requirements(workspace_id);
CREATE INDEX IF NOT EXISTS idx_collection_reqs_status ON collection_requirements(status);
CREATE INDEX IF NOT EXISTS idx_collection_reqs_doc_type ON collection_requirements(doc_type);

-- ============================================================================
-- 2. COLLECTION UPLOADS
-- Links uploaded documents to specific requirements
-- Provides review workflow with audit trail
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.collection_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Links
  requirement_id UUID NOT NULL REFERENCES public.collection_requirements(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  extraction_id UUID REFERENCES public.document_extractions(id) ON DELETE SET NULL,
  
  -- Upload metadata
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size_bytes BIGINT,
  mime_type TEXT,
  storage_bucket TEXT DEFAULT 'customer-docs',
  
  -- Upload provenance
  upload_channel TEXT NOT NULL CHECK (upload_channel IN ('portal', 'email', 'agent_upload', 'api')),
  uploaded_by_portal_user_id UUID, -- If uploaded by client via portal
  uploaded_by_profile_id UUID REFERENCES public.profiles(id), -- If uploaded by agent
  uploader_ip INET,
  uploader_email TEXT,
  
  -- Processing status
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN (
    'pending', 'processing', 'extracted', 'failed'
  )),
  processing_started_at TIMESTAMPTZ,
  processing_completed_at TIMESTAMPTZ,
  processing_error TEXT,
  
  -- Review workflow
  review_status TEXT DEFAULT 'pending' CHECK (review_status IN (
    'pending', 'in_review', 'accepted', 'rejected', 'needs_changes'
  )),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  rejection_reason TEXT,
  
  -- Client-facing notes (shown on re-upload)
  client_feedback TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collection_uploads_requirement ON collection_uploads(requirement_id);
CREATE INDEX IF NOT EXISTS idx_collection_uploads_document ON collection_uploads(document_id);
CREATE INDEX IF NOT EXISTS idx_collection_uploads_review ON collection_uploads(review_status);
CREATE INDEX IF NOT EXISTS idx_collection_uploads_channel ON collection_uploads(upload_channel);

-- ============================================================================
-- 3. COLLECTION ACCESS TOKENS
-- Short-lived tokens for anonymous portal upload access
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.collection_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Scope
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  
  -- Token (store hash for security)
  token_hash VARCHAR(128) NOT NULL,
  
  -- Access control
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  max_uses INTEGER DEFAULT 100,
  use_count INTEGER DEFAULT 0,
  
  -- Contact info (who receives the link)
  recipient_email TEXT,
  recipient_name TEXT,
  recipient_phone TEXT,
  
  -- Sent tracking
  sent_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  last_accessed_ip INET,
  
  -- Revocation
  is_revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES public.profiles(id),
  revoked_reason TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_tokens_hash ON collection_access_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_collection_tokens_workspace ON collection_access_tokens(workspace_id);
CREATE INDEX IF NOT EXISTS idx_collection_tokens_expires ON collection_access_tokens(expires_at) 
  WHERE is_revoked = FALSE;

-- ============================================================================
-- 4. COLLECTION EMAIL INGESTION LOG
-- Track documents received via inbound email
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.collection_email_ingestion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Link to packet (matched by email address or subject token)
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  
  -- Email metadata
  message_id TEXT UNIQUE,
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_email TEXT NOT NULL,
  subject TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  
  -- Attachments (processed into collection_uploads)
  attachment_count INTEGER DEFAULT 0,
  attachments_processed INTEGER DEFAULT 0,
  
  -- Matching
  matched_by TEXT CHECK (matched_by IN ('address_token', 'subject_token', 'account_email', 'manual')),
  match_confidence REAL,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'processed', 'failed', 'unmatched')),
  error_message TEXT,
  
  -- Raw storage (for audit)
  raw_email_path TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_ingestion_workspace ON collection_email_ingestion(workspace_id);
CREATE INDEX IF NOT EXISTS idx_email_ingestion_from ON collection_email_ingestion(from_email);
CREATE INDEX IF NOT EXISTS idx_email_ingestion_status ON collection_email_ingestion(status);

-- ============================================================================
-- 5. COLLECTION AUDIT LOG
-- E&O defensibility - track all actions on requirements and uploads
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.collection_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Target
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  requirement_id UUID REFERENCES public.collection_requirements(id) ON DELETE SET NULL,
  upload_id UUID REFERENCES public.collection_uploads(id) ON DELETE SET NULL,
  
  -- Action
  action TEXT NOT NULL CHECK (action IN (
    'packet_created', 'packet_sent', 'packet_reminded', 'packet_closed',
    'requirement_added', 'requirement_updated', 'requirement_removed',
    'document_uploaded', 'document_replaced', 'document_deleted',
    'review_started', 'review_accepted', 'review_rejected', 'review_needs_changes',
    'token_generated', 'token_revoked', 'token_used',
    'applied_to_acord', 'extracted_data_used'
  )),
  
  -- Actor
  actor_type TEXT NOT NULL CHECK (actor_type IN ('agent', 'client', 'system')),
  actor_profile_id UUID REFERENCES public.profiles(id),
  actor_portal_user_id UUID,
  actor_ip INET,
  
  -- Details
  old_value JSONB,
  new_value JSONB,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collection_audit_workspace ON collection_audit_log(workspace_id);
CREATE INDEX IF NOT EXISTS idx_collection_audit_action ON collection_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_collection_audit_time ON collection_audit_log(created_at DESC);

-- ============================================================================
-- 6. EXTEND WORKSPACE_DOCUMENTS
-- Add requirement linkage for collection uploads
-- ============================================================================

ALTER TABLE public.workspace_documents
  ADD COLUMN IF NOT EXISTS requirement_id UUID REFERENCES public.collection_requirements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_docs_requirement ON workspace_documents(requirement_id);

-- ============================================================================
-- 7. COLLECTION PACKET TEMPLATES
-- Pre-defined sets of requirements by use case
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.collection_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  name TEXT NOT NULL,
  description TEXT,
  
  -- Categorization
  use_case TEXT CHECK (use_case IN (
    'new_commercial_submission', 'commercial_renewal', 'personal_lines_bind',
    'endorsement_request', 'claim_documentation', 'audit', 'general'
  )),
  line_of_business TEXT,
  
  -- Requirements template (array of requirement definitions)
  requirements JSONB NOT NULL DEFAULT '[]',
  -- [{doc_type, label, instructions, is_required, min_quantity, max_quantity}]
  
  -- Settings
  default_expiration_days INTEGER DEFAULT 30,
  auto_send_reminders BOOLEAN DEFAULT TRUE,
  reminder_interval_days INTEGER DEFAULT 7,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_system BOOLEAN DEFAULT FALSE, -- Built-in templates
  
  -- Ownership
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collection_templates_use_case ON collection_templates(use_case);
CREATE INDEX IF NOT EXISTS idx_collection_templates_lob ON collection_templates(line_of_business);

-- ============================================================================
-- 8. RLS POLICIES
-- ============================================================================

ALTER TABLE collection_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_email_ingestion ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_templates ENABLE ROW LEVEL SECURITY;

-- Authenticated users can manage collection data
DROP POLICY IF EXISTS "authenticated_manage_collection_requirements" ON collection_requirements;
CREATE POLICY "authenticated_manage_collection_requirements" ON collection_requirements
  FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated_manage_collection_uploads" ON collection_uploads;
CREATE POLICY "authenticated_manage_collection_uploads" ON collection_uploads
  FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated_manage_collection_tokens" ON collection_access_tokens;
CREATE POLICY "authenticated_manage_collection_tokens" ON collection_access_tokens
  FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated_manage_collection_ingestion" ON collection_email_ingestion;
CREATE POLICY "authenticated_manage_collection_ingestion" ON collection_email_ingestion
  FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated_view_collection_audit" ON collection_audit_log;
CREATE POLICY "authenticated_view_collection_audit" ON collection_audit_log
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "system_insert_collection_audit" ON collection_audit_log;
CREATE POLICY "system_insert_collection_audit" ON collection_audit_log
  FOR INSERT WITH CHECK (TRUE); -- Audit log is append-only

DROP POLICY IF EXISTS "authenticated_manage_collection_templates" ON collection_templates;
CREATE POLICY "authenticated_manage_collection_templates" ON collection_templates
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ============================================================================
-- 9. HELPER FUNCTIONS
-- ============================================================================

-- Generate a secure token
CREATE OR REPLACE FUNCTION public.generate_collection_token(
  p_workspace_id UUID,
  p_account_id UUID,
  p_recipient_email TEXT DEFAULT NULL,
  p_recipient_name TEXT DEFAULT NULL,
  p_expires_days INTEGER DEFAULT 30,
  p_created_by UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token TEXT;
  v_token_hash TEXT;
BEGIN
  -- Generate a URL-safe token
  v_token := encode(gen_random_bytes(32), 'base64');
  v_token := replace(replace(replace(v_token, '+', '-'), '/', '_'), '=', '');
  
  -- Hash for storage
  v_token_hash := encode(sha256(v_token::bytea), 'hex');
  
  -- Insert token record
  INSERT INTO collection_access_tokens (
    workspace_id, account_id, token_hash,
    expires_at, recipient_email, recipient_name, created_by
  ) VALUES (
    p_workspace_id, p_account_id, v_token_hash,
    NOW() + (p_expires_days || ' days')::INTERVAL,
    p_recipient_email, p_recipient_name, p_created_by
  );
  
  RETURN v_token;
END;
$$;

-- Validate and use a token (returns workspace_id if valid)
CREATE OR REPLACE FUNCTION public.validate_collection_token(
  p_token TEXT,
  p_ip INET DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_hash TEXT;
  v_workspace_id UUID;
  v_token_record RECORD;
BEGIN
  v_token_hash := encode(sha256(p_token::bytea), 'hex');
  
  SELECT * INTO v_token_record
  FROM collection_access_tokens
  WHERE token_hash = v_token_hash
    AND is_revoked = FALSE
    AND expires_at > NOW()
    AND (max_uses IS NULL OR use_count < max_uses);
    
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Update usage stats
  UPDATE collection_access_tokens
  SET use_count = use_count + 1,
      last_accessed_at = NOW(),
      last_accessed_ip = p_ip
  WHERE id = v_token_record.id;
  
  RETURN v_token_record.workspace_id;
END;
$$;

-- Get requirement status summary for a packet
CREATE OR REPLACE FUNCTION public.get_collection_status_summary(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_requirements', COUNT(*),
    'required_count', COUNT(*) FILTER (WHERE is_required = TRUE),
    'completed_count', COUNT(*) FILTER (WHERE status IN ('accepted')),
    'pending_review_count', COUNT(*) FILTER (WHERE status IN ('needs_review', 'uploaded')),
    'rejected_count', COUNT(*) FILTER (WHERE status = 'rejected'),
    'not_started_count', COUNT(*) FILTER (WHERE status IN ('not_requested', 'requested')),
    'all_required_complete', NOT EXISTS (
      SELECT 1 FROM collection_requirements 
      WHERE workspace_id = p_workspace_id 
        AND is_required = TRUE 
        AND status NOT IN ('accepted')
    ),
    'progress_percent', CASE 
      WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND((COUNT(*) FILTER (WHERE status = 'accepted')::DECIMAL / COUNT(*)) * 100, 0)
    END
  ) INTO v_result
  FROM collection_requirements
  WHERE workspace_id = p_workspace_id;
  
  RETURN v_result;
END;
$$;

-- ============================================================================
-- 10. TRIGGERS
-- ============================================================================

-- Update requirement status when uploads change
CREATE OR REPLACE FUNCTION update_requirement_status_from_uploads()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the parent requirement status based on upload statuses
  UPDATE collection_requirements r
  SET status = CASE
    WHEN EXISTS (
      SELECT 1 FROM collection_uploads u 
      WHERE u.requirement_id = r.id AND u.review_status = 'accepted'
    ) THEN 'accepted'
    WHEN EXISTS (
      SELECT 1 FROM collection_uploads u 
      WHERE u.requirement_id = r.id AND u.review_status = 'rejected'
    ) AND NOT EXISTS (
      SELECT 1 FROM collection_uploads u 
      WHERE u.requirement_id = r.id AND u.review_status NOT IN ('rejected')
    ) THEN 'rejected'
    WHEN EXISTS (
      SELECT 1 FROM collection_uploads u 
      WHERE u.requirement_id = r.id AND u.review_status IN ('pending', 'in_review')
    ) THEN 'needs_review'
    WHEN EXISTS (
      SELECT 1 FROM collection_uploads u 
      WHERE u.requirement_id = r.id AND u.processing_status IN ('pending', 'processing')
    ) THEN 'processing'
    WHEN EXISTS (
      SELECT 1 FROM collection_uploads u 
      WHERE u.requirement_id = r.id
    ) THEN 'uploaded'
    ELSE r.status
  END,
  updated_at = NOW()
  WHERE r.id = NEW.requirement_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER collection_upload_status_changed
  AFTER INSERT OR UPDATE OF review_status, processing_status ON collection_uploads
  FOR EACH ROW
  EXECUTE FUNCTION update_requirement_status_from_uploads();

-- Auto-update timestamps
CREATE TRIGGER update_collection_requirements_timestamp
  BEFORE UPDATE ON collection_requirements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_collection_uploads_timestamp
  BEFORE UPDATE ON collection_uploads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_collection_templates_timestamp
  BEFORE UPDATE ON collection_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 11. INSERT DEFAULT TEMPLATES
-- ============================================================================

INSERT INTO collection_templates (name, description, use_case, line_of_business, requirements, is_system)
VALUES
  (
    'New Commercial Submission',
    'Standard document collection for new commercial insurance submissions',
    'new_commercial_submission',
    'commercial',
    '[
      {"doc_type": "acord_125", "label": "ACORD 125 - Commercial Application", "instructions": "Please complete and sign the commercial insurance application.", "is_required": true, "min_quantity": 1},
      {"doc_type": "loss_run", "label": "Loss Runs (5 Years)", "instructions": "Please provide loss run reports from your current and prior carriers for the past 5 years.", "is_required": true, "min_quantity": 1, "max_quantity": 10},
      {"doc_type": "carrier_supplementary", "label": "Carrier Supplementary Form", "instructions": "If applicable, please complete any carrier-specific supplemental forms.", "is_required": false, "min_quantity": 0},
      {"doc_type": "statement_of_no_loss", "label": "Statement of No Loss", "instructions": "If you have had no claims in the past 5 years, please sign and return this statement.", "is_required": false, "min_quantity": 0}
    ]'::JSONB,
    TRUE
  ),
  (
    'Commercial Renewal Remarketing',
    'Documents needed for remarketing a commercial renewal',
    'commercial_renewal',
    'commercial',
    '[
      {"doc_type": "renewal_dec", "label": "Current Renewal Declaration", "instructions": "Please provide your renewal offer declaration page.", "is_required": true, "min_quantity": 1},
      {"doc_type": "dec_page", "label": "Current Policy Declaration", "instructions": "Please provide your current policy declaration page.", "is_required": true, "min_quantity": 1},
      {"doc_type": "loss_run", "label": "Loss Runs", "instructions": "Please provide loss runs from your current carrier.", "is_required": true, "min_quantity": 1},
      {"doc_type": "statement_of_no_loss", "label": "Statement of No Loss", "instructions": "If no claims, please provide a statement of no loss.", "is_required": false}
    ]'::JSONB,
    TRUE
  ),
  (
    'Personal Lines Bind',
    'Documents needed to bind a personal lines policy',
    'personal_lines_bind',
    'personal',
    '[
      {"doc_type": "payment_doc", "label": "Payment Information", "instructions": "Please provide payment method for binding.", "is_required": true, "min_quantity": 1},
      {"doc_type": "signed_app", "label": "Signed Application", "instructions": "Please sign and return the application.", "is_required": true, "min_quantity": 1},
      {"doc_type": "proof_of_prior", "label": "Proof of Prior Insurance", "instructions": "Please provide proof of your current insurance coverage.", "is_required": false}
    ]'::JSONB,
    TRUE
  )
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 12. GRANTS
-- ============================================================================

GRANT ALL ON collection_requirements TO authenticated;
GRANT ALL ON collection_uploads TO authenticated;
GRANT ALL ON collection_access_tokens TO authenticated;
GRANT ALL ON collection_email_ingestion TO authenticated;
GRANT SELECT, INSERT ON collection_audit_log TO authenticated;
GRANT ALL ON collection_templates TO authenticated;

GRANT EXECUTE ON FUNCTION generate_collection_token TO authenticated;
GRANT EXECUTE ON FUNCTION validate_collection_token TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_collection_status_summary TO authenticated;

