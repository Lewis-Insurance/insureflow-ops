-- Add secondary phone number to accounts table
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS phone_secondary TEXT;

COMMENT ON COLUMN public.accounts.phone_secondary IS 'Secondary phone number (e.g., spouse, alternate contact)';
