# Batch 6A — storage hardening — DEV-READY PLAN (not shipped; needs runtime verification)

**Why this is a plan, not an applied change:** 6A is the first real `src/` change of the arc — it triggers a
live Netlify deploy and its gate is a runtime smoke-test of document upload/display/ACORD-PDF/AI-analysis that
**cannot be performed from the Claude Code env** (no staff credentials; authed flows can't be exercised). The
code investigation also found it is **not a clean swap** — 5 sites persist the URL to a DB column, so it requires
a schema change + data backfill on the **core ACORD-PDF feature**. Shipping that blind to a live agency is the
one thing in this arc that warrants holding for the doer's runtime sign-off. Everything below is exact and ready
to execute *with* that verification.

## Reality of the chokepoint
`get-document-url` is wired to the **`portal-documents`** bucket + `portal_documents` table (RPC
`increment_document_download`), **not** the general `documents` bucket. For `documents`, mirror the existing
in-repo signed-URL idiom instead: `src/hooks/useDocuments.ts:185` (`useDocumentUrl` → `createSignedUrl(path, 3600)`)
and `src/components/tasks/TaskDetail.tsx:137` (`createSignedUrl` → `window.open`). 17 `createSignedUrl` sites
already exist — standardize on that.

## Phase 1 — migrate URL call sites (ship + smoke-test BEFORE Phase 2)

### Tier A — clean swaps / deletions (12 `documents` sites, no schema change)
- **Dead `getPublicUrl` (delete the unused call):** `customers/AddDocumentModal.tsx:99`,
  `document-analysis/DocumentAnalysisUpload.tsx:75`, `integrations/supabase/hooks/useLeadInsuranceDetails.ts:344`.
- **True display (swap to `createSignedUrl(path,3600)` → window.open):** `renewals/RenewalDocuments.tsx:189`.
- **Transient pass to an edge function (stop passing a URL; pass `storage_path`+bucket and let the service-role
  EF download/sign internally):** `hooks/useDocumentAnalysis.ts:223`, `hooks/useDecPageImport.ts:152`,
  `hooks/useOfflineQueue.ts:254`, `customers/AddPolicyModal.tsx:149`, `customers/AddCustomerModal.tsx:337`
  (this file already makes a signed URL at :322 and discards it — just use it),
  `acord/DocumentImportModalV2.tsx:342`, `acord/DocumentImportModal.tsx:198`,
  `documents/DocumentUploadWithAnalysis.tsx:121`.

### Tier B — STORE sites (persist URL → DB) — REQUIRE schema change + backfill
Each writes a public URL into a column; a signed URL would expire and rot. Change to store `storage_path` and
sign on read; backfill existing rows (they hold dead public URLs once the bucket is private).
- `hooks/useAcordForms.ts:334` → `acord_forms.pdf_url`  ← **core ACORD-PDF rendering**
- `hooks/useAcordTemplates.ts:169` → `acord_templates.pdf_template_url`  ← **core ACORD templates**
- `hooks/useDocumentAnalysis.ts:360` → `comparison_sessions` JSONB (`option*_data`/`comparison_results`)
- `components/ai/ModuleTestPanel.tsx:127` → `documents.file_url` (test panel — low stakes)
- `pages/CarrierTemplateBuilder.tsx:232` → `*_templates.sample_document_url` (also used as `img.src`)

### Edge functions (nearly free)
- `execute-ai-module/index.ts:223` — the hardcoded `/object/public/documents/` URL is **dead code** (the helper
  `extractTextWithAzure` already makes its own service-role `createSignedUrl`). Delete the unused construction.
- `analyze-insurance-document/index.ts:126` — downloads by path via service role; only its URL **parser** assumes
  `/object/public/`. Harden it to accept `/object/sign/` (strip query) **or** switch callers (Tier-A items 3,4)
  to pass `storage_path`+bucket directly. Do this in lockstep with those callers.

### Phase-1 gate (the runtime smoke-test only the doer can do)
On the branch / deployed preview, verify end-to-end: document **upload**, document **display/open**,
**ACORD form + template PDF rendering**, and **AI document analysis**. Only when all pass → Phase 2.

## Phase 2 — lock the buckets (after Phase 1 verified)
- `ALTER`/update bucket `public=false` for `documents`, `acord-forms`, `certificates`, `issue-attachments`
  (and confirm `workspace-documents`/`portal-documents` handling).
- Scope `storage.objects` RLS: write → `is_staff()`; read → staff/owner (derive tenancy from the document's
  parent account). Verify anon/cross-agency cannot list or fetch; already-private buckets unaffected.

## Separate quick fix
`avatars` and `ao-renewal-quotes` are already `public=false` but read via `getPublicUrl` ×1 each (likely already
broken/dead): `components/profile/AvatarUpload.tsx:75`, `hooks/useAORenewalQuotes.ts:157`. Confirm + convert to
signed or remove.

## Offer
I can execute all of Phase 1 + 2 on the branch (it's mechanical given this map), but the **merge/deploy should be
gated on the runtime smoke-test** — either give me a way to exercise the authed flows (preview creds), or I hand
the branch over for the doer to smoke-test + merge. I will not push an unverified document-system refactor to the
live agency on my own say-so.
