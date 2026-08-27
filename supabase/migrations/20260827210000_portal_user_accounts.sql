-- Cluster Invite PR 1: one portal login can access multiple accounts.

CREATE TABLE public.portal_user_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_user_id uuid NOT NULL REFERENCES public.client_portal_users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  is_home boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_user_accounts_portal_user_account_key UNIQUE (portal_user_id, account_id)
);

CREATE UNIQUE INDEX portal_user_accounts_one_home_idx
  ON public.portal_user_accounts (portal_user_id)
  WHERE is_home;

CREATE INDEX portal_user_accounts_account_idx
  ON public.portal_user_accounts (account_id);

ALTER TABLE public.portal_invitations
  ADD COLUMN scope_account_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

CREATE OR REPLACE FUNCTION public.guard_portal_user_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_home_account_id uuid;
  v_home_workspace_id uuid;
  v_scope_workspace_id uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND (NEW.portal_user_id IS DISTINCT FROM OLD.portal_user_id
          OR NEW.account_id IS DISTINCT FROM OLD.account_id) THEN
    RAISE EXCEPTION 'Portal user account identity is immutable' USING ERRCODE = '23514';
  END IF;

  SELECT cpu.account_id, home.agency_workspace_id
  INTO v_home_account_id, v_home_workspace_id
  FROM public.client_portal_users cpu
  JOIN public.accounts home ON home.id = cpu.account_id
  WHERE cpu.id = NEW.portal_user_id;

  SELECT a.agency_workspace_id
  INTO v_scope_workspace_id
  FROM public.accounts a
  WHERE a.id = NEW.account_id;

  IF v_home_account_id IS NULL OR v_scope_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Portal user or account not found' USING ERRCODE = '23503';
  END IF;

  IF v_scope_workspace_id IS DISTINCT FROM v_home_workspace_id THEN
    RAISE EXCEPTION 'Portal account must be in the home account workspace' USING ERRCODE = '23514';
  END IF;

  IF (NEW.account_id = v_home_account_id) IS DISTINCT FROM NEW.is_home THEN
    RAISE EXCEPTION 'Home junction must exactly match client_portal_users.account_id' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_portal_user_account_row
BEFORE INSERT OR UPDATE ON public.portal_user_accounts
FOR EACH ROW EXECUTE FUNCTION public.guard_portal_user_account();

REVOKE ALL ON FUNCTION public.guard_portal_user_account() FROM PUBLIC, anon;

-- Catalog-only backfill. Do not walk account relationships or add cluster siblings.
INSERT INTO public.portal_user_accounts (portal_user_id, account_id, is_home)
SELECT cpu.id, cpu.account_id, true
FROM public.client_portal_users cpu
ON CONFLICT (portal_user_id, account_id) DO UPDATE
SET is_home = true;

ALTER TABLE public.portal_user_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY portal_user_accounts_select
ON public.portal_user_accounts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.client_portal_users cpu
    WHERE cpu.id = portal_user_accounts.portal_user_id
      AND cpu.auth_user_id = auth.uid()
      AND cpu.portal_status = 'active'
  )
  OR (
    public.is_staff()
    AND EXISTS (
      SELECT 1
      FROM public.accounts a
      JOIN public.agency_workspace_memberships awm
        ON awm.agency_workspace_id = a.agency_workspace_id
      WHERE a.id = portal_user_accounts.account_id
        AND awm.user_id = auth.uid()
        AND awm.status = 'active'
    )
  )
);

CREATE POLICY portal_user_accounts_staff_insert
ON public.portal_user_accounts
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_staff()
  AND EXISTS (
    SELECT 1
    FROM public.client_portal_users cpu
    JOIN public.accounts home ON home.id = cpu.account_id
    JOIN public.agency_workspace_memberships awm
      ON awm.agency_workspace_id = home.agency_workspace_id
    WHERE cpu.id = portal_user_accounts.portal_user_id
      AND awm.user_id = auth.uid()
      AND awm.status = 'active'
      AND awm.role IN ('owner', 'admin', 'producer', 'csr')
  )
);

CREATE POLICY portal_user_accounts_staff_delete
ON public.portal_user_accounts
FOR DELETE
TO authenticated
USING (
  NOT is_home
  AND
  public.is_staff()
  AND EXISTS (
    SELECT 1
    FROM public.client_portal_users cpu
    JOIN public.accounts home ON home.id = cpu.account_id
    JOIN public.agency_workspace_memberships awm
      ON awm.agency_workspace_id = home.agency_workspace_id
    WHERE cpu.id = portal_user_accounts.portal_user_id
      AND awm.user_id = auth.uid()
      AND awm.status = 'active'
      AND awm.role IN ('owner', 'admin', 'producer', 'csr')
  )
);

REVOKE ALL ON TABLE public.portal_user_accounts FROM anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.portal_user_accounts TO authenticated;
GRANT ALL ON TABLE public.portal_user_accounts TO service_role;

CREATE OR REPLACE FUNCTION public.portal_accessible_account_ids()
RETURNS TABLE(account_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cpu.account_id
  FROM public.client_portal_users cpu
  WHERE cpu.auth_user_id = auth.uid()
    AND cpu.portal_status = 'active'

  UNION

  SELECT pua.account_id
  FROM public.portal_user_accounts pua
  JOIN public.client_portal_users cpu ON cpu.id = pua.portal_user_id
  WHERE cpu.auth_user_id = auth.uid()
    AND cpu.portal_status = 'active'

  UNION

  SELECT cpu2.account_id
  FROM public.portal_household_members phm
  JOIN public.client_portal_users cpu2 ON cpu2.id = phm.primary_user_id
  WHERE phm.auth_user_id = auth.uid()
    AND phm.status = 'active'
    AND cpu2.portal_status = 'active';
$$;

REVOKE ALL ON FUNCTION public.portal_accessible_account_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_accessible_account_ids() TO authenticated, service_role;

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

CREATE OR REPLACE FUNCTION public.list_portal_invite_cluster(p_account_id uuid)
RETURNS TABLE(
  account_id uuid,
  name text,
  node_role text,
  is_business boolean,
  default_selected boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Staff access required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.accounts a
    JOIN public.agency_workspace_memberships awm
      ON awm.agency_workspace_id = a.agency_workspace_id
    WHERE a.id = p_account_id
      AND awm.user_id = auth.uid()
      AND awm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Account workspace access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    cluster.account_id,
    cluster.name,
    cluster.node_role,
    cluster.is_business,
    (
      cluster.account_id = p_account_id
      OR (
        cluster.is_business
        AND cluster.node_role IN ('parent_company', 'affiliated_business', 'owned_business', 'owns')
      )
    ) AS default_selected
  FROM public.get_account_cluster(p_account_id) cluster
  JOIN public.accounts cluster_account ON cluster_account.id = cluster.account_id
  JOIN public.accounts origin_account ON origin_account.id = p_account_id
  WHERE cluster.node_role <> 'same_as'
    AND cluster_account.agency_workspace_id = origin_account.agency_workspace_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_portal_user_account(
  p_portal_user_id uuid,
  p_account_id uuid
)
RETURNS public.portal_user_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_portal_user public.client_portal_users%ROWTYPE;
  v_home_workspace_id uuid;
  v_scope_workspace_id uuid;
  v_result public.portal_user_accounts%ROWTYPE;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Staff access required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_portal_user
  FROM public.client_portal_users
  WHERE id = p_portal_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Portal user not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT agency_workspace_id INTO v_home_workspace_id
  FROM public.accounts WHERE id = v_portal_user.account_id;
  SELECT agency_workspace_id INTO v_scope_workspace_id
  FROM public.accounts WHERE id = p_account_id;

  IF v_scope_workspace_id IS NULL
     OR v_scope_workspace_id IS DISTINCT FROM v_home_workspace_id THEN
    RAISE EXCEPTION 'Account is outside the portal home workspace' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.agency_workspace_memberships awm
    WHERE awm.agency_workspace_id = v_home_workspace_id
      AND awm.user_id = auth.uid()
      AND awm.status = 'active'
      AND awm.role IN ('owner', 'admin', 'producer', 'csr')
  ) THEN
    RAISE EXCEPTION 'Portal write role required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.get_account_cluster(v_portal_user.account_id) cluster
    WHERE cluster.account_id = p_account_id
  ) THEN
    RAISE EXCEPTION 'Account is outside the portal home cluster' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.portal_user_accounts (
    portal_user_id, account_id, is_home, created_by
  ) VALUES (
    p_portal_user_id,
    p_account_id,
    p_account_id = v_portal_user.account_id,
    auth.uid()
  )
  ON CONFLICT (portal_user_id, account_id) DO UPDATE
  SET is_home = EXCLUDED.is_home
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_portal_user_account(
  p_portal_user_id uuid,
  p_account_id uuid,
  p_replace_home_account_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_portal_user public.client_portal_users%ROWTYPE;
  v_home_workspace_id uuid;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Staff access required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_portal_user
  FROM public.client_portal_users
  WHERE id = p_portal_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Portal user not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT agency_workspace_id INTO v_home_workspace_id
  FROM public.accounts WHERE id = v_portal_user.account_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.agency_workspace_memberships awm
    WHERE awm.agency_workspace_id = v_home_workspace_id
      AND awm.user_id = auth.uid()
      AND awm.status = 'active'
      AND awm.role IN ('owner', 'admin', 'producer', 'csr')
  ) THEN
    RAISE EXCEPTION 'Portal write role required' USING ERRCODE = '42501';
  END IF;

  IF (SELECT count(*) FROM public.portal_user_accounts WHERE portal_user_id = p_portal_user_id) <= 1 THEN
    RAISE EXCEPTION 'Cannot remove the last portal account' USING ERRCODE = '23514';
  END IF;

  IF p_account_id = v_portal_user.account_id THEN
    IF p_replace_home_account_id IS NULL
       OR p_replace_home_account_id = p_account_id THEN
      RAISE EXCEPTION 'Removing the home account requires an explicit replacement' USING ERRCODE = '23514';
    END IF;

    PERFORM 1
    FROM public.portal_user_accounts pua
    JOIN public.accounts a ON a.id = pua.account_id
    WHERE pua.portal_user_id = p_portal_user_id
      AND pua.account_id = p_replace_home_account_id
      AND a.agency_workspace_id = v_home_workspace_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Replacement home must already be an accessible account in the same workspace' USING ERRCODE = '23514';
    END IF;

    UPDATE public.client_portal_users
    SET account_id = p_replace_home_account_id
    WHERE id = p_portal_user_id;

    UPDATE public.portal_user_accounts
    SET is_home = false
    WHERE portal_user_id = p_portal_user_id
      AND account_id = p_account_id;

    UPDATE public.portal_user_accounts
    SET is_home = true
    WHERE portal_user_id = p_portal_user_id
      AND account_id = p_replace_home_account_id;
  END IF;

  DELETE FROM public.portal_user_accounts
  WHERE portal_user_id = p_portal_user_id
    AND account_id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Portal account access not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.list_portal_invite_cluster(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_portal_user_account(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_portal_user_account(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_portal_invite_cluster(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_portal_user_account(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_portal_user_account(uuid, uuid, uuid) TO authenticated, service_role;

COMMENT ON COLUMN public.portal_invitations.scope_account_ids IS
  'PR 2 accept path must write these accounts plus home to portal_user_accounts after auth_user_id is set';

-- ROLLBACK SQL - run only as an intentional reverse migration:
-- DROP FUNCTION IF EXISTS public.remove_portal_user_account(uuid, uuid, uuid);
-- DROP FUNCTION IF EXISTS public.add_portal_user_account(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.list_portal_invite_cluster(uuid);
-- DROP VIEW IF EXISTS public.portal_user_policies;
-- CREATE OR REPLACE FUNCTION public.portal_accessible_account_ids()
-- RETURNS TABLE(account_id uuid)
-- LANGUAGE sql
-- STABLE
-- SECURITY DEFINER
-- SET search_path = public
-- AS $rollback$
--   SELECT cpu.account_id
--   FROM public.client_portal_users cpu
--   WHERE cpu.auth_user_id = auth.uid()
--     AND cpu.portal_status = 'active'
--   UNION
--   SELECT cpu2.account_id
--   FROM public.portal_household_members phm
--   JOIN public.client_portal_users cpu2 ON cpu2.id = phm.primary_user_id
--   WHERE phm.auth_user_id = auth.uid()
--     AND phm.status = 'active'
--     AND cpu2.portal_status = 'active';
-- $rollback$;
-- REVOKE ALL ON FUNCTION public.portal_accessible_account_ids() FROM PUBLIC, anon, authenticated, service_role;
-- GRANT EXECUTE ON FUNCTION public.portal_accessible_account_ids() TO authenticated;
-- DROP TABLE IF EXISTS public.portal_user_accounts;
-- DROP FUNCTION IF EXISTS public.guard_portal_user_account();
-- ALTER TABLE public.portal_invitations DROP COLUMN IF EXISTS scope_account_ids;
-- CREATE OR REPLACE VIEW public.portal_user_policies
-- WITH (security_invoker = true)
-- AS
-- SELECT
--   cpu.id AS portal_user_id,
--   cpu.auth_user_id,
--   cpu.email AS portal_user_email,
--   cpu.first_name,
--   cpu.last_name,
--   p.id AS policy_id,
--   p.policy_number,
--   p.line_of_business AS policy_type,
--   p.line_of_business,
--   p.status AS policy_status,
--   p.effective_date,
--   p.expiration_date,
--   p.premium,
--   c.name AS carrier_name,
--   a.id AS account_id,
--   a.name AS account_name
-- FROM public.client_portal_users cpu
-- JOIN public.accounts a ON a.id = cpu.account_id
-- JOIN public.policies p ON p.account_id = a.id
-- LEFT JOIN public.carriers c ON c.id = p.carrier_id
-- WHERE cpu.portal_status = 'active'
--   AND p.status IN ('active', 'pending', 'renewal');
-- GRANT SELECT ON public.portal_user_policies TO authenticated;
