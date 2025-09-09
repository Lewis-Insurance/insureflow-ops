-- Add missing type column to existing insured_profiles table
alter table public.insured_profiles 
add column if not exists type text check (type in ('individual','business','household'));

-- Simple search RPC without complex regex patterns
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
      -- Simple text search
      (coalesce(p_filters->>'q','') = '' or (
        display_name ilike '%'||p_filters->>'q'||'%' or
        org_name     ilike '%'||p_filters->>'q'||'%' or
        primary_email ilike '%'||p_filters->>'q'||'%' or
        primary_phone ilike '%'||p_filters->>'q'||'%' or
        city ilike '%'||p_filters->>'q'||'%' or
        state ilike '%'||p_filters->>'q'||'%'
      ))
      and (coalesce(p_filters->>'type','') = '' or type = p_filters->>'type')
      and (coalesce(p_filters->>'city','') = '' or city ilike p_filters->>'city'||'%')
      and (coalesce(p_filters->>'state','') = '' or state ilike p_filters->>'state'||'%')
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

-- Helper RPCs
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