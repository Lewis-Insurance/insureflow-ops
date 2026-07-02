-- =====================================================================
-- Wave 2 · DUP-2 — Re-run duplicate detection on the full post-stamp book
-- =====================================================================
-- Materializes a clean, classified cluster set into cleanup.dup_clusters (the
-- source of truth for the merge plan + review workbooks) and back-links the
-- regenerated clusters into public.duplicate_groups with a populated rule_id.
-- Writes NOTHING to accounts/policies (candidate scaffolding only).
-- Tiers: T1_SHARED_ADDR (auto-eligible), T1_SHARED_PHONE / T2_EMAIL_OR_ZIP /
--        T3_CONFLICT_ADDR (review). Internal/agency/business-name/commercial
--        accounts excluded (same guards as detection).
-- Reverse: DROP TABLE cleanup.dup_clusters; (+ optionally clear the inserted
--          duplicate_groups rows by rule_id / created_at).
-- Date: 2026-06-28
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS cleanup;

-- Suffix-normalized address key (maps common street-type words to short forms, then
-- strips non-alphanumerics) so "Story Place"/"story pl" and "rd"/"road" match.
CREATE OR REPLACE FUNCTION cleanup.norm_addr(p text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE s text := lower(trim(coalesce(p,'')));
BEGIN
  s := regexp_replace(s, '\mplace\M',     'pl',   'g');
  s := regexp_replace(s, '\mlane\M',      'ln',   'g');
  s := regexp_replace(s, '\mdrive\M',     'dr',   'g');
  s := regexp_replace(s, '\mstreet\M',    'st',   'g');
  s := regexp_replace(s, '\mroad\M',      'rd',   'g');
  s := regexp_replace(s, '\mcourt\M',     'ct',   'g');
  s := regexp_replace(s, '\mcircle\M',    'cir',  'g');
  s := regexp_replace(s, '\mavenue\M',    'ave',  'g');
  s := regexp_replace(s, '\mterrace\M',   'ter',  'g');
  s := regexp_replace(s, '\mboulevard\M', 'blvd', 'g');
  s := regexp_replace(s, '\mtrail\M',     'trl',  'g');
  s := regexp_replace(s, '\mparkway\M',   'pkwy', 'g');
  s := regexp_replace(s, '[^a-z0-9]',     '',     'g');
  RETURN s;
END;
$$;

CREATE TABLE IF NOT EXISTS cleanup.dup_clusters (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name    text NOT NULL,
  disposition  text NOT NULL,          -- 'AUTO' | 'REVIEW'
  nkey         text NOT NULL,
  signal       text,
  member_ids   uuid[] NOT NULL,
  member_count int  NOT NULL,
  survivor_id  uuid,
  names        text[],
  addresses    text[],
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cleanup.dup_clusters ENABLE ROW LEVEL SECURITY;
TRUNCATE cleanup.dup_clusters;

WITH book AS (
  SELECT a.id, a.name, a.email, a.phone, a.zip_code,
    regexp_replace(lower(trim(a.name)),'[^a-z0-9]','','g') AS nkey,
    lower(trim(coalesce(a.address_line1,''))) AS addr_exact,
    cleanup.norm_addr(a.address_line1) AS naddr,
    regexp_replace(coalesce(a.phone,''),'[^0-9]','','g') AS phone_d,
    lower(nullif(btrim(a.email),'')) AS email_n
  FROM accounts a
  WHERE a.deleted_at IS NULL AND a.name IS NOT NULL AND trim(a.name)<>''
    AND coalesce(a.address_line1,'') NOT ILIKE '%1313 W US HWY 90%'
    AND regexp_replace(coalesce(a.phone,''),'[^0-9]','','g') <> '3863628300'
    AND a.name !~* '(lewis insurance|daysheet)'
    AND a.name !~* '^brian.*lewis'
    AND a.name !~* '\m(llc|inc|corp|llp|pllc|church|ministr|ministries|trust|trustee|estate)\M'
    AND a.type::text <> 'commercial_business'
),
-- T1 shared-address subgroups (same name + same normalized address)
t1_addr AS (
  SELECT nkey, naddr, array_agg(id ORDER BY id) ids, array_agg(DISTINCT name) names,
         array_agg(DISTINCT addr_exact) addrs
  FROM book WHERE naddr <> '' GROUP BY nkey, naddr HAVING count(*) >= 2
),
-- nkeys that already have a shared-address subgroup (so we don't double-classify)
t1_nkeys AS (SELECT DISTINCT nkey FROM t1_addr),
-- remaining same-name clusters with no shared address
rest AS (
  SELECT nkey,
    count(*) n, array_agg(id ORDER BY id) ids, array_agg(DISTINCT name) names,
    array_agg(DISTINCT addr_exact) FILTER (WHERE addr_exact<>'') addrs,
    count(DISTINCT NULLIF(addr_exact,'')) d_addr,
    count(DISTINCT NULLIF(zip_code,'')) d_zip,
    max(cnt_phone) max_phone, max(cnt_email) max_email
  FROM (
    SELECT b.*,
      count(*) FILTER (WHERE length(phone_d)>=10) OVER (PARTITION BY nkey, NULLIF(phone_d,'')) cnt_phone,
      count(*) FILTER (WHERE email_n IS NOT NULL)  OVER (PARTITION BY nkey, email_n)            cnt_email
    FROM book b
  ) z
  WHERE nkey NOT IN (SELECT nkey FROM t1_nkeys)
  GROUP BY nkey HAVING count(*) >= 2
)
INSERT INTO cleanup.dup_clusters (rule_name, disposition, nkey, signal, member_ids, member_count, survivor_id, names, addresses)
SELECT 'T1_SHARED_ADDR','AUTO', nkey, 'shared address: '||naddr, ids, array_length(ids,1),
       public.compute_account_survivor(ids), names, addrs
FROM t1_addr
UNION ALL
SELECT
  CASE WHEN max_phone >= 2 THEN 'T1_SHARED_PHONE'
       WHEN max_email >= 2 OR d_zip = 1 THEN 'T2_EMAIL_OR_ZIP'
       ELSE 'T3_CONFLICT_ADDR' END,
  'REVIEW', nkey,
  CASE WHEN max_phone >= 2 THEN 'shared phone, differing address'
       WHEN max_email >= 2 THEN 'shared email'
       WHEN d_zip = 1 THEN 'same single ZIP, complementary contact'
       ELSE 'conflicting addresses ('||d_addr||')' END,
  ids, n, public.compute_account_survivor(ids), names, addrs
FROM rest;

-- Back-link the regenerated clusters into duplicate_groups with rule_id.
INSERT INTO public.duplicate_groups (entity_type, entity_ids, match_score, rule_id, status)
SELECT 'accounts', c.member_ids,
       CASE c.rule_name WHEN 'T1_SHARED_ADDR' THEN 0.95 WHEN 'T1_SHARED_PHONE' THEN 0.85
            WHEN 'T2_EMAIL_OR_ZIP' THEN 0.80 ELSE 0.60 END,
       r.id,
       CASE WHEN c.disposition='AUTO' THEN 'auto_pending' ELSE 'review_pending' END
FROM cleanup.dup_clusters c
JOIN public.duplicate_detection_rules r ON r.rule_name = c.rule_name;
