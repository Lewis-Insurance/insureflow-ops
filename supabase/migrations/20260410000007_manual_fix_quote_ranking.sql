-- MANUAL FIX: Quote Ranking System
-- Run this instead - it only adds what's missing
-- Safe to run multiple times

-- =============================================================================
-- Step 1: Add missing columns to quotes table (only if they don't exist)
-- =============================================================================

DO $$
BEGIN
  -- Check and add each column individually
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotes' AND column_name = 'premium') THEN
    ALTER TABLE public.quotes ADD COLUMN premium NUMERIC(10,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotes' AND column_name = 'quote_score') THEN
    ALTER TABLE public.quotes ADD COLUMN quote_score INTEGER DEFAULT 0 CHECK (quote_score >= 0 AND quote_score <= 100);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotes' AND column_name = 'price_score') THEN
    ALTER TABLE public.quotes ADD COLUMN price_score INTEGER DEFAULT 0 CHECK (price_score >= 0 AND price_score <= 100);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotes' AND column_name = 'coverage_completeness_score') THEN
    ALTER TABLE public.quotes ADD COLUMN coverage_completeness_score INTEGER DEFAULT 0 CHECK (coverage_completeness_score >= 0 AND coverage_completeness_score <= 100);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotes' AND column_name = 'carrier_rating_score') THEN
    ALTER TABLE public.quotes ADD COLUMN carrier_rating_score INTEGER DEFAULT 0 CHECK (carrier_rating_score >= 0 AND carrier_rating_score <= 100);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotes' AND column_name = 'deductible_score') THEN
    ALTER TABLE public.quotes ADD COLUMN deductible_score INTEGER DEFAULT 0 CHECK (deductible_score >= 0 AND deductible_score <= 100);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotes' AND column_name = 'value_score') THEN
    ALTER TABLE public.quotes ADD COLUMN value_score INTEGER DEFAULT 0 CHECK (value_score >= 0 AND value_score <= 100);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotes' AND column_name = 'competitiveness_rank') THEN
    ALTER TABLE public.quotes ADD COLUMN competitiveness_rank INTEGER;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotes' AND column_name = 'scoring_metadata') THEN
    ALTER TABLE public.quotes ADD COLUMN scoring_metadata JSONB DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotes' AND column_name = 'last_scored_at') THEN
    ALTER TABLE public.quotes ADD COLUMN last_scored_at TIMESTAMP WITH TIME ZONE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotes' AND column_name = 'ai_recommendation') THEN
    ALTER TABLE public.quotes ADD COLUMN ai_recommendation TEXT;
  END IF;
END $$;

-- =============================================================================
-- Step 2: Create carrier_ratings table if it doesn't exist
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.carrier_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id UUID REFERENCES public.carriers(id) ON DELETE CASCADE,
  carrier_name TEXT NOT NULL,
  overall_rating NUMERIC(3,2) DEFAULT 0 CHECK (overall_rating >= 0 AND overall_rating <= 5),
  financial_strength_rating TEXT,
  denial_rate NUMERIC(5,2) DEFAULT 0 CHECK (denial_rate >= 0 AND denial_rate <= 100),
  claim_response_time_days INTEGER,
  customer_satisfaction_score NUMERIC(3,2),
  win_rate NUMERIC(5,2),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =============================================================================
-- Step 3: Create indexes (skip quote_coverages - it already has RLS policies)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_quotes_quote_score ON public.quotes(quote_score DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_account_score ON public.quotes(account_id, quote_score DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_last_scored ON public.quotes(last_scored_at DESC);
CREATE INDEX IF NOT EXISTS idx_carrier_ratings_carrier_id ON public.carrier_ratings(carrier_id);
CREATE INDEX IF NOT EXISTS idx_carrier_ratings_name ON public.carrier_ratings(carrier_name);

-- =============================================================================
-- Step 4: Enable RLS on carrier_ratings (quote_coverages already has it)
-- =============================================================================

ALTER TABLE public.carrier_ratings ENABLE ROW LEVEL SECURITY;

-- Only create policies if they don't exist (check first)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'carrier_ratings'
    AND policyname = 'All authenticated users can view carrier ratings'
  ) THEN
    CREATE POLICY "All authenticated users can view carrier ratings"
      ON public.carrier_ratings FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'carrier_ratings'
    AND policyname = 'Only admins can modify carrier ratings'
  ) THEN
    CREATE POLICY "Only admins can modify carrier ratings"
      ON public.carrier_ratings FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role = 'admin'
        )
      );
  END IF;
END $$;

-- =============================================================================
-- Step 5: Create/recreate materialized view
-- =============================================================================

DROP MATERIALIZED VIEW IF EXISTS public.quote_rankings;

CREATE MATERIALIZED VIEW public.quote_rankings AS
SELECT
  q.id AS quote_id,
  q.account_id,
  q.quote_ref,
  q.carrier_id,
  q.line_of_business,
  q.premium,
  q.quote_score,
  q.price_score,
  q.coverage_completeness_score,
  q.carrier_rating_score,
  q.deductible_score,
  q.value_score,
  q.ai_recommendation,
  q.last_scored_at,
  q.status,
  ROW_NUMBER() OVER (
    PARTITION BY q.account_id
    ORDER BY q.quote_score DESC NULLS LAST, q.created_at DESC
  ) AS rank_in_account,
  COUNT(*) OVER (PARTITION BY q.account_id) AS total_quotes_for_account
FROM public.quotes q
WHERE q.deleted_at IS NULL
  AND q.status IN ('open', 'won')
ORDER BY q.account_id, rank_in_account;

CREATE UNIQUE INDEX idx_quote_rankings_quote_id ON public.quote_rankings(quote_id);
CREATE INDEX idx_quote_rankings_account_rank ON public.quote_rankings(account_id, rank_in_account);

-- =============================================================================
-- Step 6: Create refresh function
-- =============================================================================

CREATE OR REPLACE FUNCTION public.refresh_quote_rankings()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.quote_rankings;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Step 7: Grant permissions
-- =============================================================================

GRANT SELECT ON public.carrier_ratings TO authenticated;
GRANT SELECT ON public.quote_rankings TO authenticated;

-- =============================================================================
-- VERIFICATION - Run these to check everything worked
-- =============================================================================

-- Check 1: Verify scoring columns exist (should return 11)
SELECT COUNT(*) as columns_count
FROM information_schema.columns
WHERE table_name = 'quotes'
  AND column_name IN (
    'quote_score', 'premium', 'price_score', 'coverage_completeness_score',
    'carrier_rating_score', 'deductible_score', 'value_score',
    'competitiveness_rank', 'scoring_metadata', 'last_scored_at', 'ai_recommendation'
  );

-- Check 2: Verify tables exist (should return 3)
SELECT table_name
FROM information_schema.tables
WHERE table_name IN ('quotes', 'quote_coverages', 'carrier_ratings')
ORDER BY table_name;

-- Check 3: Verify materialized view exists (should return 1)
SELECT COUNT(*) FROM pg_matviews WHERE matviewname = 'quote_rankings';

-- Check 4: Verify RLS is enabled (should return 2 rows with 't' for rowsecurity)
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('quote_coverages', 'carrier_ratings')
ORDER BY tablename;

-- Success message
SELECT 'Quote Ranking System migration completed successfully!' as status;
