-- Document-intake pipeline: tenancy hardening -- DEFERRED sibling tables
-- =====================================================================
-- Follow-up to 20260702190000_document_intake_tenancy_hardening, which
-- workspace/owner-scoped 15 document-intake PII value/OCR/upload/token tables and
-- EXPLICITLY DEFERRED the 12 sibling pipeline tables below. They were deferred
-- because they needed per-table app-flow tracing to avoid breaking authenticated
-- read/write paths (an earlier aggressive RLS pass had caused a read regression,
-- so these were not bulk-applied blind).
--
-- Each still carried a permissive policy gated only on is_staff() or
-- `auth.uid() IS NOT NULL` with no workspace/owner check -- a latent cross-tenant
-- leak (prod is single-tenant today, so not live-exploitable yet). This migration
-- replaces those with policies that resolve back to each row's real tenant/owner
-- anchor. Service role (all edge functions: process-document-tasks, the OCR
-- pipeline, renewal-rate-watch, parseur/on_parse webhooks, create_workspace, the
-- document-collection portal, and the service_role-locked review-queue /
-- learned-rule RPCs) bypasses RLS and is unaffected. anon has no path
-- (auth.uid() is NULL).
--
-- App-flow traced against live code + prod (lrqajzwcmdwahnjyidgv) 2026-07-02.
-- All 12 tables are EMPTY except collection_templates (3 shared-config rows), so
-- no existing row can be orphaned by a stricter policy; the only risk was breaking
-- authenticated read/write PATHS, traced per table below. Verified pre-apply with a
-- SET-ROLE=authenticated RLS simulation (own rows visible/writable, cross-tenant
-- denied, shared config staff-read-only, non-staff sees nothing).
--
-- Anchors + decisions (5 shapes):
--
--  1. AGENCY-scoped  (is_staff() AND is_agency_member(workspace)) -- AI document-
--     analysis pipeline, shared among a workspace's staff:
--       document_analysis_jobs  -> agency_workspace_id (direct) OR accounts (account_id)
--       document_insights        -> same
--     The old is_staff()-only FOR ALL ("Service role can manage ...") OR-combined
--     with and NEUTRALIZED the scoped SELECT (staff saw every workspace's rows) and
--     left writes staff-wide. Client reads jobs/insights by workspace/account
--     (kept); the sole client write (useQueueDocumentAnalysis INSERT) is un-wired
--     today but preserved workspace-scoped; all real writes are the service-role
--     process-document-tasks upsert. The old SELECT's `account_id IS NULL`
--     global-read branch is dropped (the pipeline always sets agency_workspace_id).
--
--  2. OWNER-scoped  (comparison_workspaces.created_by = auth.uid()) -- the
--     insurance-comparison / renewal-rate-watch / document-collection family.
--     comparison_workspaces' OWN live RLS is strictly per-creator, so its children
--     must match (identical to the reference migration's collection_* family):
--       renewal_comparison_results, renewal_email_drafts, workspace_documents,
--       collection_email_ingestion   (all via workspace_id -> comparison_workspaces)
--     workspace_documents' is_staff() FOR ALL neutralized its owner DELETE; the
--     others were `auth.uid() IS NOT NULL` FOR ALL. Client CRUD (upload/assign-role/
--     swap, draft edit-by-id) is preserved for the owner; compute/send + inbound
--     webhook run service-role.
--
--  3. ACCOUNT-scoped  (is_staff() AND is_agency_member(accounts.agency_workspace_id),
--     with a created_by fallback for a not-yet-linked package):
--       submission_packages -> accounts (account_id) | created_by
--     Client creates (account_id + created_by), reads by account_id, updates by id.
--
--  4. DELEGATE to document_extractions visibility  (is_staff() AND the parent
--     extraction is visible under its own workspace-scoped RLS) -- identical to the
--     reference migration's extraction_evidence / field_candidates children:
--       doc_type_classifications, review_queue_items   -> document_extractions (extraction_id)
--       document_quality_assessments -> document_extractions (document_id; NO FK in
--         schema, documented intent is document_extractions.id; guarded IS NOT NULL.
--         Recommend adding the real FK in a later schema change.)
--     review_queue_items backs a staff read-queue UI (read preserved); its rows are
--     produced by a service_role-locked RPC. The other two are pipeline-internal.
--
--  5. SHARED staff config  (staff read; NO authenticated write -- the only writers
--     are service-role / SECURITY-DEFINER-locked paths, which bypass RLS):
--       collection_templates      (shared template library; client reads is_active,
--         never writes; 3 rows)
--       extraction_learned_rules  (global ML rules, no tenant column; client reads a
--         count; the learned-rule writer RPC is service_role-locked). Global
--         `SELECT USING true` is narrowed to is_staff().
--
-- Idempotent (drops old + new policy names before create) and transactional.
-- =====================================================================

BEGIN;

-- ---------- 1. AGENCY-scoped: AI document-analysis pipeline ----------

-- document_analysis_jobs: the old is_staff()-only FOR ALL policy ("Service role
-- can manage ...") OR-combined with and NEUTRALIZED the scoped SELECT (any staff
-- user saw every workspace's jobs) and left writes staff-wide. Anchor on the
-- direct agency_workspace_id, or the account's workspace. Client reads jobs by
-- workspace/account (kept); the only client write (useQueueDocumentAnalysis
-- INSERT) is un-wired today but preserved workspace-scoped. All real writes are
-- the service-role process-document-tasks lifecycle (bypasses RLS). The old
-- SELECT's `account_id IS NULL` global-read branch is intentionally dropped.
ALTER TABLE public.document_analysis_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role can manage document analysis jobs" ON public.document_analysis_jobs;
DROP POLICY IF EXISTS "Users can view their document analysis jobs" ON public.document_analysis_jobs;
DROP POLICY IF EXISTS "document_analysis_jobs_workspace_read" ON public.document_analysis_jobs;
DROP POLICY IF EXISTS "document_analysis_jobs_workspace_insert" ON public.document_analysis_jobs;
CREATE POLICY "document_analysis_jobs_workspace_read"
  ON public.document_analysis_jobs FOR SELECT TO authenticated
  USING (is_staff() AND (
    is_agency_member(agency_workspace_id)
    OR EXISTS (SELECT 1 FROM public.accounts a
               WHERE a.id = document_analysis_jobs.account_id
                 AND is_agency_member(a.agency_workspace_id))));
CREATE POLICY "document_analysis_jobs_workspace_insert"
  ON public.document_analysis_jobs FOR INSERT TO authenticated
  WITH CHECK (is_staff() AND (
    is_agency_member(agency_workspace_id)
    OR EXISTS (SELECT 1 FROM public.accounts a
               WHERE a.id = document_analysis_jobs.account_id
                 AND is_agency_member(a.agency_workspace_id))));

-- document_insights: same neutralizer. Client READ only; the service-role
-- process-document-tasks upsert does every write (bypasses RLS), so authenticated
-- gets a scoped SELECT and no write policy.
ALTER TABLE public.document_insights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role can manage document insights" ON public.document_insights;
DROP POLICY IF EXISTS "Users can view document insights" ON public.document_insights;
DROP POLICY IF EXISTS "document_insights_workspace_read" ON public.document_insights;
CREATE POLICY "document_insights_workspace_read"
  ON public.document_insights FOR SELECT TO authenticated
  USING (is_staff() AND (
    is_agency_member(agency_workspace_id)
    OR EXISTS (SELECT 1 FROM public.accounts a
               WHERE a.id = document_insights.account_id
                 AND is_agency_member(a.agency_workspace_id))));

-- ---------- 2. OWNER-scoped: comparison_workspaces family ----------
-- comparison_workspaces' own live RLS is strictly per-creator (created_by =
-- auth.uid()), so its children must match -- identical to the reference
-- migration's collection_requirements / collection_uploads / collection_access_tokens.
-- Service-role edge paths (rate-watch compute/send, inbound-email webhook,
-- create_workspace, parseur webhook) bypass RLS and are unaffected.

-- renewal_comparison_results (was `auth.uid() IS NOT NULL` FOR ALL)
ALTER TABLE public.renewal_comparison_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can manage comparison results" ON public.renewal_comparison_results;
DROP POLICY IF EXISTS "renewal_comparison_results_owner_scoped" ON public.renewal_comparison_results;
CREATE POLICY "renewal_comparison_results_owner_scoped"
  ON public.renewal_comparison_results FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.comparison_workspaces cw
                 WHERE cw.id = renewal_comparison_results.workspace_id
                   AND cw.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.comparison_workspaces cw
                 WHERE cw.id = renewal_comparison_results.workspace_id
                   AND cw.created_by = auth.uid()));

-- renewal_email_drafts (was `auth.uid() IS NOT NULL` FOR ALL; client edits draft by id)
ALTER TABLE public.renewal_email_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can manage email drafts" ON public.renewal_email_drafts;
DROP POLICY IF EXISTS "renewal_email_drafts_owner_scoped" ON public.renewal_email_drafts;
CREATE POLICY "renewal_email_drafts_owner_scoped"
  ON public.renewal_email_drafts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.comparison_workspaces cw
                 WHERE cw.id = renewal_email_drafts.workspace_id
                   AND cw.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.comparison_workspaces cw
                 WHERE cw.id = renewal_email_drafts.workspace_id
                   AND cw.created_by = auth.uid()));

-- workspace_documents: the `is_staff()` FOR ALL ("workspace_documents_staff_all")
-- neutralized the scoped owner DELETE. Replace both with one owner FOR ALL
-- (covers the client upload/assign-role/swap/delete CRUD for the owner).
ALTER TABLE public.workspace_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workspace_documents_staff_all" ON public.workspace_documents;
DROP POLICY IF EXISTS "workspace_documents_owner_delete" ON public.workspace_documents;
DROP POLICY IF EXISTS "workspace_documents_owner_scoped" ON public.workspace_documents;
CREATE POLICY "workspace_documents_owner_scoped"
  ON public.workspace_documents FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.comparison_workspaces cw
                 WHERE cw.id = workspace_documents.workspace_id
                   AND cw.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.comparison_workspaces cw
                 WHERE cw.id = workspace_documents.workspace_id
                   AND cw.created_by = auth.uid()));

-- collection_email_ingestion (was `auth.uid() IS NOT NULL` FOR ALL). No app code
-- path today; inbound-email rows are written by a service-role webhook (bypasses
-- RLS). Owner-scoped so a future staff review UI only sees its own packets' email.
ALTER TABLE public.collection_email_ingestion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_manage_collection_ingestion" ON public.collection_email_ingestion;
DROP POLICY IF EXISTS "collection_email_ingestion_owner_scoped" ON public.collection_email_ingestion;
CREATE POLICY "collection_email_ingestion_owner_scoped"
  ON public.collection_email_ingestion FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.comparison_workspaces cw
                 WHERE cw.id = collection_email_ingestion.workspace_id
                   AND cw.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.comparison_workspaces cw
                 WHERE cw.id = collection_email_ingestion.workspace_id
                   AND cw.created_by = auth.uid()));

-- ---------- 3. ACCOUNT-scoped: submission_packages ----------
-- ACORD carrier submission (staff-only). Client creates (account_id + created_by),
-- reads by account_id, updates by id. Scope to the account's workspace, with a
-- created_by fallback for a package not yet linked to an account.
ALTER TABLE public.submission_packages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "submission_packages_all" ON public.submission_packages;
DROP POLICY IF EXISTS "submission_packages_account_scoped" ON public.submission_packages;
CREATE POLICY "submission_packages_account_scoped"
  ON public.submission_packages FOR ALL TO authenticated
  USING (is_staff() AND (
    EXISTS (SELECT 1 FROM public.accounts a
            WHERE a.id = submission_packages.account_id
              AND is_agency_member(a.agency_workspace_id))
    OR (account_id IS NULL AND created_by = auth.uid())))
  WITH CHECK (is_staff() AND (
    EXISTS (SELECT 1 FROM public.accounts a
            WHERE a.id = submission_packages.account_id
              AND is_agency_member(a.agency_workspace_id))
    OR (account_id IS NULL AND created_by = auth.uid())));

-- ---------- 4. DELEGATE to document_extractions visibility ----------
-- Identical to the reference migration's extraction_evidence / field_candidates
-- children: visible iff the parent extraction is visible under its own
-- workspace-scoped RLS. All writers are service-role / service_role-locked RPCs.

-- doc_type_classifications (pipeline-internal; no app code path)
ALTER TABLE public.doc_type_classifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON public.doc_type_classifications;
DROP POLICY IF EXISTS "doc_type_classifications_workspace_scoped" ON public.doc_type_classifications;
CREATE POLICY "doc_type_classifications_workspace_scoped"
  ON public.doc_type_classifications FOR ALL TO authenticated
  USING (is_staff() AND EXISTS (SELECT 1 FROM public.document_extractions de
                                WHERE de.id = doc_type_classifications.extraction_id))
  WITH CHECK (is_staff() AND EXISTS (SELECT 1 FROM public.document_extractions de
                                WHERE de.id = doc_type_classifications.extraction_id));

-- review_queue_items (staff read-queue UI; rows generated by a service_role-locked RPC)
ALTER TABLE public.review_queue_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON public.review_queue_items;
DROP POLICY IF EXISTS "review_queue_items_workspace_scoped" ON public.review_queue_items;
CREATE POLICY "review_queue_items_workspace_scoped"
  ON public.review_queue_items FOR ALL TO authenticated
  USING (is_staff() AND EXISTS (SELECT 1 FROM public.document_extractions de
                                WHERE de.id = review_queue_items.extraction_id))
  WITH CHECK (is_staff() AND EXISTS (SELECT 1 FROM public.document_extractions de
                                WHERE de.id = review_queue_items.extraction_id));

-- document_quality_assessments: document_id carries NO FK in the schema; the
-- documented intent is document_extractions.id (guarded IS NOT NULL so an
-- unanchored/NULL row is denied rather than globally exposed). Recommend adding
-- the real FK in a later schema change. Pipeline-internal; no app code path.
ALTER TABLE public.document_quality_assessments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_access" ON public.document_quality_assessments;
DROP POLICY IF EXISTS "document_quality_assessments_workspace_scoped" ON public.document_quality_assessments;
CREATE POLICY "document_quality_assessments_workspace_scoped"
  ON public.document_quality_assessments FOR ALL TO authenticated
  USING (is_staff() AND document_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM public.document_extractions de
                     WHERE de.id = document_quality_assessments.document_id))
  WITH CHECK (is_staff() AND document_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM public.document_extractions de
                     WHERE de.id = document_quality_assessments.document_id));

-- ---------- 5. SHARED staff config (staff read; no authenticated write) ----------

-- collection_templates: shared template library. Client reads is_active templates
-- and never writes them (the 3 rows are seeded/service-role managed). Narrow the
-- read to staff; remove the authenticated write grant (service role bypasses RLS).
ALTER TABLE public.collection_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_manage_collection_templates" ON public.collection_templates;
DROP POLICY IF EXISTS "collection_templates_staff_read" ON public.collection_templates;
CREATE POLICY "collection_templates_staff_read"
  ON public.collection_templates FOR SELECT TO authenticated
  USING (is_staff());

-- extraction_learned_rules: global ML rules (no tenant column). Client reads a
-- count; the learned-rule writer is a service_role-locked RPC. Narrow the global
-- `SELECT USING true` to staff; remove the authenticated write grant.
ALTER TABLE public.extraction_learned_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_manage_rules" ON public.extraction_learned_rules;
DROP POLICY IF EXISTS "authenticated_read_rules" ON public.extraction_learned_rules;
DROP POLICY IF EXISTS "extraction_learned_rules_staff_read" ON public.extraction_learned_rules;
CREATE POLICY "extraction_learned_rules_staff_read"
  ON public.extraction_learned_rules FOR SELECT TO authenticated
  USING (is_staff());

COMMIT;
