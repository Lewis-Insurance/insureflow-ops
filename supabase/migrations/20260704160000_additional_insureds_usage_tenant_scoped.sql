-- Fix: Additional Insureds usage must be scoped to certificates the CALLER may read.
--
-- History of this predicate:
--   * 20260704140000 scoped usage with `c.agency_workspace_id = ai.agency_workspace_id`
--     (the HOLDER's workspace). That over-hides after a cross-workspace merge and
--     for multi-workspace staff, so it was removed in 20260704150000.
--   * 20260704150000 keyed usage on `c.holder_id = ai.id` ALONE. That went too far:
--     because a certificate's agency_workspace_id is account-derived and need NOT
--     match its holder's (issuance derives it from the account; the merge reparents
--     holder_id but not the cert workspace; and generate-certificate historically
--     let an out-of-workspace holder be attached to an account), an unscoped count
--     lets a SECURITY DEFINER function surface the existence / count / last_used_at
--     of a certificate the caller cannot read under the certificates_select RLS
--     policy (is_staff() AND is_agency_member(certificates.agency_workspace_id),
--     20260704130000). That is a cross-tenant information disclosure.
--
-- Correct rule: count exactly the certificates the caller is authorized to read.
-- The three readers already enforce is_staff() at the function level, so mirroring
-- certificates_select reduces to adding is_agency_member(c.agency_workspace_id) to
-- each usage read (with the same `auth.uid() is null` service/cron bypass the
-- surrounding gates use). This is keyed on the CALLER's membership, not on
-- holder-workspace equality, so:
--   * No leak: usage never reflects a cert outside the caller's readable tenants
--     (exactly the certificates_select boundary).
--   * No false never_used for authorized certs: a same-workspace holder's certs
--     (including certs reparented onto a survivor by a same-workspace merge) are in
--     a workspace the viewer belongs to, so they still count. Only certs the viewer
--     is not entitled to see are excluded from usage / never_used, which is correct.
--
-- In the current single-workspace tenant this is behavior-preserving (every cert,
-- holder, and caller share the one workspace, so the predicate is always true).
-- CREATE OR REPLACE over the three readers; bodies identical to 20260704150000
-- apart from the re-added, correctly-keyed predicate (3 sites) and comments.
--
-- Depends on: public.certificates, additional_insureds, duplicate_groups,
-- is_staff, is_agency_member, pg_trgm. Supersedes the usage reads in 20260704150000.

-- ---------------------------------------------------------------------------
-- 1) search_additional_insureds -- usage over caller-readable certificates
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
       and (auth.uid() is null or public.is_agency_member(c.agency_workspace_id))
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
  'Trigram + ILIKE typeahead over the additional_insureds directory. % in WHERE uses the GIN trgm index. Tombstoned/merged rows never surface. Backs both the drawer typeahead and the /certificates holder picker. usage_count/last_used_at are certificate-backed and scoped to certificates the caller may read (is_agency_member of the cert workspace, mirroring certificates_select), keyed on certificates.holder_id.';

revoke execute on function public.search_additional_insureds(text, integer) from anon, public;
grant  execute on function public.search_additional_insureds(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) list_additional_insureds -- usage + never_used over caller-readable certs
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
       and (auth.uid() is null or public.is_agency_member(c.agency_workspace_id))
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
  'Filtered Additional Insureds directory list (agency-wide, not per-customer). Optional q (ILIKE/trgm), kind, and cohort (missing_address|never_used|duplicates). usage_count/last_used_at are certificate-backed and scoped to certificates the caller may read (is_agency_member of the cert workspace, mirroring certificates_select), keyed on certificates.holder_id; the never_used cohort selects holders with zero such certificates; the duplicates cohort reads duplicate_groups.';

revoke execute on function public.list_additional_insureds(text, text, text, integer, integer) from anon, public;
grant  execute on function public.list_additional_insureds(text, text, text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) count_additional_insured_cohorts -- never_used over caller-readable certs
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
    -- Real never_used: active holders with zero certificates the caller may read.
    -- Scoped by is_agency_member(c.agency_workspace_id) (mirrors certificates_select)
    -- so it neither leaks a cert in another tenant nor hides an authorized cert.
    (select count(*)::int
       from public.additional_insureds ai
      where ai.deleted_at is null and ai.merged_into_id is null
        and (auth.uid() is null or public.is_agency_member(ai.agency_workspace_id))
        and not exists (
          select 1 from public.certificates c
           where c.holder_id = ai.id
             and (auth.uid() is null or public.is_agency_member(c.agency_workspace_id))
        )
    ) as never_used
  where (auth.uid() is null or public.is_staff());
$function$;

comment on function public.count_additional_insured_cohorts() is
  'Triage-strip counts for the Additional Insureds page. pending_duplicate_groups counts GROUPS not members. never_used counts active holders with zero certificates the caller may read (is_agency_member of the cert workspace, keyed on certificates.holder_id; certificate-backed since Phase 5).';

revoke execute on function public.count_additional_insured_cohorts() from anon, public;
grant  execute on function public.count_additional_insured_cohorts() to authenticated;
