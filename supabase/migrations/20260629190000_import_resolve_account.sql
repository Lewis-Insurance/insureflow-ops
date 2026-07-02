-- Importer hardening: stop re-fragmenting accounts on every feed/import.
--
-- Root cause (Sorensen & Smith LLC, import batch 6e96ddb6): processContacts in
-- src/lib/import/bulkImportProcessor.ts always did a blind INSERT of a new
-- account per row. Two feeds in the same batch -- "Sorensen & Smith Llc" from
-- progressive_custsearch and "SORENSEN AND SMITH LLC" x5 from
-- americanintegrity_bob -- never matched each other (case + & vs AND) and never
-- matched themselves, so one business became six accounts.
--
-- Fix: a resolve-or-create RPC the importer calls instead of a blind insert.
--   * normalize_entity_name() canonicalizes case, & -> "and", punctuation and
--     whitespace. It does NOT strip legal suffixes, so "Smith LLC" can never
--     collapse into "Smith Inc" -- the importer must never CREATE a false merge.
--   * commercial_business: match on normalized name alone (a legal name is an
--     identity).
--   * household: match on normalized name AND a shared strong identifier
--     (email or phone), so two different "John Smith" never collapse.
--   * a tombstoned match follows merged_into_id to the live survivor, so
--     re-importing a previously-merged loser lands on the survivor (honors merges).
--   * no match -> insert, tenant-scoped to the given workspace.
--   * field backfill is null-only: an existing value is never overwritten.
--
-- Existing fragmented data is untouched here -- the dedup review queue
-- (/duplicates) and relationship-suggestions pass handle pre-existing duplicates
-- under human review. This change only prevents NEW fragmentation.

-- 1) Canonical name key. IMMUTABLE so it can back a functional index.
create or replace function public.normalize_entity_name(p text)
returns text
language sql
immutable
parallel safe
as $function$
  select nullif(
    btrim(
      regexp_replace(
        replace(lower(coalesce(p, '')), '&', ' and '),
        '[^a-z0-9]+', ' ', 'g'
      )
    ),
  '');
$function$;

comment on function public.normalize_entity_name(text) is
  'Canonical account-name key: lowercase, & -> "and", punctuation -> space, collapsed whitespace. No legal-suffix stripping (keeps "X LLC" distinct from "X Inc").';

-- Fast candidate lookups for live accounts by (type, normalized name).
create index if not exists idx_accounts_norm_name_active
  on public.accounts (type, (public.normalize_entity_name(name)))
  where deleted_at is null;

-- 2) Resolve-or-create. SECURITY DEFINER; staff-gated (service role allowed for
--    server-side imports). Returns { account_id, matched, match_basis, followed_merge }.
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
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'import_resolve_account: name required';
  end if;
  if p_type not in ('household', 'commercial_business') then
    raise exception 'import_resolve_account: invalid type %', p_type;
  end if;

  -- Serialize concurrent resolves of the same identity within a tenant so a
  -- parallel import cannot double-insert the same account.
  perform pg_advisory_xact_lock(hashtextextended(
    coalesce(p_agency_workspace_id::text, '') || '|' || p_type || '|' || coalesce(v_key, ''), 0));

  if v_key is not null then
    -- (1) live exact match in the same tenant. Business: name alone.
    --     Household: name + a shared strong identifier (email or phone).
    select a.id into v_match
    from public.accounts a
    where a.deleted_at is null
      and a.type::text = p_type
      and public.normalize_entity_name(a.name) = v_key
      and (a.agency_workspace_id = p_agency_workspace_id
           or a.agency_workspace_id is null or p_agency_workspace_id is null)
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
      -- (2) tombstoned match -> follow merged_into_id to the live survivor.
      select a.id into v_match
      from public.accounts a
      where a.deleted_at is not null
        and a.merged_into_id is not null
        and a.type::text = p_type
        and public.normalize_entity_name(a.name) = v_key
        and (a.agency_workspace_id = p_agency_workspace_id
             or a.agency_workspace_id is null or p_agency_workspace_id is null)
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
        if exists (select 1 from public.accounts where id = v_match and deleted_at is null) then
          v_followed := true;
          v_basis := 'followed_merge';
        else
          v_match := null;  -- survivor not live; fall through to insert
        end if;
      end if;
    end if;
  end if;

  if v_match is not null then
    -- Backfill blank scalar fields only; never overwrite an existing value.
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

  -- (3) No match: create, tenant-scoped to the given workspace.
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

revoke execute on function public.import_resolve_account(uuid,uuid,text,text,text,text,text,text,text,text,text,date,text,jsonb) from anon, public;
grant  execute on function public.import_resolve_account(uuid,uuid,text,text,text,text,text,text,text,text,text,date,text,jsonb) to authenticated;
