-- Ensure buckets exist (idempotent)
insert into storage.buckets (id, name, public)
values ('customer-docs','customer-docs', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('documents','documents', false)
on conflict (id) do nothing;

-- Helper: drop an existing policy if it exists
-- customer-docs policies
do $$ begin
  if exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Customer docs readable by staff or membership'
  ) then
    drop policy "Customer docs readable by staff or membership" on storage.objects;
  end if;
  if exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Customer docs insert by staff or owner/staff'
  ) then
    drop policy "Customer docs insert by staff or owner/staff" on storage.objects;
  end if;
  if exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Customer docs update by staff or owner/staff'
  ) then
    drop policy "Customer docs update by staff or owner/staff" on storage.objects;
  end if;
  if exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Customer docs delete by staff or owner/staff'
  ) then
    drop policy "Customer docs delete by staff or owner/staff" on storage.objects;
  end if;
end $$;

-- documents (legacy) policies
do $$ begin
  if exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Documents readable by staff or membership'
  ) then
    drop policy "Documents readable by staff or membership" on storage.objects;
  end if;
  if exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Documents insert by staff or owner/staff'
  ) then
    drop policy "Documents insert by staff or owner/staff" on storage.objects;
  end if;
  if exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Documents update by staff or owner/staff'
  ) then
    drop policy "Documents update by staff or owner/staff" on storage.objects;
  end if;
  if exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Documents delete by staff or owner/staff'
  ) then
    drop policy "Documents delete by staff or owner/staff" on storage.objects;
  end if;
end $$;

-- Allow reads (for signed URLs) when staff OR member of the account folder
create policy "Customer docs readable by staff or membership"
  on storage.objects for select
  using (
    bucket_id = 'customer-docs'
    and (
      public.is_staff() 
      or public.is_member((storage.foldername(name))[1]::uuid)
    )
  );

-- Allow uploads to account folder when staff or owner/staff member
create policy "Customer docs insert by staff or owner/staff"
  on storage.objects for insert
  with check (
    bucket_id = 'customer-docs'
    and (
      public.is_staff() 
      or public.is_member((storage.foldername(name))[1]::uuid, array['owner','staff'])
    )
  );

-- Allow updates (overwrite/metadata) with same rule
create policy "Customer docs update by staff or owner/staff"
  on storage.objects for update
  using (
    bucket_id = 'customer-docs'
    and (
      public.is_staff() 
      or public.is_member((storage.foldername(name))[1]::uuid, array['owner','staff'])
    )
  )
  with check (
    bucket_id = 'customer-docs'
    and (
      public.is_staff() 
      or public.is_member((storage.foldername(name))[1]::uuid, array['owner','staff'])
    )
  );

-- Allow delete with same rule
create policy "Customer docs delete by staff or owner/staff"
  on storage.objects for delete
  using (
    bucket_id = 'customer-docs'
    and (
      public.is_staff() 
      or public.is_member((storage.foldername(name))[1]::uuid, array['owner','staff'])
    )
  );

-- Apply the same set for legacy 'documents' bucket
create policy "Documents readable by staff or membership"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and (
      public.is_staff() 
      or public.is_member((storage.foldername(name))[1]::uuid)
    )
  );

create policy "Documents insert by staff or owner/staff"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and (
      public.is_staff() 
      or public.is_member((storage.foldername(name))[1]::uuid, array['owner','staff'])
    )
  );

create policy "Documents update by staff or owner/staff"
  on storage.objects for update
  using (
    bucket_id = 'documents'
    and (
      public.is_staff() 
      or public.is_member((storage.foldername(name))[1]::uuid, array['owner','staff'])
    )
  )
  with check (
    bucket_id = 'documents'
    and (
      public.is_staff() 
      or public.is_member((storage.foldername(name))[1]::uuid, array['owner','staff'])
    )
  );

create policy "Documents delete by staff or owner/staff"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and (
      public.is_staff() 
      or public.is_member((storage.foldername(name))[1]::uuid, array['owner','staff'])
    )
  );