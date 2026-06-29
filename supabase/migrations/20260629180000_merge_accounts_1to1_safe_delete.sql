-- Make merge_accounts work on real accounts: add the 1:1 account-keyed detail tables
-- to the safe_delete allowlist. Every live account has an insured_profiles row
-- (PK = account_id), and business accounts a commercial_business_accounts row, so a
-- merge collided on those unique keys and failed-closed ("resolve manually"). Those
-- detail rows are derived/per-account; on collision keep the survivor's and snapshot+
-- drop the loser's (captured in children_deleted_on_conflict -> restored by unmerge).
-- Only the v_safe_delete array changes; the rest of merge_accounts is unchanged.

CREATE OR REPLACE FUNCTION public.merge_accounts(p_survivor uuid, p_losers uuid[], p_rule text, p_merged_by uuid DEFAULT NULL::uuid, p_apply boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_safe_delete text[] := ARRAY[
    'pipeline_stages','pipeline_metrics','customer_risk_scores','client_happiness_scores',
    'client_context_cache','client_context_embeddings','client_context_index_jobs',
    'account_tags','tags','account_memberships','insured_emails','producer_workload_stats',
    'product_recommendations',
    'insured_profiles','commercial_business_accounts','household_accounts'];
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
BEGIN
  IF p_survivor IS NULL OR p_losers IS NULL OR array_length(p_losers,1) IS NULL THEN
    RAISE EXCEPTION 'merge_accounts: survivor and >=1 loser required'; END IF;
  IF p_survivor = ANY(p_losers) THEN
    RAISE EXCEPTION 'merge_accounts: survivor % present in losers', p_survivor; END IF;
  IF p_apply AND p_merged_by IS NULL THEN
    RAISE EXCEPTION 'merge_accounts: merged_by required when apply=true'; END IF;
  PERFORM 1 FROM public.accounts WHERE id = p_survivor AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'merge_accounts: survivor % is not an active account', p_survivor; END IF;

  v_computed := public.compute_account_survivor(p_survivor || p_losers);

  IF p_apply THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      (SELECT string_agg(x::text, ',' ORDER BY x::text) FROM unnest(p_survivor || p_losers) x), 0));
    PERFORM a.id FROM public.accounts a WHERE a.id = ANY(p_survivor || p_losers) ORDER BY a.id FOR UPDATE;

    SELECT array_agg(id ORDER BY id) INTO v_active_losers FROM public.accounts WHERE id = ANY(p_losers) AND deleted_at IS NULL;
    IF v_active_losers IS NULL THEN
      IF (SELECT bool_and(merged_into_id = p_survivor) FROM public.accounts WHERE id = ANY(p_losers)) THEN
        RETURN jsonb_build_object('applied',true,'skipped_idempotent',true,'survivor',p_survivor,
                                  'losers',to_jsonb(p_losers),'reason','all losers already merged into this survivor');
      END IF;
      RAISE EXCEPTION 'merge_accounts: losers already soft-deleted but not into this survivor';
    END IF;
    IF (SELECT count(*) FROM public.accounts WHERE id = ANY(p_losers) AND deleted_at IS NULL) <> array_length(p_losers,1) THEN
      RAISE EXCEPTION 'merge_accounts: some losers already inactive — resolve before merging';
    END IF;
  END IF;

  SELECT to_jsonb(a) INTO v_survivor_row FROM public.accounts a WHERE id = p_survivor;
  SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) INTO v_losers_row FROM public.accounts a WHERE id = ANY(p_losers);

  SELECT jsonb_strip_nulls(jsonb_build_object(
      'email',                CASE WHEN nullif(btrim(v_survivor_row->>'email'),'')                IS NULL THEN b.email END,
      'phone',                CASE WHEN nullif(btrim(v_survivor_row->>'phone'),'')                IS NULL THEN b.phone END,
      'phone_secondary',      CASE WHEN nullif(btrim(v_survivor_row->>'phone_secondary'),'')      IS NULL THEN b.phone_secondary END,
      'address_line1',        CASE WHEN nullif(btrim(v_survivor_row->>'address_line1'),'')        IS NULL THEN b.address_line1 END,
      'address_line2',        CASE WHEN nullif(btrim(v_survivor_row->>'address_line2'),'')        IS NULL THEN b.address_line2 END,
      'city',                 CASE WHEN nullif(btrim(v_survivor_row->>'city'),'')                 IS NULL THEN b.city END,
      'state',                CASE WHEN nullif(btrim(v_survivor_row->>'state'),'')                IS NULL THEN b.state END,
      'zip_code',             CASE WHEN nullif(btrim(v_survivor_row->>'zip_code'),'')             IS NULL THEN b.zip_code END,
      'date_of_birth',        CASE WHEN (v_survivor_row->>'date_of_birth')        IS NULL THEN b.date_of_birth::text END,
      'spouse_name',          CASE WHEN nullif(btrim(v_survivor_row->>'spouse_name'),'')          IS NULL THEN b.spouse_name END,
      'spouse_date_of_birth', CASE WHEN (v_survivor_row->>'spouse_date_of_birth') IS NULL THEN b.spouse_date_of_birth::text END
  )) INTO v_field_union
  FROM (
    SELECT
      (array_remove(array_agg(ac.email                ORDER BY cas.k1 DESC, cas.k2 DESC, cas.k3 DESC NULLS LAST, ac.id) FILTER (WHERE nullif(btrim(ac.email),'')                IS NOT NULL), NULL))[1] AS email,
      (array_remove(array_agg(ac.phone                ORDER BY cas.k1 DESC, cas.k2 DESC, cas.k3 DESC NULLS LAST, ac.id) FILTER (WHERE nullif(btrim(ac.phone),'')                IS NOT NULL), NULL))[1] AS phone,
      (array_remove(array_agg(ac.phone_secondary      ORDER BY cas.k1 DESC, cas.k2 DESC, cas.k3 DESC NULLS LAST, ac.id) FILTER (WHERE nullif(btrim(ac.phone_secondary),'')      IS NOT NULL), NULL))[1] AS phone_secondary,
      (array_remove(array_agg(ac.address_line1        ORDER BY cas.k1 DESC, cas.k2 DESC, cas.k3 DESC NULLS LAST, ac.id) FILTER (WHERE nullif(btrim(ac.address_line1),'')        IS NOT NULL), NULL))[1] AS address_line1,
      (array_remove(array_agg(ac.address_line2        ORDER BY cas.k1 DESC, cas.k2 DESC, cas.k3 DESC NULLS LAST, ac.id) FILTER (WHERE nullif(btrim(ac.address_line2),'')        IS NOT NULL), NULL))[1] AS address_line2,
      (array_remove(array_agg(ac.city                 ORDER BY cas.k1 DESC, cas.k2 DESC, cas.k3 DESC NULLS LAST, ac.id) FILTER (WHERE nullif(btrim(ac.city),'')                 IS NOT NULL), NULL))[1] AS city,
      (array_remove(array_agg(ac.state                ORDER BY cas.k1 DESC, cas.k2 DESC, cas.k3 DESC NULLS LAST, ac.id) FILTER (WHERE nullif(btrim(ac.state),'')                IS NOT NULL), NULL))[1] AS state,
      (array_remove(array_agg(ac.zip_code             ORDER BY cas.k1 DESC, cas.k2 DESC, cas.k3 DESC NULLS LAST, ac.id) FILTER (WHERE nullif(btrim(ac.zip_code),'')             IS NOT NULL), NULL))[1] AS zip_code,
      (array_remove(array_agg(ac.date_of_birth        ORDER BY cas.k1 DESC, cas.k2 DESC, cas.k3 DESC NULLS LAST, ac.id) FILTER (WHERE ac.date_of_birth                         IS NOT NULL), NULL))[1] AS date_of_birth,
      (array_remove(array_agg(ac.spouse_name          ORDER BY cas.k1 DESC, cas.k2 DESC, cas.k3 DESC NULLS LAST, ac.id) FILTER (WHERE nullif(btrim(ac.spouse_name),'')          IS NOT NULL), NULL))[1] AS spouse_name,
      (array_remove(array_agg(ac.spouse_date_of_birth ORDER BY cas.k1 DESC, cas.k2 DESC, cas.k3 DESC NULLS LAST, ac.id) FILTER (WHERE ac.spouse_date_of_birth                  IS NOT NULL), NULL))[1] AS spouse_date_of_birth
    FROM public.accounts ac
    CROSS JOIN LATERAL (SELECT
      (SELECT count(*) FROM public.policies p WHERE p.account_id=ac.id AND p.deleted_at IS NULL) AS k1,
      ((nullif(btrim(ac.email),'') IS NOT NULL)::int + (nullif(btrim(ac.phone),'') IS NOT NULL)::int + (nullif(btrim(ac.address_line1),'') IS NOT NULL)::int) AS k2,
      ac.updated_at AS k3) cas
    WHERE ac.id = ANY(p_losers)
  ) b;

  WITH cluster_pols AS (
    SELECT id, updated_at,
      lower(btrim(coalesce(carrier,'')))           ck,
      lower(btrim(coalesce(line_of_business,'')))  lk,
      coalesce(effective_date, DATE '1900-01-01')  ek,
      lower(btrim(coalesce(policy_number,'')))     pk
    FROM public.policies WHERE deleted_at IS NULL AND account_id = ANY(p_survivor || p_losers)
  ), ranked AS (
    SELECT id, row_number() OVER (PARTITION BY ck, lk, ek, pk ORDER BY updated_at DESC NULLS LAST, id) rn FROM cluster_pols
  )
  SELECT coalesce(array_agg(id), '{}') INTO v_pol_dedup FROM ranked WHERE rn > 1;

  IF p_apply AND array_length(v_pol_dedup,1) IS NOT NULL THEN
    UPDATE public.policies SET deleted_at = now() WHERE id = ANY(v_pol_dedup) AND deleted_at IS NULL;
  END IF;

  FOR v_fk IN
    SELECT cl.relname AS tbl, att.attname AS col
    FROM pg_constraint c
    JOIN pg_class cl       ON cl.oid = c.conrelid
    JOIN pg_namespace ns   ON ns.oid = cl.relnamespace AND ns.nspname = 'public'
    JOIN pg_attribute att  ON att.attrelid = c.conrelid AND att.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'public.accounts'::regclass
      AND array_length(c.conkey,1) = 1
      AND c.confkey[1] = (SELECT attnum FROM pg_attribute WHERE attrelid='public.accounts'::regclass AND attname='id')
      AND cl.relname <> 'accounts'
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = ANY($1)', v_fk.tbl, v_fk.col) INTO v_cnt USING p_losers;
    CONTINUE WHEN v_cnt = 0;
    v_dkey := v_fk.tbl || '.' || v_fk.col;
    v_reparent := v_reparent || jsonb_build_object(v_dkey, v_cnt);
    v_total := v_total + v_cnt;
    CONTINUE WHEN NOT p_apply;

    SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=('public.'||quote_ident(v_fk.tbl))::regclass AND attname='id' AND NOT attisdropped) INTO v_has_id;

    IF v_has_id THEN
      EXECUTE format('SELECT array_agg(id) FROM public.%I WHERE %I = ANY($1)', v_fk.tbl, v_fk.col) INTO v_ids USING p_losers;
      v_reparent_ids := jsonb_set(v_reparent_ids, ARRAY[v_dkey], to_jsonb(v_ids), true);
    ELSE
      EXECUTE format('SELECT jsonb_agg(to_jsonb(t)) FROM public.%I t WHERE %I = ANY($1)', v_fk.tbl, v_fk.col) INTO v_rowjson USING p_losers;
      v_children_noid := jsonb_set(v_children_noid, ARRAY[v_dkey], coalesce(v_rowjson,'[]'::jsonb), true);
    END IF;

    BEGIN
      EXECUTE format('UPDATE public.%I SET %I = $1 WHERE %I = ANY($2)', v_fk.tbl, v_fk.col, v_fk.col) USING p_survivor, p_losers;
    EXCEPTION WHEN unique_violation THEN
      IF v_fk.tbl = 'policies' THEN
        RAISE EXCEPTION 'merge_accounts: policy_number collision re-parenting into % — resolve manually (no policy is ever hard-deleted)', p_survivor;
      END IF;
      IF v_has_id THEN
        FOR v_child IN EXECUTE format('SELECT id FROM public.%I WHERE %I = ANY($1)', v_fk.tbl, v_fk.col) USING p_losers LOOP
          BEGIN
            EXECUTE format('UPDATE public.%I SET %I = $1 WHERE id = $2', v_fk.tbl, v_fk.col) USING p_survivor, v_child.id;
          EXCEPTION WHEN unique_violation THEN
            IF NOT (v_fk.tbl = ANY(v_safe_delete)) THEN
              RAISE EXCEPTION 'merge_accounts: unique-collision on % (not safe-delete allowlisted) — resolve manually', v_dkey;
            END IF;
            EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id = $1', v_fk.tbl) INTO v_rowjson USING v_child.id;
            v_deleted_rows := jsonb_set(v_deleted_rows, ARRAY[v_dkey], coalesce(v_deleted_rows->v_dkey,'[]'::jsonb) || v_rowjson, true);
            EXECUTE format('DELETE FROM public.%I WHERE id = $1', v_fk.tbl) USING v_child.id;
          END;
        END LOOP;
      ELSE
        SELECT EXISTS (
          SELECT 1 FROM pg_constraint con
          JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum = ANY(con.conkey)
          WHERE con.conrelid=('public.'||quote_ident(v_fk.tbl))::regclass AND con.contype IN ('u','p') AND a.attname=v_fk.col
        ) INTO v_acct_unique;
        IF v_acct_unique AND (v_fk.tbl = ANY(v_safe_delete)) THEN
          EXECUTE format('SELECT jsonb_agg(to_jsonb(t)) FROM public.%I t WHERE t.%I = ANY($1) AND EXISTS (SELECT 1 FROM public.%I s WHERE s.%I = $2)', v_fk.tbl, v_fk.col, v_fk.tbl, v_fk.col) INTO v_rowjson USING p_losers, p_survivor;
          IF v_rowjson IS NOT NULL THEN v_deleted_rows := jsonb_set(v_deleted_rows, ARRAY[v_dkey], v_rowjson, true); END IF;
          EXECUTE format('DELETE FROM public.%I d WHERE d.%I = ANY($1) AND EXISTS (SELECT 1 FROM public.%I s WHERE s.%I = $2)', v_fk.tbl, v_fk.col, v_fk.tbl, v_fk.col) USING p_losers, p_survivor;
          EXECUTE format('UPDATE public.%I SET %I = $1 WHERE %I = ANY($2)', v_fk.tbl, v_fk.col, v_fk.col) USING p_survivor, p_losers;
        ELSE
          RAISE EXCEPTION 'merge_accounts: unique-collision on no-id table % (not safe-deletable) — resolve manually', v_dkey;
        END IF;
      END IF;
    END;
  END LOOP;

  IF p_apply THEN
    UPDATE public.accounts s SET
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
    WHERE s.id = p_survivor;

    UPDATE public.accounts SET deleted_at = now(), merged_into_id = p_survivor, merged_at = now()
    WHERE id = ANY(p_losers) AND deleted_at IS NULL;

    INSERT INTO public.merge_history (entity_type, survivor_id, merged_ids, merge_data, merged_by)
    VALUES ('accounts', p_survivor, p_losers,
      jsonb_build_object(
        'rule', p_rule, 'survivor_before', v_survivor_row, 'losers_before', v_losers_row,
        'field_union', v_field_union, 'reparented', v_reparent, 'reparent_total', v_total,
        'reparented_ids', v_reparent_ids, 'children_noid_before', v_children_noid,
        'children_deleted_on_conflict', v_deleted_rows, 'policies_dedup', to_jsonb(v_pol_dedup),
        'computed_survivor', v_computed, 'snapshot_at', now()),
      p_merged_by)
    RETURNING id INTO v_merge_id;

    INSERT INTO public.duplicate_flags (account_id, flagged_by, reason)
    SELECT lid, p_merged_by, format('merged into %s via %s', p_survivor, p_rule) FROM unnest(p_losers) lid;

    UPDATE public.duplicate_groups SET status = 'merged', reviewed_by = p_merged_by, reviewed_at = now()
    WHERE status IS DISTINCT FROM 'merged' AND entity_ids && p_losers;
  END IF;

  RETURN jsonb_build_object(
    'applied', p_apply, 'survivor', p_survivor, 'losers', to_jsonb(p_losers), 'rule', p_rule,
    'computed_survivor', v_computed, 'survivor_matches_cascade', (v_computed = p_survivor),
    'reparent_counts', v_reparent, 'reparent_total', v_total,
    'field_union', v_field_union, 'policies_dedup', to_jsonb(v_pol_dedup),
    'policies_dedup_count', coalesce(array_length(v_pol_dedup,1),0),
    'merge_history_id', v_merge_id
  );
END;
$function$;
