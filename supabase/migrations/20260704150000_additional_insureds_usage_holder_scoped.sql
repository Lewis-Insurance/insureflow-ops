-- Fix: Additional Insureds usage must be keyed on certificates.holder_id ALONE.
--
-- Migration 20260704140000 wired the three Additional Insureds readers to real
-- certificate history, but scoped each usage read with an extra predicate
--   and c.agency_workspace_id = ai.agency_workspace_id
-- on the theory that it kept a cert from "leaking" into another workspace's usage
-- figure. That predicate is wrong: it silently DROPS legitimate usage.
--
-- Why it drops usage (there is no invariant that cert.workspace == holder.workspace):
--   * Issuance derives certificates.agency_workspace_id from the ACCOUNT, with an
--     orphan fallback to the oldest workspace (finalize_certificate_issue,
--     20260704130000 L436-439). It is NOT derived from the holder. The holder's
--     own agency_workspace_id is derived independently from the creating user's
--     membership (additional_insureds_derive_workspace, 20260704000000).
--   * The Additional Insureds merge reparents certificates.holder_id from loser to
--     survivor but deliberately does NOT touch certificates.agency_workspace_id and
--     does NOT union the survivor's workspace (_do_additional_insured_merge,
--     20260704000300: "agency_workspace_id is NOT unioned; survivor keeps its own").
--     So a cert whose holder_id now points at the survivor can still carry the
--     loser-account's workspace.
-- In either case c.holder_id = ai.id holds (the cert genuinely belongs to this
-- holder) yet c.agency_workspace_id <> ai.agency_workspace_id, so the predicate
-- reports usage_count 0 and the holder falls into the never_used cleanup cohort
-- even though it has issued certificates. That is the reported Medium bug.
--
-- Why removing it leaks nothing: usage_count / last_used_at / never_used are
-- per-holder scalars attached to a single ai.id, and each function already gates
-- the ai rows by is_staff() AND is_agency_member(ai.agency_workspace_id). The
-- holder row itself is the tenant boundary; counting the certs that reference that
-- one already-authorized holder cannot surface another tenant's data. holder_id
-- fully determines the holder (and therefore the workspace); the extra predicate
-- adds no isolation, only false negatives.
--
-- This CREATE OR REPLACE restores the byte-for-byte bodies from 20260704140000
-- with ONLY the workspace predicate removed (3 sites) and the comments corrected;
-- there is no other behavioral drift. Applied to prod while certificates and
-- additional_insureds are both empty, so no data is affected.
--
-- Depends on: public.certificates, additional_insureds, duplicate_groups,
-- is_staff, is_agency_member, pg_trgm. Supersedes the usage reads in 20260704140000.

-- ---------------------------------------------------------------------------
-- 1) search_additional_insureds(p_q, p_limit) -- usage keyed on holder_id only
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
    u.usage_count,
    u.last_used_at,
    case
      when ai.normalized_name = public.normalize_entity_name((select term from q)) then 'same normalized name'
      when ai.name  ilike '%' || (select term from q) || '%' then 'name'
      when ai.email ilike '%' || (select term from q) || '%' then 'email'
      when ai.phone ilike '%' || (select term from q) || '%' then 'phone'
      else 'fuzzy: ' || ai.name
    end as match_reason,
    similarity(lower(ai.name), lower((select term from q))) as score
  from public.additional_insureds ai
  cross join lateral (
    select count(*)::int as usage_count, max(c.issued_at) as last_used_at
      from public.certificates c
     where c.holder_id = ai.id
  ) u
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
      or (length((select term from q)) >= 3 and lower(ai.name) % lower((select term from q)))
    )
  order by
    (case when ai.name ilike (select term from q) || '%' then 1 else 0 end) desc,
    score desc nulls last, ai.name asc
  limit p_limit;
$function$;

comment on function public.search_additional_insureds(text, integer) is
  'Trigram + ILIKE typeahead over the additional_insureds directory. % in WHERE uses the GIN trgm index. Tombstoned/merged rows never surface. Backs both the drawer typeahead and the /certificates holder picker. usage_count/last_used_at are real certificate-backed figures keyed on certificates.holder_id (the holder row is already tenant-gated, so usage is not additionally workspace-filtered).';

revoke execute on function public.search_additional_insureds(text, integer) from anon, public;
grant  execute on function public.search_additional_insureds(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) list_additional_insureds(...) -- usage + never_used keyed on holder_id only
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
    u.usage_count,
    u.last_used_at,
    exists (
      select 1 from public.duplicate_groups g
      where g.entity_type = 'additional_insureds'
        and g.status = 'pending'
        and ai.id = any(g.entity_ids)
    ) as has_pending_duplicate,
    ai.created_at
  from public.additional_insureds ai
  cross join lateral (
    select count(*)::int as usage_count, max(c.issued_at) as last_used_at
      from public.certificates c
     where c.holder_id = ai.id
  ) u
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
      or (p_cohort = 'never_used' and u.usage_count = 0)
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
  'Filtered Additional Insureds directory list (agency-wide, not per-customer). Optional q (ILIKE/trgm), kind, and cohort (missing_address|never_used|duplicates). usage_count/last_used_at are real certificate-backed figures keyed on certificates.holder_id; the never_used cohort selects holders with zero certificates; the duplicates cohort reads duplicate_groups.';

revoke execute on function public.list_additional_insureds(text, text, text, integer, integer) from anon, public;
grant  execute on function public.list_additional_insureds(text, text, text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) count_additional_insured_cohorts() -- never_used keyed on holder_id only
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
    -- Real never_used: active holders with zero certificates. Keyed on holder_id
    -- only -- the cert's own workspace can diverge from the holder's (issuance
    -- derives it from the account; merge reparents holder_id but not the cert
    -- workspace), so a workspace predicate here would false-negative a holder that
    -- does have certificates into never_used.
    (select count(*)::int
       from public.additional_insureds ai
      where ai.deleted_at is null and ai.merged_into_id is null
        and (auth.uid() is null or public.is_agency_member(ai.agency_workspace_id))
        and not exists (
          select 1 from public.certificates c
           where c.holder_id = ai.id
        )
    ) as never_used
  where (auth.uid() is null or public.is_staff());
$function$;

comment on function public.count_additional_insured_cohorts() is
  'Triage-strip counts for the Additional Insureds page. pending_duplicate_groups counts GROUPS not members. never_used counts active holders with zero certificates by certificates.holder_id (certificate-backed since Phase 5).';

revoke execute on function public.count_additional_insured_cohorts() from anon, public;
grant  execute on function public.count_additional_insured_cohorts() to authenticated;
