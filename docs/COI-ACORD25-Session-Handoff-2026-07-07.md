# COI / ACORD 25 - Session Handoff (2026-07-07)

**Branch:** `claude/cool-dubinsky-fadf27` (merged to `main` this session)
**Commits (this session):** `40d22cd` -> `079cbf2` -> `19d1554` -> `b3ba82c` (+ this handoff)
**Prod status:** DB migration applied, `generate-certificate` edge fn deployed **v11** (`verify_jwt=true`), frontend merged to main (Netlify auto-deploys).

---

## Bottom line

The goal is **creating ACORD 25 Certificates of Insurance** end to end. This session took it from "the commercial policy page crashes" to "policy data + custom coverages route into a real, byte-pinned ACORD 25, one certificate per holder." The generate golden path is fully wired and now **feeds custom coverages**. The ONE remaining requested feature is **multi-holder issuance** (select multiple additional insureds -> a zip of COIs). Nothing has yet been run **end to end with real data** (0 certs, 0 additional insureds in prod) - a real first issuance is the highest-value next test.

---

## What shipped this session

1. **Fixed the policy-page crash (was blocking all commercial testing).** Six commercial detail views (`CGL/Property/Umbrella/BAP/WC/EO`) guarded only `if (!details)`; the book's `*_details` blobs are empty `{}` (truthy), so they crashed on the first field read -> the page error boundary. Fix: guard `{}` as empty; each detail section wrapped in a component `ErrorBoundary`. (`40d22cd`)

2. **Master COI split.** The heavy 428-LOC panel on the customer record became a compact `MasterCOISummaryCard` (readiness, named insured, lines-ready, carriers, last reviewed) with **Open full Master COI** -> new page `/master-coi/:accountId` (reuses `MasterCOISection` verbatim). (`40d22cd`)

3. **CRM nav.** `Additional Insureds` (above Contacts) and `Generate COI` moved into the CRM sidebar group; stale command-palette dupes dropped. (`40d22cd`)

4. **Editable ACORD-25 coverage panel** replaces the dead-end "No <line> details available" detail views on the policy page. `src/components/policies/PolicyCoveragePanel.tsx` + `policyCoverageFields.ts`: view-by-default with an **Edit** toggle, all coverage fields per line, **exact ACORD 25 (2016/03) wording** (`EACH OCCURRENCE`, `DAMAGE TO RENTED PREMISES (Ea occurrence)`, `E.L. DISEASE - EA EMPLOYEE`, ...). Read-only context strip (carrier/NAIC/policy#/dates). Writes ONLY via `save_master_coi_fields` (the source of truth `get_master_coi` reads), so edits reach the certificate. "Fill from document" reuses the existing `pendingExtractLine` extraction. (`079cbf2`, `19d1554`)

5. **Manual Details reworked -> inline Add-coverage.** Removed the old Manual Details button + modal (it wrote `policies.coverage.*`, which the COI never reads). Replaced by an **Add** button under the last coverage of each line: a simple name + amount dialog writing to a new table `public.policy_additional_coverages` (RLS staff + `is_agency_member` via policy->account->workspace). Hook `usePolicyAdditionalCoverages`. (`19d1554`)

6. **Custom coverages now PRINT on the generated ACORD 25.** (`b3ba82c`) See the dedicated section below - this was the big one.

---

## Custom coverages -> ACORD 25 (how it works now)

**Key discovery:** the licensed ACORD 25 template **has per-section write-in fields** that the code's `src/lib/acord/acord25/fieldMap.ts` had OMITTED. The truth source is the DB column `acord_templates.field_inventory` (129 fields, each `{name, page, rect{x,y,w,h}, type, maxLength}`). The write-in fields:

| Line | Name field | Limit field |
|---|---|---|
| GL | `GeneralLiability_OtherCoverageLimitDescription_A` | `GeneralLiability_OtherCoverageLimitAmount_A` |
| Auto | `Vehicle_OtherCoverage_CoverageDescription_A` | `Vehicle_OtherCoverage_LimitAmount_A` |
| Umbrella | `ExcessUmbrella_OtherCoverageDescription_A` | `ExcessUmbrella_OtherCoverageLimitAmount_A` |

These are **per-section** rows, DISTINCT from the single whole-policy `OtherPolicy_*` row that the Property line uses (no `OTHER_ROW_CONFLICT`). WC and Property have no native amount-bearing write-in.

**Wiring (dual-ported `src/lib/acord/acord25/*` + `supabase/functions/_shared/acord25/*`):**
- `toAcord25BuildInput` gained `additionalCoverages: { line, name, amount }[]`. For each **printed** gl/auto/umbrella line, the **FIRST** row fills its native slot; extras (2nd+ per line, and ALL wc/property) spill into **Description of Operations** (`"{Line label} - {name}: ${amount}"`), deterministically in input order.
- `generate-certificate/index.ts`: reads `policy_additional_coverages` for the selected `(line, policy)` pairs (ordered by `created_at`) and passes `additionalCoverages` into the fill.
- `src/pages/Certificates.tsx`: the client preview fetches the **identical** rows (same order + `(line, policy)` filter) and passes the same array - so the **preview-hash (R9)** matches the server at issue.
- 757 tests pass (incl. a pdf-lib round-trip filling + reading back the 6 new fields). Deno port verified in sync via `scripts/acord25/check-deno-port-sync.ts`.

**LESSON:** `fieldMap.ts` is a curated subset. Before concluding a form field is missing, query `acord_templates.field_inventory` (name + rect) for that form/version.

---

## NEXT: multi-holder issuance (the last requested feature)

**User directive:** "select one singular, or multiple additional insureds. If one is selected, produce a single COI; if multiple, produce a folder (zip) with all COIs inside." Separate PDF per holder, never merged (also in the original vision doc).

**Current state:** single-holder only. `HolderField` (`src/components/certificates/HolderField.tsx`) is single-select (`value: SelectedHolder | null`); `Certificates.tsx` `doIssue` (~line 653) sends one `holder_id` and calls `issueMutation.mutateAsync(body)` once; there is **no zip lib** in `package.json`.

**Plan:**
1. **Multi-select holders.** Change the generator's holder state from a single `holder` to `holders: SelectedHolder[]` (reducer in `Certificates.tsx` ~line 76/137-149). Either extend `HolderField` to a list (add/remove chips) or keep it as an "add one" control feeding a list rendered above it. Inline-create still works.
2. **Shared inputs.** Lines, remarks, description of operations, and custom coverages are identical across holders (policy/account data). Only the holder box + per-line ADDL INSD/SUBR WVD differ.
3. **Per-holder endorsements (the subtlety).** ADDL INSD / SUBR WVD is holder-specific and the server enforces **downgrade-only** (printing `Y` on a non-endorsed line -> 422 `ENDORSEMENT_NOT_PERMITTED`). So in a batch you CANNOT hand-toggle per holder. At issue, for EACH holder resolve its endorsements (`resolve_holder_endorsements` / `useHolderEndorsementStatus` / the `endorsementByLine` computation) and set intents to the **safe default** (Y only where that holder is endorsed). This makes every cert correct for its own holder and never 422s on intent.
4. **Issue loop.** For each selected holder: build the body with that holder's `holder_id` + per-holder-resolved `printIntents`, call `generate-certificate`. Collect each result's PDF (the response returns a `signed_url` + `document_id`). 1 holder -> open the PDF as today. Multiple -> fetch all PDFs and download a single **zip** (add `jszip`; `file-saver` optional or use a Blob + anchor). Each cert remains its own `certificates` + `certificate_policies` + `documents` row (never merged).
5. **Preview.** The preview is inherently per-holder (the holder affects the Certificate Holder box + endorsement resolution). Simplest: preview the **first** selected holder and show "N holders selected" so the user knows the batch count. (Full per-holder preview is a nice-to-have, not required.)
6. **Gotchas:** the preview-hash gate means each per-holder issue rebuilds server-side from DB truth - fine, each holder is a separate issue call with its own preview/hash cycle (or skip the client preview-hash for batch and let the server recompute; check `useIssueCertificate` + the `preview_sha256` handling before deciding). Re-verify the endorsement-intent default path so a batch never trips the 422.

**Files:** `src/pages/Certificates.tsx` (state, doIssue loop, zip), `src/components/certificates/HolderField.tsx` (multi-select), `src/hooks/useIssueCertificate.ts` (per-call), `src/hooks/useHolderEndorsementStatus.ts` (per-holder resolve). No DB or edge-fn change expected (the edge fn already issues one cert per call; the loop is client-side). Add `jszip` to deps.

---

## Golden-path status + how to test a first real COI

The generate flow is fully wired: `Certificates.tsx` (`/certificates?accountId=X`) -> `generate-certificate` -> fills the byte-pinned ACORD 25 (`25/2016-03`, sha `fded13...`) -> uploads to the private `coi-certificates` bucket -> `finalize_certificate_issue` writes `certificates` + `certificate_policies` + `certificate_events` + a **`documents`** row (`document_type='coi'`, so it shows in the customer's Documents) - all transactional. Holder box + ADDL INSD/SUBR WVD are correct; holder-requirement checks are **advisory** (won't block).

**To prove it end to end (highest-value next step):**
1. Open a commercial account with a GL policy (e.g. **Donald Roberts Masonry Llc**, account `979f1c4f-c04b-4538-a997-ddd7b6f286da`, GL policy `051927a2-...`).
2. On the policy page, **Edit COI details** -> enter GL each-occurrence + general-aggregate (both `required_for_ready`), Save. Optionally **Add** a custom coverage (e.g. "Hired/Non-Owned Auto", 1,000,000).
3. Go to **Generate COI** (`/certificates?accountId=...`), select the GL line, create/pick an additional insured (holder), confirm the preview, **Issue**.
4. Verify: a `certificates` row + a flattened PDF in `coi-certificates` + a `documents` row on the customer; the custom coverage prints in the GL write-in row; then **Send** to a test inbox (`send-coi-email`).

**Prod facts (verified this session):**
- `master_coi_lines(policy)` classifies `line_canonical='General Liability'` as `['gl']` even with an empty `{}` blob (falls through to the label crosswalk), so the GL line is present with editable, null-valued limit cells.
- `get_master_coi` is staff-gated (RAISEs `42501` for the service-role MCP caller); probe with plain helpers like `master_coi_lines(p.*)`.
- Book: 2,187 live policies, only **55 commercial**; coverage-limit content is empty across the board (blobs default to `{}`), so almost nothing is COI-ready until entered/extracted (extraction is live). Only place COIs can currently be generated for is a commercial account with limits entered.
- `RESEND_API_KEY` is set (COI email works via the same Resend path proven for the submission packet).

---

## Known gaps / deferred (not blockers)

- **Multi-holder** (above) - the last requested feature.
- **Snapshot structured freeze:** custom coverages are frozen into `snapshot.field_values` (they're embedded in the filled fields + DOO), but the structured `{line,name,amount}` rows are NOT separately added to `buildSnapshot`. Optional for legal reconstructability; the reissue path (`snap.lines`) also won't re-print custom coverages unless it re-reads the live table.
- **DOO overflow:** Description of Operations has a ~640-char soft limit shared with remarks; heavy write-in spill can 422 `OVERFLOW` (names ACORD 101). ACORD 101 continuation is the long-term home for large lists.
- **Multi-policy-same-line edge:** the coverage panel and cert flow are account-scoped (`useMasterCoi(accountId)`, save to the viewed `policyId`); correct for the ~1-commercial-policy-per-account book, mismatch only if an account has 2+ policies on one line.
- **`get_master_coi` producer block:** prints blank if the workspace has no producer profile (quality gap, not a blocker).
- **Dead ACORD scaffolding:** the old `/acord-forms` working-copy editor + `acord_forms`/`acord_templates` tables still exist (lightly used). Legacy `/coi-generator` (System B) was already deleted.

---

## Repo map (COI / ACORD 25)

- **Coverage panel:** `src/components/policies/PolicyCoveragePanel.tsx`, `policyCoverageFields.ts`, hook `src/hooks/usePolicyAdditionalCoverages.ts`
- **Master COI:** `src/components/customers/MasterCOISection.tsx` (full), `MasterCOISummaryCard.tsx` (compact), `src/pages/MasterCOIPage.tsx`, drawer `src/components/master-coi/CoverageLineDrawer.tsx`, types `src/types/master-coi.ts`, hook `src/hooks/useMasterCoi.ts`
- **Generator:** `src/pages/Certificates.tsx`, `src/components/certificates/*`, `src/hooks/useIssueCertificate.ts` / `useCertificatePreview.ts` / `useHolderEndorsementStatus.ts`
- **ACORD 25 engine (DUAL-PORTED):** `src/lib/acord/acord25/*` mirrored to `supabase/functions/_shared/acord25/*`; sync via `npx tsx scripts/acord25/sync-deno-port.ts` then `check-deno-port-sync.ts` (must print "in sync")
- **Edge fns:** `generate-certificate` (issuance, v11), `send-coi-email` (delivery)
- **Tables:** `certificates`, `certificate_policies`, `certificate_events`, `certificate_number_counters`, `account_coi_profiles`, `coi_field_registry` (29 rows), `additional_insureds`, `policy_additional_coverages` (new), `policy_*_additional_insureds`
- **Template truth:** `acord_templates` (form 25, version 2016-03) - `field_inventory` is the real PDF field list
