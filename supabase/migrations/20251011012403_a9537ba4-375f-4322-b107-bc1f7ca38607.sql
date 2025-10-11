-- Create storage bucket for COI certificates
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'certificates',
  'certificates',
  true,
  10485760, -- 10MB limit
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Public certificates are viewable by everyone" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload certificates" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update certificates" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete certificates" ON storage.objects;

-- Policy: Anyone can view certificates (public bucket)
CREATE POLICY "Public certificates are viewable by everyone"
ON storage.objects FOR SELECT
USING (bucket_id = 'certificates');

-- Policy: Authenticated users can upload certificates
CREATE POLICY "Authenticated users can upload certificates"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'certificates');

-- Policy: Authenticated users can update certificates
CREATE POLICY "Authenticated users can update certificates"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'certificates')
WITH CHECK (bucket_id = 'certificates');

-- Policy: Authenticated users can delete certificates
CREATE POLICY "Authenticated users can delete certificates"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'certificates');