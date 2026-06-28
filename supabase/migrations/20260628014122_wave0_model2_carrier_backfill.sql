-- =====================================================================
-- Wave 0 · MODEL-2 (Part 1) — Carrier alias map + carrier_id backfill
-- =====================================================================
-- Purpose : Backfill policies.carrier_id where it is NULL but carrier text
--           resolves to a carrier ALREADY in the reference table:
--             - 335 via exact (case-insensitive) name match
--             -  46 via alias map -> existing carrier brand
--           => NULL carrier_id drops 486 -> 105.
-- PARKED  : The remaining 105 require 14 NEW carrier brands (Safe Harbor 78,
--           US Coastal 6, Burlington 4, Lloyd's 3, Orange 3, Mount Vernon 2,
--           + AGCS Marine/Covington/Hadron/USLI/Wilshire/Wright Flood/ICAT/PIE).
--           ICAT & PIE are MGAs (policies.mga_id exists) -> Brian confirmation.
--           Part 2 (carrier INSERTs + their backfill) ships after sign-off.
-- Type    : DDL-lite (alias map table) + additive DML (fills NULL carrier_id).
-- Safety  : carrier text NEVER overwritten. Snapshot => reversible. Idempotent.
--           MUST be applied as a SINGLE TRANSACTION (apply_migration does this) so the
--           DISABLE TRIGGER below can never persist on failure; a closing assertion
--           verifies the trigger is re-enabled.
--           trg_auto_sync_policy_to_renewal suppressed during backfill so this hygiene
--           fill does NOT create/refresh renewal rows (126 in 90-day window, 2 would
--           have been created). Full trigger firing set on the carrier_id-only UPDATE:
--             - trigger_automation_rules_on_policies: NO-OP (only fires on LOB/status change)
--             - trg_pol_search -> bump_ip_search_from_related: writes insured_profiles.search_vector,
--               but insured_profiles has 0 rows -> NO-OP today (carrier_id not in the vector anyway)
--             - tr_policies_activated: status-gated -> NO-OP
--             - audit_policies + trg_policies_audit: dual audit rows per policy -> INTENDED (kept)
-- Reverse : UPDATE policies SET carrier_id=NULL
--             WHERE id IN (SELECT policy_id FROM cleanup.model2_carrier_backfill_snapshot);
-- Date    : 2026-06-27
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS cleanup;  -- self-contained / re-runnable independent of MODEL-1

-- Auditable, re-runnable alias map (full: includes new-carrier targets for Part 2).
CREATE TABLE IF NOT EXISTS cleanup.carrier_alias_map (
  raw_text     text PRIMARY KEY,
  carrier_name text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cleanup.carrier_alias_map ENABLE ROW LEVEL SECURITY;

INSERT INTO cleanup.carrier_alias_map (raw_text, carrier_name) VALUES
  -- ---- aliases that resolve to carriers ALREADY in the reference table ----
  ('Foremost Insurance Company Grand Rapids, Michigan', 'Foremost'),
  ('Progressive American Insurance Co',                 'Progressive'),
  ('Progressive Express Ins Company',                   'Progressive'),
  ('American Traditions Insurance Company',             'American Traditions'),
  ('Auto-Owners Insurance Company',                     'Auto-Owners'),
  ('Universal Property & Casualty Insurance Company',   'Universal Property'),
  -- ---- aliases for NEW carriers (PARKED; no-op until Part 2 inserts them) ----
  ('Safe Harbor Insurance Company',                     'Safe Harbor'),
  ('SAFE HARBOR INSURANCE COMPANY',                     'Safe Harbor'),
  ('US Coastal Property & Casualty Insurance Company',  'US Coastal'),
  ('Certain Underwriters at Lloyd''s, London',          'Lloyd''s of London'),
  ('Orange Insurance Exchange',                         'Orange Insurance Exchange'),
  ('The Burlington Insurance Company',                  'Burlington'),
  ('THE BURLINGTON INSURANCE COMPANY',                  'Burlington'),
  ('Mount Vernon Fire Insurance Company',               'Mount Vernon'),
  ('AGCS Marine Insurance Company',                     'AGCS Marine'),
  ('Covington Specialty Insurance Company',             'Covington Specialty'),
  ('Hadron Specialty Insurance Company',                'Hadron Specialty'),
  ('United States Liability Insurance Company',          'United States Liability (USLI)'),
  ('Wilshire Insurance Company',                        'Wilshire'),
  ('Wright National Flood Insurance Company',           'Wright National Flood'),
  ('ICAT',                                              'ICAT'),
  ('PIE',                                               'PIE'),
  ('The Pie Insurance Company',                         'PIE')
ON CONFLICT (raw_text) DO UPDATE SET carrier_name = EXCLUDED.carrier_name;

-- Snapshot the policies that WILL be filled (exact OR alias-to-existing-carrier).
CREATE TABLE IF NOT EXISTS cleanup.model2_carrier_backfill_snapshot (
  policy_id      uuid PRIMARY KEY,
  resolved_name  text,
  match_type     text,
  captured_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cleanup.model2_carrier_backfill_snapshot ENABLE ROW LEVEL SECURITY;

INSERT INTO cleanup.model2_carrier_backfill_snapshot (policy_id, resolved_name, match_type)
SELECT p.id, c.name, 'exact'
FROM policies p JOIN carriers c ON lower(btrim(c.name)) = lower(btrim(p.carrier))
WHERE p.deleted_at IS NULL AND p.carrier_id IS NULL
ON CONFLICT (policy_id) DO NOTHING;

INSERT INTO cleanup.model2_carrier_backfill_snapshot (policy_id, resolved_name, match_type)
SELECT p.id, c.name, 'alias'
FROM policies p
JOIN cleanup.carrier_alias_map m ON p.carrier = m.raw_text
JOIN carriers c ON lower(btrim(c.name)) = lower(btrim(m.carrier_name))
WHERE p.deleted_at IS NULL AND p.carrier_id IS NULL
ON CONFLICT (policy_id) DO NOTHING;

-- Backfill with the renewal-sync trigger suppressed (surgical: carrier_id only).
ALTER TABLE public.policies DISABLE TRIGGER trg_auto_sync_policy_to_renewal;

-- STEP A: exact case-insensitive name match (335).
UPDATE policies p
SET carrier_id = c.id
FROM carriers c
WHERE p.deleted_at IS NULL AND p.carrier_id IS NULL
  AND lower(btrim(p.carrier)) = lower(btrim(c.name));

-- STEP B: alias map -> existing carrier brand (46). New-carrier aliases no-op.
UPDATE policies p
SET carrier_id = c.id
FROM cleanup.carrier_alias_map m
JOIN carriers c ON lower(btrim(c.name)) = lower(btrim(m.carrier_name))
WHERE p.deleted_at IS NULL AND p.carrier_id IS NULL
  AND p.carrier = m.raw_text;

ALTER TABLE public.policies ENABLE TRIGGER trg_auto_sync_policy_to_renewal;

-- Post-check: guarantee the renewal-sync trigger is enabled (aborts the txn if not).
DO $$
BEGIN
  IF (SELECT tgenabled FROM pg_trigger
        WHERE tgname = 'trg_auto_sync_policy_to_renewal'
          AND tgrelid = 'public.policies'::regclass) <> 'O' THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: trg_auto_sync_policy_to_renewal was not re-enabled';
  END IF;
END $$;
