-- Phase 6: System B COI demolition (doc 01 §2.4).
--
-- Retires the legacy COI generation system now that the new module (Phases 0-5) is live.
-- Preconditions RE-VERIFIED live on prod 2026-07-04: 0 rows in certificates_of_insurance,
-- coi_audit_log, coi_templates; 0 objects in the 'certificates' and 'coi-pdfs' buckets; the
-- only FK into certificates_of_insurance is coi_audit_log (dropped first); get_master_coi's
-- single reference to certificates_of_insurance is a COMMENT, not a functional dependency
-- (R13 gate satisfied); the new 'coi-certificates' bucket and its coi_certificates_staff_read
-- policy are NOT matched by the storage-policy drop patterns below.
--
-- The customer-merge FK map entries that name certificates_of_insurance
-- (20260622160000) are guarded by _customer_merge_column_exists and self-deactivate after
-- the drop (doc 01 §2.5 D9); no patch needed.

-- Legacy numbering + versioning machinery (System B).
DROP TRIGGER IF EXISTS set_coi_number_trigger ON public.certificates_of_insurance;
DROP FUNCTION IF EXISTS public.set_coi_number();
DROP FUNCTION IF EXISTS public.generate_coi_number();
DROP FUNCTION IF EXISTS public.append_coi_version(uuid, jsonb);

-- Tables. coi_audit_log has an FK to certificates_of_insurance, so drop it first.
DROP TABLE IF EXISTS public.coi_audit_log;
DROP TABLE IF EXISTS public.coi_templates;
DROP TABLE IF EXISTS public.certificates_of_insurance;

-- Storage: drop any object policies scoped to the two legacy buckets, then the (empty)
-- buckets. The quoted-literal patterns match only policies whose expression tests
-- bucket_id = 'certificates' or 'coi-pdfs'; they cannot match the new 'coi-certificates'
-- bucket (its literal is 'coi-certificates', not the full quoted literal 'certificates').
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (coalesce(qual,'')       LIKE '%''certificates''%'
        OR coalesce(with_check,'') LIKE '%''certificates''%'
        OR coalesce(qual,'')       LIKE '%''coi-pdfs''%'
        OR coalesce(with_check,'') LIKE '%''coi-pdfs''%')
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

-- NOTE: the two empty legacy buckets ('certificates', 'coi-pdfs') themselves are removed
-- via the Storage API, NOT SQL: storage.protect_delete() blocks direct DELETE from
-- storage.objects / storage.buckets ("Use the Storage API instead"). The bucket deletion
-- was performed out-of-band with a service-role storage.deleteBucket() call at Phase 6
-- apply time (both buckets verified 0 objects first). This migration owns the policy drop
-- above; the buckets are gone from prod.
