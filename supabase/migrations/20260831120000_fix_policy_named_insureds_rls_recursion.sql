-- Fix: infinite recursion in RLS between public.policies and public.policy_named_insureds.
--
-- NEEDS LANDEN APPROVAL BEFORE PROD APPLY
--
-- Root cause (introduced by 20260827200000_policy_named_insureds.sql, PR #164):
--   * the SELECT policy on public.policies reads public.policy_named_insureds
--   * every RLS policy on public.policy_named_insureds reads public.policies
--   Postgres detects the cycle while expanding the policies and aborts the whole
--   statement with: infinite recursion detected in policy for relation "policies".
--
-- Blast radius of the bug: every direct client read of public.policies fails, and so
-- does every read of the ~150 policy_* / claims child tables whose own RLS policies
-- join back to public.policies. Only SECURITY DEFINER RPCs (list_account_policies,
-- search_accounts) kept working, which is why the customer file Policies tab still
-- rendered while Record Payment, AO Renewals and Claims went empty or errored.
--
-- Fix: neither table's RLS may name the other. Both directions now go through
-- SECURITY DEFINER helpers owned by postgres (rolbypassrls = true), so the inner
-- lookups run with RLS disabled and the rewriter never sees a cycle.
--
-- Visibility is unchanged: staff still see owned policies plus policies their
-- workspace holds a Named Insured link on, and the Named Insured junction is still
-- staff-only and workspace-scoped.

-- Owner account of a policy, ignoring RLS. Used by the junction guard trigger.
create or replace function public.policy_owner_account_id(p_policy_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.account_id
  from public.policies p
  where p.id = p_policy_id
    and p.deleted_at is null
$$;

-- Workspace that owns a policy, ignoring RLS.
create or replace function public.policy_owner_workspace_id(p_policy_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select owner_account.agency_workspace_id
  from public.policies p
  join public.accounts owner_account on owner_account.id = p.account_id
  where p.id = p_policy_id
    and p.deleted_at is null
$$;

-- Workspace of an account, ignoring RLS.
create or replace function public.account_agency_workspace_id(p_account_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.agency_workspace_id
  from public.accounts a
  where a.id = p_account_id
    and a.deleted_at is null
$$;

-- Policy ids the calling user can reach because one of their workspace accounts is a
-- Named Insured on the policy. Set-returning and uncorrelated on purpose: the planner
-- evaluates it once per statement instead of once per policy row.
create or replace function public.named_insured_policy_ids_for_current_user()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select pni.policy_id
  from public.policy_named_insureds pni
  join public.accounts linked_account on linked_account.id = pni.account_id
  join public.agency_workspace_memberships awm
    on awm.agency_workspace_id = linked_account.agency_workspace_id
  where awm.user_id = auth.uid()
    and awm.status = 'active'
$$;

revoke all on function public.policy_owner_account_id(uuid) from public, anon;
revoke all on function public.policy_owner_workspace_id(uuid) from public, anon;
revoke all on function public.account_agency_workspace_id(uuid) from public, anon;
revoke all on function public.named_insured_policy_ids_for_current_user() from public;

grant execute on function public.policy_owner_account_id(uuid) to authenticated, service_role;
grant execute on function public.policy_owner_workspace_id(uuid) to authenticated, service_role;
grant execute on function public.account_agency_workspace_id(uuid) to authenticated, service_role;
-- The policies SELECT policy applies to role public, so anon must be able to evaluate
-- this helper. It returns no rows when auth.uid() is null, so it exposes nothing.
grant execute on function public.named_insured_policy_ids_for_current_user() to authenticated, anon, service_role;

-- The junction guard trigger read public.policies directly, which pulled RLS (and the
-- cycle) into every INSERT. Route it through the definer helper instead.
create or replace function public.guard_policy_named_insured_owner()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_owner_account_id uuid;
begin
  v_owner_account_id := public.policy_owner_account_id(new.policy_id);

  if v_owner_account_id is null then
    raise exception 'Policy does not exist' using errcode = '23503';
  end if;

  if new.account_id = v_owner_account_id then
    raise exception 'Policy owner cannot be a Named Insured junction row' using errcode = '23514';
  end if;

  return new;
end;
$$;

-- Side 1: public.policies must not name public.policy_named_insureds.
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
    or policies.id in (select public.named_insured_policy_ids_for_current_user())
  );

-- Side 2: public.policy_named_insureds must not name public.policies.
drop policy if exists "Staff can view policy named insureds" on public.policy_named_insureds;

create policy "Staff can view policy named insureds"
  on public.policy_named_insureds
  for select
  to authenticated
  using (
    public.is_staff()
    and (
      exists (
        select 1
        from public.agency_workspace_memberships awm
        where awm.agency_workspace_id
              = public.policy_owner_workspace_id(policy_named_insureds.policy_id)
          and awm.user_id = auth.uid()
          and awm.status = 'active'
      )
      or exists (
        select 1
        from public.agency_workspace_memberships awm
        where awm.agency_workspace_id
              = public.account_agency_workspace_id(policy_named_insureds.account_id)
          and awm.user_id = auth.uid()
          and awm.status = 'active'
      )
    )
  );

drop policy if exists "Staff can insert policy named insureds" on public.policy_named_insureds;

create policy "Staff can insert policy named insureds"
  on public.policy_named_insureds
  for insert
  to authenticated
  with check (
    public.is_staff()
    and public.policy_owner_workspace_id(policy_named_insureds.policy_id) is not null
    and public.account_agency_workspace_id(policy_named_insureds.account_id)
        = public.policy_owner_workspace_id(policy_named_insureds.policy_id)
    and exists (
      select 1
      from public.agency_workspace_memberships awm
      where awm.agency_workspace_id
            = public.policy_owner_workspace_id(policy_named_insureds.policy_id)
        and awm.user_id = auth.uid()
        and awm.status = 'active'
        and awm.role in ('owner', 'admin', 'producer', 'csr')
    )
  );

drop policy if exists "Staff can delete policy named insureds" on public.policy_named_insureds;

create policy "Staff can delete policy named insureds"
  on public.policy_named_insureds
  for delete
  to authenticated
  using (
    public.is_staff()
    and exists (
      select 1
      from public.agency_workspace_memberships awm
      where awm.agency_workspace_id
            = public.policy_owner_workspace_id(policy_named_insureds.policy_id)
        and awm.user_id = auth.uid()
        and awm.status = 'active'
        and awm.role in ('owner', 'admin', 'producer', 'csr')
    )
  );

-- ROLLBACK: re-run the policy/function bodies from
-- supabase/migrations/20260827200000_policy_named_insureds.sql. Note that doing so
-- restores the recursion, so only roll back together with that migration.
