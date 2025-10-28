-- Create document_analyses table for storing AI-analyzed document results
CREATE TABLE IF NOT EXISTS public.document_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  policy_id UUID REFERENCES public.policies(id) ON DELETE SET NULL,
  document_hash TEXT NOT NULL,
  analysis_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  extracted_text TEXT,
  policy_number TEXT,
  carrier TEXT,
  insured_name TEXT,
  analyzed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create index on document_hash for fast cache lookups
CREATE INDEX IF NOT EXISTS idx_document_analyses_hash ON public.document_analyses(document_hash);

-- Create index on account_id for fast account-based queries
CREATE INDEX IF NOT EXISTS idx_document_analyses_account ON public.document_analyses(account_id);

-- Create index on policy_id for fast policy-based queries
CREATE INDEX IF NOT EXISTS idx_document_analyses_policy ON public.document_analyses(policy_id);

-- Create index on created_by for user-based queries
CREATE INDEX IF NOT EXISTS idx_document_analyses_created_by ON public.document_analyses(created_by);

-- Enable RLS
ALTER TABLE public.document_analyses ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view analyses for accounts they're members of
CREATE POLICY "Users can view document analyses for their accounts"
  ON public.document_analyses
  FOR SELECT
  USING (
    account_id IS NULL 
    OR EXISTS (
      SELECT 1 FROM account_memberships m
      WHERE m.account_id = document_analyses.account_id
      AND m.user_id = auth.uid()
    )
    OR created_by = auth.uid()
  );

-- Policy: Users can insert analyses for accounts they're members of
CREATE POLICY "Users can create document analyses"
  ON public.document_analyses
  FOR INSERT
  WITH CHECK (
    account_id IS NULL 
    OR EXISTS (
      SELECT 1 FROM account_memberships m
      WHERE m.account_id = document_analyses.account_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'staff')
    )
  );

-- Policy: Users can update their own analyses or analyses in accounts they manage
CREATE POLICY "Users can update document analyses"
  ON public.document_analyses
  FOR UPDATE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM account_memberships m
      WHERE m.account_id = document_analyses.account_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'staff')
    )
  );

-- Policy: Users can delete their own analyses or analyses in accounts they manage
CREATE POLICY "Users can delete document analyses"
  ON public.document_analyses
  FOR DELETE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM account_memberships m
      WHERE m.account_id = document_analyses.account_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'staff')
    )
  );

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_document_analyses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_document_analyses_updated_at
  BEFORE UPDATE ON public.document_analyses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_document_analyses_updated_at();