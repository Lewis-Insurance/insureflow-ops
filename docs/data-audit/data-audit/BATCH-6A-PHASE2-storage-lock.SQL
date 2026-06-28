-- ############################################################################
-- ## BATCH 6A — PHASE 2 — STORAGE LOCK — GATED — DO NOT APPLY UNTIL SMOKE-TEST PASSES
-- ## Kept in docs/ (NOT supabase/migrations/) so it cannot be applied accidentally.
-- ## Apply via MCP apply_migration ONLY after a human confirms on staging:
-- ##   (a) document upload, (b) document open/display, (c) ACORD form + template PDF,
-- ##   (d) AI document analysis  — all pass. Then merge the src/ signed-URL frontend to
-- ##   main FIRST (so prod serves signed URLs), THEN apply this. Re-verify on prod.
-- ## Reversal: set the 6 buckets public=true; recreate the prior documents-only policies.
-- ############################################################################

-- 1) Make the 6 PII buckets private (favicon, lewis-social-videos, avatars stay public).
UPDATE storage.buckets SET public = false
WHERE id IN ('documents','certificates','acord-forms','acord-templates','portal-documents','workspace-documents');

-- 2) Replace the 4 documents-only authenticated storage.objects policies with 6-bucket scoped ones.
DROP POLICY IF EXISTS "Authenticated users can read"   ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete" ON storage.objects;

-- read: staff (any object) OR the uploader of the object. (Portal customer reads go through the
-- service-role get-document-url edge function, which is unaffected by RLS.)
CREATE POLICY "pii_buckets_read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id IN ('documents','certificates','acord-forms','acord-templates','portal-documents','workspace-documents')
  AND (public.is_staff() OR owner = auth.uid())
);
-- write/update/delete: staff only.
CREATE POLICY "pii_buckets_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('documents','certificates','acord-forms','acord-templates','portal-documents','workspace-documents')
  AND public.is_staff()
);
CREATE POLICY "pii_buckets_update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id IN ('documents','certificates','acord-forms','acord-templates','portal-documents','workspace-documents')
  AND public.is_staff()
) WITH CHECK (
  bucket_id IN ('documents','certificates','acord-forms','acord-templates','portal-documents','workspace-documents')
  AND public.is_staff()
);
CREATE POLICY "pii_buckets_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id IN ('documents','certificates','acord-forms','acord-templates','portal-documents','workspace-documents')
  AND public.is_staff()
);

-- VERIFY after apply: the 6 buckets public=false; anon cannot list/fetch; a staff session can
-- createSignedUrl + open a doc in each bucket; portal get-document-url still serves portal docs.
