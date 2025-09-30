-- Add locale column to profiles table for user language preferences
ALTER TABLE public.profiles
ADD COLUMN locale TEXT DEFAULT 'en';

-- Add comment to document the column purpose
COMMENT ON COLUMN public.profiles.locale IS 'User selected locale for language and regional settings';