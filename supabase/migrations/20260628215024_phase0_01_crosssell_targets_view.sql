-- Phase-0 (1/n) — canonical cross-sell target view (PLAN-INT-C §2.2).
-- One row per household (synthetic household_key since household_id is sparse), each assigned
-- exactly one priority-ordered play, with the email-reachable contact account for Agent A's mint.
-- Read-only derivation over the cleaned book. DOWN: DROP VIEW public.v_phase0_crosssell_targets;
CREATE OR REPLACE VIEW public.v_phase0_crosssell_targets AS
WITH acct AS (
  SELECT a.id AS account_id, a.agency_workspace_id,
    COALESCE(a.household_id::text, 'acct:' || a.id::text) AS household_key, a.household_id,
    COALESCE(a.name_display, a.name) AS account_name, a.account_type,
    ie.email AS primary_email, a.email AS account_email_fallback
  FROM accounts a
  LEFT JOIN insured_emails ie ON ie.account_id = a.id AND ie.is_primary
  WHERE a.account_status = 'active' AND a.deleted_at IS NULL
    AND a.agency_workspace_id = 'f1f07037-3032-45f8-93ca-72c0f47e4fbb'
    AND COALESCE(a.account_type::text,'household') <> 'business'
),
acct_lines AS (
  SELECT p.account_id,
    bool_or(p.line_category = 'personal_auto')     AS has_auto,
    bool_or(p.line_category = 'dwelling')          AS has_dwelling,
    bool_or(p.line_category = 'personal_umbrella') AS has_umbrella,
    bool_or(p.line_category = 'specialty')         AS has_specialty,
    array_agg(DISTINCT p.line_canonical)           AS lines_held
  FROM policies p WHERE p.status = 'active' AND p.deleted_at IS NULL GROUP BY p.account_id
),
hh AS (
  SELECT ac.agency_workspace_id, ac.household_key,
    min(ac.household_id::text)::uuid AS household_id,
    (array_agg(ac.account_id ORDER BY (ac.primary_email IS NULL), ac.account_id))[1] AS contact_account_id,
    (array_agg(COALESCE(ac.primary_email, ac.account_email_fallback) ORDER BY (ac.primary_email IS NULL), ac.account_id)
       FILTER (WHERE COALESCE(ac.primary_email, ac.account_email_fallback) IS NOT NULL))[1] AS contact_email,
    (array_agg(ac.account_name ORDER BY (ac.primary_email IS NULL), ac.account_id))[1] AS contact_name,
    bool_or(COALESCE(al.has_auto,false)) AS has_auto, bool_or(COALESCE(al.has_dwelling,false)) AS has_dwelling,
    bool_or(COALESCE(al.has_umbrella,false)) AS has_umbrella, bool_or(COALESCE(al.has_specialty,false)) AS has_specialty,
    count(*) AS member_accounts
  FROM acct ac LEFT JOIN acct_lines al ON al.account_id = ac.account_id
  GROUP BY ac.agency_workspace_id, ac.household_key
)
SELECT agency_workspace_id, household_key, household_id, contact_account_id, contact_email, contact_name,
  (contact_email IS NOT NULL) AS reachable_email, member_accounts,
  has_auto, has_dwelling, has_umbrella, has_specialty,
  CASE
    WHEN has_dwelling  AND NOT has_auto      THEN 'home_only_sell_auto'
    WHEN has_auto      AND NOT has_dwelling  THEN 'auto_only_sell_home'
    WHEN (has_auto OR has_dwelling) AND NOT has_umbrella THEN 'umbrella_add'
    WHEN has_specialty AND NOT has_auto      THEN 'rec_sell_auto'
    ELSE 'other'
  END AS play
FROM hh WHERE has_auto OR has_dwelling OR has_specialty;
