-- find_duplicate_accounts: read-only near-exact duplicate lookup for the unified
-- "Add Policy" intake page. Mirrors import_resolve_account's matching rule
-- (commercial_business = same normalized name; household = same normalized name
-- AND a shared strong identifier: email OR digits-only phone OR date_of_birth)
-- but ONLY returns candidate rows -- it never inserts or mutates. Staff-gated,
-- tenant-scoped to the caller's workspace, revoked from anon/public.
--
-- Deliberately NOT a loose first/last-name match: the whole point is to warn only
-- on nearly-exact duplicates so the intake page does not nag on common names.

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
  -- staff gate (same posture as the other triage/search RPCs)
  if not (auth.uid() is null or public.is_staff()) then
    return;
  end if;

  -- need a normalized name and a valid type to match on
  if v_key is null then
    return;
  end if;
  if p_type not in ('household', 'commercial_business') then
    return;
  end if;

  -- tenant scope: only look inside the caller's own book
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
    (case when p_type = 'commercial_business' then 'business_name' else 'name_plus_identifier' end) as match_basis
  from public.accounts a
  where a.deleted_at is null
    and a.agency_workspace_id = v_ws
    and a.type::text = p_type
    and public.normalize_entity_name(a.name) = v_key
    and (
      p_type = 'commercial_business'
      or (v_email is not null and lower(btrim(a.email)) = v_email)
      or (v_phone is not null and nullif(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g'), '') = v_phone)
      or (p_dob  is not null and a.date_of_birth = p_dob)
    )
  order by a.updated_at desc nulls last, a.created_at asc
  limit greatest(coalesce(p_limit, 5), 1);
end;
$function$;

revoke execute on function public.find_duplicate_accounts(text, text, text, text, date, integer) from anon, public;
grant  execute on function public.find_duplicate_accounts(text, text, text, text, date, integer) to authenticated;
