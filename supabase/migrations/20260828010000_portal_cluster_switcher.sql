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
  SELECT
    a.id AS account_id,
    a.name,
    a.id = cpu.account_id AS is_home
  FROM public.client_portal_users cpu
  JOIN public.accounts a
    ON a.id IN (
      SELECT accessible.account_id
      FROM public.portal_accessible_account_ids() accessible
    )
  WHERE cpu.auth_user_id = auth.uid()
    AND cpu.portal_status = 'active'
    AND a.deleted_at IS NULL
  ORDER BY (a.id = cpu.account_id) DESC, a.name, a.id;
$$;

REVOKE ALL ON FUNCTION public.list_my_portal_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_portal_accounts() TO authenticated;

DROP FUNCTION public.create_my_service_request(text, text, jsonb, uuid, jsonb);

CREATE FUNCTION public.create_my_service_request(
  p_request_type text,
  p_request_title text,
  p_request_data jsonb,
  p_policy_id uuid DEFAULT NULL,
  p_prefilled_data jsonb DEFAULT NULL,
  p_account_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_portal_user_id uuid;
  v_household_member_id uuid;
  v_account_id uuid;
  v_branding_id uuid;
  v_user_name text;
  v_request_id uuid;
  v_task_id uuid;
  v_sla_hours integer;
  v_can_request boolean;
BEGIN
  v_portal_user_id := public.get_my_portal_user_id();
  v_household_member_id := public.get_my_household_member_id();

  IF v_portal_user_id IS NOT NULL THEN
    SELECT account_id, branding_id, concat(first_name, ' ', last_name)
    INTO v_account_id, v_branding_id, v_user_name
    FROM public.client_portal_users
    WHERE id = v_portal_user_id;
  ELSIF v_household_member_id IS NOT NULL THEN
    SELECT (permissions->>'request_service_changes')::boolean
    INTO v_can_request
    FROM public.portal_household_members
    WHERE id = v_household_member_id;

    IF NOT coalesce(v_can_request, false) THEN
      RAISE EXCEPTION 'Permission denied: cannot create service requests';
    END IF;

    SELECT cpu.id, cpu.account_id, cpu.branding_id, phm.member_name
    INTO v_portal_user_id, v_account_id, v_branding_id, v_user_name
    FROM public.portal_household_members phm
    JOIN public.client_portal_users cpu ON cpu.id = phm.primary_user_id
    WHERE phm.id = v_household_member_id;
  ELSE
    RAISE EXCEPTION 'Not authenticated as portal user';
  END IF;

  IF p_account_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.portal_accessible_account_ids() accessible
      WHERE accessible.account_id = p_account_id
    ) THEN
      RAISE EXCEPTION 'Account is not accessible to this portal user'
        USING ERRCODE = '42501';
    END IF;

    v_account_id := p_account_id;
  END IF;

  IF p_policy_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.policies
    WHERE id = p_policy_id
      AND account_id = v_account_id
  ) THEN
    RAISE EXCEPTION 'Policy does not belong to your account';
  END IF;

  v_sla_hours := CASE
    WHEN p_request_type IN ('cancel_policy', 'claims_question') THEN 4
    WHEN p_request_type IN ('certificate_request', 'document_request') THEN 24
    ELSE 48
  END;

  INSERT INTO public.portal_service_requests (
    portal_user_id,
    household_member_id,
    account_id,
    branding_id,
    policy_id,
    request_type,
    request_title,
    request_data,
    prefilled_data,
    sla_due_at,
    priority
  ) VALUES (
    v_portal_user_id,
    v_household_member_id,
    v_account_id,
    v_branding_id,
    p_policy_id,
    p_request_type,
    p_request_title,
    p_request_data,
    p_prefilled_data,
    now() + (v_sla_hours || ' hours')::interval,
    CASE
      WHEN p_request_type IN ('cancel_policy', 'claims_question') THEN 'high'
      ELSE 'normal'
    END
  )
  RETURNING id INTO v_request_id;

  INSERT INTO public.tasks (
    account_id,
    title,
    description,
    category,
    priority,
    status,
    due_date
  ) VALUES (
    v_account_id,
    'Portal Request: ' || p_request_title,
    'Service request #' || v_request_id::text || ' from ' || coalesce(v_user_name, 'Portal User') || ' via Client Portal.',
    'service_request',
    CASE
      WHEN p_request_type IN ('cancel_policy', 'claims_question') THEN 'high'
      ELSE 'medium'
    END,
    'pending',
    now() + (v_sla_hours || ' hours')::interval
  )
  RETURNING id INTO v_task_id;

  UPDATE public.portal_service_requests
  SET task_id = v_task_id
  WHERE id = v_request_id;

  PERFORM public.log_my_portal_activity(
    'submit_service_request',
    jsonb_build_object('request_id', v_request_id, 'request_type', p_request_type)
  );

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_my_service_request(text, text, jsonb, uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_my_service_request(text, text, jsonb, uuid, jsonb, uuid) TO authenticated;
