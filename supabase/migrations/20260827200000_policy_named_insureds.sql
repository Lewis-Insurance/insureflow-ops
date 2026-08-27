-- Policy Named Insured account membership.
-- A policy remains owned by exactly one account. This junction makes the same
-- policy visible to other insured accounts without copying policy or premium data.

create table public.policy_named_insureds (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policies(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (policy_id, account_id)
);

comment on table public.policy_named_insureds is
  'Named Insured account membership on a policy. Orthogonal to account_relationships and to additional_insureds (COI holders).';

create index idx_policy_named_insureds_account_id
  on public.policy_named_insureds (account_id);

create index idx_policy_named_insureds_policy_id
  on public.policy_named_insureds (policy_id);

create or replace function public.guard_policy_named_insured_owner()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_owner_account_id uuid;
begin
  select p.account_id
    into v_owner_account_id
  from public.policies p
  where p.id = new.policy_id;

  if v_owner_account_id is null then
    raise exception 'Policy does not exist' using errcode = '23503';
  end if;

  if new.account_id = v_owner_account_id then
    raise exception 'Policy owner cannot be a Named Insured junction row' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger policy_named_insureds_owner_guard
  before insert or update on public.policy_named_insureds
  for each row execute function public.guard_policy_named_insured_owner();

alter table public.policy_named_insureds enable row level security;

create policy "Staff can view policy named insureds"
  on public.policy_named_insureds
  for select
  to authenticated
  using (
    public.is_staff()
    and (
      exists (
        select 1
        from public.policies p
        join public.accounts owner_account on owner_account.id = p.account_id
        join public.agency_workspace_memberships awm
          on awm.agency_workspace_id = owner_account.agency_workspace_id
        where p.id = policy_named_insureds.policy_id
          and awm.user_id = auth.uid()
          and awm.status = 'active'
      )
      or exists (
        select 1
        from public.accounts linked_account
        join public.agency_workspace_memberships awm
          on awm.agency_workspace_id = linked_account.agency_workspace_id
        where linked_account.id = policy_named_insureds.account_id
          and awm.user_id = auth.uid()
          and awm.status = 'active'
      )
    )
  );

create policy "Staff can insert policy named insureds"
  on public.policy_named_insureds
  for insert
  to authenticated
  with check (
    public.is_staff()
    and exists (
      select 1
      from public.policies p
      join public.accounts owner_account on owner_account.id = p.account_id
      join public.accounts linked_account on linked_account.id = policy_named_insureds.account_id
      join public.agency_workspace_memberships awm
        on awm.agency_workspace_id = owner_account.agency_workspace_id
      where p.id = policy_named_insureds.policy_id
        and linked_account.agency_workspace_id = owner_account.agency_workspace_id
        and awm.user_id = auth.uid()
        and awm.status = 'active'
        and awm.role in ('owner', 'admin', 'producer', 'csr')
    )
  );

create policy "Staff can delete policy named insureds"
  on public.policy_named_insureds
  for delete
  to authenticated
  using (
    public.is_staff()
    and exists (
      select 1
      from public.policies p
      join public.accounts owner_account on owner_account.id = p.account_id
      join public.agency_workspace_memberships awm
        on awm.agency_workspace_id = owner_account.agency_workspace_id
      where p.id = policy_named_insureds.policy_id
        and awm.user_id = auth.uid()
        and awm.status = 'active'
        and awm.role in ('owner', 'admin', 'producer', 'csr')
    )
  );

revoke all on public.policy_named_insureds from anon;
grant select, insert, delete on public.policy_named_insureds to authenticated;

drop policy if exists "Users can view policies for their workspace accounts" on public.policies;

create policy "Users can view policies for their workspace accounts"
  on public.policies
  for select
  using (
    exists (
      select 1
      from public.accounts a
      join public.agency_workspace_memberships awm
        on awm.agency_workspace_id = a.agency_workspace_id
      where a.id = policies.account_id
        and awm.user_id = auth.uid()
        and awm.status = 'active'
    )
    or exists (
      select 1
      from public.policy_named_insureds pni
      join public.accounts linked_account on linked_account.id = pni.account_id
      join public.agency_workspace_memberships awm
        on awm.agency_workspace_id = linked_account.agency_workspace_id
      where pni.policy_id = policies.id
        and awm.user_id = auth.uid()
        and awm.status = 'active'
    )
  );

create or replace function public.list_account_policies(p_account_id uuid)
returns table (
  id uuid,
  account_id uuid,
  membership text,
  owner_account_id uuid,
  owner_account_name text,
  policy_number text,
  line_of_business text,
  status text,
  premium numeric,
  effective_date date,
  expiration_date date,
  named_insured text,
  carrier_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  select a.agency_workspace_id
    into v_workspace_id
  from public.accounts a
  where a.id = p_account_id
    and a.deleted_at is null;

  if v_workspace_id is null or not public.is_agency_member(v_workspace_id) then
    raise exception 'Active workspace membership required' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.account_id,
    'owner'::text as membership,
    owner_account.id as owner_account_id,
    owner_account.name as owner_account_name,
    p.policy_number,
    p.line_of_business,
    p.status::text,
    p.premium,
    p.effective_date,
    p.expiration_date,
    p.named_insured,
    c.name as carrier_name
  from public.policies p
  join public.accounts owner_account on owner_account.id = p.account_id
  left join public.carriers c on c.id = p.carrier_id
  where p.account_id = p_account_id
    and p.deleted_at is null

  union all

  select
    p.id,
    p.account_id,
    'named_insured'::text as membership,
    owner_account.id as owner_account_id,
    owner_account.name as owner_account_name,
    p.policy_number,
    p.line_of_business,
    p.status::text,
    p.premium,
    p.effective_date,
    p.expiration_date,
    p.named_insured,
    c.name as carrier_name
  from public.policy_named_insureds pni
  join public.policies p on p.id = pni.policy_id
  join public.accounts owner_account on owner_account.id = p.account_id
  left join public.carriers c on c.id = p.carrier_id
  where pni.account_id = p_account_id
    and p.deleted_at is null;
end;
$$;

create or replace function public.list_policy_named_insureds(p_policy_id uuid)
returns table (
  account_id uuid,
  name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  select owner_account.agency_workspace_id
    into v_workspace_id
  from public.policies p
  join public.accounts owner_account on owner_account.id = p.account_id
  where p.id = p_policy_id
    and p.deleted_at is null;

  if v_workspace_id is null or not public.is_agency_member(v_workspace_id) then
    raise exception 'Active workspace membership required' using errcode = '42501';
  end if;

  return query
  select linked_account.id, linked_account.name, pni.created_at
  from public.policy_named_insureds pni
  join public.accounts linked_account on linked_account.id = pni.account_id
  where pni.policy_id = p_policy_id
    and linked_account.deleted_at is null
  order by linked_account.name, linked_account.id;
end;
$$;

create or replace function public.add_policy_named_insured(
  p_policy_id uuid,
  p_account_id uuid
)
returns public.policy_named_insureds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_account_id uuid;
  v_owner_workspace_id uuid;
  v_linked_workspace_id uuid;
  v_result public.policy_named_insureds;
begin
  if not public.is_staff() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  select p.account_id, owner_account.agency_workspace_id
    into v_owner_account_id, v_owner_workspace_id
  from public.policies p
  join public.accounts owner_account
    on owner_account.id = p.account_id
   and owner_account.deleted_at is null
  where p.id = p_policy_id
    and p.deleted_at is null;

  if v_owner_account_id is null then
    raise exception 'Active policy and owner account required' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.agency_workspace_memberships awm
    where awm.agency_workspace_id = v_owner_workspace_id
      and awm.user_id = auth.uid()
      and awm.status = 'active'
      and awm.role in ('owner', 'admin', 'producer', 'csr')
  ) then
    raise exception 'Policy workspace write role required' using errcode = '42501';
  end if;

  select a.agency_workspace_id
    into v_linked_workspace_id
  from public.accounts a
  where a.id = p_account_id
    and a.deleted_at is null;

  if v_linked_workspace_id is null then
    raise exception 'Active linked account required' using errcode = 'P0002';
  end if;

  if p_account_id = v_owner_account_id then
    raise exception 'Policy owner cannot be a Named Insured junction row' using errcode = '23514';
  end if;

  if v_linked_workspace_id <> v_owner_workspace_id then
    raise exception 'Policy and linked account must share a workspace' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.policy_named_insureds pni
    where pni.policy_id = p_policy_id
      and pni.account_id = p_account_id
  ) then
    raise exception 'Named Insured account is already linked' using errcode = '23505';
  end if;

  insert into public.policy_named_insureds (policy_id, account_id, created_by)
  values (p_policy_id, p_account_id, auth.uid())
  returning * into v_result;

  return v_result;
end;
$$;

create or replace function public.remove_policy_named_insured(
  p_policy_id uuid,
  p_account_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_deleted_count bigint;
begin
  if not public.is_staff() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  select owner_account.agency_workspace_id
    into v_workspace_id
  from public.policies p
  join public.accounts owner_account
    on owner_account.id = p.account_id
   and owner_account.deleted_at is null
  where p.id = p_policy_id
    and p.deleted_at is null;

  if v_workspace_id is null then
    raise exception 'Active policy and owner account required' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.agency_workspace_memberships awm
    where awm.agency_workspace_id = v_workspace_id
      and awm.user_id = auth.uid()
      and awm.status = 'active'
      and awm.role in ('owner', 'admin', 'producer', 'csr')
  ) then
    raise exception 'Policy workspace write role required' using errcode = '42501';
  end if;

  delete from public.policy_named_insureds
  where policy_id = p_policy_id
    and account_id = p_account_id;

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count > 0;
end;
$$;

revoke all on function public.list_account_policies(uuid) from public, anon;
revoke all on function public.list_policy_named_insureds(uuid) from public, anon;
revoke all on function public.add_policy_named_insured(uuid, uuid) from public, anon;
revoke all on function public.remove_policy_named_insured(uuid, uuid) from public, anon;

grant execute on function public.list_account_policies(uuid) to authenticated, service_role;
grant execute on function public.list_policy_named_insureds(uuid) to authenticated, service_role;
grant execute on function public.add_policy_named_insured(uuid, uuid) to authenticated, service_role;
grant execute on function public.remove_policy_named_insured(uuid, uuid) to authenticated, service_role;

-- ROLLBACK
-- revoke execute on function public.remove_policy_named_insured(uuid, uuid) from authenticated, service_role;
-- revoke execute on function public.add_policy_named_insured(uuid, uuid) from authenticated, service_role;
-- revoke execute on function public.list_policy_named_insureds(uuid) from authenticated, service_role;
-- revoke execute on function public.list_account_policies(uuid) from authenticated, service_role;
-- drop function if exists public.remove_policy_named_insured(uuid, uuid);
-- drop function if exists public.add_policy_named_insured(uuid, uuid);
-- drop function if exists public.list_policy_named_insureds(uuid);
-- drop function if exists public.list_account_policies(uuid);
-- drop policy if exists "Users can view policies for their workspace accounts" on public.policies;
-- create policy "Users can view policies for their workspace accounts"
--   on public.policies for select using (
--     exists (
--       select 1 from public.accounts a
--       join public.agency_workspace_memberships awm
--         on awm.agency_workspace_id = a.agency_workspace_id
--       where a.id = policies.account_id
--         and awm.user_id = auth.uid()
--         and awm.status = 'active'
--     )
--   );
-- drop table if exists public.policy_named_insureds;
-- drop function if exists public.guard_policy_named_insured_owner();
