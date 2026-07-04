-- Renewal reissue list: harden get_master_coi against invalid snapshot policy ids
-- (Bugbot review on the §3 cascade, high severity).
--
-- get_master_coi(account, policy_ids) RAISES 'policy list contains ids not belonging to
-- account (or deleted)' when ANY id is missing/foreign/soft-deleted. The prior
-- list_certificates_needing_reissue passed EVERY snapshot line's policy_id (including
-- non-stale lines, which are read straight from the immutable snapshot and never joined to
-- policies). A certificate whose non-stale line references a since-deleted or reparented
-- policy would therefore make get_master_coi raise and crash the entire list query, leaving
-- an empty queue while count_certificates_needing_reissue still reports the cert.
--
-- Fix: pass get_master_coi only the VALID policy ids (exist, not deleted, belong to this
-- cert's account). Any cert that has an invalid/deleted line cannot be reissued (the
-- generate-certificate reissue path re-validates each policy and would 422), so mark it
-- is_ready = false. stale_lines and the informational line_keys/policy_ids are unchanged.

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
  cert_lines as (
    select ac.id, ac.account_id, sl->>'line_key' as line_key, (sl->>'policy_id')::uuid as policy_id,
      nullif(sl->>'expiration_date','')::date as printed_expiration
    from active_certs ac cross join lateral jsonb_array_elements(ac.snapshot->'lines') sl
  ),
  stale as (
    select cl.id, cl.line_key, cl.policy_id, cl.printed_expiration, p.expiration_date as current_expiration,
      case when cl.printed_expiration is distinct from p.expiration_date then 'renewed'
           when cl.printed_expiration is not null and cl.printed_expiration < current_date then 'expired' end as reason
    from cert_lines cl join public.policies p on p.id = cl.policy_id and p.deleted_at is null
    where p.expiration_date is not null
      and (cl.printed_expiration is distinct from p.expiration_date or (cl.printed_expiration is not null and cl.printed_expiration < current_date))
  ),
  stale_certs as (
    select id, jsonb_agg(jsonb_build_object('line_key',line_key,'policy_id',policy_id,'printed_expiration',printed_expiration,'current_expiration',current_expiration,'reason',reason) order by line_key) as stale_lines
    from stale group by id
  ),
  full_sel as (
    select cl.id,
      array_agg(distinct cl.line_key) as line_keys,
      array_agg(distinct cl.policy_id) as policy_ids,
      -- ids get_master_coi will accept: exist, not deleted, this cert's account.
      array_remove(array_agg(distinct case when p.id is not null then cl.policy_id end), null) as valid_policy_ids,
      -- true when any snapshot line references a missing/deleted/foreign policy.
      bool_or(p.id is null) as has_invalid
    from cert_lines cl
    left join public.policies p
      on p.id = cl.policy_id and p.deleted_at is null and p.account_id = cl.account_id
    where cl.id in (select id from stale_certs)
    group by cl.id
  )
  select
    ac.id, ac.certificate_number, ac.holder_id,
    ac.snapshot->'holder'->>'name', ac.account_id, ac.issued_at,
    sc.stale_lines, fs.line_keys, fs.policy_ids,
    mc.readiness,
    coalesce((mc.readiness->>'ready')::boolean, false) and not fs.has_invalid as is_ready
  from stale_certs sc
  join active_certs ac on ac.id = sc.id
  join full_sel fs on fs.id = sc.id
  left join lateral (
    select case
      when coalesce(array_length(fs.valid_policy_ids, 1), 0) > 0
        then public.get_master_coi(ac.account_id, fs.valid_policy_ids)->'readiness'
      else null
    end as readiness
  ) mc on true
  order by ac.issued_at desc;
$function$;
comment on function public.list_certificates_needing_reissue(uuid) is
  'Renewal reissue cascade detection (07 §3.3). Readiness is computed over the VALID source-cert policy ids (get_master_coi raises on missing/deleted/foreign ids); a cert with any invalid line is is_ready=false (the reissue would 422). stale_lines lists only changed rows. SECURITY INVOKER.';
revoke execute on function public.list_certificates_needing_reissue(uuid) from anon, public;
grant  execute on function public.list_certificates_needing_reissue(uuid) to authenticated;
