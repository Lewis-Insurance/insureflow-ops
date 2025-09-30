-- Add integrity tracking columns to documents
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS file_missing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS storage_bucket text;

-- Helpful index for filtering by account and missing status
CREATE INDEX IF NOT EXISTS idx_documents_account_missing
  ON public.documents (account_id, file_missing);
