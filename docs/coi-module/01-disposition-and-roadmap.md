# 01. Disposition, Cleanup, and Phased Roadmap for the Master COI / ACORD 25 Module

Area owner: Disposition subsystem (resolves handoff open questions 1 and 3, defines the whole-module roadmap and rollout strategy).
Repo: /Users/brianlewis/insureflow-ops
Ground truth inputs: gt-legacy-coi, gt-acord-engine. Where the handoff (ACORD_COI_Module_Handoff.md) and ground truth disagree, ground truth wins. Every file:line below was re-verified against source on 2026-07-02.

This is the FINAL, reconciled version of the disposition design. It complies with the orchestrator resolutions R1 through R22; where those resolutions changed an earlier decision, this document reflects the resolved state and the sibling specs are cited by their final filenames. This document makes every disposition decision an implementing engineer would otherwise have to make: what dies, what lives, in what order, behind what migration, and what Brian can demo at each phase boundary.

Sibling specs (all in docs/coi-module/):

- 02-master-coi-data-layer.md: policies extension, get_master_coi, readiness blockers, insurer letters, resolve_holder_endorsements, account_coi_profiles, src/types/master-coi.ts
- 03-additional-insureds-directory.md: additional_insureds table, search, dedup, holder merge, the additional_insured_id FK wire-up migration
- 04-issuance-and-snapshots.md: public.certificates, certificate_policies, certificate_events, generate-certificate, finalize_certificate_issue, next_certificate_number, coi-certificates bucket, send-coi-email v2, CertificateIssuanceLog, src/types/certificates.ts
- 05-acord25-pipeline.md: field map, ACORD25_TEMPLATE_SHA256 pin, buildAcord25FieldValues, validateAcord25, the Deno port into supabase/functions/_shared/acord25/
- 06-ui-surfaces.md: the /certificates surface (generator + issuance log), the Phase 1 scaffold, the Master COI panel UI, CoverageLineDrawer

Canonical vocabulary used throughout (R7, R11, R19): issued-cert table is `public.certificates` with `holder_id` and `issued_at`; the issued-PDF bucket is `coi-certificates`; line keys are `gl`, `auto`, `umbrella`, `wc`, `property`, `other`; shared types live in `src/types/certificates.ts` and `src/types/master-coi.ts`; the holder-scoped endorsement RPC is `resolve_holder_endorsements`; the issuance edge function is `generate-certificate` committing via `finalize_certificate_issue`; the one issuance-log component is `CertificateIssuanceLog`; the surface route is `/certificates`.

---

## 0. Scope and inputs

Five subsystem designs sit alongside this one (see the sibling list above). This document does not re-design those; it (a) disposes of the two legacy systems and the dead code they left behind, (b) specifies the RLS/tenancy hardening that must precede everything and states the module-wide workspace-scoping posture (R14), and (c) sequences all six subsystems into shippable phases with acceptance criteria and demos.

Locked decisions honored throughout: reuse and fix System A; extend `policies`; reuse relationship-graph dedup patterns; issued COIs are immutable versioned snapshots; real per-line Additional-Insured endorsement status with a requested-but-not-yet-endorsed state, resolved per holder at issue time (R2, R3).

Key ground-truth facts this design is built on:

- System B (`/coi-generator`, `certificates_of_insurance`) has ZERO production usage: 0 rows in `certificates_of_insurance`, `coi_audit_log`, `coi_templates`; 0 objects in both the `certificates` and `coi-pdfs` buckets (live SQL against project lrqajzwcmdwahnjyidgv, gt-legacy-coi "Additional facts"). Retirement has no data-migration cost.
- The XFA rejection in `src/lib/acord/templateIngestion.ts:88-96` is dead code (raw-string keys into pdf-lib `PDFDict.get`, which requires interned `PDFName` keys), and pdf-lib 1.17.1 `getForm()` auto-strips XFA. ACORD 25 onboarding is not blocked; the fix is small (PDFName-based detection, warn not reject, store sanitized bytes).
- System A never inserts `documents` rows on generation (`src/hooks/useAcordForms.ts:279-375` has no `documents` insert) and writes storage keys as `acord-forms/{account_id}/...` (`useAcordForms.ts:322-329`), which breaks the documents-bucket membership storage policy that expects the account UUID as the FIRST path segment (`supabase/migrations/20250929150017_543c0e63-e6af-4987-bc52-b99e0b3d9d60.sql:6-21`, `(storage.foldername(name))[1] = am.account_id::text`).
- `acord_forms` / `acord_templates` RLS is `auth.uid() IS NOT NULL` only (`supabase/migrations/20251218204626_acord_form_automation_suite.sql:357-359` for templates write, `:389-392` for forms), violating repo invariant 1 (workspace scoping). `deleteForm` is a hard delete (`useAcordForms.ts:645-650`), violating invariant 6.
- The `documents` bucket is PUBLIC with any-authenticated UPDATE/DELETE (`supabase/migrations/20251028214559_04cdd6c2-dee6-41a5-80c8-85cecdb2b4ae.sql:11-34`). Issued certificates therefore NEVER touch the documents bucket (R5, D10).

---

## 1. Decision register

| # | Decision | Rationale (one line) |
|---|----------|----------------------|
| D1 | Retire System B by hard cutover in Phase 1: delete frontend code and the `/coi-generator` route; repoint the four entry points to the new `/certificates` scaffold in the same PR (R15); defer DB/bucket drops to Phase 6 | Zero prod rows/objects means nothing to preserve; the page is actively harmful (broken autofill, RLS-blocked writes, raw-PII AI call, world-readable bucket); repointing keeps discoverability with zero affordance gap |
| D2 | Keep `send-coi-email` and rebuild it as v2 in Phase 5; the function is owned by 04-issuance-and-snapshots.md (R10) | Deno-compatible Resend integration with fixed sender and rate limiting already works; only its access check is missing (TODO at `supabase/functions/send-coi-email/index.ts:294-295`) |
| D3 | Delete `generate-coi-data` edge function in Phase 1 | Sole caller is `COIGenerator.tsx:220` (being deleted); it ships raw unredacted account and policy rows to OpenAI, violating the stated AI/PII policy |
| D4 | Delete System A dead code in Phase 1: `pdf-generation-worker`, `acord_generation_jobs`, `generationQueue.ts`, `repeaterEngine.ts`, `overflowHandler.ts`, `formVersioning.ts`, `fieldNameConstructor.ts` | All have zero importers/callers (verified by grep); the worker's fill path is inferior (no `updateFieldAppearances`) and targets a bucket that does not exist |
| D5 | Keep `formCloning.ts` as reference until Phase 5, then delete in Phase 6 | Its selective clone-with-field-preservation design informs the fill-once-swap-holder mechanic; the code itself will not be wired (it targets mutable `acord_forms`, not immutable issued certs) |
| D6 | Remarks/description overflow is a hard pre-generation validation error, never an addendum page on issued certificates (R16); `detectOverflowFields` (`src/lib/acord/pdfFiller.ts:599`) may be wired for pre-generation blocking only; delete the separate dead `overflowHandler.ts` module | ACORD 101 is the standards-correct future path for overflow; a hand-drawn addendum on an ACORD 25 is nonstandard paper; the standalone module duplicates capability with zero importers |
| D7 | RLS/tenancy hardening of `acord_forms`/`acord_templates` (+ child tables) is Phase 0, before any new feature widens usage; the same posture applies uniformly to every new module table (R14) | Master COI pushes customer policy data into `field_values`; shipping that on auth-only RLS violates invariant 1 |
| D8 | Soft delete for `acord_forms` (add `deleted_at`, remove DELETE policy, change the two hard-delete call sites) in Phase 0 | Invariant 6; issued-cert immutability (locked decision 4) is meaningless if the working form can be hard-deleted |
| D9 | Leave the stale `certificates_of_insurance` entries in the customer-merge FK map; do not patch `20260622160000_customer_merge_transactional_v1.sql` functions when the table drops | Every consumption site is guarded by `_customer_merge_column_exists` (lines 356 and 765; design comment at 329-333 states this is intentional for absent tables), so a dropped table degrades gracefully |
| D10 | Issued certificate PDFs go to a NEW private bucket `coi-certificates` (INSERT service-role only, SELECT staff via signed URLs, no UPDATE policy, DELETE service-role only); working-copy ACORD PDFs stay in the `documents` bucket with the corrected account-UUID-first path (R5) | The `documents` bucket was made PUBLIC in `20251028214559_04cdd6c2-dee6-41a5-80c8-85cecdb2b4ae.sql:11-13`; a dedicated bucket lets storage itself enforce immutability (no UPDATE policy) and privacy without a repo-wide getPublicUrl refactor |
| D11 | No feature flag; repoint-to-scaffold cutover (R15): Phase 1 deletes System B and, in the same PR, repoints all four entry points to `/certificates`, which renders a designed scaffold/empty state (spec in 06-ui-surfaces.md) until Phase 5 lights up the full generator at the same route | Zero prod usage means zero users lose capability; the scaffold keeps discoverability, ships honest empty states, and closes the legacy route's missing ProtectedRoute hole in one PR |
| D12 | Certificate numbering: keep the `COI-YYYY-NNNNN` display format but switch from random to sequential-per-year, implemented DB-side in `next_certificate_number`, callable only from `finalize_certificate_issue`; both are REVOKEd from PUBLIC/anon/authenticated with explicit `GRANT EXECUTE ... TO service_role` (R22a); owned by 04-issuance-and-snapshots.md | Random numbering (System B, `20251011003211_...sql:228-243`) looks arbitrary on legal documents; the DB-side uniqueness pattern itself is worth carrying forward |
| D13 | `fieldMappings.ts` and `signatureAnchors.ts` are NOT dead and are kept | `signatureAnchors.ts` is imported by `SignatureRequestModal.tsx:37` and `useSignature.ts:17`; `fieldMappings.ts` has a live test (`src/__tests__/canopy/fieldMappings.test.ts:16`) and covers Canopy personal-lines forms 80/35/35U |
| D14 | Generation is server-side authoritative (R1): the `generate-certificate` edge function is the ONLY issuance path; authenticated users have zero insert/update/delete grants on `certificates`; client-side `fillAcordPdf` remains for live preview only; `acord_forms` rows are optional provenance (`source_form_id`) only, never a generation write path | A client-authoritative snapshot lets a stale or tampered client issue a cert whose PDF and DB snapshot disagree; the server rebuilds everything from DB truth |

---

## 2. System B retirement plan

### 2.1 Full inventory and disposition

| Artifact | Location | Disposition | When |
|----------|----------|-------------|------|
| Page `COIGenerator.tsx` (702 lines) | `src/pages/COIGenerator.tsx` | Delete | Phase 1 |
| Hook `useCOIGeneration.ts` (792 lines) | `src/hooks/useCOIGeneration.ts` | Delete | Phase 1 |
| Hook `useCOI.ts` (100 lines) | `src/hooks/useCOI.ts` | Delete | Phase 1 |
| Renderer `pdfGenerator.ts` (310 lines, jsPDF) | `src/lib/pdfGenerator.ts` | Delete | Phase 1 |
| Layout helper `PDFLayoutManager.ts` (78 lines) | `src/lib/PDFLayoutManager.ts` | Delete | Phase 1 |
| Types `coi.ts` | `src/types/coi.ts` | Delete | Phase 1 |
| Validators `coi.ts` (re-exports COIPDFDataSchema) | `src/lib/validators/coi.ts` | Delete | Phase 1 |
| `COIQueue` batch queue | `src/lib/utils/queue.ts` | Delete | Phase 1 (sole importer is `useCOIGeneration.ts:10`) |
| Route + lazy import | `src/App.tsx:59` and `src/App.tsx:678-685` | Delete the `/coi-generator` route; add the `/certificates` scaffold route in the same PR (R15, R19) | Phase 1 |
| Entry point: customer overflow "New certificate" | `src/pages/CustomerDetail.tsx:429-431` | Repoint to `/certificates?accountId=...` (scaffold); Phase 5 lights up the full flow at the same route | Phase 1 |
| Entry point: policy header "New Certificate" | `src/pages/PolicyDetail.tsx:205-215` | Repoint to `/certificates?accountId=...` | Phase 1 |
| Entry point: policy quick action "Generate Certificate" | `src/pages/PolicyDetail.tsx:498-506` | Repoint to `/certificates?accountId=...` | Phase 1 |
| Entry point: command palette "COI Generator" | `src/components/layout/chrome/navConfig.ts:132` (in `EXTRA_DESTINATIONS`, defined at `navConfig.ts:112`) | Replace with label `Certificates` pointing at `/certificates` (R19) | Phase 1 |
| Edge fn `generate-coi-data` | `supabase/functions/generate-coi-data/` | Delete directory AND delete the deployed function in prod | Phase 1 |
| Edge fn `send-coi-email` | `supabase/functions/send-coi-email/` | KEEP; rebuild as v2 in Phase 5 per 04-issuance-and-snapshots.md (Section 2.3 below lists this doc's deltas) | Phase 5 |
| Table `certificates_of_insurance` (+ trigger `set_coi_number_trigger`, fns `generate_coi_number`, `set_coi_number`, `append_coi_version`) | `supabase/migrations/20251011003211_...sql:59-80,228-279`; `20251011013105_...sql:2-22` | Drop via migration | Phase 6 |
| Table `coi_templates` | `supabase/migrations/20251011013849_...sql:2-14` | Drop via migration (0 rows, no readers) | Phase 6 |
| Table `coi_audit_log` | `20251011013849_...sql:16-25`; flagged "no confirmed writer" by `20260628192844_batch6b_log_audit_lockdown_and_f2.sql:6` | Drop via migration (0 rows) | Phase 6 |
| Bucket `certificates` (PUBLIC, world-readable) | `supabase/migrations/20251011012403_...sql:2-10` | Delete bucket + its storage policies (0 objects) | Phase 6 |
| Bucket `coi-pdfs` (private, orphaned, zero refs in src/) | `supabase/migrations/20251011004211_...sql:5-6` | Delete bucket + its storage policies (0 objects) | Phase 6 |
| Customer-merge FK map entries for `certificates_of_insurance.account_id` | `supabase/migrations/20260622160000_customer_merge_transactional_v1.sql:190,335,751` | Leave in place (D9); optional cosmetic removal next time those functions are edited | Never (documented) |
| `ticket_id` FK + dead `tickets.metadata` write | `20251011003211_...sql:63`; `useCOIGeneration.ts:615-623` | Dies with the table drop / the hook deletion; no independent action | Phase 1 / Phase 6 |

Why delete-now for the frontend but deprecate-later for the DB: deleting UI code is trivially reversible via git and removes an actively misleading surface (the page's policy autofill silently no-ops because it reads a nonexistent `policies.coverage_details` column, its writes are RLS-blocked for effectively all accounts because they gate on `account_memberships` which has 2 rows against 16,019 accounts, and its "Generate with AI" ships raw PII to OpenAI). Repointing the entry points to the `/certificates` scaffold in the same PR means users never see a dead button or a 404. Dropping tables is a prod-schema mutation with no offsetting benefit until the new module has proven itself; batching all drops into one Phase 6 migration gives a single, reviewable demolition with the new system already live.

### 2.2 Phase 1 exact edit list (hard cutover with repoint)

Files deleted (8): `src/pages/COIGenerator.tsx`, `src/hooks/useCOIGeneration.ts`, `src/hooks/useCOI.ts`, `src/lib/pdfGenerator.ts`, `src/lib/PDFLayoutManager.ts`, `src/types/coi.ts`, `src/lib/validators/coi.ts`, `src/lib/utils/queue.ts`.

Files added (1): the `/certificates` scaffold page, spec and component name per 06-ui-surfaces.md (designed empty state, ProtectedRoute, account picker shell, "coming online" copy consistent with Calm Command; no live generation until Phase 5).

Files edited (4):

1. `src/App.tsx`: remove the lazy import at line 59 (`const COIGenerator = lazyWithRetry(...)`) and the route block at lines 678-685 (`<Route path="/coi-generator" ...>`); add a lazy `/certificates` route wrapped in `ProtectedRoute` rendering the scaffold page. The catch-all NotFound route handles stray `/coi-generator` bookmarks.
2. `src/pages/CustomerDetail.tsx`: repoint the `DropdownMenuItem` at lines 429-431 to navigate to `/certificates?accountId={account.id}`. Keep the `Award` icon import only if still used elsewhere in the file; otherwise swap it per the scaffold spec.
3. `src/pages/PolicyDetail.tsx`: repoint the header button at lines 205-215 and the quick-action button at lines 498-506 to `/certificates?accountId={policy.account_id}`.
4. `src/components/layout/chrome/navConfig.ts`: replace line 132 (`{ label: 'COI Generator', to: '/coi-generator', icon: Award }`) with `{ label: 'Certificates', to: '/certificates', ... }` (R19).

Edge function: delete `supabase/functions/generate-coi-data/` and remove the deployed function from prod (`supabase functions delete generate-coi-data --project-ref lrqajzwcmdwahnjyidgv`). Per CLAUDE.md, edge function deploys/deletes are performed automatically on Brian's behalf.

Verification gate for the phase: `grep -rn "coi-generator\|useCOIGeneration\|COIPDFDataSchema\|generate-coi-data" src/` returns zero hits; `npm run build` green; `npm run test:run` green; `/certificates` renders the scaffold inside ProtectedRoute; all four entry points land on it.

Nothing else in `src/` or `supabase/functions` reads `certificates_of_insurance` (repo-wide grep hits only the deleted hooks and generated types; `src/lib/carrier/carrierRegistry.ts:193` is an unrelated label string). No dashboards or reports break.

### 2.3 send-coi-email v2: owned by 04-issuance-and-snapshots.md

The single specification for `send-coi-email` v2 lives in 04-issuance-and-snapshots.md (R10). This document keeps only the disposition facts and the resolved deltas:

- Current state (verified): `supabase/functions/send-coi-email/index.ts` uses Resend REST with fixed sender `coi@lewisinsurance.ai` (`index.ts:34-36`), `requireAuth`, and rate limiting, but never verifies the caller can access the certificate (TODO at `index.ts:294-295`) and takes a caller-supplied `certificateUrl`. Its only caller today is dead code (`useCOIGeneration.ts:601`, deleted in Phase 1), so between Phase 1 and Phase 5 the function is deployed but unreachable, which is safe (it still requires a JWT).
- Resolved contract (per 04): request `{certificate_id, to, cc?, note?}`; access check is `requireAuth` + `is_staff()` + `is_agency_member(cert.agency_workspace_id)`, matching 04 Section 8 (R14's module-wide workspace scoping motivates the workspace-membership check beyond R10's minimum); the PDF is attached from the private `coi-certificates` bucket, attachment-only with a hard failure if the attachment cannot be built (this doc's earlier 7-day signed-URL fallback was REJECTED: no long-lived unauthenticated URL to coverage data may ever exist); the function stamps `sent_at`/`sent_to` and writes a `sent` certificate event/status.
- Deltas this doc contributed that were ADOPTED: the optional `cc?: string[]` field.
- The caller-supplied `certificateUrl`/`certificateNumber` body fields are removed; everything derives server-side from `certificate_id`. This closes both the missing-access-check hole and the send-anything-to-anyone URL-laundering hole in one move.
- System B's `coi_audit_log` action taxonomy (generated/downloaded/emailed/previewed/revised/cancelled, from `20251011013849_...sql:19`) is carried forward as prior art into the `certificate_events` design in 04, now with a real writer.

### 2.4 Phase 6 demolition migration (exact sketch)

One migration, `supabase/migrations/202609XXXXXXXX_retire_system_b_coi.sql` (timestamp assigned at implementation):

```sql
-- System B demolition. Preconditions verified 2026-07-02: 0 rows in all three
-- tables, 0 objects in both buckets. The customer-merge FK map entries that
-- name certificates_of_insurance are guarded by _customer_merge_column_exists
-- (20260622160000 lines 356, 765) and need no patch. get_master_coi contains
-- no reference to certificates_of_insurance (R13); verify with the pre-drop
-- gate below before applying.

DROP TRIGGER IF EXISTS set_coi_number_trigger ON public.certificates_of_insurance;
DROP FUNCTION IF EXISTS public.set_coi_number();
DROP FUNCTION IF EXISTS public.generate_coi_number();
DROP FUNCTION IF EXISTS public.append_coi_version(uuid, jsonb);

DROP TABLE IF EXISTS public.coi_audit_log;        -- FK to certificates_of_insurance, drop first
DROP TABLE IF EXISTS public.coi_templates;
DROP TABLE IF EXISTS public.certificates_of_insurance;

-- Storage: drop the bucket-specific object policies, then the (empty) buckets.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (coalesce(qual,'') LIKE '%''certificates''%'
        OR coalesce(with_check,'') LIKE '%''certificates''%'
        OR coalesce(qual,'') LIKE '%''coi-pdfs''%'
        OR coalesce(with_check,'') LIKE '%''coi-pdfs''%')
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

DELETE FROM storage.objects WHERE bucket_id IN ('certificates', 'coi-pdfs'); -- expected no-op
DELETE FROM storage.buckets WHERE id IN ('certificates', 'coi-pdfs');
```

Two notes for the implementer:

- Policy-matching predicate: the quoted-literal patterns (`'%''certificates''%'`) match only policies whose expressions test `bucket_id = 'certificates'` or `bucket_id = 'coi-pdfs'`; they cannot match policies about the `certificates_of_insurance` table because storage policies live on `storage.objects` only. The `coi-certificates` bucket's policies are NOT matched by these patterns (its literal is `'coi-certificates'`, which does not contain `'certificates'` as a full quoted literal); still, eyeball the loop's targets with a dry-run SELECT first and confirm no policy naming `coi-certificates` is in the result set.
- Pre-drop gate (R13): run `SELECT pg_get_functiondef('public.get_master_coi(uuid, uuid[])'::regprocedure);` (adjust the signature to the deployed one) and confirm the body contains no `certificates_of_insurance` reference. 02-master-coi-data-layer.md ships get_master_coi without any legacy prefill tier; this gate catches regressions.

After this migration: regenerate types (`supabase gen types typescript --project-id lrqajzwcmdwahnjyidgv > src/integrations/supabase/types.ts`), which removes the three tables from the generated types, and confirm `npm run build` stays green.

### 2.5 Hidden couplings, each accounted for

- Customer-merge FK map (`20260622160000_customer_merge_transactional_v1.sql:190,335,751`): all three sites are consumed inside `IF public._customer_merge_column_exists(...)` guards (lines 356 and 765; the design comment at lines 329-333 says the guards exist precisely "for environments where the table is absent"). Decision D9: leave the stale entries; they are self-deactivating after the drop. Do not edit an already-applied migration; if cosmetic cleanup is ever wanted, it happens in a future `CREATE OR REPLACE` of `preview_customer_merge_v1` / `merge_customers_transactional_v1` for some other reason.
- `ticket_id` FK (`20251011003211_...sql:63`) and the `tickets.metadata` write in `generateAndEmailCOI` (`useCOIGeneration.ts:615-623`): the write is dead code deleted in Phase 1; the FK disappears with the table in Phase 6. The tickets module itself is untouched.
- `generate-coi-data` (`supabase/functions/generate-coi-data/index.ts:34-115`): orphaned the moment `COIGenerator.tsx` dies; deleted in Phase 1 (D3). Its AI-autofill idea, if ever wanted again, must be rebuilt behind the PII redaction policy; the new module's data-driven prefill makes it unnecessary.
- `send-coi-email`: kept per D2, unreachable-but-safe between Phases 1 and 5, rebuilt in Phase 5 per 04-issuance-and-snapshots.md (Section 2.3).
- Buckets `certificates` (public!) and `coi-pdfs` (orphaned): both empty, both dropped in Phase 6. Nothing may write to the public `certificates` bucket in the interim; the new module never touches it.
- `coi_templates` / `coi_audit_log`: no readers or writers anywhere (audit-lockdown migration `20260628192844_batch6b_log_audit_lockdown_and_f2.sql:6` already flagged `coi_audit_log` as writer-less); dropped in Phase 6. The audit-action taxonomy is carried forward as data-shape prior art into `certificate_events` (Section 2.3).
- `get_master_coi` (new in Phase 3): per R13 it contains NO description-of-operations prefill tier reading `certificates_of_insurance` and its source vocabulary contains no `legacy` value; the Phase 6 pre-drop gate (Section 2.4) verifies this against the deployed function body.

---

## 3. System A dead-code cleanup

Zero-importer status for every module below was re-verified by grep on 2026-07-02 (no imports anywhere in `src/`; the worker has no invoke sites, no workflow references, and requires a CRON_SECRET nothing sends, `supabase/functions/pdf-generation-worker/index.ts:56-72`).

| Module | Lines | Disposition | Rationale |
|--------|-------|-------------|-----------|
| `supabase/functions/pdf-generation-worker/` | 442 | DELETE (Phase 1): remove directory + deployed function | Zero call sites; independent fill implementation WITHOUT `updateFieldAppearances` (worker `index.ts:270-330`), so reviving it would produce blank-looking PDFs; targets a literal `acord-forms` bucket no migration ever creates (`index.ts:335,347`) |
| `acord_generation_jobs` table | n/a | DROP via migration (Phase 1) | Created at `20251218204626_...sql:246-266`; referenced only by the dead worker, dead `generationQueue.ts`, and generated types. Client-side generation via `useAcordForms.generatePdf` is the live path for `/acord-forms` working copies and stays; issued certificates use `generate-certificate` server-side (R1) |
| `src/lib/acord/generationQueue.ts` | 706 | DELETE (Phase 1) | Zero importers; never even invokes the worker it was written for |
| `src/lib/acord/repeaterEngine.ts` | 415 | DELETE (Phase 1) | Zero importers; `fillAcordPdf` never reads `repeater_configs` (gt-acord-engine); ACORD 25 is a single-page form with a fixed insurer table, no repeaters needed; if 125/126 fleet pages ever need repeaters, git history preserves it |
| `src/lib/acord/overflowHandler.ts` | 477 | DELETE (Phase 1) | Zero importers; duplicates capability already living in the filler: `detectOverflowFields` (`pdfFiller.ts:599-623`, exported, currently uncalled). Per D6/R16, overflow on issued certificates is a hard pre-generation block, never an addendum; `detectOverflowFields` may back that pre-generation check, and the filler's addendum path (`pdfFiller.ts:129-131,469-517`) stays for non-certificate `/acord-forms` use but is excluded from the certificate pipeline and from the Deno port (05-acord25-pipeline.md) |
| `src/lib/acord/formVersioning.ts` | 635 | DELETE (Phase 1) | Zero importers; template versioning is already live via `is_current` machinery (`20251218204626_...sql:28,32-33`, `useAcordTemplates.ts:172-177,293-376`), and issued-cert versioning is superseded by the snapshot design (locked decision 4) |
| `src/lib/acord/fieldNameConstructor.ts` | 480 | DELETE (Phase 1) | Zero importers; contradicts the field-ID discipline: field names must be extracted from the blank PDF via ingestion, never constructed (handoff Section 5) |
| `src/lib/acord/formCloning.ts` | 613 | KEEP-AS-REFERENCE until Phase 5, DELETE in Phase 6 (D5) | Zero importers, but its selective clone-with-field-preservation is the closest in-repo prior art for fill-once-swap-holder. The issuance design mines its field-grouping approach, then the file dies; it is not wired because it clones mutable `acord_forms` rows, while holder-swap reissue is a new server-side snapshot per holder (04-issuance-and-snapshots.md) |
| `src/lib/acord/fieldMappings.ts` | 357 | KEEP (D13) | Live test at `src/__tests__/canopy/fieldMappings.test.ts:16`; Canopy-path-keyed catalogs for forms 80/35/35U, unrelated to ACORD 25 but not dead |
| `src/lib/acord/signatureAnchors.ts` | 372 | KEEP (D13) | Imported by `src/components/signatures/SignatureRequestModal.tsx:37` and `src/hooks/useSignature.ts:17`; part of the live eSignature path |

Phase 1 also ships a one-table migration `supabase/migrations/202607XXXXXXXX_drop_acord_generation_jobs.sql`:

```sql
DROP TABLE IF EXISTS public.acord_generation_jobs;
```

(`acord_notifications` is NOT dropped: the `notify_acord_status_change` trigger writes to it, `20251218204626_...sql:286-305`.)

After Phase 1, `src/lib/acord/` contains exactly: `pdfFiller.ts`, `templateIngestion.ts`, `fieldMappings.ts`, `signatureAnchors.ts`, and (until Phase 6) `formCloning.ts`. New ACORD 25 modules (field map, builder, validator) are added under paths defined by 05-acord25-pipeline.md.

---

## 4. RLS and tenancy hardening (Phase 0 prerequisite) and the module-wide posture

### 4.1 Current state (verified)

- `acord_templates` write policy: `FOR ALL USING (auth.uid() IS NOT NULL)` (`20251218204626_...sql:357-359`). Read policy `USING (true)` (`:354-355`).
- `acord_forms`: single policy `acord_forms_all FOR ALL USING (auth.uid() IS NOT NULL)` (`:389-392`).
- `acord_field_audit`: select and insert both `auth.uid() IS NOT NULL` (`:394-401`).
- `acord_form_sections`: `FOR ALL USING (auth.uid() IS NOT NULL)` (`:403-406`). Both child tables FK the parent via `acord_form_id` (`:132,149`).
- `acord_forms` has `account_id` but no `agency_workspace_id` column (grep of the migration: zero hits).
- Hard delete at `useAcordForms.ts:645-650` and `FormManagement.tsx:353-356`.
- Canonical helpers already exist: `is_staff()` (`20260410000011_fix_is_staff_function.sql:5-19`), `is_agency_member(uuid)` and `get_user_agency_ids()` (`20251227200000_schema_prerequisites.sql:80-160`).
- The proven pattern for retrofitting workspace scoping is `20260408100000_sec005_leads_workspace_isolation.sql` (add nullable column, backfill via `accounts.agency_workspace_id`, orphan fallback to first workspace, SET NOT NULL, index, replace policies). This migration copies that shape exactly.

### 4.2 Migration: `supabase/migrations/202607XXXXXXXX_acord_tenancy_hardening.sql`

```sql
-- ACORD engine tenancy hardening (module prerequisite).
-- Pattern: sec005 leads workspace isolation (20260408100000).

-- 1. Columns
ALTER TABLE public.acord_forms
  ADD COLUMN IF NOT EXISTS agency_workspace_id uuid
    REFERENCES public.agency_workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2. Backfill from accounts; orphan fallback to first workspace
UPDATE public.acord_forms f
SET agency_workspace_id = a.agency_workspace_id
FROM public.accounts a
WHERE f.account_id = a.id
  AND f.agency_workspace_id IS NULL;

UPDATE public.acord_forms
SET agency_workspace_id = (
  SELECT id FROM public.agency_workspaces ORDER BY created_at LIMIT 1
)
WHERE agency_workspace_id IS NULL;

ALTER TABLE public.acord_forms
  ALTER COLUMN agency_workspace_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_acord_forms_workspace
  ON public.acord_forms (agency_workspace_id);

-- 3. Derive workspace on insert so no client is trusted to supply it
CREATE OR REPLACE FUNCTION public.acord_forms_set_workspace()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.agency_workspace_id IS NULL AND NEW.account_id IS NOT NULL THEN
    SELECT a.agency_workspace_id INTO NEW.agency_workspace_id
    FROM public.accounts a WHERE a.id = NEW.account_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_acord_forms_set_workspace ON public.acord_forms;
CREATE TRIGGER trg_acord_forms_set_workspace
  BEFORE INSERT ON public.acord_forms
  FOR EACH ROW EXECUTE FUNCTION public.acord_forms_set_workspace();

-- 4. Replace auth-only policies with staff + workspace scoping
DROP POLICY IF EXISTS acord_forms_all ON public.acord_forms;

CREATE POLICY acord_forms_select ON public.acord_forms
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND is_staff() AND is_agency_member(agency_workspace_id));

CREATE POLICY acord_forms_insert ON public.acord_forms
  FOR INSERT TO authenticated
  WITH CHECK (is_staff() AND is_agency_member(agency_workspace_id));

CREATE POLICY acord_forms_update ON public.acord_forms
  FOR UPDATE TO authenticated
  USING (is_staff() AND is_agency_member(agency_workspace_id))
  WITH CHECK (is_staff() AND is_agency_member(agency_workspace_id));

-- Intentionally NO DELETE policy: soft delete only (invariant 6).

-- 5. Templates: reads stay open (no PII in templates), writes staff-only
DROP POLICY IF EXISTS acord_templates_write ON public.acord_templates;
CREATE POLICY acord_templates_write ON public.acord_templates
  FOR ALL TO authenticated
  USING (is_staff())
  WITH CHECK (is_staff());

-- 6. Child tables follow the parent form's workspace
DROP POLICY IF EXISTS acord_sections_all ON public.acord_form_sections;
CREATE POLICY acord_sections_all ON public.acord_form_sections
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.acord_forms f
    WHERE f.id = acord_form_sections.acord_form_id
      AND is_staff() AND is_agency_member(f.agency_workspace_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.acord_forms f
    WHERE f.id = acord_form_sections.acord_form_id
      AND is_staff() AND is_agency_member(f.agency_workspace_id)
  ));

DROP POLICY IF EXISTS acord_audit_select ON public.acord_field_audit;
DROP POLICY IF EXISTS acord_audit_insert ON public.acord_field_audit;

CREATE POLICY acord_audit_select ON public.acord_field_audit
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.acord_forms f
    WHERE f.id = acord_field_audit.acord_form_id
      AND is_staff() AND is_agency_member(f.agency_workspace_id)
  ));

CREATE POLICY acord_audit_insert ON public.acord_field_audit
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.acord_forms f
    WHERE f.id = acord_field_audit.acord_form_id
      AND is_staff() AND is_agency_member(f.agency_workspace_id)
  ));
```

Note: `acord_forms.account_id` is nullable in the original schema, and FormManagement's prospect mode creates the account first (`FormManagement.tsx:277-300`), so the trigger covers every live insert path. If a null-account insert ever occurs, the NOT NULL constraint fails loudly, which is the correct behavior (no unscoped rows).

### 4.3 Frontend changes shipped with the migration (same PR)

1. `src/hooks/useAcordForms.ts:645-650` (`deleteForm`): replace `.delete()` with `.update({ deleted_at: new Date().toISOString() })`. Function name and signature unchanged; callers behave identically because the SELECT policy hides soft-deleted rows.
2. `src/pages/FormManagement.tsx:353-356`: same replacement.
3. No query changes needed: RLS filters `deleted_at IS NULL` on SELECT, so lists self-clean.
4. Regenerate types (new columns `agency_workspace_id`, `deleted_at` on `acord_forms`).

### 4.4 Storage posture (D10, R5)

- Fix the System A object-key convention when generation is touched in Phase 0: `useAcordForms.ts:322` changes from `acord-forms/${form.account_id}/${formId}/...` to `${form.account_id}/acord-forms/${formId}/...` so `(storage.foldername(name))[1]` is the account UUID, matching the membership policy shape in `20250929150017_...sql:6-21`. New objects only; the handful of previously generated objects are not migrated (their `pdf_url` rows keep working while the bucket is public, and Phase 5's issued certs live elsewhere anyway).
- Issued certificates (Phase 5): NEW private bucket `coi-certificates`, created by the issuance migration set (04-issuance-and-snapshots.md) with: INSERT service-role only (the client never uploads; `generate-certificate` performs the upload, R1), SELECT restricted to `is_staff()` with the UI using `createSignedUrl` (an optional member-SELECT policy keyed on the account-first path segment can be added later if customer-portal visibility is wanted), NO UPDATE policy at all, DELETE service-role only. Object key: `{account_id}/{certificate_id}/{certificate_number}.pdf`. `certificates.storage_bucket` defaults `'coi-certificates'`; the convenience `documents`-table pointer row also sets `storage_bucket='coi-certificates'` (useDocumentManager resolves `doc.storage_bucket` first, so the Documents tab View/Download works unchanged via signed URLs). `downloadCertificate` verifies `pdf_sha256` against the fetched bytes. Storage-level immutability backs the DB-level snapshot immutability.
- FLAGGED RISK, not in this module's critical path: the `documents` bucket was flipped to PUBLIC with an "Anyone can view documents" SELECT policy and any-authenticated UPDATE/DELETE in `20251028214559_04cdd6c2-dee6-41a5-80c8-85cecdb2b4ae.sql:11-34`, and `useAcordForms.ts:334` serves generated working-copy PDFs via `getPublicUrl`. Working ACORD PDFs contain insured data, so they are world-readable by URL today. Re-privatizing `documents` is a repo-wide `getPublicUrl` audit that must not gate this module; it is recorded here as a standalone hardening task to schedule separately. The module's own contribution to the problem shrinks in Phase 5 because final certs go to the private bucket, and issued certificates NEVER touch the `documents` bucket.

### 4.5 Module-wide workspace scoping posture (R14)

The Phase 0 posture for `acord_forms` is the module-wide standard, with no exceptions. Every new module table, specifically `certificates`, `certificate_policies`, `certificate_events`, `additional_insureds`, `account_coi_profiles`, and `policy_wc_subrogation_waivers`, MUST:

1. Carry `agency_workspace_id uuid NOT NULL REFERENCES public.agency_workspaces(id)`.
2. Derive it server-side (via the owning account's `agency_workspace_id` or the creator's workspace membership; sec005 backfill pattern with orphan fallback, never trusted from the client).
3. Enforce RLS as `is_staff() AND is_agency_member(agency_workspace_id)` for every command the table allows to `authenticated` (for `certificates`, that is SELECT only; all writes are service-role via `finalize_certificate_issue`, R1).

No auth-only policies, no membership-only policies, no "single-tenant exception" comments. The owning subsystem docs (02, 03, 04) each carry the concrete DDL; this section is the binding posture statement they implement.

---

## 5. Phased roadmap (whole module, all six subsystems)

Ordering principles applied: prerequisites first (hardening, ingestion fix, template onboarding), user-visible value as early as possible (a real ACORD 25 PDF exists by the end of Phase 2), `main` shippable at every phase boundary, and the two legacy-system removals placed where they cost nothing (Phase 1) and where they are safest (Phase 6).

Dependency spine: Phase 0 -> Phase 2 -> Phase 3 -> Phase 5; Phase 1 is independent after Phase 0; Phase 4 is independent after Phase 0 and can run in parallel with Phase 3; Phase 5 requires Phases 2, 3, and 4; Phase 6 requires Phase 5.

### Phase 0: Foundations and hardening (Size: S)

- Implements: Section 4 of this doc, plus the ingestion fixes from 05-acord25-pipeline.md.
- Scope: the Section 4.2 tenancy migration; soft delete; templateIngestion XFA fix (replace the dead string-key checks at `templateIngestion.ts:88-96` and `:453-459` with PDFName-based detection run BEFORE any `getForm()` call, downgrade to a warning whenever `getFields().length > 0`, reject only zero-field PDFs); store sanitized bytes (upload `await pdfDoc.save()` after pdf-lib's auto-strip instead of the raw file at `useAcordTemplates.ts:158-164`); record honest `pdf_type` instead of the hardcoded `'acroform'` (`templateIngestion.ts:165`); generation output fixes for the `/acord-forms` working-copy path (account-UUID-first storage key at `useAcordForms.ts:322`; insert a `documents` row after successful generation with `account_id`, `storage_path`, `document_type` mapped per form number, `'coi'` for form 25, legal per `20251204000003_add_document_classification.sql:11-36`; the certificates document queue at `:253` then auto-routes it).
- Parallel non-code task (R22d): Brian initiates licensed blank ACORD 25 acquisition IMMEDIATELY at Phase 0 start (ACORD portal licensing has unknown lead time and gates Phases 2, 3, and 5). Record the source and license id for the template's `license_notes`.
- Files touched: `src/lib/acord/templateIngestion.ts`, `src/hooks/useAcordTemplates.ts`, `src/hooks/useAcordForms.ts`, `src/pages/FormManagement.tsx`, one new migration.
- Migrations: `202607XXXXXXXX_acord_tenancy_hardening.sql`.
- Acceptance criteria: a second-workspace test user cannot read or write another workspace's `acord_forms` rows (verified via SQL as that user); deleting a form sets `deleted_at` and the form vanishes from lists but survives in the table; uploading an XFA-hybrid PDF with AcroForm widgets succeeds with a visible warning and the stored template bytes contain no XFA packet; generating any existing form creates a `documents` row and the file lands under an account-UUID-first key; the ACORD 25 license request is submitted (order reference recorded).
- Demo for Brian: upload a hybrid test PDF as a template, create a form on a real customer, generate it, then open that customer's Documents tab and see the generated form sitting there.

### Phase 1: Legacy demolition and repoint-to-scaffold (Size: S)

- Implements: Sections 2.2 and 3 of this doc, plus the scaffold spec from 06-ui-surfaces.md.
- Scope: System B frontend hard cutover (8 file deletions, `/coi-generator` route removal, `generate-coi-data` deletion); the new `/certificates` route inside ProtectedRoute rendering the designed scaffold/empty state (06-ui-surfaces.md); repoint all four entry points (`CustomerDetail.tsx:429-431`, `PolicyDetail.tsx:205-215`, `PolicyDetail.tsx:498-506`, `navConfig.ts:132`) to `/certificates?accountId=...` with palette label `Certificates` (R15, R19); System A dead code deletion and the `acord_generation_jobs` drop (Section 3). `send-coi-email` and all System B DB objects remain untouched.
- Files touched: 8 deleted System B files, 1 added scaffold page, 4 edited entry-point files, 6 deleted `src/lib/acord/` modules, 2 deleted edge function directories, one migration.
- Migrations: `202607XXXXXXXX_drop_acord_generation_jobs.sql`.
- Acceptance criteria: the Phase 1 verification greps return zero hits; build, lint, and tests green; `/coi-generator` renders the NotFound page; the command palette shows `Certificates` and navigating there renders the scaffold; all four entry points navigate to `/certificates?accountId=...` and the scaffold renders its designed empty state inside ProtectedRoute; no client code path can reach `generate-coi-data` or `pdf-generation-worker`.
- Demo for Brian: open a customer record and a policy record, click each certificate button, land on the new Certificates scaffold with an honest "coming online" state; try the old `/coi-generator` URL and get NotFound.

### Phase 2: ACORD 25 template onboarding and engine validation (Size: M)

- Implements: 05-acord25-pipeline.md (template onboarding, field map, validation rules, tests).
- Scope: receive the licensed blank fillable ACORD 25 (acquisition already started in Phase 0; form 25 is already selectable in the upload dialog, `src/types/acord.ts:469-480` feeding `AcordTemplates.tsx:248-253`); upload via `/acord-templates`; add a `'25'` entry to `validateAcordFields` expected fields (`templateIngestion.ts:411-431`) using field names extracted from the real blank; establish the ACORD 25 field map module and the `ACORD25_TEMPLATE_SHA256` template pin per 05-acord25-pipeline.md; author `validation_rules` as data (Y/N literal fields, never-print-premium, required holder block) per 05; cross-field validation per 05 (the pipeline's validator suite; existing single-field rule types at `src/types/acord.ts:86-97` are insufficient alone); round-trip test (fill then re-read fields) and visual render test for the 25 specifically.
- Files touched: `src/lib/acord/templateIngestion.ts` (expected-fields entry), new field-map and validation modules per 05-acord25-pipeline.md, new tests under `src/__tests__/acord/`.
- Migrations: none required (template rows are data, not schema); any validation-rule schema additions belong to 05-acord25-pipeline.md.
- Acceptance criteria: an `acord_templates` row for form 25 exists with a populated `field_inventory` extracted from the licensed blank and its sha256 recorded as the pin; hand-filling a form 25 in `/acord-forms/:id/edit` and generating produces a correctly rendered ACORD 25 PDF (visually verified, fields visible after flatten); the round-trip test passes in CI.
- Demo for Brian: create an ACORD 25 form for a test customer, type values into the editor, hit Generate, download and print a real ACORD 25.

### Phase 3: Master COI data layer and panel (Size: L)

- Implements: 02-master-coi-data-layer.md, plus the client build modules from 05-acord25-pipeline.md and the panel UI from 06-ui-surfaces.md.
- Scope: the `policies` extension migrations (typed per-line limits where missing, NAIC/carrier resolution for modal-created policies, per-line ADDL INSD / SUBR WVD endorsement status including the `requested_not_endorsed` state, locked decision 5); `get_master_coi(p_account_id, p_policy_ids)` as the canonical cell-based read model published as `src/types/master-coi.ts` (R21), including the SINGLE insurer-letter authority (canonical line order gl, auto, umbrella, wc, property, other; grouping by carrier_id else `normalize_entity_name(carrier)`; NAIC-conflict split; deterministic policy_number tiebreak; more than 6 distinct carriers is a hard readiness blocker, R7) and the readiness contract ({ready, blockers[], warnings[]}; blocker vocabulary no_lines, policy_core_missing, limit_missing, insurer_unresolved, policy_expired, insurer_overflow; `policy_expired` is a BLOCKER, near-expiry within 30 days is the only date warning, R6); `resolve_holder_endorsements(p_account_id, p_holder_id, p_policy_ids)` with the explicit per-table blanket/scheduled mapping (R2), specified by 02 but landing in Phase 4 (migration 20260702095000) because the RPC reads `public.additional_insureds`; `account_coi_profiles` (DOO default, default_remarks; workspace-scoped per Section 4.5), with 02's migration 20260702091500 patching `_do_account_merge`'s `v_safe_delete` allowlist for `account_coi_profiles` in this same phase, so the table is merge-safe from the moment it is created; the `additional_insured_id` COLUMNS (no FK) on all five AI/interest tables (R12); the umbrella endorsement-status backfill granting `endorsed` ONLY to `extraction_status='AUTO_APPLIED'` rows (R22c); all ADD CONSTRAINT statements wrapped in DO-block IF NOT EXISTS guards (R22b). UI: the Master COI panel as a new `<section id="master-coi">` in `CustomerDetail.tsx` following the existing stacked-panel convention (`SECTION_IDS` at `CustomerDetail.tsx:103-105`), consuming `src/types/master-coi.ts` directly, with the per-AI-row endorsement editor via `set_line_ai_endorsement` (R21, spec in 06-ui-surfaces.md). Pipeline: `buildAcord25FieldValues` + `validateAcord25` client modules per 05-acord25-pipeline.md, consuming get_master_coi output with the letter map as INPUT (no independent TS letter assigner, R7); used for the live preview only, never as a write path. NOTE (R1): there is NO generation path through `useAcordForms.updateFieldValues`; `acord_forms` rows appear in this module only as optional provenance (`source_form_id`) on issued certificates.
- Files touched: per 02-master-coi-data-layer.md; anchors are `src/pages/CustomerDetail.tsx`, new components under `src/components/`, new hooks under `src/hooks/`, `src/types/master-coi.ts`, migrations under `supabase/migrations/`.
- Migrations: the 02-master-coi-data-layer.md set except `20260702095000` (`resolve_holder_endorsements`), which lands in Phase 4; includes `20260702091500` (the `_do_account_merge` `v_safe_delete` allowlist patch for `account_coi_profiles`).
- Acceptance criteria: opening a customer shows the coverage picture (carrier, policy number, dates, limits, NAIC, insurer letters, per-line AI/waiver status) for both extraction-rich and manual-empty policies (bimodal data renders without errors, empty states are explicit); edits persist and are audited; the readiness indicator states whether an ACORD 25 can be generated and names each blocker per line, including `policy_expired`.
- Demo for Brian: open a real customer, see their Master COI with insurer letters assigned, correct one limit and one NAIC code, watch readiness flip to ready.

### Phase 4: Additional Insureds directory and dedup (Size: M)

- Implements: 03-additional-insureds-directory.md.
- Scope: `additional_insureds` table (workspace-scoped per Section 4.5), `search_additional_insureds` RPC cloning the ILIKE/trigram approach of `search_accounts` (`20260629250000_relgraph_v2_search_owned_rollup.sql:12-57`), `normalize_entity_name` reused as-is (`20260629190000_import_resolve_account.sql:28-42`), a dedicated suggestions table mirroring `account_relationship_suggestions`' shape, `duplicate_groups` reuse with `entity_type='additional_insureds'` plus a new reader RPC, a merge function cloning `_do_account_merge`'s FK-introspection shape, the Index/List page, and the typeahead add-drawer forked from `LinkAccountDrawer.tsx`. Also ships the ONE wire-up migration (sequenced after both the Phase 3 Master COI set and the directory-table migration) that ADDs the FK CONSTRAINTS `FOREIGN KEY (additional_insured_id) REFERENCES public.additional_insureds(id) ON DELETE SET NULL` to ALL FIVE tables: `policy_cgl_additional_insureds`, `policy_umbrella_additional_insureds`, `policy_bap_interests`, `policy_property_interests`, `policy_wc_subrogation_waivers` (constraint-add only, DO-block guarded for idempotency, R12, R22b). 02's migration `20260702095000` (`resolve_holder_endorsements`) also lands in this phase, sequenced after 03's `additional_insureds` table-create, because the RPC reads `public.additional_insureds`.
- Files touched: per 03-additional-insureds-directory.md.
- Migrations: that subsystem's set, 02's `20260702095000` (`resolve_holder_endorsements`), plus the wire-up migration.
- Acceptance criteria: creating "Enterprise Fleet Mgmt" when "Enterprise Fleet Management" exists surfaces a live duplicate warning before save; the directory page lists holders agency-wide; merging two holder records reparents references and leaves one survivor; all five AI/interest tables carry the FK constraint (verified via pg_constraint) so the merge engine's introspection discovers them; `resolve_holder_endorsements` returns holder-resolved status with a basis for a seeded blanket case, a scheduled-match case, and a no-match case.
- Demo for Brian: add the same fleet company twice with different spellings, get warned, merge the pair from the review queue.

### Phase 5: Certificate issuance flow (Size: L)

- Implements: 04-issuance-and-snapshots.md (authoritative), the generator surface from 06-ui-surfaces.md, and the Deno port from 05-acord25-pipeline.md.
- Scope, server side (R1): the `generate-certificate` edge function as the ONLY issuance path; it re-reads `get_master_coi` at issue time and returns 422 on ANY readiness blocker for the selected lines (R6); recomputes insurer letters from get_master_coi and 422s if the client-displayed letters mismatch (R7); resolves ADDL INSD / SUBR WVD per holder via `resolve_holder_endorsements` and applies downgrade-only print semantics (422 if the client requests Y on a non-endorsed line-holder pair, R2, R3); compares the request's `preview_sha256` against its own deterministic rebuild and returns 409 "data changed since preview, re-preview required" on mismatch (R9); fills the PDF server-side via the Deno port of `buildAcord25FieldValues` + `validateAcord25` + the field map + the `ACORD25_TEMPLATE_SHA256` pin in `supabase/functions/_shared/acord25/`, guarded by a parity-fixture test shared with the client build (05-acord25-pipeline.md); uploads to the private `coi-certificates` bucket (Section 4.4, R5); commits via service-role-only `finalize_certificate_issue` which calls `next_certificate_number` (sequential-per-year, D12), both with explicit `GRANT EXECUTE ... TO service_role` (R22a); inserts the `documents` pointer row with `document_type='coi'` and `storage_bucket='coi-certificates'`; writes `certificate_events`. Description/remarks overflow beyond ACORD 25 field capacity is a pre-generation validation error ("shorten by N characters"); NO addendum page on issued certificates (R16, D6).
- Scope, data layer (04): `public.certificates` (immutable snapshot: field_values per the R8 vocabulary, Record<string, string | boolean>, template id + version + sha, holder identity as printed, generated-file reference, `pdf_sha256`), `certificate_policies` (ON DELETE RESTRICT, line keys mapped from the canonical gl/auto/umbrella/wc/property/other enum, R7), `certificate_events`, status vocabulary CHECK ('issued','sent','voided','superseded') with no draft state (R11, R20); freeze trigger whose frozen list is exactly `certificate_number`, `snapshot`, `pdf_sha256`, `storage_bucket`, `storage_path`, `issued_at`, `issued_by`, plus legal status transitions; `account_id`, `holder_id`, and `agency_workspace_id` are reparentable navigation metadata and are NOT frozen (R4); authenticated users have SELECT only (workspace-scoped per Section 4.5), zero insert/update/delete grants; the `list_certificates` reader projects holder display name from the snapshot and issuer display name from profiles (R11); snapshot-replay round-trip test (store, reload, refill, extract, compare, R8).
- Scope, merge-engine reconciliation (R4, this phase, non-optional):
  1. The account-merge policy-dedup step inside `_do_account_merge` (`20260629240000_relgraph_v2_merge_consolidation.sql`) must skip any policy referenced by `certificate_policies` rows (the RESTRICT FK would otherwise abort the merge); shipped as a `CREATE OR REPLACE` migration in this phase's set. (The `account_coi_profiles` `v_safe_delete` allowlist entry is NOT part of this phase; it shipped in Phase 3 via 02's migration 20260702091500.)
  2. Merge acceptance tests: an account merge where the loser has issued certificates succeeds (certificates reparent to the survivor); a holder merge where the loser has issued certificates succeeds and reparents `holder_id`; unmerge works.
- Scope, UI (06): the `/certificates` surface replaces the scaffold at the same route, H1 "Certificates", generator as the primary mode (account picker when no `?accountId`), the single `CertificateIssuanceLog` component beneath the generator (full variant) and compact variant (limit 5) in the Master COI panel, one exported CERT_PILL map covering all four statuses (R17, R11); holder pick from the Phase 4 directory; per-line policy checkboxes from Master COI with expired lines disabled (R6); ADDL INSD / SUBR WVD toggles default ON when holder-resolved endorsed, user may turn OFF, locked otherwise, reset on holder change (R3); Description of operations and Remarks collected as TWO labeled fields seeded from the account default and `default_remarks` (R18); the RemarksField counter bound to the field map's softCharLimit constant (R16); live preview via client-side `fillAcordPdf` only; `useIssueCertificate` wraps `supabase.functions.invoke('generate-certificate')` with the request shape {account_id, holder_id, lines (policy ids + per_line print intent), description_of_operations, remarks, supersedes_certificate_id?, preview_sha256} and receives {certificate_id, certificate_number, signed_url} (R1); no draft state, rank-two action is ghost "Refresh preview" or nothing (R20); shared types imported from `src/types/certificates.ts` (R11). Fill-once-swap-holder reissue is a new server-side snapshot per holder (informed by `formCloning.ts`'s selective-preservation pattern before that file dies, D5).
- Scope, email: `send-coi-email` v2 per 04-issuance-and-snapshots.md (Section 2.3 of this doc: {certificate_id, to, cc?, note?}, requireAuth + is_staff() + is_agency_member(cert.agency_workspace_id), attachment-only from `coi-certificates`, stamps sent_at/sent_to and a `sent` event).
- Files touched: per 04, 05, and 06; plus `supabase/functions/generate-certificate/` (new), `supabase/functions/_shared/acord25/` (new), `supabase/functions/send-coi-email/index.ts`, `src/types/certificates.ts` (new). The four entry points need no re-edit; they were repointed to `/certificates` in Phase 1.
- Migrations: the 04-issuance-and-snapshots.md set (certificates, certificate_policies, certificate_events, numbering + finalize functions with grants, freeze trigger, `coi-certificates` bucket + storage policies, the merge-engine `CREATE OR REPLACE` for the certificate_policies-aware policy-dedup skip).
- Acceptance criteria: end-to-end issue works from customer record to downloaded PDF; the issued cert appears in Documents and opens via signed URL; editing the underlying policy afterward does NOT change the issued PDF or its snapshot; the server 422s on any readiness blocker including an expired selected line, on a client-requested Y for a non-endorsed line-holder pair, and on a letter mismatch; the server 409s when data changed after preview; reissuing to a second holder takes seconds and produces a distinct sequential-numbered cert; emailing an issued cert succeeds for staff and hard-fails (no URL fallback) if the attachment cannot be built; a `sent` cert renders correctly in `CertificateIssuanceLog` (CERT_PILL covers all four statuses); the snapshot-replay round-trip test passes; the three R4 merge tests pass; every issue/download/email lands in `certificate_events`.
- Demo for Brian: the full golden path: open customer, check Master COI readiness, issue a cert to a holder from the directory (watch the ADDL INSD toggle lock for a holder without an endorsement), email it, then change a policy limit and confirm the issued cert is untouched, then reissue the same cert to a different holder.

### Phase 6: Demolition, DB layer, and polish (Size: S)

- Implements: Section 2.4 of this doc.
- Scope: the Section 2.4 migration (drop `certificates_of_insurance`, `coi_templates`, `coi_audit_log`, their trigger/functions, both legacy buckets and their storage policies), preceded by the R13 pre-drop gate on `get_master_coi`; delete `src/lib/acord/formCloning.ts` (its pattern now mined); regenerate types; update CLAUDE.md (remove `pdf-generation-worker` as a described generation path, remove System B references, document the new module's golden path, tables, the `/certificates` route, and the `coi-certificates` bucket).
- Files touched: one migration, one file deletion, `src/integrations/supabase/types.ts` (regenerated), `CLAUDE.md`.
- Migrations: `202609XXXXXXXX_retire_system_b_coi.sql`.
- Acceptance criteria: migration applies cleanly against prod; a customer merge still succeeds (proving D9's guards hold); build green after type regeneration; repo-wide grep for `certificates_of_insurance` hits only historical migrations; the deployed `get_master_coi` function body (via `pg_get_functiondef`) contains no `certificates_of_insurance` reference (R13).
- Demo for Brian: run a customer merge on test data (works), show the schema no longer contains any System B object, and show CLAUDE.md describing the real system.

Relative sizes: Phase 0 S, Phase 1 S, Phase 2 M, Phase 3 L, Phase 4 M, Phase 5 L, Phase 6 S.

---

## 6. Feature-flag and rollout strategy

Recommendation: no feature flag; repoint-to-scaffold cutover (D11, R15). Validation:

- System B has never produced a certificate in production (0 rows, 0 stored objects). There are no users mid-workflow, no drafts to honor, no numbering continuity to preserve (the numbering was random anyway, `20251011003211_...sql:237`).
- The old page is not merely unused but hazardous: writes are RLS-blocked for effectively every account (2 `account_memberships` rows against 16,019 accounts), its output bucket is public, and its AI autofill violates the PII policy. Keeping it reachable during a transition window preserves risk, not value.
- A flag would have to gate FIVE dispersed entry points (four UI sites plus the palette destination) and would leave two "New Certificate" concepts alive simultaneously, which is precisely the un-reconciled state the handoff flags as the problem (handoff Section 3.1, "Implication").
- The scaffold avoids the alternative failure mode of a months-long affordance gap: users who look for a certificate button find one, and it lands on an honest, designed empty state instead of a 404 or a dead menu item.

The transition is structural rather than flag-based:

1. Phase 1 deletes the `/coi-generator` route and System B frontend and, in the same PR, repoints all four entry points to `/certificates`, which renders the designed scaffold (06-ui-surfaces.md) inside ProtectedRoute. The app never links to System B again, and there is no window without a certificate affordance.
2. Phases 2 through 4 keep `main` shippable with additive features only (`/acord-forms` can hand-produce a 25 from Phase 2 onward, which is already strictly more capability than System B ever delivered; the Master COI panel and holder directory arrive in Phases 3 and 4).
3. Phase 5 replaces the scaffold with the full generator at the same `/certificates` route. No entry point changes; the buttons users learned in Phase 1 simply start doing the real thing.
4. Phase 6 removes the last physical traces (schema, buckets) only after the new flow has issued real certificates.

Rollback story without a flag: each phase is a small PR set on `main`; reverting a phase is a git revert plus, for Phases 0/1/5/6, a down-style follow-up migration. Nothing in the plan mutates or deletes data that would make a revert lossy until Phase 6, which is deliberately last and gated on the new system being in real use.

---

## 7. Consolidated migration list (in order)

1. `202607XXXXXXXX_acord_tenancy_hardening.sql` (Phase 0): workspace column + backfill + trigger + policies for `acord_forms`; `deleted_at`; staff-only `acord_templates` writes; child-table policies. Full DDL in Section 4.2.
2. `202607XXXXXXXX_drop_acord_generation_jobs.sql` (Phase 1): one DROP TABLE.
3. Master COI `policies` extension set (Phase 3, owned by 02-master-coi-data-layer.md): typed limits, endorsement status columns, `account_coi_profiles` plus `20260702091500` (the `_do_account_merge` `v_safe_delete` allowlist patch for it), `additional_insured_id` columns (no FK, R12), `get_master_coi`, umbrella backfill restricted to AUTO_APPLIED (R22c). `resolve_holder_endorsements` (`20260702095000`) is NOT in this set; it moves to set 4 because it reads `public.additional_insureds`.
4. Additional Insureds set (Phase 4, owned by 03-additional-insureds-directory.md), including 02's `20260702095000` (`resolve_holder_endorsements`) sequenced after the `additional_insureds` table-create, and the five-table FK wire-up migration sequenced after set 3 (R12).
5. Issuance set (Phase 5, owned by 04-issuance-and-snapshots.md): `certificates` + `certificate_policies` (RESTRICT) + `certificate_events`, `next_certificate_number` + `finalize_certificate_issue` with explicit service_role grants (R22a), freeze trigger with the R4 frozen list, `coi-certificates` private bucket + storage policies, `list_certificates` reader, and the `CREATE OR REPLACE` of `_do_account_merge` adding the certificate_policies-aware policy-dedup skip (R4; the `account_coi_profiles` allowlist entry already shipped in Phase 3 via `20260702091500`).
6. `202609XXXXXXXX_retire_system_b_coi.sql` (Phase 6): full DDL in Section 2.4.

Cross-cutting migration rules: every ADD CONSTRAINT is wrapped in a DO-block IF NOT EXISTS guard (R22b); every new table follows the Section 4.5 workspace posture (R14); type regeneration checkpoints after sets 1, 2, each subsystem set, and 6.

---

## 8. Documentation updates owed

- `CLAUDE.md`: remove the claim that `pdf-generation-worker` is the ACORD generation path; remove `coi-pdfs`/`certificates` from any bucket lists after Phase 6; add the module's golden path (Master COI -> Additional Insureds directory -> `/certificates` generator -> `generate-certificate` -> immutable snapshot in `public.certificates` -> Documents tab) and the new tables; document the `coi-certificates` bucket; note `send-coi-email` v2's contract with a pointer at 04-issuance-and-snapshots.md.
- `docs/ACORD-IMPLEMENTATION-SPEC.md`: add a header note that Section 15 (queue-based generation) was never wired and its artifacts were removed in Phase 1; the doc remains as provenance.
- `docs/coi-module/`: these six files are the implementation source of truth; the handoff (`ACORD_COI_Module_Handoff.md`) is superseded where they disagree.

---

## 9. Risks

- The Phase 0 SELECT policy adds `is_staff()` and `is_agency_member()` to every `acord_forms` read; if any non-staff or service path legitimately reads these tables today it will break. Mitigation: both helpers are SECURITY DEFINER and already used app-wide; verify with a staging query as each role before merge. Service-role edge functions bypass RLS and are unaffected.
- The licensed blank ACORD 25 PDF is an external procurement dependency; acquisition starts in Phase 0 (R22d) precisely because it gates Phases 2, 3 (payload builder needs real field names), and 5. If licensing stalls, Phases 0 and 1 still ship in full.
- The public `documents` bucket (Section 4.4 flag) remains world-readable for working-copy PDFs until a separate hardening pass; this module reduces but does not eliminate that exposure. Issued certificates are unaffected (private `coi-certificates` bucket only).
- `~1156` pre-existing TypeScript errors (CLAUDE.md known debt) mean `npm run typecheck` is not a usable gate; phase gates rely on Vite build, lint, and Vitest instead, matching current repo practice.
- Deleting deployed edge functions (`generate-coi-data`, `pdf-generation-worker`) is a prod action outside git; if a rollback is ever needed the directories are recoverable from git history and redeployable in minutes.
- The client preview and the server rebuild share one deterministic builder (client TS and Deno port guarded by a parity-fixture test, 05-acord25-pipeline.md); if the fixtures drift from the shipped template, the R9 preview-hash check will surface it as user-visible 409s. Mitigation: the `ACORD25_TEMPLATE_SHA256` pin makes any template swap an explicit, test-breaking event.
