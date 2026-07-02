-- Relationship Graph — Phase 1: the edge table (the spine)
-- One typed, directional edge between two accounts collapses ownership, spouse,
-- parent/sub and "same person" into a single model keyed to accounts.id.
-- Households stay the set-grouping container (household_rollup); edges carry the
-- pairwise facts ("Lance owns Elite RC", "Jane spouse of John").
--
-- Additive. Backfills spouse_name strings that resolve to a real account, and seeds
-- the flagship owner link. No data is deleted.

-- 1) The edge table ---------------------------------------------------------------
create table if not exists public.account_relationships (
  id            uuid primary key default gen_random_uuid(),
  from_account  uuid not null references public.accounts(id) on delete cascade,
  to_account    uuid not null references public.accounts(id) on delete cascade,
  rel_type      text not null
                  check (rel_type in ('owns','household_member','spouse','parent_company','same_as','related')),
  role          text,                    -- free attr: 'Managing Member','Guarantor','Additional Insured'
  ownership_pct numeric,                 -- nullable; for 'owns'
  is_primary    boolean not null default false,
  note          text,
  source        text not null default 'manual'
                  check (source in ('manual','suggested','import','spouse_backfill','merge')),
  confidence    numeric,                 -- for suggested edges
  created_by    uuid,
  created_at    timestamptz not null default now(),
  constraint account_relationships_no_self check (from_account <> to_account)
);
comment on table public.account_relationships is
  'Typed directional edges between accounts (owns, spouse, parent_company, same_as, related, household_member). Canonical direction: owner = from, owned = to; read inverse via label swap.';

-- canonical direction; symmetric types (spouse, same_as) store one row
create unique index if not exists account_rel_unique
  on public.account_relationships (least(from_account, to_account), greatest(from_account, to_account), rel_type);
create index if not exists account_rel_from on public.account_relationships (from_account);
create index if not exists account_rel_to   on public.account_relationships (to_account);

-- 2) Read RPC: both directions, with the OTHER account resolved + rollups ----------
create or replace function public.get_account_relationships(p_account_id uuid)
returns table(
  relationship_id uuid,
  direction text,
  rel_type text,
  display_label text,
  role text,
  is_primary boolean,
  source text,
  note text,
  other_account_id uuid,
  other_name text,
  other_goes_by text,
  other_type text,
  other_status text,
  other_policies_count integer,
  other_active_premium numeric,
  other_next_expiration date
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    r.id,
    case when r.from_account = p_account_id then 'outgoing' else 'incoming' end,
    r.rel_type,
    case r.rel_type
      when 'owns'           then case when r.from_account = p_account_id then 'Owner of' else 'Owned by' end
      when 'parent_company' then case when r.from_account = p_account_id then 'Parent of' else 'Subsidiary of' end
      when 'spouse'         then 'Spouse'
      when 'household_member' then 'Household'
      when 'same_as'        then 'Same as'
      else 'Related'
    end,
    r.role,
    r.is_primary,
    r.source,
    r.note,
    o.id,
    o.name,
    o.goes_by,
    o.type::text,
    o.account_status::text,
    coalesce((select count(*)::int from public.policies p
                where p.account_id = o.id and p.deleted_at is null), 0),
    (select sum(p.premium) from public.policies p
       where p.account_id = o.id and p.deleted_at is null and p.status = 'active'),
    (select min(p.expiration_date) from public.policies p
       where p.account_id = o.id and p.deleted_at is null and p.status = 'active')
  from public.account_relationships r
  join public.accounts o
    on o.id = case when r.from_account = p_account_id then r.to_account else r.from_account end
  where (r.from_account = p_account_id or r.to_account = p_account_id)
    and o.deleted_at is null
  order by r.is_primary desc, r.rel_type, o.name;
$function$;

grant execute on function public.get_account_relationships(uuid) to authenticated;

-- 3) RLS — staff (any active workspace membership) ---------------------------------
alter table public.account_relationships enable row level security;

drop policy if exists account_rel_select on public.account_relationships;
create policy account_rel_select on public.account_relationships
  for select to authenticated
  using (exists (select 1 from public.agency_workspace_memberships m
                   where m.user_id = auth.uid() and m.status = 'active'));

drop policy if exists account_rel_insert on public.account_relationships;
create policy account_rel_insert on public.account_relationships
  for insert to authenticated
  with check (exists (select 1 from public.agency_workspace_memberships m
                        where m.user_id = auth.uid() and m.status = 'active'));

drop policy if exists account_rel_update on public.account_relationships;
create policy account_rel_update on public.account_relationships
  for update to authenticated
  using (exists (select 1 from public.agency_workspace_memberships m
                   where m.user_id = auth.uid() and m.status = 'active'))
  with check (exists (select 1 from public.agency_workspace_memberships m
                        where m.user_id = auth.uid() and m.status = 'active'));

drop policy if exists account_rel_delete on public.account_relationships;
create policy account_rel_delete on public.account_relationships
  for delete to authenticated
  using (exists (select 1 from public.agency_workspace_memberships m
                   where m.user_id = auth.uid() and m.status = 'active'));

grant select, insert, update, delete on public.account_relationships to authenticated;
grant all on public.account_relationships to service_role;

-- 4) Backfill spouse edges from spouse_name strings that resolve to a real account --
--    Only where spouse_name exactly matches (case/space-normalized) a live account.
insert into public.account_relationships (from_account, to_account, rel_type, source, note)
select pairs.least_id, pairs.greatest_id, 'spouse', 'spouse_backfill', 'Backfilled from spouse_name'
from (
  select distinct least(a.id, m.id) as least_id, greatest(a.id, m.id) as greatest_id
  from public.accounts a
  join public.accounts m
    on m.deleted_at is null
   and m.id <> a.id
   and lower(btrim(m.name)) = lower(btrim(a.spouse_name))
  where a.deleted_at is null
    and a.spouse_name is not null
    and btrim(a.spouse_name) <> ''
) pairs
on conflict do nothing;

-- 5) Seed the flagship owner link: David "Lance" McDonald owns Elite RC Productions -
insert into public.account_relationships
  (from_account, to_account, rel_type, role, is_primary, source, note)
values
  ('e0084ed5-5f71-4af7-baa8-82bb10e9fae7',  -- David "Lance" McDonald (person)
   '55d3eeae-babd-4e02-9c55-da17f1ea09eb',  -- Elite Rc Productions Llc (commercial)
   'owns', 'Owner', true, 'manual',
   'David "Lance" McDonald owns Elite RC Productions')
on conflict do nothing;
