-- Fix Security Issues: Enable RLS for insured tables and add proper policies

-- Enable RLS on insured tables that are currently exposed
ALTER TABLE public.insured_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insured_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insured_phones ENABLE ROW LEVEL SECURITY;

-- Create secure RLS policies for insured_addresses
CREATE POLICY "insured_addresses_select_by_membership" 
ON public.insured_addresses 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.account_id = insured_addresses.account_id 
    AND m.user_id = auth.uid()
  )
);

CREATE POLICY "insured_addresses_write_by_membership" 
ON public.insured_addresses 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.account_id = insured_addresses.account_id 
    AND m.user_id = auth.uid() 
    AND m.role = ANY(ARRAY['owner', 'staff'])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.account_id = insured_addresses.account_id 
    AND m.user_id = auth.uid() 
    AND m.role = ANY(ARRAY['owner', 'staff'])
  )
);

-- Create secure RLS policies for insured_emails
CREATE POLICY "insured_emails_select_by_membership" 
ON public.insured_emails 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.account_id = insured_emails.account_id 
    AND m.user_id = auth.uid()
  )
);

CREATE POLICY "insured_emails_write_by_membership" 
ON public.insured_emails 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.account_id = insured_emails.account_id 
    AND m.user_id = auth.uid() 
    AND m.role = ANY(ARRAY['owner', 'staff'])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.account_id = insured_emails.account_id 
    AND m.user_id = auth.uid() 
    AND m.role = ANY(ARRAY['owner', 'staff'])
  )
);

-- Create secure RLS policies for insured_phones
CREATE POLICY "insured_phones_select_by_membership" 
ON public.insured_phones 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.account_id = insured_phones.account_id 
    AND m.user_id = auth.uid()
  )
);

CREATE POLICY "insured_phones_write_by_membership" 
ON public.insured_phones 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.account_id = insured_phones.account_id 
    AND m.user_id = auth.uid() 
    AND m.role = ANY(ARRAY['owner', 'staff'])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.account_id = insured_phones.account_id 
    AND m.user_id = auth.uid() 
    AND m.role = ANY(ARRAY['owner', 'staff'])
  )
);