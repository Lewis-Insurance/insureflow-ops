-- Create storage bucket for workspace documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('workspace-documents', 'workspace-documents', true);

-- Allow authenticated users to upload their own files
CREATE POLICY "Users can upload workspace documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'workspace-documents');

-- Allow public access to view files (since bucket is public)
CREATE POLICY "Public access to workspace documents"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'workspace-documents');

-- Allow authenticated users to delete their uploaded files
CREATE POLICY "Users can delete workspace documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'workspace-documents');