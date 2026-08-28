CREATE OR REPLACE FUNCTION public.list_my_portal_policies(p_account_id uuid)
RETURNS TABLE (
  id uuid,
  account_id uuid,
  membership text,
  owner_account_id uuid,
  owner_account_name text,
  policy_number text,
  line_of_business text,
  status text,
  premium numeric,
  effective_date date,
  expiration_date date,
  named_insured text,
  carrier_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_account_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.portal_accessible_account_ids() accessible
    WHERE accessible.account_id = p_account_id
  ) THEN
    RAISE EXCEPTION 'Account is not accessible to this portal user'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.account_id,
    'owner'::text AS membership,
    owner_account.id AS owner_account_id,
    owner_account.name AS owner_account_name,
    p.policy_number,
    p.line_of_business,
    p.status::text,
    p.premium,
    p.effective_date,
    p.expiration_date,
    p.named_insured,
    c.name AS carrier_name
  FROM public.policies p
  JOIN public.accounts owner_account ON owner_account.id = p.account_id
  LEFT JOIN public.carriers c ON c.id = p.carrier_id
  WHERE p.account_id = p_account_id
    AND p.deleted_at IS NULL
    AND p.account_id IN (
      SELECT accessible.account_id
      FROM public.portal_accessible_account_ids() accessible
    )

  UNION ALL

  SELECT
    p.id,
    p.account_id,
    'named_insured'::text AS membership,
    owner_account.id AS owner_account_id,
    owner_account.name AS owner_account_name,
    p.policy_number,
    p.line_of_business,
    p.status::text,
    p.premium,
    p.effective_date,
    p.expiration_date,
    p.named_insured,
    c.name AS carrier_name
  FROM public.policy_named_insureds pni
  JOIN public.policies p ON p.id = pni.policy_id
  JOIN public.accounts owner_account ON owner_account.id = p.account_id
  LEFT JOIN public.carriers c ON c.id = p.carrier_id
  WHERE pni.account_id = p_account_id
    AND p.deleted_at IS NULL
    AND pni.account_id IN (
      SELECT accessible.account_id
      FROM public.portal_accessible_account_ids() accessible
    );
END;
$$;

REVOKE ALL ON FUNCTION public.list_my_portal_policies(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_portal_policies(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_my_portal_accounts()
RETURNS TABLE (
  account_id uuid,
  name text,
  is_home boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH accessible_accounts AS (
    SELECT accessible.account_id
    FROM public.portal_accessible_account_ids() accessible
  ),
  home_accounts AS (
    SELECT cpu.account_id
    FROM public.client_portal_users cpu
    WHERE cpu.auth_user_id = auth.uid()
      AND cpu.portal_status = 'active'

    UNION

    SELECT cpu2.account_id
    FROM public.portal_household_members phm
    JOIN public.client_portal_users cpu2 ON cpu2.id = phm.primary_user_id
    WHERE phm.auth_user_id = auth.uid()
      AND phm.status = 'active'
      AND cpu2.portal_status = 'active'
  )
  SELECT
    a.id AS account_id,
    a.name,
    EXISTS (
      SELECT 1
      FROM home_accounts home
      WHERE home.account_id = a.id
    ) AS is_home
  FROM accessible_accounts accessible
  JOIN public.accounts a ON a.id = accessible.account_id
  WHERE a.deleted_at IS NULL
  ORDER BY is_home DESC, a.name, a.id;
$$;

REVOKE ALL ON FUNCTION public.list_my_portal_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_portal_accounts() TO authenticated;
