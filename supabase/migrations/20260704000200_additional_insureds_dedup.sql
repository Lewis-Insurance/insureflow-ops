-- Phase 4 migration 3: the Additional Insureds dedup triad.
--
-- Three RPCs that stage, list, and dismiss possible-duplicate groups for the
-- additional_insureds directory:
--   * generate_additional_insured_duplicates()  -- nightly suggester (4 signals)
--   * list_additional_insured_duplicate_groups() -- pending review queue
--   * dismiss_additional_insured_duplicate_group()
--
-- STORAGE DECISION (follows the 03 subsystem doc, overrides the 01:403 stray
-- "dedicated suggestions table" line): there is NO new suggestions table and NO
-- polymorphizing of account_relationship_suggestions (that table hardwires
-- account FKs with ON DELETE CASCADE and an account-vocabulary rel_type CHECK).
-- Groups are stored in the generic public.duplicate_groups with
-- entity_type = 'additional_insureds'. The account merge/review RPCs refuse any
-- non-account entity_type, so there is no cross-contamination.
--
-- The suggester is clone-shaped after generate_relationship_suggestions (contacts
-- CTE -> shared CTE -> ranked candidates -> insert), adapted to holder identity:
-- four signals, one best candidate per pair, never auto-commits (every group is
-- inserted status 'pending'), and idempotent by set-equality over the sorted
-- member id array (an identical member set in ANY status is never re-inserted;
-- a superset is new information and is inserted).
--
-- CRITICAL DRIFT: public.certificates does NOT exist yet (it is Phase 5). Every
-- usage figure in the members jsonb is therefore a hardcoded placeholder
-- (0::int for usage_count). This file references public.certificates NOWHERE.
--
-- Depends only on live objects: additional_insureds (Phase 4 mig 1),
-- normalize_entity_name, cleanup.norm_addr, duplicate_groups,
-- is_staff, is_agency_member, pg_trgm (extensions schema).

-- ---------------------------------------------------------------------------
-- 1) generate_additional_insured_duplicates()
--    Nightly suggester. Four signals over active (non-tombstoned) holders within
--    a workspace. Returns jsonb {"inserted": n}. Never auto-commits.
-- ---------------------------------------------------------------------------
create or replace function public.generate_additional_insured_duplicates()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_inserted int := 0;
  v_rule_id  uuid;
begin
  -- Staff-or-service gate (matches the suggester: a null auth.uid is a
  -- service-role/CRON caller and is allowed).
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'generate_additional_insured_duplicates: staff access required';
  end if;

  -- Stamp every group with the seeded nightly rule (03 Section 4.2).
  select id into v_rule_id
  from public.duplicate_detection_rules
  where entity_type = 'additional_insureds'
    and rule_name   = 'additional_insureds_nightly'
  limit 1;

  with ai as (
    select id, agency_workspace_id, name, normalized_name, kind,
           lower(btrim(coalesce(city, '')))  as city_k,
           lower(btrim(coalesce(state, ''))) as state_k,
           nullif(cleanup.norm_addr(address_line1), '') as addr_k,
           nullif(lower(btrim(email)), '')  as email_k,
           nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '') as phone_k
    from public.additional_insureds
    where deleted_at is null and merged_into_id is null
  ),
  -- (1) exact normalized_name within the same tenant + kind -> highest score.
  exact as (
    select a1.id as a, a2.id as b, 0.95::numeric as score, 10 as prio
    from ai a1
    join ai a2
      on a1.agency_workspace_id = a2.agency_workspace_id
     and a1.kind = a2.kind
     and a1.normalized_name = a2.normalized_name
     and a1.id < a2.id
    where a1.normalized_name is not null
  ),
  exact_ids as (
    select a as id from exact union select b as id from exact
  ),
  cand as (
    select a, b, score, prio from exact

    union all
    -- (2) name-trgm > 0.55 AND same city + state.
    select a1.id, a2.id,
           round(similarity(lower(a1.name), lower(a2.name))::numeric, 3) as score, 8 as prio
    from ai a1
    join ai a2
      on a1.agency_workspace_id = a2.agency_workspace_id
     and a1.id < a2.id
     and a1.city_k <> '' and a1.city_k = a2.city_k
     and a1.state_k <> '' and a1.state_k = a2.state_k
     and lower(a1.name) % lower(a2.name)
     and similarity(lower(a1.name), lower(a2.name)) > 0.55
    where a1.id not in (select id from exact_ids)
      and a2.id not in (select id from exact_ids)

    union all
    -- (3) shared normalized address key AND name-trgm > 0.4.
    select a1.id, a2.id,
           round(similarity(lower(a1.name), lower(a2.name))::numeric, 3) as score, 7 as prio
    from ai a1
    join ai a2
      on a1.agency_workspace_id = a2.agency_workspace_id
     and a1.id < a2.id
     and a1.addr_k is not null and a1.addr_k = a2.addr_k
     and lower(a1.name) % lower(a2.name)
     and similarity(lower(a1.name), lower(a2.name)) > 0.4
    where a1.id not in (select id from exact_ids)
      and a2.id not in (select id from exact_ids)

    union all
    -- (4) shared email or shared phone (>=10 digits) AND name-trgm > 0.3.
    select a1.id, a2.id,
           round(similarity(lower(a1.name), lower(a2.name))::numeric, 3) as score, 6 as prio
    from ai a1
    join ai a2
      on a1.agency_workspace_id = a2.agency_workspace_id
     and a1.id < a2.id
     and (
       (a1.email_k is not null and a1.email_k = a2.email_k)
       or (a1.phone_k is not null and length(a1.phone_k) >= 10 and a1.phone_k = a2.phone_k)
     )
     and lower(a1.name) % lower(a2.name)
     and similarity(lower(a1.name), lower(a2.name)) > 0.3
    where a1.id not in (select id from exact_ids)
      and a2.id not in (select id from exact_ids)
  ),
  -- One best candidate per unordered pair (most specific signal wins).
  ranked as (
    select a, b, score, prio,
           row_number() over (partition by a, b order by prio desc, score desc) as rn
    from cand
  ),
  best as (
    select a, b, score from ranked where rn = 1
  ),
  -- Sorted member id array is the idempotency key.
  keyed as (
    select array[a, b]::uuid[] as ids, score from best
  ),
  ins as (
    insert into public.duplicate_groups (entity_type, entity_ids, match_score, rule_id, status)
    select 'additional_insureds', k.ids, k.score, v_rule_id, 'pending'
    from keyed k
    where not exists (
      -- Set-equality idempotency across ALL statuses: never re-insert an
      -- identical member set. A superset would sort differently and IS inserted.
      select 1 from public.duplicate_groups g
      where g.entity_type = 'additional_insureds'
        and (select array_agg(x order by x) from unnest(g.entity_ids) x)
          = (select array_agg(x order by x) from unnest(k.ids) x)
    )
    returning 1
  )
  select count(*)::int into v_inserted from ins;

  return jsonb_build_object('inserted', coalesce(v_inserted, 0));
end;
$function$;

comment on function public.generate_additional_insured_duplicates() is
  'Nightly Additional Insureds dedup suggester. Four signals (exact normalized_name, name-trgm+city/state, address-key+name-trgm, shared contact+name-trgm) over active holders within a tenant. One best candidate per pair; never auto-commits (all groups pending). Idempotent by set-equality over the sorted member id array. Stores in duplicate_groups with entity_type=''additional_insureds''.';

revoke execute on function public.generate_additional_insured_duplicates() from anon, public;
grant  execute on function public.generate_additional_insured_duplicates() to authenticated;

-- ---------------------------------------------------------------------------
-- 2) list_additional_insured_duplicate_groups(p_limit, p_offset)
--    Pending-only review queue. Clone of list_duplicate_groups_for_review, with
--    the members jsonb hydrated from additional_insureds. The directory has no
--    link-candidate concept, so only status='pending' surfaces.
--
--    Usage (usage_count) is a placeholder 0 -- public.certificates does not
--    exist yet (Phase 5). Not referenced anywhere in this function.
-- ---------------------------------------------------------------------------
create or replace function public.list_additional_insured_duplicate_groups(
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(group_id uuid, match_score numeric, status text,
              created_at timestamp with time zone, member_count integer, members jsonb)
language sql stable security definer set search_path to 'public'
as $function$
  select
    g.id, g.match_score, g.status, g.created_at,
    coalesce(array_length(g.entity_ids, 1), 0),
    (select jsonb_agg(jsonb_build_object(
        'additional_insured_id', ai.id,
        'name', ai.name,
        'kind', ai.kind,
        'address_line1', ai.address_line1,
        'city', ai.city,
        'state', ai.state,
        'email', ai.email,
        'phone', ai.phone,
        'created_at', ai.created_at,
        'deleted_at', ai.deleted_at,
        -- DRIFT: public.certificates absent (Phase 5) -> placeholder 0.
        'usage_count', 0::int
      ) order by ai.deleted_at nulls first, ai.created_at)
     from public.additional_insureds ai
     where ai.id = any(g.entity_ids)
       and (auth.uid() is null or public.is_agency_member(ai.agency_workspace_id))) as members
  from public.duplicate_groups g
  where g.entity_type = 'additional_insureds'
    and g.status = 'pending'
    and (auth.uid() is null or public.is_staff())
  order by g.match_score desc nulls last, g.created_at desc
  limit p_limit offset p_offset;
$function$;

comment on function public.list_additional_insured_duplicate_groups(integer, integer) is
  'Pending Additional Insureds duplicate-review queue. Members jsonb hydrated from additional_insureds (workspace predicate inline, SECURITY DEFINER bypasses RLS). usage_count is a placeholder 0 until public.certificates ships (Phase 5).';

revoke execute on function public.list_additional_insured_duplicate_groups(integer, integer) from anon, public;
grant  execute on function public.list_additional_insured_duplicate_groups(integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) dismiss_additional_insured_duplicate_group(p_group_id)
--    Symmetric with confirm; records reviewed_by (fixes the account system's
--    asymmetry where dismiss did not stamp the reviewer). Refuses a merged group.
-- ---------------------------------------------------------------------------
create or replace function public.dismiss_additional_insured_duplicate_group(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status text;
  v_entity text;
begin
  if not public.is_staff() then
    raise exception 'dismiss_additional_insured_duplicate_group: staff access required';
  end if;

  select entity_type, status into v_entity, v_status
  from public.duplicate_groups
  where id = p_group_id;

  if not found then
    raise exception 'dismiss_additional_insured_duplicate_group: group % not found', p_group_id;
  end if;
  if v_entity is distinct from 'additional_insureds' then
    raise exception 'dismiss_additional_insured_duplicate_group: group % is not an additional_insureds group', p_group_id;
  end if;
  if v_status = 'merged' then
    raise exception 'dismiss_additional_insured_duplicate_group: group % is already merged', p_group_id;
  end if;

  update public.duplicate_groups
     set status = 'dismissed', reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_group_id;

  return jsonb_build_object('group_id', p_group_id, 'status', 'dismissed');
end;
$function$;

comment on function public.dismiss_additional_insured_duplicate_group(uuid) is
  'Dismiss a pending Additional Insureds duplicate group. Records reviewed_by/reviewed_at. Refuses a group whose entity_type is not additional_insureds or whose status is already merged.';

revoke execute on function public.dismiss_additional_insured_duplicate_group(uuid) from anon, public;
grant  execute on function public.dismiss_additional_insured_duplicate_group(uuid) to authenticated;
