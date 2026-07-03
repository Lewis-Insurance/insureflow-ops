// Master COI read-model contract.
//
// This file is the single TypeScript mirror of the `get_master_coi(account_id)`
// RPC JSON contract (deployed to prod). It is the module's one read-model
// contract: 06-ui-surfaces.md consumes these types directly (its MasterCOIView is
// at most a thin adapter, never a parallel vocabulary), and 04-issuance-and-snapshots.md
// freezes `MasterCOI` output into the issued snapshot.
//
// Authority: docs/COI Module/coi-module/02-master-coi-data-layer.md
//   - Section 2.5 (cell shape), Section 2.6 (the full JSON contract), Section 2.7
//     (readiness blocker + warning vocabulary), Section 4.7 (holder resolution +
//     AI-row / WC-subro-waiver row shapes), Section 6 (producer settings), Section 7
//     (description of operations + account COI profile), Section 8 (this file's spec).
//   - docs/COI Module/coi-module/07-supplemental-enhancements.md Section 6 adds the
//     `source_data_stale` warning code (Section 1 registry item 2).
//
// Types only. No runtime code. Field names match 02 Section 2.6 exactly.

// ---------------------------------------------------------------------------
// Canonical line-key enum (02 Section 2.3)
// ---------------------------------------------------------------------------

/** The canonical line-key enum for the whole module (02 Section 2.3). */
export type COILineKey = 'gl' | 'auto' | 'umbrella' | 'wc' | 'property' | 'other';

// ---------------------------------------------------------------------------
// Field cell shape and provenance (02 Section 2.5)
// ---------------------------------------------------------------------------

/**
 * Provenance of a cell value (02 Section 2.5). Closed set, six values; there is
 * no 'legacy' value anywhere in this module.
 */
export type COICellSource =
  | 'manual'
  | 'extracted'
  | 'reference'
  | 'account'
  | 'workspace'
  | 'missing';

/**
 * Conflict/attribution flag on a cell (02 Section 2.5 / 3.3):
 * `overwritten_manual` (an extractor overwrote a ledger-tracked manual value) or
 * `mismatch` (two authoritative sources disagree; today only the insurer NAIC cell).
 */
export type COICellFlag = null | 'overwritten_manual' | 'mismatch';

/**
 * Every scalar the ACORD 25 needs is returned as a cell object, never a bare
 * value (02 Section 2.5). `path` is the registry write path to send back to
 * `save_master_coi_fields`; null when the field is not editable here.
 */
export interface COICell<T = string | number | boolean> {
  /** Value, null when missing. */
  v: T | null;
  /** Provenance. */
  src: COICellSource;
  /** Registry write path (Section 3.2); null = not editable here. */
  path: string | null;
  /** Extraction confidence when known, else null. */
  conf?: number | null;
  /** For ledger-tracked manual writes, else null. */
  updated_at?: string | null;
  /** For ledger-tracked manual writes, else null. */
  updated_by?: string | null;
  /** null | 'overwritten_manual' | 'mismatch' (Section 3.3). */
  flag?: COICellFlag;
}

// ---------------------------------------------------------------------------
// Named insured + producer blocks (02 Section 2.6, Section 6)
// ---------------------------------------------------------------------------

/** Named insured block (02 Section 2.6). Sourced from accounts + businesses.dba. */
export interface COINamedInsured {
  name: COICell<string>;
  dba: COICell<string>;
  address_line1: COICell<string>;
  address_line2: COICell<string>;
  city: COICell<string>;
  state: COICell<string>;
  zip: COICell<string>;
  /**
   * Warning-only cross-check against policies.named_insured and
   * <line>_details.identity.named_insured.
   */
  policy_named_insured_mismatch: boolean;
}

/** Producer block (02 Section 2.6, Section 6). Sourced from agency_workspaces. */
export interface COIProducer {
  name: COICell<string>;
  contact_name: COICell<string>;
  phone: COICell<string>;
  fax: COICell<string>;
  email: COICell<string>;
  address_line1: COICell<string>;
  address_line2: COICell<string>;
  city: COICell<string>;
  state: COICell<string>;
  zip: COICell<string>;
  license_number: COICell<string>;
}

/**
 * Producer settings stored under `agency_workspaces.settings.coi_producer`
 * (02 Section 6). Written by a small admin settings form owned by 06-ui-surfaces.md.
 */
export interface COIProducerSettings {
  producer_name: string | null;
  contact_name: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  license_number: string | null;
}

// ---------------------------------------------------------------------------
// Insurers (02 Section 2.6, Sections 5.2 and 5.4)
// ---------------------------------------------------------------------------

/**
 * Carrier resolution outcome for an insurer row (02 Section 2.6, Section 5.2).
 * Closed set.
 */
export type COIInsurerResolution =
  | 'carrier_id'
  | 'exact'
  | 'alias'
  | 'normalized'
  | 'unresolved';

/** Insurer row (letters A..F), max 6 (02 Section 2.6, Sections 5.2 and 5.4). */
export interface COIInsurer {
  /** 'A'..'F'. */
  letter: string;
  name: COICell<string>;
  naic: COICell<string>;
  carrier_id: string | null;
  resolution: COIInsurerResolution;
  lines: COILineKey[];
  policy_ids: string[];
}

/**
 * Overflow insurer entry (02 Section 2.6): same shape as COIInsurer minus the
 * letter. A non-empty `insurer_overflow` is the `insurer_overflow` blocker.
 */
export type COIInsurerOverflow = Omit<COIInsurer, 'letter'>;

// ---------------------------------------------------------------------------
// Additional-insured + WC-subrogation-waiver rows (02 Section 2.6, Section 4.7)
// ---------------------------------------------------------------------------

/** Endorsement three-state (02 Section 4.1). */
export type COIEndorsementStatus = 'none' | 'requested' | 'endorsed';

/** GL ai_type CHECK vocabulary (02 Section 0, 20251221190001:108-112). */
export type COIGLAIType =
  | 'ongoing_ops'
  | 'completed_ops'
  | 'both'
  | 'owners_lessees_contractors'
  | 'managers_lessors'
  | 'vendors'
  | 'co_owner'
  | 'designated_person'
  | 'other';

/** Umbrella ai_type CHECK vocabulary (02 Section 0, 20251221210001:120). */
export type COIUmbrellaAIType = 'blanket' | 'scheduled' | 'follow_underlying';

/**
 * Additional-insured row (02 Section 2.6, Section 4).
 *
 * GL and Umbrella rows carry `ai_type` and the endorsement `effective_date` /
 * `expiration_date` pair. Auto and Property rows (mixed interest tables) carry
 * `blanket` (Section 4.7.2 scope column) and `endorsement_effective_date`
 * instead. All fields are present in the union so the single row type mirrors
 * every line's `additional_insureds[]` element; per-line specifics are noted.
 */
export interface COIAdditionalInsuredRow {
  id: string;
  name: string | null;
  /** FK to the directory once linked (03-additional-insureds-directory.md). */
  additional_insured_id: string | null;
  /** GL/Umbrella only: ai_type vocabulary per line; absent on auto/property. */
  ai_type?: COIGLAIType | COIUmbrellaAIType | string | null;
  /** Auto/Property only: blanket scope column (Section 4.7.2). */
  blanket?: boolean;
  primary_noncontributory: boolean;
  waiver_of_subrogation: boolean;
  endorsement_status: COIEndorsementStatus;
  endorsement_form: string | null;
  /** GL/Umbrella use effective_date / expiration_date. */
  effective_date?: string | null;
  expiration_date?: string | null;
  /** Auto/Property use endorsement_effective_date. */
  endorsement_effective_date?: string | null;
  endorsement_confirmed_at: string | null;
  endorsement_confirmed_by: string | null;
}

/** WC subrogation waiver row (02 Section 2.6, Section 4.3). */
export interface COIWCSubroWaiverRow {
  id: string;
  waiver_scope: 'blanket' | 'specific';
  name: string | null;
  /** Directory link (03-additional-insureds-directory.md). */
  additional_insured_id: string | null;
  endorsement_status: COIEndorsementStatus;
  endorsement_form: string | null;
  endorsement_effective_date: string | null;
  endorsement_confirmed_at: string | null;
  endorsement_confirmed_by: string | null;
}

// ---------------------------------------------------------------------------
// Per-line candidate + shared line skeleton (02 Section 2.4, Section 2.6)
// ---------------------------------------------------------------------------

/**
 * A candidate policy for a line (02 Section 2.4, Section 2.6). All candidates are
 * returned, the selected one flagged, so the picker can override without a second
 * RPC.
 */
export interface COILineCandidate {
  policy_id: string;
  policy_number: string | null;
  status: string | null;
  expiration_date: string | null;
  /** Per-candidate expired flag so the UI can disable individual expired policies. */
  expired: boolean;
  selected: boolean;
}

/**
 * Fields shared by every present-or-absent line skeleton (02 Section 2.6).
 * Absent lines still return the full skeleton with `present: false` and `missing`
 * cells.
 */
export interface COILineBase {
  present: boolean;
  policy_id: string | null;
  insurer_letter: string | null;
  status: string | null;
  /** R6: per-line expired flag; UI disables the line checkbox when true. */
  expired: boolean;
  policy_number: COICell<string>;
  effective_date: COICell<string>;
  expiration_date: COICell<string>;
  candidates: COILineCandidate[];
}

// ---------------------------------------------------------------------------
// Per-line types (02 Section 2.6)
// ---------------------------------------------------------------------------

/** GL limits block (02 Section 2.6, commercial-gl.ts:255-279). */
export interface COIGLLimits {
  each_occurrence: COICell<number>;
  damage_to_rented_premises: COICell<number>;
  medical_expense: COICell<number>;
  personal_advertising_injury: COICell<number>;
  general_aggregate: COICell<number>;
  products_completed_ops_aggregate: COICell<number>;
}

/** General Liability line (02 Section 2.6). */
export interface COILineGL extends COILineBase {
  occurrence_or_claims_made: COICell<string>;
  aggregate_applies_per: COICell<string>;
  limits: COIGLLimits;
  additional_insureds: COIAdditionalInsuredRow[];
}

/** ACORD 25 auto checkboxes, derived read-only (02 Section 2.6). */
export interface COIAutoCheckboxes {
  any_auto: COICell<boolean>;
  owned_autos: COICell<boolean>;
  scheduled_autos: COICell<boolean>;
  hired_autos: COICell<boolean>;
  non_owned_autos: COICell<boolean>;
}

/** Automobile Liability line (02 Section 2.6). */
export interface COILineAuto extends COILineBase {
  limit_type: COICell<string>;
  csl: COICell<number>;
  bi_per_person: COICell<number>;
  bi_per_accident: COICell<number>;
  pd_per_accident: COICell<number>;
  checkboxes: COIAutoCheckboxes;
  additional_insureds: COIAdditionalInsuredRow[];
}

/** Umbrella deductible-or-retention block (02 Section 2.6). */
export interface COIUmbrellaDedOrRetention {
  kind: COICell<string>;
  amount: COICell<number>;
}

/** Umbrella or Excess Liability line (02 Section 2.6). */
export interface COILineUmbrella extends COILineBase {
  umbrella_or_excess: COICell<string>;
  occurrence_or_claims_made: COICell<string>;
  each_occurrence: COICell<number>;
  aggregate: COICell<number>;
  ded_or_retention: COIUmbrellaDedOrRetention;
  additional_insureds: COIAdditionalInsuredRow[];
}

/** Workers Compensation line (02 Section 2.6). */
export interface COILineWC extends COILineBase {
  per_statute: COICell<boolean>;
  el_each_accident: COICell<number>;
  el_disease_each_employee: COICell<number>;
  el_disease_policy_limit: COICell<number>;
  proprietor_excluded: COICell<boolean>;
  subrogation_waivers: COIWCSubroWaiverRow[];
}

/** Property line, rendered in the ACORD 25 free OTHER row (02 Section 2.6). */
export interface COILineProperty extends COILineBase {
  label: COICell<string>;
  limit_amount: COICell<number>;
  limit_description: COICell<string>;
  additional_insureds: COIAdditionalInsuredRow[];
}

/** An unclassified policy surfaced under `lines.other[]` (02 Section 2.6). */
export interface COILineOtherEntry {
  policy_id: string;
  policy_number: string | null;
  line_of_business: string | null;
  line_canonical: string | null;
  carrier: string | null;
  status: string | null;
  effective_date: string | null;
  expiration_date: string | null;
}

/** The five ACORD lines plus the unclassified `other[]` bucket (02 Section 2.6). */
export interface COILines {
  gl: COILineGL;
  auto: COILineAuto;
  umbrella: COILineUmbrella;
  wc: COILineWC;
  property: COILineProperty;
  other: COILineOtherEntry[];
}

// ---------------------------------------------------------------------------
// Description of operations (02 Section 2.6, Section 7)
// ---------------------------------------------------------------------------

/** Source of the description-of-operations value (mirrors ops_source; 02 Section 2.6). */
export type COIOpsSource = 'manual' | 'canopy' | 'bap_risk_context' | 'missing';

/** A description-of-operations prefill candidate (02 Section 2.6, Section 7). */
export interface COIOpsPrefillCandidate {
  source: 'canopy' | 'bap_risk_context';
  text: string;
}

/** Description of operations block (02 Section 2.6, Section 7). */
export interface COIDescriptionOfOperations {
  v: string | null;
  src: COIOpsSource;
  prefill_candidates: COIOpsPrefillCandidate[];
}

// ---------------------------------------------------------------------------
// Review block (02 Section 2.6, Section 8.3)
// ---------------------------------------------------------------------------

/** Review stamp + staleness (02 Section 2.6, Section 8.3). */
export interface COIReview {
  last_reviewed_at: string | null;
  last_reviewed_by: string | null;
  /**
   * True when any contributing policies.updated_at, AI-table updated_at, or
   * account_coi_profiles.updated_at is later than last_reviewed_at.
   */
  stale: boolean;
}

// ---------------------------------------------------------------------------
// Readiness: the canonical blocker + warning vocabulary (02 Section 2.7)
// ---------------------------------------------------------------------------

/** Readiness blocker codes (02 Section 2.7). Cert must not generate on ANY blocker. */
export type COIReadinessBlockerCode =
  | 'no_lines'
  | 'policy_core_missing'
  | 'limit_missing'
  | 'insurer_unresolved'
  | 'policy_expired'
  | 'insurer_overflow';

/**
 * Readiness warning codes (02 Section 2.7), including `source_data_stale`
 * (07-supplemental-enhancements.md Sections 1 and 6). Cert can generate; panel
 * shows amber.
 */
export type COIReadinessWarningCode =
  | 'naic_missing'
  | 'naic_mismatch'
  | 'policy_expiring_soon'
  | 'endorsement_requested'
  | 'manual_overwritten'
  | 'named_insured_mismatch'
  | 'ops_missing'
  | 'review_stale'
  | 'unclassified_policies'
  | 'producer_incomplete'
  | 'source_data_stale';

/** A readiness blocker (02 Section 2.7). */
export interface COIReadinessBlocker {
  code: COIReadinessBlockerCode;
  line?: COILineKey;
  path?: string;
  message: string;
}

/** A readiness warning (02 Section 2.7). */
export interface COIReadinessWarning {
  code: COIReadinessWarningCode;
  line?: COILineKey;
  message: string;
}

/** Readiness block (02 Section 2.6, Section 2.7). `ready = (blockers is empty)`. */
export interface COIReadiness {
  ready: boolean;
  blockers: COIReadinessBlocker[];
  warnings: COIReadinessWarning[];
}

// ---------------------------------------------------------------------------
// Holder-scoped endorsement resolution (02 Section 4.7)
// ---------------------------------------------------------------------------

/**
 * Resolved endorsement state, closed set over three states, never booleans
 * (02 Section 4.7). Only 'endorsed' can ever print Y.
 */
export type COIHolderEndorsementResolved = 'endorsed' | 'requested' | 'none';

/** One row of `resolve_holder_endorsements` output (02 Section 4.7.1, 4.7.3). */
export interface HolderEndorsementResolution {
  /** Canonical line key (gl, auto, umbrella, wc, property). */
  line_key: COILineKey;
  addl_insd_resolved: COIHolderEndorsementResolved;
  subr_wvd_resolved: COIHolderEndorsementResolved;
  /** { "addl_insd": {...}, "subr_wvd": {...} }; basis shape in 02 Section 4.7.3. */
  basis: unknown;
}

// ---------------------------------------------------------------------------
// Account COI profile (02 Section 7)
// ---------------------------------------------------------------------------

/** `account_coi_profiles` row (02 Section 7). */
export interface AccountCOIProfile {
  account_id: string;
  agency_workspace_id: string;
  description_of_operations: string | null;
  ops_source: 'manual' | 'canopy' | 'bap_risk_context' | null;
  default_remarks: string | null;
  last_reviewed_at: string | null;
  last_reviewed_by: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Top-level contract (02 Section 2.6)
// ---------------------------------------------------------------------------

/**
 * The full `get_master_coi(account_id)` JSON contract (02 Section 2.6). One
 * self-contained document; the issued-COI snapshot (Decision 4) can be this
 * output frozen verbatim, plus holder and remarks.
 */
export interface MasterCOI {
  version: number;
  generated_at: string;
  account_id: string;
  named_insured: COINamedInsured;
  producer: COIProducer;
  /** Max 6, letters A..F (Sections 5.2 and 5.4). */
  insurers: COIInsurer[];
  /** Same shape minus letter; non-empty is a blocker. */
  insurer_overflow: COIInsurerOverflow[];
  lines: COILines;
  description_of_operations: COIDescriptionOfOperations;
  review: COIReview;
  /** This vocabulary is canonical module-wide (Section 2.7). */
  readiness: COIReadiness;
}
