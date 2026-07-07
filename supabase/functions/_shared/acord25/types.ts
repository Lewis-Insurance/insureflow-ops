// ACORD 25 payload builder input/output types.
//
// RUNTIME-FREE. No DOM, no Node, no pdf-lib, no imports outside this directory.
// Ported verbatim to supabase/functions/_shared/acord25/types.ts.
//
// Authority: docs/COI Module/coi-module/05-acord25-pipeline.md Sections 4.1, 4.2,
// 5; blueprint B Sections 4.1, 4.2, 5. Cross-doc 07 Section 2.1 (the
// signature_name_mismatch issue code).

import type { Acord25LogicalKey, InsurerLetter } from './fieldMap.ts';

// ---------------------------------------------------------------------------
// Input types (Section 4.1)
// ---------------------------------------------------------------------------

/**
 * Canonical line keys (R7). Published mapping table in 02-master-coi-data-layer.md;
 * ACORD 25 row mapping in Section 0.1 of doc 05.
 */
export type Acord25LineKey = 'gl' | 'auto' | 'umbrella' | 'wc' | 'property' | 'other';

/**
 * Resolved endorsement state, mirrors the closed three-state text contract of
 * resolve_holder_endorsements (02 Section 4.7). Only 'endorsed' can ever print Y.
 */
export type HolderResolvedStatus = 'endorsed' | 'requested' | 'none';

/**
 * One flag per printable column (ADDL INSD, SUBR WVD) per line. `resolved` comes
 * from resolve_holder_endorsements; `printIntent` is the user's per-line toggle
 * and can only DOWNGRADE (the builder errors if printIntent is true while
 * resolved is not 'endorsed', R3).
 */
export interface Acord25PrintFlag {
  resolved: HolderResolvedStatus;
  printIntent: boolean;
}

export interface InsurerAssignment {
  letter: InsurerLetter;
  /** As returned by get_master_coi. */
  name: string;
  naic: string | null;
  /** Every selected line appears in exactly one assignment. */
  lines: Acord25LineKey[];
}

export interface Acord25CoverageLine {
  line: Acord25LineKey;
  policyId: string;
  policyNumber: string;
  /** 'YYYY-MM-DD' from policies.effective_date. */
  effectiveDate: string;
  /** 'YYYY-MM-DD'. */
  expirationDate: string;
  /** null for wc (no ADDL INSD column on the 25). */
  additionalInsured: Acord25PrintFlag | null;
  waiverOfSubrogation: Acord25PrintFlag;
  gl?: {
    occurrence: boolean;
    claimsMade: boolean;
    aggregateAppliesPer: 'policy' | 'project' | 'location' | null;
    eachOccurrence: number | null;
    damageToRented: number | null;
    medExp: number | null;
    personalAdvInjury: number | null;
    generalAggregate: number | null;
    productsCompOpAgg: number | null;
  };
  auto?: {
    anyAuto: boolean;
    ownedOnly: boolean;
    scheduled: boolean;
    hired: boolean;
    nonOwned: boolean;
    combinedSingleLimit: number | null;
    biPerPerson: number | null;
    biPerAccident: number | null;
    propertyDamage: number | null;
  };
  umbrella?: {
    type: 'umbrella' | 'excess';
    basis: 'occurrence' | 'claims_made';
    dedOrRetention: { kind: 'ded' | 'retention'; amount: number } | null;
    eachOccurrence: number | null;
    aggregate: number | null;
  };
  wc?: {
    perStatute: boolean;
    other: boolean;
    proprietorExcluded: 'Y' | 'N' | null;
    elEachAccident: number | null;
    elDiseaseEachEmployee: number | null;
    elDiseasePolicyLimit: number | null;
  };
  otherRow?: { typeLabel: string; limitsText: string };
}
// NOTE: no premium field and no carrier name/NAIC exist anywhere in these types.
// Premium exclusion is deliberate (D8). Carrier identity lives ONLY in
// letterAssignments (R7), so the builder cannot invent or reassign a letter.

export interface Acord25BuildInput {
  /** 'YYYY-MM-DD', usually today. */
  certificateDate: string;
  /** Supplied by finalize_certificate_issue numbering (doc 04). */
  certificateNumber?: string | null;
  revisionNumber?: string | null;
  producer: {
    agencyName: string;
    addressLines: string[];
    contactName: string;
    phone: string;
    fax?: string;
    email: string;
  };
  insured: { name: string; addressLines: string[] };
  /** Already reduced to the user's checkbox selection. */
  lines: Acord25CoverageLine[];
  /** FROM get_master_coi, never computed here (R7). */
  letterAssignments: InsurerAssignment[];
  /**
   * Resolved per-line native write-in coverage, at most one per line that owns a
   * dedicated write-in NAME + LIMIT AMOUNT pair on the 25 (gl, auto, umbrella).
   * The adapter (toAcord25BuildInput) picks the FIRST additionalCoverages row for
   * each such line and spills the rest into descriptionOfOperations; wc/property
   * have no native slot and are spilled entirely. The builder prints a line's
   * write-in only when that line is among the selected/printed lines. Absent (or
   * an absent per-line entry) means the write-in fields stay at their totality
   * default ('').
   */
  writeInCoverages?: Partial<
    Record<'gl' | 'auto' | 'umbrella', { name: string; amount: number | null }>
  >;
  /** TWO separate inputs per R18 ... */
  descriptionOfOperations: string;
  /** ... joined deterministically at print time (Section 4.6). */
  remarks: string;
  /** null = master preview without holder. */
  holder: { name: string; addressLines: string[] } | null;
  authorizedRepName: string;
}

// ---------------------------------------------------------------------------
// Output contract (Section 4.2)
// ---------------------------------------------------------------------------

export interface Acord25Issue {
  code:
    | 'FIELD_MAP_UNPOPULATED'
    | 'NO_LINES_SELECTED'
    | 'LETTER_UNASSIGNED'
    | 'LETTER_CONFLICT'
    | 'TOO_MANY_CARRIERS'
    | 'OTHER_ROW_CONFLICT'
    | 'ADDL_INSD_PENDING'
    | 'ADDL_INSD_NOT_PERMITTED'
    | 'SUBR_WVD_PENDING'
    | 'SUBR_WVD_NOT_PERMITTED'
    | 'NAIC_MISSING'
    | 'HOLDER_MISSING'
    | 'DATE_INVALID'
    | 'OVERFLOW'
    // Validator-only template-integrity codes (validateAcord25 V2/V3/V5/V9). The
    // builder never emits these; they surface edition drift and lookalike PDFs.
    // Not in the original blueprint code list, which prescribed the error copy
    // for these checks but no code; added so the validator does not have to
    // misuse an unrelated code such as DATE_INVALID.
    | 'FIELD_NOT_IN_TEMPLATE'
    | 'FIELD_TYPE_MISMATCH'
    | 'YN_LITERAL_INVALID'
    | 'TEMPLATE_PIN_MISMATCH'
    // 07 Section 2.1, ADDITIVE: surfaced by validateAcord25 only, inert on this
    // text-field blank; included for forward-compat with a future overlay path.
    | 'signature_name_mismatch';
  severity: 'error' | 'warning';
  /** Human copy, no em or en dashes. */
  message: string;
  lineKey?: Acord25LineKey;
  logicalKeys?: Acord25LogicalKey[];
}

/**
 * Per-line ISO date context carried out of the builder so validateAcord25 V10 can
 * assert expiration >= effective (Section 5.2). Populated for every selected line
 * from the raw 'YYYY-MM-DD' inputs (before MM/DD/YYYY formatting). Empty strings
 * for a missing date are skipped by V10; the format check on the emitted strings
 * is separate.
 */
export interface Acord25LineDateContext {
  lineKey: Acord25LineKey;
  /** 'YYYY-MM-DD' as supplied to the builder, or '' when absent. */
  effectiveDate: string;
  /** 'YYYY-MM-DD' as supplied to the builder, or '' when absent. */
  expirationDate: string;
}

export interface BuildAcord25Result {
  /** false iff any severity 'error' issue. */
  ok: boolean;
  /** Keyed by EXACT pdf field names, TOTAL over the field map. */
  fieldValues: Record<string, string | boolean>;
  /** Pre-mapping view, for tests and UI preview. */
  logicalValues: Record<Acord25LogicalKey, string | boolean>;
  /**
   * Per-line raw ISO date pairs, one entry per selected line, so V10 can compare
   * expiration >= effective without re-parsing the formatted MM/DD/YYYY strings.
   */
  lineDates: Acord25LineDateContext[];
  issues: Acord25Issue[];
}

// ---------------------------------------------------------------------------
// Template info for the validator (Section 5). Structural, NOT imported from
// src/types/acord.ts, so the Deno port stays dependency-free.
// ---------------------------------------------------------------------------

export interface Acord25TemplateInfo {
  version: string;
  field_inventory: Array<{ name: string; type: string; maxLength?: number; options?: string[] }>;
}
