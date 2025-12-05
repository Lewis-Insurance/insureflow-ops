-- Migration: Comprehensive Quote Schema Fix
-- Description: Ensure all quote-related tables have the correct schema
-- Date: 2024-12-05
-- Author: Claude CEO Co-Pilot
-- Purpose: Fix schema mismatches between migrations and actual database state

-- =============================================================================
-- STEP 1: Verify and fix quotes table columns
-- =============================================================================

-- Add missing columns to quotes table if they don't exist
DO $$
BEGIN
  -- Check and add premium column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name = 'premium'
  ) THEN
    ALTER TABLE public.quotes ADD COLUMN premium NUMERIC(10,2);
    RAISE NOTICE 'Added premium column to quotes table';
  END IF;

  -- Check and add scoring columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name = 'quote_score'
  ) THEN
    ALTER TABLE public.quotes ADD COLUMN quote_score INTEGER CHECK (quote_score >= 0 AND quote_score <= 100);
    RAISE NOTICE 'Added quote_score column to quotes table';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name = 'price_score'
  ) THEN
    ALTER TABLE public.quotes ADD COLUMN price_score INTEGER CHECK (price_score >= 0 AND price_score <= 30);
    RAISE NOTICE 'Added price_score column to quotes table';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name = 'coverage_completeness_score'
  ) THEN
    ALTER TABLE public.quotes ADD COLUMN coverage_completeness_score INTEGER CHECK (coverage_completeness_score >= 0 AND coverage_completeness_score <= 25);
    RAISE NOTICE 'Added coverage_completeness_score column to quotes table';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name = 'carrier_rating_score'
  ) THEN
    ALTER TABLE public.quotes ADD COLUMN carrier_rating_score INTEGER CHECK (carrier_rating_score >= 0 AND carrier_rating_score <= 20);
    RAISE NOTICE 'Added carrier_rating_score column to quotes table';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name = 'deductible_score'
  ) THEN
    ALTER TABLE public.quotes ADD COLUMN deductible_score INTEGER CHECK (deductible_score >= 0 AND deductible_score <= 15);
    RAISE NOTICE 'Added deductible_score column to quotes table';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name = 'value_score'
  ) THEN
    ALTER TABLE public.quotes ADD COLUMN value_score INTEGER CHECK (value_score >= 0 AND value_score <= 10);
    RAISE NOTICE 'Added value_score column to quotes table';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name = 'ai_recommendation'
  ) THEN
    ALTER TABLE public.quotes ADD COLUMN ai_recommendation TEXT;
    RAISE NOTICE 'Added ai_recommendation column to quotes table';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name = 'scoring_metadata'
  ) THEN
    ALTER TABLE public.quotes ADD COLUMN scoring_metadata JSONB DEFAULT '{}'::jsonb;
    RAISE NOTICE 'Added scoring_metadata column to quotes table';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name = 'last_scored_at'
  ) THEN
    ALTER TABLE public.quotes ADD COLUMN last_scored_at TIMESTAMP WITH TIME ZONE;
    RAISE NOTICE 'Added last_scored_at column to quotes table';
  END IF;
END $$;

-- =============================================================================
-- STEP 2: Verify and fix quote_coverages table
-- =============================================================================

DO $$
BEGIN
  -- Check if table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'quote_coverages'
  ) THEN
    -- Create the table with all required columns
    CREATE TABLE public.quote_coverages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
      coverage_type TEXT NOT NULL,
      coverage_name TEXT,
      coverage_limit NUMERIC(12,2),
      deductible NUMERIC(10,2),
      premium NUMERIC(10,2),
      is_included BOOLEAN DEFAULT true,
      is_critical BOOLEAN DEFAULT false,
      is_extracted_from_document BOOLEAN DEFAULT false,
      notes TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
    );
    RAISE NOTICE 'Created quote_coverages table';
  ELSE
    -- Table exists, add missing columns
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'quote_coverages' AND column_name = 'is_critical'
    ) THEN
      ALTER TABLE public.quote_coverages ADD COLUMN is_critical BOOLEAN DEFAULT false;
      RAISE NOTICE 'Added is_critical column to quote_coverages table';
    END IF;
  END IF;
END $$;

-- =============================================================================
-- STEP 3: Create indexes (now safe to create)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_quotes_quote_score
  ON public.quotes(quote_score DESC NULLS LAST)
  WHERE quote_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_account_score
  ON public.quotes(account_id, quote_score DESC NULLS LAST)
  WHERE quote_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quote_coverages_critical
  ON public.quote_coverages(quote_id, is_critical, is_included)
  WHERE is_critical = true;

-- =============================================================================
-- STEP 4: Final validation
-- =============================================================================

DO $$
DECLARE
  v_missing_columns TEXT[];
BEGIN
  -- Check all required columns exist
  SELECT ARRAY_AGG(column_name)
  INTO v_missing_columns
  FROM (
    VALUES
      ('quotes', 'premium'),
      ('quotes', 'quote_score'),
      ('quotes', 'price_score'),
      ('quotes', 'coverage_completeness_score'),
      ('quotes', 'carrier_rating_score'),
      ('quotes', 'deductible_score'),
      ('quotes', 'value_score'),
      ('quotes', 'ai_recommendation'),
      ('quotes', 'scoring_metadata'),
      ('quotes', 'last_scored_at'),
      ('quote_coverages', 'is_critical')
  ) AS required_cols(table_name, column_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public'
    AND c.table_name = required_cols.table_name
    AND c.column_name = required_cols.column_name
  );

  IF v_missing_columns IS NOT NULL AND array_length(v_missing_columns, 1) > 0 THEN
    RAISE EXCEPTION 'Migration incomplete - missing columns: %', array_to_string(v_missing_columns, ', ');
  ELSE
    RAISE NOTICE '✅ Quote schema migration completed successfully - all required columns exist';
  END IF;
END $$;
