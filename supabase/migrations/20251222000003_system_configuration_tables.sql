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
    provider TEXT NOT NULL DEFAULT 'none',
    from_email TEXT NOT NULL DEFAULT '',
    from_name TEXT NOT NULL DEFAULT '',
    reply_to_email TEXT NOT NULL DEFAULT '',
    smtp_host TEXT NOT NULL DEFAULT '',
    smtp_port INTEGER NOT NULL DEFAULT 587,
    smtp_username TEXT NOT NULL DEFAULT '',
    smtp_password_set BOOLEAN NOT NULL DEFAULT false,
    smtp_encryption TEXT NOT NULL DEFAULT 'tls',
    sendgrid_api_key_set BOOLEAN NOT NULL DEFAULT false,
    mailgun_api_key_set BOOLEAN NOT NULL DEFAULT false,
    mailgun_domain TEXT NOT NULL DEFAULT '',
    mailgun_region TEXT NOT NULL DEFAULT 'us',
    ses_access_key_set BOOLEAN NOT NULL DEFAULT false,
    ses_region TEXT NOT NULL DEFAULT 'us-east-1',
    is_configured BOOLEAN NOT NULL DEFAULT false,
    last_test_at TIMESTAMPTZ,
    last_test_success BOOLEAN,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_manage_email_settings" ON public.email_settings;
CREATE POLICY "admins_manage_email_settings" ON public.email_settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() 
            AND (p.role IS NULL OR p.role::text IN ('admin', 'owner', 'agent'))
        )
    );

INSERT INTO public.email_settings (id) 
VALUES ('00000000-0000-0000-0000-000000000001'::uuid)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. E-SIGNATURE SETTINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.esign_settings (
    id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    provider TEXT NOT NULL DEFAULT 'none',
    hellosign_api_key_set BOOLEAN NOT NULL DEFAULT false,
    hellosign_client_id TEXT NOT NULL DEFAULT '',
    docusign_integration_key_set BOOLEAN NOT NULL DEFAULT false,
    docusign_account_id TEXT NOT NULL DEFAULT '',
    docusign_environment TEXT NOT NULL DEFAULT 'sandbox',
    pandadoc_api_key_set BOOLEAN NOT NULL DEFAULT false,
    default_reminder_days INTEGER NOT NULL DEFAULT 3,
    default_expiration_days INTEGER NOT NULL DEFAULT 14,
    is_configured BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.esign_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_manage_esign_settings" ON public.esign_settings;
CREATE POLICY "admins_manage_esign_settings" ON public.esign_settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() 
            AND (p.role IS NULL OR p.role::text IN ('admin', 'owner', 'agent'))
        )
    );

INSERT INTO public.esign_settings (id) 
VALUES ('00000000-0000-0000-0000-000000000001'::uuid)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 3. AUTOMATION SETTINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.automation_settings (
    id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    renewal_reminders_enabled BOOLEAN NOT NULL DEFAULT true,
    renewal_reminder_days INTEGER[] NOT NULL DEFAULT ARRAY[90, 60, 30, 14, 7],
    renewal_reminder_template TEXT NOT NULL DEFAULT 'default',
    lead_followup_enabled BOOLEAN NOT NULL DEFAULT true,
    lead_followup_days INTEGER NOT NULL DEFAULT 2,
    quote_followup_enabled BOOLEAN NOT NULL DEFAULT true,
    quote_followup_days INTEGER NOT NULL DEFAULT 3,
    birthday_emails_enabled BOOLEAN NOT NULL DEFAULT false,
    birthday_email_template TEXT NOT NULL DEFAULT 'default',
    birthday_send_time TIME NOT NULL DEFAULT '09:00',
    expiration_alerts_enabled BOOLEAN NOT NULL DEFAULT true,
    expiration_alert_days INTEGER[] NOT NULL DEFAULT ARRAY[30, 14, 7, 1],
    claim_updates_enabled BOOLEAN NOT NULL DEFAULT true,
    claim_status_notifications BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.automation_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_manage_automation_settings" ON public.automation_settings;
CREATE POLICY "admins_manage_automation_settings" ON public.automation_settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() 
            AND (p.role IS NULL OR p.role::text IN ('admin', 'owner', 'agent'))
        )
    );

INSERT INTO public.automation_settings (id) 
VALUES ('00000000-0000-0000-0000-000000000001'::uuid)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 4. MESSAGE TEMPLATES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.message_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    template_type TEXT NOT NULL DEFAULT 'email',
    category TEXT NOT NULL DEFAULT 'General',
    subject TEXT,
    content TEXT NOT NULL DEFAULT '',
    variables TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_template_type ON public.message_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_templates_category ON public.message_templates(category);

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_view_templates" ON public.message_templates;
CREATE POLICY "users_view_templates" ON public.message_templates
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "admins_manage_templates" ON public.message_templates;
CREATE POLICY "admins_manage_templates" ON public.message_templates
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() 
            AND (p.role IS NULL OR p.role::text IN ('admin', 'owner', 'agent'))
        )
    );

-- Insert default templates
INSERT INTO public.message_templates (name, template_type, category, subject, content, variables, is_default) VALUES
    ('Welcome Email', 'email', 'Onboarding', 'Welcome to {{company_name}}!', 
     E'Dear {{client_name}},\n\nWelcome to {{company_name}}! We are excited to have you as a client.\n\nBest regards,\n{{company_name}}',
     ARRAY['client_name', 'company_name', 'agent_name'], true),
    ('Renewal Reminder', 'email', 'Renewals', 'Your policy renews on {{renewal_date}}',
     E'Dear {{client_name}},\n\nYour policy is coming up for renewal on {{renewal_date}}.\n\nBest regards,\n{{agent_name}}',
     ARRAY['client_name', 'renewal_date', 'agent_name'], true),
    ('Quote Follow-up', 'sms', 'Sales', NULL,
     'Hi {{first_name}}, following up on the quote we sent. Any questions? Call {{agent_phone}}.',
     ARRAY['first_name', 'agent_phone'], true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5. NOTIFICATION SETTINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notification_settings (
    id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    email_new_lead BOOLEAN NOT NULL DEFAULT true,
    email_new_quote_request BOOLEAN NOT NULL DEFAULT true,
    email_policy_bound BOOLEAN NOT NULL DEFAULT true,
    email_claim_filed BOOLEAN NOT NULL DEFAULT true,
    email_payment_received BOOLEAN NOT NULL DEFAULT false,
    email_document_uploaded BOOLEAN NOT NULL DEFAULT false,
    email_task_assigned BOOLEAN NOT NULL DEFAULT true,
    email_task_due BOOLEAN NOT NULL DEFAULT true,
    inapp_new_lead BOOLEAN NOT NULL DEFAULT true,
    inapp_new_quote_request BOOLEAN NOT NULL DEFAULT true,
    inapp_policy_bound BOOLEAN NOT NULL DEFAULT true,
    inapp_claim_filed BOOLEAN NOT NULL DEFAULT true,
    inapp_payment_received BOOLEAN NOT NULL DEFAULT true,
    inapp_document_uploaded BOOLEAN NOT NULL DEFAULT true,
    inapp_task_assigned BOOLEAN NOT NULL DEFAULT true,
    inapp_task_due BOOLEAN NOT NULL DEFAULT true,
    slack_enabled BOOLEAN NOT NULL DEFAULT false,
    slack_webhook_url_set BOOLEAN NOT NULL DEFAULT false,
    slack_channel TEXT NOT NULL DEFAULT '#insurance-alerts',
    slack_new_lead BOOLEAN NOT NULL DEFAULT true,
    slack_policy_bound BOOLEAN NOT NULL DEFAULT true,
    slack_claim_filed BOOLEAN NOT NULL DEFAULT true,
    teams_enabled BOOLEAN NOT NULL DEFAULT false,
    teams_webhook_url_set BOOLEAN NOT NULL DEFAULT false,
    teams_new_lead BOOLEAN NOT NULL DEFAULT true,
    teams_policy_bound BOOLEAN NOT NULL DEFAULT true,
    teams_claim_filed BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_manage_notification_settings" ON public.notification_settings;
CREATE POLICY "admins_manage_notification_settings" ON public.notification_settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() 
            AND (p.role IS NULL OR p.role::text IN ('admin', 'owner', 'agent'))
        )
    );

INSERT INTO public.notification_settings (id) 
VALUES ('00000000-0000-0000-0000-000000000001'::uuid)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 6. COMPLIANCE SETTINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.compliance_settings (
    id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    retention_policy_enabled BOOLEAN NOT NULL DEFAULT true,
    retention_period_years INTEGER NOT NULL DEFAULT 7,
    retention_deleted_records_days INTEGER NOT NULL DEFAULT 90,
    retention_audit_logs_years INTEGER NOT NULL DEFAULT 5,
    auto_archive_enabled BOOLEAN NOT NULL DEFAULT true,
    audit_login_events BOOLEAN NOT NULL DEFAULT true,
    audit_data_changes BOOLEAN NOT NULL DEFAULT true,
    audit_document_access BOOLEAN NOT NULL DEFAULT true,
    audit_policy_changes BOOLEAN NOT NULL DEFAULT true,
    audit_exports BOOLEAN NOT NULL DEFAULT true,
    audit_admin_actions BOOLEAN NOT NULL DEFAULT true,
    privacy_consent_required BOOLEAN NOT NULL DEFAULT true,
    privacy_cookie_banner BOOLEAN NOT NULL DEFAULT true,
    privacy_data_export_enabled BOOLEAN NOT NULL DEFAULT true,
    privacy_right_to_delete_enabled BOOLEAN NOT NULL DEFAULT true,
    privacy_marketing_consent_required BOOLEAN NOT NULL DEFAULT true,
    eo_require_signed_app BOOLEAN NOT NULL DEFAULT true,
    eo_require_coverage_confirmation BOOLEAN NOT NULL DEFAULT true,
    eo_require_decline_reason BOOLEAN NOT NULL DEFAULT true,
    eo_auto_document_binding BOOLEAN NOT NULL DEFAULT true,
    eo_retention_period_years INTEGER NOT NULL DEFAULT 10,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.compliance_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_manage_compliance_settings" ON public.compliance_settings;
CREATE POLICY "admins_manage_compliance_settings" ON public.compliance_settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() 
            AND (p.role IS NULL OR p.role::text IN ('admin', 'owner', 'agent'))
        )
    );

INSERT INTO public.compliance_settings (id) 
VALUES ('00000000-0000-0000-0000-000000000001'::uuid)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 7. BACKUP SETTINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.backup_settings (
    id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    auto_backup_enabled BOOLEAN NOT NULL DEFAULT false,
    backup_frequency TEXT NOT NULL DEFAULT 'weekly',
    backup_time TIME NOT NULL DEFAULT '02:00',
    backup_day_of_week INTEGER NOT NULL DEFAULT 0,
    backup_day_of_month INTEGER NOT NULL DEFAULT 1,
    backup_retention_days INTEGER NOT NULL DEFAULT 30,
    backup_format TEXT NOT NULL DEFAULT 'json',
    include_documents BOOLEAN NOT NULL DEFAULT false,
    notification_email TEXT NOT NULL DEFAULT '',
    last_backup_at TIMESTAMPTZ,
    last_backup_status TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.backup_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_manage_backup_settings" ON public.backup_settings;
CREATE POLICY "admins_manage_backup_settings" ON public.backup_settings
    FOR ALL USING (auth.role() = 'authenticated');

INSERT INTO public.backup_settings (id) 
VALUES ('00000000-0000-0000-0000-000000000001'::uuid)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 8. EXPORT HISTORY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.export_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    export_type TEXT NOT NULL DEFAULT 'manual',
    format TEXT NOT NULL DEFAULT 'csv',
    tables_exported TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    record_count INTEGER NOT NULL DEFAULT 0,
    file_size_mb NUMERIC(10,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'in_progress',
    download_url TEXT,
    error_message TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.export_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_manage_export_history" ON public.export_history;
CREATE POLICY "users_manage_export_history" ON public.export_history
    FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT ALL ON public.email_settings TO authenticated;
GRANT ALL ON public.esign_settings TO authenticated;
GRANT ALL ON public.automation_settings TO authenticated;
GRANT ALL ON public.message_templates TO authenticated;
GRANT ALL ON public.notification_settings TO authenticated;
GRANT ALL ON public.compliance_settings TO authenticated;
GRANT ALL ON public.backup_settings TO authenticated;
GRANT ALL ON public.export_history TO authenticated;
