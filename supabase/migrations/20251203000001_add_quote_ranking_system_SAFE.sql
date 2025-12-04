-- Migration: Add Quote Ranking System (SAFE VERSION - Idempotent)
-- Description: Adds multi-dimensional quote scoring capabilities
-- Date: 2024-12-03 (Updated 2024-12-04 for safety)
-- Author: Claude CEO Co-Pilot

-- This version uses IF NOT EXISTS and DROP IF EXISTS to be idempotent
-- Safe to run multiple times without errors

-- =============================================================================
-- PART 1: Add scoring columns to quotes table (IF NOT EXISTS)
-- =============================================================================

DO $$
BEGIN
  -- Add premium column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'premium'
  ) THEN
    ALTER TABLE public.quotes ADD COLUMN premium NUMERIC(10,2);
    COMMENT ON COLUMN public.quotes.premium IS 'Annual premium amount for the quote';
  END IF;

  -- Add quote_score column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'quote_score'
  ) THEN
    ALTER TABLE public.quotes ADD COLUMN quote_score INTEGER DEFAULT 0 CHECK (quote_score >= 0 AND quote_score <= 100);
    COMMENT ON COLUMN public.quotes.quote_score IS 'Overall composite score (0-100) based on all dimensions';
  END IF;

  -- Add price_score column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'price_score'
  ) THEN
    ALTER TABLE public.quotes ADD COLUMN price_score INTEGER DEFAULT 0 CHECK (price_score >= 0 AND price_score <= 100);
    COMMENT ON COLUMN public.quotes.price_score IS 'Price competitiveness score (0-30 points)';
  END IF;

  -- Add coverage_completeness_score column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'coverage_completeness_score'
  ) THEN
    ALTER TABLE public.quotes ADD COLUMN coverage_completeness_score INTEGER DEFAULT 0 CHECK (coverage_completeness_score >= 0 AND coverage_completeness_score <= 100);
    COMMENT ON COLUMN public.quotes.coverage_completeness_score IS 'Coverage breadth score (0-25 points)';
  END IF;

  -- Add carrier_rating_score column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'carrier_rating_score'
  ) THEN
    ALTER TABLE public.quotes ADD COLUMN carrier_rating_score INTEGER DEFAULT 0 CHECK (carrier_rating_score >= 0 AND carrier_rating_score <= 100);
    COMMENT ON COLUMN public.quotes.carrier_rating_score IS 'Carrier quality score (0-20 points)';
  END IF;

  -- Add deductible_score column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'deductible_score'
  ) THEN
    ALTER TABLE public.quotes ADD COLUMN deductible_score INTEGER DEFAULT 0 CHECK (deductible_score >= 0 AND deductible_score <= 100);
    COMMENT ON COLUMN public.quotes.deductible_score IS 'Deductible quality score (0-15 points)';
  END IF;

  -- Add value_score column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'value_score'
  ) THEN
    ALTER TABLE public.quotes ADD COLUMN value_score INTEGER DEFAULT 0 CHECK (value_score >= 0 AND value_score <= 100);
    COMMENT ON COLUMN public.quotes.value_score IS 'Value/price-per-coverage score (0-10 points)';
  END IF;

  -- Add competitiveness_rank column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'competitiveness_rank'
  ) THEN
    ALTER TABLE public.quotes ADD COLUMN competitiveness_rank INTEGER;
    COMMENT ON COLUMN public.quotes.competitiveness_rank IS 'Rank within account (1 = best)';
  END IF;

  -- Add scoring_metadata column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'scoring_metadata'
  ) THEN
    ALTER TABLE public.quotes ADD COLUMN scoring_metadata JSONB DEFAULT '{}'::jsonb;
    COMMENT ON COLUMN public.quotes.scoring_metadata IS 'Detailed scoring factors and calculations';
  END IF;

  -- Add last_scored_at column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'last_scored_at'
  ) THEN
    ALTER TABLE public.quotes ADD COLUMN last_scored_at TIMESTAMP WITH TIME ZONE;
    COMMENT ON COLUMN public.quotes.last_scored_at IS 'Timestamp of last scoring calculation';
  END IF;

  -- Add ai_recommendation column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotes' AND column_name = 'ai_recommendation'
  ) THEN
    ALTER TABLE public.quotes ADD COLUMN ai_recommendation TEXT;
    COMMENT ON COLUMN public.quotes.ai_recommendation IS 'AI-generated recommendation text';
  END IF;
END $$;

-- =============================================================================
-- PART 2: Create quote_coverages table (IF NOT EXISTS)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.quote_coverages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  coverage_type TEXT NOT NULL,
  limit_amount TEXT,
  deductible_amount TEXT,
  premium_amount NUMERIC(10,2),
  is_included BOOLEAN DEFAULT true,
  extracted_from_document BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.quote_coverages IS 'Individual coverages included in a quote';
COMMENT ON COLUMN public.quote_coverages.coverage_type IS 'Type of coverage (e.g., BI, PD, COMP, COLL)';
COMMENT ON COLUMN public.quote_coverages.extracted_from_document IS 'True if extracted via OCR/AI from uploaded document';

-- =============================================================================
-- PART 3: Create carrier_ratings table (IF NOT EXISTS)
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

COMMENT ON TABLE public.carrier_ratings IS 'Quality metrics and ratings for insurance carriers';
COMMENT ON COLUMN public.carrier_ratings.overall_rating IS 'Overall carrier rating (0-5 stars)';
COMMENT ON COLUMN public.carrier_ratings.denial_rate IS 'Percentage of claims denied by carrier';
COMMENT ON COLUMN public.carrier_ratings.win_rate IS 'Percentage of quotes won for this carrier';

-- =============================================================================
-- PART 4: Create indexes (IF NOT EXISTS)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_quotes_quote_score
  ON public.quotes(quote_score DESC);

CREATE INDEX IF NOT EXISTS idx_quotes_account_score
  ON public.quotes(account_id, quote_score DESC);

CREATE INDEX IF NOT EXISTS idx_quotes_last_scored
  ON public.quotes(last_scored_at DESC);

CREATE INDEX IF NOT EXISTS idx_quote_coverages_quote_id
  ON public.quote_coverages(quote_id);

CREATE INDEX IF NOT EXISTS idx_quote_coverages_type
  ON public.quote_coverages(coverage_type);

CREATE INDEX IF NOT EXISTS idx_carrier_ratings_carrier_id
  ON public.carrier_ratings(carrier_id);

CREATE INDEX IF NOT EXISTS idx_carrier_ratings_name
  ON public.carrier_ratings(carrier_name);

-- =============================================================================
-- PART 5: Row Level Security for quote_coverages
-- =============================================================================

ALTER TABLE public.quote_coverages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then recreate
DROP POLICY IF EXISTS "Users can view coverages for quotes they can access" ON public.quote_coverages;
DROP POLICY IF EXISTS "Users can insert coverages for their quotes" ON public.quote_coverages;
DROP POLICY IF EXISTS "Users can update coverages for their quotes" ON public.quote_coverages;
DROP POLICY IF EXISTS "Users can delete coverages for their quotes" ON public.quote_coverages;

CREATE POLICY "Users can view coverages for quotes they can access"
  ON public.quote_coverages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_coverages.quote_id
    )
  );

CREATE POLICY "Users can insert coverages for their quotes"
  ON public.quote_coverages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_coverages.quote_id
    )
  );

CREATE POLICY "Users can update coverages for their quotes"
  ON public.quote_coverages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_coverages.quote_id
    )
  );

CREATE POLICY "Users can delete coverages for their quotes"
  ON public.quote_coverages FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_coverages.quote_id
    )
  );

-- =============================================================================
-- PART 6: Row Level Security for carrier_ratings
-- =============================================================================

ALTER TABLE public.carrier_ratings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then recreate
DROP POLICY IF EXISTS "All authenticated users can view carrier ratings" ON public.carrier_ratings;
DROP POLICY IF EXISTS "Only admins can modify carrier ratings" ON public.carrier_ratings;

CREATE POLICY "All authenticated users can view carrier ratings"
  ON public.carrier_ratings FOR SELECT
  TO authenticated
  USING (true);

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

-- =============================================================================
-- PART 7: Create materialized view for quote rankings (REFRESH if exists)
-- =============================================================================

-- Drop and recreate materialized view
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

-- Create index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_quote_rankings_quote_id
  ON public.quote_rankings(quote_id);

CREATE INDEX IF NOT EXISTS idx_quote_rankings_account_rank
  ON public.quote_rankings(account_id, rank_in_account);

COMMENT ON MATERIALIZED VIEW public.quote_rankings IS 'Pre-computed quote rankings per account for performance';

-- =============================================================================
-- PART 8: Grant permissions
-- =============================================================================

GRANT SELECT ON public.quote_coverages TO authenticated;
GRANT INSERT ON public.quote_coverages TO authenticated;
GRANT UPDATE ON public.quote_coverages TO authenticated;
GRANT DELETE ON public.quote_coverages TO authenticated;

GRANT SELECT ON public.carrier_ratings TO authenticated;

GRANT SELECT ON public.quote_rankings TO authenticated;

-- =============================================================================
-- PART 9: Refresh materialized view function
-- =============================================================================

CREATE OR REPLACE FUNCTION public.refresh_quote_rankings()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.quote_rankings;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.refresh_quote_rankings IS 'Refresh the quote rankings materialized view';

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- Verify columns added to quotes table
SELECT COUNT(*) as scoring_columns_added
FROM information_schema.columns
WHERE table_name = 'quotes'
  AND column_name IN (
    'quote_score', 'premium', 'price_score', 'coverage_completeness_score',
    'carrier_rating_score', 'deductible_score', 'value_score',
    'competitiveness_rank', 'scoring_metadata', 'last_scored_at', 'ai_recommendation'
  );
-- Expected: 11

-- Verify tables exist
SELECT COUNT(*) as tables_created
FROM information_schema.tables
WHERE table_name IN ('quote_coverages', 'carrier_ratings');
-- Expected: 2

-- Verify materialized view exists
SELECT COUNT(*) as matview_created
FROM pg_matviews
WHERE matviewname = 'quote_rankings';
-- Expected: 1

-- Verify indexes exist
SELECT COUNT(*) as indexes_created
FROM pg_indexes
WHERE tablename IN ('quotes', 'quote_coverages', 'carrier_ratings', 'quote_rankings')
  AND indexname LIKE 'idx_%';
-- Expected: 9+

-- =============================================================================
-- Migration Complete
-- =============================================================================

-- Summary of changes:
-- 1. Added 11 scoring columns to quotes table (IF NOT EXISTS)
-- 2. Created quote_coverages table (IF NOT EXISTS)
-- 3. Created carrier_ratings table (IF NOT EXISTS)
-- 4. Created indexes for performance (IF NOT EXISTS)
-- 5. Implemented Row Level Security policies (DROP IF EXISTS, then CREATE)
-- 6. Created materialized view for rankings (DROP IF EXISTS, then CREATE)
-- 7. All changes are backward compatible and idempotent
