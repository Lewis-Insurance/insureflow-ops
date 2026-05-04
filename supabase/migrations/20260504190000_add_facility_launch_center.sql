-- Facility Launch Center MVP
-- Supabase-backed Facility DNA onboarding workspace for Homewood/facility launch readiness.

create table if not exists public.facility_launch_workspaces (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  facility_name text not null default 'Homewood Lodge ALF',
  status text not null default 'pilot',
  readiness_score integer not null default 0,
  program jsonb not null default '{}'::jsonb,
  modules jsonb not null default '[]'::jsonb,
  mvp_data jsonb not null default '{}'::jsonb,
  documents jsonb not null default '[]'::jsonb,
  document_groups jsonb not null default '[]'::jsonb,
  exceptions jsonb not null default '[]'::jsonb,
  contradictions jsonb not null default '[]'::jsonb,
  gates jsonb not null default '[]'::jsonb,
  decision_log jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_facility_launch_workspaces_account_id
  on public.facility_launch_workspaces(account_id);

create index if not exists idx_facility_launch_workspaces_status
  on public.facility_launch_workspaces(status);

alter table public.facility_launch_workspaces enable row level security;

drop policy if exists "facility_launch_workspaces_select_by_account_membership" on public.facility_launch_workspaces;
create policy "facility_launch_workspaces_select_by_account_membership"
  on public.facility_launch_workspaces
  for select
  using (
    exists (
      select 1
      from public.account_memberships am
      where am.account_id = facility_launch_workspaces.account_id
        and am.user_id = auth.uid()
    )
  );

drop policy if exists "facility_launch_workspaces_insert_by_account_membership" on public.facility_launch_workspaces;
create policy "facility_launch_workspaces_insert_by_account_membership"
  on public.facility_launch_workspaces
  for insert
  with check (
    exists (
      select 1
      from public.account_memberships am
      where am.account_id = facility_launch_workspaces.account_id
        and am.user_id = auth.uid()
    )
  );

drop policy if exists "facility_launch_workspaces_update_by_account_membership" on public.facility_launch_workspaces;
create policy "facility_launch_workspaces_update_by_account_membership"
  on public.facility_launch_workspaces
  for update
  using (
    exists (
      select 1
      from public.account_memberships am
      where am.account_id = facility_launch_workspaces.account_id
        and am.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.account_memberships am
      where am.account_id = facility_launch_workspaces.account_id
        and am.user_id = auth.uid()
    )
  );

drop policy if exists "facility_launch_workspaces_delete_by_account_admins" on public.facility_launch_workspaces;
create policy "facility_launch_workspaces_delete_by_account_admins"
  on public.facility_launch_workspaces
  for delete
  using (
    exists (
      select 1
      from public.account_memberships am
      where am.account_id = facility_launch_workspaces.account_id
        and am.user_id = auth.uid()
        and am.role in ('owner', 'staff')
    )
  );

create or replace function public.set_facility_launch_workspace_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_facility_launch_workspaces_updated_at on public.facility_launch_workspaces;
create trigger trg_facility_launch_workspaces_updated_at
before update on public.facility_launch_workspaces
for each row execute function public.set_facility_launch_workspace_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'facility-launch-documents',
  'facility-launch-documents',
  false,
  52428800,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "facility_launch_documents_select_by_account_membership" on storage.objects;
create policy "facility_launch_documents_select_by_account_membership"
  on storage.objects
  for select
  using (
    bucket_id = 'facility-launch-documents'
    and exists (
      select 1
      from public.account_memberships am
      where am.account_id::text = (storage.foldername(name))[1]
        and am.user_id = auth.uid()
    )
  );

drop policy if exists "facility_launch_documents_insert_by_account_membership" on storage.objects;
create policy "facility_launch_documents_insert_by_account_membership"
  on storage.objects
  for insert
  with check (
    bucket_id = 'facility-launch-documents'
    and exists (
      select 1
      from public.account_memberships am
      where am.account_id::text = (storage.foldername(name))[1]
        and am.user_id = auth.uid()
    )
  );

drop policy if exists "facility_launch_documents_update_by_account_membership" on storage.objects;
create policy "facility_launch_documents_update_by_account_membership"
  on storage.objects
  for update
  using (
    bucket_id = 'facility-launch-documents'
    and exists (
      select 1
      from public.account_memberships am
      where am.account_id::text = (storage.foldername(name))[1]
        and am.user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'facility-launch-documents'
    and exists (
      select 1
      from public.account_memberships am
      where am.account_id::text = (storage.foldername(name))[1]
        and am.user_id = auth.uid()
    )
  );

drop policy if exists "facility_launch_documents_delete_by_account_staff" on storage.objects;
create policy "facility_launch_documents_delete_by_account_staff"
  on storage.objects
  for delete
  using (
    bucket_id = 'facility-launch-documents'
    and exists (
      select 1
      from public.account_memberships am
      where am.account_id::text = (storage.foldername(name))[1]
        and am.user_id = auth.uid()
        and am.role in ('owner', 'staff')
    )
  );
