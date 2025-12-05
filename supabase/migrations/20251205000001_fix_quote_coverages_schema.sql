-- Migration: Fix quote_coverages table schema
-- Description: Add missing is_critical column if it doesn't exist
-- Date: 2024-12-05
-- Author: Claude CEO Co-Pilot

-- Add is_critical column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'quote_coverages'
    AND column_name = 'is_critical'
  ) THEN
    ALTER TABLE public.quote_coverages
    ADD COLUMN is_critical BOOLEAN DEFAULT false;

    COMMENT ON COLUMN public.quote_coverages.is_critical IS 'Critical coverages must be included for good score';
  END IF;
END $$;

-- Now create the index (it will succeed now)
CREATE INDEX IF NOT EXISTS idx_quote_coverages_critical
  ON public.quote_coverages(quote_id, is_critical, is_included)
  WHERE is_critical = true;

-- Verify the migration
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'quote_coverages'
    AND column_name = 'is_critical'
  ) THEN
    RAISE NOTICE 'quote_coverages.is_critical column exists - migration successful';
  ELSE
    RAISE EXCEPTION 'quote_coverages.is_critical column missing - migration failed';
  END IF;
END $$;
