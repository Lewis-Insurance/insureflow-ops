-- Add email threading columns to ticket_messages
ALTER TABLE public.ticket_messages 
  ADD COLUMN IF NOT EXISTS email_message_id TEXT,
  ADD COLUMN IF NOT EXISTS email_in_reply_to TEXT,
  ADD COLUMN IF NOT EXISTS external_sender TEXT,
  ADD COLUMN IF NOT EXISTS external_recipients TEXT[];

-- Create indexes for email threading
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

-- === Helper RPC for email threading (using correct enum values) ===
CREATE OR REPLACE FUNCTION public.find_recent_ticket_by_sender(p_sender TEXT)
RETURNS public.tickets
LANGUAGE SQL STABLE
SET search_path = public
AS $$
  SELECT t.*
  FROM public.tickets t
  JOIN public.ticket_messages m ON m.ticket_id = t.id
  WHERE m.external_sender = p_sender
    AND t.status IN ('open','in_progress','waiting_customer')
    AND m.created_at > now() - INTERVAL '48 hours'
  ORDER BY m.created_at DESC
  LIMIT 1;
$$;

-- === Storage Bucket ===
INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-attachments', 'ticket-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- === Storage RLS Policies ===
DROP POLICY IF EXISTS "staff_upload_attachments" ON storage.objects;
CREATE POLICY "staff_upload_attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'ticket-attachments' AND
    is_staff()
  );

DROP POLICY IF EXISTS "staff_read_attachments" ON storage.objects;
CREATE POLICY "staff_read_attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'ticket-attachments' AND
    is_staff()
  );

DROP POLICY IF EXISTS "customers_read_own_attachments" ON storage.objects;
CREATE POLICY "customers_read_own_attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'ticket-attachments' AND
    auth.uid() IS NOT NULL
  );