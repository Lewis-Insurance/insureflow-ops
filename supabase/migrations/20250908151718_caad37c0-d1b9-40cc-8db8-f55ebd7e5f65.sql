-- Twilio Integration Tables

-- 1) Call sessions table (update existing or create)
-- First check if columns exist and add missing ones
DO $$ 
BEGIN
  -- Add missing columns to existing call_sessions table
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_sessions' AND column_name = 'direction') THEN
    ALTER TABLE public.call_sessions ADD COLUMN direction text CHECK (direction IN ('inbound','outbound')) NOT NULL DEFAULT 'inbound';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_sessions' AND column_name = 'status') THEN
    ALTER TABLE public.call_sessions ADD COLUMN status text DEFAULT 'ringing';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_sessions' AND column_name = 'metadata') THEN
    ALTER TABLE public.call_sessions ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- 2) Update SMS messages table with missing columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sms_messages' AND column_name = 'direction') THEN
    ALTER TABLE public.sms_messages ADD COLUMN direction text CHECK (direction IN ('inbound','outbound')) NOT NULL DEFAULT 'inbound';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sms_messages' AND column_name = 'body') THEN
    ALTER TABLE public.sms_messages ADD COLUMN body text NOT NULL DEFAULT '';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sms_messages' AND column_name = 'received_at') THEN
    ALTER TABLE public.sms_messages ADD COLUMN received_at timestamptz DEFAULT now();
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sms_messages' AND column_name = 'metadata') THEN
    ALTER TABLE public.sms_messages ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- 3) Create new consents table for compliance
CREATE TABLE IF NOT EXISTS public.consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  channel text CHECK (channel IN ('sms','voice','email','data')) NOT NULL,
  method text CHECK (method IN ('keyword','verbal','written','webform')) NOT NULL,
  event text CHECK (event IN ('consent_granted','consent_revoked')) NOT NULL,
  source text,             -- e.g. 'twilio-inbound', 'ivr-prompt', 'web-form'
  ref text,                -- e.g. Twilio SID, request id
  ip_address inet,
  user_agent text,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- 4) Create carriers table for telephony management
CREATE TABLE IF NOT EXISTS public.carriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  naic text,
  contact_phone text,
  contact_email text,
  billing_portal_url text,
  claims_phone text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 5) Create telephony settings table for admin dashboard
CREATE TABLE IF NOT EXISTS public.telephony_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  twilio_phone_number text NOT NULL,
  forward_number text NOT NULL,
  recording_enabled boolean DEFAULT false,
  webhook_status text DEFAULT 'unknown',
  last_webhook_error text,
  last_error_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 6) Enable RLS on new tables
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telephony_settings ENABLE ROW LEVEL SECURITY;

-- 7) Create RLS policies for telephony tables
CREATE POLICY "Staff can read call sessions" ON public.call_sessions
FOR SELECT USING (is_staff(auth.uid()));

CREATE POLICY "Staff can manage call sessions" ON public.call_sessions
FOR ALL USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can read SMS messages" ON public.sms_messages
FOR SELECT USING (is_staff(auth.uid()));

CREATE POLICY "Staff can manage SMS messages" ON public.sms_messages
FOR ALL USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can read consents" ON public.consents
FOR SELECT USING (is_staff(auth.uid()));

CREATE POLICY "Staff can create consents" ON public.consents
FOR INSERT WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Admin can manage telephony settings" ON public.telephony_settings
FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Staff can read telephony settings" ON public.telephony_settings
FOR SELECT USING (is_staff(auth.uid()));

-- 8) Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_call_sessions_account_id ON public.call_sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_twilio_sid ON public.call_sessions(twilio_call_sid);
CREATE INDEX IF NOT EXISTS idx_call_sessions_started_at ON public.call_sessions(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_sms_messages_account_id ON public.sms_messages(account_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_twilio_sid ON public.sms_messages(twilio_message_sid);
CREATE INDEX IF NOT EXISTS idx_sms_messages_received_at ON public.sms_messages(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_consents_account_id ON public.consents(account_id);
CREATE INDEX IF NOT EXISTS idx_consents_contact_id ON public.consents(contact_id);
CREATE INDEX IF NOT EXISTS idx_consents_channel_event ON public.consents(channel, event);

-- 9) Create view for account timeline events (union CRM events + call/SMS)
CREATE OR REPLACE VIEW public.v_account_timeline_events AS
SELECT 
  e.id,
  'event' as event_type,
  e.type as title,
  e.payload->>'description' as description,
  e.entity_id as account_id,
  NULL as contact_id,
  e.occurred_at as timestamp,
  e.payload as metadata
FROM public.events e
WHERE e.entity_type = 'account'

UNION ALL

SELECT 
  cs.id,
  'call' as event_type,
  CASE 
    WHEN cs.direction = 'inbound' THEN 'Inbound Call'
    ELSE 'Outbound Call'
  END as title,
  'Call from ' || cs.from_number || ' to ' || cs.to_number as description,
  cs.account_id,
  cs.contact_id,
  cs.started_at as timestamp,
  jsonb_build_object(
    'direction', cs.direction,
    'status', cs.status,
    'duration_seconds', cs.duration_seconds,
    'recording_url', cs.recording_url,
    'twilio_sid', cs.twilio_call_sid
  ) as metadata
FROM public.call_sessions cs

UNION ALL

SELECT 
  sm.id,
  'sms' as event_type,
  CASE 
    WHEN sm.direction = 'inbound' THEN 'Inbound SMS'
    ELSE 'Outbound SMS'
  END as title,
  COALESCE(sm.body, 'SMS message') as description,
  sm.account_id,
  sm.contact_id,
  sm.created_at as timestamp,
  jsonb_build_object(
    'direction', sm.direction,
    'status', sm.status,
    'body', sm.body,
    'twilio_sid', sm.twilio_message_sid
  ) as metadata
FROM public.sms_messages sm

ORDER BY timestamp DESC;

-- 10) Create function to check SMS consent status
CREATE OR REPLACE FUNCTION public.check_sms_consent(target_contact_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_consent boolean := false;
BEGIN
  -- Check if contact has active SMS consent (latest event should be consent_granted)
  SELECT 
    CASE WHEN c.event = 'consent_granted' THEN true ELSE false END
  INTO has_consent
  FROM public.consents c
  WHERE c.contact_id = target_contact_id 
    AND c.channel = 'sms'
  ORDER BY c.created_at DESC
  LIMIT 1;
  
  RETURN COALESCE(has_consent, false);
END;
$$;