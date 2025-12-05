-- Migration: AI Email Composer System
-- Description: Email templates, communication tracking, and AI-powered composition
-- Date: 2024-12-04
-- Author: Claude CEO Co-Pilot

-- =============================================================================
-- PART 1: Email Templates Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Template metadata
  template_name TEXT NOT NULL UNIQUE,
  template_category TEXT NOT NULL CHECK (template_category IN (
    'lead_nurture', 'renewal_reminder', 'quote_follow_up', 'claim_update',
    'policy_change', 'retention', 'onboarding', 'general'
  )),
  template_description TEXT,

  -- Template content
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,

  -- Template variables
  -- Example: ["customer_name", "policy_number", "renewal_date"]
  available_variables TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- AI generation hints
  tone TEXT CHECK (tone IN ('professional', 'friendly', 'urgent', 'empathetic')),
  target_audience TEXT CHECK (target_audience IN ('new_lead', 'existing_customer', 'at_risk', 'vip')),

  -- Usage tracking
  usage_count INTEGER DEFAULT 0,
  avg_response_rate NUMERIC(5,2), -- Percentage
  last_used_at TIMESTAMP WITH TIME ZONE,

  -- Settings
  is_active BOOLEAN DEFAULT true,
  requires_compliance_check BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.email_templates IS 'AI-powered email templates with usage tracking';
COMMENT ON COLUMN public.email_templates.available_variables IS 'Template variables like {customer_name}, {policy_number}';
COMMENT ON COLUMN public.email_templates.avg_response_rate IS 'Average response rate percentage for this template';

-- =============================================================================
-- PART 2: Communication History Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.communication_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationships
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,

  -- Communication details
  communication_type TEXT NOT NULL CHECK (communication_type IN (
    'email', 'sms', 'portal_message', 'phone', 'in_person'
  )),

  -- Content
  subject TEXT,
  message_body TEXT NOT NULL,

  -- AI metadata
  ai_generated BOOLEAN DEFAULT false,
  ai_confidence_score NUMERIC(5,2), -- 0-100
  template_used TEXT, -- Template name if used
  tone_used TEXT,

  -- Delivery tracking
  status TEXT CHECK (status IN (
    'draft', 'scheduled', 'sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'failed'
  )) DEFAULT 'draft',
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  opened_at TIMESTAMP WITH TIME ZONE,
  replied_at TIMESTAMP WITH TIME ZONE,

  -- Engagement metrics
  open_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,

  -- Compliance
  compliance_checked BOOLEAN DEFAULT false,
  compliance_passed BOOLEAN,
  compliance_notes TEXT,

  -- Context
  context_data JSONB DEFAULT '{}'::jsonb,
  -- Example: {"churn_probability": 75, "days_until_renewal": 30, "related_quote_id": "..."}

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE public.communication_history IS 'Track all communications with customers';
COMMENT ON COLUMN public.communication_history.context_data IS 'Context used for AI generation (churn risk, renewal dates, etc.)';
COMMENT ON COLUMN public.communication_history.ai_confidence_score IS 'AI confidence in generated content quality';

-- =============================================================================
-- PART 3: Create Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_email_templates_category
  ON public.email_templates(template_category)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_email_templates_usage
  ON public.email_templates(usage_count DESC, avg_response_rate DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_communication_history_account
  ON public.communication_history(account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_communication_history_user
  ON public.communication_history(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_communication_history_status
  ON public.communication_history(status, sent_at DESC)
  WHERE status IN ('sent', 'delivered', 'opened');

CREATE INDEX IF NOT EXISTS idx_communication_history_ai_generated
  ON public.communication_history(ai_generated, created_at DESC)
  WHERE ai_generated = true;

CREATE INDEX IF NOT EXISTS idx_communication_history_template
  ON public.communication_history(template_id)
  WHERE template_id IS NOT NULL;

-- =============================================================================
-- PART 4: Create Views
-- =============================================================================

-- View for high-performing templates
CREATE OR REPLACE VIEW public.top_email_templates AS
SELECT
  id,
  template_name,
  template_category,
  usage_count,
  avg_response_rate,
  last_used_at,
  tone,
  target_audience
FROM public.email_templates
WHERE is_active = true AND usage_count > 0
ORDER BY avg_response_rate DESC NULLS LAST, usage_count DESC
LIMIT 20;

COMMENT ON VIEW public.top_email_templates IS 'Top performing email templates by response rate';

-- View for communication engagement metrics
CREATE OR REPLACE VIEW public.communication_engagement_stats AS
SELECT
  account_id,
  communication_type,
  COUNT(*) AS total_communications,
  COUNT(*) FILTER (WHERE status IN ('delivered', 'opened', 'replied')) AS successful_deliveries,
  COUNT(*) FILTER (WHERE opened_at IS NOT NULL) AS opened_count,
  COUNT(*) FILTER (WHERE replied_at IS NOT NULL) AS replied_count,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE opened_at IS NOT NULL) / NULLIF(COUNT(*) FILTER (WHERE status = 'delivered'), 0),
    2
  ) AS open_rate,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE replied_at IS NOT NULL) / NULLIF(COUNT(*) FILTER (WHERE status = 'delivered'), 0),
    2
  ) AS reply_rate,
  MAX(created_at) AS last_contact_at
FROM public.communication_history
WHERE status != 'draft'
GROUP BY account_id, communication_type;

COMMENT ON VIEW public.communication_engagement_stats IS 'Engagement metrics per account and communication type';

-- =============================================================================
-- PART 5: Helper Functions
-- =============================================================================

-- Function to update template usage stats
CREATE OR REPLACE FUNCTION public.update_template_usage_stats(p_template_id UUID)
RETURNS VOID AS $$
DECLARE
  v_usage_count INTEGER;
  v_avg_response_rate NUMERIC(5,2);
BEGIN
  -- Count total uses
  SELECT COUNT(*)
  INTO v_usage_count
  FROM public.communication_history
  WHERE template_id = p_template_id AND status IN ('sent', 'delivered');

  -- Calculate average response rate
  SELECT ROUND(
    100.0 * COUNT(*) FILTER (WHERE replied_at IS NOT NULL) / NULLIF(COUNT(*), 0),
    2
  )
  INTO v_avg_response_rate
  FROM public.communication_history
  WHERE template_id = p_template_id AND status IN ('sent', 'delivered');

  -- Update template stats
  UPDATE public.email_templates
  SET
    usage_count = v_usage_count,
    avg_response_rate = v_avg_response_rate,
    last_used_at = now(),
    updated_at = now()
  WHERE id = p_template_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.update_template_usage_stats IS 'Update template usage count and response rate';

-- Function to get recommended templates for account
CREATE OR REPLACE FUNCTION public.get_recommended_templates(
  p_account_id UUID,
  p_category TEXT DEFAULT NULL
)
RETURNS TABLE (
  template_id UUID,
  template_name TEXT,
  template_category TEXT,
  subject_template TEXT,
  body_template TEXT,
  tone TEXT,
  avg_response_rate NUMERIC,
  usage_count INTEGER,
  recommendation_score INTEGER
) AS $$
DECLARE
  v_account RECORD;
  v_churn_risk_level TEXT;
  v_days_until_renewal INTEGER;
BEGIN
  -- Get account context
  SELECT * INTO v_account FROM public.accounts WHERE id = p_account_id;

  -- Get churn risk if available
  SELECT churn_risk_level, days_until_renewal
  INTO v_churn_risk_level, v_days_until_renewal
  FROM public.customer_risk_scores
  WHERE account_id = p_account_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- Return templates scored by relevance
  RETURN QUERY
  SELECT
    t.id AS template_id,
    t.template_name,
    t.template_category,
    t.subject_template,
    t.body_template,
    t.tone,
    t.avg_response_rate,
    t.usage_count,
    -- Recommendation score (0-100)
    (
      -- Base score from response rate
      COALESCE(t.avg_response_rate, 0)::INTEGER * 0.4 +
      -- Boost for usage count (normalized to 0-40)
      LEAST(t.usage_count, 100)::INTEGER * 0.4 +
      -- Context relevance boost (0-20)
      CASE
        WHEN v_churn_risk_level IN ('high', 'critical') AND t.template_category = 'retention' THEN 20
        WHEN v_days_until_renewal < 60 AND t.template_category = 'renewal_reminder' THEN 20
        WHEN t.template_category = p_category THEN 15
        ELSE 0
      END
    )::INTEGER AS recommendation_score
  FROM public.email_templates t
  WHERE
    t.is_active = true
    AND (p_category IS NULL OR t.template_category = p_category)
  ORDER BY recommendation_score DESC, t.avg_response_rate DESC NULLS LAST
  LIMIT 10;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_recommended_templates IS 'Get AI-recommended templates based on account context';

-- =============================================================================
-- PART 6: Insert Default Email Templates
-- =============================================================================

INSERT INTO public.email_templates (
  template_name,
  template_category,
  template_description,
  subject_template,
  body_template,
  available_variables,
  tone,
  target_audience,
  requires_compliance_check
) VALUES
  -- Lead Nurture
  (
    'New Lead Welcome',
    'lead_nurture',
    'Initial welcome email for new leads',
    'Welcome to {agency_name} - Let''s Protect What Matters',
    'Hi {customer_name},

Thank you for your interest in insurance coverage. I''m {agent_name}, and I''ll be helping you find the right protection for your needs.

I noticed you''re interested in {line_of_business} coverage. I''d love to schedule a brief call to understand your specific situation and provide you with personalized options.

When would be a good time for a 15-minute conversation?

Looking forward to helping you,
{agent_name}
{agency_name}',
    ARRAY['customer_name', 'agent_name', 'agency_name', 'line_of_business'],
    'friendly',
    'new_lead',
    false
  ),

  -- Renewal Reminder
  (
    'Policy Renewal - 60 Days',
    'renewal_reminder',
    'Reminder sent 60 days before policy expiration',
    'Your {line_of_business} Policy Renews in 60 Days - Let''s Review',
    'Hi {customer_name},

Your {line_of_business} policy (#{policy_number}) is coming up for renewal on {renewal_date}.

This is a great time to review your coverage and make sure you''re still getting the best protection at the best price.

I''ve already started working on your renewal quote. Can we schedule 15 minutes this week to discuss:
• Any changes in your situation
• Coverage adjustments you might need
• Potential savings opportunities

Reply to this email or call me at {agent_phone} to set up a time.

Best regards,
{agent_name}',
    ARRAY['customer_name', 'line_of_business', 'policy_number', 'renewal_date', 'agent_name', 'agent_phone'],
    'professional',
    'existing_customer',
    true
  ),

  -- Quote Follow-Up
  (
    'Quote Follow-Up - Day 3',
    'quote_follow_up',
    'Follow up 3 days after sending quote',
    'Following Up on Your {line_of_business} Quote',
    'Hi {customer_name},

I wanted to follow up on the {line_of_business} quote I sent you on {quote_date}.

The quote I provided offers:
• {coverage_highlights}
• Competitive premium of {premium_amount}
• Coverage starting as soon as {effective_date}

Do you have any questions about the coverage or pricing? I''m here to help clarify anything.

If you''re ready to move forward, I can have your policy issued within 24 hours.

Best regards,
{agent_name}',
    ARRAY['customer_name', 'line_of_business', 'quote_date', 'coverage_highlights', 'premium_amount', 'effective_date', 'agent_name'],
    'friendly',
    'new_lead',
    true
  ),

  -- Retention - At-Risk
  (
    'Customer Retention - High Risk',
    'retention',
    'Proactive outreach for at-risk customers',
    'Let''s Ensure You''re Still Getting the Best Value',
    'Hi {customer_name},

I wanted to reach out personally because you''re an important customer to us.

I''ve been reviewing your account and want to make sure we''re still providing you with the best possible coverage and service.

Could we schedule a brief call to:
• Review your current coverage
• Discuss any changes in your needs
• Explore potential savings opportunities

Your satisfaction is my priority, and I want to make sure we''re taking great care of you.

When would be a good time to connect?

Best regards,
{agent_name}',
    ARRAY['customer_name', 'agent_name'],
    'empathetic',
    'at_risk',
    false
  ),

  -- Claim Update
  (
    'Claim Status Update',
    'claim_update',
    'Update customer on claim progress',
    'Update on Your Claim #{claim_number}',
    'Hi {customer_name},

I wanted to give you an update on your {claim_type} claim filed on {claim_date}.

Current Status: {claim_status}

{status_details}

Next Steps:
{next_steps}

If you have any questions or need anything, please don''t hesitate to reach out. I''m here to help guide you through this process.

Best regards,
{agent_name}',
    ARRAY['customer_name', 'claim_number', 'claim_type', 'claim_date', 'claim_status', 'status_details', 'next_steps', 'agent_name'],
    'empathetic',
    'existing_customer',
    false
  ),

  -- General Check-In
  (
    'Annual Review Check-In',
    'general',
    'Annual policy review invitation',
    'Time for Your Annual Insurance Review',
    'Hi {customer_name},

It''s been about a year since we last reviewed your insurance portfolio, and I wanted to reach out to schedule your annual review.

During this review, we''ll:
• Verify your coverage still matches your needs
• Look for potential savings opportunities
• Update any changes in your situation
• Answer any questions you might have

This typically takes 20-30 minutes and can save you hundreds of dollars while ensuring you''re properly protected.

Are you available for a call next week?

Best regards,
{agent_name}',
    ARRAY['customer_name', 'agent_name'],
    'professional',
    'existing_customer',
    false
  );

-- =============================================================================
-- PART 7: Row Level Security
-- =============================================================================

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_history ENABLE ROW LEVEL SECURITY;

-- Email Templates - All authenticated users can view
CREATE POLICY "Authenticated users can view email templates"
  ON public.email_templates FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Email Templates - Staff can manage
CREATE POLICY "Staff can manage email templates"
  ON public.email_templates FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'staff')
    )
  );

-- Communication History - Users can view their own communications
CREATE POLICY "Users can view their own communications"
  ON public.communication_history FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM public.account_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'staff')
    )
  );

-- Communication History - Users can create communications
CREATE POLICY "Users can create communications"
  ON public.communication_history FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Communication History - Users can update their own communications
CREATE POLICY "Users can update their own communications"
  ON public.communication_history FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- =============================================================================
-- PART 8: Add Triggers
-- =============================================================================

CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_communication_history_updated_at
  BEFORE UPDATE ON public.communication_history
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- PART 9: Grant Permissions
-- =============================================================================

GRANT SELECT ON public.email_templates TO authenticated;
GRANT SELECT ON public.communication_history TO authenticated;
GRANT SELECT ON public.top_email_templates TO authenticated;
GRANT SELECT ON public.communication_engagement_stats TO authenticated;

-- =============================================================================
-- Migration Complete
-- =============================================================================

-- Summary:
-- 1. Created email_templates table with usage tracking
-- 2. Created communication_history table with engagement metrics
-- 3. Added indexes for performance
-- 4. Created views for top templates and engagement stats
-- 5. Added helper functions for template recommendations
-- 6. Inserted 6 default email templates
-- 7. Configured Row Level Security
-- 8. All changes backward compatible
