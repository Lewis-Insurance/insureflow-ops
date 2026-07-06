// ACORD 125 payload builder input/output types.
//
// RUNTIME-FREE. No DOM, no Node, no pdf-lib, no imports outside this directory.
// Clones the acord25/types.ts pattern.
//
// The input model is shaped for OUR commercial risk store, not the DB: plain,
// serializable, no imports from src/integrations or src/types. Strings default
// to '' for absent (only the closed vocabularies entityType/interest and the
// GL premium are nullable). All dates are ISO 'YYYY-MM-DD' strings; the builder
// formats them to the ACORD MM/DD/YYYY print form.

import type { Acord125LogicalKey } from './fieldMap.ts';

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/**
 * Legal entity vocabulary of the risk store. The blank also carries NOT FOR
 * PROFIT ORG and SUBCHAPTER "S" CORPORATION boxes (mapped in fieldMap.ts);
 * they join this union when the risk store learns to distinguish them.
 */
export type Acord125EntityType =
  | 'corporation'
  | 'llc'
  | 'individual'
  | 'partnership'
  | 'joint_venture'
  | 'trust'
  | 'other';

/** Premises interest vocabulary; 'lease' prints through the blank's TENANT box. */
export type Acord125PremisesInterest = 'own' | 'lease';

export interface Acord125Producer {
  name: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
  contactName: string;
  phone: string;
  fax: string;
  email: string;
  /** Agency customer id; prints on page 1 and in the page 2-4 headers. */
  customerId: string;
  /**
   * Printed on the page 4 signature line AND the adjacent PRODUCER'S NAME
   * (please print) box. This blank exposes both as plain text fields.
   */
  authorizedRepName: string;
}

export interface Acord125NamedInsured {
  name: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
  /** null = no legal entity box checked. */
  entityType: Acord125EntityType | null;
  /** FEIN, printed into NamedInsured_TaxIdentifier. */
  fein: string;
  sic: string;
  naics: string;
  phone: string;
  website: string;
}

export interface Acord125Policy {
  /** 'YYYY-MM-DD' or '' when not yet set. */
  effectiveDate: string;
  /** 'YYYY-MM-DD' or ''. */
  expirationDate: string;
  policyNumber: string;
}

export interface Acord125LinesOfBusiness {
  gl: boolean;
  /**
   * Whole dollars. Prints only while gl is checked; null prints blank, never
   * '0' (the acord25 setLimit convention).
   */
  glPremium: number | null;
  property: boolean;
  auto: boolean;
  umbrella: boolean;
}

export interface Acord125Premises {
  /** Single street line; the blank's second street line is not in this model. */
  street: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  /** null = neither interest box checked. */
  interest: Acord125PremisesInterest | null;
}

export interface Acord125NatureOfBusiness {
  /** Prints into DESCRIPTION OF PRIMARY OPERATIONS on page 2. */
  description: string;
}

export interface Acord125Input {
  /** 'YYYY-MM-DD', usually today. */
  completionDate: string;
  producer: Acord125Producer;
  namedInsured: Acord125NamedInsured;
  policy: Acord125Policy;
  linesOfBusiness: Acord125LinesOfBusiness;
  /** Rows print in order onto the form's 4 location rows; extras are dropped
   * with a PREMISES_OVERFLOW warning. */
  premises: Acord125Premises[];
  natureOfBusiness: Acord125NatureOfBusiness;
}

// ---------------------------------------------------------------------------
// Output contract (the acord25 BuildAcord25Result shape)
// ---------------------------------------------------------------------------

export interface Acord125Issue {
  code:
    | 'FIELD_MAP_UNPOPULATED'
    | 'INSURED_NAME_MISSING'
    | 'EFFECTIVE_DATE_MISSING'
    | 'DATE_INVALID'
    | 'PREMISES_OVERFLOW';
  severity: 'error' | 'warning';
  /** Human copy, no em or en dashes. */
  message: string;
  logicalKeys?: Acord125LogicalKey[];
}

export interface BuildAcord125Result {
  /** false iff any severity 'error' issue. */
  ok: boolean;
  /** Keyed by EXACT pdf field names, TOTAL over the field map. */
  fieldValues: Record<string, string | boolean>;
  /** Pre-mapping view, for tests and UI preview. */
  logicalValues: Record<Acord125LogicalKey, string | boolean>;
  issues: Acord125Issue[];
}
