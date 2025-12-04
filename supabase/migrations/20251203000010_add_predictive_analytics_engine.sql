-- Migration: Add Predictive Analytics Engine
-- Description: AI-powered churn prediction, renewal forecasting, and customer insights
-- Date: 2024-12-03
-- Author: Claude CEO Co-Pilot

-- =============================================================================
-- PART 1: Create customer_predictions table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.customer_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Customer reference
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  customer_name TEXT,

  -- Prediction metadata
  prediction_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
  prediction_model_version TEXT DEFAULT 'v1.0',

  -- Churn Prediction (0-100%)
  churn_probability INTEGER CHECK (churn_probability >= 0 AND churn_probability <= 100),
  churn_risk_level TEXT CHECK (churn_risk_level IN ('very_low', 'low', 'medium', 'high', 'critical')),
  churn_factors JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"factor": "low_engagement", "weight": 0.35}, {"factor": "price_sensitivity", "weight": 0.25}]

  -- Renewal Prediction
  renewal_probability INTEGER CHECK (renewal_probability >= 0 AND renewal_probability <= 100),
  predicted_renewal_date DATE,
  renewal_confidence_score INTEGER CHECK (renewal_confidence_score >= 0 AND renewal_confidence_score <= 100),

  -- Next Product Prediction
  next_product_prediction TEXT,
  next_product_probability INTEGER CHECK (next_product_probability >= 0 AND next_product_probability <= 100),
  cross_sell_opportunities JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"product": "umbrella", "probability": 0.75, "rationale": "High asset value"}]

  -- Claim Prediction
  claim_probability INTEGER CHECK (claim_probability >= 0 AND claim_probability <= 100),
  predicted_claim_type TEXT,
  claim_risk_factors JSONB DEFAULT '[]'::jsonb,

  -- Premium Sensitivity
  premium_sensitivity_score INTEGER CHECK (premium_sensitivity_score >= 0 AND premium_sensitivity_score <= 100),
  price_elasticity TEXT CHECK (price_elasticity IN ('very_low', 'low', 'medium', 'high', 'very_high')),
  max_acceptable_increase_pct NUMERIC(5,2),

  -- Lifetime Value
  predicted_ltv NUMERIC(10,2),
  ltv_confidence INTEGER CHECK (ltv_confidence >= 0 AND ltv_confidence <= 100),

  -- AI Insights
  ai_summary TEXT,
  ai_recommendations JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"action": "proactive_outreach", "timing": "immediate", "reason": "High churn risk"}]

  -- Model factors (for explainability)
  model_factors JSONB DEFAULT '{}'::jsonb,
  -- Example: {"engagement_score": 25, "payment_history": 90, "claim_count": 2, "tenure_months": 36}

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'archived')),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + INTERVAL '30 days'),

  -- Action tracking
  actions_taken JSONB DEFAULT '[]'::jsonb,
  outcome_actual TEXT, -- Did prediction come true?
  outcome_date TIMESTAMP WITH TIME ZONE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.customer_predictions IS 'AI-powered predictive analytics for customer behavior';
COMMENT ON COLUMN public.customer_predictions.churn_probability IS 'Likelihood customer will not renew (0-100%)';
COMMENT ON COLUMN public.customer_predictions.churn_factors IS 'Array of factors contributing to churn risk with weights';
COMMENT ON COLUMN public.customer_predictions.next_product_prediction IS 'Most likely next product customer will purchase';
COMMENT ON COLUMN public.customer_predictions.premium_sensitivity_score IS 'How sensitive customer is to rate increases';
COMMENT ON COLUMN public.customer_predictions.predicted_ltv IS 'Predicted customer lifetime value';
COMMENT ON COLUMN public.customer_predictions.model_factors IS 'Input factors used in prediction for explainability';

-- =============================================================================
-- PART 2: Create prediction_accuracy_tracking table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.prediction_accuracy_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Prediction reference
  prediction_id UUID REFERENCES public.customer_predictions(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,

  -- Prediction details
  prediction_type TEXT NOT NULL CHECK (prediction_type IN (
    'churn', 'renewal', 'next_product', 'claim', 'ltv'
  )),
  predicted_value TEXT NOT NULL, -- What was predicted
  predicted_probability INTEGER, -- Confidence level
  prediction_date TIMESTAMP WITH TIME ZONE NOT NULL,

  -- Actual outcome
  actual_value TEXT, -- What actually happened
  actual_date TIMESTAMP WITH TIME ZONE,
  was_accurate BOOLEAN,
  accuracy_score INTEGER CHECK (accuracy_score >= 0 AND accuracy_score <= 100),

  -- Error analysis
  error_margin NUMERIC(10,2),
  error_type TEXT, -- 'false_positive', 'false_negative', 'magnitude_error'

  -- Model improvement
  feedback_provided BOOLEAN DEFAULT false,
  feedback_notes TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.prediction_accuracy_tracking IS 'Track prediction accuracy for continuous model improvement';

-- =============================================================================
-- PART 3: Create retention_interventions table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.retention_interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Customer & Prediction
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  prediction_id UUID REFERENCES public.customer_predictions(id) ON DELETE SET NULL,

  -- Intervention details
  intervention_type TEXT NOT NULL CHECK (intervention_type IN (
    'proactive_call', 'special_offer', 'coverage_review',
    'loyalty_program', 'rate_freeze', 'service_upgrade',
    'personal_visit', 'customer_appreciation', 'other'
  )),
  intervention_title TEXT NOT NULL,
  intervention_description TEXT,

  -- Targeting
  churn_risk_at_intervention TEXT,
  triggered_by_score INTEGER, -- Churn score that triggered this

  -- Execution
  scheduled_date DATE,
  executed_date TIMESTAMP WITH TIME ZONE,
  assigned_to UUID REFERENCES auth.users(id),

  -- Offer details (if applicable)
  offer_type TEXT,
  offer_value NUMERIC(10,2),
  offer_expires_at DATE,

  -- Outcome
  status TEXT DEFAULT 'planned' CHECK (status IN (
    'planned', 'scheduled', 'in_progress', 'completed', 'cancelled', 'failed'
  )),
  customer_response TEXT CHECK (customer_response IN (
    'positive', 'neutral', 'negative', 'no_response'
  )),
  was_successful BOOLEAN,
  success_metrics JSONB,

  -- Cost/ROI tracking
  intervention_cost NUMERIC(10,2),
  retained_revenue NUMERIC(10,2),
  roi NUMERIC(10,2),

  -- Notes
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.retention_interventions IS 'Track retention efforts and their effectiveness';

-- =============================================================================
-- PART 4: Create analytics materialized view
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.predictive_analytics_dashboard AS
SELECT
  DATE_TRUNC('month', prediction_date) AS month,
  churn_risk_level,

  -- Volume metrics
  COUNT(*) AS total_predictions,
  COUNT(DISTINCT account_id) AS unique_customers,

  -- Churn metrics
  AVG(churn_probability) AS avg_churn_probability,
  COUNT(CASE WHEN churn_probability >= 70 THEN 1 END) AS high_risk_count,
  COUNT(CASE WHEN churn_probability >= 50 AND churn_probability < 70 THEN 1 END) AS medium_risk_count,

  -- Renewal metrics
  AVG(renewal_probability) AS avg_renewal_probability,
  COUNT(CASE WHEN renewal_probability >= 80 THEN 1 END) AS likely_renewals,

  -- Revenue at risk
  SUM(predicted_ltv) FILTER (WHERE churn_probability >= 70) AS revenue_at_risk_high,
  SUM(predicted_ltv) FILTER (WHERE churn_probability >= 50) AS revenue_at_risk_medium,

  -- Actions taken
  SUM(jsonb_array_length(COALESCE(actions_taken, '[]'::jsonb))) AS total_actions_taken,

  -- Outcomes (if available)
  COUNT(CASE WHEN outcome_actual = 'churned' THEN 1 END) AS actual_churns,
  COUNT(CASE WHEN outcome_actual = 'renewed' THEN 1 END) AS actual_renewals,

  -- Accuracy (where outcomes are known)
  ROUND(
    (COUNT(CASE
      WHEN outcome_actual IS NOT NULL AND
           ((churn_probability >= 50 AND outcome_actual = 'churned') OR
            (churn_probability < 50 AND outcome_actual = 'renewed'))
      THEN 1 END)::NUMERIC /
     NULLIF(COUNT(CASE WHEN outcome_actual IS NOT NULL THEN 1 END), 0)) * 100,
    2
  ) AS prediction_accuracy_pct

FROM public.customer_predictions
WHERE status = 'active'
GROUP BY DATE_TRUNC('month', prediction_date), churn_risk_level
ORDER BY month DESC, churn_risk_level;

COMMENT ON MATERIALIZED VIEW public.predictive_analytics_dashboard IS 'Monthly predictive analytics performance metrics';

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_predictive_analytics_dashboard_unique
  ON public.predictive_analytics_dashboard(month, COALESCE(churn_risk_level, 'unknown'));

-- =============================================================================
-- PART 5: Create at-risk customers view
-- =============================================================================

CREATE OR REPLACE VIEW public.at_risk_customers_current AS
SELECT
  cp.id,
  cp.account_id,
  cp.customer_name,
  cp.churn_probability,
  cp.churn_risk_level,
  cp.churn_factors,
  cp.renewal_probability,
  cp.predicted_renewal_date,
  cp.predicted_ltv,
  cp.premium_sensitivity_score,
  cp.ai_summary,
  cp.ai_recommendations,
  cp.prediction_date,

  -- Intervention tracking
  (SELECT COUNT(*)
   FROM public.retention_interventions ri
   WHERE ri.prediction_id = cp.id) AS intervention_count,
  (SELECT MAX(executed_date)
   FROM public.retention_interventions ri
   WHERE ri.prediction_id = cp.id) AS last_intervention_date,

  -- Days until predicted churn
  CASE
    WHEN cp.predicted_renewal_date IS NOT NULL THEN
      cp.predicted_renewal_date - CURRENT_DATE
    ELSE NULL
  END AS days_until_renewal

FROM public.customer_predictions cp
WHERE cp.status = 'active'
  AND cp.churn_probability >= 50 -- Medium risk or higher
ORDER BY cp.churn_probability DESC, cp.predicted_ltv DESC;

COMMENT ON VIEW public.at_risk_customers_current IS 'Current at-risk customers requiring attention';

-- =============================================================================
-- PART 6: Create indexes for performance
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_customer_predictions_account
  ON public.customer_predictions(account_id);

CREATE INDEX IF NOT EXISTS idx_customer_predictions_churn_risk
  ON public.customer_predictions(churn_risk_level, churn_probability DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_customer_predictions_renewal_date
  ON public.customer_predictions(predicted_renewal_date)
  WHERE status = 'active' AND predicted_renewal_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_predictions_status
  ON public.customer_predictions(status);

CREATE INDEX IF NOT EXISTS idx_customer_predictions_prediction_date
  ON public.customer_predictions(prediction_date DESC);

CREATE INDEX IF NOT EXISTS idx_prediction_accuracy_tracking_prediction
  ON public.prediction_accuracy_tracking(prediction_id);

CREATE INDEX IF NOT EXISTS idx_prediction_accuracy_tracking_type
  ON public.prediction_accuracy_tracking(prediction_type, was_accurate);

CREATE INDEX IF NOT EXISTS idx_retention_interventions_account
  ON public.retention_interventions(account_id);

CREATE INDEX IF NOT EXISTS idx_retention_interventions_prediction
  ON public.retention_interventions(prediction_id);

CREATE INDEX IF NOT EXISTS idx_retention_interventions_status
  ON public.retention_interventions(status);

CREATE INDEX IF NOT EXISTS idx_retention_interventions_scheduled
  ON public.retention_interventions(scheduled_date)
  WHERE status IN ('planned', 'scheduled');

-- =============================================================================
-- PART 7: Row Level Security
-- =============================================================================

ALTER TABLE public.customer_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_accuracy_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_interventions ENABLE ROW LEVEL SECURITY;

-- Users can view predictions for their accounts
CREATE POLICY "Users can view predictions for their accounts"
  ON public.customer_predictions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE account_memberships.user_id = auth.uid()
      AND account_memberships.account_id = customer_predictions.account_id
    )
  );

-- Staff can create predictions
CREATE POLICY "Staff can create predictions"
  ON public.customer_predictions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'staff')
    )
  );

-- Staff can update predictions
CREATE POLICY "Staff can update predictions"
  ON public.customer_predictions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'staff')
    )
  );

-- Users can view accuracy tracking
CREATE POLICY "Users can view prediction accuracy"
  ON public.prediction_accuracy_tracking FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'staff')
    )
  );

-- Users can view interventions for their accounts
CREATE POLICY "Users can view retention interventions"
  ON public.retention_interventions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE account_memberships.user_id = auth.uid()
      AND account_memberships.account_id = retention_interventions.account_id
    )
  );

-- Staff can manage interventions
CREATE POLICY "Staff can manage retention interventions"
  ON public.retention_interventions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'staff')
    )
  );

-- =============================================================================
-- PART 8: Functions
-- =============================================================================

-- Function to refresh analytics materialized view
CREATE OR REPLACE FUNCTION public.refresh_predictive_analytics_dashboard()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.predictive_analytics_dashboard;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.refresh_predictive_analytics_dashboard IS 'Refresh predictive analytics dashboard view';

-- Function to expire old predictions
CREATE OR REPLACE FUNCTION public.expire_old_predictions()
RETURNS void AS $$
BEGIN
  UPDATE public.customer_predictions
  SET status = 'expired'
  WHERE status = 'active'
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.expire_old_predictions IS 'Mark expired predictions as expired';

-- Function to calculate intervention ROI
CREATE OR REPLACE FUNCTION public.calculate_intervention_roi(
  p_intervention_id UUID
)
RETURNS NUMERIC AS $$
DECLARE
  v_cost NUMERIC;
  v_revenue NUMERIC;
  v_roi NUMERIC;
BEGIN
  SELECT intervention_cost, retained_revenue
  INTO v_cost, v_revenue
  FROM public.retention_interventions
  WHERE id = p_intervention_id;

  IF v_cost IS NULL OR v_cost = 0 THEN
    RETURN NULL;
  END IF;

  v_roi := ((v_revenue - v_cost) / v_cost) * 100;

  UPDATE public.retention_interventions
  SET roi = v_roi
  WHERE id = p_intervention_id;

  RETURN v_roi;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.calculate_intervention_roi IS 'Calculate and update ROI for retention intervention';

-- =============================================================================
-- PART 9: Triggers
-- =============================================================================

CREATE TRIGGER update_customer_predictions_updated_at
  BEFORE UPDATE ON public.customer_predictions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_prediction_accuracy_tracking_updated_at
  BEFORE UPDATE ON public.prediction_accuracy_tracking
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_retention_interventions_updated_at
  BEFORE UPDATE ON public.retention_interventions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- PART 10: Grant permissions
-- =============================================================================

GRANT SELECT, INSERT, UPDATE ON public.customer_predictions TO authenticated;
GRANT SELECT ON public.prediction_accuracy_tracking TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.retention_interventions TO authenticated;
GRANT SELECT ON public.predictive_analytics_dashboard TO authenticated;
GRANT SELECT ON public.at_risk_customers_current TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_predictive_analytics_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_old_predictions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_intervention_roi(UUID) TO authenticated;

-- =============================================================================
-- Migration Complete
-- =============================================================================

-- Summary:
-- 1. Created customer_predictions table for all prediction types
-- 2. Created prediction_accuracy_tracking for model improvement
-- 3. Created retention_interventions for action tracking
-- 4. Created analytics materialized view for performance metrics
-- 5. Created at_risk_customers_current view for quick access
-- 6. Added comprehensive indexes and RLS policies
-- 7. Created helper functions for refresh, expiration, ROI calculation
-- 8. All changes are additive and backward compatible
