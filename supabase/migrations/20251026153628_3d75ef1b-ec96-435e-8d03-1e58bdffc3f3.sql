-- Add risk scoring fields to renewals table
ALTER TABLE public.renewals 
ADD COLUMN IF NOT EXISTS risk_score DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
ADD COLUMN IF NOT EXISTS risk_factors JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS last_risk_calculation TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS days_since_last_contact INTEGER,
ADD COLUMN IF NOT EXISTS contact_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS has_recent_claims BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS has_payment_issues BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS competitor_activity_detected BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS customer_satisfaction_score DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS engagement_score DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS sentiment_score DECIMAL(3,2);

-- Create renewal_risk_history table for tracking risk score changes over time
CREATE TABLE IF NOT EXISTS public.renewal_risk_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  renewal_id UUID NOT NULL REFERENCES public.renewals(id) ON DELETE CASCADE,
  risk_score DECIMAL(5,2) NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  risk_factors JSONB DEFAULT '[]'::jsonb,
  calculated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  calculation_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for efficient history queries
CREATE INDEX IF NOT EXISTS idx_renewal_risk_history_renewal_id ON public.renewal_risk_history(renewal_id);
CREATE INDEX IF NOT EXISTS idx_renewal_risk_history_calculated_at ON public.renewal_risk_history(calculated_at DESC);

-- Enable RLS on renewal_risk_history
ALTER TABLE public.renewal_risk_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view risk history for their account renewals" ON public.renewal_risk_history;
DROP POLICY IF EXISTS "Staff can manage all renewal risk history" ON public.renewal_risk_history;

-- Create RLS policies for renewal_risk_history
CREATE POLICY "Users can view risk history for their account renewals"
ON public.renewal_risk_history
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.renewals r
    JOIN public.account_memberships am ON am.account_id = r.account_id
    WHERE r.id = renewal_risk_history.renewal_id
    AND am.user_id = auth.uid()
  )
);

CREATE POLICY "Staff can manage all renewal risk history"
ON public.renewal_risk_history
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND (is_staff = true OR role IN ('admin', 'staff', 'agent'))
  )
);