-- ============================================================================
-- LEVITATE RELATIONSHIP MARKETING ENGINE - PHASE 1: COMMUNICATION & EVIDENCE
-- ============================================================================
-- This migration creates the communication preferences, evidence tables
-- (immutable for compliance), and consent ledger.
-- ============================================================================

-- ============================================================================
-- 1. COMMUNICATION PREFERENCES - Multi-dimensional opt-in/out
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.communication_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,

  -- Scope (one of these will be set)
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  household_id UUID REFERENCES public.households(id) ON DELETE CASCADE,

  -- Version for optimistic locking / race detection
  version INTEGER DEFAULT 1,

  -- Channel preferences
  email_marketing BOOLEAN DEFAULT TRUE,
  email_transactional BOOLEAN DEFAULT TRUE,
  sms_marketing BOOLEAN DEFAULT TRUE,
  sms_transactional BOOLEAN DEFAULT TRUE,
  mail_marketing BOOLEAN DEFAULT TRUE,
  phone_marketing BOOLEAN DEFAULT TRUE,

  -- Purpose preferences (more granular)
  purpose_preferences JSONB DEFAULT '{
    "newsletters": true,
    "renewal_reminders": true,
    "cross_sell": true,
    "surveys": true,
    "birthday_greetings": true,
    "holiday_greetings": true,
    "educational_content": true,
    "referral_requests": true,
    "policy_updates": true,
    "claim_updates": true
  }',

  -- Master suppression flags
  do_not_contact BOOLEAN DEFAULT FALSE, -- Kill switch
  do_not_market BOOLEAN DEFAULT FALSE, -- Marketing only
  deceased BOOLEAN DEFAULT FALSE,

  -- Temporary suppression
  active_claim_suppression BOOLEAN DEFAULT FALSE,
  temporary_suppression_until TIMESTAMPTZ,
  temporary_suppression_reason TEXT,

  -- Provenance
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated_by UUID REFERENCES public.profiles(id),
  last_updated_source TEXT CHECK (last_updated_source IN (
    'preference_center', 'unsubscribe_link', 'one_click_unsubscribe',
    'sms_stop', 'sms_start', 'verbal', 'paper_form', 'manual', 'ams_sync',
    'gdpr_request', 'system'
  )),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_comm_prefs_contact ON public.communication_preferences(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX idx_comm_prefs_account ON public.communication_preferences(account_id) WHERE account_id IS NOT NULL;
CREATE INDEX idx_comm_prefs_household ON public.communication_preferences(household_id) WHERE household_id IS NOT NULL;
CREATE INDEX idx_comm_prefs_suppressed ON public.communication_preferences(org_id)
  WHERE do_not_contact = TRUE OR do_not_market = TRUE OR deceased = TRUE;

-- RLS
ALTER TABLE public.communication_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.communication_preferences
FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- Trigger to increment version on update
CREATE OR REPLACE FUNCTION increment_preference_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.last_updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER preference_version_increment
BEFORE UPDATE ON public.communication_preferences
FOR EACH ROW EXECUTE FUNCTION increment_preference_version();

-- ============================================================================
-- 2. CONSENT LEDGER (IMMUTABLE) - Audit trail for compliance
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.consent_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,

  -- Who
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  email TEXT,
  phone TEXT,

  -- What
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'mail', 'phone', 'all')),
  action TEXT NOT NULL CHECK (action IN ('opt_in', 'opt_out', 'preference_change')),
  purpose TEXT, -- 'marketing', 'transactional', specific category, or 'all'

  -- How
  source TEXT NOT NULL CHECK (source IN (
    'web_form', 'preference_center', 'unsubscribe_link', 'one_click_unsubscribe',
    'sms_stop', 'sms_start', 'verbal', 'paper_form', 'manual', 'ams_sync',
    'gdpr_request', 'system'
  )),
  source_details JSONB, -- URL, form text, etc.

  -- Evidence
  ip_address INET,
  user_agent TEXT,
  consent_text_shown TEXT, -- The actual language they agreed to

  -- Who recorded it
  recorded_by UUID REFERENCES public.profiles(id),
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_consent_ledger_contact ON public.consent_ledger(contact_id, recorded_at DESC);
CREATE INDEX idx_consent_ledger_org ON public.consent_ledger(org_id, recorded_at DESC);

-- RLS
ALTER TABLE public.consent_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.consent_ledger
FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- PREVENT UPDATES AND DELETES (immutable)
REVOKE UPDATE, DELETE ON public.consent_ledger FROM PUBLIC;
REVOKE UPDATE, DELETE ON public.consent_ledger FROM authenticated;

-- ============================================================================
-- 3. MARKETING SEND QUEUE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.marketing_send_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,

  -- Idempotency (CRITICAL)
  idempotency_key TEXT NOT NULL,

  -- Priority & scheduling
  priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10), -- 1=highest
  scheduled_for TIMESTAMPTZ NOT NULL,

  -- Message type
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  classification TEXT NOT NULL CHECK (classification IN ('transactional', 'relationship', 'marketing')),

  -- Sender
  from_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Recipient
  to_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  to_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  to_email TEXT,
  to_phone TEXT,

  -- Householding
  household_id UUID REFERENCES public.households(id) ON DELETE SET NULL,
  household_dedupe_key TEXT, -- For deduplication

  -- Preference version (for race condition detection)
  preferences_version_at_queue INTEGER,

  -- Source tracking
  source_type TEXT NOT NULL CHECK (source_type IN ('campaign', 'automation', 'manual', 'system')),
  source_id UUID,
  automation_step_id UUID,
  automation_enrollment_id UUID,

  -- Processing state
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending',        -- Waiting to be processed
    'claimed',        -- Processor has claimed it
    'processing',     -- Currently sending
    'sent',           -- Successfully sent
    'delivered',      -- Delivery confirmed
    'failed',         -- Permanent failure
    'cancelled',      -- Manually cancelled
    'suppressed',     -- Blocked by suppression rules
    'rate_limited',   -- Delayed due to rate limits
    'preference_stale' -- Preference changed, skipped
  )),

  -- Processing metadata
  processor_id TEXT,
  claimed_at TIMESTAMPTZ,
  claim_expires_at TIMESTAMPTZ,

  -- Attempts
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_attempt_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  last_error TEXT,

  -- Result
  sent_at TIMESTAMPTZ,
  provider_message_id TEXT,
  communication_evidence_id UUID, -- Link to evidence

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_idempotency UNIQUE(idempotency_key)
);

-- Indexes for queue processing
CREATE INDEX idx_send_queue_pending ON public.marketing_send_queue(scheduled_for, priority)
  WHERE status = 'pending';
CREATE INDEX idx_send_queue_claimed ON public.marketing_send_queue(claim_expires_at)
  WHERE status = 'claimed';
CREATE INDEX idx_send_queue_retry ON public.marketing_send_queue(next_retry_at)
  WHERE status = 'rate_limited';
CREATE INDEX idx_send_queue_org ON public.marketing_send_queue(org_id, status);
CREATE INDEX idx_send_queue_contact ON public.marketing_send_queue(to_contact_id, created_at DESC);
CREATE INDEX idx_send_queue_household_dedupe ON public.marketing_send_queue(household_dedupe_key)
  WHERE household_dedupe_key IS NOT NULL AND status = 'pending';

-- RLS
ALTER TABLE public.marketing_send_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.marketing_send_queue
FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- ============================================================================
-- 4. SEND QUEUE PAYLOADS (Channel-specific content)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.marketing_send_queue_payloads (
  queue_id UUID PRIMARY KEY REFERENCES public.marketing_send_queue(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,

  channel TEXT NOT NULL,

  -- Email payload
  email_subject TEXT,
  email_body_html TEXT,
  email_body_text TEXT,
  email_headers JSONB, -- Custom headers
  email_attachments JSONB,

  -- SMS payload
  sms_message TEXT,
  sms_media_urls TEXT[],
  sms_segment_count INTEGER,

  -- Compliance metadata
  compliance_validated BOOLEAN DEFAULT FALSE,
  compliance_classification TEXT,
  unsubscribe_url TEXT,
  postal_address TEXT,
  disclaimers_applied TEXT[],

  -- Template tracking
  template_id UUID,
  template_version_id UUID,
  merge_context JSONB, -- The data used for merge fields

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_send_queue_payloads_org ON public.marketing_send_queue_payloads(org_id);

-- RLS
ALTER TABLE public.marketing_send_queue_payloads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.marketing_send_queue_payloads
FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- ============================================================================
-- 5. COMMUNICATION EVIDENCE (IMMUTABLE) - What was actually sent
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.communication_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,

  -- Message identification
  message_type TEXT NOT NULL CHECK (message_type IN ('email', 'sms')),
  classification TEXT NOT NULL CHECK (classification IN ('transactional', 'relationship', 'marketing')),

  -- Threading (for emails)
  message_id TEXT, -- RFC 5322 Message-ID header
  in_reply_to TEXT, -- If this is a reply
  references_chain TEXT[], -- Full thread chain
  thread_id UUID, -- Internal thread grouping

  -- Sender (captured at send time)
  from_user_id UUID, -- May be NULL if user deleted
  from_email TEXT,
  from_phone TEXT,
  from_display_name TEXT,

  -- Recipient (captured at send time)
  to_contact_id UUID, -- SET NULL if contact deleted, but record preserved
  to_account_id UUID,
  to_email TEXT,
  to_phone TEXT,
  to_name TEXT,

  -- Content snapshot
  subject TEXT,
  body_html TEXT,
  body_text TEXT,
  attachments JSONB,

  -- SMS specific
  sms_segment_count INTEGER,

  -- Compliance snapshot
  included_unsubscribe BOOLEAN,
  included_postal_address BOOLEAN,
  compliance_footer_text TEXT,
  disclaimers_applied TEXT[],

  -- Template tracking
  template_id UUID,
  template_version_id UUID,

  -- Source tracking
  source_type TEXT,
  source_id UUID,
  automation_id UUID,
  automation_step_id UUID,
  automation_enrollment_id UUID,
  campaign_id UUID,

  -- Provider tracking
  provider_message_id TEXT,

  -- Record creation
  created_at TIMESTAMPTZ DEFAULT NOW()

  -- NO updated_at - this record is immutable
);

-- Indexes
CREATE INDEX idx_comm_evidence_org ON public.communication_evidence(org_id);
CREATE INDEX idx_comm_evidence_contact ON public.communication_evidence(to_contact_id, created_at DESC);
CREATE INDEX idx_comm_evidence_account ON public.communication_evidence(to_account_id, created_at DESC);
CREATE INDEX idx_comm_evidence_thread ON public.communication_evidence(thread_id);
CREATE INDEX idx_comm_evidence_message_id ON public.communication_evidence(message_id) WHERE message_id IS NOT NULL;
CREATE INDEX idx_comm_evidence_automation ON public.communication_evidence(automation_enrollment_id) WHERE automation_enrollment_id IS NOT NULL;

-- CRITICAL: Set FK to SET NULL, not CASCADE
-- Contact deletion must NOT delete evidence
ALTER TABLE public.communication_evidence
  ADD CONSTRAINT communication_evidence_to_contact_id_fkey
  FOREIGN KEY (to_contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;

-- RLS
ALTER TABLE public.communication_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.communication_evidence
FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- PREVENT UPDATES AND DELETES (immutable)
REVOKE UPDATE, DELETE ON public.communication_evidence FROM PUBLIC;
REVOKE UPDATE, DELETE ON public.communication_evidence FROM authenticated;

-- ============================================================================
-- 6. COMMUNICATION EVENTS (APPEND-ONLY) - Delivery, opens, clicks, etc.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.communication_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  evidence_id UUID NOT NULL REFERENCES public.communication_evidence(id) ON DELETE CASCADE,

  -- Event details
  event_type TEXT NOT NULL CHECK (event_type IN (
    'queued',
    'processing',
    'sent',
    'delivered',
    'opened',
    'clicked',
    'replied',
    'bounced',
    'complained',
    'unsubscribed',
    'failed',
    'cancelled',
    'suppressed'
  )),

  -- Event data (type-specific)
  event_data JSONB,
  /*
    Examples:
    bounced: {bounce_type: 'hard', reason: 'mailbox_not_found'}
    clicked: {url: 'https://...', user_agent: '...'}
    opened: {user_agent: '...', ip: '...'}
    failed: {error: '...', retryable: false}
  */

  -- Timestamps
  occurred_at TIMESTAMPTZ DEFAULT NOW(),

  -- Source
  source TEXT DEFAULT 'system' CHECK (source IN ('system', 'provider_webhook', 'user_action', 'inbound_parse'))
);

-- Indexes
CREATE INDEX idx_comm_events_evidence ON public.communication_events(evidence_id, occurred_at);
CREATE INDEX idx_comm_events_org_type ON public.communication_events(org_id, event_type, occurred_at DESC);
CREATE INDEX idx_comm_events_timeline ON public.communication_events(org_id, occurred_at DESC);

-- RLS
ALTER TABLE public.communication_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.communication_events
FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

-- PREVENT UPDATES AND DELETES (append-only)
REVOKE UPDATE, DELETE ON public.communication_events FROM PUBLIC;
REVOKE UPDATE, DELETE ON public.communication_events FROM authenticated;

-- ============================================================================
-- 7. SENDER HEALTH METRICS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sender_health_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,

  scope_type TEXT NOT NULL CHECK (scope_type IN ('user', 'org')),
  scope_id TEXT NOT NULL,
  metric_date DATE NOT NULL,

  emails_sent INTEGER DEFAULT 0,
  emails_delivered INTEGER DEFAULT 0,
  bounces_hard INTEGER DEFAULT 0,
  bounces_soft INTEGER DEFAULT 0,
  complaints INTEGER DEFAULT 0,
  unsubscribes INTEGER DEFAULT 0,
  opens INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  replies INTEGER DEFAULT 0,

  bounce_rate DECIMAL(5,4),
  complaint_rate DECIMAL(5,4),
  open_rate DECIMAL(5,4),
  click_rate DECIMAL(5,4),

  health_status TEXT,

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(org_id, scope_type, scope_id, metric_date)
);

CREATE INDEX idx_sender_health_date ON public.sender_health_metrics(metric_date DESC);
CREATE INDEX idx_sender_health_status ON public.sender_health_metrics(org_id, health_status);

-- RLS
ALTER TABLE public.sender_health_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.sender_health_metrics
FOR ALL USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
);

COMMENT ON TABLE public.communication_preferences IS 'Levitate: Multi-dimensional communication preferences per contact/account/household';
COMMENT ON TABLE public.consent_ledger IS 'Levitate: IMMUTABLE audit trail of all consent actions (opt-in/opt-out)';
COMMENT ON TABLE public.marketing_send_queue IS 'Levitate: Central queue for all marketing communications';
COMMENT ON TABLE public.marketing_send_queue_payloads IS 'Levitate: Channel-specific content for queued messages';
COMMENT ON TABLE public.communication_evidence IS 'Levitate: IMMUTABLE record of what was actually sent (7-year retention)';
COMMENT ON TABLE public.communication_events IS 'Levitate: APPEND-ONLY events (delivery, opens, clicks) for communications';
COMMENT ON TABLE public.sender_health_metrics IS 'Levitate: Deliverability metrics per sender/org';
