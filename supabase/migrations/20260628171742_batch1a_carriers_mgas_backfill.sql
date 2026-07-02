-- =====================================================================
-- Batch 1A — Carriers + MGAs + carrier_id backfill (104 active NULL -> 0)
-- =====================================================================
-- Adds the 13 missing legal-name carriers (de-duped; carriers.name has no unique
-- constraint so use NOT EXISTS) + 2 MGAs (Pie, ICAT). Backfills carrier_id by exact
-- name match (103); Pie policy gets mga_id; ICAT policy gets carrier=Lloyd's
-- (PLACEHOLDER — confirm syndicate from dec page) + mga=ICAT. Reversible via snapshot.
-- Renewal-sync trigger suppressed during the carrier_id fill (surgical). 2026-06-28
-- =====================================================================

INSERT INTO public.carriers (name, naic)
SELECT v.name, v.naic FROM (VALUES
  ('Safe Harbor Insurance Company', NULL),
  ('US Coastal Property & Casualty Insurance Company', NULL),
  ('The Burlington Insurance Company', NULL),
  ('Certain Underwriters at Lloyd''s, London', NULL),
  ('Orange Insurance Exchange', NULL),
  ('Mount Vernon Fire Insurance Company', NULL),
  ('AGCS Marine Insurance Company', NULL),
  ('Covington Specialty Insurance Company', NULL),
  ('Hadron Specialty Insurance Company', NULL),
  ('United States Liability Insurance Company', NULL),
  ('Wilshire Insurance Company', NULL),
  ('Wright National Flood Insurance Company', NULL),
  ('The Pie Insurance Company', '21857')
) v(name, naic)
WHERE NOT EXISTS (SELECT 1 FROM public.carriers c WHERE lower(btrim(c.name)) = lower(btrim(v.name)));

INSERT INTO public.mgas (name, code, is_active)
SELECT v.name, v.code, true FROM (VALUES ('Pie','PIE'),('ICAT','ICAT')) v(name, code)
WHERE NOT EXISTS (SELECT 1 FROM public.mgas m WHERE m.code = v.code);

CREATE TABLE IF NOT EXISTS cleanup.carrier_backfill_1a_snapshot (
  policy_id uuid PRIMARY KEY, note text, captured_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE cleanup.carrier_backfill_1a_snapshot ENABLE ROW LEVEL SECURITY;

INSERT INTO cleanup.carrier_backfill_1a_snapshot (policy_id, note)
SELECT p.id, 'exact:'||c.name
FROM public.policies p JOIN public.carriers c ON lower(btrim(c.name)) = lower(btrim(p.carrier))
WHERE p.deleted_at IS NULL AND p.carrier_id IS NULL
ON CONFLICT (policy_id) DO NOTHING;
INSERT INTO cleanup.carrier_backfill_1a_snapshot (policy_id, note) VALUES
  ('c369231a-65f9-4c83-896a-56b7fcd6732e', 'ICAT: carrier=Lloyds PLACEHOLDER + mga=ICAT (confirm syndicate from dec page)')
ON CONFLICT (policy_id) DO NOTHING;

ALTER TABLE public.policies DISABLE TRIGGER trg_auto_sync_policy_to_renewal;

UPDATE public.policies p SET carrier_id = c.id
FROM public.carriers c
WHERE p.deleted_at IS NULL AND p.carrier_id IS NULL AND lower(btrim(p.carrier)) = lower(btrim(c.name));

UPDATE public.policies SET mga_id = (SELECT id FROM public.mgas WHERE code='PIE')
WHERE id = 'a43c28bd-7900-4915-a844-20bfd8ef5478';

UPDATE public.policies
SET carrier_id = (SELECT id FROM public.carriers WHERE lower(btrim(name)) = lower('Certain Underwriters at Lloyd''s, London')),
    mga_id     = (SELECT id FROM public.mgas WHERE code='ICAT')
WHERE id = 'c369231a-65f9-4c83-896a-56b7fcd6732e';

ALTER TABLE public.policies ENABLE TRIGGER trg_auto_sync_policy_to_renewal;
DO $$ BEGIN
  IF (SELECT tgenabled FROM pg_trigger WHERE tgname='trg_auto_sync_policy_to_renewal' AND tgrelid='public.policies'::regclass) <> 'O'
  THEN RAISE EXCEPTION 'trg_auto_sync_policy_to_renewal not re-enabled'; END IF;
END $$;