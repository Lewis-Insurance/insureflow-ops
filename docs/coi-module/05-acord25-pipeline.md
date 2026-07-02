# 05: ACORD 25 Pipeline: Template Onboarding, Ingestion Fixes, Fill Payload Builder, Validation, Deno Port, and Testing

Final, implementation-ready area design for the Master COI / Additional Insureds / ACORD 25 module.
Repo: /Users/brianlewis/insureflow-ops. All file:line cites verified against source on 2026-07-02.
This doc incorporates the binding orchestrator resolutions R1, R3, R7, R8, R9, R16, R18, R21, and R22(d)(e). Where this doc previously disagreed with a sibling, the resolution text wins and is reflected here.

Sibling docs (final filenames, all in docs/coi-module/):
- 01-disposition-and-roadmap.md: phases, entry-point repoint, retirement of legacy systems.
- 02-master-coi-data-layer.md: get_master_coi, resolve_holder_endorsements, readiness blockers, the insurer letter algorithm (SQL, the single authority), the canonical line-key mapping table.
- 03-additional-insureds-directory.md: additional_insureds table, holder dedup/merge.
- 04-issuance-and-snapshots.md: public.certificates, generate-certificate, finalize_certificate_issue, the coi-certificates bucket, send-coi-email, CertificateIssuanceLog, src/types/certificates.ts.
- 06-ui-surfaces.md: the /certificates route, the Master COI panel, the generator UI, the RemarksField counter.

This design resolves handoff open question 2 (XFA ingestion) and Section 5 domain mechanics (field ID discipline, insurer letters, Y/N literals, never-print-premium, overflow, edition pinning, fill verification). It builds strictly on the locked decisions: reuse and fix System A (acord_templates / acord_forms / pdfFiller), issued COIs are immutable snapshots (owned by 04-issuance-and-snapshots.md; this design produces the deterministic payload they freeze), and real per-line, holder-resolved Additional Insured endorsement status with a "requested but not yet endorsed" state that never prints Y.

Ground-truth corrections internalized throughout: the XFA rejection at src/lib/acord/templateIngestion.ts:88-96 is dead code (raw string keys into pdf-lib PDFDict.get always return undefined), pdf-lib 1.17.1 getForm() auto-strips XFA, so ACORD 25 onboarding is NOT blocked; the fix is small and is specified exactly in Section 1.

---

## 0. Summary of decisions made in this document

| # | Decision | One-line rationale |
|---|----------|--------------------|
| D1 | Replace the dead XFA check with PDFName-based detection run before getForm(); warn-not-reject hybrids that carry AcroForm fields; reject only zero-field PDFs | Matches actual pdf-lib behavior; hybrids already ingest today, we just make it honest and safe |
| D2 | Store sanitized bytes (pdfDoc.save() after getForm() stripped XFA) instead of the raw upload; record pdf_type 'acroform_hybrid' honestly | The stored template is served raw to Adobe via the Download button (useAcordTemplates.ts:158-169, AcordTemplates.tsx preview/download); a lingering XFA packet would render the wrong layer there |
| D3 | Bypass SECTION_PATTERNS for ACORD 25 (do NOT author new section regexes) | Master COI generation does not route through the section editor; regexes against unverified names are risk with zero payoff |
| D4 | Introduce a committed logical field map (src/lib/acord/acord25/fieldMap.ts) as the single contract between Master COI data and the extracted PDF field names, with a pinned template sha256 | Field names come only from the licensed blank; code must never invent them; the pin defeats lookalikes and edition drift at runtime |
| D5 | Payload builder is a pure, total function: it emits a value for EVERY mapped field (empty string for unused) | Partial payloads would leave stale insurer/limit values across rebuilds; totality makes every rebuild self-contained |
| D6 | ADDL INSD / SUBR WVD print values derive from HOLDER-RESOLVED endorsement status plus a downgrade-only user intent: Y only when resolved endorsed AND not downgraded (R3); routed as TEXT fields with literal 'Y'/'N' | pdfFiller checkbox truthiness ('y','yes','1','x' truthy at pdfFiller.ts:401-406) cannot represent an explicit N; locked decision 5 forbids Y for a holder without an endorsement |
| D7 | The builder does NOT assign insurer letters. It takes the letter map from get_master_coi as INPUT (R7); the algorithm lives ONCE, in SQL, in 02-master-coi-data-layer.md. This doc's original NAIC-split and policy_number tiebreak rules were adopted INTO that SQL algorithm. The validator's V6 remains as an independent cross-check | One assigner means panel, preview, and issued cert can never disagree; V6 keeps the belt-and-suspenders defense for the looks-right-but-wrong class |
| D8 | Premium is excluded structurally: the builder input types have no premium field at all, plus a sentinel-leak unit test | A value-scanning rule would false-positive (a 1,000,000 premium equals a 1,000,000 limit); type-level exclusion is the only sound guarantee |
| D9 | Overflow on Description of Operations: hard pre-generation block; authored soft char limits; NO silent truncation, NO addendum page on issued certs (adopted module-wide as R16) | pdfFiller truncates silently today (pdfFiller.ts:180-183); a non-ACORD addendum page on an ACORD 25 is nonstandard paper; ACORD 101 is the correct future continuation form |
| D10 | Cross-field validation is a dedicated pure validateAcord25() function as the primary gate; rules-as-data are still authored on the template row for the generic editor's single-field checks | validateForm supports only single-field required/conditional_required (src/types/acord.ts:86-97, useAcordForms.ts:456-566); letter resolution and payload-total checks need payload+selection context JSON rules cannot express |
| D11 | Holder swap in the PREVIEW regenerates the full fill; no base+overlay caching. Issuance always rebuilds server-side regardless | Fill is client-side pdf-lib on a 1-page form (well under a second); the deterministic builder makes regeneration exactly reproducible |
| D12 | Visual testing: add ONE dev dependency, pdfjs-dist (its optional @napi-rs/canvas gives Node rendering); the visual test is env-gated on the licensed blank and skipped in CI; CI runs a synthetic-fixture round-trip instead | The licensed blank must never be committed, so CI must never need it |
| D13 | The pure pipeline modules are ported verbatim into supabase/functions/_shared/acord25/ for the generate-certificate edge function, kept in sync by a script plus a CI hash check, and guarded by a parity-fixture test shared by the client and Deno builds (R1) | Server-side generation is the ONLY issuance path; the client build is preview-only; the parity fixture makes drift between the two builds a test failure, not a production surprise |
| D14 | The builder's output vocabulary IS the snapshot schema (R8): snapshot.field_values is Record<string, string \| boolean>, booleans for checkboxes, literal 'Y'/'N'/'' for ynText, formatted strings otherwise; no '/1' or '/Off' export-value strings anywhere | The snapshot exists for byte-equivalent re-render through the same fill core; export-value strings would be falsy to toBooleanValue and uncheck every box on replay |
| D15 | The deterministic build powers preview_sha256 (R9): one canonical serialization of fieldValues, hashed sha256, computed by a shared helper on both client and server; the server returns 409 on mismatch | Binds the preview the user visually verified to the certificate the server issues |
| D16 | The builder consumes the cell-based Master COI contract from src/types/master-coi.ts (R21) through ONE adapter (fromMasterCoi.ts) used by both the client preview and the Deno port | One adapter means the preview and the issued cert are built from identical projections of the same read model |
| D17 | Canonical line keys are 'gl','auto','umbrella','wc','property','other' (R7). On the ACORD 25 form, property and other both map to the single OTHER row; selecting two lines that target the OTHER row is a build error with two-certificate guidance | The 2016/03 ACORD 25 has exactly one OTHER row; the conflict must be caught before fill, not discovered as an overwrite |
| D18 | Description of operations and Remarks are TWO separate builder inputs (R18) joined deterministically into the single printed box; the overflow check runs over the joined string | Matches the generate-certificate request and snapshot contract; the join rule is exact so the UI counter and the validator agree |

No new database tables, columns, or RPCs are required by this area. The only DB writes are configuration on the existing acord_templates row (validation_rules JSONB, pdf_type VARCHAR(20) which has no CHECK constraint, migration 20251218204626_acord_form_automation_suite.sql:15).

### 0.1 Canonical line keys and the ACORD 25 row mapping

The canonical line-key enum is defined once (R7): `'gl' | 'auto' | 'umbrella' | 'wc' | 'property' | 'other'`. The single published mapping table from line keys to (a) the certificate_policies CHECK vocabulary and (b) display names lives in 02-master-coi-data-layer.md. This doc adds the pipeline-specific third column: which ACORD 25 form row each line key prints on.

| Line key | ACORD 25 form row | Logical field prefix (Section 3) |
|----------|-------------------|----------------------------------|
| gl | COMMERCIAL GENERAL LIABILITY | gl_ |
| auto | AUTOMOBILE LIABILITY | auto_ |
| umbrella | UMBRELLA LIAB / EXCESS LIAB | umb_ |
| wc | WORKERS COMPENSATION AND EMPLOYERS' LIABILITY | wc_ |
| property | OTHER | other_ |
| other | OTHER | other_ |

The 2016/03 edition has exactly one OTHER row. If the selected lines include more than one line that maps to the OTHER row (a property line plus an other line, or two other lines), the builder returns the OTHER_ROW_CONFLICT error: "The ACORD 25 has one OTHER coverage row and this selection needs <n>. Uncheck lines or issue two certificates." A property line printed on the OTHER row sets other_type to the line's display name from the 02 mapping table and composes other_limitsText per Section 4.7.

---

## 1. Ingestion fixes (small, per ground truth)

### 1.1 What is wrong today (verified)

- src/lib/acord/templateIngestion.ts:88-96 attempts XFA rejection with raw string keys: `pdfDoc.catalog.lookup(pdfDoc.catalog.get('AcroForm' as any) as any)`. pdf-lib PDFDict.get requires an interned PDFName key, so this always returns undefined and the branch never fires. Dead code.
- The same dead pattern exists in validatePdfForAcord at templateIngestion.ts:453-459, and worse, that function calls getForm() at line 450 BEFORE the XFA check; pdf-lib 1.17.1 getForm() auto-deletes XFA with a console.warn, so isXFA is always false by the time it is computed.
- uploadTemplate stores the RAW uploaded file (useAcordTemplates.ts:158-164), so a hybrid upload keeps its XFA packet in storage even though every pdf-lib consumer strips it in memory. The template Download button then serves that raw file to Adobe, which may render the XFA layer instead of the AcroForm layer.
- pdf_type is hardcoded 'acroform' at templateIngestion.ts:165 regardless of the upload.
- Dialog copy at src/pages/AcordTemplates.tsx:200-202 says "XFA forms are not supported", documenting an intent the code does not (and should not) enforce.

### 1.2 Exact changes

#### 1.2.1 src/lib/acord/templateIngestion.ts

Add imports (line 6):

```ts
import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup, PDFButton, PDFName, PDFDict } from 'pdf-lib';
```

Add a module-level helper (place after the SECTION_PATTERNS block, around line 69):

```ts
/**
 * PDFName-based XFA detection. MUST run before any getForm() call:
 * pdf-lib getForm() auto-deletes the XFA entry on access.
 */
export function hasXfaPacket(pdfDoc: PDFDocument): boolean {
  const acroForm = pdfDoc.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
  return !!acroForm?.has(PDFName.of('XFA'));
}
```

Replace the dead check at lines 88-96 inside ingestAcordTemplate with:

```ts
// Detect XFA BEFORE getForm() (getForm auto-strips the XFA entry)
const isXfaHybrid = hasXfaPacket(pdfDoc);
```

After the existing zero-field rejection (lines 102-104 semantics stay: `fields.length === 0` is still the only hard rejection, but reword the error when XFA was present):

```ts
if (fields.length === 0) {
  errors.push(
    isXfaHybrid
      ? 'This PDF is XFA-only (no AcroForm fields). Export or re-download an AcroForm version of the form.'
      : 'No form fields found in PDF. Please upload a fillable AcroForm PDF.'
  );
  return { success: false, fieldInventory: [], fieldSchema: [], sections: [], errors, warnings };
}
if (isXfaHybrid) {
  warnings.push(`XFA form data detected and removed. ${fields.length} AcroForm fields were preserved and will be used for filling.`);
}
```

Change the template object (line 165) to record honestly:

```ts
pdf_type: isXfaHybrid ? 'acroform_hybrid' : 'acroform',
```

Extend TemplateIngestionResult (lines 13-21) with sanitized output:

```ts
export interface TemplateIngestionResult {
  success: boolean;
  template?: Partial<AcordTemplate>;
  fieldInventory: FieldInventoryItem[];
  fieldSchema: FieldSchemaItem[];
  sections: SectionDefinition[];
  sanitizedBytes?: Uint8Array;   // NEW: pdfDoc.save() after getForm() stripped XFA
  errors: string[];
  warnings: string[];
}
```

and produce it just before the success return (after line 174):

```ts
const sanitizedBytes = new Uint8Array(await pdfDoc.save());
```

Rework validatePdfForAcord (lines 440-482): detect XFA BEFORE getForm(), never fail on XFA alone, add warnings:

```ts
export async function validatePdfForAcord(pdfBytes: Uint8Array | ArrayBuffer): Promise<{
  valid: boolean;
  isAcroForm: boolean;
  isXfaHybrid: boolean;
  fieldCount: number;
  errors: string[];
  warnings: string[];
}> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const isXfaHybrid = hasXfaPacket(pdfDoc);   // before getForm()
    const fields = pdfDoc.getForm().getFields();
    return {
      valid: fields.length > 0,
      isAcroForm: fields.length > 0,
      isXfaHybrid,
      fieldCount: fields.length,
      errors: fields.length === 0
        ? [isXfaHybrid ? 'XFA-only PDF: no AcroForm fields to fill' : 'No form fields found']
        : [],
      warnings: isXfaHybrid && fields.length > 0
        ? ['XFA data present; it will be removed at upload and the AcroForm fields kept']
        : [],
    };
  } catch (error) {
    return { valid: false, isAcroForm: false, isXfaHybrid: false, fieldCount: 0, warnings: [], errors: [error instanceof Error ? error.message : 'Failed to parse PDF'] };
  }
}
```

(Drop the pointless `new Promise(async ...)` wrapper while there; make it a plain async function. Callers at useAcordTemplates.ts:146 and 414 are await-based and unaffected.)

#### 1.2.2 src/hooks/useAcordTemplates.ts

In uploadTemplate, upload the sanitized bytes instead of the raw file. Replace lines 158-164:

```ts
const fileName = `acord-templates/${options.formNumber}/${options.version}/${file.name}`;
const { error: uploadError } = await supabase.storage
  .from('documents')
  .upload(fileName, result.sanitizedBytes ?? pdfBytes, {
    cacheControl: '3600',
    contentType: 'application/pdf',
    upsert: true,
  });
```

The templateData insert at lines 184-199 already copies result.template.pdf_type, so 'acroform_hybrid' flows through with no further change. validatePdf (lines 410-422) should also surface warnings: change its return type to `{ valid: boolean; errors: string[]; warnings: string[] }` and pass result.warnings through.

Note on storage: blank templates and working-copy PDFs for /acord-forms stay in the documents bucket per R5. Only ISSUED certificate PDFs go to the private coi-certificates bucket, which is owned end to end by 04-issuance-and-snapshots.md. Nothing in this section touches issued artifacts.

#### 1.2.3 src/types/acord.ts

Line 17, extend the union:

```ts
pdf_type: 'acroform' | 'acroform_hybrid' | 'xfa' | 'static';
```

(DB column is VARCHAR(20) with no CHECK, migration 20251218204626:15; 'acroform_hybrid' is 15 chars; no migration needed.)

#### 1.2.4 src/pages/AcordTemplates.tsx

- Dialog copy, lines 200-202: replace with "Upload a fillable PDF ACORD form. AcroForm PDFs are supported. XFA-hybrid PDFs are accepted; the XFA layer is removed automatically and the AcroForm fields are kept."
- handleFileSelect (lines 103-121): keep the destructive toast only for `!result.valid`; when valid with warnings, show a default-variant toast with the warning text and render an amber inline note in the validation block (lines 214-228) alongside the existing green "PDF is valid" state:

```tsx
{validationResult?.valid && validationResult.warnings?.length > 0 && (
  <div className="flex items-center gap-2 text-sm text-warning">
    <AlertCircle className="h-4 w-4" />
    {validationResult.warnings[0]}
  </div>
)}
```

(Use the semantic warning token per Calm Command; no new lime element. Upload button gating at lines 294-296 is unchanged: warnings do not disable Upload.)

### 1.3 SECTION_PATTERNS: bypass, do not extend (D3)

Decision: do NOT add ACORD 25 entries to SECTION_PATTERNS (templateIngestion.ts:39-68). All ACORD 25 fields will land in "Section 1: Applicant Information" via the detectSection default (templateIngestion.ts:289-296). This is accepted and documented.

Justification:
1. The Master COI generation path is the generate-certificate edge function (R1, 04-issuance-and-snapshots.md), which rebuilds field_values from DB truth server-side. The section-driven AcordFormEdit UX is not on the ACORD 25 golden path at all. acord_forms rows are optional provenance (source_form_id) only.
2. Section-completion tracking is effectively dormant anyway: the live create path (FormManagement.tsx handleCreateForm) never seeds acord_form_sections rows; only the unused useAcordForms.createForm does (ground truth, confirmed against useAcordForms.ts:167-176).
3. Authoring regexes against field names we have not extracted yet (the blank is not in the repo) invites miscategorization for zero functional payoff. Section membership drives nothing in the fill pipeline.
4. If Brian later wants the generic editor to look nicer for form 25, patterns can be added in a follow-up once real names are known; nothing in this design forecloses that.

One side effect to note in the runbook: detectRepeaterConfigs (templateIngestion.ts:367-409) auto-detects `Prefix_N` numeric-suffix names. ACORD 25 letter-suffixed names (`..._A`) will not match, but any numeric-suffixed address-line fields might produce a junk repeater config. Harmless: fillAcordPdf never reads repeater_configs (ground truth; grep confirms no consumer), and the runbook has a checklist item to eyeball the extracted repeater_configs and expect them to be empty or ignorable.

### 1.4 validateAcordFields: add '25' expected fields wired to the field map

templateIngestion.ts:411-434 warns when expected fields are missing, keyed by form number; today only 125/126/127/130/140 exist. Add:

```ts
import { ACORD25_EXPECTED_FIELD_NAMES } from './acord25/fieldMap';
...
const expectedFields: Record<string, string[]> = {
  ...existing entries...,
  '25': ACORD25_EXPECTED_FIELD_NAMES,
};
```

ACORD25_EXPECTED_FIELD_NAMES is exported from the committed field map (Section 3) so the ingestion warning list and the fill contract can never drift apart. It ships as an empty array in the pre-onboarding PR (no warnings emitted for an empty list; the loop at 424-431 iterates zero times) and is populated in the onboarding PR with the ~15 critical names (producer name, insured name, insurer A name, insurer A NAIC, GL policy number, GL effective/expiration, GL each occurrence, auto CSL, WC E.L. each accident, description of operations, holder name, certificate date, authorized representative). Re-uploading a future ACORD edition then warns immediately if any critical field name changed.

---

## 2. Template onboarding runbook (ACORD 25)

### 2.1 Prerequisite (Brian-side, blocking, kicked off in Phase 0)

Acquire a licensed blank fillable ACORD 25 PDF. None exists in the repo (verified: zero PDFs under public/, src/, supabase/; form 25 is only a metadata stub at src/types/acord.ts:477). Sources: the ACORD Forms portal (agency license) or the agency management system's forms library. Record the source and license identifier; they go into license_notes at upload.

Per R22(d) and 01-disposition-and-roadmap.md, Brian initiates this acquisition as a parallel non-code task in Phase 0, because it gates Phases 2, 3, and 5. Do not wait for the ingestion PR to merge before starting procurement.

A placeholder or lookalike must never be used. Three independent guards enforce this:
1. Process: the upload dialog requires license_notes for the 25 (runbook step; the verify script hard-fails on empty license_notes for form 25).
2. Pin: the sanitized stored bytes are sha256-hashed and the hash is committed into the field map (Section 3). Both the client preview and the generate-certificate edge function refuse to fill when the fetched template hash does not match ACORD25_TEMPLATE_SHA256 (validator rule V9, enforced in both builds via the Deno port, Section 7). A swapped or "similar" PDF cannot generate.
3. Human render gate: the verify script's --render mode rasterizes page 1 for visual confirmation against the official form before the field map PR merges.

### 2.2 Onboarding steps (exact)

Step 0. Merge the ingestion-fixes PR (Section 1) first. Do not onboard on the current code: the raw-bytes upload would store the XFA packet.

Step 1. Upload. Go to /acord-templates (route wired in src/App.tsx), click Upload Template. Select the licensed blank. Form Number: "25" (already in the ACORD_FORMS dropdown, src/types/acord.ts:469-480 feeding AcordTemplates.tsx:248-253). Version: the ACORD edition date from the form's footer, formatted `YYYY-MM` (e.g. "2016-03"); this pins the edition per handoff Section 5 (UNIQUE(form_number, version) and the is_current partial index already enforce versioning, migration 20251218204626:28,32-33). License Notes: source + license id, required. Expect a warning toast if the blank is an XFA hybrid ("XFA form data detected and removed..."); that is fine. Expect the "N fields detected" success toast.

Step 2. Dump the extraction. Run:

```
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/acord25/verify-template.ts --dump
```

This prints the field_inventory as a table: name, type, page, rect, maxLength, options (export values for checkboxes/radios). Save the output; it is the raw material for the field map.

Step 3. Author the field map. Fill in src/lib/acord/acord25/fieldMap.ts (Section 3) by matching each logical key to an extracted field name. Spot-check names against the ACORD naming convention `Subject_Attribute[_Qualifier]_Instance` (e.g. `Policy_GeneralLiability_EffectiveDate_A`); the convention is a sanity check, not an assumption: whatever the blank actually contains wins. Record per-field kind (text / ynText / checkbox / multilineText / date / limit), checkbox export values copied verbatim from field_inventory.options, and softCharLimit for the Description of Operations box (measure: fill with a counting string, render with --render, count visible characters). The softCharLimit constant is load-bearing beyond this pipeline: the RemarksField character counter in 06-ui-surfaces.md binds to it (R16).

Step 4. Verify. Run:

```
npx tsx scripts/acord25/verify-template.ts --check
```

Hard checklist enforced by the script (all must pass):
- [ ] Template row exists for form_number 25 with is_current = true, pdf_type in ('acroform','acroform_hybrid').
- [ ] license_notes non-empty; version matches /^\d{4}-\d{2}$/.
- [ ] Stored PDF has exactly 1 page (ACORD 25 is single page; ACORD_FORMS pages: 1 at acord.ts:477).
- [ ] Field count >= 80 (the real 25 has on the order of 100+ fields; a lookalike stub will not).
- [ ] Every field map entry resolves to a field_inventory item with the matching pdf-lib type (ynText and date and limit and multilineText map to type 'text'; checkbox maps to 'checkbox').
- [ ] All 6 insurer rows resolve: insurerName_A..F and insurerNaic_A..F.
- [ ] All per-line INSR LTR, policy number, effective, expiration, ADDL INSD, SUBR WVD, and limit fields resolve for GL, Auto, Umbrella/Excess, WC.
- [ ] ADDL INSD / SUBR WVD fields are text type. If the blank exposes them as checkboxes instead, the script does not fail but prints a loud notice: flip those entries to kind 'checkbox' in the field map (Section 4.5 fallback) and re-run.
- [ ] sha256 of the stored sanitized bytes equals fieldMap.templateSha256 (on first run the script prints the hash to paste into the map).
- [ ] Unmapped inventory fields are listed (informational) so nothing important was missed.
- [ ] repeater_configs on the row are empty or reviewed-and-ignored.

Step 5. Human render gate. Run `--render` (requires the pdfjs-dist dev dep, Section 6.3): writes page 1 PNG of (a) the blank and (b) a sample fill produced by buildAcord25FieldValues over the committed sample fixture. Compare visually with the official form: every value in the right box, letters aligned, limits legible at font size 10, nothing clipped.

Step 6. Publish rules. Run:

```
npx tsx scripts/acord25/publish-template-config.ts --yes
```

Writes the authored validation_rules JSON (Section 5.1) onto the template row via the existing update path semantics (equivalent to useAcordTemplates.updateTemplate, useAcordTemplates.ts:249-291, which already persists validation_rules but has no caller today).

Step 7. Sync the Deno port and regenerate the parity fixture. Run:

```
npx tsx scripts/acord25/sync-deno-port.ts
npx tsx scripts/acord25/regen-parity-fixture.ts
```

(Section 7. The sync copies the now-populated pure modules into supabase/functions/_shared/acord25/; the fixture regen records the new expected fieldValues and preview sha256.)

Step 8. Commit the onboarding PR: populated fieldMap.ts (names, kinds, export values, softCharLimit, templateSha256), populated ACORD25_EXPECTED_FIELD_NAMES, validationRules.ts, the synced Deno copies, the regenerated parity fixture, and the updated golden payload snapshot (Section 8.4).

### 2.3 Files to create for the runbook

- scripts/acord25/verify-template.ts (modes: --dump, --check, --render; uses @supabase/supabase-js with SUPABASE_SERVICE_ROLE_KEY from env; --render dynamically imports pdfjs-dist and skips with a message if absent)
- scripts/acord25/publish-template-config.ts (reads src/lib/acord/acord25/validationRules.ts, diffs against the row, requires --yes to write)
- scripts/acord25/sync-deno-port.ts and scripts/acord25/check-deno-port-sync.ts (Section 7.2)
- scripts/acord25/regen-parity-fixture.ts (Section 7.3)

All are operator tools, excluded from the Vite build and from vitest (vitest.config.ts include patterns cover only src/**).

---

## 3. The logical field map: the contract layer

File to create: src/lib/acord/acord25/fieldMap.ts (ported verbatim to supabase/functions/_shared/acord25/fieldMap.ts, Section 7).

Never hardcode PDF field names inside builder logic. The builder produces values keyed by logical keys; a thin mapper translates logical keys to the exact extracted names. This keeps CI testable without the licensed PDF (the synthetic fixture uses the committed names) and makes edition upgrades a data change.

Note on naming: the logical key prefixes (gl_, auto_, umb_, wc_, other_) name ACORD 25 FORM ROWS. The canonical line keys ('gl','auto','umbrella','wc','property','other') name coverage lines in the Master COI read model. Section 0.1 is the mapping between the two; in particular both 'property' and 'other' lines print through the other_ prefixed logical keys.

```ts
export type Acord25FieldKind =
  | 'text'          // plain single-line text
  | 'multilineText' // description of operations, holder address block
  | 'date'          // MM/DD/YYYY string, builder-formatted
  | 'limit'         // thousands-separated integer string, builder-formatted
  | 'ynText'        // literal 'Y' | 'N' | '' one-char code field
  | 'checkbox';     // boolean; export value handled by pdf-lib check()

export interface Acord25FieldMapEntry {
  pdfField: string;            // EXACT name from field_inventory, authored at onboarding
  kind: Acord25FieldKind;
  maxLength?: number;          // copied from field_inventory at onboarding for visibility
  softCharLimit?: number;      // authored visual capacity (multilineText only)
  exportValue?: string;        // checkbox 'on' export value from field_inventory.options, informational
  dollarPrefixOnForm?: boolean;// true when the $ is preprinted next to the box (limit fields)
}

export type Acord25LogicalKey =
  // header
  | 'certificateDate' | 'certificateNumber' | 'revisionNumber'
  // producer block
  | 'producerName' | 'producerAddress' | 'producerContactName'
  | 'producerPhone' | 'producerFax' | 'producerEmail'
  // insured block
  | 'insuredName' | 'insuredAddress'
  // insurer table (A-F)
  | `insurerName_${InsurerLetter}` | `insurerNaic_${InsurerLetter}`
  // GL row
  | 'gl_insrLtr' | 'gl_policyNumber' | 'gl_effDate' | 'gl_expDate'
  | 'gl_addlInsd' | 'gl_subrWvd'
  | 'gl_occurCheckbox' | 'gl_claimsMadeCheckbox'
  | 'gl_aggPerPolicyCheckbox' | 'gl_aggPerProjectCheckbox' | 'gl_aggPerLocCheckbox'
  | 'gl_eachOccurrence' | 'gl_damageToRented' | 'gl_medExp'
  | 'gl_personalAdvInjury' | 'gl_generalAggregate' | 'gl_productsCompOpAgg'
  // Auto row
  | 'auto_insrLtr' | 'auto_policyNumber' | 'auto_effDate' | 'auto_expDate'
  | 'auto_addlInsd' | 'auto_subrWvd'
  | 'auto_anyAutoCheckbox' | 'auto_ownedOnlyCheckbox' | 'auto_scheduledCheckbox'
  | 'auto_hiredCheckbox' | 'auto_nonOwnedCheckbox'
  | 'auto_combinedSingleLimit' | 'auto_biPerPerson' | 'auto_biPerAccident' | 'auto_propertyDamage'
  // Umbrella/Excess row
  | 'umb_insrLtr' | 'umb_policyNumber' | 'umb_effDate' | 'umb_expDate'
  | 'umb_addlInsd' | 'umb_subrWvd'
  | 'umb_umbrellaCheckbox' | 'umb_excessCheckbox'
  | 'umb_occurCheckbox' | 'umb_claimsMadeCheckbox'
  | 'umb_dedCheckbox' | 'umb_retentionCheckbox' | 'umb_dedRetAmount'
  | 'umb_eachOccurrence' | 'umb_aggregate'
  // WC row
  | 'wc_insrLtr' | 'wc_policyNumber' | 'wc_effDate' | 'wc_expDate'
  | 'wc_subrWvd'                              // note: no ADDL INSD column for WC on the 25
  | 'wc_perStatuteCheckbox' | 'wc_otherCheckbox'
  | 'wc_elEachAccident' | 'wc_elDiseaseEachEmployee' | 'wc_elDiseasePolicyLimit'
  | 'wc_anyProprietorExcluded'                // ynText (Y/N/A code box)
  // Other row (prints property OR other lines, Section 0.1)
  | 'other_insrLtr' | 'other_type' | 'other_policyNumber' | 'other_effDate' | 'other_expDate'
  | 'other_addlInsd' | 'other_subrWvd' | 'other_limitsText'
  // remarks + holder + signature
  | 'descriptionOfOperations'
  | 'holderName' | 'holderAddress'
  | 'authorizedRepName';

export type InsurerLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export const ACORD25_FIELD_MAP: Record<Acord25LogicalKey, Acord25FieldMapEntry> = {
  // POPULATED AT ONBOARDING from verify-template.ts --dump output.
  // Pre-onboarding this object is empty-cast; loadAcord25FieldMap() throws until populated.
} as Record<Acord25LogicalKey, Acord25FieldMapEntry>;

// sha256 hex of the sanitized stored template bytes; printed by verify-template.ts --check
export const ACORD25_TEMPLATE_SHA256: string = '';
export const ACORD25_TEMPLATE_VERSION: string = ''; // e.g. '2016-03', must match acord_templates.version

// Critical subset fed to templateIngestion validateAcordFields (Section 1.4)
export const ACORD25_EXPECTED_FIELD_NAMES: string[] = [];
```

Notes:
- The logical key list above encodes the ACORD 25 (2016/03) row structure. If the licensed blank's edition differs (extra Other row, split address fields, separate city/state/zip on holder), the onboarding engineer adds or splits logical keys in the same PR that populates the names. The key list is the design's best-known shape, not a hard assumption; the verify script's resolution check is the enforcement point.
- Some editions expose insured/producer/holder addresses as one multiline field, others as multiple lines. The map handles this by allowing address entries to be authored as either a single multilineText entry or split entries keyed `producerAddress`, `producerAddress2`, etc.; the builder joins or splits addressLines accordingly (Section 4.8).

---

## 4. The payload builder

Files to create (each ported verbatim to supabase/functions/_shared/acord25/, Section 7):
- src/lib/acord/acord25/buildAcord25FieldValues.ts (the pure builder)
- src/lib/acord/acord25/format.ts (formatAcordDate, formatLimit)
- src/lib/acord/acord25/types.ts (input/output types below)
- src/lib/acord/acord25/previewHash.ts (hashFieldValuesForPreview, PREVIEW_HASH_EXCLUDED_FIELDS, Section 4.10)
- src/lib/acord/acord25/fromMasterCoi.ts (the single adapter from the Master COI contract, Section 4.9)
- src/lib/acord/acord25/validateAcord25.ts (Section 5.2)

Deleted from the original design (R7): insurerLetters.ts and normalizeCarrierKey. Letter assignment is NOT implemented in TypeScript. The algorithm lives once, in SQL, inside get_master_coi (02-master-coi-data-layer.md): canonical line order gl, auto, umbrella, wc, property, other; carriers grouped by carrier_id else normalize_entity_name(carrier) (supabase/migrations/20260629190000_import_resolve_account.sql:28-42); letters split on same-name-different-NAIC; deterministic tiebreak by policy_number; more than 6 distinct carriers is a hard readiness blocker with two-certificate guidance. The NAIC-split rule and the policy_number tiebreak originated in this doc's earlier draft and were adopted INTO that SQL algorithm; this doc no longer specifies them, it cites them. The builder takes the resulting letter map as input.

### 4.1 Input types (structural premium exclusion, D8; holder-resolved endorsement flags, R2/R3; letters as input, R7)

```ts
// Canonical line keys, R7. Published mapping table in 02-master-coi-data-layer.md;
// ACORD 25 row mapping in Section 0.1 of this doc.
export type Acord25LineKey = 'gl' | 'auto' | 'umbrella' | 'wc' | 'property' | 'other';

// Mirrors the closed three-state text contract of resolve_holder_endorsements
// (addl_insd_resolved / subr_wvd_resolved text over 'endorsed' | 'requested' | 'none'),
// owned by 02-master-coi-data-layer.md Section 4.7; restated here for the builder, never redefined.
export type HolderResolvedStatus = 'endorsed' | 'requested' | 'none';

// One flag per printable column (ADDL INSD, SUBR WVD) per line.
// `resolved` comes from resolve_holder_endorsements(p_account_id, p_holder_id, p_policy_ids)
// (02-master-coi-data-layer.md Section 4.7, the owner of this contract): 'endorsed' for THIS holder
// only when an endorsement_status='endorsed' row is blanket-scoped OR matches the holder by
// additional_insured_id or normalize_entity_name(name); the second query tier reports 'requested'
// when a blanket-scoped or holder-matched row exists with endorsement_status='requested'; else 'none'.
// `printIntent` is the user's per-line toggle from the generator UI (06-ui-surfaces.md). It can only
// DOWNGRADE: the builder errors if printIntent is true while resolved is not 'endorsed' (R3).
export interface Acord25PrintFlag {
  resolved: HolderResolvedStatus;
  printIntent: boolean;
}

export interface InsurerAssignment {
  letter: InsurerLetter;
  name: string;               // as returned by get_master_coi
  naic: string | null;
  lines: Acord25LineKey[];    // every selected line appears in exactly one assignment
}

export interface Acord25CoverageLine {
  line: Acord25LineKey;
  policyId: string;
  policyNumber: string;
  effectiveDate: string;      // 'YYYY-MM-DD' from policies.effective_date
  expirationDate: string;     // 'YYYY-MM-DD'
  additionalInsured: Acord25PrintFlag | null;  // null for wc (no ADDL INSD column on the 25)
  waiverOfSubrogation: Acord25PrintFlag;
  gl?: {
    occurrence: boolean; claimsMade: boolean;
    aggregateAppliesPer: 'policy' | 'project' | 'location' | null;
    eachOccurrence: number | null; damageToRented: number | null; medExp: number | null;
    personalAdvInjury: number | null; generalAggregate: number | null; productsCompOpAgg: number | null;
  };
  auto?: {
    anyAuto: boolean; ownedOnly: boolean; scheduled: boolean; hired: boolean; nonOwned: boolean;
    combinedSingleLimit: number | null; biPerPerson: number | null; biPerAccident: number | null; propertyDamage: number | null;
  };
  umbrella?: {
    type: 'umbrella' | 'excess'; basis: 'occurrence' | 'claims_made';
    dedOrRetention: { kind: 'ded' | 'retention'; amount: number } | null;
    eachOccurrence: number | null; aggregate: number | null;
  };
  wc?: {
    perStatute: boolean; other: boolean;
    proprietorExcluded: 'Y' | 'N' | null;
    elEachAccident: number | null; elDiseaseEachEmployee: number | null; elDiseasePolicyLimit: number | null;
  };
  otherRow?: { typeLabel: string; limitsText: string };  // for property/other lines, Section 4.7
}
// NOTE: no premium field and no carrier name/NAIC exist anywhere in these types. Premium exclusion
// is deliberate (D8). Carrier identity lives ONLY in letterAssignments (R7), so the builder cannot
// invent or reassign a letter.

export interface Acord25BuildInput {
  certificateDate: string;             // 'YYYY-MM-DD', usually today
  certificateNumber?: string | null;   // supplied by finalize_certificate_issue numbering (04-issuance-and-snapshots.md)
  revisionNumber?: string | null;
  producer: { agencyName: string; addressLines: string[]; contactName: string; phone: string; fax?: string; email: string };
  insured: { name: string; addressLines: string[] };
  lines: Acord25CoverageLine[];        // already reduced to the user's checkbox selection
  letterAssignments: InsurerAssignment[];  // FROM get_master_coi, never computed here (R7)
  descriptionOfOperations: string;     // TWO separate inputs per R18 ...
  remarks: string;                     // ... joined deterministically at print time (Section 4.6)
  holder: { name: string; addressLines: string[] } | null;  // null = master preview without holder
  authorizedRepName: string;
}
```

### 4.2 Builder signature and output contract

```ts
export interface Acord25Issue {
  code:
    | 'FIELD_MAP_UNPOPULATED' | 'NO_LINES_SELECTED'
    | 'LETTER_UNASSIGNED' | 'LETTER_CONFLICT' | 'TOO_MANY_CARRIERS'
    | 'OTHER_ROW_CONFLICT'
    | 'ADDL_INSD_PENDING' | 'ADDL_INSD_NOT_PERMITTED'
    | 'SUBR_WVD_PENDING' | 'SUBR_WVD_NOT_PERMITTED'
    | 'NAIC_MISSING' | 'HOLDER_MISSING' | 'DATE_INVALID' | 'OVERFLOW';
  severity: 'error' | 'warning';
  message: string;              // human copy, no em or en dashes
  lineKey?: Acord25LineKey;
  logicalKeys?: Acord25LogicalKey[];
}

export interface BuildAcord25Result {
  ok: boolean;                                     // false iff any severity 'error' issue
  fieldValues: Record<string, string | boolean>;   // keyed by EXACT pdf field names, TOTAL over the field map
  logicalValues: Record<Acord25LogicalKey, string | boolean>; // pre-mapping view, for tests and UI preview
  issues: Acord25Issue[];
}

export function buildAcord25FieldValues(input: Acord25BuildInput): BuildAcord25Result;
```

Properties the implementation must guarantee:
- Pure and deterministic: same input object produces byte-identical output; no Date.now(), no locale-dependent formatting (use explicit en-US grouping), no randomness, no I/O. This is what makes the issued-certificate snapshot (04-issuance-and-snapshots.md), the preview_sha256 binding (Section 4.10), and holder-swap preview regeneration (Section 9) exact.
- Total over the field map (D5): every entry of ACORD25_FIELD_MAP appears in fieldValues. Unused text/ynText/date/limit fields get '' (empty string, which fillAcordPdf sets, not skips: only null/undefined are skipped at pdfFiller.ts:97-102); unused checkboxes get false (explicit uncheck at pdfFiller.ts:188-195). Every rebuild is therefore self-contained: no stale insurer B row can survive a selection change, in the preview or on the server.
- Never throws on bad input; returns ok:false with issues. UI renders issues; the preview shows them; generate-certificate maps builder errors to 422 responses (04-issuance-and-snapshots.md).
- If ACORD25_FIELD_MAP is unpopulated (pre-onboarding), returns single FIELD_MAP_UNPOPULATED error.
- Output vocabulary is the snapshot schema (D14, R8): booleans for checkbox kinds, literal 'Y'/'N'/'' for ynText kinds, formatted strings for everything else. The '/1' and '/Off' export-value strings never appear in fieldValues; pdf-lib's field.check() applies export values internally at fill time. snapshot.field_values in public.certificates stores this exact Record<string, string | boolean>, so a stored snapshot replayed through the fill core reproduces the identical artifact (test in Section 8.2).

### 4.3 Insurer letters: consumed, not computed (R7)

The builder receives letterAssignments from get_master_coi (through the adapter, Section 4.9). Its only letter logic is placement and defensive validation:

- For each selected line, find the single assignment whose lines array contains that line key; write assignment.letter into the row's `<row>_insrLtr` logical field (per the Section 0.1 row mapping), and populate `insurerName_<letter>` / `insurerNaic_<letter>` from the assignment.
- Insurer table rows for letters not present in letterAssignments are '' (totality, D5).
- Defensive issues (these should be unreachable when the input really came from get_master_coi, because the SQL algorithm and the R6 readiness blockers enforce them upstream; they exist so a buggy or hand-built caller cannot produce a silently wrong cert):
  - LETTER_UNASSIGNED (error): a selected line appears in no assignment. "The <line> line has no insurer letter assignment. Refresh the Master COI panel and retry."
  - LETTER_CONFLICT (error): a line appears in more than one assignment, or two assignments share a letter.
  - TOO_MANY_CARRIERS (error): more than 6 assignments. Primary enforcement is the get_master_coi readiness blocker (02-master-coi-data-layer.md) with its two-certificate guidance; this is the backstop.
  - NAIC_MISSING (warning): an assignment referenced by a selected line has naic null. "Insurer <letter> (<name>) has no NAIC code. The NAIC # column will print blank."
- Unresolved carriers and same-name-different-NAIC handling are NOT builder concerns anymore: insurer_unresolved is a readiness blocker and the NAIC split happens inside the SQL algorithm (both in 02-master-coi-data-layer.md).

Server-side agreement: generate-certificate re-reads get_master_coi at issue time, so the letters it feeds the Deno builder come from the same single implementation; the request carries the client-displayed letters only as a cross-check and the server returns 422 on mismatch (R7, 04-issuance-and-snapshots.md). validateAcord25's V6 (Section 5.2) additionally re-asserts payload-internal letter consistency as a belt-and-suspenders check.

### 4.4 Y/N print semantics: holder-resolved, downgrade-only (D6, R2/R3)

The printed value for each ADDL INSD / SUBR WVD box is a pure function of the line's Acord25PrintFlag:

| resolved | printIntent | Printed | Issue |
|----------|-------------|---------|-------|
| endorsed | true | 'Y' | none |
| endorsed | false | 'N' | none (deliberate user downgrade, allowed by R3) |
| requested | false | 'N' | ADDL_INSD_PENDING / SUBR_WVD_PENDING (warning): "The <column> endorsement on <line> is requested but not yet confirmed for this holder. The certificate will print N until it is confirmed in Master COI." |
| requested | true | 'N' | ADDL_INSD_NOT_PERMITTED / SUBR_WVD_NOT_PERMITTED (error): "Cannot print Y: this holder has no confirmed <column> endorsement on <line>." |
| none | false | 'N' | none |
| none | true | 'N' | ADDL_INSD_NOT_PERMITTED / SUBR_WVD_NOT_PERMITTED (error) |

- The builder NEVER emits 'Y' unless resolved is 'endorsed' AND printIntent is true. Even in the error rows the emitted literal is 'N', so a caller that ignores ok:false still cannot ship an unearned Y. generate-certificate maps the NOT_PERMITTED errors to a 422 (R3).
- `resolved` is holder-scoped: it comes from resolve_holder_endorsements for the specific holder on the request, not from line-level status. Both the UI toggle gate (useHolderEndorsementStatus in 06-ui-surfaces.md wraps the same RPC) and generate-certificate consume the same RPC, so the toggle state and the printed letter can never disagree (R2).
- When input.holder is null (master preview without a holder), no holder-scoped resolution exists: the adapter (Section 4.9) sets every flag to { resolved: 'none', printIntent: false }, all boxes print 'N', and HOLDER_MISSING (Section 4.8) carries the messaging. Any printIntent:true with a null holder is ADDL_INSD_NOT_PERMITTED.
- UI behavior (owned by 06-ui-surfaces.md, restated here because the builder's error rows depend on it): toggles default ON when holder-resolved endorsed, user may turn OFF, disabled (locked N) otherwise, reset on holder change.

### 4.5 Y/N field routing (unchanged mechanics)

- Field map kind 'ynText'. Builder emits literal 'Y' or 'N' strings, never 'Yes'/'No', never booleans, for these fields.
- Routing: ynText entries go through the TEXT fill path. This is mandatory because fillCheckboxField truthiness (pdfFiller.ts:188-195, toBooleanValue at 401-406) treats 'y'/'yes'/'1'/'x' as checked; an 'N' would merely uncheck, and a 'Y' would check a box rather than print a code, corrupting semantics if the field were actually text (and vice versa).
- Fallback if the licensed blank exposes these as PDFCheckBox fields (the verify script detects this, Section 2.2 step 4): flip the map entries to kind 'checkbox'; builder then emits boolean true where the table in 4.4 says 'Y' and false otherwise; all issue semantics are unchanged. The builder branches on map kind, so no logic elsewhere changes.
- WC row has SUBR WVD but no ADDL INSD column on the 25; the type system reflects that (additionalInsured is null for wc; no wc_addlInsd logical key). The WC "any proprietor excluded" Y/N box is a plain ynText from wc.proprietorExcluded.

### 4.6 Checkboxes, dates, limits

Checkboxes (GL occurrence/claims-made, aggregate-applies-per, auto ownership boxes, umbrella type/basis/ded-retention, WC per-statute): builder emits boolean true/false. pdf-lib's field.check() applies the field-specific export value ('/1', '/Yes', etc.) internally, which is why the inventory's options are informational (exportValue in the map) rather than something the builder must emit (D14). Radio groups and dropdowns are not expected on the 25; if the verify script finds any, the map entry stores the exact export string from field_inventory.options and the builder emits that exact string (never relies on pdfFiller's partial-match fallback at pdfFiller.ts:216-219, which can silently select a wrong option).

Dates: builder formats 'YYYY-MM-DD' database strings into 'MM/DD/YYYY' by string slicing (never via new Date(), avoiding timezone shifts; the existing formatDate at pdfFiller.ts:413-436 uses Date parsing and is not used by the builder):

```ts
export function formatAcordDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new RangeError(`Not an ISO date: ${iso}`);
  return `${m[2]}/${m[3]}/${m[1]}`;
}
```

Builder catches the RangeError per field and converts it to a DATE_INVALID error issue naming the line and field.

Limits: `formatLimit(n: number): string` renders a non-negative integer with comma thousands grouping (explicit implementation, not toLocaleString, for determinism): 1000000 -> '1,000,000'. No cents, no '$' by default; the ACORD 25 limit boxes have preprinted $ signs. If onboarding finds a box without a preprinted $, that map entry sets dollarPrefixOnForm:false and the builder prefixes '$'. Null limits render '' (blank box), never '0'. Tabular figures are a UI concern (Calm Command), not a PDF concern; Helvetica in the fill is fine. Premium can never appear because no premium exists in the input types (D8); the sentinel test in Section 8.4 enforces against regression. Note that missing limits on SELECTED lines never reach the builder in the issuance path: limit_missing is a readiness blocker that generate-certificate enforces with a 422 via get_master_coi (R6, 02-master-coi-data-layer.md); the builder's '' rendering exists for the preview of not-yet-ready data.

Umbrella DED/RETENTION: exactly one of umb_dedCheckbox / umb_retentionCheckbox true when dedOrRetention is present, amount into umb_dedRetAmount via formatLimit.

Description of operations and remarks (D18, R18): the builder receives them as two fields, matching the generate-certificate request ({description_of_operations, remarks}) and the snapshot schema. The single printed descriptionOfOperations box receives the deterministic join:

```ts
const doo = input.descriptionOfOperations.trim();
const rem = input.remarks.trim();
const printed = rem.length > 0 ? `${doo}\n\n${rem}` : doo;
```

The overflow check (Section 4.7) runs over `printed`. The UI's two labeled fields and their shared counter (06-ui-surfaces.md) must count `doo.length + (rem ? rem.length + 2 : 0)` against the same softCharLimit constant so the counter and the validator can never disagree.

### 4.7 Remarks / Description of Operations overflow (D9, adopted module-wide as R16)

Decision (won module-wide per R16): pre-generation hard block. No silent truncation ever reaches an issued cert, and NO addendum page is ever attached to an issued ACORD 25 (the generic addendum machinery at pdfFiller.ts:129-131, 469-517 is not used for certificates): a hand-drawn non-ACORD addendum attached to an ACORD 25 is nonstandard paper. The correct long-form continuation is ACORD 101, which is out of scope now; the validator's error copy names it so the future path is discoverable. 04-issuance-and-snapshots.md and 06-ui-surfaces.md contain no addendum language; the RemarksField counter in 06 binds to the fieldMap softCharLimit constant.

Mechanics:
- The builder does not truncate. It emits the full joined description string (Section 4.6).
- validateAcord25 (Section 5.2) computes effective limits per field: min(field_inventory.maxLength if present, fieldMap.softCharLimit if present) and runs the overflow check (a local pure helper with semantics identical to detectOverflowFields, pdfFiller.ts:599-623; local so the Deno port stays dependency-free, with a parity unit test on the client side, Section 8.4). Any hit on descriptionOfOperations (or holder address, or any text field) is an OVERFLOW error: "Description of operations is <n> characters; the box fits about <limit>. Shorten it by <overflow> characters. (Support for the ACORD 101 continuation form is planned.)"
- softCharLimit for the description box is measured once at onboarding (Section 2.2 step 3) because multiline boxes usually have no AcroForm maxLength and overflow there is visual clipping, which char counts approximate conservatively.

Other-row limits text: for a property or other line printed on the OTHER row, other_type comes from Acord25CoverageLine.otherRow.typeLabel and other_limitsText from otherRow.limitsText. The adapter (Section 4.9) composes limitsText deterministically from the line's limit cells in the Master COI contract: the contract's declared display order, each rendered as `<label> $<formatLimit(v)>`, joined with '; '. The OTHER row limits box is small; its authored softCharLimit applies through the same V7 overflow check.

### 4.8 Holder block and header

- holder null (master preview): holderName/holderAddress emit '' and the builder adds HOLDER_MISSING as a warning (preview allowed) while issuance treats a null holder as an error (issuing a cert without a holder is meaningless). The distinction lives in the validator mode: validateAcord25 takes `mode: 'preview' | 'issue'` and escalates HOLDER_MISSING to error in issue mode; generate-certificate always validates in issue mode.
- holder.addressLines joined with '\n' for a multilineText holder address field, or distributed across split fields if the blank has them (map-driven, Section 3 note).
- certificateDate formats like any date; certificateNumber/revisionNumber pass through as text ('' when absent). In the issuance path certificateNumber is assigned by finalize_certificate_issue via next_certificate_number (04-issuance-and-snapshots.md); the preview build leaves it ''.
- authorizedRepName fills the printed-name text field. The signature image itself is an overlay concern handled by the existing signature_anchors machinery (extracted at ingestion, templateIngestion.ts:345-365) and the eSign flow; it is explicitly out of scope for the payload builder.

### 4.9 fromMasterCoi: the single adapter (D16, R21)

File: src/lib/acord/acord25/fromMasterCoi.ts (ported to supabase/functions/_shared/acord25/fromMasterCoi.ts).

The builder input is plain values (so premium exclusion stays structural), but its upstream is the cell-based Master COI read-model contract published as src/types/master-coi.ts (R21): every scalar is a cell `{v, src, path, conf, updated_at, updated_by, flag}`, lines are keyed by the canonical line keys, AI rows are per-row arrays, and readiness is {ready, blockers[], warnings[]}. ONE adapter maps that contract (plus the holder resolution and user intents) into Acord25BuildInput:

```ts
export interface FromMasterCoiArgs {
  masterCoi: MasterCOI;                            // canonical type name in src/types/master-coi.ts, from get_master_coi
  selectedLines: Acord25LineKey[];                 // the user's checkbox selection
  holder: { name: string; addressLines: string[] } | null;
  holderResolution: HolderEndorsementResolution | null; // resolve_holder_endorsements output; null iff holder null
  printIntents: Partial<Record<Acord25LineKey, { addlInsd: boolean; subrWvd: boolean }>>; // UI toggles
  descriptionOfOperations: string;
  remarks: string;
  certificateDate: string;
  certificateNumber?: string | null;
  authorizedRepName: string;
}

export function toAcord25BuildInput(args: FromMasterCoiArgs): Acord25BuildInput;
```

Rules:
- Scalar extraction is always cell.v; src/conf/flag never influence the printed value (provenance is a panel concern, 06-ui-surfaces.md). The adapter reads only the contract fields 02-master-coi-data-layer.md declares; it never reaches around the contract to raw tables.
- letterAssignments are copied verbatim from the contract's letter map (get_master_coi output). The adapter never reorders or reassigns.
- Endorsement flags: for each selected line and column, resolved comes from holderResolution ({line_key, addl_insd_resolved, subr_wvd_resolved, basis} rows); printIntent from printIntents, defaulted to (resolved === 'endorsed'), which matches the UI's default-ON-when-endorsed rule. holder null forces { resolved: 'none', printIntent: false } everywhere (Section 4.4).
- Producer block: from the agency workspace profile fields the contract exposes; insured block from the contract's insured projection.
- property/other lines: otherRow.typeLabel from the 02 mapping table display name; otherRow.limitsText composed per Section 4.7.
- The adapter is pure given its args. Both call sites use it: the client preview (06-ui-surfaces.md) and generate-certificate (04-issuance-and-snapshots.md, via the Deno port). This is what makes preview_sha256 comparable across the two builds (Section 4.10).

### 4.10 preview_sha256: canonical serialization (D15, R9)

File: src/lib/acord/acord25/previewHash.ts (ported verbatim). This section OWNS the preview hash definition: the canonical helper is hashFieldValuesForPreview and the exclusion list is PREVIEW_HASH_EXCLUDED_FIELDS. 04-issuance-and-snapshots.md and 06-ui-surfaces.md cite this definition and never redefine it.

```ts
// Header fields excluded from the preview hash: the certificate-number field, the
// revision-number field, and the form-date header fields (logical keys certificateNumber,
// revisionNumber, certificateDate). certificateNumber is assigned server-side by
// finalize_certificate_issue only at issue time, and the revision number and form date can
// legitimately differ between the previewed build and the issue-time rebuild; hashing them
// would turn every issuance into a spurious 409.
export const PREVIEW_HASH_EXCLUDED_KEYS = [
  'certificateNumber',
  'revisionNumber',
  'certificateDate',
] as const;

export const PREVIEW_HASH_EXCLUDED_FIELDS: ReadonlySet<string> = new Set(
  PREVIEW_HASH_EXCLUDED_KEYS
    .map((k) => ACORD25_FIELD_MAP[k]?.pdfField)
    .filter((n): n is string => !!n)   // empty pre-onboarding, while the field map is unpopulated
);

export async function hashFieldValuesForPreview(
  fieldValues: Record<string, string | boolean>
): Promise<string> {
  const entries = Object.keys(fieldValues)
    .filter((k) => !PREVIEW_HASH_EXCLUDED_FIELDS.has(k))
    .sort()                                  // default Array.sort: UTF-16 code unit ascending
    .map((k) => [k, fieldValues[k]]);
  const bytes = new TextEncoder().encode(JSON.stringify(entries));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
```

Canonical serialization, exactly: (1) take build.fieldValues (post-mapping, keyed by exact PDF field names); (2) drop every key in PREVIEW_HASH_EXCLUDED_FIELDS (the certificate-number field, the revision-number field, and the form-date header fields); (3) sort the remaining keys ascending by UTF-16 code units (JavaScript default sort); (4) JSON.stringify the array of [key, value] pairs (JSON string escaping is deterministic; values are strings or booleans only); (5) UTF-8 encode; (6) sha256; (7) lowercase hex. WebCrypto (crypto.subtle) exists in both the browser and Deno, so the identical source runs in both builds.

The exclusion is hash-only: the excluded fields still appear in fieldValues and in snapshot.field_values (totality D5 and the snapshot vocabulary D14 are unchanged). Only the preview-vs-rebuild comparison ignores them.

Usage (R9): the client computes hashFieldValuesForPreview over the build it rendered in the preview and sends it as preview_sha256 in the generate-certificate request. The server computes the same function over its own rebuild and returns 409 'data changed since preview, re-preview required' on mismatch. Hashing fieldValues (not logicalValues) means a stale client field map, a template edition drift, or any data change between preview and click all surface as the 409, which is the intended behavior; the header exclusions mean the server-assigned certificate number and an issue-day form date do not.

### 4.11 Multi-page / repeaters: non-issue

ACORD 25 is a single page (acord.ts:477). No repeater expansion is needed, which is fortunate because fillAcordPdf never reads repeater_configs and repeaterEngine.ts has zero importers (ground truth). The design takes no dependency on either. If a selection needs more than 6 insurers or more OTHER rows than the form has, the answer is a second certificate (the TOO_MANY_CARRIERS readiness blocker in 02-master-coi-data-layer.md and the OTHER_ROW_CONFLICT guidance in Section 0.1), not a second page.

---

## 5. Validation rules

### 5.1 Rules as data on the template row (secondary, for the generic editor)

Authored into acord_templates.validation_rules by publish-template-config.ts (Section 2.2 step 6), sourced from src/lib/acord/acord25/validationRules.ts so the JSON lives in git. These use only the rule types the existing engine executes (required / conditional_required, single-field, useAcordForms.ts:456-566; type shape at src/types/acord.ts:86-97). Field names below are placeholders resolved from the field map at authoring time (the script substitutes `${fieldMap.X.pdfField}`):

```json
[
  { "id": "a25_req_insured_name",   "type": "required", "field": "<insuredName>",   "message": "Named insured is required", "severity": "error" },
  { "id": "a25_req_producer_name",  "type": "required", "field": "<producerName>",  "message": "Producer agency name is required", "severity": "error" },
  { "id": "a25_req_cert_date",      "type": "required", "field": "<certificateDate>", "message": "Certificate date is required", "severity": "error" },
  { "id": "a25_req_insurer_a_name", "type": "required", "field": "<insurerName_A>", "message": "Insurer A is required; at least one coverage line must be selected", "severity": "error" },
  { "id": "a25_req_insurer_a_naic", "type": "required", "field": "<insurerNaic_A>", "message": "Insurer A NAIC code is missing", "severity": "warning" },
  { "id": "a25_req_holder_name",    "type": "required", "field": "<holderName>",    "message": "Certificate holder is required before issue", "severity": "warning" },
  { "id": "a25_req_desc_ops",       "type": "required", "field": "<descriptionOfOperations>", "message": "Description of operations is empty", "severity": "warning" },
  { "id": "a25_req_auth_rep",       "type": "required", "field": "<authorizedRepName>", "message": "Authorized representative name is required", "severity": "error" }
]
```

These exist so a form opened in the generic /acord-forms editor still gets sane required-field feedback. They are NOT the correctness gate.

### 5.2 validateAcord25: the primary gate (D10)

File to create: src/lib/acord/acord25/validateAcord25.ts (ported verbatim to supabase/functions/_shared/acord25/validateAcord25.ts).

```ts
// Structural template info, defined in acord25/types.ts so the module stays dependency-free
// for the Deno port (do NOT import src/types/acord.ts here; the shape is assignment-compatible
// with AcordTemplate's field_inventory and version).
export interface Acord25TemplateInfo {
  version: string;
  field_inventory: Array<{ name: string; type: string; maxLength?: number; options?: string[] }>;
}

export interface ValidateAcord25Options {
  mode: 'preview' | 'issue';
  template: Acord25TemplateInfo;
  templateSha256?: string;   // hash of the fetched template bytes, computed by the caller
}

export function validateAcord25(
  build: BuildAcord25Result,
  opts: ValidateAcord25Options
): { valid: boolean; issues: Acord25Issue[] };  // includes build.issues, deduped
```

Checks, in order:
- V1 build.ok passthrough: any build error blocks. (This includes the R3 NOT_PERMITTED errors: an unearned Y can never pass, in either mode.)
- V2 field-name resolution: every key of build.fieldValues exists in template.field_inventory (Set of names). A miss is an error naming the key; this converts fillAcordPdf's silent getFieldMaybe skip (pdfFiller.ts:86-91) into a loud pre-fill failure.
- V3 type agreement: map kind vs inventory type (ynText/date/limit/text/multilineText require 'text'; checkbox requires 'checkbox'). Error on mismatch (catches edition drift where a text box became a checkbox).
- V4 Y/N literals: every ynText value is exactly 'Y', 'N', or ''. Error otherwise.
- V5 dropdown/radio membership: if inventory type is dropdown/radio, the value must be an EXACT member of field_inventory.options; never rely on the partial-match fallback (pdfFiller.ts:216-219). Error otherwise.
- V6 insurer letter resolution (belt and suspenders over the get_master_coi assignment, retained per R7): for each `<row>_insrLtr` value L that is non-empty, `insurerName_${L}` must be non-empty in the payload; and each distinct non-empty insurerName_A..insurerName_F must be referenced by at least one row letter (no orphan insurer rows). Error otherwise. This is the dedicated payload-internal defense for the looks-right-but-wrong class; the cross-artifact defense (client letters vs server letters) is generate-certificate's 422 mismatch check (R7, 04-issuance-and-snapshots.md).
- V7 overflow: the local overflow helper (semantics identical to detectOverflowFields, pdfFiller.ts:599-623) with effective limits per Section 4.7. Error per overflowing field.
- V8 holder: in 'issue' mode, holderName non-empty; escalate HOLDER_MISSING to error.
- V9 edition pin: if opts.templateSha256 provided and ACORD25_TEMPLATE_SHA256 non-empty, they must match; error "The stored ACORD 25 template does not match the pinned edition (<version>). Re-run template onboarding verification before issuing certificates." generate-certificate always provides templateSha256 (it hashes the bytes it fetched), so the pin is enforced server-side on every issuance.
- V10 dates: every non-empty date field matches /^\d{2}\/\d{2}\/\d{4}$/, and per line expiration >= effective (compare via ISO inputs carried in the build result's issue context). Error otherwise. (Expired policies never reach issue: policy_expired is a readiness BLOCKER enforced with a 422 by generate-certificate via get_master_coi, R6.)

Rationale for a dedicated function as primary:
1. The generic engine's rule vocabulary is single-field (required, conditional_required with equals/not_equals/checked/unchecked, acord.ts:86-97). Insurer-letter resolution (V6), payload-vs-inventory reconciliation (V2/V3/V5), overflow with authored soft limits (V7), and the sha256 pin (V9) are cross-field and cross-artifact checks; expressing them as data would mean inventing and maintaining a rule mini-language executed inside validateForm, which is far more code and risk than a typed pure function with unit tests.
2. validateForm runs against a persisted acord_forms row fetched from the DB (useAcordForms.ts:458-474); the Master COI flow needs validation BEFORE anything is persisted, against the in-memory build result, and it needs to run identically inside the generate-certificate edge function. A pure function slots into the preview panel, the server, and the tests.
3. Rules-as-data still exist (5.1) so nothing regresses for users of the generic editor, satisfying the handoff's "rules as data" principle where the existing engine can actually execute them.

No new rule type is added to validateForm in this design. If a later form (125/126/140) needs cross-field rules in the generic editor, that is the moment to add one; ACORD 25 does not need it because its generation path is generate-certificate, not the section editor.

---

## 6. Fill pipeline reuse and the two call sites

### 6.1 Where fills happen (R1)

There are exactly two fill call sites, and only one of them issues:

1. Client preview (preview-only, never persists): the generator UI (06-ui-surfaces.md, route /certificates) runs toAcord25BuildInput -> buildAcord25FieldValues -> validateAcord25(mode 'preview' or 'issue' for the pre-flight display) -> fillAcordPdf entirely in the browser, renders the result, and computes hashFieldValuesForPreview. The client NEVER uploads bytes, NEVER inserts documents rows, NEVER inserts certificates rows, and has no grants to do so.
2. Server issuance (the ONLY issuance path): useIssueCertificate wraps `supabase.functions.invoke('generate-certificate')` with {account_id, holder_id, lines (policy ids + per_line print intent), description_of_operations, remarks, supersedes_certificate_id?, preview_sha256} and receives {certificate_id, certificate_number, signed_url}. generate-certificate (owned by 04-issuance-and-snapshots.md) rebuilds everything from DB truth using the Deno port of this pipeline (Section 7), fills server-side, uploads to the private coi-certificates bucket at {account_id}/{certificate_id}/{certificate_number}.pdf, and commits via the service-role-only finalize_certificate_issue.

Obligations of generate-certificate that consume this design (the full flow spec lives in 04-issuance-and-snapshots.md; listed here because each step is a contract this pipeline provides):

1. Call get_master_coi(p_account_id, p_policy_ids) and return 422 on ANY readiness blocker for the selected lines (limit_missing, policy_core_missing, insurer_unresolved, policy_expired, no_lines; R6, vocabulary owned by 02-master-coi-data-layer.md).
2. Call resolve_holder_endorsements(p_account_id, p_holder_id, p_policy_ids) (R2) and return 422 if the request's per_line intent asks for Y on any non-endorsed (line, holder) pair (R3).
3. Cross-check the client-displayed letters in the request against get_master_coi's letter map; 422 on mismatch (R7).
4. Build via the ported toAcord25BuildInput + buildAcord25FieldValues; compute hashFieldValuesForPreview over the rebuild and return 409 on mismatch with the request's preview_sha256 (R9).
5. Fetch template bytes, compute their sha256, run validateAcord25 in 'issue' mode with templateSha256; abort on !valid.
6. Fill via the Deno fill core (04 owns supabase/functions/_shared/acord-fill.ts) with { fieldValues: build.fieldValues, flatten: true, updateAppearances: true }.
7. Post-fill assertion: because fillAcordPdf collects per-field failures without failing overall (errors pushed, success stays true, pdfFiller.ts:121-126, 146-152), treat `result.skippedFields.length > 0 || result.errors.length > 0` as a generation failure. After V2 passed, skips indicate template drift and must never be shipped silently.
8. Persist snapshot.field_values as build.fieldValues verbatim (D14, R8) alongside the input projections 04 specifies, then finalize_certificate_issue.

### 6.2 Constraints the payload must respect (enumerated, each anchored to the filler's behavior)

No changes to src/lib/acord/pdfFiller.ts fill mechanics. The updateFieldAppearances(font) + flatten() sequence (pdfFiller.ts:133-141) is the correct "filled and visible" mitigation; NeedAppearances is not used anywhere in the repo and is not needed. Both call sites obey:

- C1 exact field names only: unknown keys are silently skipped (getFieldMaybe, pdfFiller.ts:86-91). Guarded by V2 plus the post-fill assertion.
- C2 dropdown/radio exact export values only: partial-match fallback can silently select the wrong option (pdfFiller.ts:216-219); radio has no partial match but is case-insensitive (222-238). Guarded by V5 emitting exact field_inventory.options strings.
- C3 maxLength silent truncation on text fields (pdfFiller.ts:180-183). Guarded by V7 before fill; the filler's truncation then never triggers.
- C4 null/undefined skipped, not cleared (pdfFiller.ts:97-102). Neutralized by the total-payload rule (D5): the builder emits '' / false, which ARE written.
- C5 checkbox truthiness list ('true','1','yes','y','on','checked','x', pdfFiller.ts:401-406): never send Y/N code semantics to a checkbox; send booleans to checkboxes only. Guarded by D6 routing and V3. This is also why the snapshot vocabulary is D14: a '/1' string in a stored snapshot would be falsy here and uncheck the box on replay.
- C6 fill is fault-tolerant by design: per-field exceptions do not abort (pdfFiller.ts:121-125). Guarded by the post-fill assertion (Section 6.1 step 7).
- C7 font: Helvetica embedded at fill (pdfFiller.ts:63), default size 10 (pdfFiller.ts:48); the onboarding render gate (Section 2.2 step 5) confirms limit strings fit at that size.

### 6.3 Tooling decision for visual verification

package.json has vitest ^4.1.6, pdf-lib ^1.17.1, playwright ^1.57.0, @vitest/browser-playwright, jsdom/happy-dom. There is NO PDF rasterizer (no pdfjs-dist). Decision: add exactly one dev dependency, pdfjs-dist (^4.x). Its Node rendering path uses @napi-rs/canvas, which pdfjs-dist declares as an optional dependency, so no second explicit dep is needed. Import via 'pdfjs-dist/legacy/build/pdf.mjs' in Node scripts/tests. Playwright browser-mode rendering was considered and rejected: heavier setup for the same pixels, and the visual test is local-only anyway (the licensed blank cannot exist in CI).

---

## 7. The Deno port (D13, R1)

### 7.1 What is ported and where

Directory to create: supabase/functions/_shared/acord25/ containing verbatim copies of the pure pipeline modules:

| Deno file | Source of truth |
|-----------|-----------------|
| supabase/functions/_shared/acord25/fieldMap.ts | src/lib/acord/acord25/fieldMap.ts (includes ACORD25_FIELD_MAP, ACORD25_TEMPLATE_SHA256, ACORD25_TEMPLATE_VERSION, ACORD25_EXPECTED_FIELD_NAMES) |
| supabase/functions/_shared/acord25/types.ts | src/lib/acord/acord25/types.ts |
| supabase/functions/_shared/acord25/format.ts | src/lib/acord/acord25/format.ts |
| supabase/functions/_shared/acord25/buildAcord25FieldValues.ts | src/lib/acord/acord25/buildAcord25FieldValues.ts |
| supabase/functions/_shared/acord25/validateAcord25.ts | src/lib/acord/acord25/validateAcord25.ts |
| supabase/functions/_shared/acord25/fromMasterCoi.ts | src/lib/acord/acord25/fromMasterCoi.ts |
| supabase/functions/_shared/acord25/previewHash.ts | src/lib/acord/acord25/previewHash.ts |
| supabase/functions/_shared/acord25/parity.fixture.json | single copy; the client test imports it across the repo (Section 7.3) |

Hard rule making the port trivial: every module in src/lib/acord/acord25/ is runtime-free. No DOM, no Node APIs, no pdf-lib, no imports outside the acord25 directory (this is why validateAcord25 carries a local overflow helper instead of importing detectOverflowFields from pdfFiller.ts, and why Acord25TemplateInfo is a structural type instead of importing src/types/acord.ts). The only global APIs used are TextEncoder and crypto.subtle, both available in browsers and Deno. The Deno fill core itself (pdf-lib in Deno) is NOT part of this directory; 04-issuance-and-snapshots.md owns it at supabase/functions/_shared/acord-fill.ts.

The ACORD25_TEMPLATE_SHA256 pin therefore exists in the Deno build too: generate-certificate hashes the template bytes it fetched and validateAcord25 V9 enforces the pin server-side on every issuance, closing the "the pin lives in src/lib and is unreachable from Deno" gap.

src/types/master-coi.ts (owned by 02-master-coi-data-layer.md) must likewise be mirrored into supabase/functions/_shared/master-coi-types.ts for fromMasterCoi's imports; the sync tooling below covers it with the same mechanism (02 declares that file; this doc consumes it).

### 7.2 Sync mechanism

- scripts/acord25/sync-deno-port.ts: copies each source module to its Deno path, applying exactly one deterministic transform: relative import specifiers get a '.ts' extension appended (`from './format'` becomes `from './format.ts'`), because Deno requires explicit extensions while the Vite/tsc side stays extensionless. No other rewriting is permitted; if a module ever needs environment-specific code, that is a design error, not a sync-script feature.
- scripts/acord25/check-deno-port-sync.ts: recomputes the transform over the src modules and byte-compares against the committed Deno copies; exits nonzero on any drift. Wired into CI next to the existing lint/test steps so a PR that edits one side without re-syncing fails.
- CI also runs `deno test supabase/functions/_shared/acord25/` (via denoland/setup-deno) so the parity test executes in the actual Deno runtime, not just under Node.

### 7.3 Parity fixture test (the R1 guard)

Fixture: supabase/functions/_shared/acord25/parity.fixture.json, committed, regenerated only by scripts/acord25/regen-parity-fixture.ts. Shape:

```json
{
  "input": { "...": "a fully-populated Acord25BuildInput (the buildSampleInput fixture, serialized)" },
  "expectedFieldValues": { "<pdfField>": "value-or-boolean" },
  "expectedPreviewSha256": "<64 hex chars>"
}
```

Two tests consume the SAME file:
- Client: src/__tests__/acord/acord25/parity.test.ts (vitest) imports the fixture via a relative repo path, runs buildAcord25FieldValues(input) from src/lib/acord/acord25/, asserts deep equality with expectedFieldValues and that hashFieldValuesForPreview equals expectedPreviewSha256.
- Deno: supabase/functions/_shared/acord25/parity_test.ts runs the identical assertions against the ported modules under `deno test`.
- Exclusion behavior (Section 4.10), asserted in BOTH tests: expectedPreviewSha256 is computed with the PREVIEW_HASH_EXCLUDED_FIELDS exclusion applied; rebuilding the fixture input with a different certificateNumber, revisionNumber, or certificateDate still hashes to expectedPreviewSha256 (the excluded header fields do not participate in the hash), while mutating any single non-excluded value in fieldValues changes the hash.

Both passing means the client preview build and the server issuance build are byte-identical for the fixture input, which combined with purity (no I/O, no environment reads) is the drift guard R1 requires. Any intentional builder change regenerates the fixture in the same PR, making the behavior change reviewable as a diff.

---

## 8. Testing strategy

Test locations follow the existing convention (src/__tests__/acord/, see pdfFiller.test.ts, validation.test.ts there; vitest.config.ts includes src/__tests__/**). New directory: src/__tests__/acord/acord25/. Fixture helpers go in src/test/fixtures/ (NOT under src/__tests__/, whose glob would treat them as test files).

### 8.1 Synthetic field-catalog fixture (CI never needs the licensed PDF)

File: src/test/fixtures/acord25Fixture.ts

```ts
export async function buildSyntheticAcord25(map = ACORD25_FIELD_MAP): Promise<Uint8Array>
```

Creates a 1-page pdf-lib document and, for every field-map entry, creates a real AcroForm field with the EXACT committed name: form.createTextField(entry.pdfField) for text kinds (applying setMaxLength when entry.maxLength is set, laid out in a simple grid so widgets exist), form.createCheckBox for checkbox kinds. This is a field-name harness, not an ACORD reproduction: no ACORD artwork, no layout fidelity, no license exposure. Also export `buildSampleInput(): Acord25BuildInput`, a fully-populated two-carrier fixture (GL+Umbrella on letter A's carrier, Auto+WC on letter B's carrier, letterAssignments supplied inline as get_master_coi would return them, holder-resolved endorsement flags covering endorsed/requested/none) used across all suites and serialized into the parity fixture (Section 7.3).

Pre-onboarding (empty map) all acord25 suites `describe.skipIf(Object.keys(ACORD25_FIELD_MAP).length === 0)` except the pure-logic suites (formatters, print-flag matrix, letter placement with inline maps), which use their own inline maps.

### 8.2 Round-trip and snapshot-replay tests

File: src/__tests__/acord/acord25/roundTrip.test.ts

1. bytes = await buildSyntheticAcord25(); input = buildSampleInput(); build = buildAcord25FieldValues(input); assert build.ok.
2. Fill with flatten OFF for re-readability: fillAcordPdf(bytes, { fieldValues: build.fieldValues, flatten: false, updateAppearances: true }). Assert success, errors [], skippedFields [] (proves every payload key landed on a real field; C1).
3. values = await extractFieldValues(result.pdfBytes) (exported reader, pdfFiller.ts:629-653). For EVERY field-map entry assert the read-back value equals the emitted value: text kinds compare strings ('' reads back as null from getText, so compare `values[name] ?? ''`), checkbox kinds compare booleans.
4. Second pass with default flatten:true asserting success and filledFieldCount === number of map entries (flattened output is the production artifact; this pins that flatten does not throw on the payload).
5. Snapshot-replay round-trip (R8): serialize build.fieldValues with JSON.stringify (simulating storage in certificates.snapshot.field_values), JSON.parse it back, refill the synthetic template from the parsed object, extractFieldValues, and assert equality with pass 3's read-back. This pins that the stored snapshot vocabulary (strings and booleans, D14) survives persistence and reproduces the identical artifact; it would fail immediately if export-value strings like '/1' ever crept into the schema.

### 8.3 Insurer-letter placement and cross-check suite (the looks-right-but-wrong class)

File: src/__tests__/acord/acord25/insurerLetters.test.ts (pure logic, runs pre-onboarding with an inline map)

The ASSIGNMENT algorithm's tests (grouping by carrier_id else normalized name, NAIC split, policy_number tiebreak, 6-carrier blocker) live with the SQL implementation in 02-master-coi-data-layer.md (R7). This suite tests what the builder still owns: faithful placement of input letters and the defensive checks.

Cases:
- Two-assignment input (A on gl+umbrella, B on auto+wc): every row's insrLtr matches its assignment; insurerName_A/B and insurerNaic_A/B populated; C..F rows are ''.
- Input letters are placed verbatim regardless of lines array order (assert equality across shuffled permutations of input.lines).
- Selected line absent from every assignment: LETTER_UNASSIGNED error naming the line; ok false.
- Line present in two assignments, and separately two assignments sharing a letter: LETTER_CONFLICT error.
- Seven assignments: TOO_MANY_CARRIERS defensive error.
- Assignment with naic null referenced by a selected line: NAIC_MISSING warning naming the letter.
- property line plus other line both selected: OTHER_ROW_CONFLICT error with the two-certificate guidance; a single property line alone lands on the other_ row with its typeLabel and limitsText.
- V6 cross-check: mutate a built payload to point gl_insrLtr at 'C' with insurerName_C empty; validateAcord25 flags it. Also the orphan direction: insurerName_D populated with no row referencing 'D'.

### 8.4 Payload builder and validator suites

Files: src/__tests__/acord/acord25/payloadBuilder.test.ts, src/__tests__/acord/acord25/validateAcord25.test.ts

- Golden payload: expect(build.logicalValues).toMatchSnapshot() plus expect(build.fieldValues).toMatchSnapshot() for buildSampleInput(). The committed snapshot is the change-review surface for any payload behavior change (and any change also forces a parity-fixture regen, Section 7.3, so client and server stay in lockstep).
- Totality: fieldValues key set exactly equals the map's pdfField set; unused Other row fields are '' and unused checkboxes false.
- Premium sentinel (D8): build from `{ ...buildSampleInput(), lines: lines.map(l => ({ ...l, premium: 987654 } as any)) }`; assert no payload string equals '987,654' or '987654'. Also a type-level test: `// @ts-expect-error premium does not exist on Acord25CoverageLine` assignment.
- Print-flag matrix (R2/R3): all six rows of the Section 4.4 table, for both ADDL INSD and SUBR WVD: endorsed+intent -> 'Y'; endorsed+no-intent -> 'N' with no issue; requested+no-intent -> 'N' + PENDING warning; requested+intent and none+intent -> 'N' emitted + NOT_PERMITTED error (ok false); none+no-intent -> 'N'. Null holder with any intent true -> NOT_PERMITTED. V4 rejects 'Yes'.
- Dates: '2026-07-01' -> '07/01/2026'; malformed date -> DATE_INVALID; expiration before effective -> V10 error.
- Limits: 1000000 -> '1,000,000'; null -> ''; never '0'.
- DOO/remarks join (D18): remarks empty -> printed equals trimmed DOO; remarks present -> DOO + '\n\n' + remarks; combined overflow computed over the joined string.
- Overflow: joined description longer than softCharLimit -> V7 error carrying exact overflow count. Parity test: the local overflow helper returns identical results to detectOverflowFields (pdfFiller.ts:599-623) over a shared case table (this is the guard that lets the Deno port stay dependency-free).
- Modes: null holder passes preview, fails issue (V8).
- Pin: mismatched sha256 fails V9.
- Adapter (fromMasterCoi, once src/types/master-coi.ts exists): cell.v extraction, letterAssignments copied verbatim, printIntent defaulting to resolved==='endorsed', null holder forcing none/false, property line composing otherRow.limitsText in declared display order.

### 8.5 Parity fixture tests (R1)

As specified in Section 7.3: src/__tests__/acord/acord25/parity.test.ts (vitest) and supabase/functions/_shared/acord25/parity_test.ts (deno test) assert both builds reproduce parity.fixture.json exactly, including expectedPreviewSha256 through hashFieldValuesForPreview and the PREVIEW_HASH_EXCLUDED_FIELDS exclusion behavior (Section 7.3). CI runs both plus check-deno-port-sync.ts.

### 8.6 Ingestion XFA tests

File: src/__tests__/acord/acord25/templateIngestionXfa.test.ts

Build synthetic PDFs in-memory with pdf-lib:
- Hybrid: create doc, add a text field, then `pdfDoc.catalog.lookup(PDFName.of('AcroForm'), PDFDict).set(PDFName.of('XFA'), pdfDoc.context.obj('stub'))`, save. Assert hasXfaPacket(bytes-loaded doc) true; ingestAcordTemplate returns success true, one warning containing 'XFA', pdf_type 'acroform_hybrid', and sanitizedBytes that, when reloaded, have hasXfaPacket false (proves D2 actually strips).
- Zero-field XFA-only: doc with the XFA entry and no fields; ingest fails with the XFA-only message.
- Plain AcroForm: no warning, pdf_type 'acroform'.
- validatePdfForAcord: hybrid-with-fields is valid with one warning; detection order (XFA before getForm) asserted by the hybrid case returning isXfaHybrid true (it would be false if getForm ran first).

### 8.7 Visual test (local, env-gated; uses the one new dev dep)

File: src/__tests__/acord/acord25/visual.test.ts

```ts
const TEMPLATE = process.env.ACORD25_TEMPLATE_PATH;   // absolute path to the licensed blank, local only
describe.skipIf(!TEMPLATE)('ACORD 25 visual', ...)
```

- Renders page 1 of the filled output (buildSampleInput over the real blank) at scale 2 via pdfjs-dist legacy build + @napi-rs/canvas, writes PNG to test-output/ (gitignored).
- Baseline compare: if test-output/acord25-baseline.png exists (created by the engineer after the onboarding render gate approved it; gitignored, never committed because it reproduces licensed artwork), decode it with @napi-rs/canvas loadImage, drawImage to a canvas, getImageData, and pixel-diff RGBA buffers in-process with a per-channel tolerance of 8 and a failure threshold of 0.5% differing pixels. No pixelmatch/pngjs deps needed.
- If no baseline exists, the test writes the render and passes with a console notice ("baseline created, inspect and keep").
- CI behavior: env var absent, suite skips. This is deliberate: the license boundary means visual regression is a local pre-release gate, run as part of the onboarding runbook and before any template version bump.

### 8.8 What is NOT tested here

RLS/grants on public.certificates and the coi-certificates bucket policies, finalize_certificate_issue, the letter-mismatch and preview_sha256 HTTP behaviors (422/409), the readiness-blocker 422s, and the Deno fill core are owned and tested by 04-issuance-and-snapshots.md (with the blocker vocabulary from 02-master-coi-data-layer.md). resolve_holder_endorsements matching rules are tested in 02. This design's contribution to those suites is the pure builder/validator both sides call and the parity fixture that pins them together.

---

## 9. Fill-once-swap-holder in the preview (D11)

Decision: holder swap in the PREVIEW regenerates the full fill. For each holder, the caller builds `{ ...masterInput, holder }` through toAcord25BuildInput (which also re-derives the endorsement flags from a fresh resolve_holder_endorsements call for the new holder, and resets printIntents per R3), revalidates, and refills from the blank template bytes (which can be fetched once and reused in-memory across the batch; fillAcordPdf loads from bytes, so N holders = 1 fetch + N in-memory fills). Issuance is unaffected: generate-certificate always rebuilds from DB truth per holder regardless of what the preview did.

Rejected alternative: base+overlay caching (fill everything but the holder, cache the intermediate PDF, stamp holder text per copy). Rejected because (a) handoff 3.1 confirms nothing like it exists today; (b) the intermediate would have to stay unflattened to keep the holder fields writable, forking the appearance/flatten pipeline into two paths with different failure modes; (c) the saved work is milliseconds on a 1-page client-side fill; (d) determinism of buildAcord25FieldValues already guarantees the "same master, different holder" copies are identical except the holder block and the holder-resolved Y/N boxes, which is the property Brian actually wants; (e) unlike a naive overlay, full regeneration re-resolves endorsements per holder, which R2 requires (the Y/N boxes are holder-dependent, so a holder swap is never just a text stamp). If a future bulk-issue feature (hundreds of holders) measures a real bottleneck, fillMultipleForms (pdfFiller.ts:560-576) is the batching seam to optimize behind, without changing this contract.

---

## 10. File plan and sequencing

### Files to create
| Path | Contents |
|------|----------|
| src/lib/acord/acord25/fieldMap.ts | Logical keys, Acord25FieldMapEntry, ACORD25_FIELD_MAP, ACORD25_TEMPLATE_SHA256, ACORD25_TEMPLATE_VERSION, ACORD25_EXPECTED_FIELD_NAMES |
| src/lib/acord/acord25/types.ts | Acord25LineKey, Acord25PrintFlag, Acord25BuildInput, Acord25CoverageLine, InsurerAssignment, BuildAcord25Result, Acord25Issue, Acord25TemplateInfo |
| src/lib/acord/acord25/format.ts | formatAcordDate, formatLimit |
| src/lib/acord/acord25/buildAcord25FieldValues.ts | The pure builder (letters consumed as input, R7) |
| src/lib/acord/acord25/validateAcord25.ts | The primary validator (V1-V10, local overflow helper) |
| src/lib/acord/acord25/previewHash.ts | hashFieldValuesForPreview + PREVIEW_HASH_EXCLUDED_FIELDS (R9 canonical serialization, owned by Section 4.10) |
| src/lib/acord/acord25/fromMasterCoi.ts | toAcord25BuildInput adapter over src/types/master-coi.ts (R21) |
| src/lib/acord/acord25/validationRules.ts | Rules-as-data source for the template row |
| supabase/functions/_shared/acord25/*.ts + parity.fixture.json | Deno port (Section 7.1) |
| src/test/fixtures/acord25Fixture.ts | buildSyntheticAcord25, buildSampleInput |
| scripts/acord25/verify-template.ts | --dump / --check / --render |
| scripts/acord25/publish-template-config.ts | Writes validation_rules to the template row |
| scripts/acord25/sync-deno-port.ts, scripts/acord25/check-deno-port-sync.ts | Port sync + CI drift check (Section 7.2) |
| scripts/acord25/regen-parity-fixture.ts | Rebuilds parity.fixture.json from buildSampleInput |
| src/__tests__/acord/acord25/{insurerLetters,payloadBuilder,validateAcord25,roundTrip,parity,templateIngestionXfa,visual}.test.ts | Section 8 suites |
| supabase/functions/_shared/acord25/parity_test.ts | Deno-side parity test |

Deleted relative to the original draft: src/lib/acord/acord25/insurerLetters.ts and normalizeCarrierKey (R7; the algorithm lives in SQL in 02-master-coi-data-layer.md).

### Files to modify
| Path | Change |
|------|--------|
| src/lib/acord/templateIngestion.ts | hasXfaPacket helper; replace dead check at 88-96; warning + honest pdf_type at 165; sanitizedBytes in result; rework validatePdfForAcord 440-482; '25' entry in validateAcordFields 411-434 |
| src/hooks/useAcordTemplates.ts | Upload sanitizedBytes with contentType at 158-164; pass warnings through validatePdf 410-422 |
| src/types/acord.ts | pdf_type union at line 17 |
| src/pages/AcordTemplates.tsx | Dialog copy 200-202; warning display in 214-228 block |
| package.json | devDependency pdfjs-dist ^4 |
| .gitignore | test-output/ |
| CI workflow | check-deno-port-sync step + `deno test supabase/functions/_shared/acord25/` step |

### Sequencing (explicit)
1. Phase 0 parallel task (R22d, tracked in 01-disposition-and-roadmap.md): Brian initiates licensed ACORD 25 acquisition immediately; it gates steps 3 onward.
2. PR A (no template needed, ships immediately): ingestion fixes + pdf_type union + upload sanitization + dialog copy + templateIngestionXfa tests + empty-scaffold fieldMap.ts + types/format/previewHash modules with their pure-logic tests + builder and validator skeletons with the pure-logic suites (print-flag matrix, letter placement with inline maps) + Deno port scaffold and sync/check scripts + pdfjs-dist dev dep + operator scripts.
3. Onboarding (runbook Section 2.2, once the blank is in hand): upload, dump, author field map + softCharLimit + sha256 pin + expected fields, --check, --render, publish rules, sync port, regen parity fixture.
4. PR B (onboarding artifacts): populated fieldMap.ts, validationRules.ts, golden snapshots, synced Deno copies, parity fixture, round-trip/payload/validator/parity suites now un-skipped, local visual baseline created.
5. Integration: fromMasterCoi lands once 02-master-coi-data-layer.md publishes src/types/master-coi.ts and resolve_holder_endorsements; the generator preview at /certificates (06-ui-surfaces.md) consumes toAcord25BuildInput + buildAcord25FieldValues + validateAcord25 + hashFieldValuesForPreview client-side, preview-only; generate-certificate (04-issuance-and-snapshots.md) consumes the Deno port per the Section 6.1 obligations. There is NO client write path: the earlier draft's "write via useAcordForms.updateFieldValues, fill, then documents insert and snapshot" step is deleted per R1; acord_forms rows are optional provenance (source_form_id) only.

---

## 11. Risks

- Edition variance: the logical key list assumes the 2016/03 row structure; a different edition may split or add fields. Mitigation: the verify script's resolution check fails loudly; keys are adjusted in the onboarding PR, not in builder logic.
- ADDL INSD / SUBR WVD may be checkboxes on the actual blank. Mitigation: designed fallback (Section 4.5) with the verify script detecting and directing the flip; semantics (never assert an unearned endorsement) unchanged.
- softCharLimit is a measured approximation of visual capacity for multiline boxes. Mitigation: measured at font size 10 during onboarding with the render gate; conservative by instruction; the live counter in 06-ui-surfaces.md binds to the same constant and the same join rule (Section 4.6), keeping users away from the edge.
- The sha256 pin makes template re-upload break generation by design, now on both client and server (Section 7.1). Mitigation: the V9 error copy points at the runbook; this is the intended edition-drift tripwire, and setCurrentVersion flows (useAcordTemplates.ts:293-345) remain available for rollback.
- Port drift between src/lib/acord/acord25/ and supabase/functions/_shared/acord25/. Mitigation: the CI byte-compare (check-deno-port-sync.ts) plus the shared parity fixture executed in both runtimes; either alone catches the drift, together they catch both content drift and behavior drift.
- Preview-issue divergence when Master COI data changes between preview and click. Mitigation: preview_sha256 (Section 4.10, R9); the server's 409 forces a re-preview instead of silently issuing a cert the user never saw.
- pdfjs-dist optional @napi-rs/canvas needs a prebuilt binary for the platform; on unsupported platforms --render and the visual test degrade to skip with a message, never block CI (they are CI-skipped anyway).
- field_values keys can be polluted by the Quick Add Field escape hatch (AcordFormEdit.tsx per ground truth) if someone edits a provenance acord_forms row in the generic editor. Mitigation: issuance never reads acord_forms field_values; generate-certificate rebuilds strictly from Master COI data through the ported builder (R1), V2 runs at generation time against the payload the builder produces, and the total-payload rule overwrites every mapped key.
