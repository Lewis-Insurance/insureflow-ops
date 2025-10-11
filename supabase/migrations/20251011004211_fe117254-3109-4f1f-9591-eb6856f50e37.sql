-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) 
VALUES ('ticket-attachments', 'ticket-attachments', false);

INSERT INTO storage.buckets (id, name, public) 
VALUES ('coi-pdfs', 'coi-pdfs', false);

-- Storage policies for ticket attachments
CREATE POLICY "Staff can upload ticket attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'ticket-attachments' AND
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_staff = true)
);

CREATE POLICY "Staff can view ticket attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'ticket-attachments' AND
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_staff = true)
);

-- Storage policies for COI PDFs
CREATE POLICY "Staff can upload COI PDFs"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'coi-pdfs' AND
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_staff = true)
);

CREATE POLICY "Staff can view COI PDFs"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'coi-pdfs' AND
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_staff = true)
);

CREATE POLICY "Account members can view their COI PDFs"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'coi-pdfs' AND
  EXISTS (
    SELECT 1 FROM public.certificates_of_insurance coi
    JOIN public.account_memberships m ON m.account_id = coi.account_id
    WHERE coi.document_url LIKE '%' || storage.objects.name || '%'
    AND m.user_id = auth.uid()
  )
);

-- RPC function to create ticket with initial message
CREATE OR REPLACE FUNCTION public.create_ticket_with_message(
  p_account_id UUID,
  p_contact_id UUID,
  p_subject TEXT,
  p_description TEXT,
  p_priority TEXT DEFAULT 'medium',
  p_source TEXT DEFAULT 'manual',
  p_content TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_id UUID;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  -- Create ticket
  INSERT INTO public.tickets(
    account_id,
    contact_id,
    subject,
    description,
    priority,
    source,
    status,
    created_by
  ) VALUES (
    p_account_id,
    p_contact_id,
    p_subject,
    p_description,
    p_priority::ticket_priority,
    p_source::ticket_source,
    'open',
    v_user_id
  ) RETURNING id INTO v_ticket_id;
  
  -- Create initial message if content provided
  IF p_content IS NOT NULL THEN
    INSERT INTO public.ticket_messages(
      ticket_id,
      author_id,
      author_type,
      message_type,
      content,
      is_internal
    ) VALUES (
      v_ticket_id,
      v_user_id,
      'agent',
      CASE 
        WHEN p_source = 'email' THEN 'email'
        WHEN p_source = 'phone' THEN 'phone_note'
        ELSE 'comment'
      END,
      p_content,
      false
    );
  END IF;
  
  RETURN v_ticket_id;
END;
$$;

-- Database trigger to auto-generate AI actions on message insert
CREATE OR REPLACE FUNCTION public.trigger_ai_ticket_actions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only trigger for customer messages (not agent or AI)
  IF NEW.author_type = 'customer' THEN
    -- Insert AI action requests
    INSERT INTO public.ticket_actions(ticket_id, action_type, content, metadata)
    VALUES 
      (NEW.ticket_id, 'ai_summary', '', jsonb_build_object('triggered_by', 'auto', 'message_id', NEW.id)),
      (NEW.ticket_id, 'ai_action_item', '', jsonb_build_object('triggered_by', 'auto', 'message_id', NEW.id));
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_ai_on_message_insert
AFTER INSERT ON public.ticket_messages
FOR EACH ROW
EXECUTE FUNCTION public.trigger_ai_ticket_actions();