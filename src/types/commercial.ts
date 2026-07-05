// Commercial lines shared types (Phase 0).
//
// Owned by docs/Commercial-Lines-Quote-to-Bind-Plan.md (v3 LOCKED, Section 3).
// Column names mirror the Phase 0 tables (migration 20260705160000) exactly.
// Types only. No runtime code.

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** Coverage line keys - same vocabulary as the Master COI / certificate modules. */
export type CommercialLineKey = 'gl' | 'auto' | 'umbrella' | 'wc' | 'property' | 'other';

/**
 * Field-level provenance (SOW v3 3.1): where each value came from. `manual` is
 * never overwritten by machine sources; feeders stage suggestions instead.
 */
export type ProvenanceSource = 'manual' | 'extracted' | 'canopy' | 'client' | 'book';

export interface FieldProvenanceEntry {
  src: ProvenanceSource;
  /** ISO timestamp of the write. */
  at: string;
  /** auth user id of the confirmer, when known. */
  by?: string | null;
}

/** Keyed by column name; absent key = never populated. */
export type FieldProvenance = Record<string, FieldProvenanceEntry>;

/** Submission lifecycle (SOW v3 3.3). */
export type SubmissionStatus =
  | 'draft'
  | 'intake'
  | 'packet_ready'
  | 'signing'
  | 'submitted'
  | 'quoted'
  | 'proposed'
  | 'bound'
  | 'lost'
  | 'abandoned';

/** Offer-and-rejection log coverage kinds (the E&O record). */
export type OfferCoverage = 'umbrella' | 'um_uim' | 'higher_limits' | 'wc_exemption' | 'other';
export type OfferDecision = 'pending' | 'accepted' | 'rejected';

// ---------------------------------------------------------------------------
// Risk store rows
// ---------------------------------------------------------------------------

interface CommercialRowBase {
  id: string;
  account_id: string;
  agency_workspace_id: string;
  field_provenance: FieldProvenance;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CommercialProfile extends CommercialRowBase {
  legal_name: string | null;
  dba: string | null;
  /** Masked in UI; never sent to AI unredacted. */
  fein: string | null;
  entity_type: string | null;
  sic_code: string | null;
  naics_code: string | null;
  description_of_operations: string | null;
  years_in_business: number | null;
  employee_count: number | null;
  part_time_employee_count: number | null;
  annual_revenue: number | null;
  annual_payroll: number | null;
  uses_subcontractors: boolean | null;
  subcontractor_cost: number | null;
  website: string | null;
  wc_experience_mod: number | null;
  wc_experience_mod_effective: string | null;
}

export interface CommercialLocation extends CommercialRowBase {
  location_number: number | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  county: string | null;
  /** owner / tenant */
  interest: string | null;
  occupancy: string | null;
  construction_type: string | null;
  iso_construction_code: string | null;
  year_built: number | null;
  square_footage: number | null;
  stories: number | null;
  sprinklered: boolean | null;
  sprinkler_coverage_pct: number | null;
  alarm_type: string | null;
  roof_type: string | null;
  roof_update_year: number | null;
  wiring_update_year: number | null;
  plumbing_update_year: number | null;
  heating_update_year: number | null;
  building_value: number | null;
  bpp_value: number | null;
  business_income_value: number | null;
  /** Prints on ACORD as-is (flat or text). */
  property_deductible: string | null;
  /** FL: percent or flat, prints as-is. */
  wind_hail_deductible: string | null;
  flood_zone: string | null;
}

export interface CommercialVehicle extends CommercialRowBase {
  /** Text: fleet unit labels are alphanumeric (mirrors canopy vocabulary). */
  unit_number: string | null;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  vehicle_type: string | null;
  body_type: string | null;
  gvwr: number | null;
  radius_of_operation: string | null;
  vehicle_use: string | null;
  cost_new: number | null;
  stated_value: number | null;
  comprehensive_deductible: string | null;
  collision_deductible: string | null;
  /** owned / leased */
  ownership: string | null;
  lienholder_name: string | null;
  lienholder_address: string | null;
  garaging_location_id: string | null;
}

export interface CommercialDriver extends CommercialRowBase {
  first_name: string | null;
  last_name: string | null;
  /** Masked in UI. */
  date_of_birth: string | null;
  /** Masked in UI. */
  license_number: string | null;
  license_state: string | null;
  years_licensed: number | null;
  hire_date: string | null;
  violations_3yr: number | null;
  accidents_3yr: number | null;
  excluded: boolean;
}

export interface CommercialWcClass extends CommercialRowBase {
  state: string;
  location_id: string | null;
  class_code: string | null;
  class_description: string | null;
  employee_count: number | null;
  annual_payroll: number | null;
}

export interface CommercialWcExemption extends CommercialRowBase {
  person_name: string;
  title: string | null;
  exemption_number: string | null;
  scope: 'construction' | 'non_construction' | null;
  effective_date: string | null;
  expiration_date: string | null;
}

export interface CommercialLossHistoryEntry extends CommercialRowBase {
  line_key: CommercialLineKey;
  policy_period_start: string | null;
  policy_period_end: string | null;
  carrier: string | null;
  date_of_loss: string | null;
  description: string | null;
  amount_paid: number | null;
  amount_reserved: number | null;
  status: 'open' | 'closed' | null;
  valuation_date: string | null;
  source_document_id: string | null;
}

// ---------------------------------------------------------------------------
// Submission spine
// ---------------------------------------------------------------------------

export interface CommercialSubmission {
  id: string;
  account_id: string;
  agency_workspace_id: string;
  target_lines: CommercialLineKey[];
  effective_date: string | null;
  status: SubmissionStatus;
  producer_id: string | null;
  csr_id: string | null;
  /** Universal-send target (free text; NO market registry by design). */
  wholesaler_name: string | null;
  wholesaler_email: string | null;
  /** Frozen at packet generation; the packet builds from THIS, not live data. */
  risk_snapshot: Record<string, unknown> | null;
  snapshot_frozen_at: string | null;
  remarket_of_policy_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SubmissionEvent {
  id: string;
  submission_id: string;
  action: string;
  actor_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Diligent-effort record row (append-only evidence). */
export interface SubmissionDeclination {
  id: string;
  submission_id: string;
  carrier_name: string;
  declined_at: string;
  reason: string | null;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
}

export interface SubmissionOfferRejection {
  id: string;
  account_id: string;
  agency_workspace_id: string;
  submission_id: string | null;
  policy_id: string | null;
  coverage: OfferCoverage;
  details: Record<string, unknown>;
  decision: OfferDecision;
  decided_at: string | null;
  signed_document_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ---------------------------------------------------------------------------
// Class-code reference rows
// ---------------------------------------------------------------------------

export interface GlClassCode {
  code: string;
  description: string;
}

export interface WcClassCode {
  code: string;
  state: string;
  description: string;
}
