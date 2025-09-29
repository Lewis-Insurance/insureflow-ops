-- Create MGAs table
CREATE TABLE public.mgas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  code text UNIQUE,
  contact_info jsonb DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create Lines of Business table  
CREATE TABLE public.lines_of_business (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  code text UNIQUE,
  category text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create Business Types table
CREATE TABLE public.business_types (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.mgas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lines_of_business ENABLE ROW LEVEL SECURITY;  
ALTER TABLE public.business_types ENABLE ROW LEVEL SECURITY;

-- Create read policies for authenticated users
CREATE POLICY "MGAs are readable by authenticated users" 
ON public.mgas FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Lines of business are readable by authenticated users"
ON public.lines_of_business FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Business types are readable by authenticated users"
ON public.business_types FOR SELECT  
USING (auth.uid() IS NOT NULL);

-- Create write policies for staff only
CREATE POLICY "Staff can manage MGAs"
ON public.mgas FOR ALL
USING (is_staff())
WITH CHECK (is_staff());

CREATE POLICY "Staff can manage lines of business"  
ON public.lines_of_business FOR ALL
USING (is_staff())
WITH CHECK (is_staff());

CREATE POLICY "Staff can manage business types"
ON public.business_types FOR ALL
USING (is_staff())  
WITH CHECK (is_staff());

-- Insert some common data
INSERT INTO public.mgas (name, code) VALUES
('American Modern Insurance Group', 'AMIG'),
('Berkshire Hathaway GUARD', 'BHGUARD'),
('CRC Insurance Services', 'CRC'),
('National General Insurance', 'NGI'),
('Scottsdale Insurance Company', 'SIC');

INSERT INTO public.lines_of_business (name, code, category) VALUES
('Auto', 'AUTO', 'Personal'),
('Home', 'HOME', 'Personal'), 
('Life', 'LIFE', 'Personal'),
('Commercial Auto', 'COMM_AUTO', 'Commercial'),
('General Liability', 'GL', 'Commercial'),
('Professional Liability', 'PL', 'Commercial'),
('Workers Compensation', 'WC', 'Commercial'),
('Property', 'PROP', 'Commercial'),
('Umbrella', 'UMB', 'Both'),
('Cyber Liability', 'CYBER', 'Commercial');

INSERT INTO public.business_types (name, description) VALUES
('Individual', 'Individual/Personal account'),
('Sole Proprietorship', 'Single owner business'),
('Partnership', 'Multiple owner partnership'),
('LLC', 'Limited Liability Company'),
('Corporation', 'Corporate entity'),
('S-Corp', 'S-Corporation'),
('Non-Profit', 'Non-profit organization'),
('Government', 'Government entity');

-- Add updated_at triggers
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER mgas_updated_at 
  BEFORE UPDATE ON public.mgas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER lines_of_business_updated_at
  BEFORE UPDATE ON public.lines_of_business  
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER business_types_updated_at
  BEFORE UPDATE ON public.business_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();