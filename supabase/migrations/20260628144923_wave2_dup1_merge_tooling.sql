-- =====================================================================
-- Wave 2 · DUP-1 + MODEL-7 — Account merge tooling (NON-destructive to build)
-- =====================================================================
-- Creates: tombstone columns, rule taxonomy seed, compute_account_survivor(),
--          and merge_accounts(survivor, losers[], rule, merged_by, apply=false).
-- merge_accounts is DRY-RUN by default: with apply=false it writes NOTHING and
-- returns the plan (survivor, per-FK-table re-parent counts, field-union, predicted
-- policy dedup). Only apply=true mutates (soft-delete losers + re-parent + log).
--   * Dynamic re-parent of EVERY FK column referencing accounts.id (from
--     information_schema -> new tables covered automatically), with generic
--     unique-constraint collision handling.
--   * NEVER hard-deletes an account (prevent_hard_delete trigger also blocks it).
--   * Full merge_history undo manifest (survivor_before, losers_before, reparented
--     map, field_union, policies_dedup) -> reversible.
-- Reverse (tooling): DROP FUNCTION merge_accounts, compute_account_survivor;
--                    (tombstone columns + seeded rules are additive/harmless.)
-- Date: 2026-06-28
-- =====================================================================

-- Tombstone columns on accounts (additive; align with the app's merge model).
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS merged_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_accounts_merged_into_id ON public.accounts(merged_into_id);

-- Rule taxonomy (idempotent by rule_name).
INSERT INTO public.duplicate_detection_rules (entity_type, rule_name, match_fields, threshold, is_active)
SELECT v.entity_type, v.rule_name, v.match_fields, v.threshold, true
FROM (VALUES
  ('accounts','T1_SHARED_ADDR',   '{"name":"exact","address":"exact"}'::jsonb,                 0.95),
  ('accounts','T1_SHARED_PHONE',  '{"name":"exact","phone":"exact","address":"different"}'::jsonb, 0.85),
  ('accounts','T2_EMAIL_OR_ZIP',  '{"name":"exact","or":[{"email":"exact"},{"zip":"exact"}]}'::jsonb, 0.80),
  ('accounts','T3_CONFLICT_ADDR', '{"name":"exact","address":"different"}'::jsonb,              0.60),
  ('accounts','IDENT_POLICY',     '{"name":"exact","policy":"carrier+line+effdate+number"}'::jsonb, 0.97),
  ('accounts','SORENSEN_RANCHERA','{"name":"exact","address":"ranchera_typo"}'::jsonb,          0.95)
) v(entity_type,rule_name,match_fields,threshold)
WHERE NOT EXISTS (SELECT 1 FROM public.duplicate_detection_rules r WHERE r.rule_name = v.rule_name);

-- Survivor selection cascade (most active policies -> most complete contact -> most
-- recent updated_at -> lowest id). Deterministic & reproducible.
CREATE OR REPLACE FUNCTION public.compute_account_survivor(p_ids uuid[])
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT a.id
  FROM public.accounts a
  LEFT JOIN LATERAL (
    SELECT count(*) pc FROM public.policies p WHERE p.account_id = a.id AND p.deleted_at IS NULL
  ) pol ON true
  WHERE a.id = ANY(p_ids) AND a.deleted_at IS NULL
  ORDER BY pol.pc DESC,
           ((a.email IS NOT NULL)::int + (a.phone IS NOT NULL)::int + (a.address_line1 IS NOT NULL)::int) DESC,
           a.updated_at DESC NULLS LAST,
           a.id::text ASC
  LIMIT 1;
$$;

-- The merge engine.
CREATE OR REPLACE FUNCTION public.merge_accounts(
  p_survivor  uuid,
  p_losers    uuid[],
  p_rule      text,
  p_merged_by uuid DEFAULT NULL,
  p_apply     boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_fk           record;
  v_has_id       boolean;
  v_cnt          bigint;
  v_total        bigint := 0;
  v_reparent     jsonb := '{}'::jsonb;
  v_deleted      jsonb := '{}'::jsonb;
  v_survivor_row jsonb;
  v_losers_row   jsonb;
  v_field_union  jsonb := '{}'::jsonb;
  v_pol_dedup    uuid[] := '{}';
  v_merge_id     uuid;
  v_child        record;
  v_dkey         text;
BEGIN
  -- ---- guards ----
  IF p_survivor IS NULL OR p_losers IS NULL OR array_length(p_losers,1) IS NULL THEN
    RAISE EXCEPTION 'merge_accounts: survivor and >=1 loser required';
  END IF;
  IF p_survivor = ANY(p_losers) THEN
    RAISE EXCEPTION 'merge_accounts: survivor % present in losers', p_survivor;
  END IF;
  IF p_apply AND p_merged_by IS NULL THEN
    RAISE EXCEPTION 'merge_accounts: merged_by required when apply=true';
  END IF;
  PERFORM 1 FROM public.accounts WHERE id = p_survivor AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'merge_accounts: survivor % is not an active account', p_survivor; END IF;

  IF p_apply THEN
    -- deterministic cluster lock
    PERFORM pg_advisory_xact_lock(hashtextextended(p_survivor::text, 0));
    PERFORM a.id FROM public.accounts a WHERE a.id = ANY(p_survivor || p_losers) ORDER BY a.id FOR UPDATE;
  END IF;

  -- ---- snapshots ----
  SELECT to_jsonb(a) INTO v_survivor_row FROM public.accounts a WHERE id = p_survivor;
  SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) INTO v_losers_row FROM public.accounts a WHERE id = ANY(p_losers);

  -- ---- field-union plan (survivor wins; backfill blanks from best loser in array order) ----
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
      (array_remove(array_agg(email                ORDER BY array_position(p_losers, id)) FILTER (WHERE nullif(btrim(email),'')                IS NOT NULL), NULL))[1] AS email,
      (array_remove(array_agg(phone                ORDER BY array_position(p_losers, id)) FILTER (WHERE nullif(btrim(phone),'')                IS NOT NULL), NULL))[1] AS phone,
      (array_remove(array_agg(phone_secondary      ORDER BY array_position(p_losers, id)) FILTER (WHERE nullif(btrim(phone_secondary),'')      IS NOT NULL), NULL))[1] AS phone_secondary,
      (array_remove(array_agg(address_line1        ORDER BY array_position(p_losers, id)) FILTER (WHERE nullif(btrim(address_line1),'')        IS NOT NULL), NULL))[1] AS address_line1,
      (array_remove(array_agg(address_line2        ORDER BY array_position(p_losers, id)) FILTER (WHERE nullif(btrim(address_line2),'')        IS NOT NULL), NULL))[1] AS address_line2,
      (array_remove(array_agg(city                 ORDER BY array_position(p_losers, id)) FILTER (WHERE nullif(btrim(city),'')                 IS NOT NULL), NULL))[1] AS city,
      (array_remove(array_agg(state                ORDER BY array_position(p_losers, id)) FILTER (WHERE nullif(btrim(state),'')                IS NOT NULL), NULL))[1] AS state,
      (array_remove(array_agg(zip_code             ORDER BY array_position(p_losers, id)) FILTER (WHERE nullif(btrim(zip_code),'')             IS NOT NULL), NULL))[1] AS zip_code,
      (array_remove(array_agg(date_of_birth        ORDER BY array_position(p_losers, id)) FILTER (WHERE date_of_birth                          IS NOT NULL), NULL))[1] AS date_of_birth,
      (array_remove(array_agg(spouse_name          ORDER BY array_position(p_losers, id)) FILTER (WHERE nullif(btrim(spouse_name),'')          IS NOT NULL), NULL))[1] AS spouse_name,
      (array_remove(array_agg(spouse_date_of_birth ORDER BY array_position(p_losers, id)) FILTER (WHERE spouse_date_of_birth                   IS NOT NULL), NULL))[1] AS spouse_date_of_birth
    FROM public.accounts WHERE id = ANY(p_losers)
  ) b;

  -- ---- predicted/actual within-cluster policy dedup (identical carrier+line+effdate+number) ----
  WITH cluster_pols AS (
    SELECT id, updated_at,
      lower(btrim(coalesce(carrier,'')))           ck,
      lower(btrim(coalesce(line_of_business,'')))  lk,
      coalesce(effective_date, DATE '1900-01-01')  ek,
      lower(btrim(coalesce(policy_number,'')))     pk
    FROM public.policies
    WHERE deleted_at IS NULL AND account_id = ANY(p_survivor || p_losers)
  ), ranked AS (
    SELECT id, row_number() OVER (PARTITION BY ck, lk, ek, pk ORDER BY updated_at DESC NULLS LAST, id) rn
    FROM cluster_pols
  )
  SELECT coalesce(array_agg(id), '{}') INTO v_pol_dedup FROM ranked WHERE rn > 1;

  -- ---- dynamic re-parent of every FK column referencing accounts.id ----
  FOR v_fk IN
    -- pg_catalog (fast) equivalent of the information_schema FK census; single-column
    -- FKs referencing accounts.id, excluding the accounts self-ref tombstone.
    SELECT cl.relname AS tbl, att.attname AS col
    FROM pg_constraint c
    JOIN pg_class cl       ON cl.oid = c.conrelid
    JOIN pg_namespace ns   ON ns.oid = cl.relnamespace AND ns.nspname = 'public'
    JOIN pg_attribute att  ON att.attrelid = c.conrelid AND att.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.accounts'::regclass
      AND array_length(c.conkey, 1) = 1
      AND c.confkey[1] = (SELECT attnum FROM pg_attribute
                          WHERE attrelid = 'public.accounts'::regclass AND attname = 'id')
      AND cl.relname <> 'accounts'   -- skip the self-ref tombstone
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = ANY($1)', v_fk.tbl, v_fk.col)
      INTO v_cnt USING p_losers;
    CONTINUE WHEN v_cnt = 0;
    v_reparent := v_reparent || jsonb_build_object(v_fk.tbl || '.' || v_fk.col, v_cnt);
    v_total := v_total + v_cnt;

    IF p_apply THEN
      SELECT EXISTS (SELECT 1 FROM pg_attribute
                     WHERE attrelid = ('public.' || quote_ident(v_fk.tbl))::regclass
                       AND attname = 'id' AND NOT attisdropped)
        INTO v_has_id;
      BEGIN
        EXECUTE format('UPDATE public.%I SET %I = $1 WHERE %I = ANY($2)', v_fk.tbl, v_fk.col, v_fk.col)
          USING p_survivor, p_losers;
      EXCEPTION WHEN unique_violation THEN
        v_dkey := v_fk.tbl || '.' || v_fk.col;
        IF v_has_id THEN
          -- per-row: move what fits; drop colliding loser rows (captured in manifest count)
          FOR v_child IN EXECUTE format('SELECT id FROM public.%I WHERE %I = ANY($1)', v_fk.tbl, v_fk.col) USING p_losers
          LOOP
            BEGIN
              EXECUTE format('UPDATE public.%I SET %I = $1 WHERE id = $2', v_fk.tbl, v_fk.col)
                USING p_survivor, v_child.id;
            EXCEPTION WHEN unique_violation THEN
              EXECUTE format('DELETE FROM public.%I WHERE id = $1', v_fk.tbl) USING v_child.id;
              v_deleted := jsonb_set(v_deleted, ARRAY[v_dkey],
                                     to_jsonb(coalesce((v_deleted->>v_dkey)::int,0) + 1), true);
            END;
          END LOOP;
        ELSE
          -- account_id is the PK (no surrogate): delete colliding losers, move the rest
          EXECUTE format(
            'WITH del AS (DELETE FROM public.%I d WHERE d.%I = ANY($1) AND EXISTS (SELECT 1 FROM public.%I s WHERE s.%I = $2) RETURNING 1) SELECT count(*) FROM del',
            v_fk.tbl, v_fk.col, v_fk.tbl, v_fk.col) INTO v_cnt USING p_losers, p_survivor;
          v_deleted := jsonb_set(v_deleted, ARRAY[v_dkey], to_jsonb(v_cnt), true);
          EXECUTE format('UPDATE public.%I SET %I = $1 WHERE %I = ANY($2)', v_fk.tbl, v_fk.col, v_fk.col)
            USING p_survivor, p_losers;
        END IF;
      END;
    END IF;
  END LOOP;

  -- ---- apply: dedup survivor policies, union fields, soft-delete losers, log ----
  IF p_apply THEN
    IF array_length(v_pol_dedup,1) IS NOT NULL THEN
      UPDATE public.policies SET deleted_at = now() WHERE id = ANY(v_pol_dedup) AND deleted_at IS NULL;
    END IF;

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
        'children_deleted_on_conflict', v_deleted, 'policies_dedup', to_jsonb(v_pol_dedup),
        'snapshot_at', now()),
      p_merged_by)
    RETURNING id INTO v_merge_id;

    INSERT INTO public.duplicate_flags (account_id, flagged_by, reason)
    SELECT lid, p_merged_by, format('merged into %s via %s', p_survivor, p_rule)
    FROM unnest(p_losers) lid;

    UPDATE public.duplicate_groups SET status = 'merged', reviewed_by = p_merged_by, reviewed_at = now()
    WHERE status IS DISTINCT FROM 'merged' AND entity_ids && p_losers;
  END IF;

  RETURN jsonb_build_object(
    'applied', p_apply, 'survivor', p_survivor, 'losers', to_jsonb(p_losers), 'rule', p_rule,
    'reparent_counts', v_reparent, 'reparent_total', v_total,
    'children_deleted_on_conflict', v_deleted,
    'field_union', v_field_union,
    'policies_dedup', to_jsonb(v_pol_dedup),
    'policies_dedup_count', coalesce(array_length(v_pol_dedup,1),0),
    'merge_history_id', v_merge_id
  );
END;
$fn$;

-- Restrict the merge engine to the service role (admin/backend) only.
REVOKE ALL ON FUNCTION public.merge_accounts(uuid, uuid[], text, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_accounts(uuid, uuid[], text, uuid, boolean) TO service_role;
