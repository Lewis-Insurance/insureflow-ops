-- Merge hardening T7: one-click reverse of a merge from the captured manifest
-- (policy section D). Restores the loser, moves its children back, undoes the
-- field-union fill and policy de-dup, removes provenance, and reopens the group.
-- Single-loser merges (the review-queue case); multi-loser raises for manual handling.

alter table public.merge_history add column if not exists unmerged_at timestamptz;

create or replace function public.unmerge_account(p_merge_history_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  h record;
  v_survivor uuid;
  v_loser uuid;
  v_md jsonb;
  v_key text;
  v_ids jsonb;
  v_idarr uuid[];
  v_tbl text;
  v_col text;
  v_dot int;
  v_dedup uuid[];
  v_before jsonb;
  v_moved int := 0;
  v_restored int := 0;
begin
  if not public.is_staff() then
    raise exception 'unmerge_account: staff access required';
  end if;

  select * into h from public.merge_history where id = p_merge_history_id;
  if not found then raise exception 'merge_history % not found', p_merge_history_id; end if;
  if h.entity_type <> 'accounts' then raise exception 'unmerge supports account merges only'; end if;
  if h.unmerged_at is not null then raise exception 'this merge was already unmerged'; end if;
  if coalesce(array_length(h.merged_ids, 1), 0) <> 1 then
    raise exception 'unmerge supports single-loser merges only (this merge has % losers)', coalesce(array_length(h.merged_ids,1),0);
  end if;

  v_survivor := h.survivor_id;
  v_loser    := h.merged_ids[1];
  v_md       := h.merge_data;

  -- 1) Move reparented (id-bearing) children back to the loser.
  for v_key, v_ids in select * from jsonb_each(coalesce(v_md->'reparented_ids', '{}'::jsonb)) loop
    v_dot := position('.' in v_key);
    v_tbl := left(v_key, v_dot - 1);
    v_col := substring(v_key from v_dot + 1);
    select array_agg((x)::uuid) into v_idarr from jsonb_array_elements_text(v_ids) x;
    if v_idarr is not null then
      execute format('update public.%I set %I = $1 where id = any($2)', v_tbl, v_col) using v_loser, v_idarr;
      v_moved := v_moved + coalesce(array_length(v_idarr, 1), 0);
    end if;
  end loop;

  -- 2) Restore policies tombstoned by the de-dup step.
  select array_agg((x)::uuid) into v_dedup from jsonb_array_elements_text(coalesce(v_md->'policies_dedup', '[]'::jsonb)) x;
  if v_dedup is not null then
    update public.policies set deleted_at = null where id = any(v_dedup);
  end if;

  -- 3) Restore the survivor's scalar fields from the before-snapshot (undo field_union).
  v_before := v_md->'survivor_before';
  if v_before is not null then
    update public.accounts s set
      email                = nullif(v_before->>'email', ''),
      phone                = nullif(v_before->>'phone', ''),
      phone_secondary      = nullif(v_before->>'phone_secondary', ''),
      address_line1        = nullif(v_before->>'address_line1', ''),
      address_line2        = nullif(v_before->>'address_line2', ''),
      city                 = nullif(v_before->>'city', ''),
      state                = nullif(v_before->>'state', ''),
      zip_code             = nullif(v_before->>'zip_code', ''),
      date_of_birth        = (v_before->>'date_of_birth')::date,
      spouse_name          = nullif(v_before->>'spouse_name', ''),
      spouse_date_of_birth = (v_before->>'spouse_date_of_birth')::date
    where s.id = v_survivor;
  end if;

  -- 4) Restore the loser (clear the tombstone).
  update public.accounts set deleted_at = null, merged_into_id = null, merged_at = null where id = v_loser;
  get diagnostics v_restored = row_count;

  -- 5) Remove provenance + flags, reopen the group.
  delete from public.account_relationships where from_account = v_survivor and to_account = v_loser and source = 'merge';
  delete from public.duplicate_flags where account_id = v_loser and reason like 'merged into %';
  update public.duplicate_groups set status = 'pending', reviewed_by = null, reviewed_at = null
   where status = 'merged' and entity_ids @> array[v_loser];

  update public.merge_history set unmerged_at = now() where id = p_merge_history_id;

  return jsonb_build_object(
    'unmerged', true, 'merge_history_id', p_merge_history_id, 'survivor', v_survivor, 'loser', v_loser,
    'children_moved_back', v_moved, 'loser_restored', (v_restored = 1));
end;
$function$;

revoke execute on function public.unmerge_account(uuid) from anon, public;
grant execute on function public.unmerge_account(uuid) to authenticated;
