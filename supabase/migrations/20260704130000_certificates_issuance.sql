-- =============================================================================
-- Phase 5: Certificate Issuance, Immutable Snapshots, Numbering, and Documents
--          integration (Master COI / ACORD 25 module).
--
-- Transcribed verbatim from docs/coi-module/04-issuance-and-snapshots.md,
-- Sections 3.1 through 3.8, 5.3, 6.3, 7.4, 9.1, and 10.
--
-- Re-runnable per spec R22b: CREATE TABLE IF NOT EXISTS; ADD CONSTRAINT wrapped
-- in DO-block pg_constraint guards; CREATE OR REPLACE functions; CREATE INDEX
-- IF NOT EXISTS; DROP ... IF EXISTS then CREATE for triggers and policies.
--
-- Hard dependency: the additional_insureds table (doc 03's migration) must exist
-- first for the holder_id FK. This migration's timestamp must sort after it.
-- =============================================================================


-- =============================================================================
-- 3.1  certificates (the issued-certificate record)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.certificates (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenancy and subjects (reparentable navigation metadata, NOT frozen; see 3.5 / R4)
  agency_workspace_id   uuid NOT NULL REFERENCES public.agency_workspaces(id),
  account_id            uuid NOT NULL REFERENCES public.accounts(id),
  holder_id             uuid NOT NULL REFERENCES public.additional_insureds(id),

  -- Identity
  certificate_number    text UNIQUE NOT NULL,
  revision              integer NOT NULL DEFAULT 0,

  -- Frozen provenance (also duplicated inside snapshot for self-containment)
  template_id           uuid NOT NULL REFERENCES public.acord_templates(id),
  template_version      text NOT NULL,           -- acord_templates.version at issue time
  acord_edition         text NOT NULL,           -- e.g. 'ACORD 25 (2016/03)'
  source_form_id        uuid REFERENCES public.acord_forms(id),  -- optional provenance only (R1)

  -- The immutable freeze
  snapshot              jsonb NOT NULL,
  snapshot_sha256       text NOT NULL,           -- sha256 of canonical snapshot JSON
  pdf_sha256            text NOT NULL,           -- sha256 of stored PDF bytes

  -- Stored artifact (authoritative pointer; documents row is a convenience copy)
  storage_bucket        text NOT NULL DEFAULT 'coi-certificates',
  storage_path          text NOT NULL,           -- {account_id}/{certificate_id}/{certificate_number}.pdf
  size_bytes            bigint NOT NULL,

  -- Convenience pointer into the Documents tab (nullable; see Section 6.3)
  document_id           uuid REFERENCES public.documents(id) ON DELETE SET NULL,

  -- Workflow
  status                text NOT NULL DEFAULT 'issued'
                          CHECK (status IN ('issued','sent','voided','superseded')),

  -- Issuance stamps (frozen)
  issued_by             uuid NOT NULL REFERENCES auth.users(id),
  issued_at             timestamptz NOT NULL DEFAULT now(),

  -- Delivery stamps (mutable via send-coi-email only; last send wins, history in events)
  sent_to               text,
  sent_at               timestamptz,

  -- Supersede chain (corrected reissues)
  supersedes_id         uuid REFERENCES public.certificates(id),
  superseded_by_id      uuid REFERENCES public.certificates(id),

  -- Void stamps
  voided_at             timestamptz,
  voided_by             uuid REFERENCES auth.users(id),
  void_reason           text,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- One corrected successor per certificate, and a cert corrects at most one ancestor
CREATE UNIQUE INDEX IF NOT EXISTS idx_certificates_supersedes
  ON public.certificates(supersedes_id) WHERE supersedes_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_certificates_account   ON public.certificates(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_certificates_holder    ON public.certificates(holder_id);
CREATE INDEX IF NOT EXISTS idx_certificates_status    ON public.certificates(status);
CREATE INDEX IF NOT EXISTS idx_certificates_workspace ON public.certificates(agency_workspace_id);


-- =============================================================================
-- 3.2  certificate_policies (junction, navigation only)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.certificate_policies (
  certificate_id       uuid NOT NULL REFERENCES public.certificates(id) ON DELETE CASCADE,
  policy_id            uuid NOT NULL REFERENCES public.policies(id) ON DELETE RESTRICT,
  agency_workspace_id  uuid NOT NULL REFERENCES public.agency_workspaces(id),
  line_key             text NOT NULL CHECK (line_key IN
                         ('gl','auto','umbrella','wc','property','other')),
  insurer_letter       char(1) NOT NULL CHECK (insurer_letter IN ('A','B','C','D','E','F')),
  PRIMARY KEY (certificate_id, policy_id, line_key)
);

CREATE INDEX IF NOT EXISTS idx_certificate_policies_policy    ON public.certificate_policies(policy_id);
CREATE INDEX IF NOT EXISTS idx_certificate_policies_workspace ON public.certificate_policies(agency_workspace_id);


-- =============================================================================
-- 3.3  certificate_events (issuance log / audit)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.certificate_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id       uuid NOT NULL REFERENCES public.certificates(id) ON DELETE CASCADE,
  agency_workspace_id  uuid NOT NULL REFERENCES public.agency_workspaces(id),
  action               text NOT NULL CHECK (action IN
                         ('generated','previewed','downloaded','emailed',
                          'reissued','voided','document_restored')),
  actor_id             uuid REFERENCES auth.users(id),
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_certificate_events_cert      ON public.certificate_events(certificate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_certificate_events_workspace ON public.certificate_events(agency_workspace_id);

-- Fill trigger: every writer may omit agency_workspace_id; it is copied from the parent
-- certificate so the child can never disagree with the parent. Same trigger shape exists
-- for certificate_policies as a backstop (finalize passes it explicitly).
CREATE OR REPLACE FUNCTION public.certificate_child_fill_workspace()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.agency_workspace_id IS NULL THEN
    SELECT c.agency_workspace_id INTO NEW.agency_workspace_id
    FROM public.certificates c WHERE c.id = NEW.certificate_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS certificate_events_fill_workspace ON public.certificate_events;
CREATE TRIGGER certificate_events_fill_workspace
BEFORE INSERT ON public.certificate_events
FOR EACH ROW EXECUTE FUNCTION public.certificate_child_fill_workspace();

DROP TRIGGER IF EXISTS certificate_policies_fill_workspace ON public.certificate_policies;
CREATE TRIGGER certificate_policies_fill_workspace
BEFORE INSERT ON public.certificate_policies
FOR EACH ROW EXECUTE FUNCTION public.certificate_child_fill_workspace();


-- =============================================================================
-- 3.4  Numbering: counter table + BEFORE INSERT trigger
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.certificate_number_counters (
  year        integer PRIMARY KEY,
  last_value  integer NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.next_certificate_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year integer := EXTRACT(YEAR FROM now())::integer;
  v_seq  integer;
BEGIN
  INSERT INTO public.certificate_number_counters AS c (year, last_value)
  VALUES (v_year, 1)
  ON CONFLICT (year) DO UPDATE SET last_value = c.last_value + 1
  RETURNING last_value INTO v_seq;
  RETURN 'COI-' || v_year::text || '-' || LPAD(v_seq::text, 5, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.next_certificate_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_certificate_number() TO service_role;
-- Explicit grant per R22a, matching the _do_account_merge lockdown pattern
-- (supabase/migrations/20260629240000_relgraph_v2_merge_consolidation.sql:264-265).

CREATE OR REPLACE FUNCTION public.set_certificate_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.certificate_number IS NULL THEN
    NEW.certificate_number := public.next_certificate_number();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_certificate_number_trigger ON public.certificates;
CREATE TRIGGER set_certificate_number_trigger
BEFORE INSERT ON public.certificates
FOR EACH ROW EXECUTE FUNCTION public.set_certificate_number();


-- =============================================================================
-- 3.8  _do_account_merge: certificate_policies-aware policy de-dup skip (R4)
-- =============================================================================
-- The account-merge policy de-dup step soft-deletes duplicate policies in the
-- merged cluster. A policy referenced by an issued certificate (certificate_policies,
-- ON DELETE RESTRICT) must NEVER be the soft-deleted loser, or a later hard-delete
-- cleanup would abort and the junction's navigation value would die with the row.
--
-- This patches the LIVE prod function body IN PLACE: re-fetch pg_get_functiondef,
-- replace ONLY the v_pol_dedup selection line, and re-apply. Starting from the live
-- body (per 04 Sec 3.8 / 11) preserves every prior patch, including the Phase 3
-- account_coi_profiles v_safe_delete allowlist (migration 20260702091500), and
-- cannot regress it. Self-verifying: aborts loudly if the target line is not found,
-- so the skip can never be a silent no-op. Idempotent: re-runs re-apply the already
-- patched body unchanged.
DO $patch$
DECLARE
  v_def text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public._do_account_merge(uuid,uuid[],text,boolean)'::regprocedure)
    INTO v_def;

  IF position('certificate_policies' in v_def) > 0 THEN
    -- Already carries the skip (idempotent re-run); re-apply as-is.
    EXECUTE v_def;
    RETURN;
  END IF;

  v_new := replace(
    v_def,
    'into v_pol_dedup from ranked where rn > 1;',
    'into v_pol_dedup from ranked where rn > 1 and id not in (select policy_id from public.certificate_policies);'
  );

  IF v_new = v_def OR position('certificate_policies' in v_new) = 0 THEN
    RAISE EXCEPTION 'Phase 5 merge patch: could not locate the v_pol_dedup de-dup line in the live _do_account_merge body; aborting to avoid a silent no-op (the merge engine would keep soft-deleting cert-referenced policies)';
  END IF;

  EXECUTE v_new;
END
$patch$;


-- =============================================================================
-- 3.5  Immutability enforcement: trigger freeze AND privilege design (both)
-- =============================================================================

-- Privilege design (R1): authenticated users get SELECT only. All inserts happen
-- via the generate-certificate edge function (service role) calling
-- finalize_certificate_issue.
REVOKE INSERT, UPDATE, DELETE ON public.certificates, public.certificate_policies, public.certificate_events FROM authenticated, anon;

-- Trigger freeze (R4: account_id, holder_id, and agency_workspace_id are
-- deliberately ABSENT from the frozen list).
CREATE OR REPLACE FUNCTION public.certificates_enforce_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'certificates are immutable: delete is not allowed (void instead), id=%', OLD.id;
  END IF;

  -- Frozen columns: any change is an error, regardless of role.
  -- account_id, holder_id, and agency_workspace_id are NOT frozen (R4): they are
  -- reparentable navigation metadata that the FK-introspecting merge engines
  -- (_do_account_merge, _do_additional_insured_merge) must be able to UPDATE.
  -- The as-issued insured and holder identities are preserved inside snapshot.
  -- Client tampering with them is impossible anyway: authenticated has no UPDATE grant.
  IF NEW.certificate_number  IS DISTINCT FROM OLD.certificate_number
  OR NEW.revision            IS DISTINCT FROM OLD.revision
  OR NEW.template_id         IS DISTINCT FROM OLD.template_id
  OR NEW.template_version    IS DISTINCT FROM OLD.template_version
  OR NEW.acord_edition       IS DISTINCT FROM OLD.acord_edition
  OR NEW.source_form_id      IS DISTINCT FROM OLD.source_form_id
  OR NEW.snapshot            IS DISTINCT FROM OLD.snapshot
  OR NEW.snapshot_sha256     IS DISTINCT FROM OLD.snapshot_sha256
  OR NEW.pdf_sha256          IS DISTINCT FROM OLD.pdf_sha256
  OR NEW.storage_bucket      IS DISTINCT FROM OLD.storage_bucket
  OR NEW.storage_path        IS DISTINCT FROM OLD.storage_path
  OR NEW.size_bytes          IS DISTINCT FROM OLD.size_bytes
  OR NEW.issued_by           IS DISTINCT FROM OLD.issued_by
  OR NEW.issued_at           IS DISTINCT FROM OLD.issued_at
  OR NEW.supersedes_id       IS DISTINCT FROM OLD.supersedes_id
  OR NEW.created_at          IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'certificates are immutable: frozen column changed on id=%', OLD.id;
  END IF;

  -- superseded_by_id is write-once
  IF OLD.superseded_by_id IS NOT NULL
     AND NEW.superseded_by_id IS DISTINCT FROM OLD.superseded_by_id THEN
    RAISE EXCEPTION 'superseded_by_id is write-once on id=%', OLD.id;
  END IF;

  -- Legal status transitions only
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'issued' AND NEW.status IN ('sent','voided','superseded')) OR
      (OLD.status = 'sent'   AND NEW.status IN ('voided','superseded'))
    ) THEN
      RAISE EXCEPTION 'illegal certificate status transition % -> % on id=%',
        OLD.status, NEW.status, OLD.id;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS certificates_immutability ON public.certificates;
CREATE TRIGGER certificates_immutability
BEFORE UPDATE OR DELETE ON public.certificates
FOR EACH ROW EXECUTE FUNCTION public.certificates_enforce_immutability();

-- Companion append-only triggers.
CREATE OR REPLACE FUNCTION public.block_write()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only: % not allowed', TG_TABLE_NAME, TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS certificate_policies_frozen ON public.certificate_policies;
CREATE TRIGGER certificate_policies_frozen
BEFORE UPDATE OR DELETE ON public.certificate_policies
FOR EACH ROW EXECUTE FUNCTION public.block_write();

DROP TRIGGER IF EXISTS certificate_events_append_only ON public.certificate_events;
CREATE TRIGGER certificate_events_append_only
BEFORE UPDATE OR DELETE ON public.certificate_events
FOR EACH ROW EXECUTE FUNCTION public.block_write();


-- =============================================================================
-- 3.6  RLS (R14 posture)
-- =============================================================================

ALTER TABLE public.certificates                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificate_policies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificate_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificate_number_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS certificates_select ON public.certificates;
CREATE POLICY certificates_select ON public.certificates
  FOR SELECT USING (public.is_staff() AND public.is_agency_member(agency_workspace_id));

DROP POLICY IF EXISTS certificate_policies_select ON public.certificate_policies;
CREATE POLICY certificate_policies_select ON public.certificate_policies
  FOR SELECT USING (public.is_staff() AND public.is_agency_member(agency_workspace_id));

DROP POLICY IF EXISTS certificate_events_select ON public.certificate_events;
CREATE POLICY certificate_events_select ON public.certificate_events
  FOR SELECT USING (public.is_staff() AND public.is_agency_member(agency_workspace_id));

-- No INSERT/UPDATE/DELETE policies on any of the four tables:
-- writes are service-role (bypasses RLS) or SECURITY DEFINER RPCs only.
-- certificate_number_counters has NO select policy either; clients never read it.

GRANT SELECT ON public.certificates, public.certificate_policies,
              public.certificate_events TO authenticated;
REVOKE ALL ON public.certificate_number_counters FROM authenticated, anon;


-- =============================================================================
-- 3.7  The coi-certificates bucket (R5)
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('coi-certificates', 'coi-certificates', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "coi_certificates_staff_read" ON storage.objects;
CREATE POLICY "coi_certificates_staff_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'coi-certificates' AND public.is_staff());

-- Deliberately NO INSERT policy: uploads happen only via the service role
--   (bypasses RLS) inside generate-certificate.
-- Deliberately NO UPDATE policy for ANY role: objects are immutable, matching
--   the row-level freeze. Nothing can overwrite issued bytes.
-- Deliberately NO DELETE policy: only the service role (compensating cleanup on a
--   failed finalize, Section 7.5) can remove an object.


-- =============================================================================
-- 7.4  finalize_certificate_issue (the transactional tail)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.finalize_certificate_issue(
  p_certificate_id      uuid,           -- pre-generated by the edge fn; embedded in storage_path
  p_account_id          uuid,
  p_holder_id           uuid,
  p_template_id         uuid,
  p_template_version    text,
  p_acord_edition       text,
  p_certificate_number  text,
  p_revision            integer,
  p_snapshot            jsonb,
  p_snapshot_sha256     text,
  p_pdf_sha256          text,
  p_storage_bucket      text,           -- 'coi-certificates'
  p_storage_path        text,
  p_size_bytes          bigint,
  p_issued_by           uuid,
  p_lines               jsonb,          -- [{"policy_id":..,"line_key":..,"insurer_letter":..}]
  p_document_name       text,
  p_document_filename   text,
  p_representative_policy_id uuid,
  p_source_form_id      uuid DEFAULT NULL,
  p_supersedes_id       uuid DEFAULT NULL
) RETURNS TABLE (certificate_id uuid, document_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cert_id uuid;
  v_doc_id  uuid;
  v_ancestor record;
  v_workspace uuid;
  v_line jsonb;
BEGIN
  -- Reissue guards + lock
  IF p_supersedes_id IS NOT NULL THEN
    SELECT * INTO v_ancestor FROM public.certificates
     WHERE id = p_supersedes_id FOR UPDATE;
    IF v_ancestor.id IS NULL THEN RAISE EXCEPTION 'supersedes target not found'; END IF;
    IF v_ancestor.status NOT IN ('issued','sent') OR v_ancestor.superseded_by_id IS NOT NULL THEN
      RAISE EXCEPTION 'supersedes target is % / already superseded', v_ancestor.status;
    END IF;
  END IF;

  -- Workspace derivation with the sec005 orphan fallback (R14)
  SELECT agency_workspace_id INTO v_workspace FROM public.accounts WHERE id = p_account_id;
  IF v_workspace IS NULL THEN
    SELECT id INTO v_workspace FROM public.agency_workspaces ORDER BY created_at LIMIT 1;
  END IF;

  INSERT INTO public.certificates
    (id, agency_workspace_id, account_id, holder_id, certificate_number, revision,
     template_id, template_version, acord_edition, source_form_id,
     snapshot, snapshot_sha256, pdf_sha256,
     storage_bucket, storage_path, size_bytes,
     status, issued_by, supersedes_id)
  VALUES
    (p_certificate_id, v_workspace, p_account_id, p_holder_id, p_certificate_number, p_revision,
     p_template_id, p_template_version, p_acord_edition, p_source_form_id,
     p_snapshot, p_snapshot_sha256, p_pdf_sha256,
     p_storage_bucket, p_storage_path, p_size_bytes,
     'issued', p_issued_by, p_supersedes_id)
  RETURNING id INTO v_cert_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    INSERT INTO public.certificate_policies
      (certificate_id, policy_id, agency_workspace_id, line_key, insurer_letter)
    VALUES (v_cert_id, (v_line->>'policy_id')::uuid, v_workspace,
            v_line->>'line_key', (v_line->>'insurer_letter')::char(1));
  END LOOP;

  INSERT INTO public.documents
    (account_id, kind, filename, name, storage_path, storage_bucket,
     mime_type, size_bytes, sha256, file_missing, uploaded_by, document_type, policy_id)
  VALUES
    (p_account_id, 'customer_document', p_document_filename, p_document_name,
     p_storage_path, p_storage_bucket, 'application/pdf', p_size_bytes, p_pdf_sha256,
     false, p_issued_by, 'coi', p_representative_policy_id)
  RETURNING id INTO v_doc_id;

  UPDATE public.certificates SET document_id = v_doc_id WHERE id = v_cert_id;

  INSERT INTO public.certificate_events (certificate_id, action, actor_id, metadata)
  VALUES (v_cert_id, 'generated', p_issued_by,
          jsonb_build_object('certificate_number', p_certificate_number,
                             'supersedes', p_supersedes_id));

  IF p_supersedes_id IS NOT NULL THEN
    UPDATE public.certificates
       SET superseded_by_id = v_cert_id, status = 'superseded'
     WHERE id = p_supersedes_id;
    INSERT INTO public.certificate_events (certificate_id, action, actor_id, metadata)
    VALUES (p_supersedes_id, 'reissued', p_issued_by,
            jsonb_build_object('superseded_by', v_cert_id,
                               'new_certificate_number', p_certificate_number));
  END IF;

  RETURN QUERY SELECT v_cert_id, v_doc_id;
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_certificate_issue FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_certificate_issue TO service_role;
-- Explicit grant per R22a, matching the _do_account_merge lockdown pattern
-- (supabase/migrations/20260629240000_relgraph_v2_merge_consolidation.sql:264-265).


-- =============================================================================
-- 5.3  void_certificate
-- =============================================================================

CREATE OR REPLACE FUNCTION public.void_certificate(
  p_certificate_id uuid,
  p_reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_workspace uuid;
BEGIN
  SELECT status, agency_workspace_id INTO v_status, v_workspace
    FROM public.certificates WHERE id = p_certificate_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'certificate not found'; END IF;
  IF NOT (public.is_staff() AND public.is_agency_member(v_workspace)) THEN
    RAISE EXCEPTION 'staff only';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'void reason is required';
  END IF;
  IF v_status NOT IN ('issued','sent') THEN
    RAISE EXCEPTION 'cannot void a % certificate', v_status;
  END IF;

  UPDATE public.certificates
     SET status = 'voided', voided_at = now(), voided_by = auth.uid(),
         void_reason = trim(p_reason)
   WHERE id = p_certificate_id;

  INSERT INTO public.certificate_events (certificate_id, action, actor_id, metadata)
  VALUES (p_certificate_id, 'voided', auth.uid(), jsonb_build_object('reason', trim(p_reason)));
END;
$$;
REVOKE ALL ON FUNCTION public.void_certificate(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_certificate(uuid, text) TO authenticated;


-- =============================================================================
-- 6.3  restore_certificate_document
-- =============================================================================

CREATE OR REPLACE FUNCTION public.restore_certificate_document(
  p_certificate_id uuid
) RETURNS uuid   -- new documents.id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cert record;
  v_doc_id uuid;
BEGIN
  SELECT * INTO v_cert FROM public.certificates WHERE id = p_certificate_id;
  IF v_cert.id IS NULL THEN RAISE EXCEPTION 'certificate not found'; END IF;
  IF NOT (public.is_staff() AND public.is_agency_member(v_cert.agency_workspace_id)) THEN
    RAISE EXCEPTION 'staff only';
  END IF;

  -- Refuse if a live, matching pointer already exists
  IF EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = v_cert.document_id
      AND d.deleted_at IS NULL
      AND d.storage_path = v_cert.storage_path
  ) THEN
    RAISE EXCEPTION 'documents row already present';
  END IF;

  INSERT INTO public.documents
    (account_id, kind, filename, name, storage_path, storage_bucket,
     mime_type, size_bytes, sha256, file_missing, uploaded_by, document_type)
  VALUES
    (v_cert.account_id, 'customer_document',
     (v_cert.snapshot->>'certificate_number') || ' (restored).pdf',
     'ACORD 25 - ' || (v_cert.snapshot->'holder'->>'name') || ' - '
       || v_cert.certificate_number || '.pdf',
     v_cert.storage_path, v_cert.storage_bucket,
     'application/pdf', v_cert.size_bytes, v_cert.pdf_sha256,
     false, auth.uid(), 'coi')
  RETURNING id INTO v_doc_id;

  UPDATE public.certificates SET document_id = v_doc_id WHERE id = p_certificate_id;

  INSERT INTO public.certificate_events (certificate_id, action, actor_id, metadata)
  VALUES (p_certificate_id, 'document_restored', auth.uid(),
          jsonb_build_object('document_id', v_doc_id));

  RETURN v_doc_id;
END;
$$;
REVOKE ALL ON FUNCTION public.restore_certificate_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_certificate_document(uuid) TO authenticated;


-- =============================================================================
-- 10.  log_certificate_event
-- =============================================================================

CREATE OR REPLACE FUNCTION public.log_certificate_event(
  p_certificate_id uuid,
  p_action text,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_workspace uuid;
BEGIN
  SELECT agency_workspace_id INTO v_workspace
    FROM public.certificates WHERE id = p_certificate_id;
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'certificate not found';
  END IF;
  IF NOT (public.is_staff() AND public.is_agency_member(v_workspace)) THEN
    RAISE EXCEPTION 'staff only';
  END IF;
  IF p_action NOT IN ('downloaded','previewed') THEN
    RAISE EXCEPTION 'client-loggable actions are downloaded/previewed only';
  END IF;
  INSERT INTO public.certificate_events (certificate_id, action, actor_id, metadata)
  VALUES (p_certificate_id, p_action, auth.uid(), COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.log_certificate_event(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_certificate_event(uuid, text, jsonb) TO authenticated;


-- =============================================================================
-- 9.1  list_certificates (reader; UI consumes the reader, never raw table rows)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.list_certificates(
  p_account_id uuid,
  p_limit integer DEFAULT NULL
) RETURNS TABLE (
  id                    uuid,
  certificate_number    text,
  revision              integer,
  status                text,
  holder_id             uuid,
  holder_name           text,
  issued_at             timestamptz,
  issued_by             uuid,
  issued_by_name        text,
  sent_to               text,
  sent_at               timestamptz,
  supersedes_id         uuid,
  superseded_by_id      uuid,
  superseded_by_number  text,
  void_reason           text,
  storage_bucket        text,
  storage_path          text,
  pdf_sha256            text,
  size_bytes            bigint,
  document_id           uuid,
  line_keys             text[]
)
LANGUAGE sql
STABLE
SECURITY INVOKER      -- table RLS (staff + workspace) applies to the caller
AS $$
  SELECT c.id, c.certificate_number, c.revision, c.status,
         c.holder_id,
         c.snapshot->'holder'->>'name'          AS holder_name,
         c.issued_at, c.issued_by,
         p.full_name                            AS issued_by_name,
         c.sent_to, c.sent_at,
         c.supersedes_id, c.superseded_by_id,
         s.certificate_number                   AS superseded_by_number,
         c.void_reason,
         c.storage_bucket, c.storage_path, c.pdf_sha256, c.size_bytes,
         c.document_id,
         COALESCE((SELECT array_agg(cp.line_key ORDER BY cp.line_key)
                     FROM public.certificate_policies cp
                    WHERE cp.certificate_id = c.id), '{}') AS line_keys
    FROM public.certificates c
    LEFT JOIN public.profiles p ON p.id = c.issued_by
    LEFT JOIN public.certificates s ON s.id = c.superseded_by_id
   WHERE c.account_id = p_account_id
   ORDER BY c.issued_at DESC
   LIMIT COALESCE(p_limit, 2147483647)
$$;
GRANT EXECUTE ON FUNCTION public.list_certificates(uuid, integer) TO authenticated;
