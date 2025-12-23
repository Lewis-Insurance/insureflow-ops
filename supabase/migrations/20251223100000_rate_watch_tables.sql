-- =============================================================================
-- Rate Watch Tables
-- Multi-carrier quote comparison for renewal premium shock
-- =============================================================================

-- Rate Watch Jobs
CREATE TABLE IF NOT EXISTS public.rate_watch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  job_name TEXT NOT NULL,
  line_of_business TEXT NOT NULL DEFAULT 'Personal Auto',
  status TEXT NOT NULL DEFAULT 'draft',
  current_premium NUMERIC(12,2),
  renewal_premium NUMERIC(12,2),
  premium_change_amount NUMERIC(12,2),
  premium_change_pct NUMERIC(5,2),
  comparison_result JSONB,
  coverage_gaps JSONB,
  recommendation TEXT,
  email_subject TEXT,
  email_body TEXT,
  email_sent_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT rate_watch_jobs_status_check CHECK (
    status IN ('draft', 'uploading', 'processing', 'analyzing', 'completed', 'failed')
  )
);

-- Rate Watch Documents
CREATE TABLE IF NOT EXISTS public.rate_watch_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES rate_watch_jobs(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  carrier_name TEXT,
  extracted_premium NUMERIC(12,2),
  extracted_coverages JSONB,
  extracted_vehicles JSONB,
  extraction_status TEXT DEFAULT 'pending',
  extraction_error TEXT,
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT rate_watch_documents_type_check CHECK (
    document_type IN ('current_policy', 'renewal', 'quote')
  ),
  CONSTRAINT rate_watch_documents_extraction_status_check CHECK (
    extraction_status IN ('pending', 'processing', 'completed', 'failed')
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rate_watch_jobs_account_id ON rate_watch_jobs(account_id);
CREATE INDEX IF NOT EXISTS idx_rate_watch_jobs_status ON rate_watch_jobs(status);
CREATE INDEX IF NOT EXISTS idx_rate_watch_jobs_created_by ON rate_watch_jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_rate_watch_jobs_created_at ON rate_watch_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_watch_documents_job_id ON rate_watch_documents(job_id);
CREATE INDEX IF NOT EXISTS idx_rate_watch_documents_type ON rate_watch_documents(document_type);

-- RLS Policies
ALTER TABLE rate_watch_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_watch_documents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view rate watch jobs" ON rate_watch_jobs;
DROP POLICY IF EXISTS "Users can create rate watch jobs" ON rate_watch_jobs;
DROP POLICY IF EXISTS "Users can update rate watch jobs" ON rate_watch_jobs;
DROP POLICY IF EXISTS "Users can delete rate watch jobs" ON rate_watch_jobs;
DROP POLICY IF EXISTS "Users can view rate watch documents" ON rate_watch_documents;
DROP POLICY IF EXISTS "Users can create rate watch documents" ON rate_watch_documents;
DROP POLICY IF EXISTS "Users can delete rate watch documents" ON rate_watch_documents;

-- Jobs policies - all authenticated users can manage
CREATE POLICY "Users can view rate watch jobs"
  ON rate_watch_jobs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create rate watch jobs"
  ON rate_watch_jobs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update rate watch jobs"
  ON rate_watch_jobs FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete rate watch jobs"
  ON rate_watch_jobs FOR DELETE
  TO authenticated
  USING (true);

-- Documents policies
CREATE POLICY "Users can view rate watch documents"
  ON rate_watch_documents FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create rate watch documents"
  ON rate_watch_documents FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can delete rate watch documents"
  ON rate_watch_documents FOR DELETE
  TO authenticated
  USING (true);

-- Grant permissions
GRANT ALL ON rate_watch_jobs TO authenticated;
GRANT ALL ON rate_watch_documents TO authenticated;

