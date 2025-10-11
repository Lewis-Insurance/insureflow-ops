-- Create enum types for tickets
CREATE TYPE ticket_status AS ENUM ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed');
CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE ticket_source AS ENUM ('email', 'phone', 'manual', 'web_form', 'chat');
CREATE TYPE ticket_action_type AS ENUM ('ai_summary', 'ai_action_item', 'ai_draft_response', 'manual_note', 'status_change');

-- Tickets table
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT UNIQUE NOT NULL,
  account_id UUID REFERENCES public.accounts(id) NOT NULL,
  contact_id UUID REFERENCES public.contacts(id),
  assigned_to UUID REFERENCES auth.users(id),
  status ticket_status NOT NULL DEFAULT 'open',
  priority ticket_priority NOT NULL DEFAULT 'medium',
  source ticket_source NOT NULL DEFAULT 'manual',
  subject TEXT NOT NULL,
  description TEXT,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  resolution TEXT,
  search_vector TSVECTOR
);

-- Ticket messages table for conversation history
CREATE TABLE public.ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE NOT NULL,
  author_id UUID REFERENCES auth.users(id),
  author_type TEXT NOT NULL DEFAULT 'agent', -- 'agent', 'customer', 'system', 'ai'
  message_type TEXT NOT NULL DEFAULT 'comment', -- 'comment', 'email', 'phone_note', 'internal_note'
  content TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  is_internal BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AI-generated actions and summaries
CREATE TABLE public.ticket_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE NOT NULL,
  action_type ticket_action_type NOT NULL,
  content TEXT NOT NULL,
  is_approved BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Certificates of Insurance table
CREATE TABLE public.certificates_of_insurance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES public.accounts(id) NOT NULL,
  policy_id UUID REFERENCES public.policies(id),
  ticket_id UUID REFERENCES public.tickets(id),
  certificate_number TEXT UNIQUE NOT NULL,
  certificate_holder_name TEXT NOT NULL,
  certificate_holder_address JSONB,
  effective_date DATE NOT NULL,
  expiration_date DATE NOT NULL,
  coverage_details JSONB NOT NULL,
  additional_insureds JSONB DEFAULT '[]',
  special_provisions TEXT,
  document_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'pending_review', 'approved', 'sent'
  ai_generated BOOLEAN DEFAULT false,
  generated_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_tickets_account_id ON public.tickets(account_id);
CREATE INDEX idx_tickets_assigned_to ON public.tickets(assigned_to);
CREATE INDEX idx_tickets_status ON public.tickets(status);
CREATE INDEX idx_tickets_priority ON public.tickets(priority);
CREATE INDEX idx_tickets_created_at ON public.tickets(created_at DESC);
CREATE INDEX idx_tickets_search_vector ON public.tickets USING gin(search_vector);

CREATE INDEX idx_ticket_messages_ticket_id ON public.ticket_messages(ticket_id);
CREATE INDEX idx_ticket_messages_created_at ON public.ticket_messages(created_at);

CREATE INDEX idx_ticket_actions_ticket_id ON public.ticket_actions(ticket_id);
CREATE INDEX idx_ticket_actions_approved ON public.ticket_actions(is_approved);

CREATE INDEX idx_coi_account_id ON public.certificates_of_insurance(account_id);
CREATE INDEX idx_coi_policy_id ON public.certificates_of_insurance(policy_id);
CREATE INDEX idx_coi_status ON public.certificates_of_insurance(status);

-- Enable RLS
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates_of_insurance ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tickets
CREATE POLICY "Users can view tickets for their accounts"
  ON public.tickets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships m
      WHERE m.account_id = tickets.account_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can create tickets"
  ON public.tickets FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_memberships m
      WHERE m.account_id = tickets.account_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'staff')
    )
  );

CREATE POLICY "Staff can update tickets"
  ON public.tickets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships m
      WHERE m.account_id = tickets.account_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'staff')
    )
  );

-- RLS Policies for ticket_messages
CREATE POLICY "Users can view messages for accessible tickets"
  ON public.ticket_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      JOIN public.account_memberships m ON m.account_id = t.account_id
      WHERE t.id = ticket_messages.ticket_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can create messages"
  ON public.ticket_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tickets t
      JOIN public.account_memberships m ON m.account_id = t.account_id
      WHERE t.id = ticket_messages.ticket_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'staff')
    )
  );

-- RLS Policies for ticket_actions
CREATE POLICY "Users can view ticket actions"
  ON public.ticket_actions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      JOIN public.account_memberships m ON m.account_id = t.account_id
      WHERE t.id = ticket_actions.ticket_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can manage ticket actions"
  ON public.ticket_actions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      JOIN public.account_memberships m ON m.account_id = t.account_id
      WHERE t.id = ticket_actions.ticket_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'staff')
    )
  );

-- RLS Policies for certificates_of_insurance
CREATE POLICY "Users can view COIs for their accounts"
  ON public.certificates_of_insurance FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships m
      WHERE m.account_id = certificates_of_insurance.account_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Staff can manage COIs"
  ON public.certificates_of_insurance FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships m
      WHERE m.account_id = certificates_of_insurance.account_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'staff')
    )
  );

-- Function to generate ticket numbers
CREATE OR REPLACE FUNCTION public.generate_ticket_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  new_number TEXT;
  exists_check BOOLEAN;
BEGIN
  LOOP
    new_number := 'TKT-' || LPAD(floor(random() * 999999)::text, 6, '0');
    SELECT EXISTS(SELECT 1 FROM public.tickets WHERE ticket_number = new_number) INTO exists_check;
    EXIT WHEN NOT exists_check;
  END LOOP;
  RETURN new_number;
END;
$$;

-- Function to generate COI numbers
CREATE OR REPLACE FUNCTION public.generate_coi_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  new_number TEXT;
  exists_check BOOLEAN;
BEGIN
  LOOP
    new_number := 'COI-' || TO_CHAR(now(), 'YYYY') || '-' || LPAD(floor(random() * 99999)::text, 5, '0');
    SELECT EXISTS(SELECT 1 FROM public.certificates_of_insurance WHERE certificate_number = new_number) INTO exists_check;
    EXIT WHEN NOT exists_check;
  END LOOP;
  RETURN new_number;
END;
$$;

-- Trigger to set ticket number
CREATE OR REPLACE FUNCTION public.set_ticket_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.ticket_number IS NULL THEN
    NEW.ticket_number := public.generate_ticket_number();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_ticket_number_trigger
BEFORE INSERT ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION public.set_ticket_number();

-- Trigger to set COI number
CREATE OR REPLACE FUNCTION public.set_coi_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.certificate_number IS NULL THEN
    NEW.certificate_number := public.generate_coi_number();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_coi_number_trigger
BEFORE INSERT ON public.certificates_of_insurance
FOR EACH ROW
EXECUTE FUNCTION public.set_coi_number();

-- Trigger to update tickets updated_at
CREATE TRIGGER update_tickets_updated_at
BEFORE UPDATE ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Trigger to update search vector
CREATE OR REPLACE FUNCTION public.tickets_search_vector_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', COALESCE(NEW.ticket_number, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.subject, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.description, '')), 'B');
  RETURN NEW;
END;
$$;

CREATE TRIGGER tickets_search_vector_trigger
BEFORE INSERT OR UPDATE ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION public.tickets_search_vector_update();