-- Migration: Add Predictive Analytics Engine
-- Description: Churn prediction, renewal risk forecasting, and product recommendations
-- Date: 2024-12-04
-- Author: Claude CEO Co-Pilot

-- =============================================================================
-- PART 1: Create customer_risk_scores table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.customer_risk_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Customer reference
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,

  -- Churn prediction
  churn_probability NUMERIC(5,2) CHECK (churn_probability >= 0 AND churn_probability <= 100),
  churn_risk_level TEXT CHECK (churn_risk_level IN ('low', 'medium', 'high', 'critical')),
  churn_confidence NUMERIC(5,2) CHECK (churn_confidence >= 0 AND churn_confidence <= 100),

  -- Renewal risk
  renewal_risk_probability NUMERIC(5,2) CHECK (renewal_risk_probability >= 0 AND renewal_risk_probability <= 100),
  renewal_risk_level TEXT CHECK (renewal_risk_level IN ('low', 'medium', 'high', 'critical')),
  days_until_renewal INTEGER,

  -- Lifetime value prediction
  predicted_lifetime_value NUMERIC(10,2),
  current_lifetime_value NUMERIC(10,2),
  ltv_trend TEXT CHECK (ltv_trend IN ('increasing', 'stable', 'declining')),

  -- Risk factors
  risk_factors JSONB DEFAULT '[]'::jsonb,
  -- Example: [
  --   {"factor": "No contact in 90 days", "weight": 0.3, "severity": "high"},
  --   {"factor": "Premium increased 15%", "weight": 0.25, "severity": "medium"}
  -- ]

  protective_factors JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"factor": "5+ years customer", "weight": 0.2}]

  -- Recommended actions
  recommended_actions JSONB DEFAULT '[]'::jsonb,
  -- Example: [
  --   {"action": "Schedule check-in call", "priority": "urgent", "due_days": 7},
  --   {"action": "Review coverage gaps", "priority": "high", "due_days": 14}
  -- ]

  -- Product recommendations
  next_product_predictions JSONB DEFAULT '[]'::jsonb,
  -- Example: [
  --   {"product": "Umbrella Policy", "probability": 68, "rationale": "High net worth"},
  --   {"product": "Commercial Auto", "probability": 45, "rationale": "Business owner"}
  -- ]

  -- Scoring metadata
  model_version TEXT DEFAULT 'v1.0',
  scoring_metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  scored_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + INTERVAL '30 days'),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.customer_risk_scores IS 'Predictive analytics scores for churn, renewal risk, and opportunities';
COMMENT ON COLUMN public.customer_risk_scores.churn_probability IS 'Probability (0-100) customer will churn in next 90 days';
COMMENT ON COLUMN public.customer_risk_scores.risk_factors IS 'Array of factors contributing to risk with weights';
COMMENT ON COLUMN public.customer_risk_scores.recommended_actions IS 'AI-generated intervention recommendations';

-- =============================================================================
-- PART 2: Create churn_predictions materialized view
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.churn_predictions AS
SELECT
  crs.id,
  crs.account_id,
  a.name AS account_name,
  a.created_at AS customer_since,

  -- Churn metrics
  crs.churn_probability,
  crs.churn_risk_level,
  crs.churn_confidence,

  -- Renewal metrics
  crs.renewal_risk_probability,
  crs.renewal_risk_level,
  crs.days_until_renewal,

  -- LTV metrics
  crs.predicted_lifetime_value,
  crs.current_lifetime_value,
  crs.ltv_trend,

  -- Risk analysis
  crs.risk_factors,
  crs.protective_factors,
  crs.recommended_actions,
  crs.next_product_predictions,

  -- Account metrics
  (SELECT COUNT(*) FROM public.policies WHERE account_id = crs.account_id) AS active_policies,
  (SELECT COUNT(*) FROM public.quotes WHERE account_id = crs.account_id AND status = 'won') AS won_quotes,
  (SELECT MAX(created_at) FROM public.tasks WHERE account_id = crs.account_id) AS last_interaction,

  -- Timestamps
  crs.scored_at,
  crs.expires_at

FROM public.customer_risk_scores crs
JOIN public.accounts a ON a.id = crs.account_id
WHERE crs.expires_at > now()
ORDER BY crs.churn_probability DESC;

COMMENT ON MATERIALIZED VIEW public.churn_predictions IS 'Active churn predictions with account context';

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_churn_predictions_id
  ON public.churn_predictions(id);

-- =============================================================================
-- PART 3: Create product_recommendations table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.product_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Customer reference
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,

  -- Product details
  product_name TEXT NOT NULL,
  product_category TEXT, -- 'auto', 'home', 'commercial', 'life', etc.

  -- Prediction
  purchase_probability NUMERIC(5,2) CHECK (purchase_probability >= 0 AND purchase_probability <= 100),
  confidence NUMERIC(5,2) CHECK (confidence >= 0 AND confidence <= 100),

  -- Rationale
  rationale TEXT,
  supporting_factors JSONB DEFAULT '[]'::jsonb,
  -- Example: [
  --   {"factor": "Recent home purchase", "weight": 0.4},
  --   {"factor": "Similar customers bought", "weight": 0.3}
  -- ]

  -- Opportunity metrics
  estimated_annual_premium NUMERIC(10,2),
  estimated_commission NUMERIC(10,2),
  priority_score INTEGER CHECK (priority_score >= 0 AND priority_score <= 100),

  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'presented', 'accepted', 'rejected', 'expired')),
  presented_at TIMESTAMP WITH TIME ZONE,
  outcome_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  model_version TEXT DEFAULT 'v1.0',
  recommendation_metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + INTERVAL '90 days')
);

COMMENT ON TABLE public.product_recommendations IS 'AI-generated product cross-sell and upsell recommendations';
COMMENT ON COLUMN public.product_recommendations.purchase_probability IS 'Likelihood (0-100) customer will purchase product';
COMMENT ON COLUMN public.product_recommendations.priority_score IS 'Combined score of probability and value';

-- =============================================================================
-- PART 4: Create retention_interventions table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.retention_interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Customer and risk reference
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  risk_score_id UUID REFERENCES public.customer_risk_scores(id) ON DELETE SET NULL,

  -- Intervention details
  intervention_type TEXT NOT NULL CHECK (intervention_type IN (
    'check_in_call',
    'coverage_review',
    'premium_discount_offer',
    'payment_plan_adjustment',
    'loyalty_reward',
    'service_recovery',
    'proactive_claim_support',
    'policy_optimization'
  )),

  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  recommended_timeline_days INTEGER,

  -- Execution
  status TEXT DEFAULT 'recommended' CHECK (status IN ('recommended', 'scheduled', 'completed', 'dismissed', 'expired')),
  assigned_to UUID REFERENCES auth.users(id),
  scheduled_for TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,

  -- Outcome tracking
  outcome TEXT CHECK (outcome IN ('successful', 'unsuccessful', 'partial', 'pending')),
  outcome_notes TEXT,
  customer_retained BOOLEAN,

  -- Impact metrics
  pre_intervention_churn_probability NUMERIC(5,2),
  post_intervention_churn_probability NUMERIC(5,2),
  estimated_value_saved NUMERIC(10,2),

  -- Metadata
  intervention_metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.retention_interventions IS 'Retention intervention recommendations and tracking';
COMMENT ON COLUMN public.retention_interventions.customer_retained IS 'Whether customer renewed after intervention';

-- Ensure all columns exist if table was created previously
DO $$
BEGIN
  -- Add missing columns if table exists but columns don't
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'retention_interventions') THEN
    ALTER TABLE public.retention_interventions
    ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS outcome TEXT CHECK (outcome IN ('successful', 'unsuccessful', 'partial', 'pending')),
    ADD COLUMN IF NOT EXISTS outcome_notes TEXT,
    ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id),
    ADD COLUMN IF NOT EXISTS recommended_timeline_days INTEGER,
    ADD COLUMN IF NOT EXISTS intervention_metadata JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- =============================================================================
-- PART 5: Create indexes for performance
-- =============================================================================

-- Customer risk scores indexes
CREATE INDEX IF NOT EXISTS idx_customer_risk_scores_account_id
  ON public.customer_risk_scores(account_id);

CREATE INDEX IF NOT EXISTS idx_customer_risk_scores_churn_probability
  ON public.customer_risk_scores(churn_probability DESC);

CREATE INDEX IF NOT EXISTS idx_customer_risk_scores_risk_level
  ON public.customer_risk_scores(churn_risk_level)
  WHERE churn_risk_level IN ('high', 'critical');

CREATE INDEX IF NOT EXISTS idx_customer_risk_scores_expires_at
  ON public.customer_risk_scores(expires_at DESC);

-- Product recommendations indexes
CREATE INDEX IF NOT EXISTS idx_product_recommendations_account_id
  ON public.product_recommendations(account_id);

CREATE INDEX IF NOT EXISTS idx_product_recommendations_probability
  ON public.product_recommendations(purchase_probability DESC, expires_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_product_recommendations_priority
  ON public.product_recommendations(priority_score DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_product_recommendations_status
  ON public.product_recommendations(status, expires_at DESC);

-- Retention interventions indexes
CREATE INDEX IF NOT EXISTS idx_retention_interventions_account_id
  ON public.retention_interventions(account_id);

CREATE INDEX IF NOT EXISTS idx_retention_interventions_status
  ON public.retention_interventions(status);

CREATE INDEX IF NOT EXISTS idx_retention_interventions_assigned_to
  ON public.retention_interventions(assigned_to)
  WHERE status IN ('recommended', 'scheduled');

CREATE INDEX IF NOT EXISTS idx_retention_interventions_scheduled
  ON public.retention_interventions(scheduled_for)
  WHERE status = 'scheduled';

-- =============================================================================
-- PART 6: Row Level Security
-- =============================================================================

ALTER TABLE public.customer_risk_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_interventions ENABLE ROW LEVEL SECURITY;

-- Users can view risk scores for their accounts
CREATE POLICY "Users can view risk scores for their accounts"
  ON public.customer_risk_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.account_id = customer_risk_scores.account_id
      AND am.user_id = auth.uid()
    )
  );

-- Staff can manage risk scores
CREATE POLICY "Staff can manage risk scores"
  ON public.customer_risk_scores FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'staff')
    )
  );

-- Product recommendations policies
CREATE POLICY "Users can view product recommendations for their accounts"
  ON public.product_recommendations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.account_id = product_recommendations.account_id
      AND am.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can manage product recommendations"
  ON public.product_recommendations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'staff')
    )
  );

-- Retention interventions policies
CREATE POLICY "Users can view interventions for their accounts"
  ON public.retention_interventions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      WHERE am.account_id = retention_interventions.account_id
      AND am.user_id = auth.uid()
    )
    OR assigned_to = auth.uid()
  );

CREATE POLICY "Staff can manage interventions"
  ON public.retention_interventions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'staff')
    )
  );

-- =============================================================================
-- PART 7: Helper functions
-- =============================================================================

-- Function to refresh churn predictions materialized view
CREATE OR REPLACE FUNCTION public.refresh_churn_predictions()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.churn_predictions;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.refresh_churn_predictions IS 'Refresh churn predictions materialized view';

-- Function to get at-risk customers
CREATE OR REPLACE FUNCTION public.get_at_risk_customers(
  p_risk_threshold NUMERIC DEFAULT 60,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(
  account_id UUID,
  account_name TEXT,
  churn_probability NUMERIC,
  risk_level TEXT,
  days_until_renewal INTEGER,
  risk_factors JSONB,
  recommended_actions JSONB,
  last_interaction TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cp.account_id,
    cp.account_name,
    cp.churn_probability,
    cp.churn_risk_level AS risk_level,
    cp.days_until_renewal,
    cp.risk_factors,
    cp.recommended_actions,
    cp.last_interaction
  FROM public.churn_predictions cp
  WHERE cp.churn_probability >= p_risk_threshold
  ORDER BY cp.churn_probability DESC, cp.days_until_renewal ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_at_risk_customers IS 'Get customers above risk threshold, ordered by urgency';

-- Function to get top product opportunities
CREATE OR REPLACE FUNCTION public.get_top_product_opportunities(
  p_min_probability NUMERIC DEFAULT 50,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE(
  account_id UUID,
  account_name TEXT,
  product_name TEXT,
  product_category TEXT,
  purchase_probability NUMERIC,
  estimated_annual_premium NUMERIC,
  estimated_commission NUMERIC,
  priority_score INTEGER,
  rationale TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pr.account_id,
    a.name AS account_name,
    pr.product_name,
    pr.product_category,
    pr.purchase_probability,
    pr.estimated_annual_premium,
    pr.estimated_commission,
    pr.priority_score,
    pr.rationale
  FROM public.product_recommendations pr
  JOIN public.accounts a ON a.id = pr.account_id
  WHERE pr.status = 'pending'
  AND pr.expires_at > now()
  AND pr.purchase_probability >= p_min_probability
  ORDER BY pr.priority_score DESC, pr.purchase_probability DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_top_product_opportunities IS 'Get highest-priority product opportunities';

-- =============================================================================
-- PART 8: Triggers for updated_at
-- =============================================================================

DROP TRIGGER IF EXISTS update_customer_risk_scores_updated_at ON public.customer_risk_scores;
CREATE TRIGGER update_customer_risk_scores_updated_at
  BEFORE UPDATE ON public.customer_risk_scores
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_product_recommendations_updated_at ON public.product_recommendations;
CREATE TRIGGER update_product_recommendations_updated_at
  BEFORE UPDATE ON public.product_recommendations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_retention_interventions_updated_at ON public.retention_interventions;
CREATE TRIGGER update_retention_interventions_updated_at
  BEFORE UPDATE ON public.retention_interventions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- PART 9: Grant permissions
-- =============================================================================

GRANT SELECT ON public.customer_risk_scores TO authenticated;
GRANT SELECT ON public.product_recommendations TO authenticated;
GRANT SELECT ON public.retention_interventions TO authenticated;
GRANT SELECT ON public.churn_predictions TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.customer_risk_scores TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.product_recommendations TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.retention_interventions TO service_role;

-- =============================================================================
-- Migration Complete
-- =============================================================================

-- Summary of changes:
-- 1. Created customer_risk_scores table for churn and renewal predictions
-- 2. Created churn_predictions materialized view with account context
-- 3. Created product_recommendations table for cross-sell opportunities
-- 4. Created retention_interventions table for tracking retention efforts
-- 5. Added comprehensive indexes for performance
-- 6. Implemented Row Level Security policies
-- 7. Created helper functions for common queries
-- 8. All changes are additive and backward compatible
