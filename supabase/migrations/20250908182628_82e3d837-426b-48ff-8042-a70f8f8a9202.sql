-- Comprehensive Insurance CRM Data Model Migration (Fixed)

-- Create ENUMs (with checks for existing types)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_type_new') THEN
        CREATE TYPE public.account_type_new AS ENUM ('individual', 'business', 'household');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gender_type') THEN
        CREATE TYPE public.gender_type AS ENUM ('male', 'female', 'other', 'prefer_not_to_say');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'marital_status_type') THEN
        CREATE TYPE public.marital_status_type AS ENUM ('single', 'married', 'divorced', 'widowed', 'separated');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'business_type_enum') THEN
        CREATE TYPE public.business_type_enum AS ENUM ('corporation', 'llc', 'partnership', 'sole_proprietorship', 'nonprofit', 'other');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'line_of_business') THEN
        CREATE TYPE public.line_of_business AS ENUM ('auto', 'home', 'renters', 'umbrella', 'life', 'health', 'commercial_auto', 'bop', 'gl', 'workers_comp', 'property', 'other');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_frequency') THEN
        CREATE TYPE public.billing_frequency AS ENUM ('monthly', 'quarterly', 'semiannual', 'annual');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_method') THEN
        CREATE TYPE public.billing_method AS ENUM ('direct_bill', 'agency_bill');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quote_status') THEN
        CREATE TYPE public.quote_status AS ENUM ('open', 'won', 'lost', 'expired');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'communication_type') THEN
        CREATE TYPE public.communication_type AS ENUM ('email', 'sms', 'call', 'meeting', 'note');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'communication_direction') THEN
        CREATE TYPE public.communication_direction AS ENUM ('inbound', 'outbound');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'consent_type_crm') THEN
        CREATE TYPE public.consent_type_crm AS ENUM ('marketing_opt_in', 'recording_consent', 'sms_consent', 'email_consent');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'consent_method_crm') THEN
        CREATE TYPE public.consent_method_crm AS ENUM ('verbal', 'written', 'checkbox');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_category') THEN
        CREATE TYPE public.document_category AS ENUM ('id', 'proof_of_address', 'dec_page', 'quote', 'claim', 'other');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_status') THEN
        CREATE TYPE public.invoice_status AS ENUM ('open', 'paid', 'overdue', 'void');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method_crm') THEN
        CREATE TYPE public.payment_method_crm AS ENUM ('cash', 'check', 'credit_card', 'debit_card', 'ach', 'wire', 'other');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_role') THEN
        CREATE TYPE public.agent_role AS ENUM ('staff', 'admin', 'producer');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_status') THEN
        CREATE TYPE public.account_status AS ENUM ('lead', 'active', 'churned');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'preferred_contact_method') THEN
        CREATE TYPE public.preferred_contact_method AS ENUM ('email', 'phone', 'sms', 'mail');
    END IF;
END $$;

-- Enable pgcrypto extension for encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Update existing contacts table to match new schema
ALTER TABLE public.contacts 
ADD COLUMN IF NOT EXISTS middle_name text,
ADD COLUMN IF NOT EXISTS date_of_birth date,
ADD COLUMN IF NOT EXISTS gender gender_type,
ADD COLUMN IF NOT EXISTS marital_status marital_status_type,
ADD COLUMN IF NOT EXISTS ssn_encrypted text, -- Will store encrypted SSN
ADD COLUMN IF NOT EXISTS ssn_last4 text,
ADD COLUMN IF NOT EXISTS email_primary text,
ADD COLUMN IF NOT EXISTS email_other text[],
ADD COLUMN IF NOT EXISTS phone_mobile text,
ADD COLUMN IF NOT EXISTS phone_home text,
ADD COLUMN IF NOT EXISTS phone_work text,
ADD COLUMN IF NOT EXISTS address_residential jsonb,
ADD COLUMN IF NOT EXISTS address_mailing jsonb,
ADD COLUMN IF NOT EXISTS preferred_contact_method preferred_contact_method,
ADD COLUMN IF NOT EXISTS best_call_time text,
ADD COLUMN IF NOT EXISTS lead_score numeric,
ADD COLUMN IF NOT EXISTS risk_score numeric,
ADD COLUMN IF NOT EXISTS renewal_probability numeric,
ADD COLUMN IF NOT EXISTS created_by uuid,
ADD COLUMN IF NOT EXISTS updated_by uuid,
ADD COLUMN IF NOT EXISTS tags text[];

-- Create index on ssn_last4 for fast lookups
CREATE INDEX IF NOT EXISTS idx_contacts_ssn_last4 ON public.contacts (ssn_last4);
CREATE INDEX IF NOT EXISTS idx_contacts_email_primary ON public.contacts (email_primary);
CREATE INDEX IF NOT EXISTS idx_contacts_phone_mobile ON public.contacts (phone_mobile);

-- Create businesses table
CREATE TABLE IF NOT EXISTS public.businesses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_name text NOT NULL,
    dba text,
    ein text,
    naics_code text,
    business_type business_type_enum,
    address_legal jsonb,
    address_mailing jsonb,
    years_in_business integer,
    num_employees integer,
    annual_revenue numeric,
    primary_contact_id uuid REFERENCES public.contacts(id),
    phones jsonb,
    emails jsonb,
    website text,
    risk_score numeric,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    tags text[]
);

-- Update accounts table to match new schema (handle existing type column)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'accounts' AND column_name = 'type') THEN
        ALTER TABLE public.accounts RENAME COLUMN type TO type_old;
    END IF;
END $$;

ALTER TABLE public.accounts 
ADD COLUMN IF NOT EXISTS account_type account_type_new DEFAULT 'individual',
ADD COLUMN IF NOT EXISTS contact_id uuid,
ADD COLUMN IF NOT EXISTS business_id uuid,
ADD COLUMN IF NOT EXISTS owner_agent_id uuid,
ADD COLUMN IF NOT EXISTS team_id uuid,
ADD COLUMN IF NOT EXISTS account_status account_status DEFAULT 'lead',
ADD COLUMN IF NOT EXISTS lead_source_detail text,
ADD COLUMN IF NOT EXISTS notes text,
ADD COLUMN IF NOT EXISTS custom jsonb DEFAULT '{}';

-- Add foreign key constraints
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE constraint_name = 'accounts_contact_id_fkey') THEN
        ALTER TABLE public.accounts ADD CONSTRAINT accounts_contact_id_fkey 
        FOREIGN KEY (contact_id) REFERENCES public.contacts(id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE constraint_name = 'accounts_business_id_fkey') THEN
        ALTER TABLE public.accounts ADD CONSTRAINT accounts_business_id_fkey 
        FOREIGN KEY (business_id) REFERENCES public.businesses(id);
    END IF;
END $$;

-- Update policies table to match new schema
ALTER TABLE public.policies
ADD COLUMN IF NOT EXISTS line_of_business line_of_business,
ADD COLUMN IF NOT EXISTS coverage jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS billing_frequency billing_frequency,
ADD COLUMN IF NOT EXISTS billing_method billing_method,
ADD COLUMN IF NOT EXISTS insured_items jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS custom jsonb DEFAULT '{}';

-- Create quotes table
CREATE TABLE IF NOT EXISTS public.quotes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES public.accounts(id),
    carrier_id uuid REFERENCES public.carriers(id),
    quote_ref text,
    line_of_business line_of_business NOT NULL,
    options jsonb DEFAULT '[]',
    quoted_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone,
    status quote_status DEFAULT 'open',
    competitor_carrier text,
    reason_win text,
    reason_loss text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    created_by uuid,
    updated_by uuid
);

-- Update claims table to match new schema
ALTER TABLE public.claims
ADD COLUMN IF NOT EXISTS date_of_loss date,
ADD COLUMN IF NOT EXISTS type_of_loss text,
ADD COLUMN IF NOT EXISTS reported_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS adjuster_name text,
ADD COLUMN IF NOT EXISTS adjuster_contact text,
ADD COLUMN IF NOT EXISTS amount_claimed numeric,
ADD COLUMN IF NOT EXISTS amount_paid numeric,
ADD COLUMN IF NOT EXISTS settlement_date date,
ADD COLUMN IF NOT EXISTS documents jsonb DEFAULT '[]',
ADD COLUMN IF NOT EXISTS notes text;

-- Update carriers table to match new schema
ALTER TABLE public.carriers
ADD COLUMN IF NOT EXISTS contact_info jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS portals jsonb DEFAULT '{}';

-- Create communications table
CREATE TABLE IF NOT EXISTS public.communications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid REFERENCES public.accounts(id),
    type communication_type NOT NULL,
    direction communication_direction,
    subject text,
    body text,
    meta jsonb DEFAULT '{}', -- call recording URL, duration, sms id, email headers
    occurred_at timestamp with time zone DEFAULT now(),
    agent_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone
);

-- Update existing tasks table
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS account_id uuid,
ADD COLUMN IF NOT EXISTS assignee_agent_id uuid;

-- Add foreign key for tasks account_id
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE constraint_name = 'tasks_account_id_fkey') THEN
        ALTER TABLE public.tasks ADD CONSTRAINT tasks_account_id_fkey 
        FOREIGN KEY (account_id) REFERENCES public.accounts(id);
    END IF;
END $$;

-- Create new consents table (rename existing if it exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables 
               WHERE table_name = 'consents' AND table_schema = 'public') THEN
        DROP TABLE IF EXISTS public.consents CASCADE;
    END IF;
END $$;

CREATE TABLE public.consents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES public.accounts(id),
    type consent_type_crm NOT NULL,
    granted boolean DEFAULT false,
    method consent_method_crm,
    evidence_url text,
    captured_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone
);

-- Update documents table to match new schema
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS name text,
ADD COLUMN IF NOT EXISTS category document_category,
ADD COLUMN IF NOT EXISTS size_bytes bigint,
ADD COLUMN IF NOT EXISTS sha256 text,
ADD COLUMN IF NOT EXISTS uploaded_by uuid,
ADD COLUMN IF NOT EXISTS uploaded_at timestamp with time zone DEFAULT now();

-- Create invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id uuid REFERENCES public.policies(id),
    account_id uuid NOT NULL REFERENCES public.accounts(id),
    invoice_number text UNIQUE NOT NULL,
    amount numeric NOT NULL,
    due_at timestamp with time zone,
    status invoice_status DEFAULT 'open',
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    created_by uuid,
    updated_by uuid
);

-- Create payments table
CREATE TABLE IF NOT EXISTS public.payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id uuid NOT NULL REFERENCES public.invoices(id),
    amount numeric NOT NULL,
    paid_at timestamp with time zone DEFAULT now(),
    method payment_method_crm,
    processor_ref text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    created_by uuid,
    updated_by uuid
);

-- Create agents table
CREATE TABLE IF NOT EXISTS public.agents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    email text UNIQUE NOT NULL,
    phone text,
    role agent_role DEFAULT 'staff',
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone
);

-- Create enhanced audit_logs table
CREATE TABLE IF NOT EXISTS public.enhanced_audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name text NOT NULL,
    row_id uuid NOT NULL,
    action text NOT NULL,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now(),
    diff jsonb,
    actor_role text,
    created_at timestamp with time zone DEFAULT now()
);

-- Create indexes for performance
-- Trigram indexes for search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_contacts_last_name_trgm ON public.contacts USING gin (last_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_accounts_name_trgm ON public.accounts USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_businesses_legal_name_trgm ON public.businesses USING gin (legal_name gin_trgm_ops);

-- GIN indexes on JSONB fields
CREATE INDEX IF NOT EXISTS idx_policies_coverage ON public.policies USING gin (coverage);
CREATE INDEX IF NOT EXISTS idx_policies_insured_items ON public.policies USING gin (insured_items);
CREATE INDEX IF NOT EXISTS idx_accounts_custom ON public.accounts USING gin (custom);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_quotes_account_id ON public.quotes (account_id);
CREATE INDEX IF NOT EXISTS idx_communications_account_id ON public.communications (account_id);
CREATE INDEX IF NOT EXISTS idx_invoices_account_id ON public.invoices (account_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON public.payments (invoice_id);

-- Enable RLS on all new tables
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enhanced_audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for staff full control
CREATE POLICY "Staff can access businesses" ON public.businesses
    FOR ALL USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can access quotes" ON public.quotes
    FOR ALL USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can access communications" ON public.communications
    FOR ALL USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can access consents" ON public.consents
    FOR ALL USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can access invoices" ON public.invoices
    FOR ALL USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can access payments" ON public.payments
    FOR ALL USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can access agents" ON public.agents
    FOR ALL USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Admins can access enhanced audit logs" ON public.enhanced_audit_logs
    FOR SELECT USING (is_admin(auth.uid()));