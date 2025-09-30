-- Enable RLS on remaining table and add policies

-- Enable RLS on insured_profiles
ALTER TABLE public.insured_profiles ENABLE ROW LEVEL SECURITY;

-- Create secure RLS policies for insured_profiles
CREATE POLICY "insured_profiles_select_by_membership" 
ON public.insured_profiles 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.account_id = insured_profiles.account_id 
    AND m.user_id = auth.uid()
  )
);

CREATE POLICY "insured_profiles_write_by_membership" 
ON public.insured_profiles 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.account_id = insured_profiles.account_id 
    AND m.user_id = auth.uid() 
    AND m.role = ANY(ARRAY['owner', 'staff'])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.account_id = insured_profiles.account_id 
    AND m.user_id = auth.uid() 
    AND m.role = ANY(ARRAY['owner', 'staff'])
  )
);

-- Also enable staff access policies for all insured tables
CREATE POLICY "insured_addresses_staff_access" 
ON public.insured_addresses 
FOR ALL 
USING (is_staff())
WITH CHECK (is_staff());

CREATE POLICY "insured_emails_staff_access" 
ON public.insured_emails 
FOR ALL 
USING (is_staff())
WITH CHECK (is_staff());

CREATE POLICY "insured_phones_staff_access" 
ON public.insured_phones 
FOR ALL 
USING (is_staff())
WITH CHECK (is_staff());

CREATE POLICY "insured_profiles_staff_access" 
ON public.insured_profiles 
FOR ALL 
USING (is_staff())
WITH CHECK (is_staff());