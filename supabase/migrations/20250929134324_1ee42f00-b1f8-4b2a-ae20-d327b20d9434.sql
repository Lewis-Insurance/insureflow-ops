-- Add Agency Login URL to carriers table
ALTER TABLE public.carriers ADD COLUMN IF NOT EXISTS agency_login_url text;

-- Add Agency Login URL to mgas table  
ALTER TABLE public.mgas ADD COLUMN IF NOT EXISTS agency_login_url text;

-- Update existing carrier sample data with login URLs
UPDATE public.carriers SET 
  agency_login_url = 'https://agent.statefarm.com'
WHERE name = 'State Farm';

UPDATE public.carriers SET
  agency_login_url = 'https://agency.allstate.com'
WHERE name = 'Allstate';

-- Update existing MGA sample data with login URLs
UPDATE public.mgas SET
  agency_login_url = 'https://portal.amig.com'
WHERE code = 'AMIG';

UPDATE public.mgas SET
  agency_login_url = 'https://agents.guard.com'
WHERE code = 'BHGUARD';