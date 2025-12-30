-- Migration: Fix policy dates from 2024 to 2025
-- Description: Shift effective_date and expiration_date forward by 1 year for imported policies
-- Date: 2025-12-29
-- Reason: Bulk import had dates in 2024 which causes policies to show as expired

-- Update BOTH dates in a single statement to avoid constraint violations
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
  END
WHERE EXTRACT(YEAR FROM effective_date) = 2024
   OR EXTRACT(YEAR FROM expiration_date) = 2024;

-- Fix any policies where effective_date >= expiration_date (invalid data)
-- Set expiration to effective_date + 1 year (standard policy term)
UPDATE public.policies
SET expiration_date = effective_date + INTERVAL '1 year'
WHERE effective_date >= expiration_date;
