# 5B Storage — the URL-access answer (for the residual-hardening handoff)

**Question:** can the PII buckets (esp. `documents`) be set `public=false` without breaking the app?
**Answer:** **No — not as a drop-in.** The app serves `documents` via PUBLIC urls in ~20 places. Making it
private first requires migrating those call sites to signed URLs. The codebase is currently **inconsistent**
(uses both `getPublicUrl` and `createSignedUrl` on the same `documents` bucket).

## Access map (grep of src/ + supabase/functions/, 2026-06-28)

`getPublicUrl()` — **28 sites; BREAK if the bucket goes private:**
- **`documents` × 19** ← the blocker (incl. `useAcordForms.ts:334`, `useAcordTemplates.ts:169`, Add{Document,Policy,Customer}Modal, RenewalDocuments, DocumentImportModal(V2), DocumentUploadWithAnalysis, useDocumentAnalysis, useDecPageImport, useCOIGeneration, useOfflineQueue, CarrierTemplateBuilder, DocumentAnalysisUpload, ComparisonUploadModal, …)
- `acord-forms` ×1 (public), `certificates` ×1 (public), `issue-attachments` ×1 (public)
- `avatars` ×1 and `ao-renewal-quotes` ×1 — **both already `public=false`**, so these `getPublicUrl` calls likely already 404 / are dead (worth a separate look; not a 5B blocker).

Hardcoded public-URL dependencies on `documents`:
- `supabase/functions/execute-ai-module/index.ts:223` builds `…/object/public/documents/${path}`
- `supabase/functions/analyze-insurance-document/index.ts:126` splits on `/storage/v1/object/public/`
- `src/hooks/useAORenewalQuotes.ts:128` marker `/object/public/${AO_QUOTE_BUCKET}/`

`createSignedUrl()` — **37 sites; already work with PRIVATE buckets:**
- `documents` ×17, `ticket-attachments` ×4, `portal-documents` ×3, `exports` ×1 (last three buckets are already private — correct).

## Implication for the 5B spec
1. **Migrate** the ~19 `documents` `getPublicUrl` sites + the 2 edge-fn hardcoded `/object/public/documents/`
   builders to `createSignedUrl()` (or route all document reads through the existing `get-document-url` edge
   function for one consistent signed path). Standardize on signed URLs.
2. Repeat for `certificates`, `acord-forms`, `issue-attachments` if those hold PII/customer data.
3. **Then** set those buckets `public=false` and scope `storage.objects` write→`is_staff()`, read→staff/owner.
4. Separately: fix or remove the `avatars` / `ao-renewal-quotes` `getPublicUrl` calls (buckets already private).

Until step 1 lands, leaving the buckets public is the correct call — flipping them now would break document
upload/display and AI document analysis.
