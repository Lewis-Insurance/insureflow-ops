-- ============================================================================
-- LEVITATE RELATIONSHIP MARKETING ENGINE - PHASE 3: SURVEYS & REVIEWS
-- ============================================================================
-- This migration creates the survey/NPS system and review request tracking.
-- ============================================================================

-- ============================================================================
-- 1. SURVEYS - Survey definitions
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.marketing_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,

  -- Identification
  name TEXT NOT NULL,
  description TEXT,

  -- Survey type
  survey_type TEXT NOT NULL CHECK (survey_type IN (
    'nps',            -- Net Promoter Score (0-10)
    'csat',           -- Customer Satisfaction (1-5)
    'ces',            -- Customer Effort Score
    'custom',         -- Custom questions
    'post_claim',     -- Post-claim survey
    'post_renewal',   -- Post-renewal survey
    'onboarding'      -- New customer survey
  )),

  -- Questions (for custom surveys)
  questions JSONB DEFAULT '[]',
  /*
    [
      {
        id: 'q1',
        type: 'scale', // scale, multiple_choice, text, yes_no
        question: 'How likely are you to recommend us?',
        scale_min: 0,
        scale_max: 10,
        required: true
      }
    ]
  */

  -- NPS/CSAT specific
  primary_question TEXT DEFAULT 'How likely are you to recommend us to a friend or colleague?',
  followup_question TEXT DEFAULT 'What is the primary reason for your score?',

  -- Expiry
  expires_days INTEGER DEFAULT 30,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_surveys_org ON public.marketing_surveys(org_id);
CREATE INDEX idx_surveys_type ON public.marketing_surveys(org_id, survey_type) WHERE is_active = TRUE;

-- RLS
ALTER TABLE public.marketing_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.marketing_surveys
FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- ============================================================================
-- 2. SURVEY SENDS - Track sent surveys
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.marketing_survey_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  survey_id UUID NOT NULL REFERENCES public.marketing_surveys(id) ON DELETE CASCADE,

  -- Recipient
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  policy_id UUID REFERENCES public.policies(id) ON DELETE SET NULL,

  -- Unique token for response tracking
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'base64'),

  -- Status
  status TEXT DEFAULT 'sent' CHECK (status IN (
    'sent', 'delivered', 'opened', 'started', 'completed', 'expired'
  )),

  -- Timing
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,

  -- Source
  source_type TEXT DEFAULT 'manual' CHECK (source_type IN ('manual', 'automation', 'api')),
  automation_enrollment_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_survey_sends_contact ON public.marketing_survey_sends(contact_id);
CREATE INDEX idx_survey_sends_token ON public.marketing_survey_sends(token);
CREATE INDEX idx_survey_sends_survey ON public.marketing_survey_sends(survey_id, status);

-- RLS
ALTER TABLE public.marketing_survey_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.marketing_survey_sends
FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- ============================================================================
-- 3. SURVEY RESPONSES (IMMUTABLE) - Actual responses
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.marketing_survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  survey_id UUID NOT NULL REFERENCES public.marketing_surveys(id) ON DELETE CASCADE,
  survey_send_id UUID NOT NULL REFERENCES public.marketing_survey_sends(id) ON DELETE CASCADE,

  -- Respondent (captured at response time)
  contact_id UUID, -- May be NULL if contact deleted
  account_id UUID,

  -- NPS/CSAT score
  score INTEGER,

  -- NPS categorization
  nps_category TEXT CHECK (nps_category IN ('promoter', 'passive', 'detractor')),

  -- Full responses
  responses JSONB DEFAULT '{}',
  /*
    {
      q1: 8,
      q2: 'Great service, would recommend!',
      q3: ['agent_friendly', 'quick_response']
    }
  */

  -- Open-ended feedback
  feedback_text TEXT,

  -- Metadata
  ip_address INET,
  user_agent TEXT,

  responded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_survey_responses_org ON public.marketing_survey_responses(org_id);
CREATE INDEX idx_survey_responses_contact ON public.marketing_survey_responses(contact_id);
CREATE INDEX idx_survey_responses_score ON public.marketing_survey_responses(org_id, score);
CREATE INDEX idx_survey_responses_nps ON public.marketing_survey_responses(org_id, nps_category);

-- RLS
ALTER TABLE public.marketing_survey_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.marketing_survey_responses
FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- PREVENT UPDATES AND DELETES (immutable)
REVOKE UPDATE, DELETE ON public.marketing_survey_responses FROM PUBLIC;
REVOKE UPDATE, DELETE ON public.marketing_survey_responses FROM authenticated;

-- ============================================================================
-- 4. SURVEY FATIGUE TRACKING - Prevent over-surveying
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.marketing_survey_fatigue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,

  -- Tracking
  last_survey_sent_at TIMESTAMPTZ,
  last_survey_responded_at TIMESTAMPTZ,
  total_surveys_sent INTEGER DEFAULT 0,
  total_surveys_responded INTEGER DEFAULT 0,

  -- Rate limiting
  surveys_this_year INTEGER DEFAULT 0,
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),

  -- Cooldown override
  next_survey_allowed_at TIMESTAMPTZ,

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(org_id, contact_id, year)
);

CREATE INDEX idx_survey_fatigue_contact ON public.marketing_survey_fatigue(contact_id);

-- RLS
ALTER TABLE public.marketing_survey_fatigue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.marketing_survey_fatigue
FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- ============================================================================
-- 5. REVIEW PLATFORMS - Configured review sites
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.marketing_review_platforms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,

  -- Platform info
  platform_name TEXT NOT NULL CHECK (platform_name IN (
    'google', 'facebook', 'yelp', 'bbb', 'trustpilot', 'other'
  )),
  display_name TEXT,

  -- Review URL
  review_url TEXT NOT NULL,

  -- Priority for routing
  priority INTEGER DEFAULT 1,

  -- Logo/branding
  icon_url TEXT,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(org_id, platform_name)
);

CREATE INDEX idx_review_platforms_org ON public.marketing_review_platforms(org_id) WHERE is_active = TRUE;

-- RLS
ALTER TABLE public.marketing_review_platforms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.marketing_review_platforms
FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- ============================================================================
-- 6. REVIEW REQUESTS - Track review request sends
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.marketing_review_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,

  -- Recipient
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,

  -- Platform
  platform_id UUID REFERENCES public.marketing_review_platforms(id) ON DELETE SET NULL,

  -- Status
  status TEXT DEFAULT 'sent' CHECK (status IN (
    'sent', 'delivered', 'clicked', 'reviewed', 'declined', 'expired'
  )),

  -- Tracking
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'base64'),
  review_url TEXT,

  -- Timing
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  clicked_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,

  -- Source
  source_type TEXT DEFAULT 'manual' CHECK (source_type IN ('manual', 'automation', 'nps_followup')),
  nps_response_id UUID REFERENCES public.marketing_survey_responses(id) ON DELETE SET NULL,
  automation_enrollment_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_review_requests_contact ON public.marketing_review_requests(contact_id);
CREATE INDEX idx_review_requests_status ON public.marketing_review_requests(org_id, status);
CREATE INDEX idx_review_requests_token ON public.marketing_review_requests(token);

-- RLS
ALTER TABLE public.marketing_review_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.marketing_review_requests
FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- ============================================================================
-- 7. CLIENT HAPPINESS SCORES - Composite engagement metric
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.client_happiness_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,

  -- Composite score (0-100)
  happiness_score INTEGER CHECK (happiness_score BETWEEN 0 AND 100),

  -- Tier
  happiness_tier TEXT CHECK (happiness_tier IN ('promoter', 'satisfied', 'at_risk', 'detractor')),

  -- Component scores (0-100 each)
  component_nps INTEGER,
  component_engagement INTEGER, -- Email opens, clicks
  component_tenure INTEGER, -- Years as customer
  component_policies INTEGER, -- Number of policies
  component_claims INTEGER, -- Claims experience (inverse)
  component_referrals INTEGER,

  -- Last scores
  last_nps_score INTEGER,
  last_nps_at TIMESTAMPTZ,
  last_survey_response_at TIMESTAMPTZ,
  last_review_at TIMESTAMPTZ,

  -- Trend
  score_30_days_ago INTEGER,
  score_90_days_ago INTEGER,
  trend TEXT CHECK (trend IN ('improving', 'stable', 'declining')),

  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(org_id, account_id)
);

CREATE INDEX idx_happiness_scores_org ON public.client_happiness_scores(org_id, happiness_tier);
CREATE INDEX idx_happiness_scores_account ON public.client_happiness_scores(account_id);
CREATE INDEX idx_happiness_scores_at_risk ON public.client_happiness_scores(org_id, happiness_score)
  WHERE happiness_tier IN ('at_risk', 'detractor');

-- RLS
ALTER TABLE public.client_happiness_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.client_happiness_scores
FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- ============================================================================
-- 8. FUNCTION: Calculate NPS category
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_nps_category(p_score INTEGER)
RETURNS TEXT AS $$
BEGIN
  IF p_score >= 9 THEN
    RETURN 'promoter';
  ELSIF p_score >= 7 THEN
    RETURN 'passive';
  ELSE
    RETURN 'detractor';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- 9. FUNCTION: Record survey response
-- ============================================================================
CREATE OR REPLACE FUNCTION record_survey_response(
  p_survey_send_id UUID,
  p_score INTEGER DEFAULT NULL,
  p_responses JSONB DEFAULT '{}',
  p_feedback_text TEXT DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_send public.marketing_survey_sends;
  v_survey public.marketing_surveys;
  v_response_id UUID;
  v_nps_category TEXT;
BEGIN
  -- Get the send record
  SELECT * INTO v_send FROM public.marketing_survey_sends WHERE id = p_survey_send_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Survey send not found';
  END IF;

  -- Get survey
  SELECT * INTO v_survey FROM public.marketing_surveys WHERE id = v_send.survey_id;

  -- Calculate NPS category if applicable
  IF v_survey.survey_type = 'nps' AND p_score IS NOT NULL THEN
    v_nps_category := calculate_nps_category(p_score);
  END IF;

  -- Insert response
  INSERT INTO public.marketing_survey_responses (
    org_id,
    survey_id,
    survey_send_id,
    contact_id,
    account_id,
    score,
    nps_category,
    responses,
    feedback_text,
    ip_address,
    user_agent
  ) VALUES (
    v_send.org_id,
    v_send.survey_id,
    p_survey_send_id,
    v_send.contact_id,
    v_send.account_id,
    p_score,
    v_nps_category,
    p_responses,
    p_feedback_text,
    p_ip_address,
    p_user_agent
  ) RETURNING id INTO v_response_id;

  -- Update send status
  UPDATE public.marketing_survey_sends
  SET status = 'completed',
      completed_at = NOW()
  WHERE id = p_survey_send_id;

  -- Update fatigue tracking
  INSERT INTO public.marketing_survey_fatigue (org_id, contact_id, last_survey_responded_at, total_surveys_responded)
  VALUES (v_send.org_id, v_send.contact_id, NOW(), 1)
  ON CONFLICT (org_id, contact_id, year)
  DO UPDATE SET
    last_survey_responded_at = NOW(),
    total_surveys_responded = public.marketing_survey_fatigue.total_surveys_responded + 1,
    updated_at = NOW();

  RETURN v_response_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 10. FUNCTION: Check if can send survey
-- ============================================================================
CREATE OR REPLACE FUNCTION can_send_survey(
  p_org_id UUID,
  p_contact_id UUID,
  p_min_days_between INTEGER DEFAULT 90,
  p_max_per_year INTEGER DEFAULT 4
) RETURNS JSONB AS $$
DECLARE
  v_fatigue public.marketing_survey_fatigue;
  v_allowed BOOLEAN := TRUE;
  v_reason TEXT;
BEGIN
  -- Get fatigue record
  SELECT * INTO v_fatigue
  FROM public.marketing_survey_fatigue
  WHERE org_id = p_org_id
    AND contact_id = p_contact_id
    AND year = EXTRACT(YEAR FROM NOW());

  IF v_fatigue IS NULL THEN
    RETURN jsonb_build_object('allowed', TRUE);
  END IF;

  -- Check max per year
  IF v_fatigue.surveys_this_year >= p_max_per_year THEN
    v_allowed := FALSE;
    v_reason := 'max_surveys_reached';
  END IF;

  -- Check cooldown
  IF v_fatigue.last_survey_sent_at IS NOT NULL AND
     v_fatigue.last_survey_sent_at > NOW() - (p_min_days_between || ' days')::INTERVAL THEN
    v_allowed := FALSE;
    v_reason := 'cooldown_period';
  END IF;

  -- Check explicit override
  IF v_fatigue.next_survey_allowed_at IS NOT NULL AND
     v_fatigue.next_survey_allowed_at > NOW() THEN
    v_allowed := FALSE;
    v_reason := 'explicit_cooldown';
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'reason', v_reason,
    'surveys_this_year', v_fatigue.surveys_this_year,
    'last_sent', v_fatigue.last_survey_sent_at,
    'next_allowed', GREATEST(
      v_fatigue.last_survey_sent_at + (p_min_days_between || ' days')::INTERVAL,
      v_fatigue.next_survey_allowed_at
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE public.marketing_surveys IS 'Levitate: Survey definitions (NPS, CSAT, custom)';
COMMENT ON TABLE public.marketing_survey_sends IS 'Levitate: Track sent surveys';
COMMENT ON TABLE public.marketing_survey_responses IS 'Levitate: IMMUTABLE survey responses';
COMMENT ON TABLE public.marketing_survey_fatigue IS 'Levitate: Prevent over-surveying contacts';
COMMENT ON TABLE public.marketing_review_platforms IS 'Levitate: Configured review sites (Google, Facebook, etc.)';
COMMENT ON TABLE public.marketing_review_requests IS 'Levitate: Track review request sends';
COMMENT ON TABLE public.client_happiness_scores IS 'Levitate: Composite client happiness/engagement scores';
