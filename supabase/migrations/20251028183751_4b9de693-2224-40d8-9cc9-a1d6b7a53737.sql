-- Add missing columns to parsed_documents table
ALTER TABLE public.parsed_documents 
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS parseur_document_id TEXT,
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.accounts(id),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_parsed_documents_account_id ON public.parsed_documents(account_id);
CREATE INDEX IF NOT EXISTS idx_parsed_documents_document_type ON public.parsed_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_parsed_documents_created_at ON public.parsed_documents(created_at DESC);

-- Enable RLS
ALTER TABLE public.parsed_documents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "parsed_documents_staff_select" ON public.parsed_documents;
DROP POLICY IF EXISTS "parsed_documents_user_select" ON public.parsed_documents;

-- Staff can view all parsed documents
CREATE POLICY "parsed_documents_staff_select"
  ON public.parsed_documents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.is_staff = true OR profiles.role IN ('admin', 'agent', 'staff'))
    )
  );

-- Users can view their account's documents
CREATE POLICY "parsed_documents_user_select"
  ON public.parsed_documents
  FOR SELECT
  TO authenticated
  USING (
    account_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE account_memberships.account_id = parsed_documents.account_id
      AND account_memberships.user_id = auth.uid()
    )
  );