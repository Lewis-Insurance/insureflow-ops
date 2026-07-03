-- document_quality_assessments: add the missing FK document_id -> document_extractions(id)
-- =====================================================================
-- Follow-up to 20260702200000, which RLS-scoped document_quality_assessments by
-- delegating to document_extractions visibility through its document_id column --
-- but that column carried NO foreign key (the original schema only left a comment,
-- "Links to document_extractions after upload"). This adds the real FK so the
-- anchor is enforced at the schema level too, matching EVERY sibling
-- extraction-child table (doc_type_classifications, document_pages,
-- extraction_evidence, field_candidates, review_queue_items all use
-- `REFERENCES document_extractions(id) ON DELETE CASCADE`).
--
-- Verified against live prod (lrqajzwcmdwahnjyidgv) 2026-07-03: the table is empty
-- (0 rows, 0 non-null document_id, 0 orphans) and has no FK yet, so the constraint
-- applies without validation failures. document_id stays nullable, so NULL rows are
-- still allowed (the RLS policy already guards `document_id IS NOT NULL`), and the
-- FK only enforces referential integrity for non-null values. The delegate RLS
-- EXISTS(...) remains -- it is an RLS-scoped VISIBILITY check, which the FK does not
-- replace.
--
-- Idempotent and transactional.
-- =====================================================================

BEGIN;

ALTER TABLE public.document_quality_assessments
  DROP CONSTRAINT IF EXISTS document_quality_assessments_document_id_fkey;

ALTER TABLE public.document_quality_assessments
  ADD CONSTRAINT document_quality_assessments_document_id_fkey
  FOREIGN KEY (document_id) REFERENCES public.document_extractions(id) ON DELETE CASCADE;

COMMIT;
