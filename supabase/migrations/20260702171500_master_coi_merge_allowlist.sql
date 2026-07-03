-- =============================================================================
-- Master COI Phase 3 (data layer) — Migration 3 of 3
-- Add 'account_coi_profiles' to the _do_account_merge survivor-wins allowlist.
--
-- Spec: docs/COI Module/coi-module/02-master-coi-data-layer.md §7 (merge
-- compatibility) — account_coi_profiles has PK = account_id and no id column, so
-- the live merge engine would abort on a unique collision when both survivor and
-- loser carry a profile. Adding it to v_safe_delete gives survivor-wins semantics:
-- loser-only profile is FK-reparented to the survivor; when both exist, the loser's
-- row is deleted and the survivor's profile stands.
--
-- CRITICAL: the body below is copied VERBATIM from the LIVE prod definition,
-- fetched 2026-07-02 via pg_get_functiondef('public._do_account_merge(uuid,uuid[],
-- text,boolean)'::regprocedure) against project lrqajzwcmdwahnjyidgv (prod has
-- DRIFTED from the repo migration 20260629240000, so the repo file was NOT used).
-- The ONLY change from the live body is appending 'account_coi_profiles' to the
-- v_safe_delete array (16 elements -> 17). Nothing else in the body is altered.
--
-- The lockdown grants are re-asserted to match the live grant state (verified via
-- information_schema.role_routine_grants: only postgres + service_role hold EXECUTE;
-- public/anon/authenticated hold none).
-- =============================================================================

CREATE OR REPLACE FUNCTION public._do_account_merge(p_survivor uuid, p_losers uuid[], p_rule text, p_apply boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cluster uuid[] := p_survivor || p_losers;
  v_by uuid := auth.uid();
  l uuid;
  v_safe_delete text[] := ARRAY[
    'pipeline_stages','pipeline_metrics','customer_risk_scores','client_happiness_scores',
    'client_context_cache','client_context_embeddings','client_context_index_jobs',
    'account_tags','tags','account_memberships','insured_emails','producer_workload_stats',
    'product_recommendations',
    'insured_profiles','commercial_business_accounts','household_accounts',
    'account_coi_profiles'];
  v_fk record; v_child record;
  v_has_id boolean; v_acct_unique boolean;
  v_cnt bigint; v_total bigint := 0;
  v_reparent       jsonb := '{}'::jsonb;
  v_reparent_ids   jsonb := '{}'::jsonb;
  v_children_noid  jsonb := '{}'::jsonb;
  v_deleted_rows   jsonb := '{}'::jsonb;
  v_survivor_row jsonb; v_losers_row jsonb; v_field_union jsonb := '{}'::jsonb;
  v_pol_dedup uuid[] := '{}'; v_merge_id uuid; v_dkey text; v_ids uuid[];
  v_rowjson jsonb; v_active_losers uuid[]; v_computed uuid;
begin
  if p_survivor is null or p_losers is null or array_length(p_losers,1) is null then
    raise exception '_do_account_merge: survivor and >=1 loser required'; end if;
  if p_survivor = any(p_losers) then
    raise exception '_do_account_merge: survivor % present in losers', p_survivor; end if;
  if p_apply and v_by is null then
    raise exception '_do_account_merge: merged_by (auth.uid) required when apply=true'; end if;
  perform 1 from public.accounts where id = p_survivor and deleted_at is null;
  if not found then raise exception '_do_account_merge: survivor % is not an active account', p_survivor; end if;

  if p_apply then
    perform public.assert_mergeable(p_survivor, p_losers);
    delete from public.account_relationships
     where from_account = any(v_cluster) and to_account = any(v_cluster);
    delete from public.account_relationship_suggestions
     where from_account = any(v_cluster) and to_account = any(v_cluster);
  end if;

  v_computed := public.compute_account_survivor(p_survivor || p_losers);

  if p_apply then
    perform pg_advisory_xact_lock(hashtextextended(
      (select string_agg(x::text, ',' order by x::text) from unnest(p_survivor || p_losers) x), 0));
    perform a.id from public.accounts a where a.id = any(p_survivor || p_losers) order by a.id for update;

    select array_agg(id order by id) into v_active_losers from public.accounts where id = any(p_losers) and deleted_at is null;
    if v_active_losers is null then
      if (select bool_and(merged_into_id = p_survivor) from public.accounts where id = any(p_losers)) then
        return jsonb_build_object('applied',true,'skipped_idempotent',true,'survivor',p_survivor,
                                  'losers',to_jsonb(p_losers),'reason','all losers already merged into this survivor');
      end if;
      raise exception '_do_account_merge: losers already soft-deleted but not into this survivor';
    end if;
    if (select count(*) from public.accounts where id = any(p_losers) and deleted_at is null) <> array_length(p_losers,1) then
      raise exception '_do_account_merge: some losers already inactive — resolve before merging';
    end if;
  end if;

  select to_jsonb(a) into v_survivor_row from public.accounts a where id = p_survivor;
  select jsonb_agg(to_jsonb(a) order by a.id) into v_losers_row from public.accounts a where id = any(p_losers);

  select jsonb_strip_nulls(jsonb_build_object(
      'email',                case when nullif(btrim(v_survivor_row->>'email'),'')                is null then b.email end,
      'phone',                case when nullif(btrim(v_survivor_row->>'phone'),'')                is null then b.phone end,
      'phone_secondary',      case when nullif(btrim(v_survivor_row->>'phone_secondary'),'')      is null then b.phone_secondary end,
      'address_line1',        case when nullif(btrim(v_survivor_row->>'address_line1'),'')        is null then b.address_line1 end,
      'address_line2',        case when nullif(btrim(v_survivor_row->>'address_line2'),'')        is null then b.address_line2 end,
      'city',                 case when nullif(btrim(v_survivor_row->>'city'),'')                 is null then b.city end,
      'state',                case when nullif(btrim(v_survivor_row->>'state'),'')                is null then b.state end,
      'zip_code',             case when nullif(btrim(v_survivor_row->>'zip_code'),'')             is null then b.zip_code end,
      'date_of_birth',        case when (v_survivor_row->>'date_of_birth')        is null then b.date_of_birth::text end,
      'spouse_name',          case when nullif(btrim(v_survivor_row->>'spouse_name'),'')          is null then b.spouse_name end,
      'spouse_date_of_birth', case when (v_survivor_row->>'spouse_date_of_birth') is null then b.spouse_date_of_birth::text end
  )) into v_field_union
  from (
    select
      (array_remove(array_agg(ac.email                order by cas.k1 desc, cas.k2 desc, cas.k3 desc nulls last, ac.id) filter (where nullif(btrim(ac.email),'')                is not null), null))[1] as email,
      (array_remove(array_agg(ac.phone                order by cas.k1 desc, cas.k2 desc, cas.k3 desc nulls last, ac.id) filter (where nullif(btrim(ac.phone),'')                is not null), null))[1] as phone,
      (array_remove(array_agg(ac.phone_secondary      order by cas.k1 desc, cas.k2 desc, cas.k3 desc nulls last, ac.id) filter (where nullif(btrim(ac.phone_secondary),'')      is not null), null))[1] as phone_secondary,
      (array_remove(array_agg(ac.address_line1        order by cas.k1 desc, cas.k2 desc, cas.k3 desc nulls last, ac.id) filter (where nullif(btrim(ac.address_line1),'')        is not null), null))[1] as address_line1,
      (array_remove(array_agg(ac.address_line2        order by cas.k1 desc, cas.k2 desc, cas.k3 desc nulls last, ac.id) filter (where nullif(btrim(ac.address_line2),'')        is not null), null))[1] as address_line2,
      (array_remove(array_agg(ac.city                 order by cas.k1 desc, cas.k2 desc, cas.k3 desc nulls last, ac.id) filter (where nullif(btrim(ac.city),'')                 is not null), null))[1] as city,
      (array_remove(array_agg(ac.state                order by cas.k1 desc, cas.k2 desc, cas.k3 desc nulls last, ac.id) filter (where nullif(btrim(ac.state),'')                is not null), null))[1] as state,
      (array_remove(array_agg(ac.zip_code             order by cas.k1 desc, cas.k2 desc, cas.k3 desc nulls last, ac.id) filter (where nullif(btrim(ac.zip_code),'')             is not null), null))[1] as zip_code,
      (array_remove(array_agg(ac.date_of_birth        order by cas.k1 desc, cas.k2 desc, cas.k3 desc nulls last, ac.id) filter (where ac.date_of_birth                         is not null), null))[1] as date_of_birth,
      (array_remove(array_agg(ac.spouse_name          order by cas.k1 desc, cas.k2 desc, cas.k3 desc nulls last, ac.id) filter (where nullif(btrim(ac.spouse_name),'')          is not null), null))[1] as spouse_name,
      (array_remove(array_agg(ac.spouse_date_of_birth order by cas.k1 desc, cas.k2 desc, cas.k3 desc nulls last, ac.id) filter (where ac.spouse_date_of_birth                  is not null), null))[1] as spouse_date_of_birth
    from public.accounts ac
    cross join lateral (select
      (select count(*) from public.policies p where p.account_id=ac.id and p.deleted_at is null) as k1,
      ((nullif(btrim(ac.email),'') is not null)::int + (nullif(btrim(ac.phone),'') is not null)::int + (nullif(btrim(ac.address_line1),'') is not null)::int) as k2,
      ac.updated_at as k3) cas
    where ac.id = any(p_losers)
  ) b;

  with cluster_pols as (
    select id, updated_at,
      btrim(regexp_replace(replace(lower(coalesce(carrier,'')), '&', ' and '), '\s+', ' ', 'g')) ck,
      lower(btrim(coalesce(line_of_business,'')))  lk,
      coalesce(effective_date, DATE '1900-01-01')  ek,
      lower(btrim(coalesce(policy_number,'')))     pk
    from public.policies where deleted_at is null and account_id = any(p_survivor || p_losers)
  ), ranked as (
    select id, row_number() over (partition by ck, lk, ek, pk order by updated_at desc nulls last, id) rn from cluster_pols
  )
  select coalesce(array_agg(id), '{}') into v_pol_dedup from ranked where rn > 1;

  if p_apply and array_length(v_pol_dedup,1) is not null then
    update public.policies set deleted_at = now() where id = any(v_pol_dedup) and deleted_at is null;
  end if;

  for v_fk in
    select cl.relname as tbl, att.attname as col
    from pg_constraint c
    join pg_class cl       on cl.oid = c.conrelid
    join pg_namespace ns   on ns.oid = cl.relnamespace and ns.nspname = 'public'
    join pg_attribute att  on att.attrelid = c.conrelid and att.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.accounts'::regclass
      and array_length(c.conkey,1) = 1
      and c.confkey[1] = (select attnum from pg_attribute where attrelid='public.accounts'::regclass and attname='id')
      and cl.relname <> 'accounts'
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
      if v_fk.tbl = 'policies' then
        raise exception '_do_account_merge: policy_number collision re-parenting into % — resolve manually (no policy is ever hard-deleted)', p_survivor;
      end if;
      if v_has_id then
        for v_child in execute format('SELECT id FROM public.%I WHERE %I = ANY($1)', v_fk.tbl, v_fk.col) using p_losers loop
          begin
            execute format('UPDATE public.%I SET %I = $1 WHERE id = $2', v_fk.tbl, v_fk.col) using p_survivor, v_child.id;
          exception when unique_violation then
            if not (v_fk.tbl = any(v_safe_delete)) then
              raise exception '_do_account_merge: unique-collision on % (not safe-delete allowlisted) — resolve manually', v_dkey;
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
          raise exception '_do_account_merge: unique-collision on no-id table % (not safe-deletable) — resolve manually', v_dkey;
        end if;
      end if;
    end;
  end loop;

  if p_apply then
    update public.accounts s set
      email                = coalesce(nullif(btrim(s.email),''),                v_field_union->>'email'),
      phone                = coalesce(nullif(btrim(s.phone),''),                v_field_union->>'phone'),
      phone_secondary      = coalesce(nullif(btrim(s.phone_secondary),''),      v_field_union->>'phone_secondary'),
      address_line1        = coalesce(nullif(btrim(s.address_line1),''),        v_field_union->>'address_line1'),
      address_line2        = coalesce(nullif(btrim(s.address_line2),''),        v_field_union->>'address_line2'),
      city                 = coalesce(nullif(btrim(s.city),''),                 v_field_union->>'city'),
      state                = coalesce(nullif(btrim(s.state),''),                v_field_union->>'state'),
      zip_code             = coalesce(nullif(btrim(s.zip_code),''),             v_field_union->>'zip_code'),
      date_of_birth        = coalesce(s.date_of_birth,        (v_field_union->>'date_of_birth')::date),
      spouse_name          = coalesce(nullif(btrim(s.spouse_name),''),          v_field_union->>'spouse_name'),
      spouse_date_of_birth = coalesce(s.spouse_date_of_birth, (v_field_union->>'spouse_date_of_birth')::date)
    where s.id = p_survivor;

    update public.accounts set deleted_at = now(), merged_into_id = p_survivor, merged_at = now()
    where id = any(p_losers) and deleted_at is null;

    insert into public.merge_history (entity_type, survivor_id, merged_ids, merge_data, merged_by)
    values ('accounts', p_survivor, p_losers,
      jsonb_build_object(
        'rule', p_rule, 'survivor_before', v_survivor_row, 'losers_before', v_losers_row,
        'field_union', v_field_union, 'reparented', v_reparent, 'reparent_total', v_total,
        'reparented_ids', v_reparent_ids, 'children_noid_before', v_children_noid,
        'children_deleted_on_conflict', v_deleted_rows, 'policies_dedup', to_jsonb(v_pol_dedup),
        'computed_survivor', v_computed, 'snapshot_at', now()),
      v_by)
    returning id into v_merge_id;

    insert into public.duplicate_flags (account_id, flagged_by, reason)
    select lid, v_by, format('merged into %s via %s', p_survivor, p_rule) from unnest(p_losers) lid;

    update public.duplicate_groups set status = 'merged', reviewed_by = v_by, reviewed_at = now()
    where status is distinct from 'merged' and entity_ids && p_losers;

    foreach l in array p_losers loop
      insert into public.account_relationships (from_account, to_account, rel_type, source, note, created_by)
      values (p_survivor, l, 'same_as', 'merge', 'Merged duplicate via ' || p_rule, v_by)
      on conflict do nothing;
    end loop;

    perform public.apply_consent_strictest_wins(p_survivor, p_losers);
  end if;

  return jsonb_build_object(
    'applied', p_apply, 'survivor', p_survivor, 'losers', to_jsonb(p_losers), 'rule', p_rule,
    'computed_survivor', v_computed, 'survivor_matches_cascade', (v_computed = p_survivor),
    'reparent_counts', v_reparent, 'reparent_total', v_total,
    'field_union', v_field_union, 'policies_dedup', to_jsonb(v_pol_dedup),
    'policies_dedup_count', coalesce(array_length(v_pol_dedup,1),0),
    'merge_history_id', v_merge_id
  );
end;
$function$;

-- Re-assert the lockdown grants to match the live grant state (only postgres +
-- service_role hold EXECUTE; public/anon/authenticated hold none). This function
-- is reached only as SECURITY DEFINER via the is_staff()-gated wrapper RPCs
-- (merge_accounts_manual / relgraph_merge_duplicate_group / preview_merge).
REVOKE ALL ON FUNCTION public._do_account_merge(uuid, uuid[], text, boolean) FROM public;
REVOKE ALL ON FUNCTION public._do_account_merge(uuid, uuid[], text, boolean) FROM anon;
REVOKE ALL ON FUNCTION public._do_account_merge(uuid, uuid[], text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._do_account_merge(uuid, uuid[], text, boolean) TO postgres;
GRANT EXECUTE ON FUNCTION public._do_account_merge(uuid, uuid[], text, boolean) TO service_role;
