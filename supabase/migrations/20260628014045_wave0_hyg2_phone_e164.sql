-- =====================================================================
-- Wave 0 · HYG-2 — Phone standardization to E.164 (additive columns)
-- =====================================================================
-- Purpose : Add normalized phone_e164 + phone_norm_status. Raw `phone` is
--           NEVER overwritten. Strengthens DUP/HH "same phone" matching later.
-- Type    : Additive-safe (two new columns).
-- Safety  : Reversible (DROP COLUMN). Idempotent (UPDATE recomputes).
--           phone_e164 not in any trigger's column list -> no side effects.
-- Logic   : digits-only; 10 digits -> +1XXXXXXXXXX; 11 starting '1' -> +1...;
--           already +1XXXXXXXXXX kept; else NULL + status 'review'.
-- Acceptance: every populated phone_e164 matches ^\+1[0-9]{10}$;
--             status='review' count = 1 (the truncated '386-292-383').
-- Date    : 2026-06-27
-- =====================================================================

ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS phone_e164 text;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS phone_norm_status text;

-- Pass 1: compute normalized E.164 (NULL if not cleanly parseable).
-- Scoped to non-blank phones only so the ~919 blank-phone rows are not touched
-- (avoids needless updated_at bump / audit rows). Blank phones keep phone_e164 NULL.
UPDATE public.accounts
SET phone_e164 = CASE
      WHEN phone ~ '^\+1[0-9]{10}$' THEN phone
      WHEN length(regexp_replace(phone, '[^0-9]', '', 'g')) = 10
        THEN '+1' || regexp_replace(phone, '[^0-9]', '', 'g')
      WHEN length(regexp_replace(phone, '[^0-9]', '', 'g')) = 11
           AND left(regexp_replace(phone, '[^0-9]', '', 'g'), 1) = '1'
        THEN '+' || regexp_replace(phone, '[^0-9]', '', 'g')
      ELSE NULL END
WHERE deleted_at IS NULL AND phone IS NOT NULL AND btrim(phone) <> '';

-- Pass 2: status from the actual normalization result. Blank phones keep status NULL.
UPDATE public.accounts
SET phone_norm_status = CASE WHEN phone_e164 IS NOT NULL THEN 'ok' ELSE 'review' END
WHERE deleted_at IS NULL AND phone IS NOT NULL AND btrim(phone) <> '';
