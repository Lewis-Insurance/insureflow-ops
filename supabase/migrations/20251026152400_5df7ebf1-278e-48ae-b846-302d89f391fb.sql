-- Create renewals table for policy renewal tracking and risk management
CREATE TABLE IF NOT EXISTS public.renewals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  policy_id UUID REFERENCES public.policies(id) ON DELETE SET NULL,
  policy_number TEXT,
  policy_type TEXT NOT NULL,
  carrier TEXT,
  
  -- Renewal dates and financials
  renewal_date DATE NOT NULL,
  current_premium NUMERIC(12, 2),
  renewal_premium NUMERIC(12, 2),
  price_change_pct NUMERIC(5, 2),
  
  -- Status and assignment
  status TEXT NOT NULL DEFAULT 'upcoming',
  priority TEXT,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes TEXT,
  
  -- Risk scoring fields
  risk_score INTEGER CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  risk_factors JSONB DEFAULT '[]',
  last_risk_calculation TIMESTAMP WITH TIME ZONE,
  
  -- Risk indicators
  days_since_last_contact INTEGER,
  contact_count INTEGER DEFAULT 0,
  last_contact_date TIMESTAMP WITH TIME ZONE,
  has_recent_claims BOOLEAN DEFAULT false,
  has_payment_issues BOOLEAN DEFAULT false,
  competitor_activity_detected BOOLEAN DEFAULT false,
  customer_satisfaction_score INTEGER CHECK (customer_satisfaction_score >= 0 AND customer_satisfaction_score <= 100),
  engagement_score INTEGER CHECK (engagement_score >= 0 AND engagement_score <= 100),
  sentiment_score INTEGER CHECK (sentiment_score >= 0 AND sentiment_score <= 100),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Create renewal_risk_history table to track risk score changes over time
CREATE TABLE IF NOT EXISTS public.renewal_risk_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  renewal_id UUID NOT NULL REFERENCES public.renewals(id) ON DELETE CASCADE,
  risk_score INTEGER NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  risk_factors JSONB NOT NULL DEFAULT '[]',
  calculated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  calculated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  calculation_method TEXT DEFAULT 'automated'
);

-- Create renewal_campaigns table (if not exists)
CREATE TABLE IF NOT EXISTS public.renewal_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  renewal_id UUID NOT NULL REFERENCES public.renewals(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  campaign_type TEXT NOT NULL CHECK (campaign_type IN ('standard', 'high_risk', 'loyalty', 'win_back')),
  days_before_renewal INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  
  -- Campaign touchpoints and progress
  touchpoints JSONB NOT NULL DEFAULT '[]',
  total_touchpoints INTEGER NOT NULL DEFAULT 0,
  completed_touchpoints INTEGER NOT NULL DEFAULT 0,
  
  -- Personalization data
  personalization JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_renewals_account_id ON public.renewals(account_id);
CREATE INDEX IF NOT EXISTS idx_renewals_policy_id ON public.renewals(policy_id);
CREATE INDEX IF NOT EXISTS idx_renewals_renewal_date ON public.renewals(renewal_date);
CREATE INDEX IF NOT EXISTS idx_renewals_status ON public.renewals(status);
CREATE INDEX IF NOT EXISTS idx_renewals_risk_level ON public.renewals(risk_level);
CREATE INDEX IF NOT EXISTS idx_renewals_assigned_to ON public.renewals(assigned_to);
CREATE INDEX IF NOT EXISTS idx_renewals_risk_score ON public.renewals(risk_score) WHERE risk_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_renewal_risk_history_renewal_id ON public.renewal_risk_history(renewal_id);
CREATE INDEX IF NOT EXISTS idx_renewal_risk_history_calculated_at ON public.renewal_risk_history(calculated_at);

CREATE INDEX IF NOT EXISTS idx_renewal_campaigns_renewal_id ON public.renewal_campaigns(renewal_id);
CREATE INDEX IF NOT EXISTS idx_renewal_campaigns_account_id ON public.renewal_campaigns(account_id);
CREATE INDEX IF NOT EXISTS idx_renewal_campaigns_status ON public.renewal_campaigns(status);

-- Enable Row Level Security
ALTER TABLE public.renewals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renewal_risk_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renewal_campaigns ENABLE ROW LEVEL SECURITY;

-- RLS Policies for renewals table
CREATE POLICY "Users can view renewals for their accounts"
  ON public.renewals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships m
      WHERE m.account_id = renewals.account_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can insert renewals"
  ON public.renewals
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_memberships m
      WHERE m.account_id = renewals.account_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'staff')
    )
  );

CREATE POLICY "Staff can update renewals"
  ON public.renewals
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships m
      WHERE m.account_id = renewals.account_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_memberships m
      WHERE m.account_id = renewals.account_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'staff')
    )
  );

CREATE POLICY "Staff can delete renewals"
  ON public.renewals
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships m
      WHERE m.account_id = renewals.account_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'staff')
    )
  );

-- RLS Policies for renewal_risk_history table
CREATE POLICY "Users can view risk history for their accounts"
  ON public.renewal_risk_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.renewals r
      JOIN public.account_memberships m ON m.account_id = r.account_id
      WHERE r.id = renewal_risk_history.renewal_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert risk history"
  ON public.renewal_risk_history
  FOR INSERT
  WITH CHECK (true);

-- RLS Policies for renewal_campaigns table
CREATE POLICY "Users can view campaigns for their accounts"
  ON public.renewal_campaigns
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships m
      WHERE m.account_id = renewal_campaigns.account_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can manage campaigns"
  ON public.renewal_campaigns
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships m
      WHERE m.account_id = renewal_campaigns.account_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_memberships m
      WHERE m.account_id = renewal_campaigns.account_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'staff')
    )
  );

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_renewals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER renewals_updated_at
  BEFORE UPDATE ON public.renewals
  FOR EACH ROW
  EXECUTE FUNCTION update_renewals_updated_at();

CREATE TRIGGER renewal_campaigns_updated_at
  BEFORE UPDATE ON public.renewal_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_renewals_updated_at();

-- Add helpful comments
COMMENT ON TABLE public.renewals IS 'Policy renewal tracking with AI-powered risk scoring';
COMMENT ON TABLE public.renewal_risk_history IS 'Historical risk score calculations for renewals';
COMMENT ON TABLE public.renewal_campaigns IS 'Automated renewal campaigns with multi-channel touchpoints';

COMMENT ON COLUMN public.renewals.risk_score IS 'Risk score from 0-100, calculated by AI based on multiple factors';
COMMENT ON COLUMN public.renewals.risk_factors IS 'JSONB array of risk factors contributing to the score';
COMMENT ON COLUMN public.renewals.engagement_score IS 'Customer engagement score (0-100) based on interactions';
COMMENT ON COLUMN public.renewals.sentiment_score IS 'Customer sentiment score (0-100) from communications analysis';