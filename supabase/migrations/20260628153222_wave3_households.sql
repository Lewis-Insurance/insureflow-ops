-- =====================================================================
-- Wave 3 · Households (HH-2..HH-11) — LINK, never merge
-- =====================================================================
-- HH-2 schema: accounts.household_id + households canonical columns.
-- cleanup.refresh_households(apply): deterministic cycle-safe connected-components
--   matcher over signals A/B_same(HIGH) · B_diff/C(MEDIUM) · D(LOW, down-weighted);
--   upserts households (deterministic md5 id), links ONLY HIGH-tier accounts,
--   parks MEDIUM/LOW for review. Idempotent (re-run = no net change).
-- HH-7 household_rollup view + is_mixed_line (on normalized line_category).
-- HH-10 cleanup.hh_review_queue. HH-9 deprecate legacy constructs (comments).
-- Exclusions: office trap ZIP 32055, internal/agency rows, PM phone, business-name
--   tokens, commercial_business, and unresolved DUP-review accounts (so a person is
--   never linked to their own un-merged duplicate).
-- Date: 2026-06-28
-- =====================================================================

-- HH-2: schema (additive).
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS household_id uuid REFERENCES public.households(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_household_id ON public.accounts(household_id);

ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS primary_account_id  uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tier                text,
  ADD COLUMN IF NOT EXISTS match_signals       text[],
  ADD COLUMN IF NOT EXISTS is_mixed_line        boolean,
  ADD COLUMN IF NOT EXISTS linked_by           text,
  ADD COLUMN IF NOT EXISTS agency_workspace_id uuid;

CREATE TABLE IF NOT EXISTS cleanup.hh_candidates (
  household_id uuid NOT NULL,
  account_id   uuid NOT NULL,
  tier         text NOT NULL,
  signals      text[],
  PRIMARY KEY (household_id, account_id)
);
ALTER TABLE cleanup.hh_candidates ENABLE ROW LEVEL SECURITY;

-- HH-9: deprecate legacy constructs (comments only).
COMMENT ON TABLE public.household_accounts IS 'DEPRECATED 2026-06 for CRM grouping; use households + accounts.household_id.';
COMMENT ON COLUMN public.households.primary_contact_id IS 'DEPRECATED (contacts empty); superseded by households.primary_account_id.';

-- HH-3..HH-6 + HH-11: the matcher.
CREATE OR REPLACE FUNCTION cleanup.refresh_households(p_apply boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql AS $fn$
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

    -- Link ONLY HIGH-tier accounts (the single mutating write on accounts).
    UPDATE public.accounts a
    SET household_id = f.household_id
    FROM _final f
    WHERE a.id = ANY(f.ids) AND f.tier='HIGH'
      AND a.household_id IS DISTINCT FROM f.household_id;
    GET DIAGNOSTICS v_linked = ROW_COUNT;

    -- Un-link accounts that dropped out of a HIGH component (book-growth safety).
    UPDATE public.accounts a SET household_id = NULL
    WHERE a.household_id IS NOT NULL
      AND a.id NOT IN (SELECT unnest(ids) FROM _final WHERE tier='HIGH');
  END IF;

  RETURN jsonb_build_object('applied',p_apply,'high',v_high,'medium',v_med,'low',v_low,
                            'total_accounts',v_accts,'accounts_linked',v_linked);
END;
$fn$;

-- HH-7: household policy roll-up + mixed-line (on normalized line_category).
CREATE OR REPLACE VIEW public.household_rollup
WITH (security_invoker = true) AS
SELECT h.id AS household_id, h.name AS household_name, h.tier,
       count(DISTINCT a.id) AS member_count,
       count(p.id) FILTER (WHERE p.deleted_at IS NULL) AS active_policies,
       array_agg(DISTINCT p.line_category) FILTER (WHERE p.deleted_at IS NULL AND p.line_category IS NOT NULL) AS line_categories,
       (count(DISTINCT p.line_category) FILTER (WHERE p.deleted_at IS NULL) >= 2) AS is_mixed_line,
       sum(p.premium) FILTER (WHERE p.deleted_at IS NULL) AS household_premium
FROM public.households h
JOIN public.accounts a ON a.household_id = h.id AND a.deleted_at IS NULL
LEFT JOIN public.policies p ON p.account_id = a.id
GROUP BY h.id, h.name, h.tier;

-- HH-10: review queue for MEDIUM/LOW (+ person/business risk context).
CREATE OR REPLACE VIEW cleanup.hh_review_queue AS
SELECT h.id AS household_id, h.tier, h.match_signals,
       array_agg(a.name ORDER BY a.name) AS members,
       array_agg(DISTINCT a.city) AS cities,
       array_agg(DISTINCT a.zip_code) AS zips,
       CASE WHEN 'B_diff' = ANY(h.match_signals) THEN 'diff-surname same address: roommates vs name-change?'
            WHEN h.tier='LOW' THEN 'phone-only: confirm by call before linking'
            WHEN 'C' = ANY(h.match_signals) THEN 'shared email: family inbox vs shared agent/PM?'
            ELSE 'review' END AS review_reason
FROM public.households h
JOIN cleanup.hh_candidates c ON c.household_id = h.id
JOIN public.accounts a ON a.id = c.account_id
WHERE h.linked_by = 'review'
GROUP BY h.id, h.tier, h.match_signals;
