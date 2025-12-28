-- ============================================================================
-- PHASE 1: MARKETING AUTOMATION ENGINE
-- ============================================================================
-- Comprehensive workflow automation system for insurance agency marketing
-- Supports: Email drips, SMS campaigns, multi-stage workflows, templates
--
-- DEPENDENCIES:
-- - 20251228000000_m0_agency_workspace_foundation.sql (agency_workspaces table)
-- - 20251228000001_m0_bootstrap_existing_orgs.sql (optional, for backfill)
-- ============================================================================

-- ============================================================================
-- DEPENDENCY CHECK: Ensure agency_workspaces exists
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'agency_workspaces'
  ) THEN
    RAISE EXCEPTION 'Required table agency_workspaces does not exist. Please run migration 20251228000000_m0_agency_workspace_foundation.sql first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'is_agency_member'
  ) THEN
    RAISE EXCEPTION 'Required function is_agency_member does not exist. Please run migration 20251228000000_m0_agency_workspace_foundation.sql first.';
  END IF;
END $$;

-- ============================================================================
-- ENSURE accounts.agency_workspace_id EXISTS
-- ============================================================================
-- This column may be added by bootstrap migration, but add it here if missing
-- to allow this migration to run independently
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS
  agency_workspace_id UUID REFERENCES agency_workspaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_accounts_agency_workspace ON accounts(agency_workspace_id);

-- ============================================================================
-- SECTION 1: WORKFLOW DEFINITIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS automation_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_workspace_id UUID REFERENCES agency_workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,

  -- Workflow Type (12 prebuilt + custom)
  workflow_type TEXT NOT NULL CHECK (workflow_type IN (
    'birthday', 'policy_renewal', 'referral_request', 'turning_65',
    'welcome_client', 'cross_sell', 'thank_you', 'client_pulse',
    'x_date', 'new_policy', 'lost_deal', 'policy_anniversary',
    'custom'
  )),

  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),

  -- Trigger Configuration
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'date_based', 'event_based', 'manual', 'pipeline_stage', 'segment_entry'
  )),
  trigger_config JSONB NOT NULL DEFAULT '{}',
  -- Examples:
  -- date_based: {"field": "date_of_birth", "offset_days": -7, "time": "09:00", "source_table": "contacts"}
  -- event_based: {"event": "policy_created", "delay_minutes": 0, "policy_types": ["auto", "home"]}
  -- pipeline_stage: {"pipeline_id": "uuid", "stage_id": "uuid", "on_enter": true}
  -- segment_entry: {"segment_id": "uuid"}

  -- Filter Configuration (who receives)
  filter_config JSONB DEFAULT '{}',
  -- Examples:
  -- {"policy_types": ["auto", "home"], "carriers": ["State Farm", "Allstate"]}
  -- {"tags": ["vip"], "lead_score_min": 50, "exclude_tags": ["do_not_contact"]}
  -- {"age_min": 60, "age_max": 70, "states": ["TX", "CA"]}

  -- Goal Configuration (what ends the workflow early)
  goal_config JSONB DEFAULT '{}',
  -- {"event": "policy_purchased", "track_conversions": true}

  -- Schedule
  send_window_start TIME DEFAULT '09:00',
  send_window_end TIME DEFAULT '17:00',
  send_days TEXT[] DEFAULT ARRAY['mon','tue','wed','thu','fri'],
  timezone TEXT DEFAULT 'America/Chicago',

  -- Limits
  daily_send_limit INTEGER DEFAULT 100,
  total_recipients_limit INTEGER,
  cooldown_days INTEGER DEFAULT 90, -- Don't re-enroll within X days

  -- Stats (denormalized for performance)
  total_enrolled INTEGER DEFAULT 0,
  total_completed INTEGER DEFAULT 0,
  total_converted INTEGER DEFAULT 0,

  -- Ownership
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 2: WORKFLOW STAGES (Multi-step sequences)
-- ============================================================================

CREATE TABLE IF NOT EXISTS automation_workflow_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES automation_workflows(id) ON DELETE CASCADE,
  stage_number INTEGER NOT NULL,
  name TEXT NOT NULL,

  -- Timing
  delay_type TEXT NOT NULL CHECK (delay_type IN (
    'immediate', 'minutes', 'hours', 'days', 'weeks', 'specific_date', 'specific_time'
  )),
  delay_value INTEGER DEFAULT 0,
  delay_from TEXT DEFAULT 'trigger' CHECK (delay_from IN (
    'trigger', 'previous_stage', 'enrollment', 'specific_date'
  )),
  specific_date DATE,
  send_time TIME DEFAULT '09:00',

  -- Action Type
  action_type TEXT NOT NULL CHECK (action_type IN (
    'email', 'sms', 'postcard', 'task', 'reminder', 'internal_notification',
    'voicemail_drop', 'pipeline_move', 'tag_add', 'tag_remove', 'field_update',
    'webhook', 'wait_for_event', 'branch', 'a_b_split'
  )),

  -- Action Configuration (varies by action_type)
  action_config JSONB NOT NULL,
  -- email: {"template_id": "uuid", "subject": "...", "from_name": "...", "reply_to": "..."}
  -- sms: {"template_id": "uuid", "message": "..."}
  -- task: {"title": "...", "assignee_type": "owner|specific|round_robin", "assignee_id": "uuid", "priority": "high", "due_days": 3}
  -- pipeline_move: {"pipeline_id": "uuid", "stage_id": "uuid"}
  -- tag_add: {"tags": ["vip", "hot_lead"]}
  -- field_update: {"table": "contacts", "field": "status", "value": "nurturing"}
  -- webhook: {"url": "https://...", "method": "POST", "headers": {}, "body_template": "..."}
  -- wait_for_event: {"event": "email_opened", "timeout_days": 7, "timeout_action": "skip"}
  -- branch: {"conditions": [{"if": {...}, "goto_stage": 3}], "else_stage": 4}
  -- a_b_split: {"variants": [{"weight": 50, "action_config": {...}}, {"weight": 50, "action_config": {...}}]}

  -- Conditions for this stage (skip if not met)
  conditions JSONB DEFAULT '[]',
  -- [{"field": "email_opened", "operator": "equals", "value": true}]
  -- [{"field": "lead_score", "operator": "greater_than", "value": 50}]

  -- Stop conditions (end workflow if triggered)
  stop_on_reply BOOLEAN DEFAULT FALSE,
  stop_on_click BOOLEAN DEFAULT FALSE,
  stop_on_unsubscribe BOOLEAN DEFAULT TRUE,
  stop_on_goal BOOLEAN DEFAULT TRUE,

  -- A/B Testing
  is_ab_test BOOLEAN DEFAULT FALSE,
  ab_test_config JSONB, -- {"variants": [...], "winner_criteria": "open_rate", "test_duration_hours": 24}

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(workflow_id, stage_number)
);

-- ============================================================================
-- SECTION 3: WORKFLOW EXECUTIONS (Contact-level tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS automation_workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES automation_workflows(id) ON DELETE CASCADE,
  agency_workspace_id UUID REFERENCES agency_workspaces(id) ON DELETE CASCADE,

  -- Entity being processed (one of these)
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,

  status TEXT DEFAULT 'running' CHECK (status IN (
    'pending', 'running', 'paused', 'completed', 'converted', 'stopped', 'error', 'skipped'
  )),
  current_stage INTEGER DEFAULT 1,

  -- Context data available to templates (snapshot at enrollment)
  context_data JSONB DEFAULT '{}',

  -- Tracking
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  stop_reason TEXT,

  -- Engagement metrics
  emails_sent INTEGER DEFAULT 0,
  emails_opened INTEGER DEFAULT 0,
  emails_clicked INTEGER DEFAULT 0,
  sms_sent INTEGER DEFAULT 0,
  sms_replied INTEGER DEFAULT 0,

  -- Error handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  next_retry_at TIMESTAMPTZ,

  -- A/B Test variant
  ab_variant TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 4: STAGE EXECUTIONS (Individual stage tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS automation_stage_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES automation_workflow_executions(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES automation_workflow_stages(id) ON DELETE CASCADE,

  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'scheduled', 'processing', 'sent', 'delivered', 'opened', 'clicked',
    'replied', 'bounced', 'failed', 'skipped', 'cancelled', 'waiting'
  )),

  scheduled_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,

  -- Delivery details
  delivery_id TEXT, -- Email/SMS message ID from provider
  delivery_provider TEXT, -- 'resend', 'twilio', etc.
  delivery_status JSONB,
  delivery_cost DECIMAL(10,4), -- Cost in USD

  -- Engagement tracking
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  clicked_links JSONB DEFAULT '[]', -- [{"url": "...", "clicked_at": "..."}]
  replied_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  bounce_type TEXT, -- 'hard', 'soft', 'complaint'

  -- A/B Testing
  ab_variant TEXT,

  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 5: EMAIL TEMPLATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_workspace_id UUID REFERENCES agency_workspaces(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  category TEXT, -- 'marketing', 'transactional', 'renewal', 'welcome', etc.
  description TEXT,

  -- Email content
  subject TEXT NOT NULL,
  preview_text TEXT, -- Email preview/preheader
  body_html TEXT NOT NULL,
  body_text TEXT, -- Plain text version

  -- Template variables used
  variables JSONB DEFAULT '[]', -- ["first_name", "policy_type", "agent_name"]

  -- Visual editor data
  design_json JSONB, -- For drag-drop editor (MJML, unlayer, etc.)
  thumbnail_url TEXT,

  -- Sender configuration
  from_name TEXT,
  from_email TEXT,
  reply_to TEXT,

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),

  -- Usage tracking
  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  -- Performance metrics (aggregated)
  total_sent INTEGER DEFAULT 0,
  total_delivered INTEGER DEFAULT 0,
  total_opened INTEGER DEFAULT 0,
  total_clicked INTEGER DEFAULT 0,
  total_bounced INTEGER DEFAULT 0,
  total_unsubscribed INTEGER DEFAULT 0,

  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 6: SMS TEMPLATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS sms_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_workspace_id UUID REFERENCES agency_workspaces(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  category TEXT,
  description TEXT,

  message TEXT NOT NULL,

  -- Template variables used
  variables JSONB DEFAULT '[]',

  -- Character/segment info (computed)
  char_count INTEGER GENERATED ALWAYS AS (length(message)) STORED,
  segment_count INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN length(message) <= 160 THEN 1
      ELSE ceil(length(message)::DECIMAL / 153)  -- Multipart messages use 153 chars
    END
  ) STORED,

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),

  -- Usage tracking
  times_used INTEGER DEFAULT 0,
  total_sent INTEGER DEFAULT 0,
  total_delivered INTEGER DEFAULT 0,
  total_replied INTEGER DEFAULT 0,

  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 7: TEMPLATE MERGE TAGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS template_merge_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag TEXT NOT NULL UNIQUE, -- {{first_name}}
  display_name TEXT NOT NULL, -- "First Name"
  description TEXT,
  category TEXT NOT NULL, -- 'contact', 'account', 'policy', 'agent', 'agency', 'system'
  data_source TEXT NOT NULL, -- Table or computed source
  field_path TEXT NOT NULL, -- 'first_name', 'policies[0].carrier_name'
  default_value TEXT,
  is_system BOOLEAN DEFAULT FALSE, -- System tags can't be deleted
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default merge tags
INSERT INTO template_merge_tags (tag, display_name, description, category, data_source, field_path, default_value, is_system) VALUES
-- Contact fields
('{{first_name}}', 'First Name', 'Contact first name', 'contact', 'contacts', 'first_name', 'Valued Customer', TRUE),
('{{last_name}}', 'Last Name', 'Contact last name', 'contact', 'contacts', 'last_name', '', TRUE),
('{{full_name}}', 'Full Name', 'Contact full name', 'contact', 'computed', 'first_name + last_name', 'Valued Customer', TRUE),
('{{email}}', 'Email Address', 'Contact email address', 'contact', 'contacts', 'email', '', TRUE),
('{{phone}}', 'Phone Number', 'Contact phone number', 'contact', 'contacts', 'phone', '', TRUE),
('{{address}}', 'Mailing Address', 'Contact mailing address', 'contact', 'contacts', 'address', '', TRUE),
('{{city}}', 'City', 'Contact city', 'contact', 'contacts', 'city', '', TRUE),
('{{state}}', 'State', 'Contact state', 'contact', 'contacts', 'state', '', TRUE),
('{{zip}}', 'ZIP Code', 'Contact ZIP code', 'contact', 'contacts', 'zip', '', TRUE),
('{{date_of_birth}}', 'Date of Birth', 'Contact date of birth', 'contact', 'contacts', 'date_of_birth', '', TRUE),
('{{age}}', 'Age', 'Contact age (computed)', 'contact', 'computed', 'age_from_dob', '', TRUE),

-- Agent fields
('{{agent_name}}', 'Agent Name', 'Assigned agent full name', 'agent', 'profiles', 'full_name', 'Your Agent', TRUE),
('{{agent_first_name}}', 'Agent First Name', 'Assigned agent first name', 'agent', 'computed', 'first_name_from_full_name', 'Your Agent', TRUE),
('{{agent_phone}}', 'Agent Phone', 'Assigned agent phone number', 'agent', 'profiles', 'phone', '', TRUE),
('{{agent_email}}', 'Agent Email', 'Assigned agent email', 'agent', 'profiles', 'email', '', TRUE),
('{{agent_title}}', 'Agent Title', 'Assigned agent job title', 'agent', 'profiles', 'title', 'Insurance Agent', TRUE),
('{{agent_calendar_link}}', 'Agent Calendar Link', 'Link to schedule with agent', 'agent', 'profiles', 'calendar_url', '', TRUE),

-- Agency fields
('{{agency_name}}', 'Agency Name', 'Agency name', 'agency', 'agency_workspaces', 'name', 'Our Agency', TRUE),
('{{agency_phone}}', 'Agency Phone', 'Agency main phone number', 'agency', 'agency_workspaces', 'phone', '', TRUE),
('{{agency_email}}', 'Agency Email', 'Agency main email', 'agency', 'agency_workspaces', 'email', '', TRUE),
('{{agency_address}}', 'Agency Address', 'Agency street address', 'agency', 'agency_workspaces', 'address', '', TRUE),
('{{agency_website}}', 'Agency Website', 'Agency website URL', 'agency', 'agency_workspaces', 'website', '', TRUE),

-- Policy fields
('{{policy_type}}', 'Policy Type', 'Type of policy (auto, home, etc.)', 'policy', 'policies', 'policy_type', 'your policy', TRUE),
('{{policy_number}}', 'Policy Number', 'Policy number', 'policy', 'policies', 'policy_number', '', TRUE),
('{{carrier_name}}', 'Carrier Name', 'Insurance carrier name', 'policy', 'policies', 'carrier_name', '', TRUE),
('{{effective_date}}', 'Effective Date', 'Policy effective date', 'policy', 'policies', 'effective_date', '', TRUE),
('{{expiration_date}}', 'Expiration Date', 'Policy expiration date', 'policy', 'policies', 'expiration_date', '', TRUE),
('{{premium}}', 'Premium Amount', 'Policy premium amount', 'policy', 'policies', 'premium', '', TRUE),
('{{premium_formatted}}', 'Premium (Formatted)', 'Policy premium with currency', 'policy', 'computed', 'format_currency(premium)', '', TRUE),
('{{days_until_renewal}}', 'Days Until Renewal', 'Days until policy expires', 'policy', 'computed', 'expiration_date - today', '', TRUE),

-- System fields
('{{portal_link}}', 'Portal Link', 'Client portal login link', 'system', 'computed', 'portal_url', '', TRUE),
('{{app_download_link}}', 'App Download Link', 'Mobile app download link', 'system', 'computed', 'app_url', '', TRUE),
('{{unsubscribe_link}}', 'Unsubscribe Link', 'Email unsubscribe link', 'system', 'computed', 'unsubscribe_url', '', TRUE),
('{{review_link}}', 'Google Review Link', 'Link to leave Google review', 'system', 'computed', 'google_review_url', '', TRUE),
('{{referral_link}}', 'Referral Link', 'Unique referral tracking link', 'system', 'computed', 'referral_url', '', TRUE),
('{{today}}', 'Today''s Date', 'Current date', 'system', 'computed', 'now()', '', TRUE),
('{{current_year}}', 'Current Year', 'Current year', 'system', 'computed', 'extract(year from now())', '', TRUE)
ON CONFLICT (tag) DO NOTHING;

-- ============================================================================
-- SECTION 8: PREBUILT WORKFLOW TEMPLATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS automation_workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  workflow_type TEXT NOT NULL,

  -- Template configuration
  trigger_type TEXT NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}',
  filter_config JSONB DEFAULT '{}',
  goal_config JSONB DEFAULT '{}',

  -- Default stages
  stages JSONB NOT NULL DEFAULT '[]',
  -- [{stage_number: 1, name: "...", delay_type: "...", action_type: "...", action_config: {...}}]

  -- Metadata
  category TEXT, -- 'retention', 'acquisition', 'engagement', 'lifecycle'
  estimated_conversion_rate DECIMAL(5,2),
  recommended_for TEXT[], -- ['auto', 'home', 'commercial']

  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert prebuilt workflow templates
INSERT INTO automation_workflow_templates (name, description, workflow_type, trigger_type, trigger_config, goal_config, stages, category, is_system) VALUES
-- Birthday Workflow
(
  'Happy Birthday Campaign',
  'Send birthday wishes and a special offer to clients on their birthday',
  'birthday',
  'date_based',
  '{"field": "date_of_birth", "offset_days": 0, "time": "09:00", "source_table": "contacts"}',
  '{}',
  '[
    {"stage_number": 1, "name": "Birthday Email", "delay_type": "immediate", "action_type": "email", "action_config": {"subject": "Happy Birthday, {{first_name}}!", "template_type": "birthday"}},
    {"stage_number": 2, "name": "Birthday SMS", "delay_type": "hours", "delay_value": 2, "action_type": "sms", "action_config": {"message": "Happy Birthday {{first_name}}! Wishing you a wonderful day from all of us at {{agency_name}}. Reply STOP to opt out."}}
  ]',
  'engagement',
  TRUE
),

-- Policy Renewal (60 days out)
(
  'Policy Renewal Reminder - 60 Days',
  'Multi-touch renewal campaign starting 60 days before expiration',
  'policy_renewal',
  'date_based',
  '{"field": "expiration_date", "offset_days": -60, "time": "10:00", "source_table": "policies"}',
  '{"event": "policy_renewed", "track_conversions": true}',
  '[
    {"stage_number": 1, "name": "60-Day Reminder Email", "delay_type": "immediate", "action_type": "email", "action_config": {"subject": "Your {{policy_type}} policy renews in 60 days", "template_type": "renewal_60"}},
    {"stage_number": 2, "name": "Create Review Task", "delay_type": "days", "delay_value": 7, "action_type": "task", "action_config": {"title": "Review renewal for {{full_name}}", "assignee_type": "owner", "priority": "medium", "due_days": 7}},
    {"stage_number": 3, "name": "30-Day Reminder Email", "delay_type": "days", "delay_value": 30, "action_type": "email", "action_config": {"subject": "30 days until your {{policy_type}} policy expires", "template_type": "renewal_30"}},
    {"stage_number": 4, "name": "14-Day Call Task", "delay_type": "days", "delay_value": 46, "action_type": "task", "action_config": {"title": "Call {{full_name}} re: renewal", "assignee_type": "owner", "priority": "high", "due_days": 3}},
    {"stage_number": 5, "name": "7-Day Urgent Email", "delay_type": "days", "delay_value": 53, "action_type": "email", "action_config": {"subject": "URGENT: Your {{policy_type}} policy expires in 7 days", "template_type": "renewal_7"}}
  ]',
  'retention',
  TRUE
),

-- Welcome New Client
(
  'New Client Welcome Series',
  'Welcome sequence for newly converted clients',
  'welcome_client',
  'event_based',
  '{"event": "policy_created", "delay_minutes": 0}',
  '{}',
  '[
    {"stage_number": 1, "name": "Welcome Email", "delay_type": "immediate", "action_type": "email", "action_config": {"subject": "Welcome to {{agency_name}}, {{first_name}}!", "template_type": "welcome"}},
    {"stage_number": 2, "name": "Portal Introduction", "delay_type": "days", "delay_value": 3, "action_type": "email", "action_config": {"subject": "Your online portal is ready", "template_type": "portal_intro"}},
    {"stage_number": 3, "name": "Review Request", "delay_type": "days", "delay_value": 30, "action_type": "email", "action_config": {"subject": "How are we doing, {{first_name}}?", "template_type": "review_request"}, "conditions": [{"field": "has_active_policy", "operator": "equals", "value": true}]}
  ]',
  'lifecycle',
  TRUE
),

-- Referral Request
(
  'Referral Request Campaign',
  'Ask satisfied clients for referrals',
  'referral_request',
  'manual',
  '{}',
  '{"event": "referral_received", "track_conversions": true}',
  '[
    {"stage_number": 1, "name": "Referral Ask Email", "delay_type": "immediate", "action_type": "email", "action_config": {"subject": "Know someone who needs insurance?", "template_type": "referral_ask"}},
    {"stage_number": 2, "name": "Referral Reminder", "delay_type": "days", "delay_value": 7, "action_type": "sms", "action_config": {"message": "Hi {{first_name}}, do you know anyone looking for insurance? We reward referrals! {{referral_link}}"}, "stop_on_goal": true}
  ]',
  'acquisition',
  TRUE
),

-- Turning 65 Medicare
(
  'Turning 65 Medicare Outreach',
  'Reach out to clients approaching Medicare eligibility',
  'turning_65',
  'date_based',
  '{"field": "date_of_birth", "offset_years": 65, "offset_months": -3, "time": "10:00", "source_table": "contacts"}',
  '{"event": "medicare_policy_created", "track_conversions": true}',
  '[
    {"stage_number": 1, "name": "Medicare Introduction", "delay_type": "immediate", "action_type": "email", "action_config": {"subject": "Important Medicare information for you, {{first_name}}", "template_type": "medicare_intro"}},
    {"stage_number": 2, "name": "Schedule Consultation Task", "delay_type": "days", "delay_value": 3, "action_type": "task", "action_config": {"title": "Schedule Medicare consultation with {{full_name}}", "assignee_type": "owner", "priority": "high", "due_days": 5}},
    {"stage_number": 3, "name": "Follow-up Call", "delay_type": "days", "delay_value": 14, "action_type": "task", "action_config": {"title": "Follow up on Medicare inquiry - {{full_name}}", "assignee_type": "owner", "priority": "medium", "due_days": 3}}
  ]',
  'acquisition',
  TRUE
),

-- Cross-Sell Campaign
(
  'Cross-Sell Opportunity',
  'Identify and pursue cross-sell opportunities',
  'cross_sell',
  'segment_entry',
  '{"segment_criteria": {"has_auto": true, "has_home": false}}',
  '{"event": "cross_sell_converted", "track_conversions": true}',
  '[
    {"stage_number": 1, "name": "Bundle Savings Email", "delay_type": "immediate", "action_type": "email", "action_config": {"subject": "Save up to 25% with a bundle, {{first_name}}", "template_type": "cross_sell_bundle"}},
    {"stage_number": 2, "name": "Create Quote Task", "delay_type": "days", "delay_value": 3, "action_type": "task", "action_config": {"title": "Prepare cross-sell quote for {{full_name}}", "assignee_type": "owner", "priority": "medium", "due_days": 3}},
    {"stage_number": 3, "name": "Follow-up Email", "delay_type": "days", "delay_value": 10, "action_type": "email", "action_config": {"subject": "Still interested in saving money on insurance?", "template_type": "cross_sell_followup"}, "conditions": [{"field": "email_opened", "operator": "equals", "value": true}]}
  ]',
  'acquisition',
  TRUE
),

-- Lost Deal Re-engagement
(
  'Lost Deal Win-Back',
  'Re-engage prospects who didnt convert',
  'lost_deal',
  'event_based',
  '{"event": "lead_status_changed", "new_status": "lost", "delay_days": 90}',
  '{"event": "policy_created", "track_conversions": true}',
  '[
    {"stage_number": 1, "name": "Check-in Email", "delay_type": "immediate", "action_type": "email", "action_config": {"subject": "How is your insurance working out?", "template_type": "winback_checkin"}},
    {"stage_number": 2, "name": "Rate Review Offer", "delay_type": "days", "delay_value": 30, "action_type": "email", "action_config": {"subject": "Rates have changed - worth another look?", "template_type": "winback_rates"}}
  ]',
  'acquisition',
  TRUE
),

-- Client Pulse Check
(
  'Client Pulse Check',
  'Periodic check-in with existing clients',
  'client_pulse',
  'date_based',
  '{"field": "last_contact_date", "offset_days": 180, "time": "10:00", "source_table": "contacts"}',
  '{}',
  '[
    {"stage_number": 1, "name": "Pulse Check Email", "delay_type": "immediate", "action_type": "email", "action_config": {"subject": "Just checking in, {{first_name}}", "template_type": "pulse_check"}},
    {"stage_number": 2, "name": "Account Review Task", "delay_type": "days", "delay_value": 7, "action_type": "task", "action_config": {"title": "Annual account review - {{full_name}}", "assignee_type": "owner", "priority": "low", "due_days": 14}, "conditions": [{"field": "email_opened", "operator": "equals", "value": true}]}
  ]',
  'engagement',
  TRUE
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SECTION 9: UNSUBSCRIBE/CONSENT MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS communication_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  email TEXT, -- Can track by email even without contact record

  -- Global preferences
  email_opt_in BOOLEAN DEFAULT TRUE,
  sms_opt_in BOOLEAN DEFAULT TRUE,
  mail_opt_in BOOLEAN DEFAULT TRUE,

  -- Category-level preferences
  marketing_opt_in BOOLEAN DEFAULT TRUE,
  transactional_opt_in BOOLEAN DEFAULT TRUE, -- Can't really opt out of this
  renewal_reminders_opt_in BOOLEAN DEFAULT TRUE,

  -- Tracking
  email_unsubscribed_at TIMESTAMPTZ,
  sms_unsubscribed_at TIMESTAMPTZ,
  unsubscribe_reason TEXT,
  unsubscribe_source TEXT, -- 'email_link', 'sms_reply', 'manual', 'complaint'

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(contact_id),
  UNIQUE(email)
);

-- ============================================================================
-- SECTION 10: RLS POLICIES
-- ============================================================================

ALTER TABLE automation_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_workflow_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_stage_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_preferences ENABLE ROW LEVEL SECURITY;

-- Drop existing policies for idempotency
DROP POLICY IF EXISTS "workflows_select" ON automation_workflows;
DROP POLICY IF EXISTS "workflows_insert" ON automation_workflows;
DROP POLICY IF EXISTS "workflows_update" ON automation_workflows;
DROP POLICY IF EXISTS "workflows_delete" ON automation_workflows;
DROP POLICY IF EXISTS "stages_select" ON automation_workflow_stages;
DROP POLICY IF EXISTS "stages_insert" ON automation_workflow_stages;
DROP POLICY IF EXISTS "stages_update" ON automation_workflow_stages;
DROP POLICY IF EXISTS "stages_delete" ON automation_workflow_stages;
DROP POLICY IF EXISTS "executions_select" ON automation_workflow_executions;
DROP POLICY IF EXISTS "stage_exec_select" ON automation_stage_executions;
DROP POLICY IF EXISTS "email_templates_select" ON email_templates;
DROP POLICY IF EXISTS "email_templates_insert" ON email_templates;
DROP POLICY IF EXISTS "email_templates_update" ON email_templates;
DROP POLICY IF EXISTS "email_templates_delete" ON email_templates;
DROP POLICY IF EXISTS "sms_templates_select" ON sms_templates;
DROP POLICY IF EXISTS "sms_templates_insert" ON sms_templates;
DROP POLICY IF EXISTS "sms_templates_update" ON sms_templates;
DROP POLICY IF EXISTS "sms_templates_delete" ON sms_templates;
DROP POLICY IF EXISTS "comm_prefs_select" ON communication_preferences;
DROP POLICY IF EXISTS "comm_prefs_insert" ON communication_preferences;
DROP POLICY IF EXISTS "comm_prefs_update" ON communication_preferences;

-- Workflows: Agency members can access their agency's workflows
CREATE POLICY "workflows_select" ON automation_workflows
  FOR SELECT USING (is_agency_member(agency_workspace_id));

CREATE POLICY "workflows_insert" ON automation_workflows
  FOR INSERT WITH CHECK (is_agency_member(agency_workspace_id));

CREATE POLICY "workflows_update" ON automation_workflows
  FOR UPDATE USING (is_agency_member(agency_workspace_id));

CREATE POLICY "workflows_delete" ON automation_workflows
  FOR DELETE USING (is_agency_admin(agency_workspace_id));

-- Stages: Follow parent workflow permissions
CREATE POLICY "stages_select" ON automation_workflow_stages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM automation_workflows w WHERE w.id = workflow_id AND is_agency_member(w.agency_workspace_id))
  );

CREATE POLICY "stages_insert" ON automation_workflow_stages
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM automation_workflows w WHERE w.id = workflow_id AND is_agency_member(w.agency_workspace_id))
  );

CREATE POLICY "stages_update" ON automation_workflow_stages
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM automation_workflows w WHERE w.id = workflow_id AND is_agency_member(w.agency_workspace_id))
  );

CREATE POLICY "stages_delete" ON automation_workflow_stages
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM automation_workflows w WHERE w.id = workflow_id AND is_agency_admin(w.agency_workspace_id))
  );

-- Executions: Agency members can view
CREATE POLICY "executions_select" ON automation_workflow_executions
  FOR SELECT USING (is_agency_member(agency_workspace_id));

-- Stage executions: Follow parent execution permissions
CREATE POLICY "stage_exec_select" ON automation_stage_executions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM automation_workflow_executions e WHERE e.id = execution_id AND is_agency_member(e.agency_workspace_id))
  );

-- Email templates
CREATE POLICY "email_templates_select" ON email_templates
  FOR SELECT USING (is_agency_member(agency_workspace_id));

CREATE POLICY "email_templates_insert" ON email_templates
  FOR INSERT WITH CHECK (is_agency_member(agency_workspace_id));

CREATE POLICY "email_templates_update" ON email_templates
  FOR UPDATE USING (is_agency_member(agency_workspace_id));

CREATE POLICY "email_templates_delete" ON email_templates
  FOR DELETE USING (is_agency_admin(agency_workspace_id));

-- SMS templates
CREATE POLICY "sms_templates_select" ON sms_templates
  FOR SELECT USING (is_agency_member(agency_workspace_id));

CREATE POLICY "sms_templates_insert" ON sms_templates
  FOR INSERT WITH CHECK (is_agency_member(agency_workspace_id));

CREATE POLICY "sms_templates_update" ON sms_templates
  FOR UPDATE USING (is_agency_member(agency_workspace_id));

CREATE POLICY "sms_templates_delete" ON sms_templates
  FOR DELETE USING (is_agency_admin(agency_workspace_id));

-- Communication preferences: Simplified policies
-- Allow any authenticated user to manage communication preferences
-- More granular access control is handled at the application level
CREATE POLICY "comm_prefs_select" ON communication_preferences
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "comm_prefs_insert" ON communication_preferences
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "comm_prefs_update" ON communication_preferences
  FOR UPDATE USING (auth.role() = 'authenticated');

-- ============================================================================
-- SECTION 11: INDEXES FOR PERFORMANCE
-- ============================================================================

-- Workflows
CREATE INDEX IF NOT EXISTS idx_workflows_agency ON automation_workflows(agency_workspace_id);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON automation_workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_type ON automation_workflows(workflow_type);
CREATE INDEX IF NOT EXISTS idx_workflows_agency_status ON automation_workflows(agency_workspace_id, status);

-- Stages
CREATE INDEX IF NOT EXISTS idx_stages_workflow ON automation_workflow_stages(workflow_id);
CREATE INDEX IF NOT EXISTS idx_stages_workflow_number ON automation_workflow_stages(workflow_id, stage_number);

-- Executions
CREATE INDEX IF NOT EXISTS idx_executions_workflow ON automation_workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_executions_status ON automation_workflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_executions_contact ON automation_workflow_executions(contact_id);
CREATE INDEX IF NOT EXISTS idx_executions_lead ON automation_workflow_executions(lead_id);
CREATE INDEX IF NOT EXISTS idx_executions_running ON automation_workflow_executions(workflow_id) WHERE status = 'running';

-- Stage executions
CREATE INDEX IF NOT EXISTS idx_stage_exec_execution ON automation_stage_executions(execution_id);
CREATE INDEX IF NOT EXISTS idx_stage_exec_scheduled ON automation_stage_executions(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_stage_exec_status ON automation_stage_executions(status);

-- Templates
CREATE INDEX IF NOT EXISTS idx_email_templates_agency ON email_templates(agency_workspace_id);
CREATE INDEX IF NOT EXISTS idx_sms_templates_agency ON sms_templates(agency_workspace_id);

-- Communication preferences
CREATE INDEX IF NOT EXISTS idx_comm_prefs_email ON communication_preferences(email);
CREATE INDEX IF NOT EXISTS idx_comm_prefs_contact ON communication_preferences(contact_id);

-- ============================================================================
-- SECTION 12: TRIGGERS
-- ============================================================================

-- Update updated_at timestamps
DROP TRIGGER IF EXISTS workflows_updated_at ON automation_workflows;
CREATE TRIGGER workflows_updated_at
  BEFORE UPDATE ON automation_workflows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS stages_updated_at ON automation_workflow_stages;
CREATE TRIGGER stages_updated_at
  BEFORE UPDATE ON automation_workflow_stages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS executions_updated_at ON automation_workflow_executions;
CREATE TRIGGER executions_updated_at
  BEFORE UPDATE ON automation_workflow_executions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS email_templates_updated_at ON email_templates;
CREATE TRIGGER email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS sms_templates_updated_at ON sms_templates;
CREATE TRIGGER sms_templates_updated_at
  BEFORE UPDATE ON sms_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SECTION 13: ANALYTICS VIEWS
-- ============================================================================

-- Workflow performance summary
CREATE OR REPLACE VIEW v_workflow_performance AS
SELECT
  w.id,
  w.name,
  w.workflow_type,
  w.status,
  w.agency_workspace_id,
  w.total_enrolled,
  w.total_completed,
  w.total_converted,
  CASE WHEN w.total_enrolled > 0
    THEN ROUND((w.total_completed::DECIMAL / w.total_enrolled) * 100, 1)
    ELSE 0
  END as completion_rate,
  CASE WHEN w.total_enrolled > 0
    THEN ROUND((w.total_converted::DECIMAL / w.total_enrolled) * 100, 1)
    ELSE 0
  END as conversion_rate,
  COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'running') as active_executions,
  MAX(e.enrolled_at) as last_enrollment_at
FROM automation_workflows w
LEFT JOIN automation_workflow_executions e ON e.workflow_id = w.id
GROUP BY w.id;

-- Email engagement summary
CREATE OR REPLACE VIEW v_email_template_performance AS
SELECT
  t.id,
  t.name,
  t.category,
  t.agency_workspace_id,
  t.total_sent,
  t.total_delivered,
  t.total_opened,
  t.total_clicked,
  t.total_bounced,
  CASE WHEN t.total_delivered > 0
    THEN ROUND((t.total_opened::DECIMAL / t.total_delivered) * 100, 1)
    ELSE 0
  END as open_rate,
  CASE WHEN t.total_opened > 0
    THEN ROUND((t.total_clicked::DECIMAL / t.total_opened) * 100, 1)
    ELSE 0
  END as click_to_open_rate,
  CASE WHEN t.total_sent > 0
    THEN ROUND((t.total_bounced::DECIMAL / t.total_sent) * 100, 1)
    ELSE 0
  END as bounce_rate
FROM email_templates t;

-- ============================================================================
-- MARKETING AUTOMATION ENGINE COMPLETE
-- ============================================================================
-- Next steps:
-- 1. Create automation-processor edge function
-- 2. Create useAutomationWorkflows hook
-- 3. Create WorkflowBuilder component
-- ============================================================================
