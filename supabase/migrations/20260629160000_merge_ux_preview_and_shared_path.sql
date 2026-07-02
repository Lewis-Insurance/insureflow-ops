-- Merge UX: one shared merge path + a read-only blast-radius preview.
--   _do_account_merge       internal: assert_mergeable -> edge cleanup -> merge_accounts(apply=true)
--                           -> same_as edges -> apply_consent_strictest_wins. The ONLY merge body.
--   relgraph_merge_duplicate_group  group path -> _do_account_merge.
--   merge_accounts_manual           manual path -> _do_account_merge (fixes /merge-customers).
--   preview_merge                   dry run: mergeable + block_reason (assert_mergeable in
--                                   BEGIN/EXCEPTION, no duplicated guard logic) + merge_accounts(apply=false)
--                                   counts + field diff. Mutates nothing.
-- All staff-gated; internal not granted to anon/public/authenticated.

-- Shared internal -----------------------------------------------------------------
create or replace function public._do_account_merge(p_survivor uuid, p_losers uuid[], p_rule text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cluster uuid[] := p_survivor || p_losers;
  v_result jsonb;
  l uuid;
begin
  -- Guards (cross-type / strong-ID / suffix) at merge time.
  perform public.assert_mergeable(p_survivor, p_losers);

  -- Prevent self-loop CHECK violations on reparent.
  delete from public.account_relationships
   where from_account = any(v_cluster) and to_account = any(v_cluster);
  delete from public.account_relationship_suggestions
   where from_account = any(v_cluster) and to_account = any(v_cluster);

  -- Hardened engine (apply=true): FK-driven reparent, snapshot/manifest, dedup, tombstone-only.
  v_result := public.merge_accounts(p_survivor, p_losers, p_rule, auth.uid(), true);

  -- Provenance AFTER the merge.
  foreach l in array p_losers loop
    insert into public.account_relationships (from_account, to_account, rel_type, source, note, created_by)
    values (p_survivor, l, 'same_as', 'merge', 'Merged duplicate via ' || p_rule, auth.uid())
    on conflict do nothing;
  end loop;

  -- Consent strictest-wins.
  perform public.apply_consent_strictest_wins(p_survivor, p_losers);

  return v_result;
end;
$function$;

revoke execute on function public._do_account_merge(uuid, uuid[], text) from anon, public, authenticated;

-- Group path (review queue) -------------------------------------------------------
create or replace function public.relgraph_merge_duplicate_group(p_group_id uuid, p_survivor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  g record;
  v_losers uuid[];
begin
  if not public.is_staff() then
    raise exception 'relgraph_merge_duplicate_group: staff access required';
  end if;

  select * into g from public.duplicate_groups where id = p_group_id;
  if not found then raise exception 'Duplicate group % not found', p_group_id; end if;
  if g.status = 'merged' then raise exception 'Duplicate group already merged'; end if;
  if g.entity_type <> 'accounts' then raise exception 'Only account groups can be merged here'; end if;
  if not (p_survivor_id = any(g.entity_ids)) then raise exception 'Survivor ID not found in duplicate group'; end if;

  select array_agg(id) into v_losers
  from public.accounts
  where id = any(g.entity_ids) and id <> p_survivor_id and deleted_at is null;
  if v_losers is null or array_length(v_losers, 1) is null then
    raise exception 'No active losers to merge in this group';
  end if;

  return public._do_account_merge(p_survivor_id, v_losers, 'duplicate_review');
end;
$function$;

revoke execute on function public.relgraph_merge_duplicate_group(uuid, uuid) from anon, public;
grant execute on function public.relgraph_merge_duplicate_group(uuid, uuid) to authenticated;

-- Manual path (two-account merge from the record / merge tool) ---------------------
create or replace function public.merge_accounts_manual(p_survivor uuid, p_losers uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_active uuid[];
begin
  if not public.is_staff() then
    raise exception 'merge_accounts_manual: staff access required';
  end if;
  if p_survivor is null or p_losers is null or array_length(p_losers, 1) is null then
    raise exception 'merge_accounts_manual: survivor and at least one loser required';
  end if;

  select array_agg(distinct id) into v_active
  from public.accounts
  where id = any(p_losers) and id <> p_survivor and deleted_at is null;
  if v_active is null or array_length(v_active, 1) is null then
    raise exception 'merge_accounts_manual: no active losers to merge';
  end if;

  return public._do_account_merge(p_survivor, v_active, 'manual_merge');
end;
$function$;

revoke execute on function public.merge_accounts_manual(uuid, uuid[]) from anon, public;
grant execute on function public.merge_accounts_manual(uuid, uuid[]) to authenticated;

-- Read-only blast-radius preview --------------------------------------------------
create or replace function public.preview_merge(p_survivor uuid, p_losers uuid[])
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  v_mergeable boolean := true;
  v_block text := null;
  v_counts jsonb;
  v_field_union jsonb;
  v_survivor_row jsonb;
  v_field_diff jsonb := '{}'::jsonb;
  v_active uuid[];
  k text;
  val jsonb;
begin
  if not public.is_staff() then
    raise exception 'preview_merge: staff access required';
  end if;

  select array_agg(distinct id) into v_active
  from public.accounts
  where id = any(p_losers) and id <> p_survivor and deleted_at is null;

  if v_active is null or array_length(v_active, 1) is null then
    return jsonb_build_object('mergeable', false, 'block_reason', 'No active losers to merge',
      'reparent_counts', '{}'::jsonb, 'reparent_total', 0, 'policies_dedup_count', 0,
      'computed_survivor', null, 'field_diff', '{}'::jsonb);
  end if;

  -- mergeable / block_reason from the SAME guard (no duplicated logic).
  begin
    perform public.assert_mergeable(p_survivor, v_active);
  exception when others then
    v_mergeable := false;
    v_block := SQLERRM;
  end;

  -- dry run for counts; merge_accounts(apply=false) mutates nothing.
  v_counts := public.merge_accounts(p_survivor, v_active, 'preview', auth.uid(), false);
  v_field_union := v_counts->'field_union';

  select to_jsonb(a) into v_survivor_row from public.accounts a where id = p_survivor;
  if v_field_union is not null then
    for k, val in select * from jsonb_each(v_field_union) loop
      v_field_diff := v_field_diff || jsonb_build_object(k, jsonb_build_object('current', v_survivor_row->k, 'incoming', val));
    end loop;
  end if;

  return jsonb_build_object(
    'mergeable', v_mergeable,
    'block_reason', v_block,
    'reparent_counts', coalesce(v_counts->'reparent_counts', '{}'::jsonb),
    'reparent_total', coalesce((v_counts->>'reparent_total')::int, 0),
    'policies_dedup_count', coalesce((v_counts->>'policies_dedup_count')::int, 0),
    'computed_survivor', v_counts->'computed_survivor',
    'field_diff', v_field_diff
  );
end;
$function$;

revoke execute on function public.preview_merge(uuid, uuid[]) from anon, public;
grant execute on function public.preview_merge(uuid, uuid[]) to authenticated;
