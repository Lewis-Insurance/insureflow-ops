-- Read-only, workspace-wide collection status and last-touch evidence for AO renewals.

create or replace function public.get_ao_renewal_evidence_rollup(p_account_ids uuid[])
returns table (
  account_id uuid,
  ao_renewal_id uuid,
  has_packet boolean,
  total_count integer,
  missing_count integer,
  in_review_count integer,
  all_required_complete boolean,
  last_touch_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with permitted_accounts as (
    select a.id
    from public.accounts a
    where a.id = any(coalesce(p_account_ids, array[]::uuid[]))
      and a.deleted_at is null
      and public.is_staff()
      and public.is_agency_member(a.agency_workspace_id)
  ),
  packet_rollups as (
    select
      cw.account_id,
      cw.ao_renewal_id,
      true as has_packet,
      count(cr.id)::integer as total_count,
      count(cr.id) filter (
        where cr.status in ('not_requested', 'requested', 'rejected', 'expired')
      )::integer as missing_count,
      count(cr.id) filter (
        where cr.status in ('uploaded', 'processing', 'needs_review')
      )::integer as in_review_count,
      not exists (
        select 1
        from public.collection_requirements required
        where required.workspace_id = cw.id
          and required.is_required
          and required.status <> 'accepted'
      ) as all_required_complete
    from public.comparison_workspaces cw
    join permitted_accounts pa on pa.id = cw.account_id
    left join public.collection_requirements cr on cr.workspace_id = cw.id
    where cw.task_type = 'document_collection'
    group by cw.id, cw.account_id, cw.ao_renewal_id
  ),
  grouped_packets as (
    select
      pr.account_id,
      pr.ao_renewal_id,
      bool_or(pr.has_packet) as has_packet,
      sum(pr.total_count)::integer as total_count,
      sum(pr.missing_count)::integer as missing_count,
      sum(pr.in_review_count)::integer as in_review_count,
      bool_and(pr.all_required_complete) as all_required_complete
    from packet_rollups pr
    group by pr.account_id, pr.ao_renewal_id
  ),
  touches as (
    select c.account_id, max(c.occurred_at) as last_touch_at
    from public.communications c
    join permitted_accounts pa on pa.id = c.account_id
    where c.deleted_at is null
    group by c.account_id
  ),
  result_keys as (
    select pa.id as account_id, null::uuid as ao_renewal_id
    from permitted_accounts pa
    union
    select gp.account_id, gp.ao_renewal_id
    from grouped_packets gp
    where gp.ao_renewal_id is not null
  )
  select
    rk.account_id,
    rk.ao_renewal_id,
    coalesce(gp.has_packet, false) as has_packet,
    coalesce(gp.total_count, 0)::integer as total_count,
    coalesce(gp.missing_count, 0)::integer as missing_count,
    coalesce(gp.in_review_count, 0)::integer as in_review_count,
    coalesce(gp.all_required_complete, false) as all_required_complete,
    t.last_touch_at
  from result_keys rk
  left join grouped_packets gp
    on gp.account_id = rk.account_id
   and gp.ao_renewal_id is not distinct from rk.ao_renewal_id
  left join touches t on t.account_id = rk.account_id;
$$;

comment on function public.get_ao_renewal_evidence_rollup(uuid[]) is
  'Staff-only, agency-scoped AO renewal evidence. Read only; returns collection status and latest account communication.';

revoke all on function public.get_ao_renewal_evidence_rollup(uuid[]) from public, anon;
grant execute on function public.get_ao_renewal_evidence_rollup(uuid[]) to authenticated, service_role;

-- ROLLBACK
-- drop function if exists public.get_ao_renewal_evidence_rollup(uuid[]);
