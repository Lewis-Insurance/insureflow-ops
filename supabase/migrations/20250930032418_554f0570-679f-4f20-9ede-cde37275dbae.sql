-- Add default commission rate to carriers table
ALTER TABLE public.carriers 
ADD COLUMN default_commission_rate NUMERIC(5,4) DEFAULT 0.10 CHECK (default_commission_rate >= 0 AND default_commission_rate <= 1);

-- Add comment to explain the field
COMMENT ON COLUMN public.carriers.default_commission_rate IS 'Default commission rate as decimal (e.g., 0.10 for 10%)';

-- Update existing carriers with some default commission rates
UPDATE public.carriers 
SET default_commission_rate = 0.12 
WHERE name ILIKE '%progressive%';

UPDATE public.carriers 
SET default_commission_rate = 0.15 
WHERE name ILIKE '%pie%';

-- Set a general default for any carriers without specific rates
UPDATE public.carriers 
SET default_commission_rate = 0.10 
WHERE default_commission_rate IS NULL;