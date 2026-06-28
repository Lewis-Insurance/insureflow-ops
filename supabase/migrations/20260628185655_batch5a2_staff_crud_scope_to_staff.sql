-- Batch 5A (tier 2) — scope staff-CRM / extraction / reference tables to is_staff().
-- Read+written by the authenticated STAFF app; replacing wide-open USING(true)/WITH
-- CHECK(true) write policies with is_staff() preserves all staff writes while blocking
-- anon + non-staff authenticated. service_role bypasses RLS. Excludes log/audit tables
-- (possible trigger-in-caller-context writes) and public-flow tables (keep anon INSERT).
-- Adversarial review: SAFE-WITH-FLAGS (no active non-staff/portal write path is broken).
-- DOWN: recreate dropped policies as USING(true)/WITH CHECK(true); re-grant anon writes.
DO $$
DECLARE r record;
  incl text[] := array[
    'acord_field_outputs','acord_forms','acord_templates','carriers','communications',
    'doc_type_classifications','document_pages','document_quality_assessments','documents',
    'extraction_evidence','field_candidates','import_batches','import_staging','kb_entries',
    'layout_key_values','layout_selection_marks','layout_table_cells','layout_tables','layout_words',
    'lead_activities','lead_commercial_insurance','ocr_raw_responses','quotes','rate_watch_documents',
    'rate_watch_jobs','regression_test_corpus','review_queue_items','tasks'];
BEGIN
  FOR r IN
    SELECT tablename, policyname, cmd FROM pg_policies
    WHERE schemaname='public' AND tablename = ANY(incl)
      AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
      AND (coalesce(qual,'')='true' OR coalesce(with_check,'')='true')
      AND roles::text <> '{service_role}'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    IF r.cmd='INSERT' THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_staff())', r.policyname, r.tablename);
    ELSIF r.cmd='UPDATE' THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff())', r.policyname, r.tablename);
    ELSIF r.cmd='DELETE' THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_staff())', r.policyname, r.tablename);
    ELSE
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff())', r.policyname, r.tablename);
    END IF;
  END LOOP;
  FOREACH r.tablename IN ARRAY incl LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon', r.tablename);
  END LOOP;
END $$;

-- leads: keep the public "Anyone can submit leads" anon INSERT, scope authenticated CUD to is_staff().
DROP POLICY IF EXISTS "Users can create leads" ON public.leads;
CREATE POLICY "Users can create leads" ON public.leads FOR INSERT TO authenticated WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "Users can update leads" ON public.leads;
CREATE POLICY "Users can update leads" ON public.leads FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "Users can delete leads" ON public.leads;
CREATE POLICY "Users can delete leads" ON public.leads FOR DELETE TO authenticated USING (public.is_staff());
