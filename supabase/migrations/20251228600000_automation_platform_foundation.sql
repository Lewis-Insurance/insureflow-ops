-- ============================================================================
-- AUTOMATION PLATFORM FOUNDATION
-- ============================================================================
-- Purpose: Implements robust event-driven automation infrastructure with:
--   1. Event outbox for durable event delivery to n8n
--   2. Automation gateway audit logging
--   3. Scoped API keys for n8n → Supabase writes
--   4. Service tickets table for V2 workflows
--   5. Helper functions and triggers for event emission
--
-- NON-NEGOTIABLE PRINCIPLES:
--   - Production only with kill switches
--   - No service role key in n8n
--   - All writes via automation-gateway
--   - Idempotency for all operations
--   - Tenant isolation via agency_workspace_id
--   - Full observability and audit trails
-- ============================================================================

-- ============================================================================
-- 1. AUTOMATION EVENT OUTBOX
-- ============================================================================
-- Durable event storage with retry logic for n8n webhook delivery

CREATE TABLE IF NOT EXISTS automation_event_outbox (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Tenant isolation
    agency_workspace_id UUID NOT NULL REFERENCES agency_workspaces(id) ON DELETE CASCADE,

    -- Event metadata
    event_type TEXT NOT NULL,           -- e.g., "lead.created", "quote.sent"
    entity_type TEXT NOT NULL,          -- e.g., "lead", "quote", "policy"
    entity_id UUID NOT NULL,            -- The ID of the entity

    -- Event payload (context for n8n)
    payload JSONB NOT NULL DEFAULT '{}',

    -- Idempotency (CRITICAL: prevents duplicate events)
    idempotency_key TEXT NOT NULL,

    -- Delivery status
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'delivered', 'failed', 'dead', 'cancelled')),

    -- Retry tracking
    attempt_count INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 10,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Delivery tracking
    delivered_at TIMESTAMPTZ,
    last_error TEXT,
    last_http_status INT,

    -- Kill switch support
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID REFERENCES auth.users(id),
    cancel_reason TEXT,

    -- Unique constraint for idempotency
    CONSTRAINT automation_event_outbox_idempotency_unique UNIQUE (idempotency_key)
);

-- Indexes for efficient dispatcher queries
CREATE INDEX IF NOT EXISTS idx_automation_event_outbox_pending
    ON automation_event_outbox (status, next_attempt_at)
    WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_automation_event_outbox_workspace
    ON automation_event_outbox (agency_workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_event_outbox_entity
    ON automation_event_outbox (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_automation_event_outbox_event_type
    ON automation_event_outbox (event_type, created_at DESC);

-- RLS: Only service role and automation can access
ALTER TABLE automation_event_outbox ENABLE ROW LEVEL SECURITY;

-- Admin/service access only
CREATE POLICY "automation_event_outbox_service_only" ON automation_event_outbox
    FOR ALL
    USING (
        -- Service role bypasses RLS
        auth.role() = 'service_role'
        OR
        -- Agency admins can view their workspace events
        (
            auth.uid() IS NOT NULL
            AND is_agency_admin(agency_workspace_id)
        )
    );

COMMENT ON TABLE automation_event_outbox IS
'Durable event queue for n8n webhook delivery. Events are enqueued by triggers and delivered by dispatch-outbox edge function.';


-- ============================================================================
-- 2. AUTOMATION GATEWAY REQUESTS (AUDIT LOG)
-- ============================================================================
-- Immutable log of all gateway calls from n8n

CREATE TABLE IF NOT EXISTS automation_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Tenant isolation
    agency_workspace_id UUID NOT NULL REFERENCES agency_workspaces(id) ON DELETE CASCADE,

    -- Request metadata
    action TEXT NOT NULL,               -- e.g., "lead.speed_to_lead.run"
    idempotency_key TEXT NOT NULL,      -- UNIQUE per action

    -- Request/response data
    request_body JSONB NOT NULL DEFAULT '{}',
    response_body JSONB,

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'created'
        CHECK (status IN ('created', 'ok', 'rejected', 'failed', 'duplicate')),

    -- Error tracking
    error TEXT,
    error_code TEXT,

    -- Performance tracking
    duration_ms INT,

    -- API key tracking
    api_key_id UUID,
    api_key_name TEXT,

    -- Source tracking
    source_event_id BIGINT,             -- Link to outbox event if triggered by one
    n8n_execution_id TEXT,              -- n8n execution ID for traceability

    -- Unique constraint for idempotency per action
    CONSTRAINT automation_requests_idempotency_unique UNIQUE (action, idempotency_key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_automation_requests_workspace
    ON automation_requests (agency_workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_requests_action
    ON automation_requests (action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_requests_status
    ON automation_requests (status, created_at DESC);

-- RLS
ALTER TABLE automation_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "automation_requests_service_only" ON automation_requests
    FOR ALL
    USING (
        auth.role() = 'service_role'
        OR
        (auth.uid() IS NOT NULL AND is_agency_admin(agency_workspace_id))
    );

-- Prevent updates/deletes for audit integrity
REVOKE UPDATE, DELETE ON automation_requests FROM authenticated, anon;

COMMENT ON TABLE automation_requests IS
'Immutable audit log of all automation gateway calls. Each request is idempotent by action+key.';


-- ============================================================================
-- 3. AUTOMATION API KEYS
-- ============================================================================
-- Scoped API keys for n8n to call automation-gateway

CREATE TABLE IF NOT EXISTS automation_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Key metadata
    name TEXT NOT NULL,
    description TEXT,

    -- Hashed key (bcrypt or argon2id)
    key_hash TEXT NOT NULL,
    key_prefix TEXT NOT NULL,           -- First 8 chars for identification

    -- Scopes (allowed actions)
    scopes JSONB NOT NULL DEFAULT '["*"]',  -- Array of action patterns

    -- Status
    enabled BOOLEAN NOT NULL DEFAULT TRUE,

    -- Usage tracking
    last_used_at TIMESTAMPTZ,
    usage_count BIGINT NOT NULL DEFAULT 0,

    -- Expiration
    expires_at TIMESTAMPTZ,             -- NULL = never expires

    -- Audit
    created_by UUID REFERENCES auth.users(id),
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES auth.users(id),
    revoke_reason TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_automation_api_keys_prefix
    ON automation_api_keys (key_prefix);

CREATE INDEX IF NOT EXISTS idx_automation_api_keys_enabled
    ON automation_api_keys (enabled) WHERE enabled = TRUE;

-- RLS: Admin only
ALTER TABLE automation_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "automation_api_keys_admin_only" ON automation_api_keys
    FOR ALL
    USING (
        auth.role() = 'service_role'
        OR
        (auth.uid() IS NOT NULL AND EXISTS (
            SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        ))
    );

COMMENT ON TABLE automation_api_keys IS
'Scoped API keys for n8n automation gateway access. Keys are hashed and never stored in plain text.';


-- ============================================================================
-- 4. SERVICE TICKETS TABLE (Required for V2 workflows)
-- ============================================================================

CREATE TABLE IF NOT EXISTS service_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Tenant isolation
    agency_workspace_id UUID NOT NULL REFERENCES agency_workspaces(id) ON DELETE CASCADE,

    -- Related entities
    account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    policy_id UUID REFERENCES policies(id) ON DELETE SET NULL,
    contact_id UUID,  -- Will reference contacts when table exists

    -- Ticket metadata
    ticket_number TEXT NOT NULL,
    subject TEXT NOT NULL,
    description TEXT,

    -- Classification
    category TEXT NOT NULL DEFAULT 'general'
        CHECK (category IN (
            'general', 'endorsement', 'billing', 'claims', 'certificate',
            'policy_change', 'cancellation', 'reinstatement', 'new_business',
            'renewal', 'audit', 'payment', 'document_request', 'question'
        )),
    priority TEXT NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

    -- Status workflow
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'in_progress', 'pending_customer', 'pending_carrier',
                          'pending_internal', 'resolved', 'closed', 'cancelled')),

    -- SLA tracking
    sla_due_at TIMESTAMPTZ,
    sla_response_at TIMESTAMPTZ,        -- First response timestamp
    sla_resolution_at TIMESTAMPTZ,      -- Resolution timestamp
    sla_breached BOOLEAN DEFAULT FALSE,

    -- Assignment
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ,

    -- Source tracking
    source TEXT NOT NULL DEFAULT 'manual'
        CHECK (source IN ('manual', 'email', 'phone', 'sms', 'portal', 'api', 'automation')),
    source_message_id TEXT,             -- Original email/SMS ID

    -- Resolution
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Soft delete
    deleted_at TIMESTAMPTZ,

    -- Metadata
    tags TEXT[] DEFAULT '{}',
    custom_fields JSONB DEFAULT '{}'
);

-- Generate ticket number sequence
CREATE SEQUENCE IF NOT EXISTS service_ticket_number_seq START 1000;

-- Auto-generate ticket number trigger
-- Drop existing function if return type differs
DROP FUNCTION IF EXISTS generate_ticket_number() CASCADE;

CREATE FUNCTION generate_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
        NEW.ticket_number := 'TKT-' || LPAD(nextval('service_ticket_number_seq')::TEXT, 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_service_tickets_number ON service_tickets;
CREATE TRIGGER tr_service_tickets_number
    BEFORE INSERT ON service_tickets
    FOR EACH ROW
    EXECUTE FUNCTION generate_ticket_number();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_service_tickets_workspace
    ON service_tickets (agency_workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_service_tickets_status
    ON service_tickets (status, priority, sla_due_at);

CREATE INDEX IF NOT EXISTS idx_service_tickets_account
    ON service_tickets (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_service_tickets_assigned
    ON service_tickets (assigned_to, status);

CREATE INDEX IF NOT EXISTS idx_service_tickets_number
    ON service_tickets (ticket_number);

-- RLS
ALTER TABLE service_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_tickets_workspace_access" ON service_tickets
    FOR ALL
    USING (
        auth.role() = 'service_role'
        OR
        (auth.uid() IS NOT NULL AND is_agency_member(agency_workspace_id))
    );

COMMENT ON TABLE service_tickets IS
'Customer service tickets with SLA tracking. Supports email/SMS ingest and automation workflows.';


-- ============================================================================
-- 5. SERVICE TICKET MESSAGES (Conversation thread)
-- ============================================================================

CREATE TABLE IF NOT EXISTS service_ticket_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Parent ticket
    ticket_id UUID NOT NULL REFERENCES service_tickets(id) ON DELETE CASCADE,

    -- Message content
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound', 'internal')),
    channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'phone', 'portal', 'internal')),

    -- Content
    subject TEXT,
    body_text TEXT,
    body_html TEXT,

    -- Sender/recipient
    from_email TEXT,
    from_phone TEXT,
    from_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    to_email TEXT,
    to_phone TEXT,

    -- External tracking
    provider_message_id TEXT,

    -- Attachments
    attachments JSONB DEFAULT '[]',

    -- Status
    status TEXT DEFAULT 'sent' CHECK (status IN ('draft', 'sending', 'sent', 'delivered', 'failed'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_service_ticket_messages_ticket
    ON service_ticket_messages (ticket_id, created_at);

-- RLS
ALTER TABLE service_ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_ticket_messages_via_ticket" ON service_ticket_messages
    FOR ALL
    USING (
        auth.role() = 'service_role'
        OR
        EXISTS (
            SELECT 1 FROM service_tickets t
            WHERE t.id = ticket_id
            AND is_agency_member(t.agency_workspace_id)
        )
    );


-- ============================================================================
-- 6. HELPER FUNCTION: enqueue_outbox_event
-- ============================================================================
-- Safely enqueues events with idempotency

CREATE OR REPLACE FUNCTION enqueue_outbox_event(
    p_workspace_id UUID,
    p_event_type TEXT,
    p_entity_type TEXT,
    p_entity_id UUID,
    p_payload JSONB DEFAULT '{}',
    p_idempotency_key TEXT DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
    v_idempotency_key TEXT;
    v_event_id BIGINT;
BEGIN
    -- Generate idempotency key if not provided
    v_idempotency_key := COALESCE(
        p_idempotency_key,
        p_event_type || ':' || p_entity_type || ':' || p_entity_id || ':' ||
        TO_CHAR(NOW(), 'YYYY-MM-DD-HH24')  -- Hour-level dedup by default
    );

    -- Insert with conflict handling (idempotent)
    INSERT INTO automation_event_outbox (
        agency_workspace_id,
        event_type,
        entity_type,
        entity_id,
        payload,
        idempotency_key
    ) VALUES (
        p_workspace_id,
        p_event_type,
        p_entity_type,
        p_entity_id,
        p_payload,
        v_idempotency_key
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_event_id;

    RETURN v_event_id;  -- NULL if duplicate
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION enqueue_outbox_event IS
'Safely enqueues an event to the outbox with idempotency protection. Returns event ID or NULL if duplicate.';


-- ============================================================================
-- 7. HELPER FUNCTION: Get workspace for account
-- ============================================================================

CREATE OR REPLACE FUNCTION get_account_workspace_id(p_account_id UUID)
RETURNS UUID AS $$
    SELECT agency_workspace_id FROM accounts WHERE id = p_account_id;
$$ LANGUAGE sql STABLE;


-- ============================================================================
-- 8. EVENT TRIGGERS
-- ============================================================================

-- 8a. Lead Created Trigger
CREATE OR REPLACE FUNCTION tr_lead_created()
RETURNS TRIGGER AS $$
DECLARE
    v_workspace_id UUID;
BEGIN
    -- Get workspace from account
    v_workspace_id := get_account_workspace_id(NEW.account_id);

    IF v_workspace_id IS NOT NULL THEN
        PERFORM enqueue_outbox_event(
            v_workspace_id,
            'lead.created',
            'lead',
            NEW.id,
            jsonb_build_object(
                'email', NEW.email,
                'phone', NEW.phone,
                'status', NEW.status,
                'lead_score', NEW.lead_score,
                'account_id', NEW.account_id,
                'source', NEW.source,
                'created_at', NEW.created_at
            ),
            'lead.created:' || NEW.id::TEXT || ':' || TO_CHAR(NEW.created_at, 'YYYY-MM-DD-HH24-MI')
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_leads_created ON leads;
CREATE TRIGGER tr_leads_created
    AFTER INSERT ON leads
    FOR EACH ROW
    EXECUTE FUNCTION tr_lead_created();


-- 8b. Lead Status Changed Trigger
CREATE OR REPLACE FUNCTION tr_lead_status_changed()
RETURNS TRIGGER AS $$
DECLARE
    v_workspace_id UUID;
BEGIN
    -- Only trigger on status change
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        v_workspace_id := get_account_workspace_id(NEW.account_id);

        IF v_workspace_id IS NOT NULL THEN
            PERFORM enqueue_outbox_event(
                v_workspace_id,
                'lead.status_changed',
                'lead',
                NEW.id,
                jsonb_build_object(
                    'old_status', OLD.status,
                    'new_status', NEW.status,
                    'lead_score', NEW.lead_score,
                    'account_id', NEW.account_id
                ),
                'lead.status:' || NEW.id::TEXT || ':' || NEW.status || ':' ||
                TO_CHAR(NOW(), 'YYYY-MM-DD-HH24-MI')
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_leads_status_changed ON leads;
CREATE TRIGGER tr_leads_status_changed
    AFTER UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION tr_lead_status_changed();


-- 8c. Quote Sent Trigger
CREATE OR REPLACE FUNCTION tr_quote_sent()
RETURNS TRIGGER AS $$
DECLARE
    v_workspace_id UUID;
BEGIN
    -- Trigger when status changes to 'sent'
    IF NEW.status = 'sent' AND (OLD.status IS NULL OR OLD.status != 'sent') THEN
        v_workspace_id := get_account_workspace_id(NEW.account_id);

        IF v_workspace_id IS NOT NULL THEN
            PERFORM enqueue_outbox_event(
                v_workspace_id,
                'quote.sent',
                'quote',
                NEW.id,
                jsonb_build_object(
                    'account_id', NEW.account_id,
                    'premium', NEW.premium,
                    'line_of_business', NEW.line_of_business,
                    'carrier_id', NEW.carrier_id,
                    'expires_at', NEW.expires_at
                ),
                'quote.sent:' || NEW.id::TEXT || ':' || TO_CHAR(NOW(), 'YYYY-MM-DD-HH24-MI')
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_quotes_sent ON quotes;
CREATE TRIGGER tr_quotes_sent
    AFTER UPDATE ON quotes
    FOR EACH ROW
    EXECUTE FUNCTION tr_quote_sent();


-- 8d. Policy Activated Trigger
CREATE OR REPLACE FUNCTION tr_policy_activated()
RETURNS TRIGGER AS $$
DECLARE
    v_workspace_id UUID;
BEGIN
    -- Trigger when status changes to 'active'
    IF NEW.status = 'active' AND (OLD.status IS NULL OR OLD.status != 'active') THEN
        v_workspace_id := get_account_workspace_id(NEW.account_id);

        IF v_workspace_id IS NOT NULL THEN
            PERFORM enqueue_outbox_event(
                v_workspace_id,
                'policy.activated',
                'policy',
                NEW.id,
                jsonb_build_object(
                    'account_id', NEW.account_id,
                    'policy_number', NEW.policy_number,
                    'line_of_business', NEW.line_of_business,
                    'carrier_id', NEW.carrier_id,
                    'effective_date', NEW.effective_date,
                    'expiration_date', NEW.expiration_date,
                    'premium', NEW.premium
                ),
                'policy.activated:' || NEW.id::TEXT || ':' || TO_CHAR(NOW(), 'YYYY-MM-DD-HH24-MI')
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_policies_activated ON policies;
CREATE TRIGGER tr_policies_activated
    AFTER UPDATE ON policies
    FOR EACH ROW
    EXECUTE FUNCTION tr_policy_activated();


-- 8e. Document Uploaded Trigger
CREATE OR REPLACE FUNCTION tr_document_uploaded()
RETURNS TRIGGER AS $$
DECLARE
    v_workspace_id UUID;
BEGIN
    -- Get workspace from account or directly
    IF NEW.account_id IS NOT NULL THEN
        v_workspace_id := get_account_workspace_id(NEW.account_id);
    ELSE
        -- Try to get from org_id mapping if account_id not set
        SELECT agency_workspace_id INTO v_workspace_id
        FROM agency_workspace_legacy_org_map
        WHERE legacy_org_id = NEW.org_id
        LIMIT 1;
    END IF;

    IF v_workspace_id IS NOT NULL THEN
        PERFORM enqueue_outbox_event(
            v_workspace_id,
            'document.uploaded',
            'document',
            NEW.id,
            jsonb_build_object(
                'account_id', NEW.account_id,
                'policy_id', NEW.policy_id,
                'filename', NEW.filename,
                'kind', NEW.kind,
                'storage_path', NEW.storage_path,
                'classification', NEW.classification
            ),
            'document.uploaded:' || NEW.id::TEXT || ':' || TO_CHAR(NEW.created_at, 'YYYY-MM-DD-HH24-MI')
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_documents_uploaded ON documents;
CREATE TRIGGER tr_documents_uploaded
    AFTER INSERT ON documents
    FOR EACH ROW
    EXECUTE FUNCTION tr_document_uploaded();


-- 8f. Service Ticket Created Trigger
CREATE OR REPLACE FUNCTION tr_ticket_created()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM enqueue_outbox_event(
        NEW.agency_workspace_id,
        'ticket.created',
        'service_ticket',
        NEW.id,
        jsonb_build_object(
            'ticket_number', NEW.ticket_number,
            'subject', NEW.subject,
            'category', NEW.category,
            'priority', NEW.priority,
            'account_id', NEW.account_id,
            'source', NEW.source,
            'sla_due_at', NEW.sla_due_at
        ),
        'ticket.created:' || NEW.id::TEXT || ':' || TO_CHAR(NEW.created_at, 'YYYY-MM-DD-HH24-MI')
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_service_tickets_created ON service_tickets;
CREATE TRIGGER tr_service_tickets_created
    AFTER INSERT ON service_tickets
    FOR EACH ROW
    EXECUTE FUNCTION tr_ticket_created();


-- ============================================================================
-- 9. DISPATCHER HELPER FUNCTIONS
-- ============================================================================

-- Get pending events for dispatch
CREATE OR REPLACE FUNCTION get_pending_outbox_events(
    p_batch_size INT DEFAULT 50
) RETURNS SETOF automation_event_outbox AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM automation_event_outbox
    WHERE status IN ('pending', 'failed')
      AND next_attempt_at <= NOW()
      AND (cancelled_at IS NULL)
    ORDER BY
        CASE WHEN status = 'pending' THEN 0 ELSE 1 END,  -- Pending first
        next_attempt_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED;  -- Distributed processing support
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Mark event as delivered
CREATE OR REPLACE FUNCTION mark_event_delivered(
    p_event_id BIGINT,
    p_http_status INT DEFAULT 200
) RETURNS VOID AS $$
BEGIN
    UPDATE automation_event_outbox
    SET
        status = 'delivered',
        delivered_at = NOW(),
        last_http_status = p_http_status
    WHERE id = p_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Mark event as failed with retry
CREATE OR REPLACE FUNCTION mark_event_failed(
    p_event_id BIGINT,
    p_error TEXT,
    p_http_status INT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    v_attempt_count INT;
    v_max_attempts INT;
    v_next_attempt INTERVAL;
BEGIN
    -- Get current attempt count
    SELECT attempt_count, max_attempts
    INTO v_attempt_count, v_max_attempts
    FROM automation_event_outbox
    WHERE id = p_event_id;

    v_attempt_count := v_attempt_count + 1;

    -- Calculate exponential backoff
    v_next_attempt := CASE
        WHEN v_attempt_count = 1 THEN INTERVAL '30 seconds'
        WHEN v_attempt_count = 2 THEN INTERVAL '2 minutes'
        WHEN v_attempt_count = 3 THEN INTERVAL '10 minutes'
        ELSE INTERVAL '1 hour'  -- Cap at 1 hour
    END;

    UPDATE automation_event_outbox
    SET
        status = CASE
            WHEN v_attempt_count >= v_max_attempts THEN 'dead'
            ELSE 'failed'
        END,
        attempt_count = v_attempt_count,
        next_attempt_at = NOW() + v_next_attempt,
        last_error = p_error,
        last_http_status = p_http_status
    WHERE id = p_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Replay dead events (admin function)
CREATE OR REPLACE FUNCTION replay_dead_events(
    p_workspace_id UUID DEFAULT NULL,
    p_event_type TEXT DEFAULT NULL,
    p_limit INT DEFAULT 100
) RETURNS INT AS $$
DECLARE
    v_count INT;
BEGIN
    UPDATE automation_event_outbox
    SET
        status = 'pending',
        attempt_count = 0,
        next_attempt_at = NOW(),
        last_error = NULL
    WHERE status = 'dead'
      AND (p_workspace_id IS NULL OR agency_workspace_id = p_workspace_id)
      AND (p_event_type IS NULL OR event_type = p_event_type)
      AND id IN (
          SELECT id FROM automation_event_outbox
          WHERE status = 'dead'
            AND (p_workspace_id IS NULL OR agency_workspace_id = p_workspace_id)
            AND (p_event_type IS NULL OR event_type = p_event_type)
          ORDER BY created_at ASC
          LIMIT p_limit
      );

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Cancel pending events (kill switch)
CREATE OR REPLACE FUNCTION cancel_outbox_events(
    p_workspace_id UUID DEFAULT NULL,
    p_event_type TEXT DEFAULT NULL,
    p_reason TEXT DEFAULT 'Manual cancellation'
) RETURNS INT AS $$
DECLARE
    v_count INT;
BEGIN
    UPDATE automation_event_outbox
    SET
        status = 'cancelled',
        cancelled_at = NOW(),
        cancelled_by = auth.uid(),
        cancel_reason = p_reason
    WHERE status IN ('pending', 'failed')
      AND (p_workspace_id IS NULL OR agency_workspace_id = p_workspace_id)
      AND (p_event_type IS NULL OR event_type = p_event_type);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 10. AUTOMATION PLATFORM SETTINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS automation_platform_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Global kill switch
    enabled BOOLEAN NOT NULL DEFAULT TRUE,

    -- Rate limiting
    max_events_per_minute INT NOT NULL DEFAULT 100,
    max_gateway_calls_per_minute INT NOT NULL DEFAULT 50,

    -- Dispatcher settings
    dispatcher_batch_size INT NOT NULL DEFAULT 50,
    dispatcher_interval_seconds INT NOT NULL DEFAULT 15,

    -- Retry settings
    max_retry_attempts INT NOT NULL DEFAULT 10,

    -- Feature flags
    features JSONB NOT NULL DEFAULT '{
        "lead_automations": true,
        "quote_automations": true,
        "policy_automations": true,
        "ticket_automations": true,
        "document_automations": true,
        "renewal_automations": true
    }',

    -- Audit
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id)
);

-- Insert default settings
INSERT INTO automation_platform_settings (id)
VALUES (gen_random_uuid())
ON CONFLICT DO NOTHING;

-- Helper to check if automations are enabled
CREATE OR REPLACE FUNCTION is_automation_enabled(
    p_feature TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_enabled BOOLEAN;
    v_feature_enabled BOOLEAN;
BEGIN
    SELECT enabled,
           COALESCE((features->>p_feature)::BOOLEAN, TRUE)
    INTO v_enabled, v_feature_enabled
    FROM automation_platform_settings
    LIMIT 1;

    RETURN COALESCE(v_enabled AND v_feature_enabled, FALSE);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- ============================================================================
-- 11. GRANT PERMISSIONS
-- ============================================================================

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION enqueue_outbox_event TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_pending_outbox_events TO service_role;
GRANT EXECUTE ON FUNCTION mark_event_delivered TO service_role;
GRANT EXECUTE ON FUNCTION mark_event_failed TO service_role;
GRANT EXECUTE ON FUNCTION replay_dead_events TO service_role;
GRANT EXECUTE ON FUNCTION cancel_outbox_events TO authenticated;
GRANT EXECUTE ON FUNCTION is_automation_enabled TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_account_workspace_id TO authenticated, service_role;


-- ============================================================================
-- DONE
-- ============================================================================
COMMENT ON SCHEMA public IS
'InsureFlow Ops database with automation platform foundation (Phase 1)';
