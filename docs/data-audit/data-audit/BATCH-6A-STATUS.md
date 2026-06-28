# Batch 6A — build status (branch `hardening/storage-6a`)

## Done & safe (committed; nothing breaks live `main`)
- **Additive schema + backfill (APPLIED to prod, additive):** `acord_forms.pdf_path`, `acord_templates.pdf_template_path`,
  `carrier_document_templates.sample_document_path`; URL columns retained for the current main frontend.
  Migrations `20260628194431` + `20260628194625` (regex corrected for URLs lacking `/public/`).
- **Shared signed-URL helper:** `src/lib/storageUrl.ts` → `getSignedStorageUrl(bucket, pathOrUrl, expiresIn=3600)`
  (mirrors the existing `useDocumentUrl` `createSignedUrl` idiom; tolerant of legacy full-URL inputs).
- **Edge functions fixed (backward-compatible; committed, NOT yet deployed):** `execute-ai-module` (removed the
  dead `/object/public/documents/` URL — the helper already signs internally), `analyze-insurance-document`
  (parser now accepts `/object/sign/` signed URLs + strips `?query`, still accepts public URLs).
- **Gated Phase-2 storage-lock:** `BATCH-6A-PHASE2-storage-lock.SQL` (in docs/, NOT migrations/, so it can't be
  applied accidentally) — sets the 6 PII buckets `public=false` and scopes `storage.objects` (read=staff/owner,
  write=is_staff). Apply ONLY after the staging smoke-test + after main carries the signed-URL frontend.

## Remaining — the frontend signed-URL swap (the runtime-gated bulk; specced, not yet done)
Mechanical now (the helper exists) but extensive + must be runtime-tested. Per `BATCH-6A-STORAGE-MIGRATION-PLAN.md`:
- **Dead-code deletes (3):** `customers/AddDocumentModal.tsx:99`, `document-analysis/DocumentAnalysisUpload.tsx:75`,
  `integrations/supabase/hooks/useLeadInsuranceDetails.ts:344` — remove the unused `getPublicUrl` call.
- **Display swap (1):** `renewals/RenewalDocuments.tsx:189` → `await getSignedStorageUrl('documents', doc.file_path)`.
- **Transient→edge-fn (8):** `useDocumentAnalysis.ts:223`, `useDecPageImport.ts:152`, `useOfflineQueue.ts:254`,
  `AddPolicyModal.tsx:149`, `AddCustomerModal.tsx:337` (already has a signed URL at :322 — use it),
  `DocumentImportModalV2.tsx:342`, `DocumentImportModal.tsx:198`, `DocumentUploadWithAnalysis.tsx:121`
  → swap `getPublicUrl`→`getSignedStorageUrl`; the EF fetches the signed URL unchanged (sync→async — make the
  enclosing fn async).
- **STORE sites (5) — write the PATH column + sign at EVERY read/display site (scattered; grep each column):**
  `useAcordForms.ts` (`pdf_url`→`pdf_path`), `useAcordTemplates.ts` (`pdf_template_url`→`pdf_template_path`),
  `useDocumentAnalysis.ts:360` (comparison_sessions JSONB `document_url`→`document_path`),
  `ai/ModuleTestPanel.tsx` (use `storage_path`), `CarrierTemplateBuilder.tsx` (`sample_document_url`→`sample_document_path`,
  incl. the `img.src` preview).
- **Other in-scope buckets (find + swap):** `useCOIGeneration.ts:256` (`certificates`, STORE `coi.document_url`),
  `ComparisonUploadModal.tsx:199` (`workspace-documents`, STORE `workspace_documents.file_url`), and the 1
  `acord-forms` `getPublicUrl` site. `portal-documents` already uses signed/`get-document-url`.
- **Leave public (out of scope):** `favicon`, `lewis-social-videos`, `avatars`, `issue-attachments`, `ao-renewal-quotes`
  (the `avatars`/`ao-renewal-quotes` `getPublicUrl` calls are likely already broken — separate cleanup).

## ⚠️ Data landmines found (the smoke-test must use REAL data)
- `acord_templates` 5 rows are **placeholder seeds** (`https://YOUR_PROJECT_ID.supabase.co/...`, `acord-templates`
  bucket) while code uploads to `documents` — their objects may not exist. ACORD-template PDF rendering should be
  tested against a freshly generated template, not these seeds.
- `acord_forms` and `carrier_document_templates` have **0** stored PDFs — nothing to migrate; test by generating new.

## Finish sequence
1. Complete the frontend swap above; `npm run typecheck` + `npm run build` clean.
2. Deploy `execute-ai-module` + `analyze-insurance-document` (backward-compatible).
3. Push branch → Netlify preview. **Human gate:** upload / display / ACORD form+template PDF / AI analysis all pass.
4. Merge `src/` to main; apply `BATCH-6A-PHASE2-storage-lock.SQL`; re-verify on prod. Output `[BATCH 6A COMPLETE]`.
5. Cleanup migration later: drop the now-dead URL columns (`pdf_url`, `pdf_template_url`, `sample_document_url`, …).
