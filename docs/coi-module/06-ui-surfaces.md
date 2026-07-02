# 06: UI Surfaces for the Master COI / ACORD 25 Module (FINAL)

Area: Master COI panel on the customer record, the Certificates page (Document Production archetype: generator plus issuance log), and all entry-point wiring including retirement of the legacy /coi-generator route.

Status: FINAL, implementation-ready. This revision applies the binding orchestrator resolutions R1, R2, R3, R5, R6, R7, R9, R11, R15, R16, R17, R18, R19, R20, R21, and R22(e). Where this doc consumes another subsystem, it cites the sibling FINAL doc in docs/coi-module/: 01-disposition-and-roadmap.md, 02-master-coi-data-layer.md, 03-additional-insureds-directory.md, 04-issuance-and-snapshots.md, 05-acord25-pipeline.md.

All claims about existing code cite file:line. Where ground truth corrected the planning handoff, ground truth wins (notably: XFA rejection is dead code and not a blocker; System B has zero prod rows; and, corrected in this revision, the `documents` storage bucket is PUBLIC per migration 20251028214559, which is why issued PDFs live in the private `coi-certificates` bucket per R5).

---

## 0. Design summary (the choices, up front)

| Decision | Choice |
|---|---|
| Master COI edit affordance | Read-only dense rows in the panel; ALL editing in a per-line right-anchored drawer (CoverageLineDrawer). No inline editing in rows. Endorsements are edited as a PER-AI-ROW list inside the drawer via `set_line_ai_endorsement` (R21), never as a line-level control. |
| Generation surface | A full page at route `/certificates` (R19), H1 "Certificates". Generator is the primary mode; account picker when no `?accountId`; issuance log beneath. Not a drawer, not nested under /customers/:id, no creation-named route. |
| Issuance path | Server-side only (R1). `useIssueCertificate` invokes the `generate-certificate` edge function with ids, selections, per-line print intent, description of operations, remarks, and `preview_sha256`. The client NEVER sends pdfBytes and NEVER performs storage uploads, documents inserts, or certificate inserts. Client-side `fillAcordPdf` is preview-only. |
| E&O guard on ADDL INSD / SUBR WVD | Both the UI gate and the server call the same `resolve_holder_endorsements` RPC (R2, owned by 02-master-coi-data-layer.md). Toggles default ON when the (line, holder) pair resolves endorsed, may be turned OFF (downgrade only), and are disabled locked-N otherwise; they reset on holder change (R3). The server 422s any request asking for Y on a non-endorsed pair, so the gate and the printed Y/N can never disagree. |
| Live preview mechanics | Client-side debounced re-fill via the existing `fillAcordPdf` (src/lib/acord/pdfFiller.ts:38), flatten true, rendered in an `<iframe>` from a blob URL. No new PDF-viewer dependency. A masking pass runs before every preview fill. Insurer letters come from `get_master_coi`; the client never assigns letters (R7). |
| Preview-issue integrity | The Generate request carries `preview_sha256` of the previewed deterministic build; the server 409s on mismatch and the page runs a designed re-preview flow (R9). |
| Issued-cert history placement | ONE component: `CertificateIssuanceLog` (owned by 04-issuance-and-snapshots.md). Full variant beneath the generator on /certificates; compact variant (limit 5) at the bottom of the Master COI panel (R17). This doc ships no parallel log component. |
| Remarks overflow | Hard pre-generation block, no addendum page (R16). The counter binds to the fieldMap `softCharLimit` constant and over-limit copy reads "shorten by N characters". ACORD 101 is a noted future enhancement. |
| Drafts | Cut from v1 (R20). No draft hooks, no `?draft=` param. The generator's rank-two action is a ghost "Refresh preview". |
| Legacy System B | Phase 1 is repoint-to-scaffold (R15, adopted by 01-disposition-and-roadmap.md): all four entry points repointed to `/certificates`, the `/coi-generator` route deleted, AND the System B frontend files deleted, all in this module's first PR per 01's Phase 1 single edit list (no separate cleanup PR); the `certificates_of_insurance` table is left in place for 01's demolition phases. |
| Lime budget | Master COI panel: zero lime (hero owns it). Certificates page: exactly one lime = Generate. Drawers (their own overlay surfaces): exactly one primary each = Save. |

---

## 1. Binding placement and design-system facts this design builds on

- Customer record sections are always-visible `<section id>` blocks; `SECTION_IDS = ['contact','policies','relationships','documents','notes','activity']` at src/pages/CustomerDetail.tsx:105, used only to validate legacy `?tab=` deep links (CustomerDetail.tsx:103-104). DOM order controls layout; the policies section closes at CustomerDetail.tsx:473 and documents opens at :476.
- The hero overflow menu holds "New certificate" at CustomerDetail.tsx:429-431 (navigates to `/coi-generator?accountId=`) and "Add policy" at :432-434.
- PolicyDetail has two more legacy entry points: a header "New Certificate" button (src/pages/PolicyDetail.tsx:208-215, navigate at :210) and a "Generate Certificate" quick action (:499-506, navigate at :502). The command palette reaches `/coi-generator` via `EXTRA_DESTINATIONS` at src/components/layout/chrome/navConfig.ts:132.
- The `/coi-generator` route is wired at src/App.tsx:678-685 with lazy import at src/App.tsx:59, and (unlike `/customers/:id` at App.tsx:256-265) is NOT wrapped in `ProtectedRoute`.
- cc primitives available: `StatusPill` with `override` prop (src/components/cc/StatusPill.tsx:72-80), `Chip` (src/components/cc/Chip.tsx:8-25), `DateField` with ISO in/out contract (src/components/cc/DateField.tsx:58-72), `SectionLabel`, `Skeleton`/`SkeletonRow`, `TriageTile` (src/components/cc/TriageTile.tsx:21-28), `AccentSpine`, mask helpers (src/components/cc/mask.ts).
- Policy row precedent to match: CustomerPoliciesSection renders line label + `StatusPill`, mono cc-num policy number, carrier `Chip`, cc-num dates, premium anchor (src/components/customers/CustomerPoliciesSection.tsx:138-196), with cards intentionally not clickable so text stays selectable (:123-127 comment).
- Storage facts (corrected): the `documents` bucket is PUBLIC and any-authenticated-writable per supabase/migrations/20251028214559 (sets public=true, adds an unrestricted SELECT policy and authenticated UPDATE/DELETE policies). Issued certificate PDFs therefore NEVER touch the documents bucket. They are uploaded server-side by `generate-certificate` to the private `coi-certificates` bucket at path `{account_id}/{certificate_id}/{certificate_number}.pdf` (R5; bucket, policies, and pointer-row contract owned by 04-issuance-and-snapshots.md). The convenience `documents` pointer row sets `storage_bucket = 'coi-certificates'`; useDocumentManager resolves `doc.storage_bucket` first, so the Documents tab View/Download works unchanged via signed URLs. The broken precedent in src/hooks/useAcordForms.ts:322-345 (acord-forms/ path prefix, getPublicUrl, no documents row) must not be copied by anything in this doc, and this doc performs no uploads at all (R1).
- Fill engine surface available today: `fillAcordPdf(templateBytes, { fieldValues, flatten, updateAppearances })` (src/lib/acord/pdfFiller.ts:38-51). Text silently truncates to field maxLength during fill (pdfFiller.ts:180-183), which is why overflow is a hard pre-generation validation error, never a silent truncation (R16).
- No PDF.js/react-pdf viewer dependency exists; `pdf-lib` 1.17.1 and `jspdf` are the only fill/generation libs (package.json:53,67,70).
- Both themes are live (light/dark/system toggle; App.tsx ThemeProvider without forcedTheme). Every new surface uses cc-* tokens only and must pass in both themes. The acceptance-checklist line "dark-only" is stale and is the ONLY checklist line waived.
- No em or en dashes anywhere in interface copy or this doc (design-system/constitution.md:59; R22e).

---

## 2. Interface contracts consumed from sibling FINAL docs

These are the exact hook/type shapes this UI codes against. They are owned by the sibling docs named below; this doc consumes them and never re-specifies their internals. Types are imported, never redeclared.

### 2.1 Master COI read model (owned by 02-master-coi-data-layer.md)

The single canonical contract is the cell-based `get_master_coi(p_account_id uuid, p_policy_ids uuid[] default null)` JSONB document, mirrored one to one in `src/types/master-coi.ts` (R21): `MasterCOI`, `COICell<T>`, `COIInsurer`, `COILineGL | COILineAuto | COILineUmbrella | COILineWC | COILineProperty`, `COIAdditionalInsuredRow`, `COIWCSubroWaiverRow`, `COIReadiness`, `COIProducerSettings`, `AccountCOIProfile`. This UI consumes it DIRECTLY; there is no client-side adapter type and no parallel `MasterCOIView`.

Properties of the contract this UI depends on (full spec in 02):

- Every scalar is a cell `{ v, src, path, conf?, updated_at?, updated_by?, flag? }`. The `src` vocabulary contains no `legacy` value (R13); cells render provenance as small text labels (`extracted`, `manual`, `account`, `workspace`, `reference`), and `src: 'missing'` is the explicit empty state that doubles as the edit affordance.
- `lines` is an object keyed by the canonical line keys `gl`, `auto`, `umbrella`, `wc`, `property`, plus `other[]` for unclassified policies (R7). Absent lines return a full skeleton with `present: false` so the panel renders a stable grid. Display names come from the ONE published mapping table in 02 (gl = Commercial General Liability, auto = Automobile Liability, umbrella = Umbrella/Excess Liability, wc = Workers Compensation and Employers Liability, property = printed in the ACORD 25 OTHER row, other = unclassified).
- Endorsements are PER-AI-ROW: each line carries `additional_insureds[]` (`COIAdditionalInsuredRow`: id, name, additional_insured_id, ai_type flags, `endorsement_status: 'none' | 'requested' | 'endorsed'`, endorsement_form, confirmed_at/by) and `wc` carries `subrogation_waivers[]` (`COIWCSubroWaiverRow` with `waiver_scope: 'blanket' | ...`). There is NO line-level endorsement state field (R21).
- `insurers[]` is the AUTHORITATIVE letter assignment, computed once in SQL inside `get_master_coi` (R7): `{ letter, name cell, naic cell, carrier_id, resolution, lines[], policy_ids[] }`, plus `insurer_overflow[]` whose non-emptiness is a readiness blocker.
- `readiness` is `{ ready: boolean, blockers: [{ code, line?, path?, message }], warnings: [...] }`. The canonical blocker vocabulary is defined ONCE in 02 and cited here verbatim (R6): `no_lines`, `policy_core_missing`, `limit_missing`, `insurer_unresolved`, `insurer_overflow`, `policy_expired`. Warnings include `naic_missing`, `endorsement_requested`, `manual_overwritten`, `named_insured_mismatch`, `ops_missing`, `review_stale`, `unclassified_policies`.
- `description_of_operations` is a cell-plus-candidates block (prefill candidates from `canopy` and `bap_risk_context` only; no legacy tier, R13). `review` carries `{ last_reviewed_at, last_reviewed_by, stale }`.
- `producer` cells feed the ACORD 25 producer block; the UI renders them read-only in preview and never edits them here (settings form is a small admin surface owned by 02's producer section).

### 2.2 Master COI hooks and mutations (owned by 02-master-coi-data-layer.md)

```ts
// src/hooks/useMasterCOI.ts (02's file; consumed here)
export function useMasterCOI(accountId: string | undefined, policyIds?: string[]):
  UseQueryResult<MasterCOI>;
// queryKey ['master-coi', accountId, policyIds ?? null]

export function useSaveMasterCOIFields(): UseMutationResult<...>;
// ({ policyId, updates: Record<registryPath, unknown> }) -> rpc save_master_coi_fields
// invalidates ['master-coi', accountId] and ['policies']

export function useSetEndorsementStatus(): UseMutationResult<...>;
// ({ line: 'gl'|'umbrella'|'auto'|'property'|'wc'; rowId; status: 'none'|'requested'|'endorsed';
//    endorsementForm?; effectiveDate? }) -> rpc set_line_ai_endorsement
// invalidates ['master-coi', accountId]

export function useAccountCOIProfile(accountId: string | undefined): UseQueryResult<AccountCOIProfile>;
export function useSaveAccountCOIProfile(): UseMutationResult<...>;  // upsert account_coi_profiles
export function useMarkMasterCOIReviewed(): UseMutationResult<...>;  // rpc mark_master_coi_reviewed
```

`set_line_ai_endorsement` enforces at the database boundary that `endorsed` requires an endorsement form reference or document evidence (02 Section 4.5); the drawer mirrors the same rule client-side for a designed error instead of a raw RPC failure. AI row creation and name/address edits stay on the existing direct-table paths per 02; only status transitions are RPC-gated.

### 2.3 Holder-scoped endorsement resolution (owned by 02-master-coi-data-layer.md, per R2)

```ts
// src/hooks/useHolderEndorsementStatus.ts (thin wrapper over the RPC; lives with this UI's hooks)
export function useHolderEndorsementStatus(args: {
  accountId: string | null;
  holderId: string | null;
  policyIds: string[];
}): UseQueryResult<Record<LineKey /* 'gl'|'auto'|'umbrella'|'wc'|'property' */, {
  addl_insd_resolved: 'endorsed' | 'requested' | 'none';
  subr_wvd_resolved: 'endorsed' | 'requested' | 'none';
  basis: string;   // human-readable resolution basis, e.g. 'blanket CG 20 10' or 'scheduled: matched by directory id'
}>>;
// Wraps supabase.rpc('resolve_holder_endorsements', { p_account_id, p_holder_id, p_policy_ids }).
// Query key: ['endorsement-status', accountId, holderId, ...policyIds sorted].
// Enabled only when accountId, holderId, and policyIds.length are all truthy.
```

The rule (owned and fully specified in 02, including the per-table ai_type-to-blanket/scheduled mapping): a line resolves `endorsed` for a holder ONLY when an AI row with `endorsement_status = 'endorsed'` is blanket-scoped OR matches the holder by `additional_insured_id` or by `normalize_entity_name(name)`. BOTH this hook and `generate-certificate` call the same RPC (R2), so the toggle gate and the printed Y/N can never disagree.

### 2.4 Issued certificates (owned by 04-issuance-and-snapshots.md)

All types import from `src/types/certificates.ts` (R11): `CertificateStatus = 'issued' | 'sent' | 'voided' | 'superseded'`, `CertificateRecord`, `CertificateSnapshot`, `CertificateEvent`, `CertificateEventAction`, and `CertificateListItem` (the row shape returned by 04's `list_certificates` reader; it carries NO snapshot member). The status vocabulary is draftless and this UI handles all four statuses.

```ts
// src/hooks/useCertificates.ts (04's file; consumed here)
export function useCertificates(accountId: string): {
  certificates: CertificateListItem[]; // via the list_certificates reader (R11): projects holder
                                       // display name from snapshot and issuer name from profiles;
                                       // NO snapshot member on the row; the UI never reads raw
                                       // table rows
  isLoading: boolean;
  refetch: () => Promise<void>;
  downloadCertificate: (cert: CertificateListItem) => Promise<void>; // signed URL from the private
                                                                    // coi-certificates bucket, 3600s;
                                                                    // verifies pdf_sha256 against the
                                                                    // fetched bytes (R5); logs 'downloaded'
  previewCertificate: (cert: CertificateListItem) => Promise<void>;
  voidCertificate: (id: string, reason: string) => Promise<boolean>;   // rpc void_certificate
  restoreDocument: (id: string) => Promise<boolean>;                   // rpc restore_certificate_document
  fetchEvents: (certificateId: string) => Promise<CertificateEvent[]>;
};
// Query keys: ['certificates', accountId], ['certificate-events', certificateId].
```

Issuance (R1): the ONLY issuance path is the `generate-certificate` edge function. It rebuilds everything from DB truth server-side (re-reads `get_master_coi`, calls `resolve_holder_endorsements`, enforces readiness per R6, recomputes letters per R7), fills the PDF with the Deno port from 05, uploads to `coi-certificates`, and commits via the service-role-only `finalize_certificate_issue`. Authenticated users have zero insert/update/delete grants on `public.certificates`.

```ts
// src/hooks/useIssueCertificate.ts (thin invoke wrapper; lives with this UI's hooks)
// Request/response interfaces are defined in src/types/certificates.ts (04 owns them); shape:
export function useIssueCertificate(): UseMutationResult<
  { certificate_id: string; certificate_number: string; document_id: string;
    signed_url: string; warnings: string[] },
  Error,
  {
    account_id: string;
    holder_id: string;
    lines: Array<{
      policy_id: string;
      line_key: 'gl' | 'auto' | 'umbrella' | 'wc' | 'property' | 'other';
      insurer_letter: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';  // as displayed; server recomputes and
                                                          // 422s on mismatch (R7 cross-check only)
      per_line: { addl_insd: boolean; subr_wvd: boolean }; // print INTENT; downgrade only (R3)
    }>;
    description_of_operations: string;
    remarks?: string;
    supersedes_certificate_id?: string;
    preview_sha256: string;                                // R9 integrity binding
  }
>;
// Wraps supabase.functions.invoke('generate-certificate', { body }).
// NO pdfBytes. NO storage upload. NO documents insert. NO certificate insert. (R1)
// On success invalidate ['certificates', accountId], ['documents'], ['master-coi', accountId].
// Error mapping: 422 -> structured issue list rendered in the ValidationStrip;
//                409 -> the re-preview flow (Section 4.11 step 6b).
```

### 2.5 ACORD 25 builder and validator (owned by 05-acord25-pipeline.md)

```ts
// src/lib/acord/acord25/buildAcord25FieldValues.ts, .../types.ts, .../validateAcord25.ts,
// .../fieldMap.ts, .../previewHash.ts (05's files; consumed here for PREVIEW ONLY)
export function buildAcord25FieldValues(input: Acord25BuildInput): BuildAcord25Result;
// Acord25BuildInput: certificateDate, certificateNumber (null pre-issue), producer, insured,
//   lines (already reduced to the user's selection) plus the get_master_coi letter map
//   supplied as builder INPUT per R7 (05 Sec 4.1), descriptionOfOperations, remarks composition per 05,
//   holder (null allowed in preview), authorizedRepName. NO premium field exists in these types.
// BuildAcord25Result (05 Section 4.2, copied verbatim): { ok: boolean,
//   fieldValues: Record<string, string | boolean>, logicalValues, issues: Acord25Issue[] }.
//   There is NO letterAssignments member on the result; letters come from get_master_coi as
//   builder INPUT (R7) and surface only inside the built field values.

export function validateAcord25(
  build: BuildAcord25Result,
  opts: ValidateAcord25Options   // { mode: 'preview' | 'issue'; template: Acord25TemplateInfo;
                                 //   templateSha256?: string } (05 Section 5.2)
): { valid: boolean; issues: Acord25Issue[] };   // includes build.issues, deduped
// mode 'preview' tolerates HOLDER_MISSING as a warning; 'issue' escalates it to error.

// fieldMap.ts: softCharLimit is a PER-ENTRY field-map property (authored on multilineText
// entries; the Description of Operations entry carries the value the live counter in Section 4.8
// binds to, R16). Overflow beyond it is an OVERFLOW error with the exact copy 'Shorten it by <n>
// characters.'; there is NO addendum path (R16).

// previewHash: preview_sha256 comes from 05's hashFieldValuesForPreview(fieldValues) helper with
// its PREVIEW_HASH_EXCLUDED_FIELDS constant (the certificate-number, revision-number, and
// form-date header fields are excluded because the server assigns or re-dates them at issue).
// Owned by 05 Section 4.10; this doc CITES the helper and never redefines the serialization (R9).
```

The builder never assigns insurer letters; it takes the letter map from `get_master_coi` as input and 05's validator re-asserts letter-to-insurer consistency as a payload check (R7). The mapper owns ACORD field IDs, Y/N literals, and the never-print-premium rule; the UI renders `issues` and never re-implements them. The same builder logic is ported to Deno in `supabase/functions/_shared/acord25/` for the server (05), guarded by a shared parity fixture, which is what makes the R9 hash comparison meaningful.

### 2.6 Additional Insureds drawer and search (owned by 03-additional-insureds-directory.md)

```ts
// src/components/additional-insureds/AdditionalInsuredDrawer.tsx (contract owned by 03, Section 8.6)
export function AdditionalInsuredDrawer(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: AdditionalInsuredListRow | null; // null = create mode; the generator always passes null
  initialName?: string;                     // create mode: seeds the Name field from the generator's search text
  onSaved: (savedRow: AdditionalInsuredSavedRow) => void;
  // savedRow is the FULL saved row: id, name, kind, address_line1, address_line2, city, state,
  // zip_code. The picker consumes savedRow's address directly; callers never re-fetch (03).
}): JSX.Element;

// src/hooks/useAdditionalInsureds.ts
export function useAdditionalInsuredSearch(): {
  results: { id: string; name: string; addressBlock: string; matchReason: string }[];
  loading: boolean;
  search: (q: string) => void;
  clear: () => void;
};
```

The drawer carries its own duplicate detection (03's scope). This UI only embeds it. Holder ids are `additional_insureds.id`; the issued-cert table references them as `certificates.holder_id`.

### 2.7 Issuance log component (owned by 04-issuance-and-snapshots.md, per R17)

```ts
// src/components/certificates/CertificateIssuanceLog.tsx (04's component; consumed here)
interface CertificateIssuanceLogProps {
  accountId: string;
  variant?: 'full' | 'compact';   // default 'full'
  limit?: number;                 // compact default 5
  onReissue?: (certificate: CertificateListItem) => void;   // list row, NO snapshot (Section 4.12)
  className?: string;
}
```

The ONE `CERT_PILL` map is exported next to this component (04 owns it) and covers ALL FOUR statuses (R11), tone assignments copied verbatim from 04 Section 9.1: `issued` = { label 'Issued', tone 'neutral' }, `sent` = { label 'Sent', tone 'success' }, `superseded` = { label 'Superseded', tone 'muted' } with "Replaced by COI-..." subtext from `superseded_by_number`, `voided` = { label 'Voided', tone 'danger' } with the reason surfaced per 04's row spec. This doc ships no parallel pill map for certificate status and no parallel log component; the former `IssuanceLog`, `RecentCertificatesBlock`, and `VoidCertificateDialog` specs from the draft of this doc are DELETED (R17). Row actions (Download, View, Send by email via 04's `SendCertificateDialog`, Reissue corrected, Void with reason dialog, Restore to Documents, View activity) are 04's taxonomy and are not restated here.

Certificate drafts: there is no draft contract. `useSaveCertificateDraft` / `useCertificateDraft` are deleted (R20). If drafts are ever needed, they will be acord_forms-backed per 04's future-enhancement note.

---

## 3. Surface 1: Master COI panel (`MasterCOISection`)

### 3.1 Files to create / modify

| Action | Path |
|---|---|
| CREATE | `src/components/customers/MasterCOISection.tsx` (panel shell, owns queries) |
| CREATE | `src/components/master-coi/CoverageLineRow.tsx` |
| CREATE | `src/components/master-coi/CoverageLineDrawer.tsx` |
| CREATE | `src/components/master-coi/EndorsementRowList.tsx` (per-AI-row editor used inside the drawer) |
| CREATE | `src/components/master-coi/InsurerTablePreview.tsx` |
| CREATE | `src/components/master-coi/ReadinessPill.tsx` |
| CREATE | `src/components/master-coi/NamedInsuredBlock.tsx` |
| CREATE | `src/components/master-coi/CertificateDefaultsBlock.tsx` (DOO default + remarks default) |
| CREATE | `src/components/master-coi/ReviewStampRow.tsx` |
| CREATE | `src/components/master-coi/endorsementPills.ts` (shared StatusPill override map for endorsement states) |
| MODIFY | `src/pages/CustomerDetail.tsx` (SECTION_IDS at :105, new section between :473 and :476, overflow repoint at :429-431, import) |

Deleted relative to the draft design: `OperationsDescriptionField.tsx` (subsumed by CertificateDefaultsBlock per R18), `RecentCertificatesBlock.tsx` (replaced by 04's `CertificateIssuanceLog` compact variant per R17).

### 3.2 Placement (exact edits to CustomerDetail.tsx)

1. Line 105 becomes:

```ts
const SECTION_IDS = ['contact', 'policies', 'master-coi', 'relationships', 'documents', 'notes', 'activity'];
```

Array position is irrelevant to layout (the array only validates `?tab=` deep links, CustomerDetail.tsx:246-256); DOM position controls order.

2. Between the policies section close (currently CustomerDetail.tsx:473) and the documents section open (currently :476), insert:

```tsx
{/* ===================== Master COI ===================== */}
<section id="master-coi" className="scroll-mt-20 space-y-4">
  <MasterCOISection accountId={account.id} accountName={account.name} />
</section>
```

Standalone component, own chrome, `scroll-mt-20 space-y-4` classes matching siblings at :462, :470, :476. This matches the panel contract restated in 02 Section 8.2 word for word.

### 3.3 Component props

```ts
// src/components/customers/MasterCOISection.tsx
export interface MasterCOISectionProps {
  accountId: string;
  accountName?: string;   // used in copy ('Build {name}'s certificate profile')
}
```

The section does its OWN account-scoped fetch via `useMasterCOI(accountId)`. It does not touch `usePolicies()` (which fetches the whole book and filters client-side, CustomerPoliciesSection.tsx:43,57) and it does not modify `CustomerPoliciesSection` in any way; all limits/NAIC/endorsement editing lives here. It performs no direct table reads for coverage data (02's contract line).

### 3.4 Panel chrome and layout

Chrome matches the Card sibling pattern (CustomerPoliciesSection.tsx:295-300):

```
Card (bg-cc-surface, border-cc-border-subtle, rounded-cc-xl, shadow-card)
  CardHeader (flex row, items-center, justify-between)
    CardTitle: ShieldCheck icon + 'Master COI'
    right cluster:
      ReadinessPill
      Button variant='outline' size='sm'  'New certificate'   -> navigate(`/certificates?accountId=${accountId}`)
  CardContent (space-y-5)
    NamedInsuredBlock
    coverage lines list (space-y-3): CoverageLineRow per canonical line (gl, auto, umbrella, wc, property; plus a muted block for lines.other[])
    InsurerTablePreview
    CertificateDefaultsBlock
    ReviewStampRow
    <CertificateIssuanceLog accountId={accountId} variant="compact" limit={5} />   (R17)
  CoverageLineDrawer (controlled, rendered once at panel root)
```

Lime budget: ZERO lime fills inside this panel (hero owns the page's lime). The "New certificate" header button uses the exact outline styling of CustomerPoliciesSection's "New quote" secondary (CustomerPoliciesSection.tsx:303-311): `variant="outline" size="sm" className="gap-2 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"`. The compact issuance log's "View all certificates" tertiary link (part of 04's component) navigates to `/certificates?accountId={accountId}#issuance-log` (R19).

### 3.5 ReadinessPill and per-line completeness

Not a progress bar (a meter-as-bar reads as a vanity metric; anti-patterns.md). The readiness meter is a labeled pill plus an actionable count, driven by the canonical `readiness` block (R21):

```ts
// ReadinessPill.tsx
export function ReadinessPill({ readiness }: { readiness: COIReadiness }) {
  return readiness.ready
    ? <StatusPill override={{ label: 'COI ready', tone: 'success' }} />
    : <StatusPill override={{ label: `${readiness.blockers.length} blockers`, tone: 'warning' }} />;
}
```

When ready with warnings, a muted cc-num suffix next to the pill reads "{n} warnings". Clicking behavior: the pill itself is not a button; next to it, when not ready, a tertiary text button "Review blockers" scrolls to the first `CoverageLineRow` whose line key appears in `readiness.blockers` and opens its drawer.

Per-line completeness indicator inside each row: when no blocker targets the line, a muted check (`Check` icon, `text-cc-text-muted`) with visually-hidden text "Complete"; otherwise `StatusPill override={{ label: '{n} blockers', tone: 'warning' }}` where n counts blockers whose `line` equals this line's key. Word plus tone, never color alone (constitution.md:37).

### 3.6 CoverageLineRow (uniform typed rows over the cell contract)

```ts
// CoverageLineRow.tsx
export interface CoverageLineRowProps {
  lineKey: 'gl' | 'auto' | 'umbrella' | 'wc' | 'property';
  line: COILineGL | COILineAuto | COILineUmbrella | COILineWC | COILineProperty;
  insurers: COIInsurer[];             // for the letter badge lookup
  blockers: COIReadiness['blockers']; // filtered to this line by the parent
  onEdit: (lineKey: string) => void;  // opens CoverageLineDrawer
}
```

Each row is a nested tile per component-rules.md:25-27: `bg-cc-surface-raised rounded-cc-md border border-cc-border-subtle p-3`. Rows are NOT clickable as a whole (text must stay selectable, matching CustomerPoliciesSection.tsx:123-127); actions are explicit. A line with `present: false` renders a single-height muted row: line label + "Not on file" + the same overflow menu reduced to "Edit line" (the drawer supports selecting a candidate policy for the line via `line.candidates`, per 02).

Row anatomy for present lines (two visual lines inside one tile; uniform across all coverage lines, same fields in the same order per the acceptance-checklist Density gate):

Line 1 (flex, wrap, gap-2, items-center):
- Insurer letter: a 20px square mono badge, `border border-cc-border-interactive rounded-cc-sm text-xs cc-num text-cc-text-secondary`, showing `line.insurer_letter` (`A`..`F`); when null, the badge shows `?` in warning tone with `aria-label="No insurer letter assigned"` (this state co-occurs with an `insurer_unresolved` or `insurer_overflow` blocker).
- Line label from the canonical display-name mapping in 02 (Section 2.1 above); GL additionally shows a small muted suffix "Occurrence" or "Claims made" from `occurrence_or_claims_made.v`; umbrella shows "Umbrella" or "Excess" from `umbrella_or_excess.v`.
- Carrier: `<Chip>{insurer name for this line's letter}</Chip>`; when the line's carrier is unresolved, warning-toned text "Carrier unresolved" with icon (word + tone).
- Policy number: `line.policy_number.v` in `font-mono cc-num text-sm text-cc-text-secondary`. Never truncates; the flex row wraps.
- Dates: `Eff <span class="cc-num">MM/DD/YYYY</span>` and `Exp <span class="cc-num">MM/DD/YYYY</span>` as two separate labeled tokens (no date-range dash; forbidden). An expired line (a `policy_expired` blocker targets it) renders the Exp token in `text-cc-warning` with a `CircleAlert` icon and visually-hidden "Expired".
- Right-aligned: completeness indicator (3.5), then a per-row overflow `DropdownMenu` (icon button, `aria-label="Coverage line actions"`): items "Edit line" (calls `onEdit`), "View full policy" (navigate `/policies/{line.policy_id}`).

Line 2 (limits strip): a responsive grid `grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1`, cells built from the line's typed limit cells (GL: the six `limits.*` cells; auto: `csl` or the split `bi_per_person`/`bi_per_accident`/`pd_per_accident` set per `limit_type.v`; umbrella: `each_occurrence`, `aggregate`, `ded_or_retention`; wc: `per_statute` plus the three EL limit cells; property: `label`, `limit_amount`, `limit_description`). Each cell:
- label: `text-xs text-cc-text-muted` (e.g. "Each occurrence")
- value: `cc-num font-medium text-sm text-cc-text-primary` formatted as currency without cents (e.g. "$1,000,000"); when `cell.src === 'missing'` or `cell.v === null`, render `Missing` in `text-cc-warning` with a small `CircleAlert` icon and `aria-label` naming the field. Values wrap, never truncate (constitution.md:56).
- provenance: a muted suffix under the value, `text-[10px] uppercase tracking-wide text-cc-text-muted`, reading the cell's `src` (`extracted` or `manual`; the vocabulary has no `legacy` value, R13); omitted when missing. Cells with `flag === 'overwritten_manual'` add a warning chip; the restore action lives in the drawer.

Line 2 tail (endorsement summary, always last cells or their own flex row on narrow widths): the row does NOT render one pill per AI row (unbounded). It renders a per-line SUMMARY derived from `additional_insureds[]` (and for wc, `subrogation_waivers[]`):
- ADDL INSD summary: `StatusPill override={ADDL_PILL[summary]}` where summary = `endorsed` if at least one row is endorsed, else `requested` if at least one row is requested, else `none`. A muted cc-num suffix shows the row count, e.g. "3 AIs".
- SUBR WVD summary: same derivation over the waiver flags/rows, `SUBR_PILL[summary]`.

```ts
// endorsementPills.ts (single source of the endorsement vocabulary; StatusPill override
// because these states are not in the shared vocab at src/components/cc/StatusPill.tsx:31-57)
export const ADDL_PILL = {
  endorsed:  { label: 'AI endorsed',       tone: 'success' as const },
  requested: { label: 'AI requested',      tone: 'warning' as const },
  none:      { label: 'No AI endorsement', tone: 'neutral' as const },
};
export const SUBR_PILL = {
  endorsed:  { label: 'Waiver on file',    tone: 'success' as const },
  requested: { label: 'Waiver requested',  tone: 'warning' as const },
  none:      { label: 'No waiver',         tone: 'neutral' as const },
};
```

These pills are never checkboxes and never default to endorsed (locked decision 5); they render the data layer's per-row states verbatim (summarized as above). Certificate status pills are NOT defined here; `CERT_PILL` is owned by 04 next to `CertificateIssuanceLog` (R11, R17).

### 3.7 CoverageLineDrawer (the edit affordance)

Decision: per-line drawer, not inline editing. Justification: a GL line alone carries six limits plus occurrence form, aggregate-applies-per, carrier resolution, NAIC, a multi-row endorsement list, and two dates; inline editing of that many fields inside a 44-52px row regime is impossible without violating the density gate, and the input rules demand labels above fields (component-rules.md:53-55). The drawer follows the side-sheet spec exactly: right-anchored `Sheet` on `--cc-surface-overlay` over `--cc-scrim`, width 480px (within the 420-520px band), `rounded-cc-xl` inner corners, ONE primary action (component-rules.md:91-93; surface-map.md:74-78). Fork the structure of `LinkAccountDrawer` (src/components/relationships/LinkAccountDrawer.tsx:1-60) for Sheet plumbing.

```ts
// CoverageLineDrawer.tsx
export interface CoverageLineDrawerProps {
  accountId: string;
  lineKey: 'gl' | 'auto' | 'umbrella' | 'wc' | 'property' | null;   // null = closed
  masterCoi: MasterCOI;                 // the drawer reads its line + insurers from the document
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;                  // parent invalidates ['master-coi', accountId]
}
```

Drawer content, top to bottom (every field: label ABOVE the field, field on `--cc-surface-raised` with 1px `--cc-border-interactive`, per component-rules.md:52-57; errors: `--cc-danger` border + icon + helper text stating the fix + `aria-invalid` + `aria-describedby`):

1. Header: SheetTitle "Edit coverage line", SheetDescription "{line display name}, policy {policy_number.v}" (mono span for the number).
2. Policy selection (when `line.candidates.length > 1` or `present === false`): a select listing candidate policies (policy number, status, expiration) so staff pick which policy feeds this line; writes via `useSaveMasterCOIFields` per 02's line-selection contract.
3. Carrier and NAIC group: a carrier combobox backed by the `resolve_carrier` flow from 02 (searches `carriers`; free-text fallback preserved because `policies.carrier` is deliberately free text and `carrier_id` is null on modal-created policies); NAIC renders read-only next to a resolved carrier with provenance text; when the carrier cannot resolve, helper text "Pick a carrier from the list to fill NAIC automatically".
4. Dates group: two `DateField`s (Effective date, Expiration date), ISO in/out (DateField.tsx:58-72). Never native date inputs (component-rules.md:56).
5. Limits group: line-type-specific ordered list from the line's limit cells; each a currency `Input` (`inputMode="numeric"`, cc-num, right-aligned, thousands formatting on blur) with its provenance as helper text ("Extracted from dec page" / "Entered manually"). Cells flagged `overwritten_manual` show a warning note with a "Restore my value" tertiary action that submits the ledger value via `useSaveMasterCOIFields` (02 Section 8.3). Saving an edit over an extracted value flips provenance to manual server-side; the UI just submits registry paths.
6. Additional insureds (PER-AI-ROW editor, R21): `EndorsementRowList` renders one row tile per `COIAdditionalInsuredRow` on this line (for wc, per `COIWCSubroWaiverRow`):
   - Row content: name (weight 600, wraps), muted type/scope facts (ai_type, primary and noncontributory flag, waiver flag; wc rows show `waiver_scope` "Blanket" or the scheduled name), endorsement form (mono) when present, and `StatusPill override={ADDL_PILL[row.endorsement_status]}` (wc rows use `SUBR_PILL`).
   - Row action "Edit status" expands an inline editor: a three-option segmented control (radio group, not a checkbox): "Not endorsed", "Requested", "Endorsed".
     - Selecting "Endorsed" reveals a required Endorsement form field (text, e.g. "CG 20 10") and an optional effective date `DateField`; the confirm is blocked with the input error pattern if Endorsed is chosen without a form reference and the row has none and is not document-evidenced ("Enter the endorsement form number to mark this row endorsed"), mirroring the `set_line_ai_endorsement` rule (02 Section 4.5).
     - Selecting "Requested" reveals an optional note field.
     - Confirm calls `useSetEndorsementStatus().mutate({ line: lineKey, rowId, status, endorsementForm, effectiveDate })` immediately (status transitions are attributable single actions, not batched into drawer Save).
   - Row microcopy under the editor: "Endorsed means the endorsement is on file with the carrier. Certificates can only print Y for holders this endorsement actually covers."
   - Footer of the list: ghost "Add additional insured" (wc: "Add subrogation waiver") which appends a row via the direct-table creation path 02 preserves (name, type fields), created at status `none`.
7. Footer: Save (the drawer's single primary action; lime is permitted here because the drawer is its own overlay surface with exactly one primary, component-rules.md:91-93) and a ghost Cancel. Save submits the field edits (steps 2-5) via `useSaveMasterCOIFields`, disables to a designed in-flight state, closes on success, fires `onSaved`. Endorsement status changes (step 6) commit independently via their own RPC and are reflected immediately.

Dirty-close guard: closing with unsaved field changes prompts a small confirm ("Discard changes to this coverage line?").

### 3.8 InsurerTablePreview

Read-only preview of the A-F table exactly as it will print. Letters come EXCLUSIVELY from `masterCoi.insurers` (assigned once, in SQL, inside `get_master_coi`, R7); no client-side assignment exists anywhere in this module's UI.

```ts
export function InsurerTablePreview({ insurers, overflow }: {
  insurers: COIInsurer[];
  overflow: MasterCOI['insurer_overflow'];
}): JSX.Element;
```

- `SectionLabel`: "Insurers"
- A dense table (rows 44px): Letter (mono cc-num badge, same visual as row badges), Carrier (`Chip`), NAIC (`cc-num`; when the naic cell is missing, warning-toned "Missing" with icon and the note "Pick the carrier in a coverage line to resolve NAIC"), Lines (muted, the line keys mapped to short display names, e.g. "GL, Umbrella").
- When `overflow` is non-empty, a danger-toned inline note (icon + text): "This account has more than 6 distinct insurers. ACORD 25 has rows A through F; uncheck lines at generation time or issue two certificates." This mirrors the `insurer_overflow` readiness blocker (R7).
- Wrapped in `overflow-x-auto` so narrow viewports scroll the table rather than truncating carrier names.
- No actions in this block; letters and NAIC are corrected by editing the coverage lines (single source of edit).

### 3.9 NamedInsuredBlock

Read-only tile (`bg-cc-surface-raised rounded-cc-md p-3`): `SectionLabel` "Named insured"; name cell `font-semibold`, DBA muted when present, address cells `text-sm text-cc-text-secondary`. A tertiary text link "Edit customer" navigates to `/customers/{accountId}/edit` (name/address live on `accounts`; this panel never forks a second editor for them). When address cells are missing, an inline warning "Address incomplete. The certificate prints the named insured block from this customer's address." with the same Edit customer link. When `named_insured.policy_named_insured_mismatch` is true, a warning note "A policy names a different insured than this customer record." (mirrors the `named_insured_mismatch` warning).

### 3.10 CertificateDefaultsBlock (two default fields, per R18)

```ts
export function CertificateDefaultsBlock(props: {
  accountId: string;
  descriptionOfOperations: MasterCOI['description_of_operations'];
  profile: AccountCOIProfile | undefined;
}): JSX.Element;
```

- `SectionLabel` "Certificate defaults" with helper text "Prefill the certificate. You can still edit both per certificate."
- Field 1: "Description of operations (default)". A `Textarea` seeded from the `description_of_operations` cell; when the cell is missing and `prefill_candidates` exist (sources `canopy` and `bap_risk_context` only; no legacy tier, R13), render each candidate as a muted quoted tile with a ghost "Use this" button that fills the textarea (never auto-committed; staff saves explicitly, which stamps `ops_source` per 02).
- Field 2: "Remarks (default)". A `Textarea` bound to `account_coi_profiles.default_remarks` (02's profile contract; seeds the generator's Remarks field per R18).
- Each field has an explicit ghost "Save" button that appears only when dirty (no autosave; explicit action per the calm action hierarchy) and a muted "Saved" confirmation flash. Mutation: `useSaveAccountCOIProfile`.
- Live character counter in cc-num bound to the fieldMap `softCharLimit` constant (05), counting the COMPOSED printed text per 05's composition rule. Within 200 characters of the limit the counter reads "{n} of {softCharLimit} form characters". OVER the limit it turns warning-toned with icon and reads "Shorten by {overflow} characters. The form box cannot fit more; support for the ACORD 101 continuation form is planned." Never a hard cap on the textarea; never an addendum (R16).

### 3.11 ReviewStampRow (the double-check affordance)

A single-height footer row consuming `masterCoi.review` (02 Section 8.3): muted text "Last reviewed {date} by {name}" (cc-num date) or "Never reviewed"; when `review.stale` is true, a warning-toned note with icon "Policy data changed after the last review." A ghost button "Mark reviewed" calls `useMarkMasterCOIReviewed` and invalidates `['master-coi', accountId]`. No lime; this is a stamp, not a workflow.

### 3.12 Certificate history in the panel (R17)

The panel's bottom block is `<CertificateIssuanceLog accountId={accountId} variant="compact" limit={5} />`, imported from 04. It is read-only in spirit here (row actions per 04's compact spec); supersede/void and the events timeline live in the full variant on /certificates. Rationale stands from the draft design: the record page is where staff answer "did we already send holder X a cert?" mid-call; destructive/stateful actions stay on the audit-emphasis surface. Downloads inside the log use 04's `downloadCertificate` (signed URL from the private `coi-certificates` bucket with pdf_sha256 verification, R5).

### 3.13 Panel states

- Loading: content-shaped skeleton, never a spinner (component-rules.md:144-147): header row `Skeleton` (h-5 w-40) + pill-shaped `Skeleton`, then five `SkeletonRow`-style tiles sized like coverage line rows (two stacked bars each), then a 3-row table skeleton for insurers.
- Empty (account has zero policies; `readiness.blockers` contains `no_lines`): one sentence naming the next action + one button (outline, not lime): "Add a policy to build this customer's certificate profile." + `Button variant="outline"` "Go to policies" which scrolls to `#policies` via `document.getElementById('policies')?.scrollIntoView({ behavior: 'smooth' })` (same pattern CustomerDetail uses at :188-190; the AddPolicyModal state lives in CustomerDetail and is not reachable from here).
- Error: the panel renders its chrome with a danger-toned inline error (icon + label + retry ghost button "Try again" calling `refetch`), matching the input error pattern colors; never a blank card.
- Query error and loading come from `useMasterCOI`; the panel never throws (CustomerDetail's error boundary at :108-134 only wraps DocumentCollectionBoard).
- `lines.other[]` non-empty: a muted block beneath the line rows lists unclassified policies (number, carrier, status) with the note "These policies are not classified into a certificate line and will not print." (mirrors the `unclassified_policies` warning).

### 3.14 Acceptance gates for this surface (enumerated)

1. Exactly zero lime fills inside the panel; hero keeps the page's lime (constitution.md:42).
2. One H1 stays the page's; panel title is CardTitle, section labels via SectionLabel (acceptance-checklist Hierarchy).
3. Rows 44-52px per visual line; same fields, same order, every coverage line (Density).
4. Carrier always a name `Chip`, never color (constitution.md:52).
5. Every limit, date, policy number, NAIC in `cc-num`; none truncate; grids wrap (constitution.md:40,56).
6. Endorsement states are labeled pills via StatusPill override, word + tone, never color alone (constitution.md:37). Certificate status pills come only from 04's CERT_PILL (all four statuses covered, R11).
7. Dates edited only via DateField (component-rules.md:56).
8. Labels above fields; error = danger border + icon + fix-stating helper + aria-invalid + aria-describedby (component-rules.md:52-57).
9. Skeleton is content-shaped; empty state is one sentence + one action (component-rules.md:144-147).
10. All overflow icon buttons carry aria-labels; drawer traps focus; every control keyboard-reachable with visible 2px focus ring (component-rules.md:175-179).
11. cc-* tokens only, no hex; verified in light AND dark (stale dark-only checklist line waived).
12. No em or en dashes in any copy, including date presentation (no range dashes) (constitution.md:59; R22e).
13. No PII on this surface (ACORD 25 data carries no DOB/DLN/SSN); if a future line type surfaces one, it renders via mask.ts helpers (constitution.md:57).
14. Endorsement editing is per-AI-row via `set_line_ai_endorsement`; no line-level endorsement write control exists anywhere (R21).

---

## 4. Surface 2: Certificates page (Document Production archetype)

### 4.1 Decision: a page at `/certificates` (R19)

- Route `/certificates`, H1 "Certificates". The generator is the page's primary mode; the issuance log renders beneath it. There is no separate creation-named route, so reading history never funnels through a "new" affordance.
- A drawer cannot hold the archetype: left selector + right live preview + issuance log beneath (surface-map.md:47-53) needs full page width; a 420-520px side sheet cannot render a legible letter-size PDF preview next to a selector.
- Not `/customers/:id/certificates`: the command palette entry is account-less and needs a landing state with a customer picker; a nested route would require a second, account-less route anyway. One route with optional params serves all entry points.
- Not `/acord-forms/new`: `/acord-forms` is the generic form-management surface (src/pages/FormManagement.tsx, route App.tsx:726-733) with its own list/edit UX; the certificate generator is a purpose-built Document Production surface. They share the fill engine but not a page. Keeping them separate also means zero regression risk to existing ACORD form flows.
- Query params: `?accountId=` (selects the customer), `&policyId=` (pre-checks that policy's line; from PolicyDetail), `&holderId=` (preselects holder; used by cross-links from the Additional Insureds index, 03), and hash `#issuance-log` (scrolls to the log; used by the compact log's "View all certificates"). There is NO `&draft=` param (R20).

### 4.2 Files to create

| Action | Path |
|---|---|
| CREATE | `src/pages/Certificates.tsx` (page shell, owns state reducer + queries) |
| CREATE | `src/components/certificates/CustomerPickerEmptyState.tsx` |
| CREATE | `src/components/certificates/PolicyLineSelector.tsx` |
| CREATE | `src/components/certificates/HolderField.tsx` |
| CREATE | `src/components/certificates/OperationsAndRemarksFields.tsx` (two labeled fields, R18) |
| CREATE | `src/components/certificates/ValidationStrip.tsx` |
| CREATE | `src/components/certificates/CertificatePreview.tsx` |
| CREATE | `src/hooks/useCertificatePreview.ts` |
| CREATE | `src/hooks/useIssueCertificate.ts` (invoke wrapper, Section 2.4) |
| CREATE | `src/hooks/useHolderEndorsementStatus.ts` (RPC wrapper, Section 2.3) |
| MODIFY | `src/App.tsx` (route swap, Section 5.1) |

NOT created here (deleted relative to the draft design, per R17/R20): `IssuanceLog.tsx`, `VoidCertificateDialog.tsx`, draft hooks. The log, its dialogs, `useCertificates`, and `src/types/certificates.ts` come from 04.

### 4.3 Page skeleton and layout

```tsx
// Certificates.tsx (structure)
<AppLayout>                                          {/* pages self-wrap, cf. CustomerDetail.tsx:280 */}
  <div className="mx-auto max-w-[1400px] space-y-6 p-6">
    <header>                                         {/* back link + H1 + context */}
      <Button variant="ghost" size="sm">Back to customer</Button>   {/* only when accountId present */}
      <h1 className="text-2xl font-semibold">Certificates</h1>      {/* the page's ONE h1 (R19) */}
      <p className="text-cc-text-muted">ACORD 25 Certificate of Liability Insurance for
        <span className="font-medium text-cc-text-primary"> {accountName}</span></p>
    </header>

    {!accountId ? <CustomerPickerEmptyState onPick={...} /> : (
      <>
        <div className="grid gap-6 lg:grid-cols-[minmax(400px,520px)_1fr]">
          <div className="space-y-5">                {/* LEFT: source-data selector */}
            <PolicyLineSelector ... />
            <HolderField ... />
            <OperationsAndRemarksFields ... />
            <ValidationStrip ... />
            <div className="flex items-center gap-2">
              <Button data-primary ...>Generate certificate</Button>   {/* the ONE lime */}
              <Button variant="ghost" ...>Refresh preview</Button>     {/* rank-two, ghost (R20) */}
            </div>
          </div>
          <CertificatePreview ... />                  {/* RIGHT: live preview */}
        </div>
        <section id="issuance-log" className="scroll-mt-20">
          <CertificateIssuanceLog accountId={accountId} variant="full"
            onReissue={prefillFromSnapshot} />        {/* BENEATH: audit trail (R17) */}
        </section>
      </>
    )}
  </div>
</AppLayout>
```

- Exactly one lime on the page: "Generate certificate" (`data-primary`, matching CustomerPoliciesSection.tsx:312-320 styling). "Refresh preview" is the single rank-two action, ghost (R20): it invalidates `['master-coi', accountId]` and `['endorsement-status', ...]` and lets the debounced preview rebuild; it exists chiefly for the R9 re-preview flow and for staff who edited Master COI in another tab.
- Below `lg` the grid stacks: selector, then preview, then log.
- Skip link and landmarks come from AppLayout; the page contributes the one H1 and the `id="issuance-log"` anchor.
- Review-staleness gate (02 Section 8.3): when `masterCoi.review.stale` is true, clicking Generate first shows a small confirm dialog: "Policy data changed since the last Master COI review. Generate anyway?" with ghost "Review first" (navigates to `/customers/{accountId}?tab=master-coi`) and a neutral confirm "Generate". This is an acknowledgment, not a block; blocks come only from the readiness vocabulary (R6).

### 4.4 CustomerPickerEmptyState (account picker mode, R19)

Shown when no `accountId` (command-palette entry). One sentence + one control: "Pick a customer to issue a certificate." above a debounced combobox backed by the existing `search_accounts`-based `useAccountSearch` (src/hooks/useRelationshipGraph.ts, consumed exactly as LinkAccountDrawer.tsx:38-53 does with the 250ms debounce). Selecting navigates in place to `/certificates?accountId={id}` (replaceState). No table of all accounts (the legacy page loaded every account unfiltered; do not repeat).

### 4.5 PolicyLineSelector (left column, block 1)

```ts
export interface PolicyLineSelectorProps {
  masterCoi: MasterCOI;                            // lines + insurers + readiness (R21)
  selectedLineKeys: LineKey[];
  perLine: Record<LineKey, { addlInsd: boolean; subrWvd: boolean }>;
  endorsementByLine: Record<LineKey, { addl_insd_resolved: EndorsementState;
                                       subr_wvd_resolved: EndorsementState;
                                       basis: string }> | undefined;   // Section 2.3
  holderChosen: boolean;
  onToggleLine: (lineKey: LineKey, checked: boolean) => void;
  onTogglePerLine: (lineKey: LineKey, key: 'addlInsd' | 'subrWvd', value: boolean) => void;
  accountId: string;                               // for the Master COI deep link
}
```

- `SectionLabel` "Coverage lines".
- One uniform row per present coverage line (policy-list rule, component-rules.md:122-124), 48px min height, `bg-cc-surface-raised rounded-cc-md border border-cc-border-subtle p-3`:
  - shadcn `Checkbox` (labelled by the row content; `aria-describedby` points at the row's blocker note when present).
  - line display name `font-semibold`, insurer-letter badge (from `masterCoi.insurers`), carrier `Chip`, policy number `font-mono cc-num`, Exp date `cc-num`, `StatusPill status={line.status}` (shared vocabulary).
  - Blocker gate (R6): when any readiness blocker targets the line (`limit_missing`, `policy_core_missing`, `insurer_unresolved`, `policy_expired`), the checkbox is DISABLED; a warning-toned note with icon renders the blocker's `message` from the canonical vocabulary. For `policy_expired` specifically: "Policy expired {MM/DD/YYYY}. Expired lines cannot print on a certificate." Expiry is a blocker, not a warning; only near-expiry within 30 days is a warning (surfaced by the server response's `warnings` and by 05's builder issues). Every blocker note is followed by a tertiary link "Open Master COI" -> `/customers/{accountId}?tab=master-coi` (the `?tab=` deep link scrolls via CustomerDetail.tsx:246-256, enabled by the SECTION_IDS addition). Rationale: the server will 422 these lines anyway (R6); the UI disables them so the failure never happens.
  - When checked, the row grows a second line with the two toggles (Section 4.5.1). Checked rows use `AccentSpine active` (quiet 2px lime LEFT BORDER, which is a border not a fill and thus legal).
- Preselection: `?policyId=` checks the line whose `policy_id` matches, if unblocked.
- Empty (customer has no policies; `no_lines` blocker): "This customer has no policies on file. Add one from the customer record first." + outline button "Open customer record" -> `/customers/{accountId}?tab=policies`.

#### 4.5.1 Per-line ADDL INSD / SUBR WVD toggles and the E&O guard (R2 + R3)

Each checked line renders two labeled `Switch` controls: "Additional insured (ADDL INSD)" and "Waiver of subrogation (SUBR WVD)". Gating against `useHolderEndorsementStatus` (Section 2.3), which wraps the SAME `resolve_holder_endorsements` RPC the server calls:

| Holder-resolved state | Toggle behavior (R3) | Inline copy under the toggle |
|---|---|---|
| `endorsed` | Enabled. DEFAULT ON. The user may turn it OFF (print N on an endorsed line; downgrade only). | Muted: "Endorsement on file ({basis})." |
| `requested` | Disabled, locked OFF. | Warning icon + "Endorsement requested, not yet confirmed. The box stays unchecked until it is on file." |
| `none` | Disabled, locked OFF. | Neutral + "No endorsement on this line covers this holder." + tertiary link "Manage in Master COI" -> `/customers/{accountId}?tab=master-coi` |
| holder not yet chosen | Disabled, locked OFF. | "Pick a certificate holder to enable." |

Semantics (R3): the server derives print values from holder-resolved endorsement status; the request's per-line intent can only DOWNGRADE. `generate-certificate` returns 422 if a request asks for Y on a non-endorsed (line, holder) pair, so even a tampered client cannot print an unearned Y. The disabled toggles remain visible (not hidden) so the state is legible and the fix (the Master COI drawer's per-row endorsement editor, which requires a form reference and leaves an audit record) is one click away.

Reset rule (R3): whenever the holder changes, and whenever `useHolderEndorsementStatus` returns fresh data, every `perLine` value resets to its holder-resolved default (ON where endorsed, OFF otherwise). Silently carrying a Y across holders is exactly the E&O bug this module exists to prevent.

The toggles' state feeds `perLine` and, through the builder (preview) and the request (issue), the literal `Y`/`N` field values (Y/N literal rule is 05's job).

### 4.6 Generator state management

Local `useReducer` in `Certificates.tsx`; no form library (the form is selection-heavy, not field-heavy). No draft persistence (R20).

```ts
export interface CertGenState {
  accountId: string | null;
  selectedLineKeys: LineKey[];
  perLine: Record<LineKey, { addlInsd: boolean; subrWvd: boolean }>;
  holder: { id: string; name: string; addressBlock: string } | null;
  descriptionOfOperations: string;   // seeded once from masterCoi.description_of_operations
  remarks: string;                   // seeded once from account_coi_profiles.default_remarks (R18)
  supersedesCertificateId: string | null;   // set by the reissue flow (Section 4.12)
}
type Action =
  | { type: 'setAccount'; accountId: string }
  | { type: 'toggleLine'; lineKey: LineKey; checked: boolean }
  | { type: 'setPerLine'; lineKey: LineKey; key: 'addlInsd' | 'subrWvd'; value: boolean }
  | { type: 'setHolder'; holder: CertGenState['holder'] }
  | { type: 'applyEndorsementDefaults'; byLine: Record<LineKey, { addlInsd: boolean; subrWvd: boolean }> }
  | { type: 'setDescriptionOfOperations'; value: string }
  | { type: 'setRemarks'; value: string }
  | { type: 'hydrateFromSnapshot'; state: Partial<CertGenState> };   // reissue prefill
```

Reducer invariants: unchecking a line deletes its `perLine` entry; `setHolder` clears `perLine` (locked N until resolution returns) and `applyEndorsementDefaults` then sets the R3 defaults when the endorsement query resolves; `setPerLine` can only set `true` where the current resolution is `endorsed` (belt and suspenders; the switch is disabled anyway).

React-query keys used by the page (plain-array convention, e.g. src/hooks/useRetentionRiskScores.ts:114):

| Key | Data | Notes |
|---|---|---|
| `['master-coi', accountId, null]` | MasterCOI | shared with the panel (02) |
| `['acord-template', '25', 'current']` | current ACORD 25 `acord_templates` row | staleTime 5 min |
| `['acord-template-bytes', templateId]` | ArrayBuffer of the blank PDF | staleTime Infinity, gcTime 30 min |
| `['endorsement-status', accountId, holderId, ...]` | holder-resolved states | Section 2.3 (R2) |
| `['certificates', accountId]` | issuance log rows via the list_certificates reader | 04 (R11) |

Invalidations after a successful issue: `['certificates', accountId]`, `['documents']` (so CustomerDocumentsSection refreshes; UploadDocModal precedent invalidates the same key, UploadDocModal.tsx:175), `['master-coi', accountId]`.

### 4.7 HolderField (left column, block 2)

```ts
export interface HolderFieldProps {
  value: CertGenState['holder'];
  onChange: (holder: CertGenState['holder']) => void;
}
```

- `SectionLabel` "Certificate holder". Label above a debounced (250ms) search `Input` backed by `useAdditionalInsuredSearch` (Section 2.6), result list rows showing name, address block, and the muted `matchReason`; names never truncate.
- Footer row of the results popover: ghost button "Create new holder" which opens `AdditionalInsuredDrawer` in create mode (`initial={null}`) with `initialName` = current query; `onSaved(savedRow)` sets the holder directly from the full saved row (id, name, and an address block composed from `savedRow.address_line1`, `address_line2`, `city`, `state`, `zip_code`; no follow-up fetch) and closes. The drawer brings its own dedup (03's scope).
- Selected state renders as a tile: holder name `font-semibold`, address block `text-sm text-cc-text-secondary whitespace-pre-line`, ghost icon button `aria-label="Change holder"` clearing back to search. Changing the holder fires the R3 reset (Section 4.6).
- Cross-link: tertiary link under the tile, "View in Additional Insureds" -> the directory record route (03).
- `?holderId=` preselects the holder on first load (fetch by id via 03's reader).

### 4.8 OperationsAndRemarksFields (left column, block 3; TWO labeled fields, R18)

- Field 1: label "Description of operations" above a `Textarea`, seeded once from `masterCoi.description_of_operations.v` (dirty flag prevents reseeding on refetch).
- Field 2: label "Remarks" above a `Textarea`, seeded once from `account_coi_profiles.default_remarks` (R18). Helper text: "Optional. Prints with the description of operations."
- One shared live counter under the pair, bound to the fieldMap `softCharLimit` constant (05) and computed over the COMPOSED printed text per 05's composition rule: cc-num "{n} of {softCharLimit} form characters". When over the limit the counter turns warning-toned with icon and reads "Shorten by {overflow} characters." and the builder emits a blocking OVERFLOW error that appears in the ValidationStrip (R16). There is NO addendum page and no addendum copy anywhere (R16); ACORD 101 support is a noted future enhancement. Never a hard cap on the textareas; the block is at validation, not at input.

### 4.9 ValidationStrip

```ts
export function ValidationStrip({ issues }: {
  issues: { code: string; severity: 'error' | 'warning'; message: string; lineKey?: string }[];
}): JSX.Element | null;
```

Renders, merged and deduplicated by code+lineKey:
- the client build's `issues` from `validateAcord25(build, { mode: 'preview', template, templateSha256 }).issues` (05's `Acord25Issue` code enum, verbatim: FIELD_MAP_UNPOPULATED, NO_LINES_SELECTED, LETTER_UNASSIGNED, LETTER_CONFLICT, TOO_MANY_CARRIERS, OTHER_ROW_CONFLICT, ADDL_INSD_PENDING, ADDL_INSD_NOT_PERMITTED, SUBR_WVD_PENDING, SUBR_WVD_NOT_PERMITTED, NAIC_MISSING, HOLDER_MISSING, DATE_INVALID, OVERFLOW),
- readiness blockers for SELECTED lines from `masterCoi.readiness.blockers` (canonical vocabulary per R6: `no_lines`, `policy_core_missing`, `limit_missing`, `insurer_unresolved`, `insurer_overflow`, `policy_expired`),
- page-level checks (no lines selected; no holder),
- after a failed Generate, the server's 422 structured issue list verbatim (same vocabularies; the server is the same rule set re-run, R6/R7/R3).

Each item: danger/warning icon + label text + when `lineKey` present a tertiary "Go to line" that scrolls/focuses the offending row. The strip has `role="alert"` and `id="cert-validation"`; the Generate button sets `aria-describedby="cert-validation"` when blocked. Color + icon + label, programmatically associated (acceptance-checklist.md:24). Generate is disabled while any error-severity issue exists; the disabled button keeps a tooltip-free inline reason (the strip IS the reason; no hover-only information). Warnings (near-expiry within 30 days, NAIC_MISSING, endorsement_requested) do not disable Generate.

### 4.10 CertificatePreview (right column) and preview mechanics

Decision: client-side debounced re-fill with the existing `fillAcordPdf`, rendered via `<iframe>` blob URL. Rationale: the fill already runs client-side in this codebase (useAcordForms.ts:279-345 fetches template bytes and fills in the browser); a 1-2 page AcroForm fill with pdf-lib takes well under a second; template bytes are fetched once and cached (`['acord-template-bytes', templateId]`, staleTime Infinity); no new dependency (no pdfjs-dist at runtime), and the flattened output previews exactly what will be issued because the server port in 05 is parity-tested against the same builder. Preview is the ONLY thing the client fill is used for (R1).

```ts
// src/hooks/useCertificatePreview.ts
export function useCertificatePreview(args: {
  templateBytes: ArrayBuffer | undefined;
  build: () => BuildAcord25Result | null;   // null when not ready; input assembled per Section 2.5
  deps: unknown[];                          // state slices; effect re-runs on change
}): {
  blobUrl: string | null;     // object URL of the flattened preview PDF
  building: boolean;
  error: string | null;
  previewSha256: string | null;   // from 05's hashFieldValuesForPreview over the previewed build (R9)
};
```

Behavior spec:
- 500ms debounce on `deps` changes; on fire: run `build()` (letters come from `masterCoi.insurers` as builder INPUT, R7), apply the masking pass (below), call `fillAcordPdf(templateBytes, { fieldValues, flatten: true, updateAppearances: true })` (no addendum options; R16), create a `Blob(['application/pdf'])` object URL, `URL.revokeObjectURL` the previous one; revoke on unmount. Stale-response guard via a monotonic build counter.
- `previewSha256`: computed by calling 05's `hashFieldValuesForPreview(fieldValues)` over the UNMASKED deterministic build's field values (05 Section 4.10 owns the canonical serialization and the `PREVIEW_HASH_EXCLUDED_FIELDS` constant excluding the certificate-number, revision-number, and form-date header fields; this doc cites the helper and never redefines it). Client and server share the identical helper via the parity-tested acord25 module. Stored alongside the blob URL and handed to the Generate request (R9). It is recomputed on every rebuild, so the hash always describes the preview currently on screen.
- Masking pass (constitution.md:57; surface-map.md:52): `maskPreviewFieldValues(fieldValues, fieldSchema)` replaces the value of any field whose `field_schema` type is `ssn`/`ein`/`dob`/`dln` using `maskTaxId`/`maskDob`/`maskDln` from src/components/cc/mask.ts. ACORD 25's field set contains no such fields, so for form 25 this is a no-op, but the pipeline is mandatory so the same preview component serves 125/126/140 later without a PII regression. Masking applies ONLY to the previewed bytes, never to `previewSha256` (which must match the server's unmasked rebuild) and never to anything issued (the server builds the issued PDF itself, R1).
- Render: `<iframe title="Certificate preview" src={blobUrl + '#toolbar=0&navpanes=0'} className="h-full w-full rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised" />` inside a container that maintains a letter aspect ratio (`aspect-[8.5/11] max-h-[80vh]`) and is itself `overflow-hidden`. A ghost icon button "Open preview in a new tab" (`window.open(blobUrl)`) covers browsers whose iframe PDF rendering is degraded; if the iframe errors, swap to a designed fallback tile: "Inline preview is not available in this browser." + that same ghost button.
- States: `building` shows a thin `--cc-accent` progress bar across the top of the preview card (file/progress rule, component-rules.md:97), NOT a spinner, while keeping the previous preview visible underneath (no flashing). No lines selected: content-shaped empty tile with one sentence "Select at least one coverage line to preview the certificate." and no button (the checkboxes are adjacent). No template onboarded (`['acord-template','25','current']` returns nothing): "No ACORD 25 template is onboarded yet. Upload the blank form in ACORD Templates." + outline button "Open ACORD Templates" -> `/acord-templates` (route App.tsx:686-693).
- The preview pane is an `aria-live="polite"` labeled region announcing "Preview updated".

### 4.11 Generate flow (click to issued), server-side per R1

1. Guard: no error-severity issues in the ValidationStrip, else no-op (button disabled anyway). If `masterCoi.review.stale`, the acknowledgment confirm from Section 4.3 runs first.
2. The page takes `previewSha256` from `useCertificatePreview` (the hash of the build currently rendered). If the preview is mid-rebuild (`building === true`), Generate waits for the rebuild to settle (button shows the in-flight state) so the hash always matches what the user sees.
3. Call `useIssueCertificate().mutateAsync(...)` with the Section 2.4 request: `account_id`, `holder_id`, `lines` (each selected line's `policy_id`, canonical `line_key`, the DISPLAYED `insurer_letter` as a cross-check only per R7, and its `per_line` print intent per R3), `description_of_operations`, `remarks`, `supersedes_certificate_id` when reissuing, and `preview_sha256` (R9). NO pdfBytes; the client performs no storage or database writes of any kind (R1).
4. In-flight: Generate button disabled with label "Generating"; thin accent bar on the preview column (component-rules.md:97). Never a bare spinner.
5. Success: toast "Certificate issued"; invalidate `['certificates', accountId]`, `['documents']`, `['master-coi', accountId]`; scroll to `#issuance-log` where the new row renders first with its neutral `Issued` pill (CERT_PILL from 04, R11); trigger a browser download of the PDF from the returned `signed_url` (3600s, from the private `coi-certificates` bucket, R5; parity with the legacy flow's auto-download expectation); the preview stays showing the previewed document. Server `warnings` (e.g. near-expiry lines) render as a dismissible warning-toned note above the log.
6. Failure paths, each designed:
   a. 422 (readiness blocker per R6, endorsement upgrade attempt per R3, letter mismatch per R7, or any 05 validation error): the structured issue list renders in the ValidationStrip verbatim; a toast summarizes "Certificate not issued: {n} issues"; nothing is retried automatically; state is untouched.
   b. 409 "data changed since preview, re-preview required" (R9): an info-toned banner appears above the buttons: "The data behind this certificate changed since your preview. The preview has been refreshed; review it and generate again." The page invalidates `['master-coi', accountId]` and `['endorsement-status', ...]`; the debounced preview rebuilds automatically with a fresh `previewSha256`; per-line toggles re-apply their R3 defaults from the fresh resolution; Generate re-enables once the rebuild settles. No dialog; the banner + refreshed preview IS the re-preview flow. The ghost "Refresh preview" button performs the same refresh manually.
   c. Network/5xx: danger toast with the error plus an inline danger note above the buttons; nothing is retried automatically; state untouched.

There is no Save draft anywhere on this page (R20).

### 4.12 Issuance log consumption and the reissue flow

The full log is `<CertificateIssuanceLog accountId={accountId} variant="full" onReissue={prefillFromSnapshot} />` from 04 (R17). This page implements exactly one callback:

`prefillFromSnapshot(certificate: CertificateListItem)`: the list row carries NO snapshot, so the reissue flow FIRST fetches the full `certificates` row by `certificate.id` (a single SELECT under the staff SELECT policy), and THEN dispatches `hydrateFromSnapshot` reconstructing holder, selected line keys, per-line print intent, description of operations, and remarks from THAT row's snapshot (`CertificateSnapshot`, 04's schema), sets `supersedesCertificateId = certificate.id`, and renders an info banner above the selector: "Reissuing certificate {number}. Generating will mark the original as superseded." The R3 reset still applies: hydrated per-line intents are clamped to the CURRENT holder-resolved endorsement status once `useHolderEndorsementStatus` resolves (an endorsement demoted since the original issue must not silently re-print Y; the clamp surfaces as a warning note on the affected toggle). The original row and PDF are never mutated client-side; supersede stamping happens inside `finalize_certificate_issue` (04).

Everything else in the log (columns, row actions, void dialog, send dialog, events timeline, Restore to Documents) is 04's spec and is not restated here.

### 4.13 Acceptance gates for this surface (enumerated)

1. Archetype fidelity: selector left, live preview right, issuance log beneath, emphasis input/result/audit-trail (surface-map.md:47-53).
2. Exactly one lime fill on the page (Generate); Refresh preview ghost; every other action ghost/tertiary/overflow (constitution.md:42; component-rules.md:9-19).
3. One H1 ("Certificates", R19); skip link + landmarks via AppLayout; `#issuance-log` anchor focusable.
4. Policy rows: uniform typed rows, carrier Chip, StatusPill shared vocab for policy status, cc-num numbers/dates, nothing truncates (component-rules.md:122-124; constitution.md:56).
5. ADDL INSD / SUBR WVD are gated switches wired to `resolve_holder_endorsements` (R2) with R3 semantics: default ON only when holder-resolved endorsed, downgrade only, locked N otherwise, reset on holder change; disabled states carry text reasons, not just grey (constitution.md:37).
6. Expired lines cannot be checked; every blocker uses the canonical vocabulary and message from 02 (R6).
7. PII pipeline: preview masks ssn/ein/dob/dln-typed fields via mask.ts (constitution.md:57; surface-map.md:52). Vacuous for form 25, mandatory mechanism regardless.
8. Validation: color + icon + label, `role="alert"`, aria-describedby wiring to Generate (acceptance-checklist.md:24). Server 422 issues render in the same strip; the 409 re-preview banner is info-toned and auto-refreshes the preview (R9).
9. In-flight: thin `--cc-accent` bar, never a bare spinner (component-rules.md:97,147).
10. Empty states name the next action with at most one button each (component-rules.md:144-147).
11. Keyboard: checkboxes, switches, combobox, overflow menus, dialog and drawer focus traps all reachable; visible 2px focus ring; lime primary uses the dark inner ring (component-rules.md:175-179).
12. Tokens only; both themes pass; tabular figures on all counts/dates/numbers (acceptance-checklist.md:35-40 minus the stale dark-only line).
13. No em/en dashes, including generated copy (constitution.md:59; R22e).
14. No premium anywhere on the surface or the document (05 enforces by construction; the UI never maps it; the read model never exposes it).
15. The client performs zero writes: no storage upload, no documents insert, no certificate insert; the only write path is `supabase.functions.invoke('generate-certificate')` (R1).
16. Certificate status pills come only from 04's CERT_PILL and cover issued/sent/voided/superseded (R11).

---

## 5. Entry-point wiring and System B retirement

### 5.1 Exact edits (all four entry points -> `/certificates`, R19)

1. `src/pages/CustomerDetail.tsx:429` (inside the hero overflow menu):

```tsx
// before
<DropdownMenuItem onSelect={() => navigate(`/coi-generator?accountId=${account.id}`)}>
// after
<DropdownMenuItem onSelect={() => navigate(`/certificates?accountId=${account.id}`)}>
```

Label "New certificate" and `Award` icon stay (CustomerDetail.tsx:430).

2. `src/pages/PolicyDetail.tsx:210` (header button) and `:502` (quick action): both become

```tsx
onClick={() => navigate(`/certificates?accountId=${policy.account!.id}&policyId=${policyId}`)}
```

`policyId` pre-checks that policy's coverage line (Section 4.5). These two plus the palette entry are live entry points the original handoff missed; all four are covered here.

3. `src/components/layout/chrome/navConfig.ts:132`:

```ts
// before
{ label: 'COI Generator', to: '/coi-generator', icon: Award },
// after
{ label: 'Certificates', to: '/certificates', icon: Award },
```

Palette label is "Certificates" (R19). `EXTRA_DESTINATIONS` feeds the command palette (navConfig.ts:110-112), so the palette immediately routes to the new surface in its account-picker mode.

4. `src/App.tsx`:
   - Delete the lazy import at :59 (`COIGenerator`) and the `/coi-generator` route at :678-685.
   - Add `const Certificates = lazyWithRetry(() => import("./pages/Certificates"));` beside the other lazy imports, and:

```tsx
<Route
  path="/certificates"
  element={
    <ProtectedRoute>
      <ErrorBoundary level="page" resetOnPropsChange>
        <Certificates />
      </ErrorBoundary>
    </ProtectedRoute>
  }
/>
```

Note this ADDS `ProtectedRoute`, which the legacy route lacked (App.tsx:678-685 has ErrorBoundary only, unlike `/customers/:id` at :256-265). Certificates expose customer coverage data; the auth gate is not optional.

### 5.2 Rollout: repoint-to-scaffold (R15, Phase 1 of 01-disposition-and-roadmap.md)

This doc's repoint-to-scaffold plan is the adopted module rollout for Phase 1, and 01-disposition-and-roadmap.md's Phase 1 scope and acceptance criteria match it: this module's FIRST PR repoints all four entry points (CustomerDetail.tsx:429, PolicyDetail.tsx:210 and :502, navConfig.ts:132) to `/certificates` rendering a designed scaffold (CustomerPickerEmptyState plus honest "coming online" empty states for the not-yet-wired blocks), deletes the `/coi-generator` route, and deletes the System B frontend files in the SAME PR, matching 01's Phase 1 single edit list (mechanical, zero data migration; prod has 0 rows in `certificates_of_insurance`, 0 objects in both legacy buckets): `src/pages/COIGenerator.tsx`, `src/hooks/useCOIGeneration.ts`, `src/hooks/useCOI.ts`, `src/lib/pdfGenerator.ts`, `src/lib/PDFLayoutManager.ts`, `src/types/coi.ts`, `src/lib/validators/coi.ts`, `src/lib/utils/queue.ts`; the same PR removes the `generate-coi-data` edge function (its only caller is COIGenerator.tsx:220). There is NO separate cleanup PR. No months-long affordance gap; no feature flag. The same PR closes the legacy route's missing-ProtectedRoute hole.

System B retirement leftovers (sequenced by 01):
- `send-coi-email` is NOT deleted: it is reworked and owned by 04-issuance-and-snapshots.md (attachment-only from the `coi-certificates` bucket; contract {certificate_id, to, cc?, note?}); the log's Send action uses 04's `SendCertificateDialog`.
- Leave in the database: `certificates_of_insurance` and companions until 01's demolition phase (the customer-merge engine names the table at supabase/migrations/20260622160000_customer_merge_transactional_v1.sql:190,335,751). Leave both legacy storage buckets; the PUBLIC legacy `certificates` bucket and the PUBLIC `documents` bucket are flagged in 01 as a separate hardening task outside this module (R5). Issued PDFs live exclusively in the new private `coi-certificates` bucket (R5, owned by 04).

### 5.3 Cross-link inventory (complete)

| From | To | Mechanism |
|---|---|---|
| Hero overflow "New certificate" (CustomerDetail.tsx:429) | Certificates page | `/certificates?accountId=` |
| Master COI panel header "New certificate" | Certificates page | same |
| PolicyDetail x2 (:210, :502) | Certificates page, line pre-checked | `...&policyId=` |
| Command palette "Certificates" | Certificates page (account picker mode) | `/certificates` |
| Generator line-row blocker note "Open Master COI" | Master COI panel | `/customers/{id}?tab=master-coi` (scrolls via CustomerDetail.tsx:246-256) |
| Generator toggle "Manage in Master COI" (no endorsement) | Master COI panel | same |
| Issuance log "View in documents" (04's action) | Documents section | `/customers/{id}?tab=documents` |
| Issued cert PDF | Documents tab row | the server-inserted `documents` pointer row (`document_type 'coi'`, `storage_bucket 'coi-certificates'`, R5) appears with zero UI wiring; fetch has no type filter (useDocumentManager.ts:41-45); same-page invalidation of `['documents']`; View/Download resolve signed URLs because useDocumentManager tries `doc.storage_bucket` first |
| Master COI compact log "View all certificates" | Full issuance log | `/certificates?accountId=...#issuance-log` |
| HolderField "View in Additional Insureds" | Directory record (03) | 03's route; reference only |
| Additional Insureds index "Issue certificate" action (03's scope) | Certificates page with holder preselected | `/certificates?accountId=...&holderId=...` (param supported here) |

Known nicety, explicitly deferred with rationale: the Documents tab category badge reads `documents.category` (enum with no COI value) rather than `document_type` (CustomerDocumentsSection.tsx:162-166), so the COI row shows title/size/date but no badge. Correct fix is updating the badge to prefer `document_type`, which touches a sibling component outside this module's surface set; file it as a one-line follow-up rather than silently widening scope. The row itself appears regardless.

---

## 6. Sequencing (explicit build order for the implementing engineer)

Dependencies: 02 (get_master_coi, mutations, resolve_holder_endorsements), 05 (builder, validator, fieldMap, template onboarding), 04 (certificates schema, generate-certificate, CertificateIssuanceLog, src/types/certificates.ts), and 03 (drawer + search) land first or in parallel; this UI work is staged so each PR is shippable. Phase numbering aligns with 01-disposition-and-roadmap.md.

1. PR A (no backend dependency; = 01 Phase 1 per R15): route scaffold plus System B frontend deletion, one PR. Create `Certificates.tsx` with CustomerPickerEmptyState + designed "coming online" states, add the `/certificates` route (ProtectedRoute + ErrorBoundary), repoint all four entry points, remove the `/coi-generator` route, rename the navConfig entry to "Certificates", and delete the System B frontend files and the `generate-coi-data` edge function per Section 5.2 (01's Phase 1 single edit list). The app never links to System B again, and no System B frontend code survives Phase 1.
2. PR B (needs 02's hooks): `MasterCOISection` + all `src/components/master-coi/*` children (rows over the cell contract, drawer with the per-AI-row endorsement editor, insurer preview, defaults block, review stamp), SECTION_IDS + section insertion in CustomerDetail. The compact `CertificateIssuanceLog` slot renders nothing until PR D's dependency (04's component) exists, gated by module presence, if sequencing demands.
3. PR C (needs 05's builder + onboarded template + 03's holder search/drawer + 02's resolve_holder_endorsements): generator left column (PolicyLineSelector with the R3 toggle gate, HolderField, OperationsAndRemarksFields, ValidationStrip) + `useCertificatePreview` (with previewSha256) + CertificatePreview + `useHolderEndorsementStatus`.
4. PR D (needs 04: generate-certificate, reader, log component): `useIssueCertificate`, the full Generate flow including the 409 re-preview flow, `CertificateIssuanceLog` consumption (full on /certificates, compact in the panel), reissue hydration via `onReissue` (fetch full row by id, then hydrate from its snapshot, Section 4.12).

Each PR's review gate: the enumerated acceptance lists (3.14, 4.13) plus both-theme screenshots.

---

## 7. Risks

- The `MasterCOI` cell contract (02) is the load-bearing seam; it is now the single canonical shape (R21), so drift risk moved from "two contracts disagree" to "the UI misreads a cell". Mitigation: `src/types/master-coi.ts` is imported, never redeclared, and the panel renders `src: 'missing'` cells explicitly so a contract mismatch is visible, not silent.
- Iframe PDF preview fidelity varies by browser; the design mandates the open-in-new-tab escape hatch and a detection fallback (4.10), but QA must cover Safari specifically.
- Holder-scoped endorsement resolution requires per-holder schedule data that is bimodal in prod (extraction-rich vs manual-empty); expect most manual lines to sit at `none` until Master COI editing backfills them, which makes the locked-N toggle the common first-run experience. The inline "Manage in Master COI" link is the mitigation; copy must stay encouraging, not scolding.
- The R9 hash binding depends on the client builder and the Deno port producing byte-identical canonical builds; 05's parity fixture is the guard. If parity breaks, the symptom is spurious 409s; the re-preview banner keeps the failure non-destructive, and the parity test keeps it caught pre-merge.
- `?tab=master-coi` deep links depend on the SECTION_IDS addition landing with the panel (PR B); the generator's cross-links (PR C) must not ship first or they scroll nowhere (harmless but sloppy; ordering in Section 6 prevents it).
- StatusPill override labels introduced here (ADDL_PILL, SUBR_PILL) become de facto app vocabulary; they live in one file (endorsementPills.ts) and any future surface must import rather than restate them. Certificate status vocabulary (CERT_PILL) is owned by 04 next to CertificateIssuanceLog (R11, R17); this doc deliberately owns none of it.
- R3's default-ON toggles print Y by default on endorsed lines. This is the resolved semantic (server-derived, downgrade-only, 422 on upgrade), but it means an endorsement wrongly marked `endorsed` in Master COI propagates to certificates by default. The mitigation is upstream and by design: `set_line_ai_endorsement` refuses `endorsed` without a form reference or document evidence, and the transition is audited (02).
