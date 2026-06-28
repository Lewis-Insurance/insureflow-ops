-- =====================================================================
-- Wave 0 · HYG-3 — Name display casing (additive) + soft-delete admin artifact
-- =====================================================================
-- Purpose : (3a) Soft-delete the internal admin record "Lewis Insurance
--           Daysheets 2026" (not a customer). (3b) Add derived name_display
--           that title-cases the 33 ALL-CAPS names while preserving entity
--           tokens (LLC/INC/II...). Raw `name` is NEVER overwritten.
-- Type    : 3a data-backfill (1 reversible soft-delete); 3b additive-safe.
-- Safety  : 3a reversible (deleted_at = NULL). 3b reversible (DROP COLUMN).
--           name_display/deleted_at not in search_vector trigger col list.
-- NOTE    : The broader "non-customer artifact" scan (AO Commercial
--           Non-renewals, Blue Oak demo, etc.) is REVIEW-ONLY and parked to
--           the review workbook — only the one confirmed Daysheets row is
--           soft-deleted here.
-- Date    : 2026-06-27
-- =====================================================================

-- 3a. Soft-delete the confirmed admin artifact (guarded by id AND name).
UPDATE public.accounts
SET deleted_at = now()
WHERE id = '1b9b9834-436f-453a-bdc1-abe530d77de0'
  AND name = 'Lewis Insurance Daysheets 2026'
  AND deleted_at IS NULL;
-- expected rowcount: 1

-- 3b. Derived display name for ALL-CAPS account names (preserve entity tokens).
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS name_display text;

UPDATE public.accounts
SET name_display = (
  SELECT string_agg(
    CASE
      WHEN upper(tok) IN ('LLC','L.L.C','INC','LLP','LP','PA','P.A','PLLC','PC',
                          'II','III','IV','DDS','DMD','MD','DVM','CPA','USA','CORP','LTD')
        THEN upper(tok)
      WHEN tok ~ '^[A-Za-z]'
        THEN upper(left(tok, 1)) || lower(substr(tok, 2))
      ELSE tok
    END, ' ' ORDER BY ord)
  FROM regexp_split_to_table(name, '\s+') WITH ORDINALITY AS t(tok, ord)
)
WHERE deleted_at IS NULL
  AND name = upper(name)
  AND name ~ '[A-Z]';
