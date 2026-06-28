-- Batch 6A (part 1) — ADDITIVE: store the storage object PATH (not the public URL) for the
-- sites that persist a documents-bucket URL into a DB column. URL columns are RETAINED so the
-- current main frontend keeps working during the transition; a later cleanup migration drops
-- them once main carries the signed-URL frontend. Backfill extracts the path from public URLs.
-- (NOTE: the path-extraction regex was corrected for URLs lacking the /public/ segment in the
-- companion migration 20260628194625; net result = clean object paths.)
-- DOWN: ALTER TABLE ... DROP COLUMN pdf_path / pdf_template_path / sample_document_path;
ALTER TABLE public.acord_forms                ADD COLUMN IF NOT EXISTS pdf_path             text;
ALTER TABLE public.acord_templates            ADD COLUMN IF NOT EXISTS pdf_template_path    text;
ALTER TABLE public.carrier_document_templates ADD COLUMN IF NOT EXISTS sample_document_path text;

UPDATE public.acord_forms
  SET pdf_path = nullif(split_part(regexp_replace(pdf_url, '^.*/object/(public|sign)/[^/]+/', ''), '?', 1), '')
  WHERE pdf_url IS NOT NULL AND pdf_path IS NULL;
UPDATE public.acord_templates
  SET pdf_template_path = nullif(split_part(regexp_replace(pdf_template_url, '^.*/object/(public|sign)/[^/]+/', ''), '?', 1), '')
  WHERE pdf_template_url IS NOT NULL AND pdf_template_path IS NULL;
UPDATE public.carrier_document_templates
  SET sample_document_path = nullif(split_part(regexp_replace(sample_document_url, '^.*/object/(public|sign)/[^/]+/', ''), '?', 1), '')
  WHERE sample_document_url IS NOT NULL AND sample_document_path IS NULL;
