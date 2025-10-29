-- Make the workspace-documents bucket public
UPDATE storage.buckets 
SET public = true 
WHERE id = 'workspace-documents';