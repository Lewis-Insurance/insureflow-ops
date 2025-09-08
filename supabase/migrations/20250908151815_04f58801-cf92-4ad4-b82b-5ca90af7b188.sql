-- Twilio Integration Tables (Fixed)

-- 1) Update call_sessions table with missing columns
ALTER TABLE public.call_sessions 
ADD COLUMN IF NOT EXISTS direction text CHECK (direction IN ('inbound','outbound')) DEFAULT 'inbound',
ADD COLUMN IF NOT EXISTS status text DEFAULT 'ringing',
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- 2) Update sms_messages table with missing columns  
ALTER TABLE public.sms_messages
ADD COLUMN IF NOT EXISTS direction text CHECK (direction IN ('inbound','outbound')) DEFAULT 'inbound',
ADD COLUMN IF NOT EXISTS received_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- 3) Create new consents table for compliance
CREATE TABLE IF NOT EXISTS public.consents_new (
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

-- 4) Create telephony settings table for admin dashboard
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

-- 5) Enable RLS on new tables
ALTER TABLE public.consents_new ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telephony_settings ENABLE ROW LEVEL SECURITY;

-- 6) Create RLS policies for telephony tables
CREATE POLICY "Staff can read consents_new" ON public.consents_new
FOR SELECT USING (is_staff(auth.uid()));

CREATE POLICY "Staff can create consents_new" ON public.consents_new
FOR INSERT WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Admin can manage telephony settings" ON public.telephony_settings
FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Staff can read telephony settings" ON public.telephony_settings
FOR SELECT USING (is_staff(auth.uid()));

-- 7) Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_call_sessions_started_at ON public.call_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_messages_created_at ON public.sms_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consents_new_account_id ON public.consents_new(account_id);
CREATE INDEX IF NOT EXISTS idx_consents_new_contact_id ON public.consents_new(contact_id);
CREATE INDEX IF NOT EXISTS idx_consents_new_channel_event ON public.consents_new(channel, event);

-- 8) Create view for account timeline events (union CRM events + call/SMS)
CREATE OR REPLACE VIEW public.v_account_timeline_events AS
SELECT 
  e.id,
  'event' as event_type,
  e.type as title,
  e.payload->>'description' as description,
  e.entity_id::uuid as account_id,
  NULL::uuid as contact_id,
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
WHERE cs.account_id IS NOT NULL

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
WHERE sm.account_id IS NOT NULL

ORDER BY timestamp DESC;

-- 9) Create function to check SMS consent status
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
  FROM public.consents_new c
  WHERE c.contact_id = target_contact_id 
    AND c.channel = 'sms'
  ORDER BY c.created_at DESC
  LIMIT 1;
  
  RETURN COALESCE(has_consent, false);
END;
$$;