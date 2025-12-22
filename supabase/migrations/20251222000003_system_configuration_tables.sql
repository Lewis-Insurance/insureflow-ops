-- ============================================================================
-- System Configuration Tables Migration
-- 
-- Creates tables for:
-- 1. Email Provider Settings
-- 2. E-Signature Settings  
-- 3. Automation Settings
-- 4. Message Templates
-- 5. Notification Settings
-- 6. Compliance Settings
-- ============================================================================

-- ============================================================================
-- 1. EMAIL SETTINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_settings (
    id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    -- Provider Selection
    provider TEXT NOT NULL DEFAULT 'none' CHECK (provider IN ('none', 'smtp', 'sendgrid', 'mailgun', 'ses')),
    -- Common Settings
    from_email TEXT NOT NULL DEFAULT '',
    from_name TEXT NOT NULL DEFAULT '',
    reply_to_email TEXT NOT NULL DEFAULT '',
    -- SMTP Settings
    smtp_host TEXT NOT NULL DEFAULT '',
    smtp_port INTEGER NOT NULL DEFAULT 587,
    smtp_username TEXT NOT NULL DEFAULT '',
    smtp_password_set BOOLEAN NOT NULL DEFAULT false,
    smtp_encryption TEXT NOT NULL DEFAULT 'tls' CHECK (smtp_encryption IN ('none', 'tls', 'ssl')),
    -- SendGrid
    sendgrid_api_key_set BOOLEAN NOT NULL DEFAULT false,
    -- Mailgun
    mailgun_api_key_set BOOLEAN NOT NULL DEFAULT false,
    mailgun_domain TEXT NOT NULL DEFAULT '',
    mailgun_region TEXT NOT NULL DEFAULT 'us' CHECK (mailgun_region IN ('us', 'eu')),
    -- Amazon SES
    ses_access_key_set BOOLEAN NOT NULL DEFAULT false,
    ses_region TEXT NOT NULL DEFAULT 'us-east-1',
    -- Status
    is_configured BOOLEAN NOT NULL DEFAULT false,
    last_test_at TIMESTAMPTZ,
    last_test_success BOOLEAN,
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can manage email settings
DROP POLICY IF EXISTS "admins_manage_email_settings" ON public.email_settings;
CREATE POLICY "admins_manage_email_settings" ON public.email_settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() 
            AND p.role::text IN ('admin', 'owner')
        )
    );

-- Insert default row
INSERT INTO public.email_settings (id) 
VALUES ('00000000-0000-0000-0000-000000000001'::uuid)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. E-SIGNATURE SETTINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.esign_settings (
    id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    -- Provider Selection
    provider TEXT NOT NULL DEFAULT 'none' CHECK (provider IN ('none', 'hellosign', 'docusign', 'pandadoc')),
    -- HelloSign
    hellosign_api_key_set BOOLEAN NOT NULL DEFAULT false,
    hellosign_client_id TEXT NOT NULL DEFAULT '',
    -- DocuSign
    docusign_integration_key_set BOOLEAN NOT NULL DEFAULT false,
    docusign_account_id TEXT NOT NULL DEFAULT '',
    docusign_environment TEXT NOT NULL DEFAULT 'sandbox' CHECK (docusign_environment IN ('sandbox', 'production')),
    -- PandaDoc
    pandadoc_api_key_set BOOLEAN NOT NULL DEFAULT false,
    -- Default Settings
    default_reminder_days INTEGER NOT NULL DEFAULT 3,
    default_expiration_days INTEGER NOT NULL DEFAULT 14,
    -- Status
    is_configured BOOLEAN NOT NULL DEFAULT false,
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.esign_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can manage e-signature settings
DROP POLICY IF EXISTS "admins_manage_esign_settings" ON public.esign_settings;
CREATE POLICY "admins_manage_esign_settings" ON public.esign_settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() 
            AND p.role::text IN ('admin', 'owner')
        )
    );

-- Insert default row
INSERT INTO public.esign_settings (id) 
VALUES ('00000000-0000-0000-0000-000000000001'::uuid)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 3. AUTOMATION SETTINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.automation_settings (
    id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    -- Renewal Reminders
    renewal_reminders_enabled BOOLEAN NOT NULL DEFAULT true,
    renewal_reminder_days INTEGER[] NOT NULL DEFAULT ARRAY[90, 60, 30, 14, 7],
    renewal_reminder_template TEXT NOT NULL DEFAULT 'default',
    -- Lead Follow-up
    lead_followup_enabled BOOLEAN NOT NULL DEFAULT true,
    lead_followup_days INTEGER NOT NULL DEFAULT 2,
    -- Quote Follow-up
    quote_followup_enabled BOOLEAN NOT NULL DEFAULT true,
    quote_followup_days INTEGER NOT NULL DEFAULT 3,
    -- Birthday Emails
    birthday_emails_enabled BOOLEAN NOT NULL DEFAULT false,
    birthday_email_template TEXT NOT NULL DEFAULT 'default',
    birthday_send_time TIME NOT NULL DEFAULT '09:00',
    -- Policy Expiration Alerts
    expiration_alerts_enabled BOOLEAN NOT NULL DEFAULT true,
    expiration_alert_days INTEGER[] NOT NULL DEFAULT ARRAY[30, 14, 7, 1],
    -- Claim Updates
    claim_updates_enabled BOOLEAN NOT NULL DEFAULT true,
    claim_status_notifications BOOLEAN NOT NULL DEFAULT true,
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.automation_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can manage automation settings
DROP POLICY IF EXISTS "admins_manage_automation_settings" ON public.automation_settings;
CREATE POLICY "admins_manage_automation_settings" ON public.automation_settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() 
            AND p.role::text IN ('admin', 'owner')
        )
    );

-- Insert default row
INSERT INTO public.automation_settings (id) 
VALUES ('00000000-0000-0000-0000-000000000001'::uuid)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 4. MESSAGE TEMPLATES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Template Info
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('email', 'sms', 'document', 'proposal')),
    category TEXT NOT NULL DEFAULT 'General',
    subject TEXT, -- For email templates
    content TEXT NOT NULL,
    variables TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    -- Ownership
    created_by UUID REFERENCES public.profiles(id),
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_templates_type ON public.message_templates(type);
CREATE INDEX IF NOT EXISTS idx_templates_category ON public.message_templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_active ON public.message_templates(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view active templates
DROP POLICY IF EXISTS "users_view_templates" ON public.message_templates;
CREATE POLICY "users_view_templates" ON public.message_templates
    FOR SELECT USING (
        auth.role() = 'authenticated' AND is_active = true
    );

-- Admins can manage all templates
DROP POLICY IF EXISTS "admins_manage_templates" ON public.message_templates;
CREATE POLICY "admins_manage_templates" ON public.message_templates
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() 
            AND p.role::text IN ('admin', 'owner')
        )
    );

-- Insert default templates
INSERT INTO public.message_templates (name, type, category, subject, content, variables, is_default) VALUES
    ('Welcome Email', 'email', 'Onboarding', 'Welcome to {{company_name}}!', 
     E'Dear {{client_name}},\n\nWelcome to {{company_name}}! We are excited to have you as a client.\n\nYour dedicated agent is {{agent_name}}, and you can reach them at {{agent_email}} or {{agent_phone}}.\n\nBest regards,\n{{company_name}}',
     ARRAY['client_name', 'company_name', 'agent_name', 'agent_email', 'agent_phone'], true),
    ('Renewal Reminder', 'email', 'Renewals', 'Your {{policy_type}} policy renews on {{renewal_date}}',
     E'Dear {{client_name}},\n\nThis is a friendly reminder that your {{policy_type}} policy (Policy #{{policy_number}}) is coming up for renewal on {{renewal_date}}.\n\nYour current premium is {{premium_amount}}. Please contact us to review your coverage options.\n\nBest regards,\n{{agent_name}}',
     ARRAY['client_name', 'policy_type', 'policy_number', 'renewal_date', 'premium_amount', 'agent_name'], true),
    ('Quote Follow-up', 'sms', 'Sales', NULL,
     'Hi {{first_name}}, following up on the quote we sent. Any questions? Reply or call {{agent_phone}}.',
     ARRAY['first_name', 'agent_phone'], true),
    ('Happy Birthday', 'email', 'Client Relations', 'Happy Birthday, {{first_name}}!',
     E'Dear {{first_name}},\n\nWishing you a wonderful birthday filled with joy and happiness!\n\nThank you for being a valued client of {{company_name}}.\n\nBest wishes,\n{{agent_name}}',
     ARRAY['first_name', 'company_name', 'agent_name'], true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5. NOTIFICATION SETTINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notification_settings (
    id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    -- Email Notifications
    email_new_lead BOOLEAN NOT NULL DEFAULT true,
    email_new_quote_request BOOLEAN NOT NULL DEFAULT true,
    email_policy_bound BOOLEAN NOT NULL DEFAULT true,
    email_claim_filed BOOLEAN NOT NULL DEFAULT true,
    email_payment_received BOOLEAN NOT NULL DEFAULT false,
    email_document_uploaded BOOLEAN NOT NULL DEFAULT false,
    email_task_assigned BOOLEAN NOT NULL DEFAULT true,
    email_task_due BOOLEAN NOT NULL DEFAULT true,
    -- In-App Notifications
    inapp_new_lead BOOLEAN NOT NULL DEFAULT true,
    inapp_new_quote_request BOOLEAN NOT NULL DEFAULT true,
    inapp_policy_bound BOOLEAN NOT NULL DEFAULT true,
    inapp_claim_filed BOOLEAN NOT NULL DEFAULT true,
    inapp_payment_received BOOLEAN NOT NULL DEFAULT true,
    inapp_document_uploaded BOOLEAN NOT NULL DEFAULT true,
    inapp_task_assigned BOOLEAN NOT NULL DEFAULT true,
    inapp_task_due BOOLEAN NOT NULL DEFAULT true,
    -- Slack Integration
    slack_enabled BOOLEAN NOT NULL DEFAULT false,
    slack_webhook_url_set BOOLEAN NOT NULL DEFAULT false,
    slack_channel TEXT NOT NULL DEFAULT '#insurance-alerts',
    slack_new_lead BOOLEAN NOT NULL DEFAULT true,
    slack_policy_bound BOOLEAN NOT NULL DEFAULT true,
    slack_claim_filed BOOLEAN NOT NULL DEFAULT true,
    -- Teams Integration
    teams_enabled BOOLEAN NOT NULL DEFAULT false,
    teams_webhook_url_set BOOLEAN NOT NULL DEFAULT false,
    teams_new_lead BOOLEAN NOT NULL DEFAULT true,
    teams_policy_bound BOOLEAN NOT NULL DEFAULT true,
    teams_claim_filed BOOLEAN NOT NULL DEFAULT true,
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can manage notification settings
DROP POLICY IF EXISTS "admins_manage_notification_settings" ON public.notification_settings;
CREATE POLICY "admins_manage_notification_settings" ON public.notification_settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() 
            AND p.role::text IN ('admin', 'owner')
        )
    );

-- Insert default row
INSERT INTO public.notification_settings (id) 
VALUES ('00000000-0000-0000-0000-000000000001'::uuid)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 6. COMPLIANCE SETTINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.compliance_settings (
    id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    -- Data Retention
    retention_policy_enabled BOOLEAN NOT NULL DEFAULT true,
    retention_period_years INTEGER NOT NULL DEFAULT 7,
    retention_deleted_records_days INTEGER NOT NULL DEFAULT 90,
    retention_audit_logs_years INTEGER NOT NULL DEFAULT 5,
    auto_archive_enabled BOOLEAN NOT NULL DEFAULT true,
    -- Audit Logging
    audit_login_events BOOLEAN NOT NULL DEFAULT true,
    audit_data_changes BOOLEAN NOT NULL DEFAULT true,
    audit_document_access BOOLEAN NOT NULL DEFAULT true,
    audit_policy_changes BOOLEAN NOT NULL DEFAULT true,
    audit_exports BOOLEAN NOT NULL DEFAULT true,
    audit_admin_actions BOOLEAN NOT NULL DEFAULT true,
    -- Privacy / GDPR / CCPA
    privacy_consent_required BOOLEAN NOT NULL DEFAULT true,
    privacy_cookie_banner BOOLEAN NOT NULL DEFAULT true,
    privacy_data_export_enabled BOOLEAN NOT NULL DEFAULT true,
    privacy_right_to_delete_enabled BOOLEAN NOT NULL DEFAULT true,
    privacy_marketing_consent_required BOOLEAN NOT NULL DEFAULT true,
    -- E&O Documentation
    eo_require_signed_app BOOLEAN NOT NULL DEFAULT true,
    eo_require_coverage_confirmation BOOLEAN NOT NULL DEFAULT true,
    eo_require_decline_reason BOOLEAN NOT NULL DEFAULT true,
    eo_auto_document_binding BOOLEAN NOT NULL DEFAULT true,
    eo_retention_period_years INTEGER NOT NULL DEFAULT 10,
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.compliance_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can manage compliance settings
DROP POLICY IF EXISTS "admins_manage_compliance_settings" ON public.compliance_settings;
CREATE POLICY "admins_manage_compliance_settings" ON public.compliance_settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() 
            AND p.role::text IN ('admin', 'owner')
        )
    );

-- Insert default row
INSERT INTO public.compliance_settings (id) 
VALUES ('00000000-0000-0000-0000-000000000001'::uuid)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT ALL ON public.email_settings TO authenticated;
GRANT ALL ON public.esign_settings TO authenticated;
GRANT ALL ON public.automation_settings TO authenticated;
GRANT ALL ON public.message_templates TO authenticated;
GRANT ALL ON public.notification_settings TO authenticated;
GRANT ALL ON public.compliance_settings TO authenticated;

