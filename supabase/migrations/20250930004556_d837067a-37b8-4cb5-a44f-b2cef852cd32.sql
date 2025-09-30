-- Replace Security Definer functions with secure regular functions

-- Drop existing security definer functions
DROP FUNCTION IF EXISTS public.get_my_policies();
DROP FUNCTION IF EXISTS public.get_my_claims();
DROP FUNCTION IF EXISTS public.get_policies_with_claims();

-- Create secure replacement functions without SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.get_user_policies_secure()
RETURNS SETOF policies
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT p.* FROM public.policies p
  WHERE EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.account_id = p.account_id 
    AND m.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_claims_secure()
RETURNS SETOF claims
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT c.* FROM public.claims c
  JOIN public.policies p ON c.policy_id = p.id
  WHERE EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.account_id = p.account_id 
    AND m.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.get_policies_claims_secure()
RETURNS TABLE(
  policy_id uuid, 
  policy_number text, 
  carrier text, 
  effective_date date, 
  expiration_date date, 
  premium numeric, 
  account_id uuid,
  claim_id uuid, 
  claim_number text, 
  status claim_status, 
  amount_estimate numeric
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT 
    p.id as policy_id,
    p.policy_number,
    p.carrier,
    p.effective_date,
    p.expiration_date,
    p.premium,
    p.account_id,
    c.id as claim_id,
    c.claim_number,
    c.status,
    c.amount_estimate
  FROM public.policies p
  LEFT JOIN public.claims c ON c.policy_id = p.id
  WHERE EXISTS (
    SELECT 1 FROM public.account_memberships m
    WHERE m.account_id = p.account_id 
    AND m.user_id = auth.uid()
  );
$$;

-- Grant appropriate permissions
GRANT EXECUTE ON FUNCTION public.get_user_policies_secure() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_claims_secure() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_policies_claims_secure() TO authenticated;