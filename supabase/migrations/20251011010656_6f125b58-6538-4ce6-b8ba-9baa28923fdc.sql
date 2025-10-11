-- Add missing columns to existing tables
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='tickets' AND column_name='requester_id') THEN
    ALTER TABLE public.tickets ADD COLUMN requester_id UUID REFERENCES public.profiles(id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='tickets' AND column_name='assignee_id') THEN
    ALTER TABLE public.tickets ADD COLUMN assignee_id UUID REFERENCES public.profiles(id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='tickets' AND column_name='title') THEN
    ALTER TABLE public.tickets ADD COLUMN title TEXT NOT NULL DEFAULT '';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='tickets' AND column_name='last_activity_at') THEN
    ALTER TABLE public.tickets ADD COLUMN last_activity_at TIMESTAMPTZ DEFAULT now();
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='ticket_messages' AND column_name='email_message_id') THEN
    ALTER TABLE public.ticket_messages ADD COLUMN email_message_id TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='ticket_messages' AND column_name='email_in_reply_to') THEN
    ALTER TABLE public.ticket_messages ADD COLUMN email_in_reply_to TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='ticket_messages' AND column_name='external_sender') THEN
    ALTER TABLE public.ticket_messages ADD COLUMN external_sender TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='ticket_messages' AND column_name='external_recipients') THEN
    ALTER TABLE public.ticket_messages ADD COLUMN external_recipients TEXT[];
  END IF;
END $$;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_ticket_messages_email_msgid ON public.ticket_messages(email_message_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_sender_created ON public.ticket_messages(external_sender, created_at DESC);

-- Create ai_actions table
CREATE TABLE IF NOT EXISTS public.ai_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  source_message_id UUID REFERENCES public.ticket_messages(id),
  action_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  result JSONB,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ai_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_manage_ai_actions" ON public.ai_actions;
CREATE POLICY "staff_manage_ai_actions"
  ON public.ai_actions FOR ALL
  USING (is_staff())
  WITH CHECK (is_staff());

-- Helper RPC (using correct enum values)
CREATE OR REPLACE FUNCTION public.find_recent_ticket_by_sender(p_sender TEXT)
RETURNS public.tickets
LANGUAGE SQL STABLE
SET search_path = public
AS $$
  SELECT t.*
  FROM public.tickets t
  JOIN public.ticket_messages m ON m.ticket_id = t.id
  WHERE m.external_sender = p_sender
    AND t.status IN ('open', 'in_progress')
    AND m.created_at > now() - INTERVAL '48 hours'
  ORDER BY m.created_at DESC
  LIMIT 1;
$$;

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-attachments', 'ticket-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS
DROP POLICY IF EXISTS "staff_upload_attachments" ON storage.objects;
CREATE POLICY "staff_upload_attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'ticket-attachments' AND is_staff());

DROP POLICY IF EXISTS "staff_read_attachments" ON storage.objects;
CREATE POLICY "staff_read_attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ticket-attachments' AND is_staff());

DROP POLICY IF EXISTS "customers_read_own_attachments" ON storage.objects;
CREATE POLICY "customers_read_own_attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ticket-attachments' AND auth.uid() IS NOT NULL);