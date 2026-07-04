-- Phase 4 migration 5: the Additional Insureds readers (page + typeahead data).
--
-- Three read RPCs backing the /additional-insureds index page and the drawer /
-- /certificates holder-picker typeahead:
--   * search_additional_insureds()      -- trigram typeahead (one implementation,
--                                           backs both the drawer AND the
--                                           /certificates holder picker)
--   * list_additional_insureds()         -- filtered directory list + cohorts
--   * count_additional_insured_cohorts() -- triage-strip counts
--
-- search_additional_insureds is a clone of public.search_accounts, trigram-fixed:
-- the % operator appears in the WHERE clause so the GIN trgm index is used, while
-- similarity() is used only for the SELECT score column. The % match is guarded by
-- an explicit length(term) >= 3 predicate and OR'd with ilike/normalized_name, so it
-- relies on the platform default pg_trgm.similarity_threshold (0.3); the function
-- cannot pin the GUC (the migration role lacks permission on this project). The
-- goes_by / alias / owned_business_count branches
-- are dropped (a holder has no alias concept in v1).
--
-- CRITICAL DRIFT: public.certificates does NOT exist yet (it is Phase 5). Every
-- usage figure is a hardcoded placeholder: 0::int usage_count,
-- null::timestamptz last_used_at. This file references public.certificates
-- NOWHERE. The never_used cohort degrades to a no-op filter (all rows) until a
-- post-issuance wire-up CREATE OR REPLACEs these readers with the real cert
-- subselects. The duplicates cohort reads duplicate_groups (present) and works
-- today.
--
-- Depends only on live objects: additional_insureds (Phase 4 mig 1),
-- duplicate_groups, is_staff, is_agency_member, pg_trgm (extensions schema).

-- ---------------------------------------------------------------------------
-- 1) search_additional_insureds(p_q, p_limit)
--    Trigram + ILIKE typeahead. Backs BOTH the drawer's live-duplicate typeahead
--    AND the /certificates holder picker -- one implementation, no second copy.
-- ---------------------------------------------------------------------------
create or replace function public.search_additional_insureds(p_q text, p_limit integer default 20)
 returns table(additional_insured_id uuid, name text, kind text, city text, state text,
               email text, phone text, usage_count integer, last_used_at timestamptz,
               match_reason text, score real)
 language sql
 stable security definer
 set search_path to 'public', 'extensions'
as $function$
  with q as (select nullif(trim(coalesce(p_q, '')), '') as term)
  select
    ai.id as additional_insured_id, ai.name, ai.kind, ai.city, ai.state, ai.email, ai.phone,
    -- DRIFT: public.certificates absent (Phase 5) -> placeholders.
    0::int as usage_count,
    null::timestamptz as last_used_at,
    case
      when ai.normalized_name = public.normalize_entity_name((select term from q)) then 'same normalized name'
      when ai.name  ilike '%' || (select term from q) || '%' then 'name'
      when ai.email ilike '%' || (select term from q) || '%' then 'email'
      when ai.phone ilike '%' || (select term from q) || '%' then 'phone'
      else 'fuzzy: ' || ai.name
    end as match_reason,
    similarity(lower(ai.name), lower((select term from q))) as score
  from public.additional_insureds ai
  where ai.deleted_at is null
    and ai.merged_into_id is null
    and (select term from q) is not null
    and (auth.uid() is null or public.is_staff())
    and (auth.uid() is null or public.is_agency_member(ai.agency_workspace_id))
    and (
      ai.name  ilike '%' || (select term from q) || '%'
      or ai.email ilike '%' || (select term from q) || '%'
      or ai.phone ilike '%' || (select term from q) || '%'
      or ai.normalized_name = public.normalize_entity_name((select term from q))
      -- % uses the GIN trgm index; threshold pinned above.
      or (length((select term from q)) >= 3 and lower(ai.name) % lower((select term from q)))
    )
  order by
    (case when ai.name ilike (select term from q) || '%' then 1 else 0 end) desc,
    score desc nulls last, ai.name asc
  limit p_limit;
$function$;

comment on function public.search_additional_insureds(text, integer) is
  'Trigram + ILIKE typeahead over the additional_insureds directory. % in WHERE uses the GIN trgm index; threshold pinned on the function. Tombstoned/merged rows never surface. Backs both the drawer typeahead and the /certificates holder picker. usage_count/last_used_at are placeholders until public.certificates ships (Phase 5).';

revoke execute on function public.search_additional_insureds(text, integer) from anon, public;
grant  execute on function public.search_additional_insureds(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) list_additional_insureds(p_q, p_kind, p_cohort, p_limit, p_offset)
--    Filtered directory list. Optional trigram/ILIKE q, optional kind filter,
--    optional cohort filter (missing_address | never_used | duplicates).
-- ---------------------------------------------------------------------------
create or replace function public.list_additional_insureds(
  p_q text default null,
  p_kind text default null,
  p_cohort text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table(additional_insured_id uuid, name text, kind text, address_line1 text,
              city text, state text, zip_code text, email text, phone text, notes text,
              usage_count integer, last_used_at timestamptz,
              has_pending_duplicate boolean, created_at timestamptz)
language sql stable security definer
set search_path to 'public', 'extensions'
as $function$
  with q as (select nullif(trim(coalesce(p_q, '')), '') as term)
  select
    ai.id as additional_insured_id, ai.name, ai.kind, ai.address_line1,
    ai.city, ai.state, ai.zip_code, ai.email, ai.phone, ai.notes,
    -- DRIFT: public.certificates absent (Phase 5) -> placeholders.
    0::int as usage_count,
    null::timestamptz as last_used_at,
    exists (
      select 1 from public.duplicate_groups g
      where g.entity_type = 'additional_insureds'
        and g.status = 'pending'
        and ai.id = any(g.entity_ids)
    ) as has_pending_duplicate,
    ai.created_at
  from public.additional_insureds ai
  where ai.deleted_at is null
    and ai.merged_into_id is null
    and (auth.uid() is null or public.is_staff())
    and (auth.uid() is null or public.is_agency_member(ai.agency_workspace_id))
    and (
      (select term from q) is null
      or ai.name  ilike '%' || (select term from q) || '%'
      or ai.email ilike '%' || (select term from q) || '%'
      or ai.phone ilike '%' || (select term from q) || '%'
      or (length((select term from q)) >= 3 and lower(ai.name) % lower((select term from q)))
    )
    and (p_kind is null or ai.kind = p_kind)
    and (
      p_cohort is null
      or (p_cohort = 'missing_address'
            and (ai.address_line1 is null or btrim(ai.address_line1) = ''))
      -- DRIFT: public.certificates absent -> never_used degrades to a no-op
      -- filter (all rows) until the post-issuance wire-up.
      or (p_cohort = 'never_used' and true)
      or (p_cohort = 'duplicates'
            and exists (
              select 1 from public.duplicate_groups g
              where g.entity_type = 'additional_insureds'
                and g.status = 'pending'
                and ai.id = any(g.entity_ids)))
    )
  order by ai.name asc, ai.created_at desc
  limit p_limit offset p_offset;
$function$;

comment on function public.list_additional_insureds(text, text, text, integer, integer) is
  'Filtered Additional Insureds directory list (agency-wide, not per-customer). Optional q (ILIKE/trgm), kind, and cohort (missing_address|never_used|duplicates). usage_count/last_used_at are placeholders and the never_used cohort is a no-op until public.certificates ships (Phase 5); the duplicates cohort reads duplicate_groups and works today.';

revoke execute on function public.list_additional_insureds(text, text, text, integer, integer) from anon, public;
grant  execute on function public.list_additional_insureds(text, text, text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) count_additional_insured_cohorts()
--    Triage-strip counts. pending_duplicate_groups counts GROUPS, not members.
-- ---------------------------------------------------------------------------
create or replace function public.count_additional_insured_cohorts()
returns table(total integer, pending_duplicate_groups integer, missing_address integer, never_used integer)
language sql stable security definer
set search_path to 'public'
as $function$
  select
    (select count(*)::int
       from public.additional_insureds ai
      where ai.deleted_at is null and ai.merged_into_id is null
        and (auth.uid() is null or public.is_agency_member(ai.agency_workspace_id))
    ) as total,
    -- Counts GROUPS (one per possible-duplicate pair/cluster), not members.
    (select count(*)::int
       from public.duplicate_groups g
      where g.entity_type = 'additional_insureds' and g.status = 'pending'
    ) as pending_duplicate_groups,
    (select count(*)::int
       from public.additional_insureds ai
      where ai.deleted_at is null and ai.merged_into_id is null
        and (ai.address_line1 is null or btrim(ai.address_line1) = '')
        and (auth.uid() is null or public.is_agency_member(ai.agency_workspace_id))
    ) as missing_address,
    -- DRIFT: public.certificates absent (Phase 5) -> never_used degrades to the
    -- full active count until the post-issuance wire-up.
    (select count(*)::int
       from public.additional_insureds ai
      where ai.deleted_at is null and ai.merged_into_id is null
        and (auth.uid() is null or public.is_agency_member(ai.agency_workspace_id))
    ) as never_used
  where (auth.uid() is null or public.is_staff());
$function$;

comment on function public.count_additional_insured_cohorts() is
  'Triage-strip counts for the Additional Insureds page. pending_duplicate_groups counts GROUPS not members. never_used degrades to the full active count until public.certificates ships (Phase 5).';

revoke execute on function public.count_additional_insured_cohorts() from anon, public;
grant  execute on function public.count_additional_insured_cohorts() to authenticated;
