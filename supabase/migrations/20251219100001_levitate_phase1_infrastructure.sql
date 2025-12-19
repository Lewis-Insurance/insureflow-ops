-- ============================================================================
-- LEVITATE RELATIONSHIP MARKETING ENGINE - PHASE 1: INFRASTRUCTURE
-- ============================================================================
-- This migration creates the core infrastructure for the Levitate marketing
-- automation system, including feature flags, send governor, and compliance.
-- ============================================================================

-- ============================================================================
-- 1. FEATURE FLAGS - Gradual rollout control
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.marketing_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,

  flag_name TEXT NOT NULL,

  -- Rollout control
  is_enabled BOOLEAN DEFAULT FALSE,
  rollout_percentage INTEGER DEFAULT 0 CHECK (rollout_percentage BETWEEN 0 AND 100),

  -- Emergency controls
  kill_switch BOOLEAN DEFAULT FALSE,
  kill_switch_reason TEXT,
  kill_switch_at TIMESTAMPTZ,
  kill_switch_by UUID REFERENCES public.profiles(id),

  -- Metadata
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(org_id, flag_name)
);

CREATE INDEX idx_marketing_feature_flags_org ON public.marketing_feature_flags(org_id);
CREATE INDEX idx_marketing_feature_flags_enabled ON public.marketing_feature_flags(org_id, flag_name) WHERE is_enabled = TRUE;

-- RLS Policy
ALTER TABLE public.marketing_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.marketing_feature_flags
FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- ============================================================================
-- 2. EXTERNAL SERVICE HEALTH - Circuit breaker monitoring
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.external_service_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  service_name TEXT UNIQUE NOT NULL,

  -- Current status
  status TEXT DEFAULT 'unknown' CHECK (status IN ('healthy', 'degraded', 'down', 'unknown')),
  last_check_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,

  -- Error tracking
  consecutive_failures INTEGER DEFAULT 0,
  last_error_message TEXT,

  -- Circuit breaker
  circuit_open BOOLEAN DEFAULT FALSE,
  circuit_open_until TIMESTAMPTZ,

  -- Metrics (rolling 1 hour)
  requests_last_hour INTEGER DEFAULT 0,
  errors_last_hour INTEGER DEFAULT 0,
  avg_latency_ms INTEGER,

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial services
INSERT INTO public.external_service_health (service_name) VALUES
  ('twilio_sms'),
  ('twilio_voice'),
  ('email_provider'),
  ('google_business_profile')
ON CONFLICT (service_name) DO NOTHING;

-- ============================================================================
-- 3. SEND GOVERNOR CONFIGURATION
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.marketing_governor_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID UNIQUE NOT NULL,

  -- Per-user limits
  per_user_hourly_limit INTEGER DEFAULT 50,
  per_user_daily_limit INTEGER DEFAULT 500,

  -- Contact frequency caps
  marketing_per_contact_per_day INTEGER DEFAULT 2,
  marketing_per_contact_per_week INTEGER DEFAULT 5,
  marketing_per_household_per_day INTEGER DEFAULT 2,

  -- Business hours (org timezone)
  business_hours_start INTEGER DEFAULT 9, -- 9am
  business_hours_end INTEGER DEFAULT 17, -- 5pm
  business_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5], -- Mon-Fri
  org_timezone TEXT DEFAULT 'America/New_York',

  -- Holiday handling
  holiday_dates DATE[],
  transactional_bypasses_hours BOOLEAN DEFAULT TRUE,

  -- Auto-pause thresholds
  pause_on_bounce_rate DECIMAL DEFAULT 0.05, -- 5%
  pause_on_complaint_rate DECIMAL DEFAULT 0.001, -- 0.1%
  pause_on_error_rate DECIMAL DEFAULT 0.10, -- 10%

  -- Processing
  max_concurrent_sends INTEGER DEFAULT 10,
  jitter_max_seconds INTEGER DEFAULT 30,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.marketing_governor_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.marketing_governor_config
FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- ============================================================================
-- 4. SENDER PAUSE STATE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sender_pause_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,

  -- Scope
  scope_type TEXT NOT NULL CHECK (scope_type IN ('user', 'org')),
  scope_id TEXT NOT NULL, -- user_id or org_id

  -- State
  is_paused BOOLEAN DEFAULT FALSE,
  paused_at TIMESTAMPTZ,
  paused_reason TEXT,
  paused_by_user_id UUID REFERENCES public.profiles(id),

  -- Classification-specific pauses
  marketing_paused BOOLEAN DEFAULT FALSE,
  relationship_paused BOOLEAN DEFAULT FALSE,
  transactional_paused BOOLEAN DEFAULT FALSE,

  -- Resume
  auto_resume_at TIMESTAMPTZ,
  resumed_at TIMESTAMPTZ,
  resumed_by UUID REFERENCES public.profiles(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(org_id, scope_type, scope_id)
);

CREATE INDEX idx_sender_pause_state_paused ON public.sender_pause_state(org_id, scope_type, scope_id)
  WHERE is_paused = TRUE;

-- RLS
ALTER TABLE public.sender_pause_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.sender_pause_state
FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- ============================================================================
-- 5. PROHIBITED PHRASES (Insurance compliance)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.prohibited_phrases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID, -- NULL = global

  phrase TEXT NOT NULL,

  -- Where it applies
  applies_to_channels TEXT[] DEFAULT ARRAY['email', 'sms'],
  applies_to_lines TEXT[], -- NULL = all
  applies_to_states TEXT[], -- NULL = all

  -- Severity
  severity TEXT DEFAULT 'block' CHECK (severity IN ('block', 'warn', 'review')),

  -- Metadata
  reason TEXT,
  regulatory_reference TEXT,

  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_prohibited_phrases_active ON public.prohibited_phrases(org_id) WHERE is_active = TRUE;

-- RLS
ALTER TABLE public.prohibited_phrases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Global and tenant phrases" ON public.prohibited_phrases
FOR SELECT USING (
  org_id IS NULL OR org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "Tenant can manage own phrases" ON public.prohibited_phrases
FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- Seed global prohibited phrases (insurance-specific)
INSERT INTO public.prohibited_phrases (org_id, phrase, severity, reason) VALUES
(NULL, 'guarantee', 'block', 'Cannot guarantee insurance outcomes'),
(NULL, 'guaranteed', 'block', 'Cannot guarantee insurance outcomes'),
(NULL, 'lowest rate', 'block', 'Cannot promise lowest rates'),
(NULL, 'lowest price', 'block', 'Cannot promise lowest prices'),
(NULL, 'best rate', 'block', 'Cannot promise best rates'),
(NULL, 'full coverage', 'block', 'No such thing as full coverage'),
(NULL, 'complete coverage', 'block', 'No such thing as complete coverage'),
(NULL, 'complete protection', 'block', 'Cannot promise complete protection'),
(NULL, 'covers everything', 'block', 'No policy covers everything'),
(NULL, 'cheapest', 'block', 'Cannot promise cheapest'),
(NULL, 'risk free', 'block', 'Insurance always involves risk'),
(NULL, 'no obligation', 'warn', 'May need context'),
(NULL, 'act now', 'warn', 'High pressure language'),
(NULL, 'limited time', 'warn', 'High pressure language')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 6. STATE COMMUNICATION RULES (Compliance)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.state_communication_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  state_code TEXT NOT NULL, -- 'CA', 'TX', etc.

  -- Time restrictions
  earliest_hour INTEGER, -- Earliest send time (in state timezone)
  latest_hour INTEGER, -- Latest send time

  -- Required disclaimers
  required_disclaimers JSONB, -- [{type: 'license', text: 'CA License #...'}]

  -- Prohibited phrases specific to state
  prohibited_phrases TEXT[],

  -- Cooling-off periods
  post_purchase_quiet_days INTEGER, -- Days after policy purchase before marketing
  post_claim_quiet_days INTEGER,
  post_cancellation_quiet_days INTEGER,

  -- Line-specific rules
  applies_to_lines TEXT[], -- NULL = all lines

  -- Metadata
  effective_date DATE,
  source_reference TEXT, -- Regulatory citation
  notes TEXT,

  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_state_rules_state ON public.state_communication_rules(state_code) WHERE is_active = TRUE;

-- Seed common state rules
INSERT INTO public.state_communication_rules (state_code, earliest_hour, latest_hour, notes) VALUES
('CA', 8, 21, 'California - calls 8am-9pm local time'),
('TX', 8, 21, 'Texas - calls 8am-9pm local time'),
('FL', 8, 21, 'Florida - calls 8am-9pm local time'),
('NY', 8, 21, 'New York - calls 8am-9pm local time')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 7. CONTACT FREQUENCY TRACKING
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.contact_send_frequency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,

  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  household_id UUID,

  -- Rolling windows
  date DATE NOT NULL,

  -- Counts by classification
  marketing_count INTEGER DEFAULT 0,
  relationship_count INTEGER DEFAULT 0,
  transactional_count INTEGER DEFAULT 0,

  -- Counts by channel
  email_count INTEGER DEFAULT 0,
  sms_count INTEGER DEFAULT 0,

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(org_id, contact_id, date)
);

CREATE INDEX idx_contact_freq_contact_date ON public.contact_send_frequency(contact_id, date DESC);
CREATE INDEX idx_contact_freq_household_date ON public.contact_send_frequency(household_id, date DESC)
  WHERE household_id IS NOT NULL;

-- RLS
ALTER TABLE public.contact_send_frequency ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.contact_send_frequency
FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- ============================================================================
-- 8. ADD COLUMNS TO EXISTING CONTACTS TABLE
-- ============================================================================
-- Add household_id to contacts for household deduplication
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS household_id UUID;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS state_code TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS birthday_month INTEGER CHECK (birthday_month BETWEEN 1 AND 12);
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS birthday_day INTEGER CHECK (birthday_day BETWEEN 1 AND 31);

CREATE INDEX IF NOT EXISTS idx_contacts_household ON public.contacts(household_id) WHERE household_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_state ON public.contacts(state_code) WHERE state_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_birthday ON public.contacts(birthday_month, birthday_day) WHERE birthday_month IS NOT NULL;

-- ============================================================================
-- 9. HOUSEHOLDS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,

  -- Identification
  name TEXT, -- "The Smith Family"

  -- Primary contact
  primary_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,

  -- Address matching
  address_hash TEXT, -- Normalized address hash for matching

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add FK constraint to contacts.household_id
ALTER TABLE public.contacts
  ADD CONSTRAINT fk_contacts_household
  FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE SET NULL;

CREATE INDEX idx_households_org ON public.households(org_id);
CREATE INDEX idx_households_address_hash ON public.households(address_hash) WHERE address_hash IS NOT NULL;

-- RLS
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.households
FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- ============================================================================
-- 10. FUNCTION: Check frequency cap
-- ============================================================================
CREATE OR REPLACE FUNCTION check_frequency_cap(
  p_org_id UUID,
  p_contact_id UUID,
  p_household_id UUID,
  p_classification TEXT,
  p_channel TEXT
) RETURNS TABLE (
  allowed BOOLEAN,
  reason TEXT,
  contact_today INTEGER,
  contact_week INTEGER,
  household_today INTEGER
) AS $$
DECLARE
  v_config public.marketing_governor_config;
  v_contact_today INTEGER;
  v_contact_week INTEGER;
  v_household_today INTEGER;
BEGIN
  -- Get config
  SELECT * INTO v_config FROM public.marketing_governor_config WHERE org_id = p_org_id;

  -- Count contact today
  SELECT COALESCE(SUM(
    CASE WHEN p_classification = 'marketing' THEN marketing_count ELSE 0 END
  ), 0) INTO v_contact_today
  FROM public.contact_send_frequency
  WHERE contact_id = p_contact_id AND date = CURRENT_DATE;

  -- Count contact this week
  SELECT COALESCE(SUM(
    CASE WHEN p_classification = 'marketing' THEN marketing_count ELSE 0 END
  ), 0) INTO v_contact_week
  FROM public.contact_send_frequency
  WHERE contact_id = p_contact_id AND date >= CURRENT_DATE - INTERVAL '7 days';

  -- Count household today
  IF p_household_id IS NOT NULL THEN
    SELECT COALESCE(SUM(marketing_count), 0) INTO v_household_today
    FROM public.contact_send_frequency
    WHERE household_id = p_household_id AND date = CURRENT_DATE;
  ELSE
    v_household_today := 0;
  END IF;

  -- Check limits
  IF p_classification = 'marketing' THEN
    IF v_contact_today >= COALESCE(v_config.marketing_per_contact_per_day, 2) THEN
      RETURN QUERY SELECT FALSE, 'contact_daily_limit'::TEXT, v_contact_today, v_contact_week, v_household_today;
      RETURN;
    END IF;

    IF v_contact_week >= COALESCE(v_config.marketing_per_contact_per_week, 5) THEN
      RETURN QUERY SELECT FALSE, 'contact_weekly_limit'::TEXT, v_contact_today, v_contact_week, v_household_today;
      RETURN;
    END IF;

    IF p_household_id IS NOT NULL AND v_household_today >= COALESCE(v_config.marketing_per_household_per_day, 2) THEN
      RETURN QUERY SELECT FALSE, 'household_daily_limit'::TEXT, v_contact_today, v_contact_week, v_household_today;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, NULL::TEXT, v_contact_today, v_contact_week, v_household_today;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE public.marketing_feature_flags IS 'Levitate: Feature flags for gradual rollout of marketing features';
COMMENT ON TABLE public.external_service_health IS 'Levitate: Circuit breaker state for external services';
COMMENT ON TABLE public.marketing_governor_config IS 'Levitate: Send rate limiting configuration per organization';
COMMENT ON TABLE public.sender_pause_state IS 'Levitate: Current pause state for senders (org or user level)';
COMMENT ON TABLE public.prohibited_phrases IS 'Levitate: Phrases that cannot be used in marketing communications';
COMMENT ON TABLE public.state_communication_rules IS 'Levitate: State-specific compliance rules for communications';
COMMENT ON TABLE public.contact_send_frequency IS 'Levitate: Rolling window frequency tracking per contact';
COMMENT ON TABLE public.households IS 'Levitate: Household grouping for communication deduplication';
