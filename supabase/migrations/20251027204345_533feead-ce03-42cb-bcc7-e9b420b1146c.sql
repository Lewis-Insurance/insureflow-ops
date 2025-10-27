-- Create MGAs (Managing General Agencies) table
CREATE TABLE IF NOT EXISTS public.mgas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  naic TEXT,
  
  -- Contact Information
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  main_phone TEXT,
  
  -- Address
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  country TEXT DEFAULT 'US',
  
  -- Portal Information
  agency_login_url TEXT,
  billing_portal_url TEXT,
  portals JSONB DEFAULT '{}'::jsonb,
  
  -- Business Details
  default_commission_rate NUMERIC(5,4) DEFAULT 0.10,
  contact_info JSONB DEFAULT '{}'::jsonb,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add MGA column to policies table
ALTER TABLE public.policies 
ADD COLUMN IF NOT EXISTS mga_id UUID REFERENCES public.mgas(id);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_policies_mga_id ON public.policies(mga_id);
CREATE INDEX IF NOT EXISTS idx_mgas_name ON public.mgas(name);
CREATE INDEX IF NOT EXISTS idx_mgas_code ON public.mgas(code);

-- Enable RLS on mgas table
ALTER TABLE public.mgas ENABLE ROW LEVEL SECURITY;

-- RLS policies for MGAs (similar to carriers)
CREATE POLICY "mgas_authenticated_read"
  ON public.mgas
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "mgas_staff_insert"
  ON public.mgas
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_staff = true
    )
  );

CREATE POLICY "mgas_staff_update"
  ON public.mgas
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_staff = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_staff = true
    )
  );

CREATE POLICY "mgas_staff_delete"
  ON public.mgas
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_staff = true
    )
  );

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_mgas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_mgas_timestamp
  BEFORE UPDATE ON public.mgas
  FOR EACH ROW
  EXECUTE FUNCTION update_mgas_updated_at();

-- Insert some common MGAs as examples (can be modified/deleted)
INSERT INTO public.mgas (name, code) VALUES
  ('American Modern', 'AMIG'),
  ('Berkshire Hathaway GUARD', 'GUARD'),
  ('Burns & Wilcox', 'BW'),
  ('RT Specialty', 'RTS'),
  ('CRC Group', 'CRC')
ON CONFLICT (code) DO NOTHING;