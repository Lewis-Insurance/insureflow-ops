# ACORD 25 (COI) Creation Flow - Build-State Handoff

**Date:** 2026-07-07
**Scope:** The specific goal of *creating Certificates of Insurance* as a three-part
flow: (1) capture client + policy info on the customer page, (2) a dedicated page
for tracking Additional Insureds, (3) a separate module to create the COIs.
**Bottom line:** All three pillars are **built and already wired to each other**.
The gap is not construction - it is that the flow has **never been run end to end
with real data** (0 certificates, 0 additional insureds in prod), and the
interactive email-send path was only unblocked on 2026-07-06. This doc says
exactly what exists, how it connects, and the short list to call it finished.

---

## The end-to-end flow (all of this exists today)

```
Customer record  ──►  Master COI panel  ──►  /certificates?accountId=X  ──►  Issue  ──►  Send
(CustomerDetail)     (MasterCOISection)      (Certificates.tsx)              (generate-    (send-
                                                                             certificate)  coi-email)
     │                      │                        │
     │ policies +           │ coverage-line          │ pick/create holder
     │ client data          │ limits (drawer         │ from Additional
     │ (AddPolicyModal,     │ or extraction)         │ Insureds directory
     │  CustomerContactInfo)│                        │ (HolderField)
     ▼                      ▼                        ▼
  accounts / policies   get_master_coi          additional_insureds
                        + save_master_coi_fields  (/additional-insureds)
```

Every arrow above is implemented. The customer panel links to the certificate
generator (`navigate('/certificates?accountId=' + accountId)`); the generator's
holder picker reads and can inline-create `additional_insureds`; issuance writes a
`certificates` row + a flattened PDF; send delivers it.

---

## Pillar 1 - Client + policy capture on the customer page

**Route:** `/customers/:id` -> `src/pages/CustomerDetail.tsx`
**Sections (always-visible panels, `SECTION_IDS`):** contact, policies, master-coi,
commercial, relationships, documents, notes, activity.

- **Client data:** `CustomerContactInfo` (name, goes-by, address, phone, email,
  TIN last-4, status). The account row is the identity spine.
- **Policies:** `CustomerPoliciesSection` + `AddPolicyModal`
  (`src/components/customers/AddPolicyModal.tsx`) - captures `line_of_business`,
  carrier, policy number, dates, premium. Document-upload extraction can prefill.
- **The COI panel itself:** `MasterCOISection`
  (`src/components/customers/MasterCOISection.tsx`) - the composition root. It owns
  the single `get_master_coi(account_id)` read (via `useMasterCoi`), renders the
  named-insured block, one coverage-line row per line (GL/Auto/WC/Property/
  Umbrella), the insurer table, certificate defaults, a readiness pill, and the
  review stamp. Its primary action navigates to the certificate generator.

**Where coverage limits come from** (the data a COI actually prints): each line's
`policies.*_details` JSONB blob, edited through the **CoverageLineDrawer**
(`src/components/master-coi/CoverageLineDrawer.tsx`) which writes via
`save_master_coi_fields(p_policy_id, p_updates)` against the whitelisted
`coi_field_registry` paths - OR filled automatically by the now-live extraction
pipeline (upload a policy -> details fill). This is the practical on-ramp: a COI
cannot print limits the line does not yet carry.

---

## Pillar 2 - Additional Insureds tracking page

**Route:** `/additional-insureds` -> `src/pages/AdditionalInsuredsPage.tsx`
(in the command palette as "Additional Insureds").

- **Table:** `additional_insureds` (id, name, address block, provenance,
  `merged_into_id`, soft delete).
- **Migrations:** `20260704000000_additional_insureds_directory` through
  `..._000700_additional_insureds_fk_wireup` - directory, resolve, dedup, merge,
  holder resolution, readers, FK wireup. A full identity-graph-lite for holders.
- **UI:** the page is search + list + status filters + row actions (edit, merge,
  delete) with dedup suggestions. `AdditionalInsuredDrawer`
  (`src/components/additional-insureds/AdditionalInsuredDrawer.tsx`) is the
  create/edit surface, reused inline by the certificate holder picker.
- **Hooks:** `useAdditionalInsuredsList`, `useAdditionalInsuredSearch`,
  `mergeAdditionalInsuredsManual`.

**Connection to COIs:** the certificate generator's `HolderField`
(`src/components/certificates/HolderField.tsx`) searches this directory, resolves
a full holder row (`holderUtils.fetchHolderById`), and offers **"Create new
holder"** which opens the same `AdditionalInsuredDrawer` in create mode - so an
empty directory is not a dead end; holders accrue as certificates are issued.

---

## Pillar 3 - The COI creation module

**Route:** `/certificates?accountId=X` -> `src/pages/Certificates.tsx`
(`CertificateGenerator`). Requires an `accountId` query param (arrives from the
customer panel; a bare `/certificates` shows a customer picker).

**The generator (left = inputs, right = live preview):**
- `PolicyLineSelector` - choose which of the account's lines print on this cert.
- `HolderField` - pick or inline-create the certificate holder.
- `OperationsAndRemarksFields` - description of operations, remarks.
- `CertificatePreview` (`useCertificatePreview`) - live server preview + a
  `previewSha256` the issue step pins against (no drift between preview and issue).
- `ValidationStrip` + `ComplianceStrip` - readiness blockers for the selected
  lines (canonical R6 vocabulary) and holder-requirement checks
  (`useHolderRequirements`, `evaluateHolderRequirements`,
  `useHolderEndorsementStatus`).
- **Issue** is gated on: no error-severity validation issues, a built preview
  hash, and resolved holder requirements. Blocked lines (missing required registry
  fields) cannot be issued until the drawer/extraction fills them.

**Issuance (server):** `useIssueCertificate` -> `supabase.functions.invoke(
'generate-certificate')`. The edge fn
(`supabase/functions/generate-certificate/index.ts`) rebuilds everything from DB
truth, byte-pins the licensed ACORD 25 blank (2016/03,
`acord-templates/25/2016-03/...`, sha `fded13...`), fills via `_shared/acord-fill`,
flattens, hashes, uploads to the private `coi-certificates` bucket, and writes a
`certificates` row transactionally (`finalize_certificate_issue`), with
compensating storage cleanup on failure. Supersede/revision chain supported.

**Supporting tables:** `certificates`, `certificate_policies`,
`certificate_number_counters`, `certificate_events`, `account_coi_profiles`,
`coi_field_registry`.

**History + reissue:** `CertificateIssuanceLog`, `useCertificates`,
`ReissueQueue` + `useCertificatesNeedingReissue` (flags certs whose underlying
policy data changed).

**Delivery:** `send-coi-email` (`supabase/functions/send-coi-email/index.ts`) -
Fence-approval-gated, attaches the PDF from the `coi-certificates` bucket, sends
via Resend, logs the send. The interactive (human-click) send path depends on the
`client_send_approvals` table - see the blocker below.

**The ACORD 25 engine** (`src/lib/acord/acord25/`, mirrored to
`supabase/functions/_shared/acord25/` by the port tooling): `fieldMap` (129
verified field names), `buildAcord25FieldValues`, `validateAcord25`,
`fromMasterCoi` (read-model -> form input), `requirements`, `previewHash`. This is
the mature template every commercial form engine was later cloned from.

---

## Live data reality (verified prod, 2026-07-07)

| Fact | Value | Meaning |
|---|---|---|
| Certificates issued | **0** | The golden path has never run with real data |
| Additional insureds | **0** | Directory empty; holders will accrue on first use |
| ACORD 25 template | 2016/03, current | Licensed blank onboarded and byte-pinned |
| Accounts with any line data | 1686* | *counts non-null blobs; readiness is content-based per the registry, so far fewer are actually COI-ready |

The module is code-complete and audit-hardened (COI Phases 0-6 + follow-ons, PRs
merged). What it has not had is a single real issuance.

---

## What is left to call this "finished" (prioritized)

1. **Run one real end-to-end COI issuance and fix whatever real data surfaces.**
   Pick (or fill) a commercial account with GL limits, open its Master COI panel,
   go to the generator, select the GL line, create a holder, confirm the preview,
   **Issue**, verify the `certificates` row + the flattened PDF in the
   `coi-certificates` bucket, then **Send** to a test inbox. This is the same
   proof method used for the submission packet; it is the single highest-value
   remaining step and will expose any data-shape or readiness friction.

2. **Land the shared Fence fix (blocks interactive send).** The
   `client_send_approvals` table (the interactive-approval store the COI send
   consumes) did not exist in prod until 2026-07-06 and was created without a
   `surface` CHECK, while an unapplied repo migration
   (`20260630040000_client_send_approvals.sql`) defines that CHECK **without**
   the newer surfaces. On a fresh database, interactive `send-coi-email` (and
   `send-submission-packet`) would fail the CHECK. Reconcile the migration to
   include all current surfaces and apply it. (This is one of the two open
   findings on PR #74, currently paused.)

3. **Confirm the data-entry loop is smooth.** The practical blocker to a clean COI
   is required-field readiness per line (GL: each-occurrence + general-aggregate;
   WC: the three EL limits; etc.). Verify that the customer-page path -
   CoverageLineDrawer OR upload-extraction - reliably fills those, and that the
   generator's blocker messages tell the user exactly what is missing.

4. **Exercise Additional Insureds at scale-of-one.** Create a holder inline during
   issuance, then confirm it appears in `/additional-insureds`, and that
   edit/merge/dedup behave on a real row (they have unit tests but no real-data
   run).

5. **IA / discoverability.** The three pages are reachable (customer panel link;
   command palette entries for Certificates and Additional Insureds) but are not
   primary rail items. Confirm that matches the intended navigation, or promote
   them.

### Not blockers (already handled)
- ACORD 25 template onboarding, byte-pin, engine, validation, preview-hash.
- Certificate numbering, supersede/revision, reissue detection.
- Holder inline-create from the generator.
- Email provider (RESEND_API_KEY is set; delivery proven for the submission packet
  through the same Resend path).

---

## Fastest path to "done"
Do step 1 (a real issuance) first - it is a ~30-minute live E2E that either proves
the whole flow green or hands you the exact, real gaps in priority order. Step 2
(the Fence migration) is required before the *send* half of that E2E works on any
fresh environment. Steps 3-5 are polish that the step-1 run will scope precisely.
