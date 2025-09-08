-- Create enums for the insurance domain
CREATE TYPE public.account_type AS ENUM ('household', 'business');
CREATE TYPE public.claim_status AS ENUM ('open', 'closed', 'pending', 'denied');
CREATE TYPE public.user_role AS ENUM ('admin', 'producer', 'csr', 'accounting', 'owner');
CREATE TYPE public.consent_type AS ENUM ('sms', 'voice', 'email');
CREATE TYPE public.consent_method AS ENUM ('verbal', 'web', 'sms_keyword', 'paper');
CREATE TYPE public.sms_direction AS ENUM ('in', 'out');
CREATE TYPE public.task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE public.task_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');
CREATE TYPE public.payment_type AS ENUM ('direct', 'agency');

-- Create accounts table (households/businesses)
CREATE TABLE public.accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL DEFAULT gen_random_uuid(),
  type account_type NOT NULL,
  name TEXT NOT NULL,
  tin_last4 TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create contacts table
CREATE TABLE public.contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  date_of_birth DATE,
  role TEXT, -- insured, driver, owner, officer
  consent_sms BOOLEAN NOT NULL DEFAULT false,
  consent_voice BOOLEAN NOT NULL DEFAULT false,
  consent_sms_at TIMESTAMP WITH TIME ZONE,
  consent_voice_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create carriers table
CREATE TABLE public.carriers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  naic TEXT,
  billing_portal_url TEXT,
  claims_phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create policies table
CREATE TABLE public.policies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  carrier_id UUID REFERENCES public.carriers(id),
  policy_number TEXT NOT NULL,
  line_of_business TEXT NOT NULL,
  effective_date DATE NOT NULL,
  expiration_date DATE NOT NULL,
  premium NUMERIC(10,2),
  payment_type payment_type NOT NULL DEFAULT 'direct',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create claims table
CREATE TABLE public.claims (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
  claim_number TEXT NOT NULL,
  description TEXT,
  loss_date DATE,
  status claim_status NOT NULL DEFAULT 'open',
  amount_estimate NUMERIC(12,2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create call_sessions table for Twilio integration
CREATE TABLE public.call_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL DEFAULT gen_random_uuid(),
  twilio_call_sid TEXT UNIQUE,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  recording_url TEXT,
  consent_played BOOLEAN NOT NULL DEFAULT false,
  disposition TEXT,
  account_id UUID REFERENCES public.accounts(id),
  contact_id UUID REFERENCES public.contacts(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sms_messages table
CREATE TABLE public.sms_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL DEFAULT gen_random_uuid(),
  twilio_message_sid TEXT UNIQUE,
  direction sms_direction NOT NULL,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  body TEXT,
  status TEXT,
  error_code TEXT,
  campaign_id TEXT,
  account_id UUID REFERENCES public.accounts(id),
  contact_id UUID REFERENCES public.contacts(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create consents table
CREATE TABLE public.consents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  type consent_type NOT NULL,
  method consent_method NOT NULL,
  proof_ref TEXT,
  granted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  revoked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create events table (append-only audit log)
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  payload JSONB,
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create tasks table
CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL DEFAULT gen_random_uuid(),
  entity_type TEXT,
  entity_id UUID,
  title TEXT NOT NULL,
  description TEXT,
  assignee_id UUID,
  due_at TIMESTAMP WITH TIME ZONE,
  priority task_priority NOT NULL DEFAULT 'medium',
  status task_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Create documents table
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES public.accounts(id),
  policy_id UUID REFERENCES public.policies(id),
  kind TEXT NOT NULL, -- COI, ACORD, Agreement, etc.
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  pii_level TEXT DEFAULT 'medium', -- low, medium, high
  signature_request_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user profiles table for staff
CREATE TABLE public.user_profiles (
  id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  org_id UUID NOT NULL DEFAULT gen_random_uuid(),
  full_name TEXT,
  role user_role NOT NULL DEFAULT 'csr',
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Helper functions for RLS
CREATE OR REPLACE FUNCTION is_staff()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_profiles 
    WHERE id = auth.uid() AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT org_id FROM public.user_profiles 
    WHERE id = auth.uid() LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies for staff access
CREATE POLICY "Staff can access all org data" ON public.accounts
  FOR ALL TO authenticated
  USING (is_staff() AND org_id = get_user_org_id())
  WITH CHECK (is_staff() AND org_id = get_user_org_id());

CREATE POLICY "Staff can access all org contacts" ON public.contacts
  FOR ALL TO authenticated
  USING (is_staff() AND org_id = get_user_org_id())
  WITH CHECK (is_staff() AND org_id = get_user_org_id());

CREATE POLICY "Staff can access carriers" ON public.carriers
  FOR ALL TO authenticated
  USING (is_staff() AND org_id = get_user_org_id())
  WITH CHECK (is_staff() AND org_id = get_user_org_id());

CREATE POLICY "Staff can access all org policies" ON public.policies
  FOR ALL TO authenticated
  USING (is_staff() AND org_id = get_user_org_id())
  WITH CHECK (is_staff() AND org_id = get_user_org_id());

CREATE POLICY "Staff can access all org claims" ON public.claims
  FOR ALL TO authenticated
  USING (is_staff() AND org_id = get_user_org_id())
  WITH CHECK (is_staff() AND org_id = get_user_org_id());

CREATE POLICY "Staff can access call sessions" ON public.call_sessions
  FOR ALL TO authenticated
  USING (is_staff() AND org_id = get_user_org_id())
  WITH CHECK (is_staff() AND org_id = get_user_org_id());

CREATE POLICY "Staff can access sms messages" ON public.sms_messages
  FOR ALL TO authenticated
  USING (is_staff() AND org_id = get_user_org_id())
  WITH CHECK (is_staff() AND org_id = get_user_org_id());

CREATE POLICY "Staff can access consents" ON public.consents
  FOR ALL TO authenticated
  USING (is_staff() AND org_id = get_user_org_id())
  WITH CHECK (is_staff() AND org_id = get_user_org_id());

CREATE POLICY "Staff can access events" ON public.events
  FOR ALL TO authenticated
  USING (is_staff() AND org_id = get_user_org_id())
  WITH CHECK (is_staff() AND org_id = get_user_org_id());

CREATE POLICY "Staff can access tasks" ON public.tasks
  FOR ALL TO authenticated
  USING (is_staff() AND org_id = get_user_org_id())
  WITH CHECK (is_staff() AND org_id = get_user_org_id());

CREATE POLICY "Staff can access documents" ON public.documents
  FOR ALL TO authenticated
  USING (is_staff() AND org_id = get_user_org_id())
  WITH CHECK (is_staff() AND org_id = get_user_org_id());

CREATE POLICY "Users can view their own profile" ON public.user_profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can update their own profile" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Create trigger function for updated_at timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_accounts_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_policies_updated_at
  BEFORE UPDATE ON public.policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'csr')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create some sample carriers
INSERT INTO public.carriers (name, naic) VALUES 
('State Farm', '25178'),
('Allstate', '19232'),
('Progressive', '24260'),
('GEICO', '22055'),
('Travelers', '25674');