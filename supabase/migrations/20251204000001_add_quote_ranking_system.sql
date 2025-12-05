-- Migration: Add Multi-Dimensional Quote Ranking System
-- Description: Intelligent quote scoring, ranking, and comparison system
-- Date: 2024-12-04
-- Author: Claude CEO Co-Pilot

-- =============================================================================
-- PART 1: Enhance quotes table with scoring columns
-- =============================================================================

-- Add scoring columns to existing quotes table
ALTER TABLE public.quotes
ADD COLUMN IF NOT EXISTS premium NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS quote_score INTEGER CHECK (quote_score >= 0 AND quote_score <= 100),
ADD COLUMN IF NOT EXISTS price_score INTEGER CHECK (price_score >= 0 AND price_score <= 30),
ADD COLUMN IF NOT EXISTS coverage_completeness_score INTEGER CHECK (coverage_completeness_score >= 0 AND coverage_completeness_score <= 25),
ADD COLUMN IF NOT EXISTS carrier_rating_score INTEGER CHECK (carrier_rating_score >= 0 AND carrier_rating_score <= 20),
ADD COLUMN IF NOT EXISTS deductible_score INTEGER CHECK (deductible_score >= 0 AND deductible_score <= 15),
ADD COLUMN IF NOT EXISTS value_score INTEGER CHECK (value_score >= 0 AND value_score <= 10),
ADD COLUMN IF NOT EXISTS ai_recommendation TEXT,
ADD COLUMN IF NOT EXISTS scoring_metadata JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS last_scored_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.quotes.quote_score IS 'Overall composite score (0-100) across all dimensions';
COMMENT ON COLUMN public.quotes.price_score IS 'Price competitiveness score (0-30 points)';
COMMENT ON COLUMN public.quotes.coverage_completeness_score IS 'Coverage breadth score (0-25 points)';
COMMENT ON COLUMN public.quotes.carrier_rating_score IS 'Carrier quality score (0-20 points)';
COMMENT ON COLUMN public.quotes.deductible_score IS 'Deductible quality score (0-15 points)';
COMMENT ON COLUMN public.quotes.value_score IS 'Price per coverage value score (0-10 points)';
COMMENT ON COLUMN public.quotes.ai_recommendation IS 'AI-generated recommendation text';
COMMENT ON COLUMN public.quotes.scoring_metadata IS 'Detailed scoring factors and calculations';

-- =============================================================================
-- PART 2: Create quote_coverages table for granular coverage tracking
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.quote_coverages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Quote reference
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,

  -- Coverage details
  coverage_type TEXT NOT NULL, -- 'liability', 'collision', 'comprehensive', etc.
  coverage_name TEXT, -- Human-readable name
  coverage_limit NUMERIC(12,2), -- Coverage limit amount
  deductible NUMERIC(10,2), -- Deductible amount
  premium NUMERIC(10,2), -- Premium for this coverage

  -- Coverage status
  is_included BOOLEAN DEFAULT true,
  is_critical BOOLEAN DEFAULT false, -- Is this a critical/required coverage?
  is_extracted_from_document BOOLEAN DEFAULT false,

  -- Metadata
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.quote_coverages IS 'Detailed coverage breakdown for quotes';
COMMENT ON COLUMN public.quote_coverages.coverage_type IS 'Standardized coverage type identifier';
COMMENT ON COLUMN public.quote_coverages.is_critical IS 'Critical coverages must be included for good score';

-- =============================================================================
-- PART 3: Create carrier_ratings table for carrier quality metrics
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.carrier_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Carrier identification
  carrier_name TEXT NOT NULL UNIQUE,
  carrier_code TEXT, -- Short code/abbreviation

  -- Quality metrics
  overall_rating NUMERIC(3,2) CHECK (overall_rating >= 0 AND overall_rating <= 5), -- 0-5 stars
  financial_strength TEXT, -- 'A++', 'A+', 'A', 'A-', 'B++', etc.

  -- Performance metrics
  denial_rate NUMERIC(5,2) CHECK (denial_rate >= 0 AND denial_rate <= 100), -- Percentage
  avg_claim_response_days INTEGER,
  customer_satisfaction NUMERIC(3,2) CHECK (customer_satisfaction >= 0 AND customer_satisfaction <= 5),

  -- Our agency's experience
  win_rate NUMERIC(5,2) CHECK (win_rate >= 0 AND win_rate <= 100), -- % of our quotes that win
  total_quotes_submitted INTEGER DEFAULT 0,
  total_quotes_won INTEGER DEFAULT 0,
  avg_premium_difference NUMERIC(10,2), -- vs market average

  -- Market data
  market_share NUMERIC(5,2), -- Percentage
  specialties TEXT[], -- ['commercial', 'auto', 'homeowners']

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_preferred_carrier BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_metrics_update TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE public.carrier_ratings IS 'Carrier quality metrics and performance tracking';
COMMENT ON COLUMN public.carrier_ratings.win_rate IS 'Percentage of our quotes that customer accepts';
COMMENT ON COLUMN public.carrier_ratings.denial_rate IS 'Percentage of claims denied by carrier';

-- =============================================================================
-- PART 4: Create materialized view for quote rankings
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.quote_rankings AS
SELECT
  q.id AS quote_id,
  q.account_id,
  q.premium,
  q.quote_score,
  q.price_score,
  q.coverage_completeness_score,
  q.carrier_rating_score,
  q.deductible_score,
  q.value_score,
  q.ai_recommendation,
  q.carrier_name,
  q.status,
  q.created_at,
  q.last_scored_at,

  -- Ranking within account
  ROW_NUMBER() OVER (
    PARTITION BY q.account_id
    ORDER BY q.quote_score DESC NULLS LAST, q.premium ASC NULLS LAST
  ) AS rank_in_account,

  -- Total quotes for account
  COUNT(*) OVER (PARTITION BY q.account_id) AS total_quotes_in_account,

  -- Stats within account
  AVG(q.premium) OVER (PARTITION BY q.account_id) AS avg_premium_in_account,
  MIN(q.premium) OVER (PARTITION BY q.account_id) AS min_premium_in_account,
  MAX(q.premium) OVER (PARTITION BY q.account_id) AS max_premium_in_account,

  -- Coverage count
  (SELECT COUNT(*) FROM public.quote_coverages qc WHERE qc.quote_id = q.id AND qc.is_included = true) AS coverage_count

FROM public.quotes q
WHERE q.premium IS NOT NULL; -- Only include quotes with premium

COMMENT ON MATERIALIZED VIEW public.quote_rankings IS 'Pre-computed quote rankings per account with stats';

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_quote_rankings_quote_id
  ON public.quote_rankings(quote_id);

-- =============================================================================
-- PART 5: Create indexes for performance
-- =============================================================================

-- Quotes table indexes
CREATE INDEX IF NOT EXISTS idx_quotes_quote_score
  ON public.quotes(quote_score DESC NULLS LAST)
  WHERE quote_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_account_score
  ON public.quotes(account_id, quote_score DESC NULLS LAST)
  WHERE quote_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_premium
  ON public.quotes(premium ASC NULLS LAST)
  WHERE premium IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_carrier_name
  ON public.quotes(carrier_name)
  WHERE carrier_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_last_scored_at
  ON public.quotes(last_scored_at DESC NULLS LAST);

-- Quote coverages indexes
CREATE INDEX IF NOT EXISTS idx_quote_coverages_quote_id
  ON public.quote_coverages(quote_id);

CREATE INDEX IF NOT EXISTS idx_quote_coverages_type
  ON public.quote_coverages(coverage_type);

CREATE INDEX IF NOT EXISTS idx_quote_coverages_critical
  ON public.quote_coverages(quote_id, is_critical, is_included)
  WHERE is_critical = true;

-- Carrier ratings indexes
CREATE INDEX IF NOT EXISTS idx_carrier_ratings_name
  ON public.carrier_ratings(carrier_name);

CREATE INDEX IF NOT EXISTS idx_carrier_ratings_active
  ON public.carrier_ratings(is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_carrier_ratings_preferred
  ON public.carrier_ratings(is_preferred_carrier)
  WHERE is_preferred_carrier = true;

-- =============================================================================
-- PART 6: Row Level Security (RLS)
-- =============================================================================

-- Enable RLS on new tables
ALTER TABLE public.quote_coverages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carrier_ratings ENABLE ROW LEVEL SECURITY;

-- Quote coverages: Users can view coverages for quotes they can see
CREATE POLICY "Users can view quote coverages for accessible quotes"
  ON public.quote_coverages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes q
      LEFT JOIN public.accounts a ON a.id = q.account_id
      LEFT JOIN public.account_memberships am ON am.account_id = a.id
      WHERE q.id = quote_coverages.quote_id
      AND (am.user_id = auth.uid() OR auth.uid() = q.created_by)
    )
  );

-- Staff can manage quote coverages
CREATE POLICY "Staff can manage quote coverages"
  ON public.quote_coverages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'staff')
    )
  );

-- Carrier ratings: All authenticated users can view
CREATE POLICY "Authenticated users can view carrier ratings"
  ON public.carrier_ratings FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only staff can manage carrier ratings
CREATE POLICY "Staff can manage carrier ratings"
  ON public.carrier_ratings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'staff')
    )
  );

-- =============================================================================
-- PART 7: Functions for quote ranking
-- =============================================================================

-- Function to refresh quote rankings materialized view
CREATE OR REPLACE FUNCTION public.refresh_quote_rankings()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.quote_rankings;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.refresh_quote_rankings IS 'Refresh the quote rankings materialized view';

-- Function to get ranked quotes for an account
CREATE OR REPLACE FUNCTION public.get_ranked_quotes_for_account(
  p_account_id UUID,
  p_include_unscored BOOLEAN DEFAULT false
)
RETURNS TABLE(
  quote_id UUID,
  premium NUMERIC,
  quote_score INTEGER,
  price_score INTEGER,
  coverage_completeness_score INTEGER,
  carrier_rating_score INTEGER,
  deductible_score INTEGER,
  value_score INTEGER,
  ai_recommendation TEXT,
  carrier_name TEXT,
  status TEXT,
  rank INTEGER,
  total_quotes INTEGER,
  coverage_count BIGINT,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    qr.quote_id,
    qr.premium,
    qr.quote_score,
    qr.price_score,
    qr.coverage_completeness_score,
    qr.carrier_rating_score,
    qr.deductible_score,
    qr.value_score,
    qr.ai_recommendation,
    qr.carrier_name,
    qr.status,
    qr.rank_in_account::INTEGER,
    qr.total_quotes_in_account::INTEGER,
    qr.coverage_count,
    qr.created_at
  FROM public.quote_rankings qr
  WHERE qr.account_id = p_account_id
  ORDER BY qr.rank_in_account ASC;

  -- If include_unscored, also get quotes without scores
  IF p_include_unscored THEN
    RETURN QUERY
    SELECT
      q.id AS quote_id,
      q.premium,
      q.quote_score,
      q.price_score,
      q.coverage_completeness_score,
      q.carrier_rating_score,
      q.deductible_score,
      q.value_score,
      q.ai_recommendation,
      q.carrier_name,
      q.status,
      999999 AS rank, -- Put unscored at bottom
      (SELECT COUNT(*)::INTEGER FROM public.quotes WHERE account_id = p_account_id) AS total_quotes,
      (SELECT COUNT(*)::BIGINT FROM public.quote_coverages qc WHERE qc.quote_id = q.id) AS coverage_count,
      q.created_at
    FROM public.quotes q
    WHERE q.account_id = p_account_id
    AND q.quote_score IS NULL
    AND q.premium IS NOT NULL
    ORDER BY q.created_at DESC;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_ranked_quotes_for_account IS 'Get all ranked quotes for an account in order';

-- Function to update carrier metrics based on quote outcomes
CREATE OR REPLACE FUNCTION public.update_carrier_metrics_from_quote()
RETURNS TRIGGER AS $$
DECLARE
  v_carrier_name TEXT;
BEGIN
  v_carrier_name := NEW.carrier_name;

  -- Only update if carrier_name exists
  IF v_carrier_name IS NULL OR v_carrier_name = '' THEN
    RETURN NEW;
  END IF;

  -- Ensure carrier exists
  INSERT INTO public.carrier_ratings (carrier_name)
  VALUES (v_carrier_name)
  ON CONFLICT (carrier_name) DO NOTHING;

  -- Update metrics when quote is won/lost
  IF NEW.status = 'won' AND (OLD.status IS NULL OR OLD.status != 'won') THEN
    UPDATE public.carrier_ratings
    SET
      total_quotes_won = total_quotes_won + 1,
      total_quotes_submitted = total_quotes_submitted + 1,
      win_rate = ((total_quotes_won + 1)::NUMERIC / (total_quotes_submitted + 1)::NUMERIC) * 100,
      last_metrics_update = now()
    WHERE carrier_name = v_carrier_name;
  ELSIF NEW.status IN ('lost', 'rejected') AND (OLD.status IS NULL OR OLD.status NOT IN ('lost', 'rejected')) THEN
    UPDATE public.carrier_ratings
    SET
      total_quotes_submitted = total_quotes_submitted + 1,
      win_rate = (total_quotes_won::NUMERIC / (total_quotes_submitted + 1)::NUMERIC) * 100,
      last_metrics_update = now()
    WHERE carrier_name = v_carrier_name;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.update_carrier_metrics_from_quote IS 'Auto-update carrier metrics when quote status changes';

-- Create trigger for carrier metrics update
DROP TRIGGER IF EXISTS update_carrier_metrics_on_quote_change ON public.quotes;
CREATE TRIGGER update_carrier_metrics_on_quote_change
  AFTER INSERT OR UPDATE OF status ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_carrier_metrics_from_quote();

-- =============================================================================
-- PART 8: Triggers for updated_at
-- =============================================================================

CREATE TRIGGER update_quote_coverages_updated_at
  BEFORE UPDATE ON public.quote_coverages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_carrier_ratings_updated_at
  BEFORE UPDATE ON public.carrier_ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- PART 9: Insert default carrier data
-- =============================================================================

-- Insert common carriers with initial ratings
INSERT INTO public.carrier_ratings (
  carrier_name,
  carrier_code,
  overall_rating,
  financial_strength,
  customer_satisfaction,
  is_active,
  specialties
) VALUES
  ('State Farm', 'SF', 4.5, 'A++', 4.3, true, ARRAY['auto', 'home', 'life']),
  ('Progressive', 'PROG', 4.2, 'A+', 4.0, true, ARRAY['auto', 'commercial']),
  ('GEICO', 'GEI', 4.3, 'A++', 4.1, true, ARRAY['auto', 'motorcycle']),
  ('Allstate', 'ALL', 4.1, 'A+', 3.9, true, ARRAY['auto', 'home']),
  ('Liberty Mutual', 'LM', 4.0, 'A', 3.8, true, ARRAY['auto', 'commercial', 'home']),
  ('Nationwide', 'NW', 4.0, 'A+', 3.9, true, ARRAY['auto', 'home', 'farm']),
  ('Travelers', 'TRAV', 4.2, 'A++', 4.0, true, ARRAY['commercial', 'auto', 'home']),
  ('Farmers', 'FARM', 3.9, 'A', 3.7, true, ARRAY['auto', 'home', 'commercial']),
  ('USAA', 'USAA', 4.7, 'A++', 4.6, true, ARRAY['auto', 'home', 'life']),
  ('The Hartford', 'HART', 4.1, 'A+', 4.0, true, ARRAY['commercial', 'auto', 'workers-comp'])
ON CONFLICT (carrier_name) DO NOTHING;

-- =============================================================================
-- PART 10: Grant permissions
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_coverages TO authenticated;
GRANT SELECT ON public.carrier_ratings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carrier_ratings TO service_role;
GRANT SELECT ON public.quote_rankings TO authenticated;

-- =============================================================================
-- Migration Complete
-- =============================================================================

-- Summary of changes:
-- 1. Enhanced quotes table with 7 scoring dimensions + metadata
-- 2. Created quote_coverages table for granular coverage tracking
-- 3. Created carrier_ratings table for carrier quality metrics
-- 4. Created quote_rankings materialized view with rankings and stats
-- 5. Added comprehensive indexes for performance
-- 6. Implemented Row Level Security policies
-- 7. Created helper functions for ranking and metrics updates
-- 8. Added trigger for automatic carrier metrics updates
-- 9. Inserted 10 major carriers with initial ratings
-- 10. All changes are additive and backward compatible
