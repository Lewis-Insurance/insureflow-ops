CREATE OR REPLACE VIEW public.portal_user_policies
WITH (security_invoker = true)
AS
SELECT
  cpu.id AS portal_user_id,
  cpu.auth_user_id,
  cpu.email AS portal_user_email,
  cpu.first_name,
  cpu.last_name,
  p.id AS policy_id,
  p.policy_number,
  p.line_of_business AS policy_type,
  p.line_of_business,
  p.status AS policy_status,
  p.effective_date,
  p.expiration_date,
  p.premium,
  c.name AS carrier_name,
  a.id AS account_id,
  a.name AS account_name
FROM public.client_portal_users cpu
JOIN public.accounts a ON a.id IN (
  SELECT cpu.account_id
  UNION
  SELECT pua.account_id
  FROM public.portal_user_accounts pua
  WHERE pua.portal_user_id = cpu.id
)
JOIN public.policies p ON p.account_id = a.id
LEFT JOIN public.carriers c ON c.id = p.carrier_id
WHERE cpu.portal_status = 'active'
  AND p.status IN ('active', 'pending', 'renewal');

COMMENT ON VIEW public.portal_user_policies IS
  'Owner-FK policies for every account explicitly accessible to one portal user';
GRANT SELECT ON public.portal_user_policies TO authenticated;
