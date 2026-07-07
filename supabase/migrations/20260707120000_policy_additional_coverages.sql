-- Policy additional coverages: custom "write-in" coverage rows for a policy line.
--
-- Replaces the old free-form "Manual Details" modal (which wrote policies.coverage,
-- a blob get_master_coi never reads). Each row is a named coverage + amount tied to
-- the EXACT policy and one ACORD 25 line, so it maps to the form's blank coverage
-- rows (e.g. the extra GL rows under PRODUCTS - COMP/OP AGG). Storage is a dedicated
-- table (not a blob) so it is normalized, RLS-scoped, and CRUD-able via PostgREST.
--
-- Tenancy: staff members of the policy's workspace only. This is tighter than the
-- sibling policy_* child tables (which lean on the policies RLS via EXISTS); it
-- mirrors the COI module standard of an explicit is_staff() + is_agency_member()
-- gate. anon has no access.

create table if not exists public.policy_additional_coverages (
  id         uuid primary key default gen_random_uuid(),
  policy_id  uuid not null references public.policies(id) on delete cascade,
  line       text not null check (line in ('gl','auto','umbrella','wc','property')),
  name       text not null,
  amount     numeric,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create index if not exists idx_policy_additional_coverages_policy_line
  on public.policy_additional_coverages (policy_id, line, created_at);

alter table public.policy_additional_coverages enable row level security;

-- Read: staff members of the owning workspace.
create policy "staff_select_policy_additional_coverages"
  on public.policy_additional_coverages for select to authenticated
  using (
    public.is_staff() and exists (
      select 1
      from public.policies p
      join public.accounts a on a.id = p.account_id
      where p.id = policy_additional_coverages.policy_id
        and public.is_agency_member(a.agency_workspace_id)
    )
  );

-- Insert: same gate on the target policy.
create policy "staff_insert_policy_additional_coverages"
  on public.policy_additional_coverages for insert to authenticated
  with check (
    public.is_staff() and exists (
      select 1
      from public.policies p
      join public.accounts a on a.id = p.account_id
      where p.id = policy_additional_coverages.policy_id
        and public.is_agency_member(a.agency_workspace_id)
    )
  );

-- Delete: same gate.
create policy "staff_delete_policy_additional_coverages"
  on public.policy_additional_coverages for delete to authenticated
  using (
    public.is_staff() and exists (
      select 1
      from public.policies p
      join public.accounts a on a.id = p.account_id
      where p.id = policy_additional_coverages.policy_id
        and public.is_agency_member(a.agency_workspace_id)
    )
  );

revoke all on public.policy_additional_coverages from anon;
grant select, insert, delete on public.policy_additional_coverages to authenticated;
