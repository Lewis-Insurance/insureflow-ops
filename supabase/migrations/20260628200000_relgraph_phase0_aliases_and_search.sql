-- Relationship Graph — Phase 0: identity & aliases (the "goes by" fix)
-- Closes the "Lance" search bug: a producer types a name the record has never been
-- indexed under and gets nothing. Root cause: search runs on accounts.search_vector
-- (name/email/phone/tin) with an ILIKE fallback, and there is no preferred-name /
-- alias field anywhere. This adds one column + one table + alias-aware search +
-- a pg_trgm fuzzy layer (MacDonald/McDonald), then seeds the flagship case.
--
-- Additive and reversible. No data is deleted. Single-agency RLS (active staff).

begin;

-- 1) Preferred / "goes by" name on the account -----------------------------------
alter table public.accounts add column if not exists goes_by text;
comment on column public.accounts.goes_by is
  'Preferred / known-as name. Drives display (David "Lance" McDonald) and is folded into search_vector (weight A).';

-- 2) account_aliases — every name a record is known by ----------------------------
create table if not exists public.account_aliases (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts(id) on delete cascade,
  alias       text not null,
  alias_type  text not null default 'aka'
                check (alias_type in ('nickname','maiden','dba','former','misspelling','aka')),
  source      text not null default 'staff_entry',
  created_by  uuid,
  created_at  timestamptz not null default now()
);
comment on table public.account_aliases is
  'Names an account is also known by (nickname, maiden, dba, former, misspelling). Fed into alias-aware search.';

create unique index if not exists account_aliases_uq
  on public.account_aliases (account_id, lower(alias), alias_type);
create index if not exists account_aliases_account_idx
  on public.account_aliases (account_id);
create index if not exists account_aliases_alias_trgm
  on public.account_aliases using gin (lower(alias) extensions.gin_trgm_ops);

-- 3) Fuzzy layer on accounts (MacDonald ~= McDonald, typos) ------------------------
--    pg_trgm is already installed (schema: extensions). These accelerate ILIKE and
--    similarity() on the live (non-deleted) book.
create index if not exists accounts_name_trgm
  on public.accounts using gin (lower(name) extensions.gin_trgm_ops)
  where deleted_at is null;
create index if not exists accounts_goes_by_trgm
  on public.accounts using gin (lower(goes_by) extensions.gin_trgm_ops)
  where goes_by is not null and deleted_at is null;

-- 4) Fold goes_by into the accounts search vector ---------------------------------
create or replace function public.accounts_search_vector_tg()
returns trigger
language plpgsql
as $function$
BEGIN
  -- Only recompute if a searchable field actually changed
  IF TG_OP = 'UPDATE' AND (
    COALESCE(OLD.name, '')      = COALESCE(NEW.name, '') AND
    COALESCE(OLD.email, '')     = COALESCE(NEW.email, '') AND
    COALESCE(OLD.phone, '')     = COALESCE(NEW.phone, '') AND
    COALESCE(OLD.tin_last4, '') = COALESCE(NEW.tin_last4, '') AND
    COALESCE(OLD.goes_by, '')   = COALESCE(NEW.goes_by, '')
  ) THEN
    RETURN NEW;
  END IF;

  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.name, '')),      'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.goes_by, '')),   'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.email, '')),     'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.phone, '')),     'C') ||
    setweight(to_tsvector('simple', coalesce(NEW.tin_last4, '')), 'D');
  RETURN NEW;
END;
$function$;

-- Trigger must also fire when goes_by changes
drop trigger if exists accounts_search_vector_tg on public.accounts;
create trigger accounts_search_vector_tg
  before insert or update of name, email, phone, tin_last4, goes_by
  on public.accounts
  for each row execute function public.accounts_search_vector_tg();

-- 5) Make the customers list search alias-aware + fuzzy ----------------------------
--    Signature unchanged (the Customers UI depends on it). Only the q-match block
--    gains goes_by + aliases + trigram similarity.
create or replace function public.unified_customer_search(
  p_filters jsonb default '{}'::jsonb,
  p_limit integer default 25,
  p_offset integer default 0,
  p_sort text default 'updated_at_desc'::text
)
returns table(
  id uuid, account_id uuid, name text, display_name text, org_name text, type text,
  email text, phone text, primary_email text, primary_phone text, city text, state text,
  postal_code text, status text, notes_summary text, policies_count integer, balance numeric,
  last_contact_at timestamp with time zone, created_at timestamp with time zone,
  updated_at timestamp with time zone, rank real, next_expiration_at date
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
DECLARE
  filter_q text;
  filter_type text;
  filter_city text;
  filter_state text;
  filter_cohort text;
BEGIN
  filter_q := p_filters->>'q';
  filter_type := p_filters->>'type';
  filter_city := p_filters->>'city';
  filter_state := p_filters->>'state';
  filter_cohort := p_filters->>'cohort';

  RETURN QUERY
  SELECT
    a.id,
    a.id as account_id,
    a.name,
    a.name as display_name,
    null::text as org_name,
    a.type::text as type,
    a.email,
    a.phone,
    a.email as primary_email,
    a.phone as primary_phone,
    a.city,
    a.state,
    a.zip_code as postal_code,
    a.account_status::text as status,
    a.notes as notes_summary,
    COALESCE((SELECT count(*)::int FROM public.policies pol WHERE pol.account_id = a.id), 0) as policies_count,
    null::numeric as balance,
    null::timestamp with time zone as last_contact_at,
    a.created_at,
    a.updated_at,
    CASE
      WHEN filter_q IS NOT NULL AND filter_q != '' THEN
        ts_rank(a.search_vector, plainto_tsquery('simple', filter_q))
      ELSE 0.0
    END as rank,
    (SELECT min(pol.expiration_date) FROM public.policies pol
       WHERE pol.account_id = a.id AND pol.deleted_at IS NULL AND pol.status = 'active') as next_expiration_at
  FROM public.accounts a
  WHERE
    a.deleted_at IS NULL
    AND (filter_q IS NULL OR filter_q = '' OR (
      a.search_vector @@ plainto_tsquery('simple', filter_q) OR
      a.name ILIKE '%' || filter_q || '%' OR
      a.email ILIKE '%' || filter_q || '%' OR
      a.phone ILIKE '%' || filter_q || '%' OR
      a.goes_by ILIKE '%' || filter_q || '%' OR
      EXISTS (SELECT 1 FROM public.account_aliases al
                WHERE al.account_id = a.id AND al.alias ILIKE '%' || filter_q || '%') OR
      (length(filter_q) >= 3 AND extensions.similarity(a.name, filter_q) > 0.3)
    ))
    AND (filter_type IS NULL OR filter_type = '' OR a.type::text = filter_type)
    AND (filter_city IS NULL OR filter_city = '' OR a.city ILIKE '%' || filter_city || '%')
    AND (filter_state IS NULL OR filter_state = '' OR a.state ILIKE '%' || filter_state || '%')
    AND (
      filter_cohort IS NULL OR filter_cohort = '' OR filter_cohort = 'all'
      OR (filter_cohort = 'renewals_30d' AND EXISTS (
            SELECT 1 FROM public.policies p WHERE p.account_id = a.id AND p.deleted_at IS NULL
              AND p.status = 'active' AND p.expiration_date >= current_date AND p.expiration_date < current_date + 30))
      OR (filter_cohort = 'renewals_60d' AND EXISTS (
            SELECT 1 FROM public.policies p WHERE p.account_id = a.id AND p.deleted_at IS NULL
              AND p.status = 'active' AND p.expiration_date >= current_date AND p.expiration_date < current_date + 60))
      OR (filter_cohort = 'overdue' AND EXISTS (
            SELECT 1 FROM public.policies p WHERE p.account_id = a.id AND p.deleted_at IS NULL
              AND p.status = 'active' AND p.expiration_date < current_date))
      OR (filter_cohort = 'no_active_policy' AND NOT EXISTS (
            SELECT 1 FROM public.policies p WHERE p.account_id = a.id AND p.deleted_at IS NULL
              AND p.status = 'active'))
      OR (filter_cohort = 'new_30d' AND a.created_at >= now() - interval '30 days')
    )
  ORDER BY
    CASE WHEN p_sort = 'rank_desc' AND filter_q IS NOT NULL AND filter_q != '' THEN
      ts_rank(a.search_vector, plainto_tsquery('simple', filter_q))
    END DESC NULLS LAST,
    CASE WHEN p_sort = 'name_asc' THEN a.name END ASC NULLS LAST,
    CASE WHEN p_sort = 'name_desc' THEN a.name END DESC NULLS LAST,
    CASE WHEN p_sort = 'updated_at_asc' THEN a.updated_at END ASC NULLS LAST,
    CASE WHEN p_sort = 'updated_at_desc' THEN a.updated_at END DESC NULLS LAST,
    a.id
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

-- 6) search_accounts(q) — alias-aware typeahead that returns WHY it matched ---------
--    Powers the new alias-aware global/link search ("goes by Lance", "fuzzy: McDonald").
create or replace function public.search_accounts(p_q text, p_limit integer default 20)
returns table(
  account_id uuid, name text, goes_by text, type text, email text, phone text,
  city text, state text, policies_count integer, match_reason text, score real
)
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
  with q as (select nullif(trim(coalesce(p_q, '')), '') as term)
  select
    a.id as account_id,
    a.name,
    a.goes_by,
    a.type::text as type,
    a.email,
    a.phone,
    a.city,
    a.state,
    coalesce((select count(*)::int from public.policies pol
                where pol.account_id = a.id and pol.deleted_at is null), 0) as policies_count,
    case
      when a.name ilike '%' || (select term from q) || '%' then 'name'
      when a.goes_by ilike '%' || (select term from q) || '%' then 'goes by ' || a.goes_by
      when exists (select 1 from public.account_aliases al
                     where al.account_id = a.id and al.alias ilike '%' || (select term from q) || '%')
        then 'aka ' || (select al.alias from public.account_aliases al
                          where al.account_id = a.id and al.alias ilike '%' || (select term from q) || '%' limit 1)
      when a.email ilike '%' || (select term from q) || '%' then 'email'
      when a.phone ilike '%' || (select term from q) || '%' then 'phone'
      else 'fuzzy: ' || a.name
    end as match_reason,
    greatest(
      similarity(a.name, (select term from q)),
      similarity(coalesce(a.goes_by, ''), (select term from q))
    ) as score
  from public.accounts a
  where a.deleted_at is null
    and (select term from q) is not null
    and (
      a.name ilike '%' || (select term from q) || '%'
      or a.goes_by ilike '%' || (select term from q) || '%'
      or a.email ilike '%' || (select term from q) || '%'
      or a.phone ilike '%' || (select term from q) || '%'
      or exists (select 1 from public.account_aliases al
                   where al.account_id = a.id and al.alias ilike '%' || (select term from q) || '%')
      or (length((select term from q)) >= 3 and similarity(a.name, (select term from q)) > 0.3)
    )
  order by
    (case when a.name ilike (select term from q) || '%'
            or a.goes_by ilike (select term from q) || '%' then 1 else 0 end) desc,
    score desc nulls last,
    a.name asc
  limit p_limit;
$function$;

grant execute on function public.search_accounts(text, integer) to authenticated;

-- 7) RLS — staff (any active workspace membership), matching the app's convention ----
alter table public.account_aliases enable row level security;

drop policy if exists account_aliases_select on public.account_aliases;
create policy account_aliases_select on public.account_aliases
  for select to authenticated
  using (exists (select 1 from public.agency_workspace_memberships m
                   where m.user_id = auth.uid() and m.status = 'active'));

drop policy if exists account_aliases_insert on public.account_aliases;
create policy account_aliases_insert on public.account_aliases
  for insert to authenticated
  with check (exists (select 1 from public.agency_workspace_memberships m
                        where m.user_id = auth.uid() and m.status = 'active'));

drop policy if exists account_aliases_update on public.account_aliases;
create policy account_aliases_update on public.account_aliases
  for update to authenticated
  using (exists (select 1 from public.agency_workspace_memberships m
                   where m.user_id = auth.uid() and m.status = 'active'))
  with check (exists (select 1 from public.agency_workspace_memberships m
                        where m.user_id = auth.uid() and m.status = 'active'));

drop policy if exists account_aliases_delete on public.account_aliases;
create policy account_aliases_delete on public.account_aliases
  for delete to authenticated
  using (exists (select 1 from public.agency_workspace_memberships m
                   where m.user_id = auth.uid() and m.status = 'active'));

grant select, insert, update, delete on public.account_aliases to authenticated;
grant all on public.account_aliases to service_role;

-- 8) Seed the flagship case: David "Lance" McDonald --------------------------------
update public.accounts
   set goes_by = 'Lance'
 where id = 'e0084ed5-5f71-4af7-baa8-82bb10e9fae7'
   and goes_by is null;

insert into public.account_aliases (account_id, alias, alias_type, source)
values
  ('e0084ed5-5f71-4af7-baa8-82bb10e9fae7', 'Lance', 'nickname', 'seed'),
  ('e0084ed5-5f71-4af7-baa8-82bb10e9fae7', 'David McDonald', 'misspelling', 'seed')
on conflict (account_id, lower(alias), alias_type) do nothing;

commit;
