-- Phase 4 migration 4: the Additional Insureds merge subsystem.
--
-- Ships the guard, the engine, three staff-gated wrappers, and single-loser
-- unmerge for the additional_insureds directory (03 Section 5):
--   * assert_additional_insured_mergeable  (kind guard, replaces assert_mergeable)
--   * _do_additional_insured_merge          (engine; clone of _do_account_merge)
--   * merge_additional_insureds_manual      (wrapper: row overflow / drawer)
--   * merge_additional_insured_duplicate_group (wrapper: review-queue confirm)
--   * preview_additional_insured_merge      (wrapper: read-only blast radius)
--   * unmerge_additional_insured            (single-loser reverse from manifest)
--
-- The engine is a faithful clone of the LIVE public._do_account_merge body
-- (fetched via pg_get_functiondef on project lrqajzwcmdwahnjyidgv, 2026-07-03,
-- because prod has drifted from the repo file: prod's account v_safe_delete
-- carries an extra 'account_coi_profiles' entry). The FK-introspection reparent
-- loop is copied verbatim, with these keyed swaps (03 Section 5.2):
--   1. regclass literals -> 'public.additional_insureds'; the confkey attnum
--      lookup targets additional_insureds.id; cl.relname <> 'additional_insureds'
--      excludes the self-FK merged_into_id from the reparent loop (exactly the way
--      the account loop excludes 'accounts'). v_safe_delete is EMPTY
--      (ARRAY[]::text[]): no child of the directory is safe to hard-delete today,
--      so any unique collision raises for manual handling. The 'policies'
--      special-case branch in the fallback is dropped (no such table points here).
--      This is what auto-reparents certificates.holder_id (Phase 5) and the five
--      per-policy link columns (FK wire-up, 000700) with zero engine changes.
--   2. Scalar field-union over the directory columns (email, phone, address_line1,
--      address_line2, city, state, zip_code, notes), null-only backfill into the
--      survivor. Loser ranking: k1 = contact completeness, k2 = updated_at,
--      tiebreak id. agency_workspace_id is NOT unioned (survivor keeps its own).
--   3. Dropped account-only steps: assert_mergeable (replaced by the kind guard),
--      relationship/suggestion edge cleanup, compute_account_survivor (returns
--      null computed_survivor), policy dedup, duplicate_flags insert, same_as
--      provenance edges, consent reconciliation.
--   4. Kept: advisory lock + FOR UPDATE, the all-losers-already-merged idempotency
--      short-circuit, the tombstone triple, the merge_history insert with
--      entity_type='additional_insureds' and the full manifest (survivor_before /
--      losers_before), plus an entity-SCOPED duplicate_groups close-out the
--      account version lacks (entity_type='additional_insureds' AND entity_ids &&
--      p_losers).
--   5. Grants: engine revoked from public/anon/authenticated, granted to
--      service_role only; the staff-gated wrappers reach it as SECURITY DEFINER.
--
-- p_apply = false is the pure-compute preview path throughout (no mutation, same
-- counts and field_union).
--
-- Depends on live objects: additional_insureds (000000), duplicate_groups,
-- merge_history (entity-generic), is_staff, auth.uid.

-- ---------------------------------------------------------------------------
-- 5.1 Guard: assert_additional_insured_mergeable
--     Kind guard replacing assert_mergeable's account-domain checks. An
--     individual and a non-individual are different real-world things; block.
--     business/government/lender/other cross-merges are allowed (descriptor
--     mismatches, visible in the preview).
-- ---------------------------------------------------------------------------
create or replace function public.assert_additional_insured_mergeable(p_survivor uuid, p_losers uuid[])
returns void
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_kinds text[];
begin
  select array_agg(distinct kind) into v_kinds
  from public.additional_insureds
  where id = any(p_survivor || p_losers);

  if 'individual' = any(v_kinds) and array_length(v_kinds, 1) > 1 then
    raise exception 'Cannot merge an individual with a non-individual additional insured';
  end if;
end;
$function$;

revoke execute on function public.assert_additional_insured_mergeable(uuid, uuid[]) from anon, public;
grant  execute on function public.assert_additional_insured_mergeable(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 5.2 Engine: _do_additional_insured_merge
--     Clone of the LIVE _do_account_merge body with the five keyed swaps above.
--     3-arg drop first so the 4-arg default-bind is unambiguous.
-- ---------------------------------------------------------------------------
drop function if exists public._do_additional_insured_merge(uuid, uuid[], text);

create function public._do_additional_insured_merge(p_survivor uuid, p_losers uuid[], p_rule text, p_apply boolean default true)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_by uuid := auth.uid();
  -- SWAP 1: no child table of the directory is safe to hard-delete today.
  v_safe_delete text[] := ARRAY[]::text[];
  v_fk record; v_child record;
  v_has_id boolean; v_acct_unique boolean;
  v_cnt bigint; v_total bigint := 0;
  v_reparent       jsonb := '{}'::jsonb;
  v_reparent_ids   jsonb := '{}'::jsonb;
  v_children_noid  jsonb := '{}'::jsonb;
  v_deleted_rows   jsonb := '{}'::jsonb;
  v_survivor_row jsonb; v_losers_row jsonb; v_field_union jsonb := '{}'::jsonb;
  v_merge_id uuid; v_dkey text; v_ids uuid[];
  v_rowjson jsonb; v_active_losers uuid[];
begin
  if p_survivor is null or p_losers is null or array_length(p_losers,1) is null then
    raise exception '_do_additional_insured_merge: survivor and >=1 loser required'; end if;
  if p_survivor = any(p_losers) then
    raise exception '_do_additional_insured_merge: survivor % present in losers', p_survivor; end if;
  if p_apply and v_by is null then
    raise exception '_do_additional_insured_merge: merged_by (auth.uid) required when apply=true'; end if;
  perform 1 from public.additional_insureds where id = p_survivor and deleted_at is null;
  if not found then raise exception '_do_additional_insured_merge: survivor % is not an active additional insured', p_survivor; end if;

  -- mutating pre-steps only on apply (SWAP 3: kind guard replaces assert_mergeable;
  -- relationship/suggestion edge cleanup dropped)
  if p_apply then
    perform public.assert_additional_insured_mergeable(p_survivor, p_losers);
  end if;

  if p_apply then
    perform pg_advisory_xact_lock(hashtextextended(
      (select string_agg(x::text, ',' order by x::text) from unnest(p_survivor || p_losers) x), 0));
    perform a.id from public.additional_insureds a where a.id = any(p_survivor || p_losers) order by a.id for update;

    select array_agg(id order by id) into v_active_losers from public.additional_insureds where id = any(p_losers) and deleted_at is null;
    if v_active_losers is null then
      if (select bool_and(merged_into_id = p_survivor) from public.additional_insureds where id = any(p_losers)) then
        return jsonb_build_object('applied',true,'skipped_idempotent',true,'survivor',p_survivor,
                                  'losers',to_jsonb(p_losers),'reason','all losers already merged into this survivor');
      end if;
      raise exception '_do_additional_insured_merge: losers already soft-deleted but not into this survivor';
    end if;
    if (select count(*) from public.additional_insureds where id = any(p_losers) and deleted_at is null) <> array_length(p_losers,1) then
      raise exception '_do_additional_insured_merge: some losers already inactive, resolve before merging';
    end if;
  end if;

  select to_jsonb(a) into v_survivor_row from public.additional_insureds a where id = p_survivor;
  select jsonb_agg(to_jsonb(a) order by a.id) into v_losers_row from public.additional_insureds a where id = any(p_losers);

  -- SWAP 2: scalar field-union over the directory columns, null-only backfill.
  -- Loser ranking: k1 = contact completeness, k2 = updated_at, tiebreak id.
  select jsonb_strip_nulls(jsonb_build_object(
      'email',         case when nullif(btrim(v_survivor_row->>'email'),'')         is null then b.email end,
      'phone',         case when nullif(btrim(v_survivor_row->>'phone'),'')         is null then b.phone end,
      'address_line1', case when nullif(btrim(v_survivor_row->>'address_line1'),'') is null then b.address_line1 end,
      'address_line2', case when nullif(btrim(v_survivor_row->>'address_line2'),'') is null then b.address_line2 end,
      'city',          case when nullif(btrim(v_survivor_row->>'city'),'')          is null then b.city end,
      'state',         case when nullif(btrim(v_survivor_row->>'state'),'')         is null then b.state end,
      'zip_code',      case when nullif(btrim(v_survivor_row->>'zip_code'),'')      is null then b.zip_code end,
      'notes',         case when nullif(btrim(v_survivor_row->>'notes'),'')         is null then b.notes end
  )) into v_field_union
  from (
    select
      (array_remove(array_agg(ac.email         order by cas.k1 desc, cas.k2 desc nulls last, ac.id) filter (where nullif(btrim(ac.email),'')         is not null), null))[1] as email,
      (array_remove(array_agg(ac.phone         order by cas.k1 desc, cas.k2 desc nulls last, ac.id) filter (where nullif(btrim(ac.phone),'')         is not null), null))[1] as phone,
      (array_remove(array_agg(ac.address_line1 order by cas.k1 desc, cas.k2 desc nulls last, ac.id) filter (where nullif(btrim(ac.address_line1),'') is not null), null))[1] as address_line1,
      (array_remove(array_agg(ac.address_line2 order by cas.k1 desc, cas.k2 desc nulls last, ac.id) filter (where nullif(btrim(ac.address_line2),'') is not null), null))[1] as address_line2,
      (array_remove(array_agg(ac.city          order by cas.k1 desc, cas.k2 desc nulls last, ac.id) filter (where nullif(btrim(ac.city),'')          is not null), null))[1] as city,
      (array_remove(array_agg(ac.state         order by cas.k1 desc, cas.k2 desc nulls last, ac.id) filter (where nullif(btrim(ac.state),'')         is not null), null))[1] as state,
      (array_remove(array_agg(ac.zip_code      order by cas.k1 desc, cas.k2 desc nulls last, ac.id) filter (where nullif(btrim(ac.zip_code),'')      is not null), null))[1] as zip_code,
      (array_remove(array_agg(ac.notes         order by cas.k1 desc, cas.k2 desc nulls last, ac.id) filter (where nullif(btrim(ac.notes),'')         is not null), null))[1] as notes
    from public.additional_insureds ac
    cross join lateral (select
      ((nullif(btrim(ac.email),'') is not null)::int + (nullif(btrim(ac.phone),'') is not null)::int + (nullif(btrim(ac.address_line1),'') is not null)::int) as k1,
      ac.updated_at as k2) cas
    where ac.id = any(p_losers)
  ) b;

  -- SWAP 1: FK-introspection reparent loop, copied verbatim. confrelid targets
  -- additional_insureds; the self-FK merged_into_id is excluded via
  -- cl.relname <> 'additional_insureds'. The 'policies' special-case is dropped.
  for v_fk in
    select cl.relname as tbl, att.attname as col
    from pg_constraint c
    join pg_class cl       on cl.oid = c.conrelid
    join pg_namespace ns   on ns.oid = cl.relnamespace and ns.nspname = 'public'
    join pg_attribute att  on att.attrelid = c.conrelid and att.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.additional_insureds'::regclass
      and array_length(c.conkey,1) = 1
      and c.confkey[1] = (select attnum from pg_attribute where attrelid='public.additional_insureds'::regclass and attname='id')
      and cl.relname <> 'additional_insureds'
  loop
    execute format('SELECT count(*) FROM public.%I WHERE %I = ANY($1)', v_fk.tbl, v_fk.col) into v_cnt using p_losers;
    continue when v_cnt = 0;
    v_dkey := v_fk.tbl || '.' || v_fk.col;
    v_reparent := v_reparent || jsonb_build_object(v_dkey, v_cnt);
    v_total := v_total + v_cnt;
    continue when not p_apply;

    select exists (select 1 from pg_attribute where attrelid=('public.'||quote_ident(v_fk.tbl))::regclass and attname='id' and not attisdropped) into v_has_id;

    if v_has_id then
      execute format('SELECT array_agg(id) FROM public.%I WHERE %I = ANY($1)', v_fk.tbl, v_fk.col) into v_ids using p_losers;
      v_reparent_ids := jsonb_set(v_reparent_ids, array[v_dkey], to_jsonb(v_ids), true);
    else
      execute format('SELECT jsonb_agg(to_jsonb(t)) FROM public.%I t WHERE %I = ANY($1)', v_fk.tbl, v_fk.col) into v_rowjson using p_losers;
      v_children_noid := jsonb_set(v_children_noid, array[v_dkey], coalesce(v_rowjson,'[]'::jsonb), true);
    end if;

    begin
      execute format('UPDATE public.%I SET %I = $1 WHERE %I = ANY($2)', v_fk.tbl, v_fk.col, v_fk.col) using p_survivor, p_losers;
    exception when unique_violation then
      if v_has_id then
        for v_child in execute format('SELECT id FROM public.%I WHERE %I = ANY($1)', v_fk.tbl, v_fk.col) using p_losers loop
          begin
            execute format('UPDATE public.%I SET %I = $1 WHERE id = $2', v_fk.tbl, v_fk.col) using p_survivor, v_child.id;
          exception when unique_violation then
            if not (v_fk.tbl = any(v_safe_delete)) then
              raise exception '_do_additional_insured_merge: unique-collision on % (not safe-delete allowlisted), resolve manually', v_dkey;
            end if;
            execute format('SELECT to_jsonb(t) FROM public.%I t WHERE id = $1', v_fk.tbl) into v_rowjson using v_child.id;
            v_deleted_rows := jsonb_set(v_deleted_rows, array[v_dkey], coalesce(v_deleted_rows->v_dkey,'[]'::jsonb) || v_rowjson, true);
            execute format('DELETE FROM public.%I WHERE id = $1', v_fk.tbl) using v_child.id;
          end;
        end loop;
      else
        select exists (
          select 1 from pg_constraint con
          join pg_attribute a on a.attrelid=con.conrelid and a.attnum = any(con.conkey)
          where con.conrelid=('public.'||quote_ident(v_fk.tbl))::regclass and con.contype in ('u','p') and a.attname=v_fk.col
        ) into v_acct_unique;
        if v_acct_unique and (v_fk.tbl = any(v_safe_delete)) then
          execute format('SELECT jsonb_agg(to_jsonb(t)) FROM public.%I t WHERE t.%I = ANY($1) AND EXISTS (SELECT 1 FROM public.%I s WHERE s.%I = $2)', v_fk.tbl, v_fk.col, v_fk.tbl, v_fk.col) into v_rowjson using p_losers, p_survivor;
          if v_rowjson is not null then v_deleted_rows := jsonb_set(v_deleted_rows, array[v_dkey], v_rowjson, true); end if;
          execute format('DELETE FROM public.%I d WHERE d.%I = ANY($1) AND EXISTS (SELECT 1 FROM public.%I s WHERE s.%I = $2)', v_fk.tbl, v_fk.col, v_fk.tbl, v_fk.col) using p_losers, p_survivor;
          execute format('UPDATE public.%I SET %I = $1 WHERE %I = ANY($2)', v_fk.tbl, v_fk.col, v_fk.col) using p_survivor, p_losers;
        else
          raise exception '_do_additional_insured_merge: unique-collision on no-id table % (not safe-deletable), resolve manually', v_dkey;
        end if;
      end if;
    end;
  end loop;

  if p_apply then
    -- SWAP 2: null-only field-union backfill into the survivor.
    update public.additional_insureds s set
      email         = coalesce(nullif(btrim(s.email),''),         v_field_union->>'email'),
      phone         = coalesce(nullif(btrim(s.phone),''),         v_field_union->>'phone'),
      address_line1 = coalesce(nullif(btrim(s.address_line1),''), v_field_union->>'address_line1'),
      address_line2 = coalesce(nullif(btrim(s.address_line2),''), v_field_union->>'address_line2'),
      city          = coalesce(nullif(btrim(s.city),''),          v_field_union->>'city'),
      state         = coalesce(nullif(btrim(s.state),''),         v_field_union->>'state'),
      zip_code      = coalesce(nullif(btrim(s.zip_code),''),      v_field_union->>'zip_code'),
      notes         = coalesce(nullif(btrim(s.notes),''),         v_field_union->>'notes')
    where s.id = p_survivor;

    -- SWAP 4: tombstone triple.
    update public.additional_insureds set deleted_at = now(), merged_into_id = p_survivor, merged_at = now()
    where id = any(p_losers) and deleted_at is null;

    -- SWAP 4: merge_history insert (entity-generic table) with the full manifest.
    insert into public.merge_history (entity_type, survivor_id, merged_ids, merge_data, merged_by)
    values ('additional_insureds', p_survivor, p_losers,
      jsonb_build_object(
        'rule', p_rule, 'survivor_before', v_survivor_row, 'losers_before', v_losers_row,
        'field_union', v_field_union, 'reparented', v_reparent, 'reparent_total', v_total,
        'reparented_ids', v_reparent_ids, 'children_noid_before', v_children_noid,
        'children_deleted_on_conflict', v_deleted_rows, 'snapshot_at', now()),
      v_by)
    returning id into v_merge_id;

    -- SWAP 4: entity-SCOPED duplicate_groups close-out (the account version is
    -- unscoped; once two entity types share the table an unscoped update is
    -- wrong in principle).
    update public.duplicate_groups set status = 'merged', reviewed_by = v_by, reviewed_at = now()
    where entity_type = 'additional_insureds'
      and status is distinct from 'merged' and entity_ids && p_losers;
  end if;

  -- SWAP 3: computed_survivor is null (compute_account_survivor dropped).
  return jsonb_build_object(
    'applied', p_apply, 'survivor', p_survivor, 'losers', to_jsonb(p_losers), 'rule', p_rule,
    'computed_survivor', null,
    'reparent_counts', v_reparent, 'reparent_total', v_total,
    'field_union', v_field_union,
    'merge_history_id', v_merge_id
  );
end;
$function$;

-- SWAP 5: engine reachable only through the staff-gated wrappers.
revoke execute on function public._do_additional_insured_merge(uuid, uuid[], text, boolean) from public, anon, authenticated;
grant  execute on function public._do_additional_insured_merge(uuid, uuid[], text, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 5.3 Staff-gated wrappers. All SECURITY DEFINER, all revoke anon/public and
--     grant authenticated, all open with an is_staff() gate.
-- ---------------------------------------------------------------------------

-- manual path (row overflow "Merge into...", and the review drawer)
create or replace function public.merge_additional_insureds_manual(p_survivor uuid, p_losers uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_active uuid[];
begin
  if not public.is_staff() then
    raise exception 'merge_additional_insureds_manual: staff access required';
  end if;
  if p_survivor is null or p_losers is null or array_length(p_losers, 1) is null then
    raise exception 'merge_additional_insureds_manual: survivor and at least one loser required';
  end if;

  select array_agg(distinct id) into v_active
  from public.additional_insureds
  where id = any(p_losers) and id <> p_survivor and deleted_at is null;
  if v_active is null or array_length(v_active, 1) is null then
    raise exception 'merge_additional_insureds_manual: no active losers to merge';
  end if;

  return public._do_additional_insured_merge(p_survivor, v_active, 'manual_merge');
end;
$function$;

revoke execute on function public.merge_additional_insureds_manual(uuid, uuid[]) from anon, public;
grant  execute on function public.merge_additional_insureds_manual(uuid, uuid[]) to authenticated;

-- group path (duplicate review queue confirm). This IS confirm.
create or replace function public.merge_additional_insured_duplicate_group(p_group_id uuid, p_survivor_id uuid)
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
    raise exception 'merge_additional_insured_duplicate_group: staff access required';
  end if;

  select * into g from public.duplicate_groups where id = p_group_id;
  if not found then raise exception 'Duplicate group % not found', p_group_id; end if;
  if g.status = 'merged' then raise exception 'Duplicate group already merged'; end if;
  if g.entity_type <> 'additional_insureds' then raise exception 'Only additional insured groups can be merged here'; end if;
  if not (p_survivor_id = any(g.entity_ids)) then raise exception 'Survivor ID not found in duplicate group'; end if;

  select array_agg(id) into v_losers
  from public.additional_insureds
  where id = any(g.entity_ids) and id <> p_survivor_id and deleted_at is null;
  if v_losers is null or array_length(v_losers, 1) is null then
    raise exception 'No active losers to merge in this group';
  end if;

  return public._do_additional_insured_merge(p_survivor_id, v_losers, 'duplicate_review');
end;
$function$;

revoke execute on function public.merge_additional_insured_duplicate_group(uuid, uuid) from anon, public;
grant  execute on function public.merge_additional_insured_duplicate_group(uuid, uuid) to authenticated;

-- read-only blast-radius preview
create or replace function public.preview_additional_insured_merge(p_survivor uuid, p_losers uuid[])
returns jsonb
language plpgsql
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
    raise exception 'preview_additional_insured_merge: staff access required';
  end if;

  select array_agg(distinct id) into v_active
  from public.additional_insureds
  where id = any(p_losers) and id <> p_survivor and deleted_at is null;

  if v_active is null or array_length(v_active, 1) is null then
    return jsonb_build_object('mergeable', false, 'block_reason', 'No active losers to merge',
      'reparent_counts', '{}'::jsonb, 'reparent_total', 0, 'field_diff', '{}'::jsonb);
  end if;

  begin
    perform public.assert_additional_insured_mergeable(p_survivor, v_active);
  exception when others then
    v_mergeable := false;
    v_block := SQLERRM;
  end;

  v_counts := public._do_additional_insured_merge(p_survivor, v_active, 'preview', false);
  v_field_union := v_counts->'field_union';

  select to_jsonb(a) into v_survivor_row from public.additional_insureds a where id = p_survivor;
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
    'field_diff', v_field_diff
  );
end;
$function$;

revoke execute on function public.preview_additional_insured_merge(uuid, uuid[]) from anon, public;
grant  execute on function public.preview_additional_insured_merge(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 5.4 Unmerge (single-loser). Clone of unmerge_account, three of five steps drop
--     out (no policy-dedup restore, no provenance-edge or duplicate_flags cleanup,
--     never written by this engine).
-- ---------------------------------------------------------------------------
create or replace function public.unmerge_additional_insured(p_merge_history_id uuid)
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
  v_before jsonb;
  v_moved int := 0;
  v_restored int := 0;
begin
  if not public.is_staff() then
    raise exception 'unmerge_additional_insured: staff access required';
  end if;

  select * into h from public.merge_history where id = p_merge_history_id;
  if not found then raise exception 'merge_history % not found', p_merge_history_id; end if;
  if h.entity_type <> 'additional_insureds' then raise exception 'unmerge supports additional insured merges only'; end if;
  if h.unmerged_at is not null then raise exception 'this merge was already unmerged'; end if;
  if coalesce(array_length(h.merged_ids, 1), 0) <> 1 then
    raise exception 'unmerge supports single-loser merges only (this merge has % losers)', coalesce(array_length(h.merged_ids,1),0);
  end if;

  v_survivor := h.survivor_id;
  v_loser    := h.merged_ids[1];
  v_md       := h.merge_data;

  -- 1) Move reparented (id-bearing) children back to the loser. For certificates
  --    this moves exactly the certs the loser owned back to it (freeze trigger
  --    permits holder_id updates, R4); certs issued to the survivor between merge
  --    and unmerge stay with the survivor.
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

  -- 2) Restore the survivor's scalar fields from the before-snapshot over the 8
  --    directory columns (undo field_union).
  v_before := v_md->'survivor_before';
  if v_before is not null then
    update public.additional_insureds s set
      email         = nullif(v_before->>'email', ''),
      phone         = nullif(v_before->>'phone', ''),
      address_line1 = nullif(v_before->>'address_line1', ''),
      address_line2 = nullif(v_before->>'address_line2', ''),
      city          = nullif(v_before->>'city', ''),
      state         = nullif(v_before->>'state', ''),
      zip_code      = nullif(v_before->>'zip_code', ''),
      notes         = nullif(v_before->>'notes', '')
    where s.id = v_survivor;
  end if;

  -- 3) Restore the loser (clear the tombstone).
  update public.additional_insureds set deleted_at = null, merged_into_id = null, merged_at = null where id = v_loser;
  get diagnostics v_restored = row_count;

  -- 4) Reopen groups (entity-scoped).
  update public.duplicate_groups set status = 'pending', reviewed_by = null, reviewed_at = null
   where entity_type = 'additional_insureds' and status = 'merged' and entity_ids @> array[v_loser];

  -- 5) Stamp the merge_history row.
  update public.merge_history set unmerged_at = now() where id = p_merge_history_id;

  return jsonb_build_object(
    'unmerged', true, 'merge_history_id', p_merge_history_id, 'survivor', v_survivor, 'loser', v_loser,
    'children_moved_back', v_moved, 'loser_restored', (v_restored = 1));
end;
$function$;

revoke execute on function public.unmerge_additional_insured(uuid) from anon, public;
grant  execute on function public.unmerge_additional_insured(uuid) to authenticated;
