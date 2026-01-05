-- Add spouse_name column to accounts table for household accounts
-- This allows tracking a second named insured (spouse/partner) on personal lines policies

ALTER TABLE public.accounts
ADD COLUMN IF NOT EXISTS spouse_name TEXT;

-- Add a comment explaining the field
COMMENT ON COLUMN public.accounts.spouse_name IS 'Second named insured (spouse/partner) for household accounts. Not used for commercial/business accounts.';
