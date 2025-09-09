-- ============================
-- Insureds v1 – single-run SQL
-- ============================
-- Safe to re-run: uses CREATE IF NOT EXISTS where possible and CREATE OR REPLACE for functions.

-- UUID generation (Supabase usually has this already)
create extension if not exists pgcrypto;

-- ---------------------
-- 1) Core tables
-- ---------------------
-- 1:1 profile with accounts
create table if not exists public.insured_profiles (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  display_name text,
  first_name text,
  last_name  text,
  org_name   text,
  type       text check (type in ('individual','business','household')),
  status     text,
  tags       text[],
  last_contact_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Emails (many per account)
create table if not exists public.insured_emails (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  email text not null,
  is_primary boolean not null default false,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- unique lower(email) per account via index (cannot be in table constraint)
create unique index if not exists insured_emails_unique_per_account on public.insured_emails (account_id, lower(email));
-- only one primary per account
create unique index if not exists insured_emails_one_primary_per_account on public.insured_emails(account_id) where is_primary;
create index if not exists insured_emails_email_idx on public.insured_emails (lower(email));

-- Phones (many per account)
create table if not exists public.insured_phones (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  e164 text not null,      -- store +1XXXXXXXXXX or digits only
  type text,         -- mobile, work, home, other
  is_primary boolean not null default false,
  do_not_call boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists insured_phones_one_primary_per_account on public.insured_phones(account_id) where is_primary;
create index if not exists insured_phones_e164_idx on public.insured_phones (e164);

-- Addresses (many per account)
create table if not exists public.insured_addresses (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  line1 text not null,
  line2 text,
  city  text not null,
  state text not null,
  postal_code text not null,
  country text not null default 'US',
  kind text,             -- mailing, physical, billing
  is_primary boolean not null default false,
  verified_status text,  -- optional: avs match, etc.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists insured_addresses_one_primary_per_account on public.insured_addresses(account_id) where is_primary;
create index if not exists insured_addresses_postal_idx on public.insured_addresses (postal_code);

-- Notes
create table if not exists public.insured_notes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  body text not null,
  visibility text default 'internal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists insured_notes_account_idx on public.insured_notes(account_id);

-- Tasks
create table if not exists public.insured_tasks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  title text not null,
  due_at timestamptz,
  status text default 'open',
  priority text default 'normal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists insured_tasks_account_idx on public.insured_tasks(account_id);

-- Duplicate flags
create table if not exists public.insured_duplicate_flags (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists insured_dup_account_idx on public.insured_duplicate_flags(account_id);

-- Documents (meta only; files go to Storage)
create table if not exists public.insured_documents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  file_key text not null, -- storage path e.g. accountId/filename
  title text,
  category text,
  pii_level text,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists insured_docs_account_idx on public.insured_documents(account_id);

-- Attach triggers (Postgres doesn't support IF NOT EXISTS for triggers; drop first to be safe)
-- insured_profiles
drop trigger if exists set_updated_at_insured_profiles on public.insured_profiles;
create trigger set_updated_at_insured_profiles
before update on public.insured_profiles
for each row execute function public.set_updated_at();
-- insured_emails
drop trigger if exists set_updated_at_insured_emails on public.insured_emails;
create trigger set_updated_at_insured_emails
before update on public.insured_emails
for each row execute function public.set_updated_at();
-- insured_phones
drop trigger if exists set_updated_at_insured_phones on public.insured_phones;
create trigger set_updated_at_insured_phones
before update on public.insured_phones
for each row execute function public.set_updated_at();
-- insured_addresses
drop trigger if exists set_updated_at_insured_addresses on public.insured_addresses;
create trigger set_updated_at_insured_addresses
before update on public.insured_addresses
for each row execute function public.set_updated_at();
-- insured_notes
drop trigger if exists set_updated_at_insured_notes on public.insured_notes;
create trigger set_updated_at_insured_notes
before update on public.insured_notes
for each row execute function public.set_updated_at();
-- insured_tasks
drop trigger if exists set_updated_at_insured_tasks on public.insured_tasks;
create trigger set_updated_at_insured_tasks
before update on public.insured_tasks
for each row execute function public.set_updated_at();

-- ----------------------------------
-- 3) Search RPC (cursor + filters)
--    No recursive triggers; simple + fast enough for v1.
-- ----------------------------------
create or replace function public.insureds_search_v1(
  p_filters jsonb default '{}'::jsonb,
  p_limit int default 25,
  p_after_updated_at timestamptz default null,
  p_after_id uuid default null,
  p_sort text default 'updated_at_desc'
) returns table (
  account_id uuid,
  display_name text,
  org_name text,
  type text,
  city text,
  state text,
  primary_email text,
  primary_phone text,
  policies_count int,
  balance numeric,
  last_contact_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with base as (
    select
      a.id as account_id,
      ip.display_name,
      ip.org_name,
      ip.type,
      (select ia.city  from public.insured_addresses ia where ia.account_id=a.id and ia.is_primary is true limit 1) as city,
      (select ia.state from public.insured_addresses ia where ia.account_id=a.id and ia.is_primary is true limit 1) as state,
      (select ie.email from public.insured_emails ie where ie.account_id=a.id order by ie.is_primary desc, ie.created_at asc limit 1) as primary_email,
      (select ipn.e164 from public.insured_phones ipn where ipn.account_id=a.id order by ipn.is_primary desc, ipn.created_at asc limit 1) as primary_phone,
      coalesce((select count(*) from public.policies pol where pol.account_id=a.id), 0) as policies_count,
      null::numeric as balance,
      ip.last_contact_at,
      ip.created_at,
      ip.updated_at
    from public.accounts a
    join public.insured_profiles ip on ip.account_id = a.id
  ), filtered as (
    select * from base
    where
      -- free text (q): name/org/email/phone/city/state
      (coalesce(p_filters->>'q','') = '' or (
        display_name ilike '%'||p_filters->>'q'||'%' or
        org_name     ilike '%'||p_filters->>'q'||'%' or
        primary_email ilike '%'||p_filters->>'q'||'%' or
        regexp_replace(coalesce(primary_phone,''),'\D','','g') like '%'||regexp_replace(p_filters->>'q','\D','','g')||'%' or
        city ilike '%'||p_filters->>'q'||'%' or
        state ilike '%'||p_filters->>'q'||'%'
      ))
      and (coalesce(p_filters->>'type','') = '' or type = p_filters->>'type')
      and (coalesce(p_filters->>'city','') = '' or city ilike p_filters->>'city'||'%')
      and (coalesce(p_filters->>'state','') = '' or state ilike p_filters->>'state'||'%')
      and (coalesce(p_filters->>'postal','') = '' or exists (
            select 1 from public.insured_addresses ia where ia.account_id=account_id and ia.postal_code ilike p_filters->>'postal'||'%'))
      and (coalesce(p_filters->>'created_from','') = '' or created_at >= (p_filters->>'created_from')::timestamptz)
      and (coalesce(p_filters->>'created_to','')   = '' or created_at <  ((p_filters->>'created_to')::timestamptz + interval '1 day'))
      and (coalesce(p_filters->>'updated_from','') = '' or updated_at >= (p_filters->>'updated_from')::timestamptz)
      and (coalesce(p_filters->>'updated_to','')   = '' or updated_at <  ((p_filters->>'updated_to')::timestamptz + interval '1 day'))
  ), ordered as (
    select * from filtered
    order by
      case when p_sort = 'name_asc' then display_name end asc nulls last,
      case when p_sort = 'name_desc' then display_name end desc nulls last,
      case when p_sort = 'updated_at_asc' then updated_at end asc nulls last,
      case when p_sort = 'updated_at_desc' then updated_at end desc nulls last,
      account_id
  )
  select * from ordered
  where (
    p_after_updated_at is null or
    (
      (p_sort = 'updated_at_desc' and (updated_at, account_id) < (p_after_updated_at, p_after_id)) or
      (p_sort = 'updated_at_asc'  and (updated_at, account_id) > (p_after_updated_at, p_after_id)) or
      (p_sort = 'name_desc' and (display_name, account_id) < ((select ip2.display_name from public.insured_profiles ip2 where ip2.account_id=p_after_id), p_after_id)) or
      (p_sort = 'name_asc'  and (display_name, account_id) > ((select ip2.display_name from public.insured_profiles ip2 where ip2.account_id=p_after_id), p_after_id))
    )
  )
  limit greatest(1, p_limit);
$$;

grant execute on function public.insureds_search_v1(jsonb, int, timestamptz, uuid, text) to authenticated;

-- ----------------------------------
-- 4) Helper RPCs used by the page actions
-- ----------------------------------
create or replace function public.insured_add_note_v1(
  p_account_id uuid,
  p_body text
) returns uuid
language sql
security invoker
as $$
  insert into public.insured_notes (account_id, body)
  values (p_account_id, p_body)
  returning id;
$$;

create or replace function public.insured_add_task_v1(
  p_account_id uuid,
  p_title text,
  p_due_at timestamptz default null,
  p_priority text default 'normal'
) returns uuid
language sql
security invoker
as $$
  insert into public.insured_tasks (account_id, title, due_at, priority)
  values (p_account_id, p_title, p_due_at, coalesce(p_priority, 'normal'))
  returning id;
$$;

create or replace function public.insured_flag_duplicate_v1(
  p_account_id uuid,
  p_reason text
) returns uuid
language sql
security invoker
as $$
  insert into public.insured_duplicate_flags (account_id, reason)
  values (p_account_id, p_reason)
  returning id;
$$;

grant execute on function public.insured_add_note_v1(uuid, text) to authenticated;
grant execute on function public.insured_add_task_v1(uuid, text, timestamptz, text) to authenticated;
grant execute on function public.insured_flag_duplicate_v1(uuid, text) to authenticated;

-- Create storage bucket for insured documents
insert into storage.buckets (id, name, public) values ('insured-documents', 'insured-documents', false) on conflict do nothing;

-- Create storage policies for insured documents
create policy if not exists "Authenticated users can view insured documents"
on storage.objects
for select
to authenticated
using (bucket_id = 'insured-documents');

create policy if not exists "Authenticated users can upload insured documents"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'insured-documents');

create policy if not exists "Authenticated users can update insured documents"
on storage.objects
for update
to authenticated
using (bucket_id = 'insured-documents');