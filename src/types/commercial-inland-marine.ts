/**
 * Commercial Inland Marine Policy Types
 *
 * Covers moveable property and specialized equipment:
 * - Contractor's Equipment
 * - Installation Floater
 * - Motor Truck Cargo
 * - Electronic Data Processing (EDP)
 * - Valuable Papers
 * - Signs
 * - Accounts Receivable
 * - Fine Arts
 * - Musical Instruments
 */

import { Address } from './address';
import { EvidenceReference, ExtractionStatus, FieldConfidence } from './extraction-common';

// =============================================================================
// INLAND MARINE SUBTYPES
// =============================================================================

export type InlandMarineSubtype =
  | 'contractors_equipment'
  | 'installation_floater'
  | 'motor_truck_cargo'
  | 'electronic_data_processing'
  | 'valuable_papers'
  | 'signs'
  | 'accounts_receivable'
  | 'fine_arts'
  | 'musical_instruments'
  | 'camera_equipment'
  | 'medical_equipment'
  | 'scientific_equipment'
  | 'patterns_dies_molds'
  | 'exhibition_floater'
  | 'miscellaneous';

export const INLAND_MARINE_SUBTYPE_LABELS: Record<InlandMarineSubtype, string> = {
  contractors_equipment: "Contractor's Equipment",
  installation_floater: 'Installation Floater',
  motor_truck_cargo: 'Motor Truck Cargo',
  electronic_data_processing: 'Electronic Data Processing (EDP)',
  valuable_papers: 'Valuable Papers & Records',
  signs: 'Signs',
  accounts_receivable: 'Accounts Receivable',
  fine_arts: 'Fine Arts',
  musical_instruments: 'Musical Instruments',
  camera_equipment: 'Camera & Photography Equipment',
  medical_equipment: 'Medical Equipment',
  scientific_equipment: 'Scientific Equipment',
  patterns_dies_molds: 'Patterns, Dies & Molds',
  exhibition_floater: 'Exhibition Floater',
  miscellaneous: 'Miscellaneous Equipment',
};

// =============================================================================
// VALUATION & BASIS
// =============================================================================

export type ValuationBasis =
  | 'replacement_cost'
  | 'actual_cash_value'
  | 'agreed_value'
  | 'functional_replacement'
  | 'market_value'
  | 'stated_amount';

export const VALUATION_BASIS_LABELS: Record<ValuationBasis, string> = {
  replacement_cost: 'Replacement Cost',
  actual_cash_value: 'Actual Cash Value (ACV)',
  agreed_value: 'Agreed Value',
  functional_replacement: 'Functional Replacement Cost',
  market_value: 'Market Value',
  stated_amount: 'Stated Amount',
};

export type CoverageTerritory =
  | 'continental_us'
  | 'us_and_canada'
  | 'worldwide'
  | 'specified_locations'
  | 'specified_radius';

// =============================================================================
// SCHEDULED ITEMS
// =============================================================================

export interface ScheduledItem {
  item_id: string;
  description: string;
  manufacturer?: string;
  model?: string;
  serial_number?: string;
  vin?: string;
  year?: number;

  // Valuation
  scheduled_value: number;
  valuation_basis: ValuationBasis;

  // Deductible (may differ per item)
  deductible?: number;

  // Location/Assignment
  primary_location?: string;
  assigned_jobsite?: string;

  // Loss Payee/Lienholder specific to this item
  loss_payee?: {
    name: string;
    address?: Address;
    loan_number?: string;
    lease_number?: string;
  };

  // For leased equipment
  leased?: boolean;
  lessor_name?: string;

  // Coverage specifics
  theft_coverage_included?: boolean;
  mysterious_disappearance_included?: boolean;

  // Condition
  condition?: 'new' | 'used' | 'refurbished';
  acquisition_date?: string;
}

// =============================================================================
// BLANKET COVERAGE
// =============================================================================

export interface BlanketCoverage {
  category: string; // e.g., "All Owned Equipment", "Rented Equipment", "Small Tools"
  blanket_limit: number;
  per_item_limit?: number;
  valuation_basis: ValuationBasis;
  deductible: number;
  description?: string;

  // Sublimits within blanket
  sublimits?: {
    category: string;
    limit: number;
  }[];
}

// =============================================================================
// LOCATIONS & JOBSITES
// =============================================================================

export interface CoveredLocation {
  location_id: string;
  location_number?: number;
  name: string;
  address: Address;
  location_type: 'permanent' | 'jobsite' | 'storage' | 'warehouse' | 'in_transit';

  // Coverage at this location
  location_limit?: number;
  deductible?: number;

  // Security features
  security_features?: {
    alarm_system?: boolean;
    camera_surveillance?: boolean;
    fenced_compound?: boolean;
    guard_service?: boolean;
    gps_tracking?: boolean;
  };

  // For jobsites
  project_name?: string;
  project_start_date?: string;
  project_end_date?: string;
  general_contractor?: string;
}

// =============================================================================
// COVERAGE EXTENSIONS
// =============================================================================

export interface InlandMarineCoverageExtensions {
  // Newly acquired equipment
  newly_acquired?: {
    included: boolean;
    limit?: number;
    reporting_period_days?: number;
  };

  // Rental reimbursement
  rental_reimbursement?: {
    included: boolean;
    daily_limit?: number;
    maximum_days?: number;
    waiting_period_days?: number;
  };

  // Extra expense
  extra_expense?: {
    included: boolean;
    limit?: number;
  };

  // Expediting expense
  expediting_expense?: {
    included: boolean;
    limit?: number;
  };

  // Debris removal
  debris_removal?: {
    included: boolean;
    limit?: number;
    limit_type?: 'per_occurrence' | 'percentage_of_loss';
  };

  // Pollutant cleanup
  pollutant_cleanup?: {
    included: boolean;
    limit?: number;
  };

  // Transit coverage
  transit?: {
    included: boolean;
    limit?: number;
    territory?: CoverageTerritory;
    ocean_marine_included?: boolean;
  };

  // Temporary storage
  temporary_storage?: {
    included: boolean;
    limit?: number;
    maximum_days?: number;
  };

  // Leased/Rented equipment
  leased_rented_equipment?: {
    included: boolean;
    limit?: number;
    liability_for_leased_included?: boolean;
  };

  // Employee tools
  employee_tools?: {
    included: boolean;
    per_employee_limit?: number;
    aggregate_limit?: number;
  };
}

// =============================================================================
// SUBTYPE-SPECIFIC COVERAGES
// =============================================================================

// Contractor's Equipment specific
export interface ContractorsEquipmentCoverage {
  subtype: 'contractors_equipment';
  equipment_categories?: string[]; // Heavy equipment, hand tools, scaffolding, etc.

  // Rigging coverage
  rigging_coverage?: {
    included: boolean;
    limit?: number;
  };

  // Off-premises coverage
  off_premises?: {
    included: boolean;
    limit?: number;
    territory?: CoverageTerritory;
  };

  // Breakdown coverage
  mechanical_breakdown?: {
    included: boolean;
    limit?: number;
  };
}

// Installation Floater specific
export interface InstallationFloaterCoverage {
  subtype: 'installation_floater';
  project_name: string;
  project_location?: Address;
  contract_value: number;

  // Coverage phases
  transit_to_site?: boolean;
  during_installation?: boolean;
  testing_period_days?: number;

  // Materials coverage
  materials_in_storage?: {
    included: boolean;
    limit?: number;
  };
}

// Motor Truck Cargo specific
export interface MotorTruckCargoCoverage {
  subtype: 'motor_truck_cargo';

  // Cargo types
  commodity_types?: string[];
  excluded_commodities?: string[];

  // Limits
  per_vehicle_limit?: number;
  per_occurrence_limit?: number;

  // Territory
  territory?: CoverageTerritory;

  // Refrigeration breakdown
  refrigeration_breakdown?: {
    included: boolean;
    limit?: number;
  };

  // Trailer interchange
  trailer_interchange?: {
    included: boolean;
    limit?: number;
  };
}

// EDP specific
export interface EDPCoverage {
  subtype: 'electronic_data_processing';

  // Hardware
  hardware_limit?: number;

  // Media & data
  media_limit?: number;
  data_restoration_limit?: number;

  // Extra expense
  edp_extra_expense?: {
    included: boolean;
    limit?: number;
    waiting_period_hours?: number;
  };

  // Business interruption
  edp_business_interruption?: {
    included: boolean;
    limit?: number;
    waiting_period_hours?: number;
  };

  // Virus/malware (may be excluded - noted here for gap analysis)
  virus_malware_covered?: boolean;
}

// Valuable Papers specific
export interface ValuablePapersCoverage {
  subtype: 'valuable_papers';

  // Types of documents
  document_types?: string[]; // Blueprints, manuscripts, legal documents, etc.

  // Limits
  per_item_limit?: number;
  aggregate_limit?: number;

  // Research expense
  research_expense?: {
    included: boolean;
    limit?: number;
  };
}

export type SubtypeSpecificCoverage =
  | ContractorsEquipmentCoverage
  | InstallationFloaterCoverage
  | MotorTruckCargoCoverage
  | EDPCoverage
  | ValuablePapersCoverage;

// =============================================================================
// HIGH-IMPACT ENDORSEMENTS & EXCLUSIONS
// =============================================================================

export interface InlandMarineEndorsement {
  endorsement_number: string;
  endorsement_name: string;
  form_number?: string;
  edition_date?: string;

  // Classification
  endorsement_type: 'coverage_extension' | 'coverage_restriction' | 'exclusion' | 'condition' | 'sublimit' | 'deductible_modification';

  // Impact
  high_impact: boolean;
  impact_description?: string;

  // For exclusions
  excluded_perils?: string[];
  excluded_property?: string[];
  excluded_locations?: string[];

  // For modifications
  affects_coverage?: string;
  new_limit?: number;
  new_deductible?: number;
}

export const HIGH_IMPACT_IM_EXCLUSIONS = [
  'mysterious_disappearance',
  'theft_from_unattended_vehicle',
  'earth_movement',
  'flood',
  'named_storm',
  'mechanical_breakdown',
  'wear_and_tear',
  'rust_corrosion',
  'employee_dishonesty',
  'government_seizure',
  'nuclear_hazard',
  'war',
] as const;

export type HighImpactIMExclusion = typeof HIGH_IMPACT_IM_EXCLUSIONS[number];

// =============================================================================
// LOSS PAYEES & ADDITIONAL INSUREDS
// =============================================================================

export interface IMAdditionalInterest {
  interest_id: string;
  name: string;
  address?: Address;

  interest_type: 'loss_payee' | 'additional_insured' | 'lienholder' | 'lessor' | 'mortgagee';

  // Associated items/equipment
  applies_to?: 'all' | 'scheduled_items';
  scheduled_item_ids?: string[];

  // Loan/Lease info
  loan_number?: string;
  lease_number?: string;
}

// =============================================================================
// DEDUCTIBLES
// =============================================================================

export interface InlandMarineDeductibles {
  // Standard deductible
  standard_deductible: number;

  // Per-item may differ
  per_item_minimum?: number;
  per_item_maximum?: number;

  // Peril-specific
  theft_deductible?: number;
  catastrophe_deductible?: number;
  earthquake_deductible?: number;
  flood_deductible?: number;
  named_storm_deductible?: number;

  // Percentage-based
  percentage_deductibles?: {
    peril: string;
    percentage: number;
    minimum?: number;
    maximum?: number;
    applies_to?: 'total_values' | 'per_item' | 'per_location';
  }[];

  // Waiting periods (for time-element coverages)
  rental_reimbursement_waiting_days?: number;
  extra_expense_waiting_hours?: number;
}

// =============================================================================
// PREMIUM BREAKDOWN
// =============================================================================

export interface InlandMarinePremium {
  total_annual_premium: number;

  // By coverage type
  scheduled_equipment_premium?: number;
  blanket_coverage_premium?: number;
  extensions_premium?: number;

  // By subtype if multiple
  subtype_premiums?: {
    subtype: InlandMarineSubtype;
    premium: number;
  }[];

  // Adjustments
  credits?: {
    description: string;
    amount: number;
    percentage?: number;
  }[];

  surcharges?: {
    description: string;
    amount: number;
    percentage?: number;
  }[];

  // Payment
  minimum_earned_premium?: number;
  deposit_premium?: number;
  installment_schedule?: {
    due_date: string;
    amount: number;
  }[];
}

// =============================================================================
// MAIN EXTRACTED DATA STRUCTURE
// =============================================================================

export interface InlandMarineExtractedData {
  // Policy identification
  policy_number: string;
  policy_period: {
    effective_date: string;
    expiration_date: string;
  };

  // Named insured
  named_insured: {
    name: string;
    address?: Address;
    business_type?: string;
  };

  // Coverage type(s)
  subtypes: InlandMarineSubtype[];
  primary_subtype: InlandMarineSubtype;

  // Valuation & Territory
  valuation_basis: ValuationBasis;
  coverage_territory: CoverageTerritory;
  radius_miles?: number; // If territory is specified_radius

  // Total insured values
  total_scheduled_value?: number;
  total_blanket_limit?: number;
  aggregate_limit?: number;

  // Scheduled items
  scheduled_items: ScheduledItem[];

  // Blanket coverages
  blanket_coverages: BlanketCoverage[];

  // Locations
  covered_locations: CoveredLocation[];

  // Coverage extensions
  extensions: InlandMarineCoverageExtensions;

  // Subtype-specific coverage details
  subtype_specific?: SubtypeSpecificCoverage;

  // Additional interests
  additional_interests: IMAdditionalInterest[];

  // Deductibles
  deductibles: InlandMarineDeductibles;

  // Endorsements
  endorsements: InlandMarineEndorsement[];

  // Conditions
  special_conditions?: string[];

  // Premium
  premium: InlandMarinePremium;

  // Extraction metadata
  extraction_metadata: {
    document_source: string;
    extraction_date: string;
    extraction_version: string;
    confidence_score?: number;
  };
}

// =============================================================================
// DATABASE ENTITY (with evidence references)
// =============================================================================

export interface InlandMarineDetails {
  id: string;
  policy_id: string;
  extracted_data: InlandMarineExtractedData;

  // Field-level extraction status
  field_status: Record<string, ExtractionStatus>;
  field_confidence: Record<string, FieldConfidence>;

  // Evidence references for each field
  evidence_references: Record<string, EvidenceReference[]>;

  // Verification
  verified_by?: string;
  verified_at?: string;
  verification_notes?: string;

  // Timestamps
  created_at: string;
  updated_at: string;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function hasInlandMarine(data: InlandMarineExtractedData | null | undefined): boolean {
  return Boolean(data && data.subtypes && data.subtypes.length > 0);
}

export function hasScheduledItems(data: InlandMarineExtractedData | null | undefined): boolean {
  return Boolean(data?.scheduled_items && data.scheduled_items.length > 0);
}

export function hasBlanketCoverage(data: InlandMarineExtractedData | null | undefined): boolean {
  return Boolean(data?.blanket_coverages && data.blanket_coverages.length > 0);
}

export function calculateTotalScheduledValue(items: ScheduledItem[]): number {
  return items.reduce((sum, item) => sum + (item.scheduled_value || 0), 0);
}

export function getHighImpactEndorsements(endorsements: InlandMarineEndorsement[]): InlandMarineEndorsement[] {
  return endorsements.filter(e => e.high_impact);
}

export function getExclusionEndorsements(endorsements: InlandMarineEndorsement[]): InlandMarineEndorsement[] {
  return endorsements.filter(e => e.endorsement_type === 'exclusion');
}

export function isTheftCovered(data: InlandMarineExtractedData): boolean {
  // Check if theft is excluded via endorsements
  const theftExclusion = data.endorsements.find(
    e => e.excluded_perils?.includes('theft') ||
         e.endorsement_name.toLowerCase().includes('theft exclusion')
  );
  return !theftExclusion;
}

export function isMysteriousDisappearanceCovered(data: InlandMarineExtractedData): boolean {
  // Often excluded - check endorsements
  const mdExclusion = data.endorsements.find(
    e => e.excluded_perils?.includes('mysterious_disappearance') ||
         e.endorsement_name.toLowerCase().includes('mysterious disappearance')
  );
  return !mdExclusion;
}
