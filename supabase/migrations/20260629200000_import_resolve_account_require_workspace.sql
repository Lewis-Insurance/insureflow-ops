-- Tenant-scoping fix for import_resolve_account (Codex review on PR #11).
--
-- The previous predicate
--   (a.agency_workspace_id = p_agency_workspace_id
--    or a.agency_workspace_id is null or p_agency_workspace_id is null)
-- treated a null p_agency_workspace_id as a wildcard. useBulkImport falls back to
-- an empty string when a user's active workspace does not resolve to exactly one
-- row (.single() returns zero or many), and processContacts then sent null -- so
-- an import could resolve to a same-name account in ANY workspace and attach the
-- imported policies / field backfills to it. That violates the tenant boundary
-- (CLAUDE.md invariant: all customer data is scoped by agency_workspace_id).
--
-- Fix: require an explicit workspace and match strictly within it. No null
-- wildcard, in either direction.

create or replace function public.import_resolve_account(
  p_agency_workspace_id uuid,
  p_batch_id  uuid,
  p_name      text,
  p_type      text,
  p_email     text default null,
  p_phone     text default null,
  p_address_line1 text default null,
  p_address_line2 text default null,
  p_city      text default null,
  p_state     text default null,
  p_zip       text default null,
  p_dob       date default null,
  p_source    text default null,
  p_custom    jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_key      text := public.normalize_entity_name(p_name);
  v_email    text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone    text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
  v_match    uuid;
  v_basis    text;
  v_followed boolean := false;
  v_hops     int := 0;
  v_next     uuid;
  v_new      uuid;
begin
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'import_resolve_account: staff access required';
  end if;
  if p_agency_workspace_id is null then
    raise exception 'import_resolve_account: workspace required (refusing to resolve without a tenant scope)';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'import_resolve_account: name required';
  end if;
  if p_type not in ('household', 'commercial_business') then
    raise exception 'import_resolve_account: invalid type %', p_type;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_agency_workspace_id::text || '|' || p_type || '|' || coalesce(v_key, ''), 0));

  if v_key is not null then
    -- (1) live exact match within this workspace. Business: name alone.
    --     Household: name + a shared strong identifier (email or phone).
    select a.id into v_match
    from public.accounts a
    where a.deleted_at is null
      and a.agency_workspace_id = p_agency_workspace_id
      and a.type::text = p_type
      and public.normalize_entity_name(a.name) = v_key
      and (
        p_type = 'commercial_business'
        or (v_email is not null and lower(btrim(a.email)) = v_email)
        or (v_phone is not null and nullif(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g'), '') = v_phone)
        or (p_dob  is not null and a.date_of_birth = p_dob)
      )
    order by a.updated_at desc nulls last, a.created_at asc
    limit 1;

    if v_match is not null then
      v_basis := case when p_type = 'commercial_business' then 'business_name' else 'name_plus_identifier' end;
    else
      -- (2) tombstoned match in this workspace -> follow merged_into_id to the live survivor.
      select a.id into v_match
      from public.accounts a
      where a.deleted_at is not null
        and a.merged_into_id is not null
        and a.agency_workspace_id = p_agency_workspace_id
        and a.type::text = p_type
        and public.normalize_entity_name(a.name) = v_key
        and (
          p_type = 'commercial_business'
          or (v_email is not null and lower(btrim(a.email)) = v_email)
          or (v_phone is not null and nullif(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g'), '') = v_phone)
          or (p_dob  is not null and a.date_of_birth = p_dob)
        )
      order by a.merged_at desc nulls last
      limit 1;

      if v_match is not null then
        v_next := v_match;
        loop
          v_hops := v_hops + 1;
          select merged_into_id into v_next from public.accounts where id = v_next;
          exit when v_next is null or v_hops > 10;
          v_match := v_next;
        end loop;
        -- only accept a survivor that is live AND in the same workspace
        if exists (select 1 from public.accounts
                   where id = v_match and deleted_at is null
                     and agency_workspace_id = p_agency_workspace_id) then
          v_followed := true;
          v_basis := 'followed_merge';
        else
          v_match := null;
        end if;
      end if;
    end if;
  end if;

  if v_match is not null then
    update public.accounts a set
      email         = coalesce(nullif(btrim(a.email), ''),         nullif(btrim(p_email), '')),
      phone         = coalesce(nullif(btrim(a.phone), ''),         nullif(btrim(p_phone), '')),
      address_line1 = coalesce(nullif(btrim(a.address_line1), ''), nullif(btrim(p_address_line1), '')),
      address_line2 = coalesce(nullif(btrim(a.address_line2), ''), nullif(btrim(p_address_line2), '')),
      city          = coalesce(nullif(btrim(a.city), ''),          nullif(btrim(p_city), '')),
      state         = coalesce(nullif(btrim(a.state), ''),         nullif(btrim(p_state), '')),
      zip_code      = coalesce(nullif(btrim(a.zip_code), ''),      nullif(btrim(p_zip), '')),
      date_of_birth = coalesce(a.date_of_birth, p_dob)
    where a.id = v_match;

    return jsonb_build_object(
      'account_id', v_match, 'matched', true, 'match_basis', v_basis, 'followed_merge', v_followed);
  end if;

  insert into public.accounts
    (agency_workspace_id, name, type, email, phone, address_line1, address_line2, city, state, zip_code,
     date_of_birth, source, custom, import_batch_id)
  values
    (p_agency_workspace_id, btrim(p_name), p_type::account_type_v2, nullif(btrim(p_email), ''), nullif(btrim(p_phone), ''),
     nullif(btrim(p_address_line1), ''), nullif(btrim(p_address_line2), ''), nullif(btrim(p_city), ''),
     nullif(btrim(p_state), ''), nullif(btrim(p_zip), ''), p_dob, p_source, p_custom, p_batch_id)
  returning id into v_new;

  return jsonb_build_object(
    'account_id', v_new, 'matched', false, 'match_basis', 'created', 'followed_merge', false);
end;
$function$;
