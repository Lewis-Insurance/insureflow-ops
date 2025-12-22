-- =============================================================================
-- System Settings Table
-- =============================================================================
-- Stores system-wide configuration settings

CREATE TABLE IF NOT EXISTS public.system_settings (
  id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001',
  
  -- Branding
  company_name TEXT DEFAULT 'Lewis Insurance Agency',
  company_logo_url TEXT,
  primary_color TEXT DEFAULT '#6366f1',
  secondary_color TEXT DEFAULT '#8b5cf6',
  
  -- Contact Information
  support_email TEXT,
  support_phone TEXT,
  website_url TEXT,
  
  -- API Key Status (actual keys stored in Supabase secrets)
  openai_api_key_set BOOLEAN DEFAULT FALSE,
  prism_api_key_set BOOLEAN DEFAULT FALSE,
  twilio_api_key_set BOOLEAN DEFAULT FALSE,
  
  -- Feature Flags
  feature_ai_assistant BOOLEAN DEFAULT TRUE,
  feature_prism_ai BOOLEAN DEFAULT TRUE,
  feature_client_intelligence BOOLEAN DEFAULT TRUE,
  feature_document_ocr BOOLEAN DEFAULT TRUE,
  feature_email_composer BOOLEAN DEFAULT TRUE,
  feature_sms_messaging BOOLEAN DEFAULT TRUE,
  feature_call_tracking BOOLEAN DEFAULT TRUE,
  feature_lead_scoring BOOLEAN DEFAULT TRUE,
  feature_quote_ranking BOOLEAN DEFAULT TRUE,
  feature_acord_forms BOOLEAN DEFAULT TRUE,
  feature_customer_portal BOOLEAN DEFAULT TRUE,
  feature_predictive_analytics BOOLEAN DEFAULT TRUE,
  
  -- General Settings
  default_timezone TEXT DEFAULT 'America/Chicago',
  date_format TEXT DEFAULT 'MM/DD/YYYY',
  currency TEXT DEFAULT 'USD',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write system settings
DROP POLICY IF EXISTS "admins_manage_system_settings" ON public.system_settings;
CREATE POLICY "admins_manage_system_settings"
  ON public.system_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'owner')
    )
  );

-- Insert default settings if none exist
INSERT INTO public.system_settings (id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.system_settings IS 'System-wide configuration settings for the agency';

