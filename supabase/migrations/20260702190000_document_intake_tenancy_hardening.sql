-- Document-intake pipeline: tenancy hardening (PII value/OCR/upload/token layer)
-- =====================================================================
-- Follow-up to 20260702181209_acord_tenancy_hardening, which workspace-scoped the
-- ACORD form headers (acord_forms / acord_form_sections / acord_field_audit) but
-- left the child tables that store the actual filled-in field VALUES, raw OCR
-- text, per-word layout, uploaded client files, and portal access tokens on a
-- single permissive policy gated only on is_staff() or `auth.uid() IS NOT NULL`
-- with NO workspace / owner check. Any staff user in any workspace could read or
-- write every workspace's document-intake PII through those side doors, defeating
-- the intent of the prior migration.
--
-- This migration replaces those permissive policies on 15 tables with policies
-- scoped TO authenticated that resolve back to the row's tenant/owner anchor,
-- mirroring the acord_field_audit / acord_form_sections pattern. Service role
-- (all edge functions, incl. the public DocumentCollection portal, the OCR
-- pipeline, and process-document-tasks) bypasses RLS and is unaffected. anon
-- never had a legitimate direct path (auth.uid() is NULL for anon) and is now
-- explicitly excluded.
--
-- Anchors verified against live prod (lrqajzwcmdwahnjyidgv) 2026-07-02. Every
-- anchor column below is NOT NULL, so there are no hidden orphan rows.
--   A. ACORD field values
--      acord_field_outputs      -> acord_forms.agency_workspace_id  (acord_form_id)
--   B. Extraction tree (rooted at document_extractions; children delegate to parent RLS)
--      document_extractions     -> accounts / acord_forms workspace (account_id OR acord_form_id;
--                                  it is NOT ACORD-only. The self-creator branch is
--                                  restricted to the fully-unanchored case so a staff user
--                                  cannot forge a row onto another workspace's account_id/
--                                  acord_form_id via created_by = auth.uid().)
--      extraction_evidence      -> document_extractions (extraction_id)
--      field_candidates         -> document_extractions (extraction_id)
--      extraction_corrections   -> document_extractions (extraction_id)
--      document_pages           -> document_extractions (extraction_id)
--      ocr_raw_responses        -> document_pages (page_id)
--      layout_words             -> document_pages (page_id)
--      layout_key_values        -> document_pages (page_id)
--      layout_tables            -> document_pages (page_id)
--      layout_table_cells       -> layout_tables (table_id)
--      layout_selection_marks   -> document_pages (page_id)
--   C. Document-collection family (owner-scoped, matching the parent
--      comparison_workspaces.created_by RLS; agency sharing, if ever wanted, is a
--      separate change to comparison_workspaces + the two direct hooks)
--      collection_requirements  -> comparison_workspaces.created_by (workspace_id)
--      collection_uploads       -> collection_requirements -> comparison_workspaces.created_by
--      collection_access_tokens -> comparison_workspaces.created_by (workspace_id)
--
-- DEFERRED to a separate, app-flow-traced follow-up (NOT fixed here, by decision --
-- these need read-path tracing and/or carry a distinct policy shape):
--   document_analysis_jobs, document_insights  (a permissive `FOR ALL USING is_staff()`
--     policy OR-combines with and thus NEUTRALIZES their otherwise-correct scoped
--     SELECT policy -- they are effectively staff-wide, not "already scoped"),
--   renewal_comparison_results, renewal_email_drafts, submission_packages,
--   workspace_documents, collection_templates, collection_email_ingestion,
--   extraction_learned_rules, doc_type_classifications, document_quality_assessments,
--   review_queue_items.
--
-- Idempotent (drops old and new policy names before create) and transactional.
-- =====================================================================

BEGIN;

-- =====================================================================
-- A. ACORD field values
-- =====================================================================

-- acord_field_outputs: filled-in ACORD field VALUES. Child of acord_forms.
ALTER TABLE public.acord_field_outputs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON public.acord_field_outputs;
DROP POLICY IF EXISTS "acord_field_outputs_workspace_scoped" ON public.acord_field_outputs;
CREATE POLICY "acord_field_outputs_workspace_scoped"
  ON public.acord_field_outputs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.acord_forms f
                 WHERE f.id = acord_field_outputs.acord_form_id
                   AND is_staff() AND is_agency_member(f.agency_workspace_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.acord_forms f
                 WHERE f.id = acord_field_outputs.acord_form_id
                   AND is_staff() AND is_agency_member(f.agency_workspace_id)));

-- =====================================================================
-- B. Extraction tree (rooted at document_extractions)
-- =====================================================================

-- document_extractions: OCR/AI extraction payload incl. raw text. Anchored by
-- account_id and/or acord_form_id (both nullable). Visible to staff whose
-- workspace owns the linked form OR account. The self-creator branch applies
-- ONLY when the row is fully unanchored (both NULL), so it cannot be used to
-- plant/read a row aimed at another workspace's account or form.
ALTER TABLE public.document_extractions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can manage document extractions" ON public.document_extractions;
DROP POLICY IF EXISTS "document_extractions_workspace_scoped" ON public.document_extractions;
CREATE POLICY "document_extractions_workspace_scoped"
  ON public.document_extractions FOR ALL TO authenticated
  USING (
    is_staff() AND (
      (document_extractions.acord_form_id IS NULL
        AND document_extractions.account_id IS NULL
        AND document_extractions.created_by = auth.uid())
      OR EXISTS (SELECT 1 FROM public.acord_forms f
                 WHERE f.id = document_extractions.acord_form_id
                   AND is_agency_member(f.agency_workspace_id))
      OR EXISTS (SELECT 1 FROM public.accounts a
                 WHERE a.id = document_extractions.account_id
                   AND is_agency_member(a.agency_workspace_id))
    )
  )
  WITH CHECK (
    is_staff() AND (
      (document_extractions.acord_form_id IS NULL
        AND document_extractions.account_id IS NULL
        AND document_extractions.created_by = auth.uid())
      OR EXISTS (SELECT 1 FROM public.acord_forms f
                 WHERE f.id = document_extractions.acord_form_id
                   AND is_agency_member(f.agency_workspace_id))
      OR EXISTS (SELECT 1 FROM public.accounts a
                 WHERE a.id = document_extractions.account_id
                   AND is_agency_member(a.agency_workspace_id))
    )
  );

-- extraction_evidence: evidence snippets. Child of document_extractions;
-- visible iff the parent extraction is visible (inherits the scope above).
ALTER TABLE public.extraction_evidence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON public.extraction_evidence;
DROP POLICY IF EXISTS "extraction_evidence_workspace_scoped" ON public.extraction_evidence;
CREATE POLICY "extraction_evidence_workspace_scoped"
  ON public.extraction_evidence FOR ALL TO authenticated
  USING (is_staff() AND EXISTS (SELECT 1 FROM public.document_extractions de
                                WHERE de.id = extraction_evidence.extraction_id))
  WITH CHECK (is_staff() AND EXISTS (SELECT 1 FROM public.document_extractions de
                                WHERE de.id = extraction_evidence.extraction_id));

-- field_candidates: candidate field values. Child of document_extractions.
ALTER TABLE public.field_candidates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON public.field_candidates;
DROP POLICY IF EXISTS "field_candidates_workspace_scoped" ON public.field_candidates;
CREATE POLICY "field_candidates_workspace_scoped"
  ON public.field_candidates FOR ALL TO authenticated
  USING (is_staff() AND EXISTS (SELECT 1 FROM public.document_extractions de
                                WHERE de.id = field_candidates.extraction_id))
  WITH CHECK (is_staff() AND EXISTS (SELECT 1 FROM public.document_extractions de
                                WHERE de.id = field_candidates.extraction_id));

-- extraction_corrections: user corrections to extracted fields. Child of
-- document_extractions. Replaces a permissive `auth.uid() IS NOT NULL` ALL
-- policy (which neutralized the per-user insert/select policies) with a single
-- workspace-scoped policy consistent with the sibling children.
ALTER TABLE public.extraction_corrections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_manage_corrections" ON public.extraction_corrections;
DROP POLICY IF EXISTS "corrections_insert" ON public.extraction_corrections;
DROP POLICY IF EXISTS "corrections_select" ON public.extraction_corrections;
DROP POLICY IF EXISTS "extraction_corrections_workspace_scoped" ON public.extraction_corrections;
CREATE POLICY "extraction_corrections_workspace_scoped"
  ON public.extraction_corrections FOR ALL TO authenticated
  USING (is_staff() AND EXISTS (SELECT 1 FROM public.document_extractions de
                                WHERE de.id = extraction_corrections.extraction_id))
  WITH CHECK (is_staff() AND EXISTS (SELECT 1 FROM public.document_extractions de
                                WHERE de.id = extraction_corrections.extraction_id));

-- document_pages: per-page OCR text. Child of document_extractions.
ALTER TABLE public.document_pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON public.document_pages;
DROP POLICY IF EXISTS "document_pages_workspace_scoped" ON public.document_pages;
CREATE POLICY "document_pages_workspace_scoped"
  ON public.document_pages FOR ALL TO authenticated
  USING (is_staff() AND EXISTS (SELECT 1 FROM public.document_extractions de
                                WHERE de.id = document_pages.extraction_id))
  WITH CHECK (is_staff() AND EXISTS (SELECT 1 FROM public.document_extractions de
                                WHERE de.id = document_pages.extraction_id));

-- ocr_raw_responses: raw (pre-redaction) OCR provider responses. Child of document_pages.
ALTER TABLE public.ocr_raw_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON public.ocr_raw_responses;
DROP POLICY IF EXISTS "ocr_raw_responses_workspace_scoped" ON public.ocr_raw_responses;
CREATE POLICY "ocr_raw_responses_workspace_scoped"
  ON public.ocr_raw_responses FOR ALL TO authenticated
  USING (is_staff() AND EXISTS (SELECT 1 FROM public.document_pages dp
                                WHERE dp.id = ocr_raw_responses.page_id))
  WITH CHECK (is_staff() AND EXISTS (SELECT 1 FROM public.document_pages dp
                                WHERE dp.id = ocr_raw_responses.page_id));

-- layout_words: per-word OCR layout. Child of document_pages.
ALTER TABLE public.layout_words ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON public.layout_words;
DROP POLICY IF EXISTS "layout_words_workspace_scoped" ON public.layout_words;
CREATE POLICY "layout_words_workspace_scoped"
  ON public.layout_words FOR ALL TO authenticated
  USING (is_staff() AND EXISTS (SELECT 1 FROM public.document_pages dp
                                WHERE dp.id = layout_words.page_id))
  WITH CHECK (is_staff() AND EXISTS (SELECT 1 FROM public.document_pages dp
                                WHERE dp.id = layout_words.page_id));

-- layout_key_values: extracted key/value pairs. Child of document_pages.
ALTER TABLE public.layout_key_values ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON public.layout_key_values;
DROP POLICY IF EXISTS "layout_key_values_workspace_scoped" ON public.layout_key_values;
CREATE POLICY "layout_key_values_workspace_scoped"
  ON public.layout_key_values FOR ALL TO authenticated
  USING (is_staff() AND EXISTS (SELECT 1 FROM public.document_pages dp
                                WHERE dp.id = layout_key_values.page_id))
  WITH CHECK (is_staff() AND EXISTS (SELECT 1 FROM public.document_pages dp
                                WHERE dp.id = layout_key_values.page_id));

-- layout_tables: detected tables. Child of document_pages.
ALTER TABLE public.layout_tables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON public.layout_tables;
DROP POLICY IF EXISTS "layout_tables_workspace_scoped" ON public.layout_tables;
CREATE POLICY "layout_tables_workspace_scoped"
  ON public.layout_tables FOR ALL TO authenticated
  USING (is_staff() AND EXISTS (SELECT 1 FROM public.document_pages dp
                                WHERE dp.id = layout_tables.page_id))
  WITH CHECK (is_staff() AND EXISTS (SELECT 1 FROM public.document_pages dp
                                WHERE dp.id = layout_tables.page_id));

-- layout_table_cells: table cells. Child of layout_tables (delegates through to document_pages).
ALTER TABLE public.layout_table_cells ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON public.layout_table_cells;
DROP POLICY IF EXISTS "layout_table_cells_workspace_scoped" ON public.layout_table_cells;
CREATE POLICY "layout_table_cells_workspace_scoped"
  ON public.layout_table_cells FOR ALL TO authenticated
  USING (is_staff() AND EXISTS (SELECT 1 FROM public.layout_tables lt
                                WHERE lt.id = layout_table_cells.table_id))
  WITH CHECK (is_staff() AND EXISTS (SELECT 1 FROM public.layout_tables lt
                                WHERE lt.id = layout_table_cells.table_id));

-- layout_selection_marks: checkboxes/marks. Child of document_pages.
ALTER TABLE public.layout_selection_marks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON public.layout_selection_marks;
DROP POLICY IF EXISTS "layout_selection_marks_workspace_scoped" ON public.layout_selection_marks;
CREATE POLICY "layout_selection_marks_workspace_scoped"
  ON public.layout_selection_marks FOR ALL TO authenticated
  USING (is_staff() AND EXISTS (SELECT 1 FROM public.document_pages dp
                                WHERE dp.id = layout_selection_marks.page_id))
  WITH CHECK (is_staff() AND EXISTS (SELECT 1 FROM public.document_pages dp
                                WHERE dp.id = layout_selection_marks.page_id));

-- =====================================================================
-- C. Document-collection family (owner-scoped via comparison_workspaces)
-- =====================================================================

-- collection_requirements: document-collection requirements. Owner-scoped via
-- workspace_id -> comparison_workspaces.created_by (its parent's boundary).
-- NOTE: acord_form_id is NULL on 100% of live rows, so it is not a usable anchor.
ALTER TABLE public.collection_requirements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_manage_collection_requirements" ON public.collection_requirements;
DROP POLICY IF EXISTS "collection_requirements_owner_scoped" ON public.collection_requirements;
CREATE POLICY "collection_requirements_owner_scoped"
  ON public.collection_requirements FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.comparison_workspaces cw
                 WHERE cw.id = collection_requirements.workspace_id
                   AND cw.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.comparison_workspaces cw
                 WHERE cw.id = collection_requirements.workspace_id
                   AND cw.created_by = auth.uid()));

-- collection_uploads: uploaded client documents. Owner-scoped two hops back to
-- comparison_workspaces.created_by. Portal uploads go through the service-role
-- document-collection edge function and are unaffected.
ALTER TABLE public.collection_uploads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_manage_collection_uploads" ON public.collection_uploads;
DROP POLICY IF EXISTS "collection_uploads_owner_scoped" ON public.collection_uploads;
CREATE POLICY "collection_uploads_owner_scoped"
  ON public.collection_uploads FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.collection_requirements cr
                 JOIN public.comparison_workspaces cw ON cw.id = cr.workspace_id
                 WHERE cr.id = collection_uploads.requirement_id
                   AND cw.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.collection_requirements cr
                 JOIN public.comparison_workspaces cw ON cw.id = cr.workspace_id
                 WHERE cr.id = collection_uploads.requirement_id
                   AND cw.created_by = auth.uid()));

-- collection_access_tokens: portal access tokens. Owner-scoped via
-- workspace_id -> comparison_workspaces.created_by. Portal token validation runs
-- in the service-role edge functions and is unaffected.
ALTER TABLE public.collection_access_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_manage_collection_tokens" ON public.collection_access_tokens;
DROP POLICY IF EXISTS "collection_access_tokens_owner_scoped" ON public.collection_access_tokens;
CREATE POLICY "collection_access_tokens_owner_scoped"
  ON public.collection_access_tokens FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.comparison_workspaces cw
                 WHERE cw.id = collection_access_tokens.workspace_id
                   AND cw.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.comparison_workspaces cw
                 WHERE cw.id = collection_access_tokens.workspace_id
                   AND cw.created_by = auth.uid()));

COMMIT;
