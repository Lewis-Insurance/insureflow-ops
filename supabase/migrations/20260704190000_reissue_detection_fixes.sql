-- Renewal reissue cascade detection fixes (Codex review on the §3 cascade).
--
-- Fix A (readiness over the FULL selection): reissue mode rebuilds and issues ALL of the
--   source certificate's snapshot lines, not only the stale ones. The prior
--   list_certificates_needing_reissue computed readiness (and line_keys/policy_ids) from
--   only the stale lines, so a multi-line cert with one renewed line and a different
--   non-stale line that now has a blocker could show is_ready=true and be selectable even
--   though the real reissue 422s. Now readiness + line_keys + policy_ids cover EVERY
--   snapshot line; stale_lines stays limited to the changed rows (for the diff display).
--
-- Fix B (count/list consistency): the count RPC treated a line as stale when the snapshot
--   had an expiration but the current policy expiration was NULL (printed IS DISTINCT FROM
--   NULL is true), while the list RPC filtered those out (current expiration is not null).
--   A cleared expiration could then show a nonzero triage count with an empty queue. Both
--   RPCs now require the current policy expiration to be non-null for a line to be stale.

create or replace function public.list_certificates_needing_reissue(p_account_id uuid default null)
returns table(
  certificate_id uuid, certificate_number text, holder_id uuid, holder_name text,
  account_id uuid, issued_at timestamptz, stale_lines jsonb, line_keys text[],
  policy_ids uuid[], readiness jsonb, is_ready boolean
)
language sql stable security invoker set search_path to 'public'
as $function$
  with active_certs as (
    select c.id, c.certificate_number, c.holder_id, c.account_id, c.issued_at, c.snapshot
    from public.certificates c
    where c.status in ('issued','sent') and c.superseded_by_id is null
      and (p_account_id is null or c.account_id = p_account_id)
  ),
  -- Every line of every active cert (the reissue rebuilds ALL of them).
  cert_lines as (
    select ac.id,
           sl->>'line_key'              as line_key,
           (sl->>'policy_id')::uuid     as policy_id,
           nullif(sl->>'expiration_date','')::date as printed_expiration
    from active_certs ac
    cross join lateral jsonb_array_elements(ac.snapshot->'lines') sl
  ),
  -- Stale lines: current policy expiration is non-null AND differs from the printed one,
  -- OR the printed expiration has already passed. (current not null aligns list + count.)
  stale as (
    select cl.id, cl.line_key, cl.policy_id, cl.printed_expiration, p.expiration_date as current_expiration,
      case
        when cl.printed_expiration is distinct from p.expiration_date then 'renewed'
        when cl.printed_expiration is not null and cl.printed_expiration < current_date then 'expired'
      end as reason
    from cert_lines cl
    join public.policies p on p.id = cl.policy_id and p.deleted_at is null
    where p.expiration_date is not null
      and (cl.printed_expiration is distinct from p.expiration_date
           or (cl.printed_expiration is not null and cl.printed_expiration < current_date))
  ),
  stale_certs as (
    select id,
      jsonb_agg(jsonb_build_object(
        'line_key', line_key, 'policy_id', policy_id,
        'printed_expiration', printed_expiration, 'current_expiration', current_expiration,
        'reason', reason) order by line_key) as stale_lines
    from stale
    group by id
  ),
  -- The FULL line selection per stale cert (readiness must reflect every reissued line).
  full_sel as (
    select cl.id,
      array_agg(distinct cl.line_key) as line_keys,
      array_agg(distinct cl.policy_id) as policy_ids
    from cert_lines cl
    where cl.id in (select id from stale_certs)
    group by cl.id
  )
  select
    ac.id, ac.certificate_number, ac.holder_id,
    ac.snapshot->'holder'->>'name', ac.account_id, ac.issued_at,
    sc.stale_lines, fs.line_keys, fs.policy_ids,
    mc.readiness,
    coalesce((mc.readiness->>'ready')::boolean, false)
  from stale_certs sc
  join active_certs ac on ac.id = sc.id
  join full_sel fs on fs.id = sc.id
  left join lateral (
    select public.get_master_coi(ac.account_id, fs.policy_ids)->'readiness' as readiness
  ) mc on true
  order by ac.issued_at desc;
$function$;
comment on function public.list_certificates_needing_reissue(uuid) is
  'Renewal reissue cascade detection (07 §3.3). stale_lines lists only changed lines; line_keys/policy_ids/readiness cover the FULL source-cert selection the reissue rebuilds, so is_ready matches what the batch reissue will actually do. SECURITY INVOKER.';
revoke execute on function public.list_certificates_needing_reissue(uuid) from anon, public;
grant  execute on function public.list_certificates_needing_reissue(uuid) to authenticated;

create or replace function public.count_certificates_needing_reissue(p_account_id uuid default null)
returns integer language sql stable security invoker set search_path to 'public'
as $function$
  with active_certs as (
    select c.id, c.account_id, c.snapshot from public.certificates c
    where c.status in ('issued','sent') and c.superseded_by_id is null
      and (p_account_id is null or c.account_id = p_account_id)
  ),
  stale_certs as (
    select distinct ac.id from active_certs ac
    cross join lateral jsonb_array_elements(ac.snapshot->'lines') sl
    join public.policies p on p.id = (sl->>'policy_id')::uuid and p.deleted_at is null
    where p.expiration_date is not null
      and (nullif(sl->>'expiration_date','')::date is distinct from p.expiration_date
           or nullif(sl->>'expiration_date','')::date < current_date)
  )
  select count(*)::int from stale_certs;
$function$;
comment on function public.count_certificates_needing_reissue(uuid) is
  'Companion count for the reissue triage tile (07 §3.5). Uses the same stale definition as list_certificates_needing_reissue (current policy expiration must be non-null), so the tile and queue agree. SECURITY INVOKER.';
revoke execute on function public.count_certificates_needing_reissue(uuid) from anon, public;
grant  execute on function public.count_certificates_needing_reissue(uuid) to authenticated;
