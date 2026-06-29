-- Relationship Graph v2 / Sprint 6 — confirm-gated retype staging.
--
-- Entity typing (household vs commercial_business) must stay human-in-the-loop.
-- This adds a staging table a human approves before any account type is UPDATEd.
-- The durable signal of truth is policies.line_category = 'commercial' (NOT the
-- type columns), so a candidate is raised when an account's type disagrees with
-- the categories of the policies it actually holds.
--
-- generate_retype_candidates() only STAGES rows (status='pending'); it never
-- mutates accounts. approve_retype_candidate() is the only path that writes the
-- type, one account per human click, keeping all three type fields consistent.
--
-- Rollback: drop the three functions and the table.

create table if not exists public.retype_candidates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  current_account_type text,
  current_type text,
  suggested_account_type text not null,
  suggested_type text not null,
  signal text not null default 'policy_line_category',
  reason text,
  commercial_policies int default 0,
  personal_policies int default 0,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now()
);

-- one open candidate per account
create unique index if not exists retype_candidates_one_pending
  on public.retype_candidates (account_id) where status = 'pending';

alter table public.retype_candidates enable row level security;
drop policy if exists retype_candidates_staff on public.retype_candidates;
create policy retype_candidates_staff on public.retype_candidates
  for all using (public.is_staff()) with check (public.is_staff());

-- STAGE: detect type/policy mismatches; never mutate accounts.
create or replace function public.generate_retype_candidates()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_count int := 0;
begin
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'generate_retype_candidates: staff access required';
  end if;

  with pol as (
    select account_id,
      count(*) filter (where lower(coalesce(line_category,'')) = 'commercial') as comm,
      count(*) filter (where lower(coalesce(line_category,'')) <> 'commercial') as pers
    from public.policies where deleted_at is null group by account_id
  ),
  cand as (
    select a.id,
      a.account_type::text as cur_at, a.type::text as cur_t, pol.comm, pol.pers,
      case when a.type::text = 'household' then 'business' else 'individual' end as sug_at,
      case when a.type::text = 'household' then 'commercial_business' else 'household' end as sug_t,
      case when a.type::text = 'household'
           then format('Holds %s commercial policy(ies) and no personal — looks like a business', pol.comm)
           else format('Holds %s personal policy(ies) and no commercial — looks like a household', pol.pers)
      end as reason
    from public.accounts a
    join pol on pol.account_id = a.id
    where a.deleted_at is null
      and (
        (a.type::text = 'household' and pol.comm > 0 and pol.pers = 0)
        or (a.type::text = 'commercial_business' and pol.comm = 0 and pol.pers > 0)
      )
  ),
  ins as (
    insert into public.retype_candidates
      (account_id, current_account_type, current_type, suggested_account_type, suggested_type, signal, reason, commercial_policies, personal_policies)
    select c.id, c.cur_at, c.cur_t, c.sug_at, c.sug_t, 'policy_line_category', c.reason, c.comm, c.pers
    from cand c
    where not exists (select 1 from public.retype_candidates rc where rc.account_id = c.id and rc.status = 'pending')
    returning 1
  )
  select count(*) into v_count from ins;

  return jsonb_build_object('staged', v_count,
    'pending_total', (select count(*) from public.retype_candidates where status = 'pending'));
end;
$function$;

-- APPLY (human-confirmed): the only path that changes an account's type.
create or replace function public.approve_retype_candidate(p_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  c record;
begin
  if not public.is_staff() then
    raise exception 'approve_retype_candidate: staff access required';
  end if;

  select * into c from public.retype_candidates where id = p_id;
  if not found then raise exception 'retype candidate % not found', p_id; end if;
  if c.status <> 'pending' then raise exception 'candidate % is already %', p_id, c.status; end if;

  -- set account_type (sync_account_types mirrors accounts.type) + keep insured_profiles.type aligned
  update public.accounts
    set account_type = c.suggested_account_type::account_type_new,
        type = c.suggested_type::account_type_v2
    where id = c.account_id and deleted_at is null;

  update public.insured_profiles set type = c.suggested_type where account_id = c.account_id;

  update public.retype_candidates
    set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), applied_at = now()
    where id = p_id;

  return jsonb_build_object('approved', true, 'account_id', c.account_id,
    'new_account_type', c.suggested_account_type, 'new_type', c.suggested_type);
end;
$function$;

create or replace function public.reject_retype_candidate(p_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_staff() then
    raise exception 'reject_retype_candidate: staff access required';
  end if;
  update public.retype_candidates
    set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_id and status = 'pending';
  if not found then raise exception 'no pending candidate %', p_id; end if;
  return jsonb_build_object('rejected', true);
end;
$function$;

revoke execute on function public.generate_retype_candidates() from anon, public;
revoke execute on function public.approve_retype_candidate(uuid) from anon, public;
revoke execute on function public.reject_retype_candidate(uuid) from anon, public;
grant execute on function public.generate_retype_candidates() to authenticated, service_role;
grant execute on function public.approve_retype_candidate(uuid) to authenticated;
grant execute on function public.reject_retype_candidate(uuid) to authenticated;

-- ROLLBACK:
-- drop function if exists public.reject_retype_candidate(uuid);
-- drop function if exists public.approve_retype_candidate(uuid);
-- drop function if exists public.generate_retype_candidates();
-- drop table if exists public.retype_candidates;
