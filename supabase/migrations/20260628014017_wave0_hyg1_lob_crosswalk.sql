-- =====================================================================
-- Wave 0 · HYG-1 — LOB canonical crosswalk (additive lookup; raw untouched)
-- =====================================================================
-- Purpose : Map all 44 distinct raw policies.line_of_business values -> a
--           canonical line + normalized category (+ lines_of_business.code
--           where one exists). Single source of truth consumed by MODEL-3
--           (LOB FK) and BIZ-0 (commercial detection). policies.line_of_business
--           is NEVER mutated.
-- Type    : Additive-safe (new public reference table only).
-- Safety  : Reversible (DROP TABLE lob_crosswalk). Idempotent upsert.
-- Categories vocabulary (7): personal_auto | dwelling | specialty |
--           commercial | personal_umbrella | life | flood
-- needs_new_ref=true marks raw families with NO canonical lines_of_business
-- home yet (DP-1/DP-3, Renters/HO-4, Mobile Home, BOP, Inland Marine,
-- Personal Liability, CPL) -> MODEL-3 (Wave 1) adds those ref rows.
-- Counts re-verified live 2026-06-27: joined to LIVE policies (deleted_at IS NULL)
-- the per-raw counts sum to 2,164 (2,168 including the 4 soft-deleted policies).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.lob_crosswalk (
  raw_value      text PRIMARY KEY,                 -- exact raw line_of_business string
  canonical_line text NOT NULL,                    -- human canonical label
  line_category  text NOT NULL,                    -- personal_auto|dwelling|specialty|commercial|personal_umbrella|life|flood
  lob_code       text,                             -- lines_of_business.code if a ref row exists, else NULL
  needs_new_ref  boolean NOT NULL DEFAULT false,   -- true => ref table missing a canonical home
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lob_crosswalk ENABLE ROW LEVEL SECURITY;

-- Mirror lines_of_business: readable by any authenticated user; writes via service role only.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='lob_crosswalk'
      AND policyname='lob_crosswalk_read_authenticated'
  ) THEN
    CREATE POLICY lob_crosswalk_read_authenticated ON public.lob_crosswalk
      FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

INSERT INTO public.lob_crosswalk (raw_value, canonical_line, line_category, lob_code, needs_new_ref, notes) VALUES
  ('auto',                              'Auto',                                  'personal_auto',     'AUTO',       false, NULL),
  ('Auto',                              'Auto',                                  'personal_auto',     'AUTO',       false, NULL),
  ('auto_policy',                       'Auto',                                  'personal_auto',     'AUTO',       false, NULL),
  ('pp',                                'Auto (private passenger)',              'personal_auto',     'AUTO',       false, NULL),
  ('home',                             'Homeowners',                            'dwelling',          'HOME',       false, NULL),
  ('Home',                             'Homeowners',                            'dwelling',          'HOME',       false, NULL),
  ('home_policy',                      'Homeowners',                            'dwelling',          'HOME',       false, NULL),
  ('ho8',                              'HO-8 (Homeowners, older home)',         'dwelling',          'HOME',       false, NULL),
  ('ho6',                              'HO-6 (Condo unit-owner)',               'dwelling',          'HOME',       false, NULL),
  ('df3',                              'DP-3 (Dwelling Fire, special)',         'dwelling',          NULL,         true,  NULL),
  ('dp3',                              'DP-3 (Dwelling Fire, special)',         'dwelling',          NULL,         true,  NULL),
  ('df1',                              'DP-1 (Dwelling Fire, basic)',           'dwelling',          NULL,         true,  NULL),
  ('dp1',                              'DP-1 (Dwelling Fire, basic)',           'dwelling',          NULL,         true,  NULL),
  ('renters',                          'Renters (HO-4)',                        'dwelling',          NULL,         true,  NULL),
  ('Property',                         'Property (dwelling)',                   'dwelling',          'PROP',       false, 'review: ref PROP is Commercial-categorized; this raw is personal dwelling'),
  ('Property- rental',                 'Property - Rental (dwelling)',          'dwelling',          'PROP',       false, 'review: personal dwelling rental vs commercial PROP ref'),
  ('mobile_home_policy',               'Mobile / Manufactured Home',            'dwelling',          NULL,         true,  NULL),
  ('flood',                            'Flood',                                 'flood',             'FLOOD',      false, NULL),
  ('boat',                             'Boat / Watercraft',                     'specialty',         'BOAT',       false, NULL),
  ('Watercraft',                       'Boat / Watercraft',                     'specialty',         'BOAT',       false, NULL),
  ('motorcycle',                       'Motorcycle',                            'specialty',         'CYCLE',      false, NULL),
  ('Motorcycle',                       'Motorcycle',                            'specialty',         'CYCLE',      false, NULL),
  ('travel_trailer',                   'Travel Trailer',                        'specialty',         'TRAVEL_TRA', false, NULL),
  ('Travel Trailer',                   'Travel Trailer',                        'specialty',         'TRAVEL_TRA', false, NULL),
  ('motor_home',                       'Motorhome / RV',                        'specialty',         'MOTORHOME',  false, NULL),
  ('Motorhome',                        'Motorhome / RV',                        'specialty',         'MOTORHOME',  false, NULL),
  ('Umbrella',                         'Personal Umbrella',                     'personal_umbrella', 'UMB',        false, NULL),
  ('personal_liability',               'Personal Liability',                    'personal_umbrella', NULL,         true,  NULL),
  ('Comprehensive Personal Liability', 'Comprehensive Personal Liability (CPL)','personal_umbrella', NULL,         true,  NULL),
  ('Life',                             'Life',                                  'life',              'LIFE',       false, NULL),
  ('commercial_auto',                  'Commercial Auto',                       'commercial',        'COMM_AUTO',  false, NULL),
  ('Commercial Auto',                  'Commercial Auto',                       'commercial',        'COMM_AUTO',  false, NULL),
  ('gl',                               'General Liability',                     'commercial',        'GL',         false, NULL),
  ('General Liability',                'General Liability',                     'commercial',        'GL',         false, NULL),
  ('Commercial General Liability',     'General Liability',                     'commercial',        'GL',         false, NULL),
  ('bop',                              'Business Owners Policy (BOP)',          'commercial',        NULL,         true,  NULL),
  ('commercial_policy',                'Commercial (unspecified)',              'commercial',        NULL,         false, 'review: unspecified commercial; reclassify by policy detail'),
  ('commercial_property',             'Commercial Property',                   'commercial',        'PROP',       false, 'review: maps to commercial PROP ref'),
  ('Commercial Property',             'Commercial Property',                   'commercial',        'PROP',       false, 'review: maps to commercial PROP ref'),
  ('Commercial Inland Marine',         'Commercial Inland Marine',              'commercial',        NULL,         true,  NULL),
  ('workers_comp',                     'Workers Compensation',                  'commercial',        'WC',         false, NULL),
  ('Workers Comp',                     'Workers Compensation',                  'commercial',        'WC',         false, NULL),
  ('Workers Compensation',             'Workers Compensation',                  'commercial',        'WC',         false, NULL),
  ('Workers Compensation and Employers Liability Insurance', 'Workers Compensation', 'commercial',  'WC',         false, NULL)
ON CONFLICT (raw_value) DO UPDATE
  SET canonical_line = EXCLUDED.canonical_line,
      line_category  = EXCLUDED.line_category,
      lob_code       = EXCLUDED.lob_code,
      needs_new_ref  = EXCLUDED.needs_new_ref,
      notes          = EXCLUDED.notes,
      updated_at     = now();
