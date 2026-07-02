-- =====================================================================
-- Wave 1 · MODEL-3 — LOB FK + reference normalization + apply crosswalk
-- =====================================================================
-- Purpose : Wire policies to the normalized LOB model.
--   A. Add policies.line_of_business_id (FK) + line_canonical + line_category (additive).
--   B. Normalize dirty lines_of_business.category -> app vocabulary {personal|commercial|specialty}.
--      (The admin UI's CATEGORIES const already expects these lowercase values; this FIXES the UI.)
--   C. Add the missing canonical reference rows so the FK is lossless.
--   D. Wire lob_crosswalk.lob_code for those families (clears needs_new_ref).
--   E. Apply the crosswalk to policies (raw line_of_business NEVER mutated).
-- Type    : Additive DDL + reference normalization + additive backfill.
-- Safety  : Reversible. Idempotent (IS DISTINCT FROM / ON CONFLICT / WHERE NOT). The
--           step-E UPDATE writes ONLY the 3 new columns -> trg_auto_sync_policy_to_renewal
--           is UPDATE-OF-gated and excludes them (no renewal sync); automation trigger
--           short-circuits (line_of_business/status unchanged); insured_profiles is empty
--           so the search trigger no-ops. It DOES bump updated_at and write audit rows on
--           ~2,164 policies (intended, one-time). NOTE: policies.line_category uses the
--           crosswalk's 7-value vocab (personal_auto|dwelling|specialty|commercial|
--           personal_umbrella|life|flood) which is DISTINCT from lines_of_business.category
--           (3-value app vocab). BIZ-0 keys off line_category='commercial' (consistent in both).
-- NOTE on counts: 8 canonical rows are added (roadmap grouped these as "7"). DP-1 and
--   DP-3 are kept DISTINCT (live data has both: df3+dp3=38, df1+dp1=8), and Personal
--   Liability vs CPL are kept distinct. 'Commercial (unspecified)' (commercial_policy,
--   6 policies) is intentionally left WITHOUT a ref row -> its line_of_business_id stays
--   NULL as an explicit review residual (line_category='commercial' is still set).
-- Reverse : ALTER TABLE policies DROP COLUMN line_of_business_id, DROP COLUMN line_canonical,
--           DROP COLUMN line_category;  DELETE FROM lines_of_business WHERE code IN
--           ('DP3','DP1','RENTERS','MOBILE','PERS_LIAB','CPL','BOP','INLAND_MAR');
--           (category normalization reversal: restore prior casing if ever needed.)
-- Date    : 2026-06-28
-- =====================================================================

-- A. Additive columns on policies.
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS line_of_business_id uuid REFERENCES public.lines_of_business(id);
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS line_canonical text;
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS line_category  text;
CREATE INDEX IF NOT EXISTS idx_policies_line_of_business_id ON public.policies(line_of_business_id);

COMMENT ON COLUMN public.policies.line_category IS
  'Normalized LOB category from lob_crosswalk (7-value: personal_auto|dwelling|specialty|commercial|personal_umbrella|life|flood). DISTINCT from lines_of_business.category (3-value app vocab personal|commercial|specialty). BIZ-0 commercial detection keys off line_category=''commercial''.';
COMMENT ON COLUMN public.policies.line_canonical IS
  'Human-readable canonical line label from lob_crosswalk.canonical_line. Raw policies.line_of_business is preserved unchanged.';

-- B. Normalize dirty lines_of_business.category to the app's lowercase vocabulary.
UPDATE public.lines_of_business SET category = 'personal'   WHERE category = 'Personal';
UPDATE public.lines_of_business SET category = 'commercial' WHERE category = 'Commercial';
UPDATE public.lines_of_business SET category = 'personal'   WHERE category = 'Both';  -- Lewis: personal umbrellas only

-- C. Add the missing canonical reference rows (idempotent on the code/name unique constraints).
INSERT INTO public.lines_of_business (name, code, category, is_active) VALUES
  ('Dwelling Fire (DP-3)',              'DP3',        'personal',   true),
  ('Dwelling Fire (DP-1)',              'DP1',        'personal',   true),
  ('Renters (HO-4)',                    'RENTERS',    'personal',   true),
  ('Mobile / Manufactured Home',        'MOBILE',     'personal',   true),
  ('Personal Liability',                'PERS_LIAB',  'personal',   true),
  ('Comprehensive Personal Liability',  'CPL',        'personal',   true),
  ('Business Owners Policy (BOP)',      'BOP',        'commercial', true),
  ('Commercial Inland Marine',          'INLAND_MAR', 'commercial', true)
ON CONFLICT DO NOTHING;

-- D. Wire the crosswalk lob_code for the now-existing families.
UPDATE public.lob_crosswalk SET lob_code='DP3',        needs_new_ref=false, updated_at=now() WHERE raw_value IN ('df3','dp3');
UPDATE public.lob_crosswalk SET lob_code='DP1',        needs_new_ref=false, updated_at=now() WHERE raw_value IN ('df1','dp1');
UPDATE public.lob_crosswalk SET lob_code='RENTERS',    needs_new_ref=false, updated_at=now() WHERE raw_value='renters';
UPDATE public.lob_crosswalk SET lob_code='MOBILE',     needs_new_ref=false, updated_at=now() WHERE raw_value='mobile_home_policy';
UPDATE public.lob_crosswalk SET lob_code='PERS_LIAB',  needs_new_ref=false, updated_at=now() WHERE raw_value='personal_liability';
UPDATE public.lob_crosswalk SET lob_code='CPL',        needs_new_ref=false, updated_at=now() WHERE raw_value='Comprehensive Personal Liability';
UPDATE public.lob_crosswalk SET lob_code='BOP',        needs_new_ref=false, updated_at=now() WHERE raw_value='bop';
UPDATE public.lob_crosswalk SET lob_code='INLAND_MAR', needs_new_ref=false, updated_at=now() WHERE raw_value='Commercial Inland Marine';

-- E. Apply the crosswalk to policies (single UPDATE per policy; idempotent via IS DISTINCT FROM).
--    LEFT JOIN so commercial_policy (lob_code NULL) still gets line_canonical/line_category,
--    with line_of_business_id left NULL (explicit review residual).
UPDATE public.policies p
SET line_of_business_id = l.id,
    line_canonical      = x.canonical_line,
    line_category       = x.line_category
FROM public.lob_crosswalk x
LEFT JOIN public.lines_of_business l ON l.code = x.lob_code
WHERE p.deleted_at IS NULL
  AND p.line_of_business = x.raw_value
  AND (p.line_of_business_id IS DISTINCT FROM l.id
       OR p.line_canonical IS DISTINCT FROM x.canonical_line
       OR p.line_category  IS DISTINCT FROM x.line_category);
