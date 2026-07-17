-- Broaden find_duplicate_accounts to flag on the NAME ALONE for both personal
-- and commercial clients (previously personal required a shared email/phone/DOB,
-- which under-caught: a name-only re-entry, or the same person with a slightly
-- different email, slipped through with no warning).
--
-- Still an exact normalized-name match (no fuzzy), same workspace, same type,
-- not soft-deleted. A matching email/phone/DOB is no longer required -- it only
-- ranks a match higher (match_basis 'name_and_contact' vs 'name') so the UI can
-- show the strongest candidates first. The New Client flow now requires the user
-- to acknowledge a match before continuing, so warning more is the intent.

create or replace function public.find_duplicate_accounts(
  p_name  text,
  p_type  text,
  p_email text default null,
  p_phone text default null,
  p_dob   date default null,
  p_limit integer default 5
)
returns table(
  account_id          uuid,
  name                text,
  email               text,
  phone               text,
  city                text,
  state               text,
  account_status      text,
  active_policy_count integer,
  match_basis         text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_key   text := public.normalize_entity_name(p_name);
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
  v_ws    uuid;
begin
  if not (auth.uid() is null or public.is_staff()) then
    return;
  end if;
  if v_key is null then
    return;
  end if;
  if p_type not in ('household', 'commercial_business') then
    return;
  end if;

  v_ws := public.get_user_org_id();
  if v_ws is null then
    return;
  end if;

  return query
  select
    a.id as account_id,
    a.name,
    a.email,
    a.phone,
    a.city,
    a.state,
    a.account_status::text as account_status,
    (
      select count(*)::int
      from public.policies p
      where p.account_id = a.id
        and p.status = 'active'
        and p.deleted_at is null
    ) as active_policy_count,
    (
      case
        when (v_email is not null and lower(btrim(a.email)) = v_email)
          or (v_phone is not null and nullif(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g'), '') = v_phone)
          or (p_dob  is not null and a.date_of_birth = p_dob)
        then 'name_and_contact'
        else 'name'
      end
    ) as match_basis
  from public.accounts a
  where a.deleted_at is null
    and a.agency_workspace_id = v_ws
    and a.type::text = p_type
    and public.normalize_entity_name(a.name) = v_key
  order by
    -- strongest first: a shared contact identifier outranks a name-only match
    (case
        when (v_email is not null and lower(btrim(a.email)) = v_email)
          or (v_phone is not null and nullif(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g'), '') = v_phone)
          or (p_dob  is not null and a.date_of_birth = p_dob)
        then 0 else 1 end),
    a.updated_at desc nulls last,
    a.created_at asc
  limit greatest(coalesce(p_limit, 5), 1);
end;
$function$;

revoke execute on function public.find_duplicate_accounts(text, text, text, text, date, integer) from anon, public;
grant  execute on function public.find_duplicate_accounts(text, text, text, text, date, integer) to authenticated;
