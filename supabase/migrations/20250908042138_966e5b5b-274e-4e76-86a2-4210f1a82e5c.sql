-- Create storage bucket for data exports
INSERT INTO storage.buckets (id, name, public) 
VALUES ('exports', 'exports', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for exports - only users can access their own exports
CREATE POLICY "Users can access own exports" ON storage.objects
  FOR ALL USING (
    bucket_id = 'exports' AND 
    auth.uid()::text = substring(name from '^([^-]+)')
  ) WITH CHECK (
    bucket_id = 'exports' AND 
    auth.uid()::text = substring(name from '^([^-]+)')
  );