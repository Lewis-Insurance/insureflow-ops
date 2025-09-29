-- Create documents storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false);

-- Create RLS policies for documents bucket
CREATE POLICY "Users can view documents they have access to"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'documents' AND
  (
    -- Staff can access all documents
    public.is_staff() OR
    -- Users can access documents for accounts they have membership to
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.user_id = auth.uid()
      AND (storage.foldername(name))[1] = am.account_id::text
    )
  )
);

CREATE POLICY "Staff can upload documents"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'documents' AND
  public.is_staff()
);

CREATE POLICY "Staff can update documents"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'documents' AND
  public.is_staff()
);

CREATE POLICY "Staff can delete documents"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'documents' AND
  public.is_staff()
);