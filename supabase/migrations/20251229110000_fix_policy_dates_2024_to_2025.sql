-- Migration: Fix policy dates from 2024 to 2025
-- Description: Shift effective_date and expiration_date forward by 1 year for imported policies
-- Date: 2025-12-29
-- Reason: Bulk import had dates in 2024 which causes policies to show as expired

-- First, fix any invalid policies where effective_date >= expiration_date
-- by setting expiration_date to effective_date + 1 year BEFORE shifting years
UPDATE public.policies
SET expiration_date = effective_date + INTERVAL '1 year'
WHERE effective_date >= expiration_date;

-- Now update both dates in a single statement
-- This should now be safe since all policies have valid date ranges
UPDATE public.policies
SET
  effective_date = effective_date + INTERVAL '1 year',
  expiration_date = expiration_date + INTERVAL '1 year'
WHERE EXTRACT(YEAR FROM effective_date) = 2024
   OR EXTRACT(YEAR FROM expiration_date) = 2024;
