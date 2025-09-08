-- Fix the type mapping logic in update_account_secure
CREATE OR REPLACE FUNCTION public.update_account_secure(
  account_id uuid,
  account_data jsonb
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;

  is_service   boolean := (auth.role() = 'service_role');
  is_staff_jwt boolean := coalesce((auth.jwt() ->> 'is_staff')::boolean, false);
  is_staff_tbl boolean := false;
  is_staff_profiles boolean := false;
  has_membership boolean;

  -- incoming values
  v_name text := update_account_secure.account_data->>'name';
  v_address_line1 text := update_account_secure.account_data->>'address_line1';
  v_address_line2 text := update_account_secure.account_data->>'address_line2';
  v_city text := update_account_secure.account_data->>'city';
  v_state text := update_account_secure.account_data->>'state';
  v_zip text := update_account_secure.account_data->>'zip_code';
  v_phone text := update_account_secure.account_data->>'phone';
  v_email text := update_account_secure.account_data->>'email';
  v_source text := update_account_secure.account_data->>'source';
  v_tin text := update_account_secure.account_data->>'tin_last4';

  -- enums
  v_account_type public.account_type_new;
  v_type public.account_type_v2;

  business_candidates text[] := array['business','organization','commercial','company','corp','corporate','biz'];
  home_candidates     text[] := array['household','personal','individual','consumer','residential'];

  v2_business_label text := public.pick_enum_label('account_type_v2'::regtype, business_candidates);
  v2_home_label     text := public.pick_enum_label('account_type_v2'::regtype, home_candidates);

  incoming_type text := lower(coalesce(update_account_secure.account_data->>'type',''));
  incoming_acc  text := lower(coalesce(update_account_secure.account_data->>'account_type',''));
BEGIN
  -- Optional table checks
  IF to_regclass('public.staff_users') IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.staff_users s WHERE s.user_id = auth.uid()) INTO is_staff_tbl;
  END IF;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    PERFORM 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('staff','admin');
    is_staff_profiles := found;
  END IF;

  -- IMPORTANT: fully-qualify parameter to avoid ambiguity
  SELECT EXISTS (
    SELECT 1
    FROM public.account_memberships m
    WHERE m.account_id = update_account_secure.account_id
      AND m.user_id = auth.uid()
      AND m.role = ANY (ARRAY['owner','staff'])
  ) INTO has_membership;

  IF NOT (is_service OR is_staff_jwt OR is_staff_tbl OR is_staff_profiles OR has_membership) THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions to update account';
  END IF;

  -- Map incoming type/account_type to valid enum labels
  -- Handle both 'type' and 'account_type' fields from the client
  IF incoming_type != '' THEN
    -- Client sent 'type' field (e.g., 'household', 'business')
    IF incoming_type IN (SELECT unnest(home_candidates)) AND v2_home_label IS NOT NULL THEN
      v_type := v2_home_label::public.account_type_v2;
      v_account_type := 'individual';
    ELSIF incoming_type IN (SELECT unnest(business_candidates)) AND v2_business_label IS NOT NULL THEN
      v_type := v2_business_label::public.account_type_v2;
      v_account_type := 'business';
    END IF;
  ELSIF incoming_acc != '' THEN
    -- Client sent 'account_type' field (e.g., 'individual', 'business')
    IF incoming_acc = 'individual' AND v2_home_label IS NOT NULL THEN
      v_account_type := 'individual'::public.account_type_new;
      v_type := v2_home_label::public.account_type_v2;
    ELSIF incoming_acc = 'business' AND v2_business_label IS NOT NULL THEN
      v_account_type := 'business'::public.account_type_new;
      v_type := v2_business_label::public.account_type_v2;
    END IF;
  END IF;

  UPDATE public.accounts a
  SET name          = COALESCE(v_name, a.name),
      address_line1 = COALESCE(v_address_line1, a.address_line1),
      address_line2 = COALESCE(v_address_line2, a.address_line2),
      city          = COALESCE(v_city, a.city),
      state         = COALESCE(v_state, a.state),
      zip_code      = COALESCE(v_zip, a.zip_code),
      phone         = COALESCE(v_phone, a.phone),
      email         = COALESCE(v_email, a.email),
      source        = COALESCE(v_source, a.source),
      tin_last4     = COALESCE(v_tin, a.tin_last4),
      account_type  = COALESCE(v_account_type, a.account_type),
      "type"        = COALESCE(v_type, a."type"),
      updated_at    = now()
  WHERE a.id = update_account_secure.account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found or no changes made';
  END IF;

  SELECT to_json(a.*) INTO result
  FROM public.accounts a
  WHERE a.id = update_account_secure.account_id;

  RETURN result;
END
$$;