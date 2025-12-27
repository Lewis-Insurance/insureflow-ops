-- ============================================================================
-- CANOPY DOCUMENTS STORAGE BUCKET
-- ============================================================================
-- Creates the storage bucket for downloaded Canopy documents
-- Documents are downloaded from Canopy and stored locally for persistence
-- ============================================================================

-- Create the canopy-documents storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'canopy-documents',
  'canopy-documents',
  false,  -- Private bucket - access via signed URLs only
  52428800,  -- 50MB max file size
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/gif']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for the canopy-documents bucket

-- Staff can view documents
CREATE POLICY "Staff can view canopy documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'canopy-documents'
  AND EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.role IN ('admin', 'staff', 'producer', 'csr', 'owner')
  )
);

-- Service role can upload documents (used by edge functions)
CREATE POLICY "Service role can upload canopy documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'canopy-documents'
);

-- Service role can update documents
CREATE POLICY "Service role can update canopy documents"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'canopy-documents'
);

-- Add comment
COMMENT ON TABLE storage.buckets IS 'Storage buckets including canopy-documents for imported insurance docs';
