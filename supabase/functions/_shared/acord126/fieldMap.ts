// ACORD 126 (2009/08) logical field map: the single contract between the
// commercial risk store and the exact PDF AcroForm field names of the licensed
// blank. Clones the acord125/fieldMap.ts pattern.
//
// RUNTIME-FREE. No DOM, no Node, no pdf-lib, no imports outside this directory.
//
// Authority: src/lib/acord/blanks/acord126.inventory.json (279 fields, machine
// extracted from the normalized licensed blank; provenance and the normalized
// sha256[:12] 1c9f49d8fef9 are recorded in blanks/README.md). Every pdfField
// below is an exact verbatim name from that inventory.
//
// COORDINATE-MAPPING PROVENANCE. Unlike the 125/127/140 blanks, this blank's
// field names are GENERIC (F[0].P<page>[0].Text<n>[0] / Check<n>[0]) and carry
// no meaning, so the map was authored by PAGE + COORDINATES against the
// printed form text: every text run of the blank was extracted with
// font-width-accurate positions (content-stream walk: Tm/Td/TJ kerning, form
// XObjects), then each candidate field rect was correlated with its nearest
// printed label. The audited correlation for every mapped field lives in
// src/lib/acord/blanks/acord126.labelmap.json ({pdfField, page, rect, label,
// labelXY}), so a human can re-check each pairing without the licensed PDF.
// Correlation quality bounds (PDF points):
// - checkbox labels sit RIGHT of their box: gap <= 6.3 (PER CLAIM's stacked
//   two-line label is the one outlier at 13.8, with no competing neighbor);
// - header-strip labels sit at the TOP-LEFT of their box: <= 3.0 above,
//   left edges aligned within 4;
// - LIMITS money boxes share the exact baseline with their row label across
//   the preprinted $ column (the $ abuts every box at <= 0.6);
// - SCHEDULE OF HAZARDS columns: heads sit <= 20.2 above row 1; rows 2-9
//   inherit column identity from exact x/width agreement with row 1 (all 9
//   rows carry 11 boxes at x 18/39/68/180/230/281/367/397/439/482/539) on a
//   uniform ~24 pt row cadence. Row/column arithmetic: row r (1-9), base
//   n = 29 + 11*(r-1), columns LOC#=n, HAZ#=n+1, CLASSIFICATION=n+2, CLASS
//   CODE=n+3, PREMIUM BASIS=n+4, EXPOSURE=n+5, TERR=n+6, RATE PREM/OPS=n+7,
//   RATE PRODUCTS=n+8, PREMIUM PREM/OPS=n+9, PREMIUM PRODUCTS=n+10.
// acord126.test.ts asserts inventory membership, type agreement, and labelmap
// coverage for every entry. Byte pinning of the stored template (the
// ACORD25_TEMPLATE_SHA256 / V9 pattern) lands with the fill pipeline, not
// here.
//
// SCOPE. This is the curated Phase 1b core, NOT all 279 fields: page 1 header
// strip (agency, date, effective date, applicant/first named insured, agency
// customer id + its page 2-4 header repeats), the CLAIMS MADE / OCCURRENCE
// coverage form boxes, the DEDUCTIBLES block (property damage / bodily injury
// amounts and coverage boxes plus the PER CLAIM / PER OCCURRENCE basis pair),
// the six core LIMITS money boxes, the POLICY / PROJECT / LOCATION aggregate
// boxes, and the 9 SCHEDULE OF HAZARDS rows (class code, premium basis,
// exposure, territory, PREM/OPS rate, PREM/OPS premium). Mapped fields whose
// input backing is not in the Phase 1b model (form date, agency customer id,
// the deductibles block) print their totality defaults until the model grows.
//
// DEFERRED (present in the inventory, intentionally NOT mapped; correlations
// noted where already established by the coordinate pass):
// - P1 header: Text4 POLICY NUMBER, Text6 CARRIER, Text7 NAIC CODE. Labels
//   are crisp but the Phase 1b input model has no policy/carrier block; they
//   land together with it.
// - P1 coverage rows: Check1 (COMMERCIAL GENERAL LIABILITY master box),
//   Check4 (OWNER'S & CONTRACTOR'S PROTECTIVE) and the write-in coverage row
//   under it (Check5 + Text9): no input backing in the coverage model yet.
// - P1 aggregate-applies-per OTHER pair (Check14 + Text15 description): the
//   input vocabulary is policy/project/location only.
// - P1 LIMITS tail: Text21 EMPLOYEE BENEFITS limit, the write-in limits row
//   (Text22 name + Text23 amount): not part of the six core GL limits.
// - P1 PREMIUMS column (Text24 PREMISES/OPERATIONS, Text25 PRODUCTS, Text26
//   OTHER, Text27 TOTAL): premiums are not in the Phase 1b input model.
// - P1 write-in deductible row (Check8 + Text12 name + Text13 amount): the
//   printed blank carries a third, unlabeled deductible line.
// - P1 OTHER COVERAGES, RESTRICTIONS AND/OR ENDORSEMENTS multiline (Text28).
// - P1 SCHEDULE OF HAZARDS unmapped columns, all 9 rows: LOC # (n), HAZ #
//   (n+1), CLASSIFICATION free text (n+2), RATE PRODUCTS (n+8) and PREMIUM
//   PRODUCTS (n+10) subcolumns; the input model carries one rate/premium per
//   row (printed to PREM/OPS) until it splits prem/ops vs products.
// - P1 CLAIMS MADE question block (Text128-Text133: retroactive date, entry
//   date, Y/N boxes, explain boxes) and EMPLOYEE BENEFITS LIABILITY block
//   (Text134-Text137): transaction detail beyond the Phase 1b core.
// - P2 CONTRACTORS + PRODUCTS/COMPLETED OPERATIONS sections (everything on
//   the page except the mapped Text1 customer-id repeat), P3 ADDITIONAL
//   INTEREST / GENERAL INFORMATION, P4 GENERAL INFORMATION (continued) +
//   REMARKS: later phases.
// - ClearAll[0] on every page: viewer reset Buttons, not fillable data.
//
// Naming: logical keys group by form section (form*/agency*, insured*,
// coverage*, limit*, aggregate*, deductible*, hazard<row>*). Hazard rows 1-9
// follow the inventory's row arithmetic above; the numeric row index follows
// how acord125 numbers its premises rows.

export type Acord126FieldKind =
  | 'text' // plain single-line text
  | 'date' // MM/DD/YYYY string, builder-formatted
  | 'limit' // thousands-separated whole dollars, builder-formatted
  | 'wholeNumber' // thousands-separated integer, NO currency symbol ever
  // (hazard exposure: units come from the basis code)
  | 'rate' // decimal rating factor, printed via String(n), no rounding
  | 'checkbox'; // boolean; export value handled by pdf-lib check()

export interface Acord126FieldMapEntry {
  /** EXACT name from the field inventory, authored at onboarding. */
  pdfField: string;
  kind: Acord126FieldKind;
  /** Copied from the field inventory when present (this inventory has none). */
  maxLength?: number;
  /** Authored visual capacity (multiline text only; none mapped yet). */
  softCharLimit?: number;
  /** Checkbox 'on' export value, informational (this inventory carries none). */
  exportValue?: string;
  /** True when the $ is preprinted next to the box (limit fields). */
  dollarPrefixOnForm?: boolean;
}

export type HazardRowNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type Acord126LogicalKey =
  // header strip (page 1)
  | 'formDate'
  | 'producerName'
  | 'insuredName'
  | 'effectiveDate'
  // agency customer id, page 1 box plus the page 2-4 header repeats
  | 'agencyCustomerId'
  | 'agencyCustomerIdP2'
  | 'agencyCustomerIdP3'
  | 'agencyCustomerIdP4'
  // coverage form
  | 'coverageClaimsMadeCheckbox'
  | 'coverageOccurrenceCheckbox'
  // general aggregate limit applies per
  | 'aggregatePolicyCheckbox'
  | 'aggregateProjectCheckbox'
  | 'aggregateLocationCheckbox'
  // limits column (the six core GL money boxes)
  | 'limitGeneralAggregate'
  | 'limitProductsCompOpsAggregate'
  | 'limitPersonalAdvInjury'
  | 'limitEachOccurrence'
  | 'limitDamageToRentedPremises'
  | 'limitMedicalExpense'
  // deductibles (mapped for the contract; no input backing in Phase 1b, so
  // they print totality defaults)
  | 'deductiblePropertyDamageCheckbox'
  | 'deductiblePropertyDamageAmount'
  | 'deductibleBodilyInjuryCheckbox'
  | 'deductibleBodilyInjuryAmount'
  | 'deductiblePerClaimCheckbox'
  | 'deductiblePerOccurrenceCheckbox'
  // schedule of hazards rows 1-9
  | `hazard${HazardRowNumber}ClassCode`
  | `hazard${HazardRowNumber}PremiumBasis`
  | `hazard${HazardRowNumber}Exposure`
  | `hazard${HazardRowNumber}Territory`
  | `hazard${HazardRowNumber}Rate`
  | `hazard${HazardRowNumber}Premium`;

export const ACORD126_FIELD_MAP: Record<Acord126LogicalKey, Acord126FieldMapEntry> = {
  // ----- header strip -----
  // P1 "DATE (MM/DD/YYYY)" (label 1.3 above the box, edges aligned). No input
  // backing in Phase 1b (the header model carries the effective date only).
  formDate: { pdfField: 'F[0].P1[0].Text2[0]', kind: 'date' },
  // P1 "AGENCY" (label 3.0 above, left edges aligned; single-line box, this
  // blank has no producer address block)
  producerName: { pdfField: 'F[0].P1[0].Text3[0]', kind: 'text' },
  // P1 "APPLICANT / FIRST NAMED INSURED" (label 2.7 above, left edges aligned)
  insuredName: { pdfField: 'F[0].P1[0].Text8[0]', kind: 'text' },
  // P1 "EFFECTIVE DATE" (label 1.1 above, left edges aligned)
  effectiveDate: { pdfField: 'F[0].P1[0].Text5[0]', kind: 'date' },

  // ----- agency customer id (page 1 box + page 2-4 header repeats; the box
  // sits 0.7-1.7 right of the label on every page). No input backing yet. ---
  agencyCustomerId: { pdfField: 'F[0].P1[0].Text1[0]', kind: 'text' }, // P1 "AGENCY CUSTOMER ID:"
  agencyCustomerIdP2: { pdfField: 'F[0].P2[0].Text1[0]', kind: 'text' }, // P2 "AGENCY CUSTOMER ID:"
  agencyCustomerIdP3: { pdfField: 'F[0].P3[0].Text1[0]', kind: 'text' }, // P3 "AGENCY CUSTOMER ID:"
  agencyCustomerIdP4: { pdfField: 'F[0].P4[0].Text1[0]', kind: 'text' }, // P4 "AGENCY CUSTOMER ID:"

  // ----- coverage form (labels 3.3 / 6.3 right of each box) -----
  coverageClaimsMadeCheckbox: { pdfField: 'F[0].P1[0].Check2[0]', kind: 'checkbox' }, // P1 "CLAIMS MADE"
  coverageOccurrenceCheckbox: { pdfField: 'F[0].P1[0].Check3[0]', kind: 'checkbox' }, // P1 "OCCURRENCE"

  // ----- general aggregate limit applies per (2x2 grid on the blank: POLICY
  // and LOCATION on the upper line, PROJECT and the deferred OTHER below;
  // labels 5.7-6.3 right of each box) -----
  aggregatePolicyCheckbox: { pdfField: 'F[0].P1[0].Check11[0]', kind: 'checkbox' }, // P1 "POLICY"
  aggregateProjectCheckbox: { pdfField: 'F[0].P1[0].Check12[0]', kind: 'checkbox' }, // P1 "PROJECT"
  aggregateLocationCheckbox: { pdfField: 'F[0].P1[0].Check13[0]', kind: 'checkbox' }, // P1 "LOCATION"

  // ----- limits column -----
  // Each money box shares its baseline with the printed row label and the
  // column's preprinted $ abuts the box (<= 0.6), so the builder emits bare
  // grouped digits here (never a '$' of its own, which could double up).
  limitGeneralAggregate: {
    pdfField: 'F[0].P1[0].Text14[0]', // P1 "GENERAL AGGREGATE"
    kind: 'limit',
    dollarPrefixOnForm: true,
  },
  limitProductsCompOpsAggregate: {
    pdfField: 'F[0].P1[0].Text16[0]', // P1 "PRODUCTS & COMPLETED OPERATIONS AGGREGATE"
    kind: 'limit',
    dollarPrefixOnForm: true,
  },
  limitPersonalAdvInjury: {
    pdfField: 'F[0].P1[0].Text17[0]', // P1 "PERSONAL & ADVERTISING INJURY"
    kind: 'limit',
    dollarPrefixOnForm: true,
  },
  limitEachOccurrence: {
    pdfField: 'F[0].P1[0].Text18[0]', // P1 "EACH OCCURRENCE"
    kind: 'limit',
    dollarPrefixOnForm: true,
  },
  limitDamageToRentedPremises: {
    pdfField: 'F[0].P1[0].Text19[0]', // P1 "DAMAGE TO RENTED PREMISES (each occurrence)"
    kind: 'limit',
    dollarPrefixOnForm: true,
  },
  limitMedicalExpense: {
    pdfField: 'F[0].P1[0].Text20[0]', // P1 "MEDICAL EXPENSE (Any one person)"
    kind: 'limit',
    dollarPrefixOnForm: true,
  },

  // ----- deductibles -----
  // Row layout: [box] PROPERTY DAMAGE $ [amount] / [box] BODILY INJURY $
  // [amount], with the shared basis pair PER CLAIM / PER OCCURRENCE to the
  // right of the amounts. The preprinted $ abuts each amount box.
  deductiblePropertyDamageCheckbox: { pdfField: 'F[0].P1[0].Check6[0]', kind: 'checkbox' }, // P1 "PROPERTY DAMAGE"
  deductiblePropertyDamageAmount: {
    pdfField: 'F[0].P1[0].Text10[0]', // P1 "PROPERTY DAMAGE $"
    kind: 'limit',
    dollarPrefixOnForm: true,
  },
  deductibleBodilyInjuryCheckbox: { pdfField: 'F[0].P1[0].Check7[0]', kind: 'checkbox' }, // P1 "BODILY INJURY"
  deductibleBodilyInjuryAmount: {
    pdfField: 'F[0].P1[0].Text11[0]', // P1 "BODILY INJURY $"
    kind: 'limit',
    dollarPrefixOnForm: true,
  },
  deductiblePerClaimCheckbox: { pdfField: 'F[0].P1[0].Check9[0]', kind: 'checkbox' }, // P1 "PER CLAIM" (stacked label)
  deductiblePerOccurrenceCheckbox: { pdfField: 'F[0].P1[0].Check10[0]', kind: 'checkbox' }, // P1 "PER OCCURRENCE" (stacked label)

  // ----- schedule of hazards (9 rows; column identity from the row-1 heads,
  // rows 2-9 by exact column x/width agreement; see header). RATE and PREMIUM
  // print into the PREM/OPS subcolumn; PRODUCTS subcolumn deferred. The rate
  // and premium columns carry NO preprinted $, so premium emits '$'. -----

  // ----- hazard row 1 (P1 Text32..Text38) -----
  hazard1ClassCode: { pdfField: 'F[0].P1[0].Text32[0]', kind: 'text' }, // P1 "CLASS CODE"
  hazard1PremiumBasis: { pdfField: 'F[0].P1[0].Text33[0]', kind: 'text' }, // P1 "PREMIUM BASIS"
  hazard1Exposure: { pdfField: 'F[0].P1[0].Text34[0]', kind: 'wholeNumber' }, // P1 "EXPOSURE"
  hazard1Territory: { pdfField: 'F[0].P1[0].Text35[0]', kind: 'text' }, // P1 "TERR"
  hazard1Rate: { pdfField: 'F[0].P1[0].Text36[0]', kind: 'rate' }, // P1 "RATE PREM/OPS"
  hazard1Premium: { pdfField: 'F[0].P1[0].Text38[0]', kind: 'limit' }, // P1 "PREMIUM PREM/OPS"
  // ----- hazard row 2 (P1 Text43..Text49) -----
  hazard2ClassCode: { pdfField: 'F[0].P1[0].Text43[0]', kind: 'text' }, // P1 "CLASS CODE"
  hazard2PremiumBasis: { pdfField: 'F[0].P1[0].Text44[0]', kind: 'text' }, // P1 "PREMIUM BASIS"
  hazard2Exposure: { pdfField: 'F[0].P1[0].Text45[0]', kind: 'wholeNumber' }, // P1 "EXPOSURE"
  hazard2Territory: { pdfField: 'F[0].P1[0].Text46[0]', kind: 'text' }, // P1 "TERR"
  hazard2Rate: { pdfField: 'F[0].P1[0].Text47[0]', kind: 'rate' }, // P1 "RATE PREM/OPS"
  hazard2Premium: { pdfField: 'F[0].P1[0].Text49[0]', kind: 'limit' }, // P1 "PREMIUM PREM/OPS"
  // ----- hazard row 3 (P1 Text54..Text60) -----
  hazard3ClassCode: { pdfField: 'F[0].P1[0].Text54[0]', kind: 'text' }, // P1 "CLASS CODE"
  hazard3PremiumBasis: { pdfField: 'F[0].P1[0].Text55[0]', kind: 'text' }, // P1 "PREMIUM BASIS"
  hazard3Exposure: { pdfField: 'F[0].P1[0].Text56[0]', kind: 'wholeNumber' }, // P1 "EXPOSURE"
  hazard3Territory: { pdfField: 'F[0].P1[0].Text57[0]', kind: 'text' }, // P1 "TERR"
  hazard3Rate: { pdfField: 'F[0].P1[0].Text58[0]', kind: 'rate' }, // P1 "RATE PREM/OPS"
  hazard3Premium: { pdfField: 'F[0].P1[0].Text60[0]', kind: 'limit' }, // P1 "PREMIUM PREM/OPS"
  // ----- hazard row 4 (P1 Text65..Text71) -----
  hazard4ClassCode: { pdfField: 'F[0].P1[0].Text65[0]', kind: 'text' }, // P1 "CLASS CODE"
  hazard4PremiumBasis: { pdfField: 'F[0].P1[0].Text66[0]', kind: 'text' }, // P1 "PREMIUM BASIS"
  hazard4Exposure: { pdfField: 'F[0].P1[0].Text67[0]', kind: 'wholeNumber' }, // P1 "EXPOSURE"
  hazard4Territory: { pdfField: 'F[0].P1[0].Text68[0]', kind: 'text' }, // P1 "TERR"
  hazard4Rate: { pdfField: 'F[0].P1[0].Text69[0]', kind: 'rate' }, // P1 "RATE PREM/OPS"
  hazard4Premium: { pdfField: 'F[0].P1[0].Text71[0]', kind: 'limit' }, // P1 "PREMIUM PREM/OPS"
  // ----- hazard row 5 (P1 Text76..Text82) -----
  hazard5ClassCode: { pdfField: 'F[0].P1[0].Text76[0]', kind: 'text' }, // P1 "CLASS CODE"
  hazard5PremiumBasis: { pdfField: 'F[0].P1[0].Text77[0]', kind: 'text' }, // P1 "PREMIUM BASIS"
  hazard5Exposure: { pdfField: 'F[0].P1[0].Text78[0]', kind: 'wholeNumber' }, // P1 "EXPOSURE"
  hazard5Territory: { pdfField: 'F[0].P1[0].Text79[0]', kind: 'text' }, // P1 "TERR"
  hazard5Rate: { pdfField: 'F[0].P1[0].Text80[0]', kind: 'rate' }, // P1 "RATE PREM/OPS"
  hazard5Premium: { pdfField: 'F[0].P1[0].Text82[0]', kind: 'limit' }, // P1 "PREMIUM PREM/OPS"
  // ----- hazard row 6 (P1 Text87..Text93) -----
  hazard6ClassCode: { pdfField: 'F[0].P1[0].Text87[0]', kind: 'text' }, // P1 "CLASS CODE"
  hazard6PremiumBasis: { pdfField: 'F[0].P1[0].Text88[0]', kind: 'text' }, // P1 "PREMIUM BASIS"
  hazard6Exposure: { pdfField: 'F[0].P1[0].Text89[0]', kind: 'wholeNumber' }, // P1 "EXPOSURE"
  hazard6Territory: { pdfField: 'F[0].P1[0].Text90[0]', kind: 'text' }, // P1 "TERR"
  hazard6Rate: { pdfField: 'F[0].P1[0].Text91[0]', kind: 'rate' }, // P1 "RATE PREM/OPS"
  hazard6Premium: { pdfField: 'F[0].P1[0].Text93[0]', kind: 'limit' }, // P1 "PREMIUM PREM/OPS"
  // ----- hazard row 7 (P1 Text98..Text104) -----
  hazard7ClassCode: { pdfField: 'F[0].P1[0].Text98[0]', kind: 'text' }, // P1 "CLASS CODE"
  hazard7PremiumBasis: { pdfField: 'F[0].P1[0].Text99[0]', kind: 'text' }, // P1 "PREMIUM BASIS"
  hazard7Exposure: { pdfField: 'F[0].P1[0].Text100[0]', kind: 'wholeNumber' }, // P1 "EXPOSURE"
  hazard7Territory: { pdfField: 'F[0].P1[0].Text101[0]', kind: 'text' }, // P1 "TERR"
  hazard7Rate: { pdfField: 'F[0].P1[0].Text102[0]', kind: 'rate' }, // P1 "RATE PREM/OPS"
  hazard7Premium: { pdfField: 'F[0].P1[0].Text104[0]', kind: 'limit' }, // P1 "PREMIUM PREM/OPS"
  // ----- hazard row 8 (P1 Text109..Text115) -----
  hazard8ClassCode: { pdfField: 'F[0].P1[0].Text109[0]', kind: 'text' }, // P1 "CLASS CODE"
  hazard8PremiumBasis: { pdfField: 'F[0].P1[0].Text110[0]', kind: 'text' }, // P1 "PREMIUM BASIS"
  hazard8Exposure: { pdfField: 'F[0].P1[0].Text111[0]', kind: 'wholeNumber' }, // P1 "EXPOSURE"
  hazard8Territory: { pdfField: 'F[0].P1[0].Text112[0]', kind: 'text' }, // P1 "TERR"
  hazard8Rate: { pdfField: 'F[0].P1[0].Text113[0]', kind: 'rate' }, // P1 "RATE PREM/OPS"
  hazard8Premium: { pdfField: 'F[0].P1[0].Text115[0]', kind: 'limit' }, // P1 "PREMIUM PREM/OPS"
  // ----- hazard row 9 (P1 Text120..Text126) -----
  hazard9ClassCode: { pdfField: 'F[0].P1[0].Text120[0]', kind: 'text' }, // P1 "CLASS CODE"
  hazard9PremiumBasis: { pdfField: 'F[0].P1[0].Text121[0]', kind: 'text' }, // P1 "PREMIUM BASIS"
  hazard9Exposure: { pdfField: 'F[0].P1[0].Text122[0]', kind: 'wholeNumber' }, // P1 "EXPOSURE"
  hazard9Territory: { pdfField: 'F[0].P1[0].Text123[0]', kind: 'text' }, // P1 "TERR"
  hazard9Rate: { pdfField: 'F[0].P1[0].Text124[0]', kind: 'rate' }, // P1 "RATE PREM/OPS"
  hazard9Premium: { pdfField: 'F[0].P1[0].Text126[0]', kind: 'limit' }, // P1 "PREMIUM PREM/OPS"
};

// ACORD edition date; must match acord_templates.version at onboarding.
export const ACORD126_TEMPLATE_VERSION: string = '2009-08';

// Critical subset for templateIngestion validateAcordFields (the acord25
// ACORD25_EXPECTED_FIELD_NAMES pattern): the load-bearing fields a genuine
// ACORD 126 must expose, used to reject a lookalike/stub at upload time.
// Because this blank's names are generic, the check is structural (the exact
// P1-P4 name set and depth of the numbering), not semantic.
export const ACORD126_EXPECTED_FIELD_NAMES: string[] = [
  'F[0].P1[0].Text1[0]',
  'F[0].P1[0].Text2[0]',
  'F[0].P1[0].Text3[0]',
  'F[0].P1[0].Text5[0]',
  'F[0].P1[0].Text8[0]',
  'F[0].P1[0].Check2[0]',
  'F[0].P1[0].Check3[0]',
  'F[0].P1[0].Check11[0]',
  'F[0].P1[0].Text14[0]',
  'F[0].P1[0].Text18[0]',
  'F[0].P1[0].Text32[0]',
  'F[0].P1[0].Text126[0]',
  'F[0].P2[0].Text1[0]',
  'F[0].P4[0].Text1[0]',
];
