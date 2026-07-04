-- Renewal reissue cascade (07 §3.3): detection read model.
--
-- Verify-first (07 §3.2) is RESOLVED: renewals in this repo are SAME-POLICY-ROW date
-- advances (renewal_mark_renewed UPDATEs policies.effective_date/expiration_date in
-- place; policies has no lineage columns; auto_sync_policy_to_renewal only touches the
-- renewals tracker). So detection compares each cert line's snapshot printed expiration
-- against the CURRENT policies.expiration_date for the SAME policy_id.
--
-- A certificate "needs reissue" when it is active (status issued/sent, not superseded by
-- a live successor) and, for ANY of its certificate lines, the snapshot's printed
-- expiration differs from the policy's current expiration (a renewal advanced the date)
-- OR the printed expiration has already passed while the policy remains active.
--
-- Both readers are SECURITY INVOKER: the certificates staff+workspace RLS (Phase 5)
-- scopes what the caller sees, matching list_certificates.

-- ---------------------------------------------------------------------------
-- list_certificates_needing_reissue(p_account_id default null)
-- ---------------------------------------------------------------------------
create or replace function public.list_certificates_needing_reissue(p_account_id uuid default null)
returns table(
  certificate_id       uuid,
  certificate_number   text,
  holder_id            uuid,
  holder_name          text,
  account_id           uuid,
  issued_at            timestamptz,
  stale_lines          jsonb,     -- [{line_key, policy_id, printed_expiration, current_expiration, reason}]
  line_keys            text[],
  policy_ids           uuid[],
  readiness            jsonb,     -- get_master_coi(account, policy_ids)->'readiness'
  is_ready             boolean
)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  with active_certs as (
    select c.id, c.certificate_number, c.holder_id, c.account_id, c.issued_at, c.snapshot
    from public.certificates c
    where c.status in ('issued', 'sent')
      and c.superseded_by_id is null
      and (p_account_id is null or c.account_id = p_account_id)
  ),
  cert_lines as (
    select
      ac.id, ac.certificate_number, ac.holder_id, ac.account_id, ac.issued_at, ac.snapshot,
      sl->>'line_key'               as line_key,
      (sl->>'policy_id')::uuid      as policy_id,
      nullif(sl->>'expiration_date','')::date as printed_expiration,
      p.expiration_date             as current_expiration
    from active_certs ac
    cross join lateral jsonb_array_elements(ac.snapshot->'lines') sl
    left join public.policies p
      on p.id = (sl->>'policy_id')::uuid and p.deleted_at is null
  ),
  stale_lines_cte as (
    select *,
      case
        when current_expiration is not null and printed_expiration is distinct from current_expiration then 'renewed'
        when printed_expiration is not null and printed_expiration < current_date then 'expired'
      end as reason
    from cert_lines
    where current_expiration is not null
      and (
        printed_expiration is distinct from current_expiration
        or (printed_expiration is not null and printed_expiration < current_date)
      )
  ),
  grouped as (
    select
      id, certificate_number, holder_id, account_id, issued_at,
      (max(snapshot::text))::jsonb as snapshot,
      jsonb_agg(jsonb_build_object(
        'line_key', line_key,
        'policy_id', policy_id,
        'printed_expiration', printed_expiration,
        'current_expiration', current_expiration,
        'reason', reason
      ) order by line_key) as stale_lines,
      array_agg(distinct line_key) as line_keys,
      array_agg(distinct policy_id) as policy_ids
    from stale_lines_cte
    group by id, certificate_number, holder_id, account_id, issued_at
  )
  select
    g.id as certificate_id,
    g.certificate_number,
    g.holder_id,
    g.snapshot->'holder'->>'name' as holder_name,
    g.account_id,
    g.issued_at,
    g.stale_lines,
    g.line_keys,
    g.policy_ids,
    mc.readiness,
    coalesce((mc.readiness->>'ready')::boolean, false) as is_ready
  from grouped g
  left join lateral (
    select public.get_master_coi(g.account_id, g.policy_ids)->'readiness' as readiness
  ) mc on true
  order by g.issued_at desc;
$function$;

comment on function public.list_certificates_needing_reissue(uuid) is
  'Renewal reissue cascade detection (07 §3.3): active certs whose snapshot printed expiration differs from the current policy expiration (renewal advanced) or has passed. Per cert: stale lines with printed-vs-current dates, the line/policy selection, and get_master_coi readiness so the queue can show ready vs blocked. SECURITY INVOKER; certificates RLS scopes the result.';

revoke execute on function public.list_certificates_needing_reissue(uuid) from anon, public;
grant  execute on function public.list_certificates_needing_reissue(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- count_certificates_needing_reissue(p_account_id default null) -- triage tile
-- ---------------------------------------------------------------------------
create or replace function public.count_certificates_needing_reissue(p_account_id uuid default null)
returns integer
language sql
stable
security invoker
set search_path to 'public'
as $function$
  with active_certs as (
    select c.id, c.account_id, c.snapshot
    from public.certificates c
    where c.status in ('issued', 'sent')
      and c.superseded_by_id is null
      and (p_account_id is null or c.account_id = p_account_id)
  ),
  stale_certs as (
    select distinct ac.id
    from active_certs ac
    cross join lateral jsonb_array_elements(ac.snapshot->'lines') sl
    join public.policies p
      on p.id = (sl->>'policy_id')::uuid and p.deleted_at is null
    where nullif(sl->>'expiration_date','')::date is distinct from p.expiration_date
       or nullif(sl->>'expiration_date','')::date < current_date
  )
  select count(*)::int from stale_certs;
$function$;

comment on function public.count_certificates_needing_reissue(uuid) is
  'Companion count for the "Needs reissue: N" triage tile (07 §3.5). Counts active certs with at least one stale line. SECURITY INVOKER.';

revoke execute on function public.count_certificates_needing_reissue(uuid) from anon, public;
grant  execute on function public.count_certificates_needing_reissue(uuid) to authenticated;
