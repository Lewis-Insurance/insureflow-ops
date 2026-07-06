// ACORD 126 payload builder input/output types.
//
// RUNTIME-FREE. No DOM, no Node, no pdf-lib, no imports outside this directory.
// Clones the acord125/types.ts pattern.
//
// The input model is shaped for OUR commercial risk store, not the DB: plain,
// serializable, no imports from src/integrations or src/types. Strings default
// to '' for absent; money and rating numbers are number | null (null prints
// blank, never '0'). All dates are ISO 'YYYY-MM-DD' strings; the builder
// formats them to the ACORD MM/DD/YYYY print form.

import type { Acord126LogicalKey } from './fieldMap';

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/**
 * The three input-backed GENERAL AGGREGATE LIMIT APPLIES PER boxes. The blank
 * also carries an OTHER box with a description line (deferred in fieldMap.ts);
 * 'other' joins this union when the risk store carries a custom basis.
 */
export type Acord126AggregateAppliesPer = 'policy' | 'project' | 'location';

export interface Acord126Header {
  /** Prints into the APPLICANT / FIRST NAMED INSURED box. */
  namedInsured: string;
  /** 'YYYY-MM-DD' or '' when not yet set; prints into EFFECTIVE DATE. */
  effectiveDate: string;
  /** Prints into the AGENCY box (this blank has no producer address block). */
  producerName: string;
}

export interface Acord126Coverage {
  /** OCCURRENCE coverage form box. */
  occurrence: boolean;
  /**
   * CLAIMS MADE coverage form box. Mutually exclusive with occurrence;
   * the builder prints both as given and validateAcord126 flags the conflict.
   */
  claimsMade: boolean;
}

/**
 * The six core LIMITS column money boxes, whole dollars. null prints blank,
 * never '0' (the acord25 setLimit convention). The column preprints the
 * dollar sign, so values print as bare grouped digits.
 */
export interface Acord126Limits {
  eachOccurrence: number | null;
  /** DAMAGE TO RENTED PREMISES (each occurrence). */
  damageToRentedPremises: number | null;
  /** MEDICAL EXPENSE (Any one person). */
  medicalExpense: number | null;
  personalAdvInjury: number | null;
  generalAggregate: number | null;
  productsCompOpsAggregate: number | null;
}

/**
 * One SCHEDULE OF HAZARDS classification row. The blank splits RATE and
 * PREMIUM into PREM/OPS and PRODUCTS subcolumns; this model carries one rate
 * and one premium, which print into the PREM/OPS subcolumn (the PRODUCTS
 * subcolumn is deferred in fieldMap.ts until the model splits them).
 */
export interface Acord126HazardRow {
  /** GL class code; string so leading zeros survive. */
  classCode: string;
  /** Basis code from the printed legend: P, S, C, A, M, U or T. */
  premiumBasis: string;
  /**
   * Basis amount (payroll dollars, sales dollars, square feet, units...).
   * Prints as bare grouped digits; the unit comes from premiumBasis.
   */
  exposure: number | null;
  territory: string;
  /** Decimal rate per basis unit; prints via String(n), no rounding. */
  rate: number | null;
  /** Whole dollars; this column has no preprinted $, so '$' is emitted. */
  premium: number | null;
}

export interface Acord126Input {
  header: Acord126Header;
  coverage: Acord126Coverage;
  limits: Acord126Limits;
  /** null = no GENERAL AGGREGATE LIMIT APPLIES PER box checked. */
  aggregateAppliesPer: Acord126AggregateAppliesPer | null;
  /** Rows print in order onto the form's 9 schedule rows; extras are dropped
   * with a HAZARDS_OVERFLOW warning. */
  hazards: Acord126HazardRow[];
}

// ---------------------------------------------------------------------------
// Output contract (the acord25 BuildAcord25Result shape)
// ---------------------------------------------------------------------------

export interface Acord126Issue {
  code:
    | 'FIELD_MAP_UNPOPULATED'
    | 'EACH_OCCURRENCE_MISSING'
    | 'GENERAL_AGGREGATE_MISSING'
    | 'COVERAGE_FORM_CONFLICT'
    | 'DATE_INVALID'
    | 'HAZARDS_OVERFLOW';
  severity: 'error' | 'warning';
  /** Human copy, no em or en dashes. */
  message: string;
  logicalKeys?: Acord126LogicalKey[];
}

export interface BuildAcord126Result {
  /** false iff any severity 'error' issue. */
  ok: boolean;
  /** Keyed by EXACT pdf field names, TOTAL over the field map. */
  fieldValues: Record<string, string | boolean>;
  /** Pre-mapping view, for tests and UI preview. */
  logicalValues: Record<Acord126LogicalKey, string | boolean>;
  issues: Acord126Issue[];
}
