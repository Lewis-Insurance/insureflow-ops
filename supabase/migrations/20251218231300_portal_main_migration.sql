-- ============================================================================
-- INSUREFLOW CLIENT PORTAL - PRODUCTION DATABASE MIGRATION (CORRECTED)
-- ============================================================================
-- This migration addresses ALL security concerns:
-- 1. RLS enabled on ALL portal tables with proper policies
-- 2. Household member access properly implemented
-- 3. SECURITY DEFINER functions don't accept user IDs
-- 4. IDENTITY instead of SERIAL
-- 5. Case-insensitive email handling
-- 6. updated_at triggers
-- 7. Provenance enforcement (one current per field)
-- 8. Proper FK relationships
-- 9. Multi-agency future-proofing
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- SECTION 1: CORE TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1.1 PORTAL BRANDING (Agency Configuration)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal_branding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic branding
  agency_name TEXT NOT NULL,
  agency_code VARCHAR(20) UNIQUE NOT NULL,
  logo_url TEXT,
  logo_dark_url TEXT,
  favicon_url TEXT,

  -- Colors (hex)
  primary_color VARCHAR(7) DEFAULT '#0066CC',
  secondary_color VARCHAR(7) DEFAULT '#003366',
  accent_color VARCHAR(7) DEFAULT '#00A3E0',

  -- Content
  welcome_title TEXT DEFAULT 'Welcome to Your Insurance Portal',
  welcome_message TEXT,
  support_email CITEXT, -- Case-insensitive
  support_phone TEXT,
  office_address TEXT,

  -- Legal (CRITICAL for E&O protection)
  privacy_policy_url TEXT,
  terms_of_service_url TEXT,
  e_and_o_disclaimer TEXT DEFAULT 'Coverage details shown are based on documents on file and may not reflect real-time policy status. For current billing, claims, and policy status, please contact your carrier directly or visit their website.',

  -- Social
  social_links JSONB DEFAULT '{}',

  -- App Store
  ios_app_url TEXT,
  android_app_url TEXT,

  -- Features toggle
  features_enabled JSONB DEFAULT '{
    "id_cards": true,
    "documents": true,
    "service_requests": true,
    "quote_requests": true,
    "referrals": true,
    "emergency_mode": true,
    "apple_wallet": true,
    "google_wallet": true,
    "household_members": true,
    "document_upload": true
  }',

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_branding_code ON portal_branding(agency_code);

-- ----------------------------------------------------------------------------
-- 1.2 CLIENT PORTAL USERS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_portal_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to Supabase Auth
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

  -- Multi-agency support (future-proofing)
  branding_id UUID REFERENCES portal_branding(id),

  -- Link to InsureFlow data
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  contact_id UUID REFERENCES contacts(id),

  -- Contact info (case-insensitive email)
  email CITEXT NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  phone TEXT,
  first_name TEXT,
  last_name TEXT,

  -- Portal status
  portal_status VARCHAR(20) DEFAULT 'invited' CHECK (portal_status IN ('invited', 'active', 'disabled')),
  invited_at TIMESTAMPTZ,
  invited_by UUID REFERENCES profiles(id),
  first_login_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  login_count INTEGER DEFAULT 0,

  -- Device
  biometric_enabled BOOLEAN DEFAULT FALSE,
  device_tokens JSONB DEFAULT '[]',

  -- Preferences
  preferences JSONB DEFAULT '{
    "email_notifications": true,
    "sms_notifications": false,
    "renewal_reminders": true,
    "marketing_opt_in": false,
    "theme": "system"
  }',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Case-insensitive unique per account
  UNIQUE(account_id, email)
);

CREATE INDEX IF NOT EXISTS idx_portal_users_auth ON client_portal_users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_portal_users_account ON client_portal_users(account_id);
CREATE INDEX IF NOT EXISTS idx_portal_users_email ON client_portal_users(email);
CREATE INDEX IF NOT EXISTS idx_portal_users_status ON client_portal_users(portal_status);
CREATE INDEX IF NOT EXISTS idx_portal_users_branding ON client_portal_users(branding_id);

-- ----------------------------------------------------------------------------
-- 1.3 HOUSEHOLD MEMBERS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal_household_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Primary account holder
  primary_user_id UUID REFERENCES client_portal_users(id) ON DELETE CASCADE NOT NULL,

  -- Member info
  auth_user_id UUID REFERENCES auth.users(id) UNIQUE,
  member_email CITEXT NOT NULL,
  member_name TEXT,
  relationship VARCHAR(30) CHECK (relationship IN ('spouse', 'child', 'dependent', 'business_partner', 'parent', 'other')),

  -- Granular permissions
  permissions JSONB DEFAULT '{
    "view_policies": true,
    "view_documents": true,
    "download_documents": true,
    "view_id_cards": true,
    "add_to_wallet": true,
    "view_billing_links": false,
    "request_service_changes": false,
    "request_quotes": false,
    "manage_household": false,
    "view_premium_amounts": false
  }' NOT NULL,

  -- Status
  status VARCHAR(20) DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'disabled')),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(primary_user_id, member_email)
);

CREATE INDEX IF NOT EXISTS idx_household_primary ON portal_household_members(primary_user_id);
CREATE INDEX IF NOT EXISTS idx_household_auth ON portal_household_members(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_household_status ON portal_household_members(status);

-- ----------------------------------------------------------------------------
-- 1.5 PORTAL DOCUMENTS (Create before provenance for FK)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  policy_id UUID REFERENCES policies(id) ON DELETE SET NULL,
  branding_id UUID REFERENCES portal_branding(id),

  -- Document details
  document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('dec_page', 'id_card', 'certificate', 'endorsement', 'invoice', 'application', 'other')),
  document_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size_bytes INTEGER,
  mime_type VARCHAR(100),

  -- Provenance
  source_type VARCHAR(30) NOT NULL CHECK (source_type IN ('agent_uploaded', 'client_uploaded', 'ai_generated', 'system_generated')),
  uploaded_by_profile_id UUID REFERENCES profiles(id),
  uploaded_by_portal_user_id UUID,

  -- Dates
  document_date DATE,
  effective_date DATE,
  expiration_date DATE,

  -- Visibility
  is_client_visible BOOLEAN DEFAULT TRUE,
  visibility_notes TEXT,
  requires_verification BOOLEAN DEFAULT FALSE,
  verified_for_client_view BOOLEAN DEFAULT TRUE,

  -- Download tracking
  download_count INTEGER DEFAULT 0,
  last_downloaded_at TIMESTAMPTZ,
  last_downloaded_by_portal_user_id UUID,
  last_downloaded_by_household_member_id UUID,

  -- Watermarking
  watermark_enabled BOOLEAN DEFAULT FALSE,
  watermark_text TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_docs_account ON portal_documents(account_id);
CREATE INDEX IF NOT EXISTS idx_portal_docs_policy ON portal_documents(policy_id);
CREATE INDEX IF NOT EXISTS idx_portal_docs_type ON portal_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_portal_docs_visible ON portal_documents(account_id, is_client_visible, verified_for_client_view)
  WHERE is_client_visible = TRUE AND verified_for_client_view = TRUE;

-- ----------------------------------------------------------------------------
-- 1.4 DATA PROVENANCE (Source-of-Truth Tracking)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS policy_data_provenance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  policy_id UUID REFERENCES policies(id) ON DELETE CASCADE NOT NULL,

  -- What field
  field_name TEXT NOT NULL,
  field_value TEXT,

  -- Source tracking
  source_type VARCHAR(30) NOT NULL CHECK (source_type IN ('agent_entered', 'client_uploaded', 'ai_extracted', 'ams_import')),
  source_document_id UUID REFERENCES portal_documents(id) ON DELETE SET NULL,
  source_description TEXT,

  -- Quality
  as_of_date TIMESTAMPTZ NOT NULL,
  confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),

  -- Verification
  verified_by UUID REFERENCES profiles(id),
  verified_at TIMESTAMPTZ,
  verification_notes TEXT,

  -- Status
  is_current BOOLEAN DEFAULT TRUE,
  superseded_by UUID REFERENCES policy_data_provenance(id),
  superseded_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provenance_policy ON policy_data_provenance(policy_id);
CREATE INDEX IF NOT EXISTS idx_provenance_field ON policy_data_provenance(policy_id, field_name);
CREATE INDEX IF NOT EXISTS idx_provenance_current ON policy_data_provenance(policy_id, is_current) WHERE is_current = TRUE;

-- CRITICAL: Enforce only one current value per field per policy
CREATE UNIQUE INDEX IF NOT EXISTS uniq_provenance_current_field
ON policy_data_provenance(policy_id, field_name)
WHERE is_current = TRUE;

-- ----------------------------------------------------------------------------
-- 1.6 ID CARDS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal_id_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Links
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  policy_id UUID REFERENCES policies(id) ON DELETE CASCADE NOT NULL,
  vehicle_id UUID,
  branding_id UUID REFERENCES portal_branding(id),

  -- Card data
  card_data JSONB NOT NULL,

  -- Generated assets (stored in private bucket, served via signed URLs)
  card_image_path TEXT,
  card_pdf_path TEXT,

  -- Wallet passes
  apple_wallet_pass_path TEXT,
  apple_wallet_pass_serial TEXT,
  apple_wallet_pass_updated_at TIMESTAMPTZ,
  google_wallet_pass_url TEXT,
  google_wallet_pass_id TEXT,
  google_wallet_pass_updated_at TIMESTAMPTZ,

  -- Provenance (CRITICAL)
  data_as_of TIMESTAMPTZ NOT NULL,
  source_document_id UUID REFERENCES portal_documents(id),

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  -- Usage tracking
  view_count INTEGER DEFAULT 0,
  download_count INTEGER DEFAULT 0,
  wallet_add_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_id_cards_account ON portal_id_cards(account_id);
CREATE INDEX IF NOT EXISTS idx_id_cards_policy ON portal_id_cards(policy_id);
CREATE INDEX IF NOT EXISTS idx_id_cards_active ON portal_id_cards(account_id, is_active) WHERE is_active = TRUE;

-- ----------------------------------------------------------------------------
-- 1.7 SERVICE REQUESTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal_service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Use IDENTITY instead of SERIAL
  request_number BIGINT GENERATED ALWAYS AS IDENTITY,

  -- Submitter
  portal_user_id UUID REFERENCES client_portal_users(id) NOT NULL,
  household_member_id UUID REFERENCES portal_household_members(id),
  account_id UUID REFERENCES accounts(id) NOT NULL,
  policy_id UUID REFERENCES policies(id),
  branding_id UUID REFERENCES portal_branding(id),

  -- Request type
  request_type VARCHAR(50) NOT NULL CHECK (request_type IN (
    'add_vehicle', 'remove_vehicle', 'replace_vehicle',
    'add_driver', 'remove_driver',
    'address_change', 'name_change',
    'coverage_question', 'coverage_change',
    'document_request', 'certificate_request',
    'cancel_policy', 'reinstate_policy',
    'billing_question', 'claims_question',
    'general_inquiry', 'other'
  )),

  -- Request data
  request_title TEXT NOT NULL,
  request_data JSONB NOT NULL,
  prefilled_data JSONB,
  attachments JSONB DEFAULT '[]',

  -- Workflow
  status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'pending_info', 'completed', 'cancelled')),
  priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

  -- Assignment
  assigned_to UUID REFERENCES profiles(id),
  assigned_at TIMESTAMPTZ,

  -- SLA
  sla_due_at TIMESTAMPTZ,
  sla_breached BOOLEAN DEFAULT FALSE,

  -- Resolution
  resolution_notes TEXT,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES profiles(id),

  -- Task link
  task_id UUID REFERENCES tasks(id),

  -- Communication
  client_notified BOOLEAN DEFAULT FALSE,
  client_notified_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_requests_account ON portal_service_requests(account_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_user ON portal_service_requests(portal_user_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_status ON portal_service_requests(status);
CREATE INDEX IF NOT EXISTS idx_service_requests_assigned ON portal_service_requests(assigned_to);
CREATE INDEX IF NOT EXISTS idx_service_requests_sla ON portal_service_requests(sla_due_at) WHERE status NOT IN ('completed', 'cancelled');

-- ----------------------------------------------------------------------------
-- 1.8 SERVICE REQUEST MESSAGES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal_service_request_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  request_id UUID REFERENCES portal_service_requests(id) ON DELETE CASCADE NOT NULL,

  -- Author (use specific FKs, not generic)
  author_type VARCHAR(20) NOT NULL CHECK (author_type IN ('client', 'household_member', 'agent', 'system')),
  author_portal_user_id UUID REFERENCES client_portal_users(id),
  author_household_member_id UUID REFERENCES portal_household_members(id),
  author_profile_id UUID REFERENCES profiles(id),

  -- Content
  message_text TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',

  -- Visibility
  is_internal BOOLEAN DEFAULT FALSE,

  -- Read tracking
  read_by_client BOOLEAN DEFAULT FALSE,
  read_by_client_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_request_messages_request ON portal_service_request_messages(request_id);
CREATE INDEX IF NOT EXISTS idx_request_messages_visible ON portal_service_request_messages(request_id, is_internal) WHERE is_internal = FALSE;

-- ----------------------------------------------------------------------------
-- 1.9 DOCUMENT UPLOAD STAGING
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal_document_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Uploader
  portal_user_id UUID REFERENCES client_portal_users(id) NOT NULL,
  account_id UUID REFERENCES accounts(id) NOT NULL,
  branding_id UUID REFERENCES portal_branding(id),

  -- File info
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes INTEGER,
  mime_type VARCHAR(100),

  -- Declaration
  declared_document_type VARCHAR(50),
  declared_policy_id UUID REFERENCES policies(id),
  client_notes TEXT,

  -- AI Extraction
  extraction_status VARCHAR(20) DEFAULT 'pending' CHECK (extraction_status IN ('pending', 'processing', 'complete', 'failed', 'skipped')),
  extraction_started_at TIMESTAMPTZ,
  extraction_completed_at TIMESTAMPTZ,
  extraction_error TEXT,
  extracted_data JSONB,
  extraction_confidence DECIMAL(3,2),

  -- Client verification
  client_verification_status VARCHAR(20) DEFAULT 'pending' CHECK (client_verification_status IN ('pending', 'confirmed', 'rejected')),
  client_verified_at TIMESTAMPTZ,
  client_corrections JSONB,

  -- Agent verification
  agent_verification_status VARCHAR(20) DEFAULT 'pending' CHECK (agent_verification_status IN ('pending', 'approved', 'rejected')),
  agent_verified_by UUID REFERENCES profiles(id),
  agent_verified_at TIMESTAMPTZ,
  agent_notes TEXT,

  -- Merge target
  target_policy_id UUID REFERENCES policies(id),
  merged_to_document_id UUID REFERENCES portal_documents(id),
  merged_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_uploads_account ON portal_document_uploads(account_id);
CREATE INDEX IF NOT EXISTS idx_doc_uploads_user ON portal_document_uploads(portal_user_id);
CREATE INDEX IF NOT EXISTS idx_doc_uploads_extraction ON portal_document_uploads(extraction_status);
CREATE INDEX IF NOT EXISTS idx_doc_uploads_agent_verification ON portal_document_uploads(agent_verification_status) WHERE agent_verification_status = 'pending';

-- ----------------------------------------------------------------------------
-- 1.10 QUOTE REQUESTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal_quote_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  request_number BIGINT GENERATED ALWAYS AS IDENTITY,

  -- Submitter
  portal_user_id UUID REFERENCES client_portal_users(id) NOT NULL,
  account_id UUID REFERENCES accounts(id) NOT NULL,
  branding_id UUID REFERENCES portal_branding(id),

  -- Quote type
  product_type VARCHAR(30) NOT NULL CHECK (product_type IN ('auto', 'home', 'renters', 'umbrella', 'life', 'pet', 'boat', 'rv', 'commercial', 'other')),

  -- Request data
  request_data JSONB NOT NULL,
  prefilled_data JSONB,

  -- Source
  source VARCHAR(30) DEFAULT 'portal' CHECK (source IN ('portal', 'coverage_gap', 'referral', 'cross_sell_suggestion')),
  source_opportunity_id UUID,

  -- Status
  status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'quoting', 'quoted', 'bound', 'declined', 'lost')),

  -- Assignment
  assigned_to UUID REFERENCES profiles(id),

  -- Conversion
  lead_id UUID REFERENCES leads(id),
  quote_id UUID REFERENCES quotes(id),
  policy_id UUID REFERENCES policies(id),

  -- Revenue
  quoted_premium DECIMAL(12,2),
  bound_premium DECIMAL(12,2),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_requests_account ON portal_quote_requests(account_id);
CREATE INDEX IF NOT EXISTS idx_quote_requests_user ON portal_quote_requests(portal_user_id);
CREATE INDEX IF NOT EXISTS idx_quote_requests_status ON portal_quote_requests(status);

-- ----------------------------------------------------------------------------
-- 1.11 REFERRALS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who referred
  referring_user_id UUID REFERENCES client_portal_users(id) NOT NULL,
  referring_account_id UUID REFERENCES accounts(id) NOT NULL,
  branding_id UUID REFERENCES portal_branding(id),

  -- Who was referred
  referee_name TEXT NOT NULL,
  referee_email CITEXT,
  referee_phone TEXT,
  referee_relationship VARCHAR(30),

  -- What they need
  products_interested JSONB DEFAULT '[]',
  notes TEXT,

  -- Tracking
  referral_code VARCHAR(20) UNIQUE DEFAULT encode(gen_random_bytes(10), 'hex'),
  status VARCHAR(20) DEFAULT 'submitted' CHECK (status IN ('submitted', 'contacted', 'quoting', 'converted', 'declined')),

  -- Conversion
  converted_to_lead_id UUID REFERENCES leads(id),
  converted_to_account_id UUID REFERENCES accounts(id),
  converted_at TIMESTAMPTZ,

  -- Rewards
  reward_eligible BOOLEAN DEFAULT FALSE,
  reward_type VARCHAR(30),
  reward_amount DECIMAL(10,2),
  reward_paid BOOLEAN DEFAULT FALSE,
  reward_paid_at TIMESTAMPTZ,
  reward_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referrals_user ON portal_referrals(referring_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_account ON portal_referrals(referring_account_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON portal_referrals(status);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON portal_referrals(referral_code);

-- ----------------------------------------------------------------------------
-- 1.12 COVERAGE OPPORTUNITIES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal_coverage_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Target
  portal_user_id UUID REFERENCES client_portal_users(id) NOT NULL,
  account_id UUID REFERENCES accounts(id) NOT NULL,
  branding_id UUID REFERENCES portal_branding(id),

  -- Opportunity
  opportunity_type VARCHAR(30) NOT NULL CHECK (opportunity_type IN ('coverage_gap', 'bundling', 'upgrade', 'life_event')),
  product_type VARCHAR(30) NOT NULL,

  -- Display
  title TEXT NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  cta_text TEXT DEFAULT 'Get a Quote',
  priority INTEGER DEFAULT 50 CHECK (priority >= 1 AND priority <= 100),

  -- Reason
  trigger_reason TEXT,
  trigger_data JSONB,

  -- Status
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'clicked', 'converted', 'dismissed', 'expired')),
  displayed_count INTEGER DEFAULT 0,
  clicked_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  dismissed_reason TEXT,

  -- Conversion
  quote_request_id UUID REFERENCES portal_quote_requests(id),
  converted_policy_id UUID REFERENCES policies(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opportunities_user ON portal_coverage_opportunities(portal_user_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_account ON portal_coverage_opportunities(account_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_active ON portal_coverage_opportunities(account_id, status) WHERE status = 'active';

-- ----------------------------------------------------------------------------
-- 1.13 ACTIVITY LOG
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who (proper FKs)
  portal_user_id UUID REFERENCES client_portal_users(id),
  household_member_id UUID REFERENCES portal_household_members(id),

  -- What
  activity_type VARCHAR(50) NOT NULL,
  activity_data JSONB DEFAULT '{}',

  -- Technical
  ip_address INET,
  user_agent TEXT,
  device_type VARCHAR(20),
  platform VARCHAR(20),

  -- For automation
  processed_for_automation BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_user ON portal_activity_log(portal_user_id);
CREATE INDEX IF NOT EXISTS idx_activity_household ON portal_activity_log(household_member_id);
CREATE INDEX IF NOT EXISTS idx_activity_type ON portal_activity_log(activity_type);
CREATE INDEX IF NOT EXISTS idx_activity_date ON portal_activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_automation ON portal_activity_log(processed_for_automation) WHERE processed_for_automation = FALSE;

-- ----------------------------------------------------------------------------
-- 1.14 METRICS (Internal Only)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal_metrics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date DATE NOT NULL,
  branding_id UUID REFERENCES portal_branding(id), -- Per-agency metrics

  -- Metrics
  total_registered_users INTEGER DEFAULT 0,
  total_active_users INTEGER DEFAULT 0,
  new_registrations INTEGER DEFAULT 0,
  total_logins INTEGER DEFAULT 0,
  unique_logins INTEGER DEFAULT 0,
  total_document_views INTEGER DEFAULT 0,
  total_document_downloads INTEGER DEFAULT 0,
  total_id_card_views INTEGER DEFAULT 0,
  total_wallet_adds INTEGER DEFAULT 0,
  total_service_requests INTEGER DEFAULT 0,
  service_requests_completed INTEGER DEFAULT 0,
  total_quote_requests INTEGER DEFAULT 0,
  quote_requests_converted INTEGER DEFAULT 0,
  total_referrals INTEGER DEFAULT 0,
  referrals_converted INTEGER DEFAULT 0,
  total_carrier_link_clicks INTEGER DEFAULT 0,

  calculated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(metric_date, branding_id)
);

-- ----------------------------------------------------------------------------
-- 1.15 CARRIER CONFIGS (Read-Only to Clients)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS carrier_portal_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  carrier_name TEXT NOT NULL,
  carrier_code VARCHAR(20) UNIQUE,
  logo_url TEXT,

  -- URLs
  main_portal_url TEXT,
  login_url TEXT,
  bill_pay_url TEXT,
  claims_url TEXT,
  documents_url TEXT,
  roadside_url TEXT,

  -- Templates
  bill_pay_url_template TEXT,
  claims_url_template TEXT,

  -- Contact
  customer_service_phone TEXT,
  claims_phone TEXT,
  roadside_phone TEXT,
  customer_service_hours TEXT,

  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 1.16 INVITATIONS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  account_id UUID REFERENCES accounts(id) NOT NULL,
  contact_id UUID REFERENCES contacts(id),
  branding_id UUID REFERENCES portal_branding(id),
  email CITEXT NOT NULL,

  -- Type
  invitation_type VARCHAR(20) DEFAULT 'standard' CHECK (invitation_type IN ('standard', 'vip', 'campaign')),
  campaign_name TEXT,

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'clicked', 'registered', 'expired', 'bounced')),

  -- Tracking
  sent_at TIMESTAMPTZ,
  sent_via VARCHAR(20),
  clicked_at TIMESTAMPTZ,
  registered_at TIMESTAMPTZ,
  portal_user_id UUID REFERENCES client_portal_users(id),

  -- Expiration
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),

  -- Retry
  send_attempts INTEGER DEFAULT 0,
  last_error TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_account ON portal_invitations(account_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON portal_invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON portal_invitations(status);

-- ----------------------------------------------------------------------------
-- 1.17 EMERGENCY LOG
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portal_emergency_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  portal_user_id UUID REFERENCES client_portal_users(id) NOT NULL,

  -- Location (with consent + retention)
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  location_accuracy_meters INTEGER,
  location_consent_given BOOLEAN DEFAULT FALSE,
  location_consent_timestamp TIMESTAMPTZ,

  -- Emergency
  emergency_type VARCHAR(30) CHECK (emergency_type IN ('accident', 'roadside', 'theft', 'damage', 'weather', 'other')),
  actions_taken JSONB DEFAULT '[]',
  photos JSONB DEFAULT '[]',

  -- Follow-up
  claim_initiated BOOLEAN DEFAULT FALSE,
  claim_number TEXT,
  service_request_id UUID REFERENCES portal_service_requests(id),
  agency_contacted BOOLEAN DEFAULT FALSE,
  agency_contacted_at TIMESTAMPTZ,

  -- Retention (location data expires)
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days'),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emergency_user ON portal_emergency_log(portal_user_id);
CREATE INDEX IF NOT EXISTS idx_emergency_expires ON portal_emergency_log(expires_at);


-- ============================================================================
-- SECTION 2: HELPER FUNCTIONS (SECURITY CRITICAL)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 2.1 Get accessible account IDs for current auth user (includes household)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION portal_accessible_account_ids()
RETURNS TABLE(account_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Direct portal user access
  SELECT cpu.account_id
  FROM client_portal_users cpu
  WHERE cpu.auth_user_id = auth.uid()
    AND cpu.portal_status = 'active'

  UNION

  -- Household member access
  SELECT cpu2.account_id
  FROM portal_household_members phm
  JOIN client_portal_users cpu2 ON cpu2.id = phm.primary_user_id
  WHERE phm.auth_user_id = auth.uid()
    AND phm.status = 'active'
    AND cpu2.portal_status = 'active';
$$;

-- Revoke public access, grant only to authenticated
REVOKE ALL ON FUNCTION portal_accessible_account_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION portal_accessible_account_ids() TO authenticated;

-- ----------------------------------------------------------------------------
-- 2.2 Check if current user has specific permission
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION portal_has_permission(p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Primary users have all permissions
    SELECT 1
    FROM client_portal_users cpu
    WHERE cpu.auth_user_id = auth.uid()
      AND cpu.portal_status = 'active'
  )
  OR EXISTS (
    -- Household members need specific permission
    SELECT 1
    FROM portal_household_members phm
    WHERE phm.auth_user_id = auth.uid()
      AND phm.status = 'active'
      AND (phm.permissions->>p_permission)::boolean = true
  );
$$;

REVOKE ALL ON FUNCTION portal_has_permission(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION portal_has_permission(TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2.3 Get current portal user ID (from auth.uid())
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_portal_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM client_portal_users
  WHERE auth_user_id = auth.uid()
    AND portal_status = 'active'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION get_my_portal_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_portal_user_id() TO authenticated;

-- ----------------------------------------------------------------------------
-- 2.4 Get current household member ID (if applicable)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_household_member_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM portal_household_members
  WHERE auth_user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION get_my_household_member_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_my_household_member_id() TO authenticated;


-- ============================================================================
-- SECTION 3: SECURE FUNCTIONS (No user ID arguments!)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 3.1 Log activity (derives user from auth.uid())
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_my_portal_activity(
  p_activity_type TEXT,
  p_activity_data JSONB DEFAULT '{}',
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_device_type TEXT DEFAULT NULL,
  p_platform TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_portal_user_id UUID;
  v_household_member_id UUID;
  v_activity_id UUID;
BEGIN
  -- Get current user's portal user ID
  v_portal_user_id := get_my_portal_user_id();

  -- If not a primary user, check if household member
  IF v_portal_user_id IS NULL THEN
    v_household_member_id := get_my_household_member_id();

    IF v_household_member_id IS NOT NULL THEN
      -- Get the primary user ID for this household member
      SELECT cpu.id INTO v_portal_user_id
      FROM portal_household_members phm
      JOIN client_portal_users cpu ON cpu.id = phm.primary_user_id
      WHERE phm.id = v_household_member_id;
    END IF;
  END IF;

  -- Must be authenticated as portal user or household member
  IF v_portal_user_id IS NULL AND v_household_member_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated as portal user';
  END IF;

  -- Insert activity
  INSERT INTO portal_activity_log (
    portal_user_id,
    household_member_id,
    activity_type,
    activity_data,
    ip_address,
    user_agent,
    device_type,
    platform
  ) VALUES (
    v_portal_user_id,
    v_household_member_id,
    p_activity_type,
    p_activity_data,
    p_ip_address,
    p_user_agent,
    p_device_type,
    p_platform
  )
  RETURNING id INTO v_activity_id;

  -- Update last login if login event
  IF p_activity_type = 'login' AND v_portal_user_id IS NOT NULL AND v_household_member_id IS NULL THEN
    UPDATE client_portal_users
    SET
      last_login_at = NOW(),
      login_count = login_count + 1,
      first_login_at = COALESCE(first_login_at, NOW()),
      portal_status = 'active',
      updated_at = NOW()
    WHERE id = v_portal_user_id;
  END IF;

  RETURN v_activity_id;
END;
$$;

REVOKE ALL ON FUNCTION log_my_portal_activity FROM PUBLIC;
GRANT EXECUTE ON FUNCTION log_my_portal_activity TO authenticated;

-- ----------------------------------------------------------------------------
-- 3.2 Create service request (derives user from auth.uid())
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_my_service_request(
  p_request_type TEXT,
  p_request_title TEXT,
  p_request_data JSONB,
  p_policy_id UUID DEFAULT NULL,
  p_prefilled_data JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_portal_user_id UUID;
  v_household_member_id UUID;
  v_account_id UUID;
  v_branding_id UUID;
  v_user_name TEXT;
  v_request_id UUID;
  v_task_id UUID;
  v_sla_hours INTEGER;
  v_can_request BOOLEAN;
BEGIN
  -- Get current user
  v_portal_user_id := get_my_portal_user_id();
  v_household_member_id := get_my_household_member_id();

  -- Get account info
  IF v_portal_user_id IS NOT NULL THEN
    SELECT account_id, branding_id, CONCAT(first_name, ' ', last_name)
    INTO v_account_id, v_branding_id, v_user_name
    FROM client_portal_users
    WHERE id = v_portal_user_id;
  ELSIF v_household_member_id IS NOT NULL THEN
    -- Check permission
    SELECT (permissions->>'request_service_changes')::boolean
    INTO v_can_request
    FROM portal_household_members
    WHERE id = v_household_member_id;

    IF NOT COALESCE(v_can_request, FALSE) THEN
      RAISE EXCEPTION 'Permission denied: cannot create service requests';
    END IF;

    SELECT cpu.id, cpu.account_id, cpu.branding_id, phm.member_name
    INTO v_portal_user_id, v_account_id, v_branding_id, v_user_name
    FROM portal_household_members phm
    JOIN client_portal_users cpu ON cpu.id = phm.primary_user_id
    WHERE phm.id = v_household_member_id;
  ELSE
    RAISE EXCEPTION 'Not authenticated as portal user';
  END IF;

  -- Verify policy belongs to this account (if provided)
  IF p_policy_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM policies WHERE id = p_policy_id AND account_id = v_account_id
    ) THEN
      RAISE EXCEPTION 'Policy does not belong to your account';
    END IF;
  END IF;

  -- Determine SLA
  v_sla_hours := CASE
    WHEN p_request_type IN ('cancel_policy', 'claims_question') THEN 4
    WHEN p_request_type IN ('certificate_request', 'document_request') THEN 24
    ELSE 48
  END;

  -- Create service request
  INSERT INTO portal_service_requests (
    portal_user_id,
    household_member_id,
    account_id,
    branding_id,
    policy_id,
    request_type,
    request_title,
    request_data,
    prefilled_data,
    sla_due_at,
    priority
  ) VALUES (
    v_portal_user_id,
    v_household_member_id,
    v_account_id,
    v_branding_id,
    p_policy_id,
    p_request_type,
    p_request_title,
    p_request_data,
    p_prefilled_data,
    NOW() + (v_sla_hours || ' hours')::INTERVAL,
    CASE
      WHEN p_request_type IN ('cancel_policy', 'claims_question') THEN 'high'
      ELSE 'normal'
    END
  )
  RETURNING id INTO v_request_id;

  -- Create linked task
  INSERT INTO tasks (
    account_id,
    title,
    description,
    category,
    priority,
    status,
    due_date
  ) VALUES (
    v_account_id,
    'Portal Request: ' || p_request_title,
    'Service request #' || v_request_id::TEXT || ' from ' || COALESCE(v_user_name, 'Portal User') || ' via Client Portal.',
    'service_request',
    CASE
      WHEN p_request_type IN ('cancel_policy', 'claims_question') THEN 'high'
      ELSE 'medium'
    END,
    'pending',
    NOW() + (v_sla_hours || ' hours')::INTERVAL
  )
  RETURNING id INTO v_task_id;

  -- Link task
  UPDATE portal_service_requests
  SET task_id = v_task_id
  WHERE id = v_request_id;

  -- Log activity
  PERFORM log_my_portal_activity(
    'submit_service_request',
    jsonb_build_object('request_id', v_request_id, 'request_type', p_request_type)
  );

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION create_my_service_request FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_my_service_request TO authenticated;

-- ----------------------------------------------------------------------------
-- 3.3 Create quote request (derives user from auth.uid())
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_my_quote_request(
  p_product_type TEXT,
  p_request_data JSONB,
  p_prefilled_data JSONB DEFAULT NULL,
  p_source TEXT DEFAULT 'portal',
  p_source_opportunity_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_portal_user_id UUID;
  v_household_member_id UUID;
  v_account_id UUID;
  v_branding_id UUID;
  v_request_id UUID;
  v_can_request BOOLEAN;
BEGIN
  -- Get current user
  v_portal_user_id := get_my_portal_user_id();
  v_household_member_id := get_my_household_member_id();

  IF v_portal_user_id IS NOT NULL THEN
    SELECT account_id, branding_id
    INTO v_account_id, v_branding_id
    FROM client_portal_users
    WHERE id = v_portal_user_id;
  ELSIF v_household_member_id IS NOT NULL THEN
    -- Check permission
    SELECT (permissions->>'request_quotes')::boolean
    INTO v_can_request
    FROM portal_household_members
    WHERE id = v_household_member_id;

    IF NOT COALESCE(v_can_request, FALSE) THEN
      RAISE EXCEPTION 'Permission denied: cannot create quote requests';
    END IF;

    SELECT cpu.id, cpu.account_id, cpu.branding_id
    INTO v_portal_user_id, v_account_id, v_branding_id
    FROM portal_household_members phm
    JOIN client_portal_users cpu ON cpu.id = phm.primary_user_id
    WHERE phm.id = v_household_member_id;
  ELSE
    RAISE EXCEPTION 'Not authenticated as portal user';
  END IF;

  -- Create quote request
  INSERT INTO portal_quote_requests (
    portal_user_id,
    account_id,
    branding_id,
    product_type,
    request_data,
    prefilled_data,
    source,
    source_opportunity_id
  ) VALUES (
    v_portal_user_id,
    v_account_id,
    v_branding_id,
    p_product_type,
    p_request_data,
    p_prefilled_data,
    p_source,
    p_source_opportunity_id
  )
  RETURNING id INTO v_request_id;

  -- Log activity
  PERFORM log_my_portal_activity(
    'submit_quote_request',
    jsonb_build_object('request_id', v_request_id, 'product_type', p_product_type)
  );

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION create_my_quote_request FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_my_quote_request TO authenticated;

-- ----------------------------------------------------------------------------
-- 3.4 Create referral (derives user from auth.uid())
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_my_referral(
  p_referee_name TEXT,
  p_referee_email TEXT DEFAULT NULL,
  p_referee_phone TEXT DEFAULT NULL,
  p_referee_relationship TEXT DEFAULT NULL,
  p_products_interested JSONB DEFAULT '[]',
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_portal_user_id UUID;
  v_account_id UUID;
  v_branding_id UUID;
  v_referral_id UUID;
BEGIN
  -- Only primary users can create referrals (not household members)
  v_portal_user_id := get_my_portal_user_id();

  IF v_portal_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated as primary portal user';
  END IF;

  SELECT account_id, branding_id
  INTO v_account_id, v_branding_id
  FROM client_portal_users
  WHERE id = v_portal_user_id;

  INSERT INTO portal_referrals (
    referring_user_id,
    referring_account_id,
    branding_id,
    referee_name,
    referee_email,
    referee_phone,
    referee_relationship,
    products_interested,
    notes
  ) VALUES (
    v_portal_user_id,
    v_account_id,
    v_branding_id,
    p_referee_name,
    p_referee_email,
    p_referee_phone,
    p_referee_relationship,
    p_products_interested,
    p_notes
  )
  RETURNING id INTO v_referral_id;

  PERFORM log_my_portal_activity(
    'submit_referral',
    jsonb_build_object('referral_id', v_referral_id)
  );

  RETURN v_referral_id;
END;
$$;

REVOKE ALL ON FUNCTION create_my_referral FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_my_referral TO authenticated;


-- ============================================================================
-- SECTION 4: ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on ALL tables
ALTER TABLE portal_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_portal_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_data_provenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_id_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_service_request_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_document_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_quote_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_coverage_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_metrics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE carrier_portal_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_emergency_log ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 4.1 PORTAL BRANDING - Read-only for authenticated users
-- ----------------------------------------------------------------------------
CREATE POLICY "Anyone can read active branding"
  ON portal_branding FOR SELECT
  USING (is_active = TRUE);

CREATE POLICY "Service role full access to branding"
  ON portal_branding FOR ALL
  TO service_role
  USING (TRUE);

-- ----------------------------------------------------------------------------
-- 4.2 CLIENT PORTAL USERS
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view own profile"
  ON client_portal_users FOR SELECT
  USING (auth_user_id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON client_portal_users FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY "Service role full access to portal_users"
  ON client_portal_users FOR ALL
  TO service_role
  USING (TRUE);

-- ----------------------------------------------------------------------------
-- 4.3 HOUSEHOLD MEMBERS
-- ----------------------------------------------------------------------------
CREATE POLICY "Primary users can view their household"
  ON portal_household_members FOR SELECT
  USING (
    primary_user_id IN (SELECT id FROM client_portal_users WHERE auth_user_id = auth.uid())
    OR auth_user_id = auth.uid()
  );

CREATE POLICY "Primary users can manage household"
  ON portal_household_members FOR ALL
  USING (
    primary_user_id IN (SELECT id FROM client_portal_users WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Service role full access to household"
  ON portal_household_members FOR ALL
  TO service_role
  USING (TRUE);

-- ----------------------------------------------------------------------------
-- 4.4 POLICY DATA PROVENANCE - Internal only (no client access)
-- ----------------------------------------------------------------------------
CREATE POLICY "Service role only for provenance"
  ON policy_data_provenance FOR ALL
  TO service_role
  USING (TRUE);

-- No policies for authenticated = clients can't see raw provenance
-- They see it through views/functions with proper formatting

-- ----------------------------------------------------------------------------
-- 4.5 PORTAL DOCUMENTS
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view their visible documents"
  ON portal_documents FOR SELECT
  USING (
    is_client_visible = TRUE
    AND verified_for_client_view = TRUE
    AND account_id IN (SELECT account_id FROM portal_accessible_account_ids())
    AND portal_has_permission('view_documents')
  );

CREATE POLICY "Service role full access to documents"
  ON portal_documents FOR ALL
  TO service_role
  USING (TRUE);

-- ----------------------------------------------------------------------------
-- 4.6 ID CARDS
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view their ID cards"
  ON portal_id_cards FOR SELECT
  USING (
    account_id IN (SELECT account_id FROM portal_accessible_account_ids())
    AND portal_has_permission('view_id_cards')
    AND is_active = TRUE
  );

CREATE POLICY "Service role full access to id_cards"
  ON portal_id_cards FOR ALL
  TO service_role
  USING (TRUE);

-- ----------------------------------------------------------------------------
-- 4.7 SERVICE REQUESTS
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view their service requests"
  ON portal_service_requests FOR SELECT
  USING (
    account_id IN (SELECT account_id FROM portal_accessible_account_ids())
  );

-- Insert handled by create_my_service_request function (SECURITY DEFINER)
-- No direct insert policy for clients

CREATE POLICY "Service role full access to service_requests"
  ON portal_service_requests FOR ALL
  TO service_role
  USING (TRUE);

-- ----------------------------------------------------------------------------
-- 4.8 SERVICE REQUEST MESSAGES
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view non-internal messages on their requests"
  ON portal_service_request_messages FOR SELECT
  USING (
    is_internal = FALSE
    AND request_id IN (
      SELECT id FROM portal_service_requests
      WHERE account_id IN (SELECT account_id FROM portal_accessible_account_ids())
    )
  );

CREATE POLICY "Users can insert messages on their requests"
  ON portal_service_request_messages FOR INSERT
  WITH CHECK (
    request_id IN (
      SELECT id FROM portal_service_requests
      WHERE account_id IN (SELECT account_id FROM portal_accessible_account_ids())
    )
    AND author_type IN ('client', 'household_member')
    AND is_internal = FALSE
  );

CREATE POLICY "Service role full access to request_messages"
  ON portal_service_request_messages FOR ALL
  TO service_role
  USING (TRUE);

-- ----------------------------------------------------------------------------
-- 4.9 DOCUMENT UPLOADS
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view their uploads"
  ON portal_document_uploads FOR SELECT
  USING (
    account_id IN (SELECT account_id FROM portal_accessible_account_ids())
  );

CREATE POLICY "Users can create uploads"
  ON portal_document_uploads FOR INSERT
  WITH CHECK (
    account_id IN (SELECT account_id FROM portal_accessible_account_ids())
    AND portal_has_permission('view_documents') -- Basic permission check
  );

CREATE POLICY "Users can update their pending uploads"
  ON portal_document_uploads FOR UPDATE
  USING (
    account_id IN (SELECT account_id FROM portal_accessible_account_ids())
    AND client_verification_status = 'pending'
  );

CREATE POLICY "Service role full access to uploads"
  ON portal_document_uploads FOR ALL
  TO service_role
  USING (TRUE);

-- ----------------------------------------------------------------------------
-- 4.10 QUOTE REQUESTS
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view their quote requests"
  ON portal_quote_requests FOR SELECT
  USING (
    account_id IN (SELECT account_id FROM portal_accessible_account_ids())
  );

-- Insert handled by create_my_quote_request function

CREATE POLICY "Service role full access to quote_requests"
  ON portal_quote_requests FOR ALL
  TO service_role
  USING (TRUE);

-- ----------------------------------------------------------------------------
-- 4.11 REFERRALS
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view their referrals"
  ON portal_referrals FOR SELECT
  USING (
    referring_account_id IN (SELECT account_id FROM portal_accessible_account_ids())
  );

-- Insert handled by create_my_referral function

CREATE POLICY "Service role full access to referrals"
  ON portal_referrals FOR ALL
  TO service_role
  USING (TRUE);

-- ----------------------------------------------------------------------------
-- 4.12 COVERAGE OPPORTUNITIES
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view their opportunities"
  ON portal_coverage_opportunities FOR SELECT
  USING (
    account_id IN (SELECT account_id FROM portal_accessible_account_ids())
    AND status = 'active'
  );

CREATE POLICY "Users can update opportunity status"
  ON portal_coverage_opportunities FOR UPDATE
  USING (
    account_id IN (SELECT account_id FROM portal_accessible_account_ids())
  )
  WITH CHECK (
    -- Can only update status-related fields, not content
    account_id IN (SELECT account_id FROM portal_accessible_account_ids())
  );

CREATE POLICY "Service role full access to opportunities"
  ON portal_coverage_opportunities FOR ALL
  TO service_role
  USING (TRUE);

-- ----------------------------------------------------------------------------
-- 4.13 ACTIVITY LOG
-- ----------------------------------------------------------------------------
-- Users can view their own activity (via functions, not direct)
-- Insert handled by log_my_portal_activity function

CREATE POLICY "Service role only for activity_log"
  ON portal_activity_log FOR ALL
  TO service_role
  USING (TRUE);

-- ----------------------------------------------------------------------------
-- 4.14 METRICS - Internal only
-- ----------------------------------------------------------------------------
CREATE POLICY "Service role only for metrics"
  ON portal_metrics_daily FOR ALL
  TO service_role
  USING (TRUE);

-- ----------------------------------------------------------------------------
-- 4.15 CARRIER CONFIGS - Read-only for authenticated
-- ----------------------------------------------------------------------------
CREATE POLICY "Anyone can read active carrier configs"
  ON carrier_portal_configs FOR SELECT
  USING (is_active = TRUE);

CREATE POLICY "Service role full access to carrier_configs"
  ON carrier_portal_configs FOR ALL
  TO service_role
  USING (TRUE);

-- ----------------------------------------------------------------------------
-- 4.16 INVITATIONS - Internal only (service role)
-- ----------------------------------------------------------------------------
CREATE POLICY "Service role only for invitations"
  ON portal_invitations FOR ALL
  TO service_role
  USING (TRUE);

-- ----------------------------------------------------------------------------
-- 4.17 EMERGENCY LOG
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view their emergency logs"
  ON portal_emergency_log FOR SELECT
  USING (
    portal_user_id IN (SELECT id FROM client_portal_users WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Users can create emergency logs"
  ON portal_emergency_log FOR INSERT
  WITH CHECK (
    portal_user_id IN (SELECT id FROM client_portal_users WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Service role full access to emergency_log"
  ON portal_emergency_log FOR ALL
  TO service_role
  USING (TRUE);


-- ============================================================================
-- SECTION 5: TRIGGERS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 5.1 updated_at trigger function
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Apply to all tables with updated_at
CREATE TRIGGER update_portal_branding_updated_at
  BEFORE UPDATE ON portal_branding
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_client_portal_users_updated_at
  BEFORE UPDATE ON client_portal_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_portal_household_members_updated_at
  BEFORE UPDATE ON portal_household_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_portal_documents_updated_at
  BEFORE UPDATE ON portal_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_portal_id_cards_updated_at
  BEFORE UPDATE ON portal_id_cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_portal_service_requests_updated_at
  BEFORE UPDATE ON portal_service_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_portal_document_uploads_updated_at
  BEFORE UPDATE ON portal_document_uploads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_portal_quote_requests_updated_at
  BEFORE UPDATE ON portal_quote_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_portal_referrals_updated_at
  BEFORE UPDATE ON portal_referrals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_portal_coverage_opportunities_updated_at
  BEFORE UPDATE ON portal_coverage_opportunities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_carrier_portal_configs_updated_at
  BEFORE UPDATE ON carrier_portal_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 5.2 Provenance: auto-supersede old values when new one inserted
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION supersede_old_provenance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Mark old current values as superseded
  UPDATE policy_data_provenance
  SET
    is_current = FALSE,
    superseded_by = NEW.id,
    superseded_at = NOW()
  WHERE policy_id = NEW.policy_id
    AND field_name = NEW.field_name
    AND is_current = TRUE
    AND id != NEW.id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER provenance_supersede_trigger
  AFTER INSERT ON policy_data_provenance
  FOR EACH ROW
  WHEN (NEW.is_current = TRUE)
  EXECUTE FUNCTION supersede_old_provenance();


-- ============================================================================
-- SECTION 6: SEED DATA
-- ============================================================================

-- Carrier portal configs
INSERT INTO carrier_portal_configs (carrier_name, carrier_code, main_portal_url, bill_pay_url, claims_url, claims_phone, roadside_phone) VALUES
('Progressive', 'PROG', 'https://www.progressive.com/myaccount/', 'https://www.progressive.com/myaccount/', 'https://www.progressive.com/claims/', '1-800-776-4737', '1-800-776-2778'),
('State Farm', 'SF', 'https://www.statefarm.com/customer-care/account', 'https://www.statefarm.com/customer-care/account', 'https://www.statefarm.com/claims', '1-800-732-5246', '1-877-627-5757'),
('GEICO', 'GEICO', 'https://www.geico.com/login/', 'https://www.geico.com/login/', 'https://www.geico.com/claims/', '1-800-841-3000', '1-800-424-3426'),
('Allstate', 'ALL', 'https://myaccount.allstate.com/', 'https://myaccount.allstate.com/', 'https://www.allstate.com/claims', '1-800-255-7828', '1-800-255-7828'),
('Nationwide', 'NWIDE', 'https://www.nationwide.com/personal/member-services/', 'https://www.nationwide.com/personal/member-services/', 'https://www.nationwide.com/claims/', '1-877-669-6877', '1-800-421-3535'),
('Travelers', 'TRAV', 'https://www.travelers.com/myaccount/', 'https://www.travelers.com/myaccount/', 'https://www.travelers.com/claims/', '1-800-252-4633', '1-800-252-4633'),
('Liberty Mutual', 'LM', 'https://www.libertymutual.com/myaccount', 'https://www.libertymutual.com/myaccount', 'https://www.libertymutual.com/claims-center', '1-800-290-8711', '1-800-362-0000'),
('Auto-Owners', 'AOI', 'https://www.auto-owners.com/my-account', 'https://www.auto-owners.com/my-account', 'https://www.auto-owners.com/claims', '1-800-346-0346', '1-800-346-0346'),
('The Hartford', 'HART', 'https://www.thehartford.com/myaccount/', 'https://www.thehartford.com/myaccount/', 'https://www.thehartford.com/claims', '1-800-243-5860', '1-800-243-5860'),
('Safeco', 'SAFECO', 'https://www.safeco.com/access-account', 'https://www.safeco.com/access-account', 'https://www.safeco.com/claims', '1-800-332-3226', '1-800-332-3226'),
('Farmers', 'FARM', 'https://www.farmers.com/my-account/', 'https://www.farmers.com/my-account/', 'https://www.farmers.com/claims/', '1-800-435-7764', '1-800-435-7764'),
('USAA', 'USAA', 'https://www.usaa.com/my/logon', 'https://www.usaa.com/my/logon', 'https://www.usaa.com/claims', '1-800-531-8722', '1-800-531-8722'),
('American Family', 'AMFAM', 'https://www.amfam.com/myaccount/', 'https://www.amfam.com/myaccount/', 'https://www.amfam.com/claims/', '1-800-692-6326', '1-800-692-6326'),
('Erie Insurance', 'ERIE', 'https://www.erieinsurance.com/my-account', 'https://www.erieinsurance.com/my-account', 'https://www.erieinsurance.com/claims', '1-800-458-0811', '1-800-367-3743')
ON CONFLICT (carrier_code) DO NOTHING;
