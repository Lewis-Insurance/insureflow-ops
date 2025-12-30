-- Migration: Fix policy dates from 2024 to 2025
-- Description: Shift effective_date and expiration_date forward by 1 year for imported policies
-- Date: 2025-12-29
-- Reason: Bulk import had dates in 2024 which causes policies to show as expired

-- Update effective_date: add 1 year to all 2024 dates
UPDATE public.policies
SET effective_date = effective_date + INTERVAL '1 year'
WHERE EXTRACT(YEAR FROM effective_date) = 2024;

-- Update expiration_date: add 1 year to all 2024 dates
UPDATE public.policies
SET expiration_date = expiration_date + INTERVAL '1 year'
WHERE EXTRACT(YEAR FROM expiration_date) = 2024;

-- Update renewal_date if it exists and is in 2024
UPDATE public.policies
SET renewal_date = renewal_date + INTERVAL '1 year'
WHERE renewal_date IS NOT NULL
  AND EXTRACT(YEAR FROM renewal_date) = 2024;

-- Log the update for audit purposes
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count
  FROM public.policies
  WHERE EXTRACT(YEAR FROM effective_date) = 2025
    OR EXTRACT(YEAR FROM expiration_date) = 2025;

  RAISE NOTICE 'Updated % policies to have 2025 dates', updated_count;
END $$;
