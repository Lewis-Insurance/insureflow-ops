/**
 * Commercial Auto / Business Auto Policy Types
 *
 * Comprehensive type definitions for BAP (Business Auto Policy) data including:
 * - Policy identity and dates
 * - Coverage forms with symbols
 * - Liability, physical damage, UM/UIM, PIP
 * - Vehicle schedule with VINs
 * - Driver schedule
 * - Additional insureds and loss payees
 * - Premium breakdown
 */

// =============================================================================
// POLICY IDENTITY
// =============================================================================

export interface BAPPolicyIdentity {
  carrier_name: string;
  carrier_naic?: string;
  policy_number: string;
  transaction_type: 'quote' | 'bound' | 'issued' | 'renewal' | 'endorsement' | 'cancel';
  named_insured: string;
  dba?: string;
  mailing_address: Address;
  primary_garaging_address?: Address;
  fein?: string;
  producer?: string;
  agency?: string;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
}

// =============================================================================
// POLICY DATES
// =============================================================================

export interface BAPPolicyDates {
  effective_date: string; // YYYY-MM-DD
  expiration_date: string;
  issue_date?: string;
  policy_term?: string;
}

// =============================================================================
// RISK / OPERATIONS CONTEXT
// =============================================================================

export interface BAPRiskContext {
  business_description?: string;
  radius_of_operations?: 'local' | 'intermediate' | 'long_haul';
  garaging_states: string[];
  is_fleet: boolean;
  fleet_size?: number;
  underwriting_notes?: string[];
}

// =============================================================================
// COVERAGE SYMBOLS
// =============================================================================

/**
 * BAP Coverage Symbols - "what coverage applies to what autos"
 *
 * 1 = Any Auto
 * 2 = Owned Autos Only
 * 3 = Owned Private Passenger Autos Only
 * 4 = Owned Autos Other Than Private Passenger
 * 5 = Owned Autos Subject to No-Fault
 * 6 = Owned Autos Subject to Compulsory UM
 * 7 = Specifically Described Autos
 * 8 = Hired Autos Only
 * 9 = Non-Owned Autos Only
 * 19 = Mobile Equipment Subject to Compulsory/Financial Responsibility
 */
export type CoverageSymbol = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '19';

export const COVERAGE_SYMBOL_LABELS: Record<CoverageSymbol, string> = {
  '1': 'Any Auto',
  '2': 'Owned Autos Only',
  '3': 'Owned Private Passenger Autos Only',
  '4': 'Owned Autos Other Than Private Passenger',
  '5': 'Owned Autos Subject to No-Fault',
  '6': 'Owned Autos Subject to Compulsory UM',
  '7': 'Specifically Described Autos',
  '8': 'Hired Autos Only',
  '9': 'Non-Owned Autos Only',
  '19': 'Mobile Equipment',
};

// =============================================================================
// COVERAGE DETAILS
// =============================================================================

export interface BAPCoverageItem {
  coverage_name: string;
  symbols: CoverageSymbol[];
  limit?: number;
  limit_type?: 'csl' | 'split' | 'per_accident' | 'per_person' | 'per_day';
  deductible?: number;
  applies_to?: string; // State-specific
}

export interface BAPLiabilityCoverage {
  /** Combined Single Limit OR Split Limits */
  limit_type: 'csl' | 'split';

  /** CSL amount if limit_type = 'csl' */
  csl_limit?: number;

  /** Split limits if limit_type = 'split' */
  bodily_injury_per_person?: number;
  bodily_injury_per_accident?: number;
  property_damage?: number;

  /** Symbols that apply */
  symbols: CoverageSymbol[];
}

export interface BAPPhysicalDamageCoverage {
  /** Comprehensive */
  comprehensive: {
    deductible: number;
    symbols: CoverageSymbol[];
    valuation?: 'actual_cash_value' | 'stated_amount' | 'agreed_value';
  };

  /** Collision */
  collision: {
    deductible: number;
    symbols: CoverageSymbol[];
  };

  /** Special equipment coverage */
  special_equipment?: {
    limit: number;
    description?: string;
  };

  /** Customizing equipment */
  customizing_equipment?: {
    limit: number;
  };

  /** Glass coverage */
  glass_coverage?: {
    included: boolean;
    separate_deductible?: number;
  };
}

export interface BAPUMUIMCoverage {
  um_limit?: number;
  uim_limit?: number;
  symbols: CoverageSymbol[];
  is_stacked?: boolean;
  is_rejected?: boolean;
  rejection_date?: string;
}

export interface BAPPIPCoverage {
  limit: number;
  deductible?: number;
  symbols: CoverageSymbol[];
  work_loss_included?: boolean;
  medical_only?: boolean;
  state_specific_options?: Record<string, any>;
}

export interface BAPMedPayCoverage {
  limit: number;
  symbols: CoverageSymbol[];
}

export interface BAPHiredNonOwnedCoverage {
  hired_auto_liability: {
    limit: number;
    symbols: CoverageSymbol[]; // Usually symbol 8
  };
  non_owned_auto_liability: {
    limit: number;
    symbols: CoverageSymbol[]; // Usually symbol 9
  };
}

export interface BAPCoverageStructure {
  liability: BAPLiabilityCoverage;
  physical_damage: BAPPhysicalDamageCoverage;
  um_uim?: BAPUMUIMCoverage;
  pip?: BAPPIPCoverage;
  medical_payments?: BAPMedPayCoverage;
  hired_non_owned?: BAPHiredNonOwnedCoverage;

  /** Towing and labor */
  towing_labor?: {
    limit: number;
    per_disablement?: boolean;
  };

  /** Rental reimbursement */
  rental_reimbursement?: {
    limit_per_day: number;
    max_limit: number;
  };

  /** GAP coverage */
  gap_coverage?: {
    included: boolean;
  };

  /** Additional coverage items */
  additional_coverages: BAPCoverageItem[];
}

// =============================================================================
// VEHICLE SCHEDULE
// =============================================================================

export interface BAPVehicle {
  /** Unit number for identification */
  unit_number?: string;

  /** Vehicle info */
  year: number;
  make: string;
  model: string;
  vin: string;

  /** Classification */
  body_type?: string;
  gvw?: number; // Gross vehicle weight
  vehicle_class?: string;
  use_type?: 'service' | 'retail' | 'artisan' | 'trucking' | 'commercial' | 'pleasure';

  /** Garaging */
  garaging_zip: string;
  garaging_state: string;

  /** Valuation */
  cost_new?: number;
  stated_amount?: number;
  actual_cash_value?: number;

  /** Physical damage per vehicle */
  comprehensive_deductible?: number;
  collision_deductible?: number;

  /** Special equipment */
  special_equipment_coverage?: number;

  /** Driver assignment */
  primary_driver_name?: string;

  /** Vehicle-level endorsements */
  endorsements?: string[];

  /** Evidence tracking */
  evidence_ids?: string[];
  extraction_confidence?: number;
  extraction_status?: 'AUTO_APPLIED' | 'NEEDS_REVIEW' | 'LOW_CONFIDENCE' | 'NOT_FOUND' | 'MANUAL';
}

// =============================================================================
// DRIVER SCHEDULE
// =============================================================================

export interface BAPDriver {
  name: string;
  date_of_birth?: string; // YYYY-MM-DD
  license_number?: string; // Often suppressed
  license_state?: string;
  relationship: 'employee' | 'owner' | 'family' | 'other';
  driver_type: 'rated' | 'excluded' | 'occasional';

  /** MVR info */
  violations_points?: number;
  accidents_count?: number;
  mvr_status?: 'clean' | 'minor' | 'major';
  sr22_required?: boolean;

  /** Evidence tracking */
  evidence_ids?: string[];
  extraction_confidence?: number;
  extraction_status?: 'AUTO_APPLIED' | 'NEEDS_REVIEW' | 'LOW_CONFIDENCE' | 'NOT_FOUND' | 'MANUAL';
}

// =============================================================================
// ADDITIONAL INTERESTS
// =============================================================================

export interface BAPAdditionalInsured {
  name: string;
  address?: Address;
  relationship?: string;

  /** Link to specific vehicles */
  vehicle_vins?: string[];
  vehicle_unit_numbers?: string[];

  /** Coverage type */
  coverage_type: 'additional_insured' | 'loss_payee' | 'lienholder' | 'lessor' | 'additional_interest';

  /** Evidence tracking */
  evidence_ids?: string[];
}

// =============================================================================
// PREMIUM SUMMARY
// =============================================================================

export interface BAPPremiumSummary {
  total_premium: number;

  /** Premium breakdown by coverage */
  liability_premium?: number;
  physical_damage_premium?: number;
  comprehensive_premium?: number;
  collision_premium?: number;
  um_uim_premium?: number;
  pip_premium?: number;
  hired_non_owned_premium?: number;

  /** Fees and surcharges */
  policy_fee?: number;
  installment_fee?: number;
  state_taxes?: number;
  stamping_fee?: number; // Surplus lines

  /** Deposit */
  deposit_premium?: number;

  /** Premium by vehicle (optional) */
  premium_by_vehicle?: {
    vin: string;
    premium: number;
  }[];
}

// =============================================================================
// FULL POLICY DETAILS
// =============================================================================

export interface BAPPolicyDetails {
  identity: BAPPolicyIdentity;
  dates: BAPPolicyDates;
  risk_context: BAPRiskContext;
  coverage: BAPCoverageStructure;
  vehicles: BAPVehicle[];
  drivers: BAPDriver[];
  additional_interests: BAPAdditionalInsured[];
  premium: BAPPremiumSummary;

  /** Extraction metadata */
  extraction_source?: 'manual' | 'ai_extracted' | 'azure_di_claude';
  extraction_confidence?: number;
  extracted_at?: string;
  evidence_catalog_id?: string;
}

// =============================================================================
// TAB CONFIGURATION
// =============================================================================

export type BAPPolicyTab = 'overview' | 'coverage' | 'vehicles' | 'drivers' | 'interests' | 'premium';

export const BAP_POLICY_TABS: { value: BAPPolicyTab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'coverage', label: 'Coverage' },
  { value: 'vehicles', label: 'Vehicles' },
  { value: 'drivers', label: 'Drivers' },
  { value: 'interests', label: 'Interests' },
  { value: 'premium', label: 'Premium' },
];

// =============================================================================
// COMMON VEHICLE BODY TYPES
// =============================================================================

export const COMMON_BODY_TYPES = [
  'Sedan',
  'SUV',
  'Pickup',
  'Van',
  'Cargo Van',
  'Box Truck',
  'Flatbed',
  'Dump Truck',
  'Tractor',
  'Trailer',
  'Bus',
  'Utility',
  'Service',
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function isCommercialAutoPolicy(lineOfBusiness: string | null | undefined): boolean {
  if (!lineOfBusiness) return false;
  const lob = lineOfBusiness.toLowerCase();
  return (
    lob.includes('commercial auto') ||
    lob.includes('business auto') ||
    lob === 'bap' ||
    lob === 'ca' ||
    lob.includes('auto liability') ||
    (lob.includes('auto') && (lob.includes('commercial') || lob.includes('business')))
  );
}

export function formatVehicleDescription(vehicle: BAPVehicle): string {
  return `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
}

export function formatCoverageSymbols(symbols: CoverageSymbol[]): string {
  return symbols.map(s => `${s} (${COVERAGE_SYMBOL_LABELS[s]})`).join(', ');
}

export function getVehicleByVIN(vehicles: BAPVehicle[], vin: string): BAPVehicle | undefined {
  return vehicles.find(v => v.vin === vin);
}

export function getVehicleByUnit(vehicles: BAPVehicle[], unitNumber: string): BAPVehicle | undefined {
  return vehicles.find(v => v.unit_number === unitNumber);
}
