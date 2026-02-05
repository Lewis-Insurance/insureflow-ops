-- Add optional Date of Birth fields to accounts table
-- These are optional fields for the primary and secondary named insureds

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS date_of_birth DATE;

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS spouse_date_of_birth DATE;

COMMENT ON COLUMN public.accounts.date_of_birth IS 'Date of birth for primary named insured';
COMMENT ON COLUMN public.accounts.spouse_date_of_birth IS 'Date of birth for secondary named insured/spouse';
