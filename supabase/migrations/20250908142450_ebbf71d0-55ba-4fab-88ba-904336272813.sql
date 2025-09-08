-- Fix security definer views by creating proper functions

-- Replace security definer views with safe functions
CREATE OR REPLACE FUNCTION public.get_my_policies()
RETURNS SETOF policies
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM policies 
  WHERE insured_user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_claims()
RETURNS SETOF claims
LANGUAGE sql  
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.* FROM claims c
  JOIN policies p ON c.policy_id = p.id
  WHERE p.insured_user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_policies_with_claims()
RETURNS TABLE (
  policy_id uuid,
  policy_number text,
  carrier text,
  effective_date date,
  expiration_date date,
  premium numeric,
  insured_user_id uuid,
  claim_id uuid,
  claim_number text,
  status claim_status,
  amount_estimate numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER  
SET search_path = public
AS $$
  SELECT 
    p.id as policy_id,
    p.policy_number,
    p.carrier,
    p.effective_date,
    p.expiration_date, 
    p.premium,
    p.insured_user_id,
    c.id as claim_id,
    c.claim_number,
    c.status,
    c.amount_estimate
  FROM policies p
  LEFT JOIN claims c ON c.policy_id = p.id
  WHERE (is_staff(auth.uid()) OR p.insured_user_id = auth.uid());
$$;

-- Grant execute permissions to authenticated users only
REVOKE ALL ON FUNCTION public.get_my_policies() FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_policies() TO authenticated;

REVOKE ALL ON FUNCTION public.get_my_claims() FROM public;  
GRANT EXECUTE ON FUNCTION public.get_my_claims() TO authenticated;

REVOKE ALL ON FUNCTION public.get_policies_with_claims() FROM public;
GRANT EXECUTE ON FUNCTION public.get_policies_with_claims() TO authenticated;