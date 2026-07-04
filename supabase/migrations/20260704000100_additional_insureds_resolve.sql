-- Phase 4 migration 2: resolve-or-create for the Additional Insureds directory.
--
-- The Add drawer's Save calls this instead of a blind INSERT, so two concurrent
-- identical creates land ONE row (the insert-race is closed by an advisory xact
-- lock on the identity key, same as import_resolve_account). Clone of
-- public.import_resolve_account (20260629190000:96-188) with these
-- directory-specific swaps, each per 03 Section 3:
--
--   * Target table is public.additional_insureds (not accounts).
--   * kind, not the account type enum. Kind is NOT part of the match key: the
--     SELECT never filters on kind, so a create as 'business' resolves to an
--     existing 'other' row of the same normalized name (the name is the identity;
--     kind is a descriptor). p_kind stays in the advisory-lock key only, for
--     insert-race protection. 'individual' matches on normalized_name AND a
--     shared strong identifier (email or phone) so two different "John Smith"
--     holders never collapse; every other kind matches on normalized_name alone.
--   * A tombstoned match follows merged_into_id to the live survivor (10-hop
--     guard), so re-resolving a previously-merged loser lands on the survivor.
--   * No date_of_birth / source / custom / import_batch_id columns. The address
--     block is address_line1/2 + city/state/zip_code (accounts naming).
--   * Field backfill is null-only: an existing value is never overwritten.
--   * R14: p_agency_workspace_id is the LAST parameter and defaults null; the RPC
--     derives it server-side from the caller's active membership and REFUSES to
--     proceed when it is still null after derivation, then checks the caller is a
--     member of that workspace. Service-role callers (auth.uid() null) must pass
--     it explicitly. This matches the hook contract (ResolveAdditionalInsuredInput
--     carries no workspace field).
--
-- Returns jsonb: { additional_insured_id, matched, match_basis, followed_merge }.
-- SECURITY DEFINER; staff-gated (service role allowed for server-side callers);
-- revoked from anon/public and granted to authenticated.

create or replace function public.resolve_additional_insured(
  p_name          text,
  p_kind          text default 'business',
  p_email         text default null,
  p_phone         text default null,
  p_address_line1 text default null,
  p_address_line2 text default null,
  p_city          text default null,
  p_state         text default null,
  p_zip           text default null,
  p_notes         text default null,
  p_agency_workspace_id uuid default null
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
  v_ws       uuid := p_agency_workspace_id;
  v_match    uuid;
  v_basis    text;
  v_followed boolean := false;
  v_hops     int := 0;
  v_next     uuid;
  v_new      uuid;
begin
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'resolve_additional_insured: staff access required';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'resolve_additional_insured: name required';
  end if;
  if p_kind not in ('business', 'individual', 'government', 'lender', 'other') then
    raise exception 'resolve_additional_insured: invalid kind %', p_kind;
  end if;

  -- R14: derive the workspace from the caller's active membership; refuse null.
  if v_ws is null and auth.uid() is not null then
    select m.agency_workspace_id into v_ws
    from public.agency_workspace_memberships m
    where m.user_id = auth.uid() and m.status = 'active'
    limit 1;
  end if;
  if v_ws is null then
    raise exception 'resolve_additional_insured: agency_workspace_id could not be derived; pass it explicitly';
  end if;
  if auth.uid() is not null and not public.is_agency_member(v_ws) then
    raise exception 'resolve_additional_insured: caller is not a member of workspace %', v_ws;
  end if;

  -- Serialize concurrent resolves of the same identity within a tenant so a
  -- parallel create cannot double-insert the same holder. The 'addl_insured|'
  -- discriminator keeps the key space distinct from import_resolve_account's.
  perform pg_advisory_xact_lock(hashtextextended(
    'addl_insured|' || v_ws::text || '|' || p_kind || '|' || coalesce(v_key, ''), 0));

  if v_key is not null then
    -- (1) live exact match in the same tenant. Non-individual kinds: normalized
    --     name alone (a legal name is an identity). Individual: normalized name
    --     AND a shared strong identifier (email or phone). Kind is NOT filtered.
    select ai.id into v_match
    from public.additional_insureds ai
    where ai.deleted_at is null
      and ai.normalized_name = v_key
      and ai.agency_workspace_id = v_ws
      and (
        p_kind <> 'individual'
        or (v_email is not null and lower(btrim(coalesce(ai.email, ''))) = v_email)
        or (v_phone is not null
            and nullif(regexp_replace(coalesce(ai.phone, ''), '\D', '', 'g'), '') = v_phone)
      )
    order by ai.updated_at desc nulls last, ai.created_at asc
    limit 1;

    if v_match is not null then
      v_basis := case when p_kind <> 'individual' then 'entity_name' else 'name_plus_identifier' end;
    else
      -- (2) tombstoned match -> follow merged_into_id to the live survivor. Kind
      --     is NOT filtered here either.
      select ai.id into v_match
      from public.additional_insureds ai
      where ai.deleted_at is not null
        and ai.merged_into_id is not null
        and ai.normalized_name = v_key
        and ai.agency_workspace_id = v_ws
      order by ai.merged_at desc nulls last
      limit 1;

      if v_match is not null then
        v_next := v_match;
        loop
          v_hops := v_hops + 1;
          select merged_into_id into v_next from public.additional_insureds where id = v_next;
          exit when v_next is null or v_hops > 10;
          v_match := v_next;
        end loop;
        if exists (select 1 from public.additional_insureds where id = v_match and deleted_at is null) then
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
    update public.additional_insureds ai set
      email         = coalesce(nullif(btrim(ai.email), ''),         nullif(btrim(p_email), '')),
      phone         = coalesce(nullif(btrim(ai.phone), ''),         nullif(btrim(p_phone), '')),
      address_line1 = coalesce(nullif(btrim(ai.address_line1), ''), nullif(btrim(p_address_line1), '')),
      address_line2 = coalesce(nullif(btrim(ai.address_line2), ''), nullif(btrim(p_address_line2), '')),
      city          = coalesce(nullif(btrim(ai.city), ''),          nullif(btrim(p_city), '')),
      state         = coalesce(nullif(btrim(ai.state), ''),         nullif(btrim(p_state), '')),
      zip_code      = coalesce(nullif(btrim(ai.zip_code), ''),      nullif(btrim(p_zip), '')),
      notes         = coalesce(nullif(btrim(ai.notes), ''),         nullif(btrim(p_notes), ''))
    where ai.id = v_match;

    return jsonb_build_object(
      'additional_insured_id', v_match, 'matched', true, 'match_basis', v_basis, 'followed_merge', v_followed);
  end if;

  -- (3) No match: create, tenant-scoped to the derived workspace. The BEFORE
  --     trigger accepts the explicit workspace; created_by from auth.uid().
  insert into public.additional_insureds
    (agency_workspace_id, name, kind, email, phone, address_line1, address_line2, city, state, zip_code, notes, created_by)
  values
    (v_ws, btrim(p_name), p_kind,
     nullif(btrim(p_email), ''), nullif(btrim(p_phone), ''),
     nullif(btrim(p_address_line1), ''), nullif(btrim(p_address_line2), ''),
     nullif(btrim(p_city), ''), nullif(btrim(p_state), ''), nullif(btrim(p_zip), ''),
     nullif(btrim(p_notes), ''), auth.uid())
  returning id into v_new;

  return jsonb_build_object(
    'additional_insured_id', v_new, 'matched', false, 'match_basis', 'created', 'followed_merge', false);
end;
$function$;

comment on function public.resolve_additional_insured(text,text,text,text,text,text,text,text,text,text,uuid) is
  'Resolve-or-create for the additional_insureds directory. Race-safe via advisory xact lock on the identity key. Kind is not part of the match key (SELECT never filters kind); individual matches normalized_name + shared email/phone, other kinds match normalized_name alone; tombstoned matches follow merged_into_id to the live survivor. Workspace is derived server-side (R14) and refused when null. Backfill is null-only.';

revoke execute on function public.resolve_additional_insured(text,text,text,text,text,text,text,text,text,text,uuid) from anon, public;
grant  execute on function public.resolve_additional_insured(text,text,text,text,text,text,text,text,text,text,uuid) to authenticated;
