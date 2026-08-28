CREATE OR REPLACE FUNCTION public.accept_portal_invitation(p_invitation_id uuid)
RETURNS public.client_portal_users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_auth_email text;
  v_invitation public.portal_invitations%ROWTYPE;
  v_portal_user public.client_portal_users%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Portal invitation cannot be accepted' USING ERRCODE = '42501';
  END IF;

  SELECT email
  INTO v_auth_email
  FROM auth.users
  WHERE id = v_auth_user_id;

  SELECT *
  INTO v_invitation
  FROM public.portal_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_invitation.status NOT IN ('pending', 'sent', 'clicked', 'registered')
    OR v_invitation.expires_at IS NULL
    OR v_invitation.expires_at <= v_now
    OR lower(btrim(v_invitation.email::text)) IS DISTINCT FROM lower(btrim(v_auth_email)) THEN
    RAISE EXCEPTION 'Portal invitation cannot be accepted' USING ERRCODE = 'P0001';
  END IF;

  IF v_invitation.portal_user_id IS NULL THEN
    RAISE EXCEPTION 'Portal invitation cannot be accepted' USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_portal_user
  FROM public.client_portal_users
  WHERE id = v_invitation.portal_user_id
  FOR UPDATE;

  IF NOT FOUND
    OR lower(btrim(v_portal_user.email::text)) IS DISTINCT FROM lower(btrim(v_auth_email))
    OR v_portal_user.portal_status = 'disabled'
    OR (v_portal_user.auth_user_id IS NOT NULL AND v_portal_user.auth_user_id <> v_auth_user_id) THEN
    RAISE EXCEPTION 'Portal invitation cannot be accepted' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.client_portal_users
  SET auth_user_id = v_auth_user_id,
      portal_status = 'active',
      email_verified = true,
      first_login_at = COALESCE(first_login_at, v_now),
      last_login_at = v_now,
      login_count = COALESCE(login_count, 0) + CASE WHEN auth_user_id IS NULL THEN 1 ELSE 0 END,
      updated_at = v_now
  WHERE id = v_portal_user.id
  RETURNING * INTO v_portal_user;

  INSERT INTO public.portal_user_accounts (portal_user_id, account_id, is_home)
  SELECT v_portal_user.id, scope.account_id, scope.account_id = v_portal_user.account_id
  FROM (
    SELECT DISTINCT account_id
    FROM unnest(array_append(COALESCE(v_invitation.scope_account_ids, '{}'::uuid[]), v_portal_user.account_id)) AS scope_id(account_id)
    WHERE account_id IS NOT NULL
  ) AS scope
  ON CONFLICT (portal_user_id, account_id) DO UPDATE
  SET is_home = EXCLUDED.is_home;

  BEGIN
    UPDATE public.portal_invitations
    SET status = 'registered',
        registered_at = COALESCE(registered_at, v_now),
        portal_user_id = v_portal_user.id
    WHERE id = v_invitation.id;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN v_portal_user;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_portal_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_portal_invitation(uuid) TO authenticated;

COMMENT ON FUNCTION public.accept_portal_invitation(uuid) IS
  'Accepts the current authenticated user portal invitation and restores its account scope snapshot';
