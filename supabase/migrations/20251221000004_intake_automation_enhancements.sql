-- ============================================
-- ACORD Intake Automation Enhancements
-- Supports: Drafts, CRM Prefill, Offline Queue, Retry Controller
-- ============================================

-- ============================================
-- SCHEMA CLEANUP
-- Drop tables with wrong schemas to ensure clean creation
-- ============================================

DO $$
BEGIN
  -- Drop tables with wrong schemas before recreating

  -- Drop acord_form_drafts if it doesn't have required columns
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'acord_form_drafts')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'acord_form_drafts' AND column_name = 'schema_hash')
  THEN
    DROP TABLE IF EXISTS public.acord_form_drafts CASCADE;
  END IF;

  -- Drop crm_prefill_log if it doesn't have required columns
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crm_prefill_log')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'crm_prefill_log' AND column_name = 'field_name')
  THEN
    DROP TABLE IF EXISTS public.crm_prefill_log CASCADE;
  END IF;

  -- Drop import_jobs if it doesn't have required columns
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'import_jobs')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'import_jobs' AND column_name = 'created_by')
  THEN
    DROP TABLE IF EXISTS public.import_jobs CASCADE;
  END IF;

  -- Drop import_job_documents if it doesn't have required columns
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'import_job_documents')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'import_job_documents' AND column_name = 'quality_score')
  THEN
    DROP TABLE IF EXISTS public.import_job_documents CASCADE;
  END IF;

  -- Drop extraction_attempts if it doesn't have required columns
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'extraction_attempts')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'extraction_attempts' AND column_name = 'fields_auto_applied')
  THEN
    DROP TABLE IF EXISTS public.extraction_attempts CASCADE;
  END IF;

  -- Drop offline_queue if it doesn't have required columns
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'offline_queue')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'offline_queue' AND column_name = 'device_id')
  THEN
    DROP TABLE IF EXISTS public.offline_queue CASCADE;
  END IF;

  -- Drop document_access_log if it doesn't have required columns
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'document_access_log')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'document_access_log' AND column_name = 'access_type')
  THEN
    DROP TABLE IF EXISTS public.document_access_log CASCADE;
  END IF;
END $$;

-- ============================================
-- ACORD FORM DRAFTS
-- Auto-save with offline sync support
-- ============================================

CREATE TABLE IF NOT EXISTS acord_form_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acord_form_id UUID NOT NULL REFERENCES acord_forms(id) ON DELETE CASCADE,
  schema_hash TEXT NOT NULL,
  import_job_id UUID,
  extraction_id UUID REFERENCES document_extractions(id),

  -- Field data with statuses and provenance
  fields JSONB NOT NULL DEFAULT '{}',
  -- {
  --   "NamedInsured": {
  --     "value": "ABC Corp",
  --     "status": "AUTO_APPLIED",
  --     "source": "extraction",
  --     "confidence": 0.95,
  --     "evidenceIds": ["..."],
  --     "lastModified": "...",
  --     "modifiedBy": "..."
  --   }
  -- }

  -- Sync metadata
  last_saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_saved_by UUID REFERENCES auth.users(id),
  device_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  sync_state TEXT DEFAULT 'SYNCED' CHECK (sync_state IN ('LOCAL_ONLY', 'SYNCED', 'CONFLICT', 'SYNCING')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for draft queries
CREATE INDEX IF NOT EXISTS idx_drafts_acord_form ON acord_form_drafts(acord_form_id);
CREATE INDEX IF NOT EXISTS idx_drafts_extraction ON acord_form_drafts(extraction_id);
CREATE INDEX IF NOT EXISTS idx_drafts_last_saved ON acord_form_drafts(last_saved_at DESC);

-- ============================================
-- CRM PREFILL LOG
-- Audit trail for CRM data prefill actions
-- ============================================

CREATE TABLE IF NOT EXISTS crm_prefill_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acord_form_id UUID NOT NULL REFERENCES acord_forms(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id),

  field_name TEXT NOT NULL,
  crm_value TEXT,
  extracted_value TEXT,
  action TEXT NOT NULL CHECK (action IN ('APPLIED', 'SKIPPED_EXTRACTION_STRONGER', 'CONFLICT_FLAGGED')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_prefill_log_form ON crm_prefill_log(acord_form_id);
CREATE INDEX IF NOT EXISTS idx_prefill_log_account ON crm_prefill_log(account_id);

-- ============================================
-- IMPORT JOBS
-- Track batch document imports with multiple documents
-- ============================================

CREATE TABLE IF NOT EXISTS import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploading', 'processing', 'completed', 'failed', 'partial')),

  -- Links
  account_id UUID REFERENCES accounts(id),
  acord_form_id UUID REFERENCES acord_forms(id),
  draft_id UUID REFERENCES acord_form_drafts(id),

  -- Metadata
  total_documents INTEGER DEFAULT 0,
  processed_documents INTEGER DEFAULT 0,
  failed_documents INTEGER DEFAULT 0,

  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Import job documents
CREATE TABLE IF NOT EXISTS import_job_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id UUID NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,

  filename TEXT NOT NULL,
  file_path TEXT,
  file_size INTEGER,
  mime_type TEXT,

  document_type TEXT, -- dec_page, loss_run, etc.
  predicted_document_type TEXT,

  -- Quality
  quality_score INTEGER,
  quality_tier TEXT,
  quality_issues JSONB DEFAULT '[]',

  -- Processing
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploading', 'processing', 'completed', 'failed')),
  error_message TEXT,
  extraction_id UUID REFERENCES document_extractions(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_documents_job ON import_job_documents(import_job_id);

-- ============================================
-- EXTRACTION ATTEMPTS
-- Track retry attempts for progressive enhancement
-- ============================================

CREATE TABLE IF NOT EXISTS extraction_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id UUID NOT NULL REFERENCES document_extractions(id) ON DELETE CASCADE,
  import_job_id UUID REFERENCES import_jobs(id),

  attempt_number INTEGER NOT NULL,
  settings JSONB NOT NULL,
  -- {
  --   "renderDpi": 300,
  --   "preprocessors": ["contrast", "deskew"],
  --   "models": ["prebuilt-document"],
  --   "targetFields": null
  -- }

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  error_message TEXT,

  -- Results
  overall_confidence NUMERIC(5,4),
  fields_extracted INTEGER,
  fields_auto_applied INTEGER,
  fields_needs_review INTEGER,
  fields_not_found INTEGER,

  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attempts_extraction ON extraction_attempts(extraction_id);

-- ============================================
-- OFFLINE QUEUE
-- Queue for documents captured while offline
-- ============================================

CREATE TABLE IF NOT EXISTS offline_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,

  -- Document info
  filename TEXT NOT NULL,
  file_size INTEGER,
  document_type TEXT,

  -- Context
  account_id UUID REFERENCES accounts(id),
  acord_form_id UUID REFERENCES acord_forms(id),

  -- Status
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'uploading', 'processing', 'completed', 'failed')),
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Result
  extraction_id UUID REFERENCES document_extractions(id),

  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_offline_queue_device ON offline_queue(device_id);
CREATE INDEX IF NOT EXISTS idx_offline_queue_status ON offline_queue(status);

-- ============================================
-- EXTRACTION CORRECTIONS (Enhanced)
-- Track user corrections for learning
-- ============================================

CREATE TABLE IF NOT EXISTS extraction_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id UUID NOT NULL REFERENCES document_extractions(id) ON DELETE CASCADE,

  field_name TEXT NOT NULL,
  original_value TEXT,
  corrected_value TEXT,
  source_snippet TEXT,
  document_type TEXT,

  -- Error classification for learning
  error_type TEXT CHECK (error_type IN (
    'OCR_ERROR',           -- OCR misread the text
    'WRONG_CANDIDATE',     -- Picked wrong value from multiple options
    'MISSING_FIELD',       -- Field exists but wasn't found
    'FALSE_POSITIVE',      -- Field doesn't exist, shouldn't have been extracted
    'NORMALIZATION',       -- Value correct but format wrong
    'VALIDATION'           -- Value failed validation
  )),

  -- Evidence for learning
  user_highlighted_bbox JSONB, -- { x, y, width, height }
  model_versions JSONB,        -- { ocr, llm, scoring }

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  corrected_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_corrections_extraction ON extraction_corrections(extraction_id);
CREATE INDEX IF NOT EXISTS idx_corrections_error_type ON extraction_corrections(error_type);

-- ============================================
-- DOCUMENT ACCESS LOG
-- Audit trail for PII access
-- NOTE: This table may already exist from 20251221000003 with user_id/accessed_at columns
-- ============================================

CREATE TABLE IF NOT EXISTS document_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id UUID REFERENCES document_extractions(id) ON DELETE SET NULL,

  access_type TEXT NOT NULL CHECK (access_type IN ('view', 'download', 'export', 'share')),
  fields_accessed TEXT[],

  -- Use user_id and accessed_at to match earlier migration
  user_id UUID,
  ip_address INET,
  user_agent TEXT,

  accessed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_log_extraction ON document_access_log(extraction_id);

-- Drop old index name if it exists, create correct one
DROP INDEX IF EXISTS idx_access_log_created;
CREATE INDEX IF NOT EXISTS idx_access_log_accessed ON document_access_log(accessed_at DESC);

-- ============================================
-- RPC FUNCTIONS
-- ============================================

-- Log document access (drop first to change return type)
DROP FUNCTION IF EXISTS log_document_access(uuid, text, text[]);
CREATE OR REPLACE FUNCTION log_document_access(
  p_extraction_id UUID,
  p_access_type TEXT,
  p_fields_accessed TEXT[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO document_access_log (
    extraction_id,
    access_type,
    fields_accessed,
    user_id,
    accessed_at
  ) VALUES (
    p_extraction_id,
    p_access_type,
    p_fields_accessed,
    auth.uid(),
    NOW()
  );
END;
$$;

-- Get draft with conflict detection
CREATE OR REPLACE FUNCTION get_draft_with_conflicts(
  p_acord_form_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_draft acord_form_drafts%ROWTYPE;
  v_result JSONB;
BEGIN
  SELECT * INTO v_draft
  FROM acord_form_drafts
  WHERE acord_form_id = p_acord_form_id
  ORDER BY version DESC
  LIMIT 1;

  IF v_draft IS NULL THEN
    RETURN NULL;
  END IF;

  v_result := jsonb_build_object(
    'id', v_draft.id,
    'acordFormId', v_draft.acord_form_id,
    'schemaHash', v_draft.schema_hash,
    'fields', v_draft.fields,
    'lastSavedAt', v_draft.last_saved_at,
    'lastSavedBy', v_draft.last_saved_by,
    'deviceId', v_draft.device_id,
    'version', v_draft.version,
    'syncState', v_draft.sync_state
  );

  RETURN v_result;
END;
$$;

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE acord_form_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_prefill_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_job_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_access_log ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first to avoid conflicts
DROP POLICY IF EXISTS drafts_select ON acord_form_drafts;
DROP POLICY IF EXISTS drafts_insert ON acord_form_drafts;
DROP POLICY IF EXISTS drafts_update ON acord_form_drafts;
DROP POLICY IF EXISTS prefill_log_select ON crm_prefill_log;
DROP POLICY IF EXISTS prefill_log_insert ON crm_prefill_log;
DROP POLICY IF EXISTS import_jobs_all ON import_jobs;
DROP POLICY IF EXISTS job_docs_select ON import_job_documents;
DROP POLICY IF EXISTS job_docs_insert ON import_job_documents;
DROP POLICY IF EXISTS attempts_select ON extraction_attempts;
DROP POLICY IF EXISTS attempts_insert ON extraction_attempts;
DROP POLICY IF EXISTS offline_queue_all ON offline_queue;
DROP POLICY IF EXISTS corrections_select ON extraction_corrections;
DROP POLICY IF EXISTS corrections_insert ON extraction_corrections;
DROP POLICY IF EXISTS access_log_select ON document_access_log;
DROP POLICY IF EXISTS access_log_insert ON document_access_log;

-- Drafts: users can access their own drafts
CREATE POLICY drafts_select ON acord_form_drafts FOR SELECT TO authenticated
  USING (last_saved_by = auth.uid());

CREATE POLICY drafts_insert ON acord_form_drafts FOR INSERT TO authenticated
  WITH CHECK (last_saved_by = auth.uid());

CREATE POLICY drafts_update ON acord_form_drafts FOR UPDATE TO authenticated
  USING (last_saved_by = auth.uid());

-- CRM prefill log: users can view their own actions
CREATE POLICY prefill_log_select ON crm_prefill_log FOR SELECT TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY prefill_log_insert ON crm_prefill_log FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Import jobs: users can access their own jobs
CREATE POLICY import_jobs_all ON import_jobs FOR ALL TO authenticated
  USING (created_by = auth.uid());

-- Import job documents: inherit from parent job
CREATE POLICY job_docs_select ON import_job_documents FOR SELECT TO authenticated
  USING (import_job_id IN (SELECT id FROM import_jobs WHERE created_by = auth.uid()));

CREATE POLICY job_docs_insert ON import_job_documents FOR INSERT TO authenticated
  WITH CHECK (import_job_id IN (SELECT id FROM import_jobs WHERE created_by = auth.uid()));

-- Extraction attempts: based on extraction access
-- Using a more permissive policy that doesn't depend on document_extractions.created_by
CREATE POLICY attempts_select ON extraction_attempts FOR SELECT TO authenticated
  USING (TRUE); -- All authenticated users can view attempts (extraction-level security handled elsewhere)

CREATE POLICY attempts_insert ON extraction_attempts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Offline queue: users can access their own queue items
CREATE POLICY offline_queue_all ON offline_queue FOR ALL TO authenticated
  USING (created_by = auth.uid());

-- Corrections: users can create and view (table uses corrected_by, not created_by)
CREATE POLICY corrections_select ON extraction_corrections FOR SELECT TO authenticated
  USING (corrected_by = auth.uid());

CREATE POLICY corrections_insert ON extraction_corrections FOR INSERT TO authenticated
  WITH CHECK (corrected_by = auth.uid());

-- Access log: users can view their own access
CREATE POLICY access_log_select ON document_access_log FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY access_log_insert ON document_access_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ============================================
-- TRIGGERS
-- ============================================

-- Drop existing triggers first to avoid conflicts
DROP TRIGGER IF EXISTS draft_updated ON acord_form_drafts;
DROP TRIGGER IF EXISTS job_document_status_changed ON import_job_documents;

-- Update draft timestamp
CREATE OR REPLACE FUNCTION update_draft_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER draft_updated
  BEFORE UPDATE ON acord_form_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_draft_timestamp();

-- Update import job progress
CREATE OR REPLACE FUNCTION update_import_job_progress()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE import_jobs
  SET
    processed_documents = (
      SELECT COUNT(*) FROM import_job_documents
      WHERE import_job_id = NEW.import_job_id AND status = 'completed'
    ),
    failed_documents = (
      SELECT COUNT(*) FROM import_job_documents
      WHERE import_job_id = NEW.import_job_id AND status = 'failed'
    ),
    status = CASE
      WHEN (SELECT COUNT(*) FROM import_job_documents WHERE import_job_id = NEW.import_job_id AND status IN ('pending', 'uploading', 'processing')) = 0
      THEN CASE
        WHEN (SELECT COUNT(*) FROM import_job_documents WHERE import_job_id = NEW.import_job_id AND status = 'failed') > 0
        THEN 'partial'
        ELSE 'completed'
      END
      ELSE 'processing'
    END,
    completed_at = CASE
      WHEN (SELECT COUNT(*) FROM import_job_documents WHERE import_job_id = NEW.import_job_id AND status IN ('pending', 'uploading', 'processing')) = 0
      THEN NOW()
      ELSE NULL
    END
  WHERE id = NEW.import_job_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER job_document_status_changed
  AFTER UPDATE OF status ON import_job_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_import_job_progress();
