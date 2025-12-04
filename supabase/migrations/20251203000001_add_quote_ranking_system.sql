-- Migration: Add Quote Ranking System
-- Description: Adds multi-dimensional quote scoring capabilities
-- Date: 2024-12-03
-- Author: Claude CEO Co-Pilot

-- =============================================================================
-- PART 1: Add scoring columns to quotes table
-- =============================================================================

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS premium NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS quote_score INTEGER DEFAULT 0 CHECK (quote_score >= 0 AND quote_score <= 100),
  ADD COLUMN IF NOT EXISTS price_score INTEGER DEFAULT 0 CHECK (price_score >= 0 AND price_score <= 100),
  ADD COLUMN IF NOT EXISTS coverage_completeness_score INTEGER DEFAULT 0 CHECK (coverage_completeness_score >= 0 AND coverage_completeness_score <= 100),
  ADD COLUMN IF NOT EXISTS carrier_rating_score INTEGER DEFAULT 0 CHECK (carrier_rating_score >= 0 AND carrier_rating_score <= 100),
  ADD COLUMN IF NOT EXISTS deductible_score INTEGER DEFAULT 0 CHECK (deductible_score >= 0 AND deductible_score <= 100),
  ADD COLUMN IF NOT EXISTS value_score INTEGER DEFAULT 0 CHECK (value_score >= 0 AND value_score <= 100),
  ADD COLUMN IF NOT EXISTS competitiveness_rank INTEGER,
  ADD COLUMN IF NOT EXISTS scoring_metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_scored_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS ai_recommendation TEXT;

COMMENT ON COLUMN public.quotes.premium IS 'Annual premium amount for the quote';
COMMENT ON COLUMN public.quotes.quote_score IS 'Overall composite score (0-100) based on all dimensions';
COMMENT ON COLUMN public.quotes.price_score IS 'Price competitiveness score (0-30 points)';
COMMENT ON COLUMN public.quotes.coverage_completeness_score IS 'Coverage breadth score (0-25 points)';
COMMENT ON COLUMN public.quotes.carrier_rating_score IS 'Carrier quality score (0-20 points)';
COMMENT ON COLUMN public.quotes.deductible_score IS 'Deductible quality score (0-15 points)';
COMMENT ON COLUMN public.quotes.value_score IS 'Value/price-per-coverage score (0-10 points)';
COMMENT ON COLUMN public.quotes.competitiveness_rank IS 'Rank within account (1 = best)';
COMMENT ON COLUMN public.quotes.scoring_metadata IS 'Detailed scoring factors and calculations';
COMMENT ON COLUMN public.quotes.last_scored_at IS 'Timestamp of last scoring calculation';
COMMENT ON COLUMN public.quotes.ai_recommendation IS 'AI-generated recommendation text';

-- =============================================================================
-- PART 2: Create quote_coverages table
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

COMMENT ON TABLE public.quote_coverages IS 'Detailed coverage information for each quote';
COMMENT ON COLUMN public.quote_coverages.quote_id IS 'Reference to the parent quote';
COMMENT ON COLUMN public.quote_coverages.coverage_type IS 'Type of coverage (e.g., BI, PD, COMP, COLL, UM)';
COMMENT ON COLUMN public.quote_coverages.limit_amount IS 'Coverage limit (e.g., $100,000, 100/300/50)';
COMMENT ON COLUMN public.quote_coverages.deductible_amount IS 'Deductible amount (e.g., $500, $1000)';
COMMENT ON COLUMN public.quote_coverages.premium_amount IS 'Premium for this specific coverage';
COMMENT ON COLUMN public.quote_coverages.is_included IS 'Whether this coverage is included in the quote';
COMMENT ON COLUMN public.quote_coverages.extracted_from_document IS 'True if extracted via AI document parsing';

-- =============================================================================
-- PART 3: Create carrier_ratings table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.carrier_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id UUID REFERENCES public.carriers(id) ON DELETE CASCADE,
  carrier_name TEXT NOT NULL,
  overall_rating NUMERIC(3,2) DEFAULT 0.00 CHECK (overall_rating >= 0 AND overall_rating <= 5),
  financial_strength TEXT,
  denial_rate NUMERIC(5,2) DEFAULT 0.00,
  avg_claim_response_days INTEGER,
  customer_satisfaction_score NUMERIC(3,2),
  quote_count INTEGER DEFAULT 0,
  selected_count INTEGER DEFAULT 0,
  win_rate NUMERIC(5,2),
  metadata JSONB DEFAULT '{}'::jsonb,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(carrier_name)
);

COMMENT ON TABLE public.carrier_ratings IS 'Carrier quality metrics for quote ranking';
COMMENT ON COLUMN public.carrier_ratings.overall_rating IS 'Overall carrier rating (0-5 stars)';
COMMENT ON COLUMN public.carrier_ratings.financial_strength IS 'Financial strength rating (e.g., A.M. Best rating)';
COMMENT ON COLUMN public.carrier_ratings.denial_rate IS 'Percentage of quotes that were denied';
COMMENT ON COLUMN public.carrier_ratings.avg_claim_response_days IS 'Average days to respond to claims';
COMMENT ON COLUMN public.carrier_ratings.customer_satisfaction_score IS 'Customer satisfaction rating (0-5)';
COMMENT ON COLUMN public.carrier_ratings.quote_count IS 'Total number of quotes from this carrier';
COMMENT ON COLUMN public.carrier_ratings.selected_count IS 'Number of times this carrier was selected';
COMMENT ON COLUMN public.carrier_ratings.win_rate IS 'Percentage of quotes that were selected (win rate)';

-- =============================================================================
-- PART 4: Create indexes for performance
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_quotes_quote_score ON public.quotes(quote_score DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_account_score ON public.quotes(account_id, quote_score DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_scored_at ON public.quotes(last_scored_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quote_coverages_quote_id ON public.quote_coverages(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_coverages_type ON public.quote_coverages(coverage_type);
CREATE INDEX IF NOT EXISTS idx_carrier_ratings_name ON public.carrier_ratings(carrier_name);
CREATE INDEX IF NOT EXISTS idx_carrier_ratings_overall ON public.carrier_ratings(overall_rating DESC);

-- =============================================================================
-- PART 5: Row Level Security (RLS) Policies
-- =============================================================================

-- Enable RLS on quote_coverages
ALTER TABLE public.quote_coverages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view coverages for quotes they can access
CREATE POLICY "Users can view coverages for quotes they can access"
  ON public.quote_coverages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.account_memberships m ON m.account_id = q.account_id
    WHERE q.id = quote_coverages.quote_id
    AND m.user_id = auth.uid()
  ));

-- Policy: Staff can create coverages
CREATE POLICY "Staff can create coverages"
  ON public.quote_coverages FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.account_memberships m ON m.account_id = q.account_id
    WHERE q.id = quote_coverages.quote_id
    AND m.user_id = auth.uid()
    AND m.role IN ('owner', 'staff')
  ));

-- Policy: Staff can update coverages
CREATE POLICY "Staff can update coverages"
  ON public.quote_coverages FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.account_memberships m ON m.account_id = q.account_id
    WHERE q.id = quote_coverages.quote_id
    AND m.user_id = auth.uid()
    AND m.role IN ('owner', 'staff')
  ));

-- Policy: Staff can delete coverages
CREATE POLICY "Staff can delete coverages"
  ON public.quote_coverages FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.quotes q
    JOIN public.account_memberships m ON m.account_id = q.account_id
    WHERE q.id = quote_coverages.quote_id
    AND m.user_id = auth.uid()
    AND m.role IN ('owner', 'staff')
  ));

-- Enable RLS on carrier_ratings
ALTER TABLE public.carrier_ratings ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can view carrier ratings
CREATE POLICY "All authenticated users can view carrier ratings"
  ON public.carrier_ratings FOR SELECT
  USING (auth.role() = 'authenticated');

-- Policy: Only admins/staff can modify carrier ratings
CREATE POLICY "Only staff can update carrier ratings"
  ON public.carrier_ratings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'staff')
    )
  );

-- =============================================================================
-- PART 6: Triggers for updated_at
-- =============================================================================

-- Trigger for quote_coverages.updated_at
CREATE TRIGGER update_quote_coverages_updated_at
  BEFORE UPDATE ON public.quote_coverages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- PART 7: Materialized View for Quote Rankings
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.quote_rankings AS
SELECT
  q.id,
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
  ROW_NUMBER() OVER (PARTITION BY q.account_id ORDER BY q.quote_score DESC, q.premium ASC) as rank_in_account,
  COUNT(*) OVER (PARTITION BY q.account_id) as total_quotes_for_account
FROM public.quotes q
WHERE q.deleted_at IS NULL
  AND q.status IN ('open', 'pending')
ORDER BY q.account_id, q.quote_score DESC;

COMMENT ON MATERIALIZED VIEW public.quote_rankings IS 'Pre-computed quote rankings by account for fast queries';

-- Create indexes on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_quote_rankings_id ON public.quote_rankings(id);
CREATE INDEX IF NOT EXISTS idx_quote_rankings_account ON public.quote_rankings(account_id, quote_score DESC);
CREATE INDEX IF NOT EXISTS idx_quote_rankings_rank ON public.quote_rankings(account_id, rank_in_account);

-- =============================================================================
-- PART 8: Function to refresh materialized view
-- =============================================================================

CREATE OR REPLACE FUNCTION public.refresh_quote_rankings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.quote_rankings;
END;
$$;

COMMENT ON FUNCTION public.refresh_quote_rankings() IS 'Refreshes the quote_rankings materialized view';

-- =============================================================================
-- PART 9: Seed data for carrier_ratings (common carriers)
-- =============================================================================

INSERT INTO public.carrier_ratings (carrier_name, overall_rating, quote_count, selected_count)
VALUES
  ('State Farm', 4.0, 0, 0),
  ('Allstate', 3.8, 0, 0),
  ('Progressive', 3.9, 0, 0),
  ('GEICO', 4.1, 0, 0),
  ('Travelers', 3.7, 0, 0),
  ('Liberty Mutual', 3.6, 0, 0),
  ('Nationwide', 3.7, 0, 0),
  ('USAA', 4.5, 0, 0),
  ('Farmers', 3.5, 0, 0),
  ('American Family', 3.8, 0, 0)
ON CONFLICT (carrier_name) DO NOTHING;

-- =============================================================================
-- PART 10: Grant permissions
-- =============================================================================

-- Grant permissions on new tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_coverages TO authenticated;
GRANT SELECT ON public.carrier_ratings TO authenticated;
GRANT SELECT ON public.quote_rankings TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_quote_rankings() TO authenticated;

-- =============================================================================
-- Migration Complete
-- =============================================================================

-- Summary of changes:
-- 1. Added 11 new columns to quotes table for scoring
-- 2. Created quote_coverages table (9 columns)
-- 3. Created carrier_ratings table (14 columns)
-- 4. Added 7 performance indexes
-- 5. Implemented Row Level Security policies
-- 6. Created materialized view for fast ranking queries
-- 7. Added refresh function for materialized view
-- 8. Seeded 10 common insurance carriers
-- 9. All changes are backward compatible and additive
