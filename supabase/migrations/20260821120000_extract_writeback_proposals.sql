-- Phase 1b: pending extract write-back proposals (staff review only; no quote apply).
-- One row per carrier per analysis snapshot hash. Producers reject or (later) confirm.

create table if not exists public.extract_writeback_proposals (
  id uuid primary key default gen_random_uuid(),
  document_analysis_id uuid not null references public.document_analysis(id) on delete cascade,
  account_id uuid not null references public.accounts(id),
  snapshot_hash text not null,
  carrier_name text not null,
  line_class text not null check (line_class in ('personal', 'commercial')),
  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected')),
  proposed_quote jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint extract_writeback_proposals_idempotency
    unique (document_analysis_id, account_id, snapshot_hash, carrier_name)
);

create index if not exists idx_extract_writeback_proposals_analysis_account
  on public.extract_writeback_proposals (document_analysis_id, account_id, status);

alter table public.extract_writeback_proposals enable row level security;

-- Read: staff in the account's workspace.
create policy "staff_select_extract_writeback_proposals"
  on public.extract_writeback_proposals for select to authenticated
  using (
    public.is_staff() and exists (
      select 1
      from public.accounts a
      where a.id = extract_writeback_proposals.account_id
        and public.is_agency_member(a.agency_workspace_id)
    )
  );

-- Insert: staff in the account's workspace.
create policy "staff_insert_extract_writeback_proposals"
  on public.extract_writeback_proposals for insert to authenticated
  with check (
    public.is_staff() and exists (
      select 1
      from public.accounts a
      where a.id = extract_writeback_proposals.account_id
        and public.is_agency_member(a.agency_workspace_id)
    )
  );

-- Update: staff in the account's workspace (reject / future apply).
create policy "staff_update_extract_writeback_proposals"
  on public.extract_writeback_proposals for update to authenticated
  using (
    public.is_staff() and exists (
      select 1
      from public.accounts a
      where a.id = extract_writeback_proposals.account_id
        and public.is_agency_member(a.agency_workspace_id)
    )
  )
  with check (
    public.is_staff() and exists (
      select 1
      from public.accounts a
      where a.id = extract_writeback_proposals.account_id
        and public.is_agency_member(a.agency_workspace_id)
    )
  );

revoke all on public.extract_writeback_proposals from anon;
grant select, insert, update on public.extract_writeback_proposals to authenticated;

drop trigger if exists trg_extract_writeback_proposals_updated_at on public.extract_writeback_proposals;
create trigger trg_extract_writeback_proposals_updated_at
  before update on public.extract_writeback_proposals
  for each row execute function public.set_updated_at();

-- Optional RPC: reject without touching quotes.
create or replace function public.reject_extract_writeback_proposal(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_staff() then
    raise exception 'staff only';
  end if;

  update public.extract_writeback_proposals p
  set status = 'rejected'
  from public.accounts a
  where p.id = p_proposal_id
    and a.id = p.account_id
    and public.is_agency_member(a.agency_workspace_id);

  if not found then
    raise exception 'proposal not found or not accessible';
  end if;
end;
$$;

comment on function public.reject_extract_writeback_proposal(uuid) is
  'Staff-only reject for extract write-back proposals; does not write quotes.';

revoke all on function public.reject_extract_writeback_proposal(uuid) from anon, public;
grant execute on function public.reject_extract_writeback_proposal(uuid) to authenticated;

-- ROLLBACK
-- drop function if exists public.reject_extract_writeback_proposal(uuid);
-- drop trigger if exists trg_extract_writeback_proposals_updated_at on public.extract_writeback_proposals;
-- drop table if exists public.extract_writeback_proposals;
