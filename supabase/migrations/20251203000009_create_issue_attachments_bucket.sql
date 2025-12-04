-- Migration: Create storage bucket for issue attachments
-- Description: Storage bucket for screenshots, recordings, and files attached to issues
-- Date: 2024-12-03

-- Create the storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('issue-attachments', 'issue-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies for issue attachments
CREATE POLICY "Authenticated users can upload issue attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'issue-attachments');

CREATE POLICY "Authenticated users can view issue attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'issue-attachments');

CREATE POLICY "Users can update their own attachments"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'issue-attachments' AND owner = auth.uid());

CREATE POLICY "Users can delete their own attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'issue-attachments' AND owner = auth.uid());
