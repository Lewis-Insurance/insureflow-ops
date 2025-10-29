
-- Add dropbox_id column to documents table for easier querying
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS dropbox_id text;

-- Add index on dropbox_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_documents_dropbox_id ON documents(dropbox_id);

-- Add missing columns to existing document_analysis table
ALTER TABLE document_analysis
ADD COLUMN IF NOT EXISTS policy_id uuid,
ADD COLUMN IF NOT EXISTS parseur_data jsonb,
ADD COLUMN IF NOT EXISTS agency_code text,
ADD COLUMN IF NOT EXISTS issued_date text,
ADD COLUMN IF NOT EXISTS vehicles jsonb,
ADD COLUMN IF NOT EXISTS ai_analysis jsonb,
ADD COLUMN IF NOT EXISTS analysis_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS analysis_error text;

-- Update existing RLS policies or add new ones
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'document_analysis' AND policyname = 'Users can view document analysis'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can view document analysis" ON document_analysis FOR SELECT USING (true)';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'document_analysis' AND policyname = 'Authenticated users can insert document analysis'
  ) THEN
    EXECUTE 'CREATE POLICY "Authenticated users can insert document analysis" ON document_analysis FOR INSERT WITH CHECK (true)';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'document_analysis' AND policyname = 'Authenticated users can update document analysis'
  ) THEN
    EXECUTE 'CREATE POLICY "Authenticated users can update document analysis" ON document_analysis FOR UPDATE USING (true)';
  END IF;
END $$;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_document_analysis_policy_id ON document_analysis(policy_id);
CREATE INDEX IF NOT EXISTS idx_document_analysis_policy_number ON document_analysis(policy_number);