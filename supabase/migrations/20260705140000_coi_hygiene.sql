-- COI module hygiene (audit minors). Idempotent.

-- 1) list_certificates: match the module's grant convention. It is SECURITY
--    INVOKER and RLS-filtered (is_staff() AND is_agency_member), so anon already
--    gets zero rows -- this is not a leak -- but every other function in the
--    module revokes anon/PUBLIC, and list_certificates was left callable by them.
revoke execute on function public.list_certificates(uuid, integer) from anon, public;

-- 2) restore_certificate_document: guard the document name against a NULL holder
--    name in the snapshot. `'ACORD 25 - ' || (snapshot->'holder'->>'name') || ...`
--    yields a NULL document name whenever the holder name is absent (the snapshot
--    is immutable and not guaranteed to carry one). coalesce keeps the name total.
--    Body cloned from the live prod definition; only the holder-name concat changed.
create or replace function public.restore_certificate_document(p_certificate_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE v_cert record; v_doc_id uuid;
BEGIN
  SELECT * INTO v_cert FROM public.certificates WHERE id = p_certificate_id;
  IF v_cert.id IS NULL THEN RAISE EXCEPTION 'certificate not found'; END IF;
  IF NOT (public.is_staff() AND public.is_agency_member(v_cert.agency_workspace_id)) THEN
    RAISE EXCEPTION 'staff only';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = v_cert.document_id AND d.deleted_at IS NULL AND d.storage_path = v_cert.storage_path
  ) THEN
    RAISE EXCEPTION 'documents row already present';
  END IF;
  INSERT INTO public.documents
    (account_id, kind, filename, name, storage_path, storage_bucket,
     mime_type, size_bytes, sha256, file_missing, uploaded_by, document_type)
  VALUES
    (v_cert.account_id, 'customer_document',
     (v_cert.snapshot->>'certificate_number') || ' (restored).pdf',
     'ACORD 25 - ' || coalesce(v_cert.snapshot->'holder'->>'name', '(holder)') || ' - ' || v_cert.certificate_number || '.pdf',
     v_cert.storage_path, v_cert.storage_bucket, 'application/pdf', v_cert.size_bytes, v_cert.pdf_sha256,
     false, auth.uid(), 'coi')
  RETURNING id INTO v_doc_id;
  UPDATE public.certificates SET document_id = v_doc_id WHERE id = p_certificate_id;
  INSERT INTO public.certificate_events (certificate_id, action, actor_id, metadata)
  VALUES (p_certificate_id, 'document_restored', auth.uid(), jsonb_build_object('document_id', v_doc_id));
  RETURN v_doc_id;
END;
$function$;
