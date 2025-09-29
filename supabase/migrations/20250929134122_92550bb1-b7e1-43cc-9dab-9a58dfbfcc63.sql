-- Update carriers table with additional fields
ALTER TABLE public.carriers ADD COLUMN IF NOT EXISTS agency_code text;
ALTER TABLE public.carriers ADD COLUMN IF NOT EXISTS main_phone text;
ALTER TABLE public.carriers ADD COLUMN IF NOT EXISTS address_line1 text;
ALTER TABLE public.carriers ADD COLUMN IF NOT EXISTS address_line2 text;
ALTER TABLE public.carriers ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.carriers ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE public.carriers ADD COLUMN IF NOT EXISTS zip_code text;
ALTER TABLE public.carriers ADD COLUMN IF NOT EXISTS country text DEFAULT 'US';
ALTER TABLE public.carriers ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE public.carriers ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE public.carriers ADD COLUMN IF NOT EXISTS contact_phone text;

-- Update mgas table with additional fields  
ALTER TABLE public.mgas ADD COLUMN IF NOT EXISTS main_phone text;
ALTER TABLE public.mgas ADD COLUMN IF NOT EXISTS address_line1 text;
ALTER TABLE public.mgas ADD COLUMN IF NOT EXISTS address_line2 text;
ALTER TABLE public.mgas ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.mgas ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE public.mgas ADD COLUMN IF NOT EXISTS zip_code text;
ALTER TABLE public.mgas ADD COLUMN IF NOT EXISTS country text DEFAULT 'US';
ALTER TABLE public.mgas ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE public.mgas ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE public.mgas ADD COLUMN IF NOT EXISTS contact_phone text;

-- Update existing carrier sample data
UPDATE public.carriers SET 
  agency_code = 'SF001',
  main_phone = '(800) 782-8332',
  address_line1 = '1 State Farm Plaza',
  city = 'Bloomington',
  state = 'IL',
  zip_code = '61710',
  contact_name = 'Customer Service',
  contact_email = 'customercare@statefarm.com',
  contact_phone = '(800) 782-8332'
WHERE name = 'State Farm';

UPDATE public.carriers SET
  agency_code = 'ALL001', 
  main_phone = '(800) 255-7828',
  address_line1 = '2775 Sanders Road',
  city = 'Northbrook',
  state = 'IL', 
  zip_code = '60062',
  contact_name = 'Claims Department',
  contact_email = 'claims@allstate.com',
  contact_phone = '(800) 255-7828'
WHERE name = 'Allstate';

-- Update existing MGA sample data
UPDATE public.mgas SET
  main_phone = '(800) 543-2644',
  address_line1 = '7000 Hollister Avenue',
  city = 'Goleta',
  state = 'CA',
  zip_code = '93117',
  contact_name = 'Broker Services',
  contact_email = 'brokers@amig.com',
  contact_phone = '(800) 543-2644'
WHERE code = 'AMIG';

UPDATE public.mgas SET
  main_phone = '(402) 916-3000', 
  address_line1 = '3024 Harney Street',
  city = 'Omaha',
  state = 'NE',
  zip_code = '68131',
  contact_name = 'Agency Relations',
  contact_email = 'agents@guard.com', 
  contact_phone = '(402) 916-3000'
WHERE code = 'BHGUARD';