-- ============================================================================
-- PHASE 2: REPUTATION MANAGEMENT
-- ============================================================================
-- Google Reviews integration and NPS tracking for insurance agencies
-- Supports: Review requests, Google Business Profile sync, NPS surveys
--
-- DEPENDENCIES:
-- - 20251228000000_m0_agency_workspace_foundation.sql (agency_workspaces table)
-- ============================================================================

-- ============================================================================
-- DEPENDENCY CHECK
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'agency_workspaces'
  ) THEN
    RAISE EXCEPTION 'Required table agency_workspaces does not exist. Please run migration 20251228000000_m0_agency_workspace_foundation.sql first.';
  END IF;
END $$;

-- ============================================================================
-- SECTION 1: GOOGLE BUSINESS PROFILE INTEGRATION
-- ============================================================================

-- Store connected Google Business profiles
CREATE TABLE IF NOT EXISTS google_business_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_workspace_id UUID NOT NULL REFERENCES agency_workspaces(id) ON DELETE CASCADE,

  -- Google identifiers
  google_place_id TEXT NOT NULL,
  google_account_id TEXT,
  google_location_id TEXT,

  -- Business information (synced from Google)
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  phone TEXT,
  website TEXT,

  -- Review link
  review_url TEXT, -- Direct link for customers to leave reviews

  -- OAuth tokens (encrypted)
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,

  -- Sync status
  last_sync_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'synced', 'error')),
  sync_error TEXT,

  -- Review stats (aggregated from Google)
  total_reviews INTEGER DEFAULT 0,
  average_rating DECIMAL(2,1) DEFAULT 0,
  rating_1_count INTEGER DEFAULT 0,
  rating_2_count INTEGER DEFAULT 0,
  rating_3_count INTEGER DEFAULT 0,
  rating_4_count INTEGER DEFAULT 0,
  rating_5_count INTEGER DEFAULT 0,

  -- Settings
  auto_sync_enabled BOOLEAN DEFAULT TRUE,
  sync_interval_hours INTEGER DEFAULT 6,

  is_primary BOOLEAN DEFAULT FALSE, -- Primary profile for the agency
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'disconnected', 'error')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(agency_workspace_id, google_place_id)
);

-- ============================================================================
-- SECTION 2: REVIEWS (Synced from Google + Internal)
-- ============================================================================

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_workspace_id UUID NOT NULL REFERENCES agency_workspaces(id) ON DELETE CASCADE,
  google_profile_id UUID REFERENCES google_business_profiles(id) ON DELETE SET NULL,

  -- Google review identifiers
  google_review_id TEXT UNIQUE,

  -- Review source
  source TEXT NOT NULL DEFAULT 'google' CHECK (source IN ('google', 'facebook', 'yelp', 'internal', 'survey')),

  -- Reviewer info
  reviewer_name TEXT,
  reviewer_photo_url TEXT,
  reviewer_profile_url TEXT,

  -- Link to our contact (if identified)
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,

  -- Review content
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,

  -- Timestamps
  reviewed_at TIMESTAMPTZ NOT NULL,

  -- Response handling
  response_text TEXT,
  response_at TIMESTAMPTZ,
  responded_by UUID REFERENCES auth.users(id),

  -- AI-generated response suggestion
  ai_response_suggestion TEXT,
  ai_sentiment TEXT CHECK (ai_sentiment IN ('positive', 'neutral', 'negative', 'mixed')),
  ai_topics JSONB DEFAULT '[]', -- ["claims", "pricing", "service", "communication"]

  -- Status tracking
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'acknowledged', 'responded', 'flagged', 'hidden')),
  is_featured BOOLEAN DEFAULT FALSE, -- Featured on website

  -- Internal notes
  internal_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 3: REVIEW REQUESTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS review_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_workspace_id UUID NOT NULL REFERENCES agency_workspaces(id) ON DELETE CASCADE,

  -- Who we're requesting the review from
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  email TEXT,
  phone TEXT,
  first_name TEXT,
  last_name TEXT,

  -- Request configuration
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'both')),
  template_id UUID, -- Email or SMS template

  -- Google review link
  google_profile_id UUID REFERENCES google_business_profiles(id) ON DELETE SET NULL,
  review_url TEXT NOT NULL,

  -- Tracking
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'sent', 'delivered', 'opened', 'clicked', 'reviewed', 'bounced', 'failed', 'skipped'
  )),

  -- Delivery tracking
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ, -- Clicked the review link
  reviewed_at TIMESTAMPTZ, -- Actually left a review

  -- Result
  review_id UUID REFERENCES reviews(id) ON DELETE SET NULL,
  review_rating INTEGER,

  -- Automation link
  workflow_execution_id UUID, -- If sent via workflow

  -- Error handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 4: NPS SURVEYS
-- ============================================================================

-- NPS Survey campaigns
CREATE TABLE IF NOT EXISTS nps_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_workspace_id UUID NOT NULL REFERENCES agency_workspaces(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,

  -- Trigger configuration
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'manual', 'post_policy', 'post_claim', 'periodic', 'renewal', 'anniversary'
  )),
  trigger_config JSONB DEFAULT '{}',
  -- post_policy: {"delay_days": 30, "policy_types": ["auto", "home"]}
  -- periodic: {"interval_months": 6}
  -- renewal: {"days_after_renewal": 7}

  -- Survey configuration
  follow_up_enabled BOOLEAN DEFAULT TRUE,
  follow_up_question TEXT DEFAULT 'What could we do to improve your experience?',

  -- Routing based on score
  detractor_workflow_id UUID, -- Workflow for detractors (0-6)
  passive_workflow_id UUID, -- Workflow for passives (7-8)
  promoter_workflow_id UUID, -- Workflow for promoters (9-10)

  -- Settings
  status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  send_window_start TIME DEFAULT '09:00',
  send_window_end TIME DEFAULT '18:00',

  -- Stats
  total_sent INTEGER DEFAULT 0,
  total_responses INTEGER DEFAULT 0,
  current_nps_score INTEGER, -- Calculated: (promoters - detractors) / total * 100

  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual NPS responses
CREATE TABLE IF NOT EXISTS nps_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES nps_campaigns(id) ON DELETE CASCADE,
  agency_workspace_id UUID NOT NULL REFERENCES agency_workspaces(id) ON DELETE CASCADE,

  -- Respondent
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  email TEXT,

  -- NPS Score (0-10)
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 10),

  -- Derived category
  category TEXT GENERATED ALWAYS AS (
    CASE
      WHEN score >= 9 THEN 'promoter'
      WHEN score >= 7 THEN 'passive'
      ELSE 'detractor'
    END
  ) STORED,

  -- Follow-up feedback
  feedback_text TEXT,
  feedback_topics JSONB DEFAULT '[]', -- AI-extracted topics

  -- Delivery tracking
  sent_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,

  -- Follow-up actions
  follow_up_required BOOLEAN DEFAULT FALSE,
  follow_up_completed BOOLEAN DEFAULT FALSE,
  follow_up_at TIMESTAMPTZ,
  follow_up_by UUID REFERENCES auth.users(id),
  follow_up_notes TEXT,

  -- Workflow execution
  workflow_execution_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 5: REPUTATION SETTINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS reputation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_workspace_id UUID NOT NULL UNIQUE REFERENCES agency_workspaces(id) ON DELETE CASCADE,

  -- Review request settings
  review_request_enabled BOOLEAN DEFAULT TRUE,
  review_gate_enabled BOOLEAN DEFAULT TRUE, -- Pre-filter unhappy customers
  review_gate_threshold INTEGER DEFAULT 4, -- Min rating to show Google link

  -- Default templates
  default_review_email_template_id UUID,
  default_review_sms_template_id UUID,

  -- NPS settings
  nps_enabled BOOLEAN DEFAULT TRUE,
  default_nps_campaign_id UUID,

  -- Alert settings
  alert_on_new_review BOOLEAN DEFAULT TRUE,
  alert_on_low_rating BOOLEAN DEFAULT TRUE,
  low_rating_threshold INTEGER DEFAULT 3,
  alert_email TEXT,
  alert_slack_webhook TEXT,

  -- Auto-response settings
  auto_respond_enabled BOOLEAN DEFAULT FALSE,
  auto_respond_delay_hours INTEGER DEFAULT 24,
  auto_respond_template_id UUID,

  -- Display settings
  show_reviews_on_portal BOOLEAN DEFAULT TRUE,
  min_display_rating INTEGER DEFAULT 4,
  featured_reviews_count INTEGER DEFAULT 5,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 6: REVIEW RESPONSE TEMPLATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS review_response_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_workspace_id UUID REFERENCES agency_workspaces(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,

  -- Categorization
  rating_min INTEGER DEFAULT 1 CHECK (rating_min >= 1 AND rating_min <= 5),
  rating_max INTEGER DEFAULT 5 CHECK (rating_max >= 1 AND rating_max <= 5),
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative', 'any')),
  topics JSONB DEFAULT '[]', -- Match reviews with these topics

  -- Response content
  response_text TEXT NOT NULL,

  -- Variables available
  variables JSONB DEFAULT '[]', -- ["reviewer_name", "agent_name", "agency_name"]

  -- Usage tracking
  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  is_system BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived')),

  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default response templates
INSERT INTO review_response_templates (name, rating_min, rating_max, sentiment, response_text, is_system)
VALUES
  ('5-Star Thank You', 5, 5, 'positive',
   'Thank you so much for your wonderful 5-star review, {{reviewer_name}}! We truly appreciate your kind words and are thrilled to know we could meet your insurance needs. Your support means everything to us, and we look forward to continuing to serve you. - The {{agency_name}} Team',
   TRUE),
  ('4-Star Appreciation', 4, 4, 'positive',
   'Thank you for your positive review, {{reviewer_name}}! We''re glad we could help with your insurance needs. If there''s anything we can do to earn that 5th star, please let us know. We''re always striving to improve! - {{agent_name}} at {{agency_name}}',
   TRUE),
  ('3-Star Improvement', 3, 3, 'neutral',
   'Thank you for your feedback, {{reviewer_name}}. We appreciate you taking the time to share your experience. We''d love to learn more about how we can improve. Please reach out to us directly at {{agency_phone}} so we can address your concerns. - {{agent_name}}',
   TRUE),
  ('Low Rating Resolution', 1, 2, 'negative',
   'We''re truly sorry to hear about your experience, {{reviewer_name}}. This is not the level of service we strive to provide. Please contact us directly at {{agency_phone}} so we can make this right. Your satisfaction is our priority. - {{agent_name}} at {{agency_name}}',
   TRUE)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SECTION 7: RLS POLICIES
-- ============================================================================

ALTER TABLE google_business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE nps_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE nps_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE reputation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_response_templates ENABLE ROW LEVEL SECURITY;

-- Drop existing policies for idempotency
DROP POLICY IF EXISTS "gbp_select" ON google_business_profiles;
DROP POLICY IF EXISTS "gbp_insert" ON google_business_profiles;
DROP POLICY IF EXISTS "gbp_update" ON google_business_profiles;
DROP POLICY IF EXISTS "gbp_delete" ON google_business_profiles;
DROP POLICY IF EXISTS "reviews_select" ON reviews;
DROP POLICY IF EXISTS "reviews_insert" ON reviews;
DROP POLICY IF EXISTS "reviews_update" ON reviews;
DROP POLICY IF EXISTS "review_requests_select" ON review_requests;
DROP POLICY IF EXISTS "review_requests_insert" ON review_requests;
DROP POLICY IF EXISTS "review_requests_update" ON review_requests;
DROP POLICY IF EXISTS "nps_campaigns_select" ON nps_campaigns;
DROP POLICY IF EXISTS "nps_campaigns_insert" ON nps_campaigns;
DROP POLICY IF EXISTS "nps_campaigns_update" ON nps_campaigns;
DROP POLICY IF EXISTS "nps_campaigns_delete" ON nps_campaigns;
DROP POLICY IF EXISTS "nps_responses_select" ON nps_responses;
DROP POLICY IF EXISTS "nps_responses_insert" ON nps_responses;
DROP POLICY IF EXISTS "nps_responses_update" ON nps_responses;
DROP POLICY IF EXISTS "rep_settings_select" ON reputation_settings;
DROP POLICY IF EXISTS "rep_settings_insert" ON reputation_settings;
DROP POLICY IF EXISTS "rep_settings_update" ON reputation_settings;
DROP POLICY IF EXISTS "response_templates_select" ON review_response_templates;
DROP POLICY IF EXISTS "response_templates_insert" ON review_response_templates;
DROP POLICY IF EXISTS "response_templates_update" ON review_response_templates;

-- Google Business Profiles
CREATE POLICY "gbp_select" ON google_business_profiles
  FOR SELECT USING (is_agency_member(agency_workspace_id));

CREATE POLICY "gbp_insert" ON google_business_profiles
  FOR INSERT WITH CHECK (is_agency_member(agency_workspace_id));

CREATE POLICY "gbp_update" ON google_business_profiles
  FOR UPDATE USING (is_agency_admin(agency_workspace_id));

CREATE POLICY "gbp_delete" ON google_business_profiles
  FOR DELETE USING (is_agency_admin(agency_workspace_id));

-- Reviews
CREATE POLICY "reviews_select" ON reviews
  FOR SELECT USING (is_agency_member(agency_workspace_id));

CREATE POLICY "reviews_insert" ON reviews
  FOR INSERT WITH CHECK (is_agency_member(agency_workspace_id));

CREATE POLICY "reviews_update" ON reviews
  FOR UPDATE USING (is_agency_member(agency_workspace_id));

-- Review Requests
CREATE POLICY "review_requests_select" ON review_requests
  FOR SELECT USING (is_agency_member(agency_workspace_id));

CREATE POLICY "review_requests_insert" ON review_requests
  FOR INSERT WITH CHECK (is_agency_member(agency_workspace_id));

CREATE POLICY "review_requests_update" ON review_requests
  FOR UPDATE USING (is_agency_member(agency_workspace_id));

-- NPS Campaigns
CREATE POLICY "nps_campaigns_select" ON nps_campaigns
  FOR SELECT USING (is_agency_member(agency_workspace_id));

CREATE POLICY "nps_campaigns_insert" ON nps_campaigns
  FOR INSERT WITH CHECK (is_agency_member(agency_workspace_id));

CREATE POLICY "nps_campaigns_update" ON nps_campaigns
  FOR UPDATE USING (is_agency_member(agency_workspace_id));

CREATE POLICY "nps_campaigns_delete" ON nps_campaigns
  FOR DELETE USING (is_agency_admin(agency_workspace_id));

-- NPS Responses
CREATE POLICY "nps_responses_select" ON nps_responses
  FOR SELECT USING (is_agency_member(agency_workspace_id));

CREATE POLICY "nps_responses_insert" ON nps_responses
  FOR INSERT WITH CHECK (is_agency_member(agency_workspace_id));

CREATE POLICY "nps_responses_update" ON nps_responses
  FOR UPDATE USING (is_agency_member(agency_workspace_id));

-- Reputation Settings
CREATE POLICY "rep_settings_select" ON reputation_settings
  FOR SELECT USING (is_agency_member(agency_workspace_id));

CREATE POLICY "rep_settings_insert" ON reputation_settings
  FOR INSERT WITH CHECK (is_agency_admin(agency_workspace_id));

CREATE POLICY "rep_settings_update" ON reputation_settings
  FOR UPDATE USING (is_agency_admin(agency_workspace_id));

-- Response Templates (agency-specific OR system templates)
CREATE POLICY "response_templates_select" ON review_response_templates
  FOR SELECT USING (
    is_system = TRUE OR
    (agency_workspace_id IS NOT NULL AND is_agency_member(agency_workspace_id))
  );

CREATE POLICY "response_templates_insert" ON review_response_templates
  FOR INSERT WITH CHECK (is_agency_member(agency_workspace_id));

CREATE POLICY "response_templates_update" ON review_response_templates
  FOR UPDATE USING (
    is_system = FALSE AND
    agency_workspace_id IS NOT NULL AND
    is_agency_member(agency_workspace_id)
  );

-- ============================================================================
-- SECTION 8: INDEXES
-- ============================================================================

-- Google Business Profiles
CREATE INDEX IF NOT EXISTS idx_gbp_agency ON google_business_profiles(agency_workspace_id);
CREATE INDEX IF NOT EXISTS idx_gbp_place_id ON google_business_profiles(google_place_id);

-- Reviews
CREATE INDEX IF NOT EXISTS idx_reviews_agency ON reviews(agency_workspace_id);
CREATE INDEX IF NOT EXISTS idx_reviews_google_profile ON reviews(google_profile_id);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_contact ON reviews(contact_id);
CREATE INDEX IF NOT EXISTS idx_reviews_google_id ON reviews(google_review_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewed_at ON reviews(reviewed_at DESC);

-- Review Requests
CREATE INDEX IF NOT EXISTS idx_review_requests_agency ON review_requests(agency_workspace_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_status ON review_requests(status);
CREATE INDEX IF NOT EXISTS idx_review_requests_contact ON review_requests(contact_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_sent ON review_requests(sent_at);

-- NPS
CREATE INDEX IF NOT EXISTS idx_nps_campaigns_agency ON nps_campaigns(agency_workspace_id);
CREATE INDEX IF NOT EXISTS idx_nps_responses_campaign ON nps_responses(campaign_id);
CREATE INDEX IF NOT EXISTS idx_nps_responses_agency ON nps_responses(agency_workspace_id);
CREATE INDEX IF NOT EXISTS idx_nps_responses_category ON nps_responses(category);
CREATE INDEX IF NOT EXISTS idx_nps_responses_contact ON nps_responses(contact_id);

-- ============================================================================
-- SECTION 9: TRIGGERS
-- ============================================================================

-- Update timestamps
DROP TRIGGER IF EXISTS gbp_updated_at ON google_business_profiles;
CREATE TRIGGER gbp_updated_at
  BEFORE UPDATE ON google_business_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS reviews_updated_at ON reviews;
CREATE TRIGGER reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS review_requests_updated_at ON review_requests;
CREATE TRIGGER review_requests_updated_at
  BEFORE UPDATE ON review_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS nps_campaigns_updated_at ON nps_campaigns;
CREATE TRIGGER nps_campaigns_updated_at
  BEFORE UPDATE ON nps_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS nps_responses_updated_at ON nps_responses;
CREATE TRIGGER nps_responses_updated_at
  BEFORE UPDATE ON nps_responses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SECTION 10: NPS CALCULATION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_nps_score(p_campaign_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_promoters INTEGER;
  v_detractors INTEGER;
  v_total INTEGER;
  v_nps INTEGER;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE score >= 9),
    COUNT(*) FILTER (WHERE score <= 6),
    COUNT(*)
  INTO v_promoters, v_detractors, v_total
  FROM nps_responses
  WHERE campaign_id = p_campaign_id;

  IF v_total = 0 THEN
    RETURN NULL;
  END IF;

  v_nps := ROUND(((v_promoters::DECIMAL - v_detractors::DECIMAL) / v_total) * 100);

  -- Update the campaign
  UPDATE nps_campaigns
  SET
    current_nps_score = v_nps,
    total_responses = v_total,
    updated_at = NOW()
  WHERE id = p_campaign_id;

  RETURN v_nps;
END;
$$ LANGUAGE plpgsql;

-- Trigger to recalculate NPS on response
CREATE OR REPLACE FUNCTION trigger_recalculate_nps()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM calculate_nps_score(NEW.campaign_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS nps_response_recalc ON nps_responses;
CREATE TRIGGER nps_response_recalc
  AFTER INSERT OR UPDATE OF score ON nps_responses
  FOR EACH ROW EXECUTE FUNCTION trigger_recalculate_nps();

-- ============================================================================
-- SECTION 11: REVIEW STATS UPDATE FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION update_google_profile_stats(p_profile_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE google_business_profiles
  SET
    total_reviews = (SELECT COUNT(*) FROM reviews WHERE google_profile_id = p_profile_id),
    average_rating = (SELECT COALESCE(AVG(rating), 0) FROM reviews WHERE google_profile_id = p_profile_id),
    rating_1_count = (SELECT COUNT(*) FROM reviews WHERE google_profile_id = p_profile_id AND rating = 1),
    rating_2_count = (SELECT COUNT(*) FROM reviews WHERE google_profile_id = p_profile_id AND rating = 2),
    rating_3_count = (SELECT COUNT(*) FROM reviews WHERE google_profile_id = p_profile_id AND rating = 3),
    rating_4_count = (SELECT COUNT(*) FROM reviews WHERE google_profile_id = p_profile_id AND rating = 4),
    rating_5_count = (SELECT COUNT(*) FROM reviews WHERE google_profile_id = p_profile_id AND rating = 5),
    updated_at = NOW()
  WHERE id = p_profile_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update profile stats on review changes
CREATE OR REPLACE FUNCTION trigger_update_profile_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.google_profile_id IS NOT NULL THEN
      PERFORM update_google_profile_stats(OLD.google_profile_id);
    END IF;
    RETURN OLD;
  ELSE
    IF NEW.google_profile_id IS NOT NULL THEN
      PERFORM update_google_profile_stats(NEW.google_profile_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS review_stats_update ON reviews;
CREATE TRIGGER review_stats_update
  AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION trigger_update_profile_stats();

-- ============================================================================
-- SECTION 12: ANALYTICS VIEWS
-- ============================================================================

-- Agency reputation summary
CREATE OR REPLACE VIEW v_agency_reputation_summary AS
SELECT
  aw.id as agency_workspace_id,
  aw.name as agency_name,
  (SELECT COUNT(*) FROM reviews r WHERE r.agency_workspace_id = aw.id) as total_reviews,
  (SELECT COALESCE(AVG(rating), 0) FROM reviews r WHERE r.agency_workspace_id = aw.id) as average_rating,
  (SELECT COUNT(*) FROM reviews r WHERE r.agency_workspace_id = aw.id AND r.status = 'new') as pending_responses,
  (SELECT COUNT(*) FROM reviews r WHERE r.agency_workspace_id = aw.id AND r.rating <= 3) as low_rating_count,
  (SELECT COUNT(*) FROM reviews r WHERE r.agency_workspace_id = aw.id AND r.reviewed_at > NOW() - INTERVAL '30 days') as reviews_last_30_days,
  (SELECT COALESCE(AVG(score), 0) FROM nps_responses nr WHERE nr.agency_workspace_id = aw.id) as average_nps_score,
  (SELECT COUNT(*) FROM nps_responses nr WHERE nr.agency_workspace_id = aw.id AND nr.responded_at > NOW() - INTERVAL '30 days') as nps_responses_last_30_days
FROM agency_workspaces aw
WHERE aw.status = 'active';

-- Review request performance
CREATE OR REPLACE VIEW v_review_request_performance AS
SELECT
  rr.agency_workspace_id,
  DATE_TRUNC('month', rr.created_at) as month,
  COUNT(*) as total_requests,
  COUNT(*) FILTER (WHERE rr.status = 'reviewed') as total_converted,
  COUNT(*) FILTER (WHERE rr.clicked_at IS NOT NULL) as total_clicked,
  CASE
    WHEN COUNT(*) > 0
    THEN ROUND((COUNT(*) FILTER (WHERE rr.status = 'reviewed')::DECIMAL / COUNT(*)) * 100, 1)
    ELSE 0
  END as conversion_rate,
  COALESCE(AVG(rr.review_rating) FILTER (WHERE rr.review_rating IS NOT NULL), 0) as avg_rating_received
FROM review_requests rr
GROUP BY rr.agency_workspace_id, DATE_TRUNC('month', rr.created_at);

-- NPS trend view
CREATE OR REPLACE VIEW v_nps_trend AS
SELECT
  nr.agency_workspace_id,
  DATE_TRUNC('month', nr.responded_at) as month,
  COUNT(*) as response_count,
  COUNT(*) FILTER (WHERE nr.category = 'promoter') as promoters,
  COUNT(*) FILTER (WHERE nr.category = 'passive') as passives,
  COUNT(*) FILTER (WHERE nr.category = 'detractor') as detractors,
  ROUND(
    ((COUNT(*) FILTER (WHERE nr.category = 'promoter')::DECIMAL -
      COUNT(*) FILTER (WHERE nr.category = 'detractor')::DECIMAL) /
      NULLIF(COUNT(*), 0)) * 100
  ) as nps_score
FROM nps_responses nr
WHERE nr.responded_at IS NOT NULL
GROUP BY nr.agency_workspace_id, DATE_TRUNC('month', nr.responded_at);

-- ============================================================================
-- REPUTATION MANAGEMENT COMPLETE
-- ============================================================================
-- Next steps:
-- 1. Create reputation-manager edge function
-- 2. Create useReputation hooks
-- 3. Create ReviewManager component
-- 4. Create NPSDashboard component
-- ============================================================================
