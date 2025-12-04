-- Migration: Add Coverage Gap Analysis System
-- Description: Identify coverage gaps and generate cross-sell recommendations
-- Date: 2024-12-03
-- Author: Claude CEO Co-Pilot

-- =============================================================================
-- PART 1: Create coverage_gap_analysis table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.coverage_gap_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Account reference
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  customer_name TEXT,

  -- Analysis metadata
  analysis_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
  analyzed_by UUID REFERENCES auth.users(id),
  analysis_type TEXT CHECK (analysis_type IN ('automatic', 'manual', 'scheduled')),

  -- Customer profile data
  customer_profile JSONB DEFAULT '{}'::jsonb,
  -- Example: {"industry": "construction", "employees": 50, "revenue": 2000000}

  -- Current coverage
  current_policies JSONB DEFAULT '[]'::jsonb,
  -- Array of policy objects with coverage types

  -- Gap analysis results
  identified_gaps JSONB DEFAULT '[]'::jsonb,
  -- Array of gap objects with severity, type, recommendation

  -- Risk assessment
  risk_score INTEGER CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  risk_factors TEXT[],

  -- Recommendations
  recommended_coverages JSONB DEFAULT '[]'::jsonb,
  -- Array of recommended coverage objects

  estimated_premium_increase NUMERIC(10,2),
  estimated_annual_premium NUMERIC(10,2),

  -- AI-generated insights
  ai_summary TEXT,
  ai_recommendations TEXT,

  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'quoted', 'sold', 'declined', 'expired')),
  review_notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,

  -- Quote tracking
  quote_id UUID REFERENCES public.quotes(id),
  quoted_at TIMESTAMP WITH TIME ZONE,

  -- Outcome tracking
  was_sold BOOLEAN DEFAULT false,
  sale_amount NUMERIC(10,2),
  sold_at TIMESTAMP WITH TIME ZONE,

  -- Expiration
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + INTERVAL '90 days'),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.coverage_gap_analysis IS 'AI-powered coverage gap identification for cross-sell opportunities';
COMMENT ON COLUMN public.coverage_gap_analysis.customer_profile IS 'Customer business profile data used for analysis';
COMMENT ON COLUMN public.coverage_gap_analysis.identified_gaps IS 'Array of identified coverage gaps with severity';
COMMENT ON COLUMN public.coverage_gap_analysis.recommended_coverages IS 'AI-recommended coverages to fill gaps';

-- =============================================================================
-- PART 2: Create coverage_gap_templates table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.coverage_gap_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Template info
  name TEXT NOT NULL,
  description TEXT,
  industry TEXT, -- Target industry for this template

  -- Coverage requirements
  required_coverages TEXT[], -- Coverage types that should exist
  recommended_coverages TEXT[], -- Additional recommended coverages

  -- Risk factors
  risk_indicators JSONB DEFAULT '{}'::jsonb,
  -- Conditions that indicate gaps (e.g., {"employees_gt": 10, "vehicles_gt": 5})

  -- Recommendation template
  recommendation_template TEXT,
  gap_description_template TEXT,

  -- Priority
  priority INTEGER DEFAULT 5,
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

COMMENT ON TABLE public.coverage_gap_templates IS 'Industry-specific templates for coverage gap detection';

-- =============================================================================
-- PART 3: Create coverage_recommendations table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.coverage_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to analysis
  gap_analysis_id UUID REFERENCES public.coverage_gap_analysis(id) ON DELETE CASCADE,

  -- Recommendation details
  coverage_type TEXT NOT NULL,
  coverage_name TEXT NOT NULL,
  gap_severity TEXT CHECK (gap_severity IN ('low', 'medium', 'high', 'critical')),

  -- Rationale
  gap_description TEXT,
  recommendation_reason TEXT,
  risk_if_not_covered TEXT,

  -- Coverage details
  recommended_limits TEXT,
  recommended_deductible TEXT,
  estimated_premium NUMERIC(10,2),

  -- Priority
  priority INTEGER DEFAULT 5,

  -- Acceptance tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'quoted')),
  customer_response TEXT,
  response_date TIMESTAMP WITH TIME ZONE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.coverage_recommendations IS 'Individual coverage recommendations from gap analysis';

-- =============================================================================
-- PART 4: Create materialized view for gap analytics
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.coverage_gap_analytics AS
SELECT
  DATE_TRUNC('month', analysis_date) AS month,
  risk_level,
  status,

  COUNT(*) AS total_analyses,
  COUNT(CASE WHEN status = 'quoted' THEN 1 END) AS quoted_count,
  COUNT(CASE WHEN status = 'sold' THEN 1 END) AS sold_count,
  COUNT(CASE WHEN was_sold THEN 1 END) AS converted_count,

  ROUND(
    (COUNT(CASE WHEN status = 'quoted' THEN 1 END)::NUMERIC / NULLIF(COUNT(*), 0)) * 100,
    2
  ) AS quote_rate,

  ROUND(
    (COUNT(CASE WHEN was_sold THEN 1 END)::NUMERIC / NULLIF(COUNT(CASE WHEN status = 'quoted' THEN 1 END), 0)) * 100,
    2
  ) AS conversion_rate,

  AVG(estimated_premium_increase) AS avg_premium_increase,
  SUM(sale_amount) AS total_revenue,

  AVG(risk_score) AS avg_risk_score,

  -- Time to conversion
  AVG(EXTRACT(EPOCH FROM (sold_at - analysis_date))/86400) AS avg_days_to_close

FROM public.coverage_gap_analysis
GROUP BY DATE_TRUNC('month', analysis_date), risk_level, status
ORDER BY month DESC, risk_level;

COMMENT ON MATERIALIZED VIEW public.coverage_gap_analytics IS 'Monthly analytics for coverage gap identification effectiveness';

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_coverage_gap_analytics_unique
  ON public.coverage_gap_analytics(month, COALESCE(risk_level, 'unknown'), status);

-- =============================================================================
-- PART 5: Create indexes for performance
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_coverage_gap_analysis_account
  ON public.coverage_gap_analysis(account_id);

CREATE INDEX IF NOT EXISTS idx_coverage_gap_analysis_status
  ON public.coverage_gap_analysis(status);

CREATE INDEX IF NOT EXISTS idx_coverage_gap_analysis_risk_level
  ON public.coverage_gap_analysis(risk_level);

CREATE INDEX IF NOT EXISTS idx_coverage_gap_analysis_date
  ON public.coverage_gap_analysis(analysis_date DESC);

CREATE INDEX IF NOT EXISTS idx_coverage_gap_analysis_expires
  ON public.coverage_gap_analysis(expires_at)
  WHERE status IN ('pending', 'reviewed');

CREATE INDEX IF NOT EXISTS idx_coverage_recommendations_gap_analysis
  ON public.coverage_recommendations(gap_analysis_id);

CREATE INDEX IF NOT EXISTS idx_coverage_recommendations_status
  ON public.coverage_recommendations(status);

CREATE INDEX IF NOT EXISTS idx_coverage_gap_templates_industry
  ON public.coverage_gap_templates(industry)
  WHERE is_active = true;

-- =============================================================================
-- PART 6: Row Level Security
-- =============================================================================

ALTER TABLE public.coverage_gap_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coverage_gap_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coverage_recommendations ENABLE ROW LEVEL SECURITY;

-- Users can view analyses for their accounts
CREATE POLICY "Users can view coverage gap analyses for their accounts"
  ON public.coverage_gap_analysis FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE account_memberships.user_id = auth.uid()
      AND account_memberships.account_id = coverage_gap_analysis.account_id
    )
  );

-- Users can create analyses
CREATE POLICY "Users can create coverage gap analyses"
  ON public.coverage_gap_analysis FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE account_memberships.user_id = auth.uid()
      AND account_memberships.account_id = coverage_gap_analysis.account_id
    )
  );

-- Users can update analyses they created or for their accounts
CREATE POLICY "Users can update their coverage gap analyses"
  ON public.coverage_gap_analysis FOR UPDATE
  USING (
    analyzed_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE account_memberships.user_id = auth.uid()
      AND account_memberships.account_id = coverage_gap_analysis.account_id
      AND role IN ('owner', 'staff')
    )
  );

-- Staff can view all templates
CREATE POLICY "Users can view coverage gap templates"
  ON public.coverage_gap_templates FOR SELECT
  USING (is_active = true);

-- Staff can manage templates
CREATE POLICY "Staff can manage coverage gap templates"
  ON public.coverage_gap_templates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'staff')
    )
  );

-- Users can view recommendations for their analyses
CREATE POLICY "Users can view coverage recommendations"
  ON public.coverage_recommendations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.coverage_gap_analysis
      WHERE coverage_gap_analysis.id = coverage_recommendations.gap_analysis_id
      AND EXISTS (
        SELECT 1 FROM public.account_memberships
        WHERE account_memberships.user_id = auth.uid()
        AND account_memberships.account_id = coverage_gap_analysis.account_id
      )
    )
  );

-- =============================================================================
-- PART 7: Functions
-- =============================================================================

-- Function to refresh gap analytics
CREATE OR REPLACE FUNCTION public.refresh_coverage_gap_analytics()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.coverage_gap_analytics;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark analysis as expired
CREATE OR REPLACE FUNCTION public.expire_old_coverage_analyses()
RETURNS void AS $$
BEGIN
  UPDATE public.coverage_gap_analysis
  SET status = 'expired'
  WHERE status IN ('pending', 'reviewed')
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- PART 8: Triggers
-- =============================================================================

CREATE TRIGGER update_coverage_gap_analysis_updated_at
  BEFORE UPDATE ON public.coverage_gap_analysis
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_coverage_gap_templates_updated_at
  BEFORE UPDATE ON public.coverage_gap_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_coverage_recommendations_updated_at
  BEFORE UPDATE ON public.coverage_recommendations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- PART 9: Insert default templates
-- =============================================================================

-- Construction industry template
INSERT INTO public.coverage_gap_templates (
  name,
  description,
  industry,
  required_coverages,
  recommended_coverages,
  risk_indicators,
  recommendation_template,
  priority,
  is_active
) VALUES (
  'Construction Industry Standard',
  'Standard coverage requirements for construction businesses',
  'construction',
  ARRAY['general_liability', 'workers_comp', 'commercial_auto'],
  ARRAY['builders_risk', 'equipment', 'umbrella', 'pollution_liability'],
  '{"employees_gt": 5, "vehicles_gt": 2, "annual_revenue_gt": 500000}'::jsonb,
  'Construction businesses with {employees} employees typically require additional coverage for equipment and umbrella protection.',
  10,
  true
);

-- Professional services template
INSERT INTO public.coverage_gap_templates (
  name,
  description,
  industry,
  required_coverages,
  recommended_coverages,
  risk_indicators,
  recommendation_template,
  priority,
  is_active
) VALUES (
  'Professional Services Standard',
  'Standard coverage for professional service businesses',
  'professional_services',
  ARRAY['professional_liability', 'general_liability'],
  ARRAY['cyber_liability', 'employment_practices', 'umbrella'],
  '{"employees_gt": 3, "handles_client_data": true}'::jsonb,
  'Professional service firms handling client data should consider cyber liability and employment practices coverage.',
  10,
  true
);

-- =============================================================================
-- PART 10: Grant permissions
-- =============================================================================

GRANT SELECT, INSERT, UPDATE ON public.coverage_gap_analysis TO authenticated;
GRANT SELECT ON public.coverage_gap_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.coverage_recommendations TO authenticated;
GRANT SELECT ON public.coverage_gap_analytics TO authenticated;

-- =============================================================================
-- Migration Complete
-- =============================================================================

-- Summary:
-- 1. Created coverage_gap_analysis table for analysis results
-- 2. Created coverage_gap_templates for industry-specific rules
-- 3. Created coverage_recommendations for individual suggestions
-- 4. Created analytics materialized view
-- 5. Added comprehensive indexes and RLS policies
-- 6. Created helper functions
-- 7. Inserted default industry templates
-- 8. All changes are additive and backward compatible
