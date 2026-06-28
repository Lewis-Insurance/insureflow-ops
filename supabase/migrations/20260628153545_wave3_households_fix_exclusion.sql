-- =====================================================================
-- Wave 3 (hotfix) — household matcher: exclusion fix (AUTHORITATIVE reconstruction)
-- =====================================================================
-- RECONSTRUCTION FOR REPO↔PROD HISTORY COMPLETENESS (Batch 2B).
-- Applied to prod during Effort 1; already in schema_migrations (db push skips it).
-- This is the CURRENT live definition of cleanup.refresh_households() dumped from
-- prod (pg_get_functiondef) on 2026-06-28 — it folds in both the MIN(uuid) fix
-- (20260628153334) and the exclusion fix, so replaying 20260628153222 then this
-- file reproduces the exact production function.
-- =====================================================================
CREATE OR REPLACE FUNCTION cleanup.refresh_households(p_apply boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_ws uuid := 'f1f07037-3032-45f8-93ca-72c0f47e4fbb';
  v_changed bigint; v_high int; v_med int; v_low int; v_accts int; v_linked int := 0;
BEGIN
  CREATE TEMP TABLE _hh ON COMMIT DROP AS
  SELECT a.id,
    lower(split_part(btrim(a.name),' ', greatest(1, array_length(string_to_array(btrim(a.name),' '),1)))) AS surname,
    nullif(split_part(btrim(coalesce(a.address_line1,'')),' ',1),'') AS house_no,
    cleanup.norm_addr(a.address_line1) AS addr_n,
    nullif(btrim(a.zip_code),'') AS zip,
    regexp_replace(coalesce(a.phone,''),'[^0-9]','','g') AS phone_n,
    lower(nullif(btrim(a.email),'')) AS email_n,
    lower(nullif(btrim(a.city),'')) AS city_n
  FROM public.accounts a
  WHERE a.deleted_at IS NULL
    AND a.agency_workspace_id = v_ws
    AND coalesce(a.zip_code,'') <> '32055'
    AND a.name !~* '(lewis insurance|daysheet)'
    AND a.name !~* '^brian.*lewis'
    AND regexp_replace(coalesce(a.phone,''),'[^0-9]','','g') <> '3863628300'
    AND coalesce(a.address_line1,'') NOT ILIKE '%1313 W US HWY 90%'
    AND a.type::text <> 'commercial_business'
    AND a.name !~* '(\m(llc|inc|corp|llp|pllc|church|ministr|ministries|trust|trustee|estate|holdings|enterprises|services|works|farms?|ranch|leasing|properties|apostolic|baptist)\M)'
    AND a.id NOT IN (
      SELECT unnest(dc.member_ids) FROM cleanup.dup_clusters dc
      WHERE dc.disposition='REVIEW'
        AND (SELECT count(*) FROM public.accounts ac WHERE ac.id = ANY(dc.member_ids) AND ac.deleted_at IS NULL) >= 2
    );

  CREATE TEMP TABLE _edges ON COMMIT DROP AS
  WITH e_a AS (
    SELECT a.id id1, b.id id2, 'A'::text kind FROM _hh a JOIN _hh b
      ON a.surname=b.surname AND a.house_no=b.house_no AND a.zip=b.zip AND a.id<b.id
      WHERE a.surname<>'' AND a.house_no IS NOT NULL AND a.zip IS NOT NULL),
  e_b AS (
    SELECT a.id id1, b.id id2, CASE WHEN a.surname=b.surname THEN 'B_same' ELSE 'B_diff' END kind
      FROM _hh a JOIN _hh b ON a.addr_n=b.addr_n AND a.zip=b.zip AND a.id<b.id
      WHERE a.addr_n<>'' AND a.zip IS NOT NULL),
  e_c AS (
    SELECT a.id id1, b.id id2, 'C'::text kind FROM _hh a JOIN _hh b
      ON a.email_n=b.email_n AND a.id<b.id WHERE a.email_n IS NOT NULL),
  e_d AS (
    SELECT a.id id1, b.id id2, 'D'::text kind FROM _hh a JOIN _hh b
      ON a.phone_n=b.phone_n AND a.id<b.id
      WHERE length(a.phone_n)>=10 AND NOT (a.surname<>b.surname AND coalesce(a.city_n,'')<>coalesce(b.city_n,'')))
  SELECT id1, id2, kind FROM e_a
  UNION ALL SELECT id1,id2,kind FROM e_b
  UNION ALL SELECT id1,id2,kind FROM e_c
  UNION ALL SELECT id1,id2,kind FROM e_d;

  CREATE TEMP TABLE _ue ON COMMIT DROP AS
  SELECT DISTINCT id1 src, id2 dst FROM _edges UNION SELECT id2, id1 FROM _edges;

  CREATE TEMP TABLE _comp ON COMMIT DROP AS SELECT DISTINCT src node, src label FROM _ue;
  LOOP
    WITH prop AS (SELECT u.src node, MIN(c.label::text)::uuid ml FROM _ue u JOIN _comp c ON c.node=u.dst GROUP BY u.src)
    UPDATE _comp t SET label = prop.ml FROM prop WHERE prop.node = t.node AND prop.ml < t.label;
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    EXIT WHEN v_changed = 0;
  END LOOP;

  CREATE TEMP TABLE _members ON COMMIT DROP AS
  SELECT label AS comp, array_agg(node ORDER BY node) ids, count(*) n
  FROM _comp GROUP BY label HAVING count(*) >= 2;

  CREATE TEMP TABLE _ctier ON COMMIT DROP AS
  SELECT cc.label AS comp,
    CASE WHEN bool_or(ec.kind IN ('A','B_same')) THEN 'HIGH'
         WHEN bool_or(ec.kind IN ('B_diff','C')) THEN 'MEDIUM' ELSE 'LOW' END AS tier,
    array(SELECT DISTINCT k FROM unnest(array_agg(ec.kind)) k ORDER BY k) AS signals
  FROM _comp cc JOIN _members m ON m.comp = cc.label JOIN _edges ec ON ec.id1 = cc.node
  GROUP BY cc.label;

  CREATE TEMP TABLE _final ON COMMIT DROP AS
  SELECT md5('hh:'||m.comp::text)::uuid AS household_id, m.comp, m.ids, t.tier, t.signals,
         public.compute_account_survivor(m.ids) AS primary_account_id
  FROM _members m JOIN _ctier t ON t.comp = m.comp;

  SELECT count(*) FILTER (WHERE tier='HIGH'), count(*) FILTER (WHERE tier='MEDIUM'),
         count(*) FILTER (WHERE tier='LOW'), coalesce(sum(array_length(ids,1)),0)
    INTO v_high, v_med, v_low, v_accts FROM _final;

  IF p_apply THEN
    INSERT INTO public.households (id, org_id, agency_workspace_id, name, primary_account_id, tier, match_signals, linked_by, created_at, updated_at)
    SELECT household_id, v_ws, v_ws, NULL, primary_account_id, tier, signals,
           CASE WHEN tier='HIGH' THEN 'auto' ELSE 'review' END, now(), now()
    FROM _final
    ON CONFLICT (id) DO UPDATE SET tier=EXCLUDED.tier, match_signals=EXCLUDED.match_signals,
        primary_account_id=EXCLUDED.primary_account_id, linked_by=EXCLUDED.linked_by, updated_at=now();

    DELETE FROM cleanup.hh_candidates;
    INSERT INTO cleanup.hh_candidates (household_id, account_id, tier, signals)
    SELECT f.household_id, unnest(f.ids), f.tier, f.signals FROM _final f;

    UPDATE public.accounts a
    SET household_id = f.household_id
    FROM _final f
    WHERE a.id = ANY(f.ids) AND f.tier='HIGH'
      AND a.household_id IS DISTINCT FROM f.household_id;
    GET DIAGNOSTICS v_linked = ROW_COUNT;

    UPDATE public.accounts a SET household_id = NULL
    WHERE a.household_id IS NOT NULL
      AND a.id NOT IN (SELECT unnest(ids) FROM _final WHERE tier='HIGH');
  END IF;

  RETURN jsonb_build_object('applied',p_apply,'high',v_high,'medium',v_med,'low',v_low,
                            'total_accounts',v_accts,'accounts_linked',v_linked);
END;
$function$;
