create or replace function public.update_account_secure(
  account_id uuid,
  account_data jsonb
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;

  is_service   boolean := (auth.role() = 'service_role');
  is_staff_jwt boolean := coalesce((auth.jwt() ->> 'is_staff')::boolean, false);
  is_staff_tbl boolean := false;
  is_staff_profiles boolean := false;
  has_membership boolean;
  exists_row boolean;

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
begin
  -- Hard existence check (distinct from "no changes")
  select true into exists_row from public.accounts a
  where a.id = update_account_secure.account_id
  limit 1;
  if not exists_row then
    raise exception 'Account not found: %', update_account_secure.account_id;
  end if;

  -- Optional table checks (don't error if tables don't exist)
  if to_regclass('public.staff_users') is not null then
    select exists (select 1 from public.staff_users s where s.user_id = auth.uid()) into is_staff_tbl;
  end if;

  if to_regclass('public.profiles') is not null then
    perform 1 from public.profiles p where p.id = auth.uid() and p.role in ('staff','admin');
    is_staff_profiles := found;
  end if;

  -- Membership check
  select exists (
    select 1 from public.account_memberships m
    where m.account_id = update_account_secure.account_id
      and m.user_id = auth.uid()
      and m.role = any (array['owner','staff'])
  ) into has_membership;

  if not (is_service or is_staff_jwt or is_staff_tbl or is_staff_profiles or has_membership) then
    raise exception 'Access denied: insufficient permissions to update account';
  end if;

  -- Map incoming type/account_type to valid enum labels
  if incoming_type <> '' then
    if incoming_type in (select unnest(home_candidates)) and v2_home_label is not null then
      v_type := v2_home_label::public.account_type_v2;
      v_account_type := 'individual';
    elsif incoming_type in (select unnest(business_candidates)) and v2_business_label is not null then
      v_type := v2_business_label::public.account_type_v2;
      v_account_type := 'business';
    end if;
  elsif incoming_acc <> '' then
    if incoming_acc = 'individual' and v2_home_label is not null then
      v_account_type := 'individual'::public.account_type_new;
      v_type := v2_home_label::public.account_type_v2;
    elsif incoming_acc = 'business' and v2_business_label is not null then
      v_account_type := 'business'::public.account_type_new;
      v_type := v2_business_label::public.account_type_v2;
    end if;
  end if;

  -- Perform update (may be a no-op; that's OK)
  update public.accounts a
  set name          = coalesce(v_name, a.name),
      address_line1 = coalesce(v_address_line1, a.address_line1),
      address_line2 = coalesce(v_address_line2, a.address_line2),
      city          = coalesce(v_city, a.city),
      state         = coalesce(v_state, a.state),
      zip_code      = coalesce(v_zip, a.zip_code),
      phone         = coalesce(v_phone, a.phone),
      email         = coalesce(v_email, a.email),
      source        = coalesce(v_source, a.source),
      tin_last4     = coalesce(v_tin, a.tin_last4),
      account_type  = coalesce(v_account_type, a.account_type),
      "type"        = coalesce(v_type, a."type"),
      updated_at    = now()
  where a.id = update_account_secure.account_id;

  -- Always return the current row (even if no-op)
  select to_json(a.*) into result
  from public.accounts a
  where a.id = update_account_secure.account_id;

  return result;
end
$$;

grant execute on function public.update_account_secure(uuid, jsonb) to anon, authenticated;