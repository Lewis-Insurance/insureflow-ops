-- Relationship Graph — Phase 2: link suggestions (staging; never auto-commit)
-- A nightly pass proposes edges from signals already in the data. A human confirms
-- every edge. Suggestions live in their own table so unconfirmed guesses never
-- pollute the real graph, RLS, or counts.

-- 1) Staging table ----------------------------------------------------------------
create table if not exists public.account_relationship_suggestions (
  id            uuid primary key default gen_random_uuid(),
  from_account  uuid not null references public.accounts(id) on delete cascade,
  to_account    uuid not null references public.accounts(id) on delete cascade,
  rel_type      text not null
                  check (rel_type in ('owns','household_member','spouse','parent_company','same_as','related')),
  signal        text not null,   -- shared_phone | shared_address | surname_business | business_email_name | spouse_name
  reason        text,
  confidence    numeric not null default 0.5,
  status        text not null default 'pending'
                  check (status in ('pending','confirmed','dismissed')),
  reviewed_by   uuid,
  reviewed_at   timestamptz,
  created_relationship_id uuid references public.account_relationships(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint ars_no_self check (from_account <> to_account)
);
comment on table public.account_relationship_suggestions is
  'Proposed account_relationships from the nightly suggest pass. Never auto-committed; confirm promotes to a source=suggested edge.';

create unique index if not exists ars_unique
  on public.account_relationship_suggestions
     (least(from_account, to_account), greatest(from_account, to_account), rel_type);
create index if not exists ars_from   on public.account_relationship_suggestions (from_account);
create index if not exists ars_to     on public.account_relationship_suggestions (to_account);
create index if not exists ars_status on public.account_relationship_suggestions (status);

-- 2) List pending suggestions for one account (other account resolved) -------------
create or replace function public.get_account_link_suggestions(p_account_id uuid)
returns table(
  suggestion_id uuid,
  direction text,
  rel_type text,
  suggested_label text,
  signal text,
  reason text,
  confidence numeric,
  other_account_id uuid,
  other_name text,
  other_goes_by text,
  other_type text,
  other_policies_count integer,
  other_active_premium numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    s.id,
    case when s.from_account = p_account_id then 'outgoing' else 'incoming' end,
    s.rel_type,
    case s.rel_type
      when 'owns'           then case when s.from_account = p_account_id then 'Owner of' else 'Owned by' end
      when 'parent_company' then case when s.from_account = p_account_id then 'Parent of' else 'Subsidiary of' end
      when 'spouse'         then 'Spouse'
      when 'household_member' then 'Household'
      when 'same_as'        then 'Same as'
      else 'Related'
    end,
    s.signal,
    s.reason,
    s.confidence,
    o.id,
    o.name,
    o.goes_by,
    o.type::text,
    coalesce((select count(*)::int from public.policies p
                where p.account_id = o.id and p.deleted_at is null), 0),
    (select sum(p.premium) from public.policies p
       where p.account_id = o.id and p.deleted_at is null and p.status = 'active')
  from public.account_relationship_suggestions s
  join public.accounts o
    on o.id = case when s.from_account = p_account_id then s.to_account else s.from_account end
  where s.status = 'pending'
    and (s.from_account = p_account_id or s.to_account = p_account_id)
    and o.deleted_at is null
  order by s.confidence desc, o.name;
$function$;

grant execute on function public.get_account_link_suggestions(uuid) to authenticated;

-- 3) Confirm a suggestion -> promote to a real (source=suggested) edge --------------
create or replace function public.confirm_relationship_suggestion(p_suggestion_id uuid, p_role text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s record;
  v_new_id uuid;
begin
  select * into s from public.account_relationship_suggestions where id = p_suggestion_id;
  if not found then
    raise exception 'Suggestion % not found', p_suggestion_id;
  end if;

  if s.status = 'confirmed' and s.created_relationship_id is not null then
    return s.created_relationship_id;
  end if;

  insert into public.account_relationships
    (from_account, to_account, rel_type, role, source, confidence, created_by, note)
  values
    (s.from_account, s.to_account, s.rel_type, p_role, 'suggested', s.confidence, auth.uid(), s.reason)
  on conflict do nothing
  returning id into v_new_id;

  if v_new_id is null then
    select id into v_new_id from public.account_relationships
      where least(from_account, to_account) = least(s.from_account, s.to_account)
        and greatest(from_account, to_account) = greatest(s.from_account, s.to_account)
        and rel_type = s.rel_type
      limit 1;
  end if;

  update public.account_relationship_suggestions
     set status = 'confirmed', reviewed_by = auth.uid(), reviewed_at = now(),
         created_relationship_id = v_new_id, updated_at = now()
   where id = p_suggestion_id;

  return v_new_id;
end;
$function$;

grant execute on function public.confirm_relationship_suggestion(uuid, text) to authenticated;

-- 4) RLS — staff (any active workspace membership) ---------------------------------
alter table public.account_relationship_suggestions enable row level security;

drop policy if exists ars_select on public.account_relationship_suggestions;
create policy ars_select on public.account_relationship_suggestions
  for select to authenticated
  using (exists (select 1 from public.agency_workspace_memberships m
                   where m.user_id = auth.uid() and m.status = 'active'));

drop policy if exists ars_update on public.account_relationship_suggestions;
create policy ars_update on public.account_relationship_suggestions
  for update to authenticated
  using (exists (select 1 from public.agency_workspace_memberships m
                   where m.user_id = auth.uid() and m.status = 'active'))
  with check (exists (select 1 from public.agency_workspace_memberships m
                        where m.user_id = auth.uid() and m.status = 'active'));

-- inserts come from the edge function (service role); no authenticated insert policy
grant select, update on public.account_relationship_suggestions to authenticated;
grant all on public.account_relationship_suggestions to service_role;
