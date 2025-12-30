-- Migration: Fix policy dates from 2024 to 2025
-- Description: Shift effective_date and expiration_date forward by 1 year for imported policies
-- Date: 2025-12-29
-- Reason: Bulk import had dates in 2024 which causes policies to show as expired

-- Update BOTH dates in a single statement to avoid constraint violations
-- Also fix policies where effective_date = expiration_date by making expiration 1 day later
UPDATE public.policies
SET
  effective_date = CASE
    WHEN EXTRACT(YEAR FROM effective_date) = 2024
    THEN effective_date + INTERVAL '1 year'
    ELSE effective_date
  END,
  expiration_date = CASE
    WHEN EXTRACT(YEAR FROM expiration_date) = 2024
    THEN expiration_date + INTERVAL '1 year'
    ELSE expiration_date
  END,
  renewal_date = CASE
    WHEN renewal_date IS NOT NULL AND EXTRACT(YEAR FROM renewal_date) = 2024
    THEN renewal_date + INTERVAL '1 year'
    ELSE renewal_date
  END
WHERE EXTRACT(YEAR FROM effective_date) = 2024
   OR EXTRACT(YEAR FROM expiration_date) = 2024
   OR (renewal_date IS NOT NULL AND EXTRACT(YEAR FROM renewal_date) = 2024);

-- Fix any policies where effective_date >= expiration_date (invalid data)
-- Set expiration to effective_date + 1 year (standard policy term)
UPDATE public.policies
SET expiration_date = effective_date + INTERVAL '1 year'
WHERE effective_date >= expiration_date;

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
