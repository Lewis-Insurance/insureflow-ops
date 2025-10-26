-- Create OCR cache table for document processing optimization
CREATE TABLE IF NOT EXISTS public.ocr_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  document_hash TEXT NOT NULL,
  ocr_text TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_ocr_cache_key ON public.ocr_cache(key);
CREATE INDEX IF NOT EXISTS idx_ocr_cache_hash ON public.ocr_cache(document_hash);
CREATE INDEX IF NOT EXISTS idx_ocr_cache_expires ON public.ocr_cache(expires_at) WHERE expires_at IS NOT NULL;

-- Enable RLS
ALTER TABLE public.ocr_cache ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything (edge functions)
CREATE POLICY "Service role full access to ocr_cache"
  ON public.ocr_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Auto-update accessed_at on reads
CREATE OR REPLACE FUNCTION public.update_ocr_cache_accessed_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.accessed_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ocr_cache_accessed_at_trigger
  BEFORE UPDATE ON public.ocr_cache
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ocr_cache_accessed_at();

-- Cleanup function for expired cache entries
CREATE OR REPLACE FUNCTION public.cleanup_expired_ocr_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM public.ocr_cache
  WHERE expires_at IS NOT NULL AND expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;