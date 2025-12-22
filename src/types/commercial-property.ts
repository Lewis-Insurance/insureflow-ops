/**
 * Commercial Property Policy Types
 *
 * Comprehensive type definitions for Commercial Property policy data including:
 * - Policy identity and dates
 * - Policy form/program type (Special/Broad/Basic)
 * - Valuation basis (RCV/ACV/FRV/Stated)
 * - Locations & buildings schedule with construction details
 * - Coverage limits per building (Building/BPP/TIB/Stock)
 * - Business Income & Extra Expense
 * - Ordinance or Law coverage
 * - Deductibles (AOP, Wind/Hail, Named Storm, Flood, Quake)
 * - Additional coverages (Equipment Breakdown, Flood, Earthquake, Spoilage)
 * - Mortgagees/Loss Payees schedule
 * - Endorsements with high-impact flags
 */

// =============================================================================
// POLICY IDENTITY
// =============================================================================

export interface PropertyPolicyIdentity {
  carrier_name: string;
  carrier_naic?: string;
  policy_number: string;
  transaction_type: 'quote' | 'bound' | 'issued' | 'renewal' | 'endorsement' | 'cancel';
  named_insured: string;
  dba?: string;
  mailing_address: Address;
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

export interface PropertyPolicyDates {
  effective_date: string; // YYYY-MM-DD
  expiration_date: string;
  issue_date?: string;
  policy_term?: string;
}

// =============================================================================
// POLICY FORM & VALUATION
// =============================================================================

export type PropertyFormType = 'special' | 'broad' | 'basic' | 'causes_of_loss';
export type ValuationBasis = 'replacement_cost' | 'actual_cash_value' | 'functional_replacement' | 'stated_amount' | 'agreed_value';
export type ConstructionClass = 'frame' | 'joisted_masonry' | 'noncombustible' | 'masonry_noncombustible' | 'modified_fire_resistive' | 'fire_resistive';

export interface PolicyFormDetails {
  /** Special / Broad / Basic / Causes of Loss */
  form_type: PropertyFormType;

  /** ISO vs Carrier Proprietary */
  is_iso_form: boolean;

  /** Form number if known */
  form_number?: string;

  /** Is this part of a package (BOP)? */
  is_package_policy?: boolean;
}

// =============================================================================
// LOCATION
// =============================================================================

export interface PropertyLocation {
  /** Location number */
  location_number: number;

  /** Address */
  address: Address;

  /** Territory / rating territory */
  territory?: string;

  /** County (important for wind/hail) */
  county?: string;

  /** Protection class (ISO PPC) */
  protection_class?: string;

  /** Fire district */
  fire_district?: string;

  /** Responding fire department */
  fire_department?: string;

  /** Distance to hydrant (feet) */
  hydrant_distance_feet?: number;

  /** Occupancy / operations description */
  occupancy?: string;

  /** Evidence tracking */
  evidence_ids?: string[];
  extraction_confidence?: number;
  extraction_status?: 'AUTO_APPLIED' | 'NEEDS_REVIEW' | 'LOW_CONFIDENCE' | 'NOT_FOUND' | 'MANUAL';
}

// =============================================================================
// BUILDING
// =============================================================================

export interface PropertyBuilding {
  /** Building number */
  building_number: number;

  /** Location number this building belongs to */
  location_number: number;

  /** Building description */
  description: string;

  /** Construction type */
  construction_type: ConstructionClass;

  /** ISO construction class (1-6) if shown */
  iso_construction_class?: number;

  /** Occupancy type */
  occupancy?: string;

  /** Year built */
  year_built?: number;

  /** Total square footage */
  square_footage?: number;

  /** Number of stories */
  stories?: number;

  /** Roof type */
  roof_type?: string;

  /** Roof age (years) */
  roof_age?: number;

  /** Roof last updated */
  roof_updated_year?: number;

  /** Renovations */
  electrical_update_year?: number;
  plumbing_update_year?: number;
  hvac_update_year?: number;

  /** Sprinkler system */
  has_sprinklers?: boolean;
  sprinkler_type?: 'wet' | 'dry' | 'deluge' | 'preaction' | 'partial';

  /** Alarm system */
  has_burglar_alarm?: boolean;
  has_fire_alarm?: boolean;
  alarm_type?: 'local' | 'central_station' | 'proprietary';

  /** Valuation basis for this building */
  valuation_basis: ValuationBasis;

  /** Coinsurance percentage (80/90/100) */
  coinsurance_percent?: number;

  /** Agreed value indicator */
  is_agreed_value?: boolean;
  agreed_value_expiration?: string;

  /** Evidence tracking */
  evidence_ids?: string[];
  extraction_confidence?: number;
  extraction_status?: 'AUTO_APPLIED' | 'NEEDS_REVIEW' | 'LOW_CONFIDENCE' | 'NOT_FOUND' | 'MANUAL';
}

// =============================================================================
// BUILDING COVERAGE LIMITS
// =============================================================================

export interface BuildingCoverageLimits {
  /** Building number */
  building_number: number;

  /** Location number */
  location_number: number;

  /** Building limit */
  building_limit: number;

  /** Business Personal Property (BPP/Contents) */
  bpp_limit?: number;

  /** Tenant Improvements & Betterments */
  tenant_improvements_limit?: number;

  /** Stock limit (separate from BPP) */
  stock_limit?: number;

  /** Property of Others */
  property_of_others_limit?: number;

  /** Outdoor property / signs / fences */
  outdoor_property_limit?: number;
  signs_limit?: number;

  /** Valuable papers and records */
  valuable_papers_limit?: number;

  /** Accounts receivable */
  accounts_receivable_limit?: number;

  /** Electronic data processing */
  edp_equipment_limit?: number;
  edp_media_limit?: number;

  /** Scheduled/special equipment */
  special_equipment_limit?: number;
  special_equipment_description?: string;

  /** Evidence tracking */
  evidence_ids?: string[];
  extraction_confidence?: number;
  extraction_status?: 'AUTO_APPLIED' | 'NEEDS_REVIEW' | 'LOW_CONFIDENCE' | 'NOT_FOUND' | 'MANUAL';
}

// =============================================================================
// BLANKET COVERAGE
// =============================================================================

export interface BlanketCoverage {
  /** Blanket number */
  blanket_number: number;

  /** Blanket limit */
  blanket_limit: number;

  /** What does blanket apply to */
  applies_to: 'building' | 'bpp' | 'building_and_bpp' | 'all_locations';

  /** Locations/buildings included */
  included_locations?: number[];
  included_buildings?: { location: number; building: number }[];

  /** Margin clause percentage */
  margin_clause_percent?: number;

  /** Coinsurance */
  coinsurance_percent?: number;

  /** Evidence tracking */
  evidence_ids?: string[];
}

// =============================================================================
// BUSINESS INCOME & EXTRA EXPENSE
// =============================================================================

export interface BusinessIncomeCoverage {
  /** BI coverage included */
  is_included: boolean;

  /** Limit or ALS */
  limit_type: 'specific_limit' | 'actual_loss_sustained';

  /** Specific limit if not ALS */
  limit?: number;

  /** Period of restoration (months) */
  period_of_restoration_months?: number;

  /** Monthly limitation (if percentage) */
  monthly_limit_percent?: number;

  /** Waiting period (hours) */
  waiting_period_hours?: number;

  /** Coinsurance for BI */
  coinsurance_percent?: number;

  /** Extended Period of Indemnity (days) */
  extended_period_days?: number;

  /** Extra Expense included */
  extra_expense_included?: boolean;
  extra_expense_limit?: number;

  /** Dependent properties */
  dependent_properties_included?: boolean;
  dependent_properties_limit?: number;

  /** Evidence tracking */
  evidence_ids?: string[];
}

// =============================================================================
// ORDINANCE OR LAW
// =============================================================================

export interface OrdinanceOrLawCoverage {
  /** Coverage included */
  is_included: boolean;

  /** Coverage A: Loss to undamaged portion */
  coverage_a_limit?: number;

  /** Coverage B: Demolition cost */
  coverage_b_limit?: number;

  /** Coverage C: Increased cost of construction */
  coverage_c_limit?: number;

  /** Combined limit (if not split) */
  combined_limit?: number;

  /** Evidence tracking */
  evidence_ids?: string[];
}

// =============================================================================
// DEDUCTIBLES
// =============================================================================

export type DeductibleType = 'flat' | 'percentage_tiv' | 'percentage_building' | 'percentage_claim';

export interface PropertyDeductible {
  /** Deductible name */
  name: string;

  /** Peril this applies to */
  peril: 'aop' | 'wind_hail' | 'named_storm' | 'hurricane' | 'flood' | 'earthquake' | 'water_damage' | 'theft' | 'vandalism' | 'freeze';

  /** Amount */
  amount: number;

  /** Type */
  type: DeductibleType;

  /** Percentage basis if percentage type */
  percentage?: number;

  /** Applies to */
  applies_to: 'per_occurrence' | 'per_building' | 'per_location' | 'policy' | 'tiv';

  /** State/territory conditions */
  state_conditions?: string[];

  /** Evidence tracking */
  evidence_ids?: string[];
}

// =============================================================================
// BUILDERS RISK COVERAGE
// =============================================================================

/**
 * Builders Risk project type
 */
export type BuildersRiskProjectType =
  | 'new_construction'
  | 'renovation'
  | 'addition'
  | 'tenant_improvement'
  | 'interior_remodel'
  | 'conversion'
  | 'restoration'
  | 'other';

export const BUILDERS_RISK_PROJECT_TYPE_LABELS: Record<BuildersRiskProjectType, string> = {
  new_construction: 'New Construction',
  renovation: 'Renovation',
  addition: 'Addition',
  tenant_improvement: 'Tenant Improvement',
  interior_remodel: 'Interior Remodel',
  conversion: 'Conversion',
  restoration: 'Restoration',
  other: 'Other',
};

/**
 * Insurable interest for Builders Risk
 */
export type BuildersRiskInsuredInterest = 'owner' | 'contractor' | 'lender' | 'developer' | 'joint_venture';

/**
 * Builders Risk coverage form
 */
export type BuildersRiskFormType = 'completed_value' | 'reporting_form' | 'automatic_increase';

/**
 * Comprehensive Builders Risk Coverage
 * Packaged with Commercial Property or as standalone
 */
export interface BuildersRiskCoverage {
  /** Is Builders Risk coverage included? */
  included: boolean;

  /** Is this a separate standalone policy? */
  separate_policy?: boolean;

  // === PROJECT INFORMATION ===
  /** Project name */
  project_name: string;

  /** Project address (may differ from policy address) */
  project_address?: Address;

  /** Project type */
  project_type: BuildersRiskProjectType;

  /** Project description */
  project_description?: string;

  /** Insured's interest */
  insured_interest: BuildersRiskInsuredInterest;

  // === PROJECT TIMELINE ===
  /** Project start date */
  project_start_date?: string;

  /** Estimated completion date */
  estimated_completion_date: string;

  /** Policy expiration or project completion, whichever is first */
  policy_end_trigger: 'policy_expiration' | 'completion' | 'occupancy' | 'earliest';

  /** Maximum construction period (months) */
  max_construction_period_months?: number;

  /** Extension of completion (if purchased) */
  extension_months_purchased?: number;

  // === COVERAGE VALUES ===
  /** Completed value (total project cost at completion) */
  completed_value: number;

  /** Hard costs (materials, labor) */
  hard_costs_limit?: number;

  /** Soft costs (permits, fees, professional fees) */
  soft_costs_limit?: number;

  /** Form type */
  form_type: BuildersRiskFormType;

  /** Materials stored off-site */
  materials_off_site_limit?: number;
  materials_off_site_locations?: string[];

  /** Materials in transit */
  materials_in_transit_limit?: number;

  /** Temporary structures */
  temporary_structures_limit?: number;

  /** Trees, shrubs, landscaping */
  landscaping_limit?: number;

  // === COVERAGE PHASES ===
  /** Testing period covered */
  testing_coverage?: {
    included: boolean;
    hot_testing_included?: boolean;
    testing_period_days?: number;
    testing_sublimit?: number;
  };

  /** Occupancy / Beneficial Occupancy */
  occupancy_coverage?: {
    partial_occupancy_allowed: boolean;
    max_occupancy_percent?: number;
    approval_required?: boolean;
  };

  // === DELAY IN OPENING / SOFT COSTS ===
  /** Delay in Opening / Delay in Completion */
  delay_in_opening?: {
    included: boolean;
    limit?: number;
    waiting_period_days?: number;
    max_indemnity_period_days?: number;
    covered_expenses?: string[];
  };

  // === EXISTING STRUCTURES ===
  /** Existing structures (for renovation projects) */
  existing_structures?: {
    covered: boolean;
    limit?: number;
    demolition_included?: boolean;
    foundations_included?: boolean;
  };

  // === DEDUCTIBLE ===
  /** Builders Risk specific deductible */
  deductible?: number;
  deductible_type?: 'flat' | 'percentage';

  /** Wind/Hail deductible (often higher for construction) */
  wind_hail_deductible?: number;
  wind_hail_deductible_type?: 'flat' | 'percentage';

  /** Named Storm deductible */
  named_storm_deductible?: number;
  named_storm_deductible_type?: 'flat' | 'percentage';

  /** Flood deductible */
  flood_deductible?: number;

  /** Earthquake deductible */
  earthquake_deductible?: number;

  // === EXCLUSIONS & ENDORSEMENTS ===
  /** Key exclusions */
  key_exclusions?: string[];

  /** Endorsement forms */
  endorsement_forms?: string[];

  // === PARTIES ===
  /** Named insureds (often multiple parties) */
  named_insureds?: string[];

  /** General Contractor */
  general_contractor?: {
    name: string;
    address?: Address;
  };

  /** Owner/Developer */
  owner_developer?: {
    name: string;
    address?: Address;
  };

  /** Lender */
  lender?: {
    name: string;
    address?: Address;
    loan_number?: string;
  };

  // === PREMIUM ===
  /** Premium */
  premium?: number;

  /** Rating basis */
  rating_basis?: 'completed_value' | 'monthly_reporting' | 'flat';

  // === EVIDENCE TRACKING ===
  evidence_ids?: string[];
  extraction_confidence?: number;
  extraction_status?: 'AUTO_APPLIED' | 'NEEDS_REVIEW' | 'LOW_CONFIDENCE' | 'NOT_FOUND' | 'CONFLICT' | 'MANUAL';
}

/**
 * Helper to check if policy has Builders Risk coverage
 */
export function hasBuildersRisk(additionalCoverages: AdditionalPropertyCoverages | undefined): boolean {
  return additionalCoverages?.builders_risk?.included === true;
}

/**
 * Common Builders Risk forms
 */
export const COMMON_BUILDERS_RISK_FORMS = [
  { form: 'CP 00 20', description: 'Builders Risk Coverage Form' },
  { form: 'CP 00 21', description: 'Builders Risk Reporting Form' },
  { form: 'CP 14 10', description: 'Additional Covered Property' },
  { form: 'CP 14 30', description: 'Theft Exclusion' },
  { form: 'CP 14 60', description: 'Ordinance or Law Coverage' },
  { form: 'CP 15 09', description: 'Exclusion - Contractors Equipment' },
];

// =============================================================================
// ADDITIONAL COVERAGES
// =============================================================================

export interface AdditionalPropertyCoverages {
  /** Builders Risk (for construction projects) - See BuildersRiskCoverage for details */
  builders_risk?: BuildersRiskCoverage;

  /** Equipment Breakdown */
  equipment_breakdown?: {
    included: boolean;
    limit?: number;
    deductible?: number;
    separate_policy?: boolean;
  };

  /** Flood */
  flood?: {
    included: boolean;
    limit?: number;
    deductible?: number;
    deductible_type?: DeductibleType;
    waiting_period_days?: number;
    excess_over_nfip?: boolean;
  };

  /** Earthquake */
  earthquake?: {
    included: boolean;
    limit?: number;
    deductible?: number;
    deductible_type?: DeductibleType;
  };

  /** Spoilage */
  spoilage?: {
    included: boolean;
    limit?: number;
    deductible?: number;
    refrigeration_breakdown?: boolean;
    power_outage?: boolean;
  };

  /** Glass */
  glass?: {
    included: boolean;
    limit?: number;
  };

  /** Crime / Employee Dishonesty (if included in package) */
  crime?: {
    included: boolean;
    employee_dishonesty_limit?: number;
    money_securities_limit?: number;
    computer_fraud_limit?: number;
    separate_policy?: boolean;
  };

  /** Inland Marine (if included) */
  inland_marine?: {
    included: boolean;
    contractors_equipment_limit?: number;
    installation_floater_limit?: number;
    separate_policy?: boolean;
  };
}

// =============================================================================
// PROTECTIVE SAFEGUARDS & CONDITIONS
// =============================================================================

export interface ProtectiveSafeguards {
  /** Protective safeguards endorsement applies */
  endorsement_applies: boolean;

  /** Required safeguards */
  sprinkler_required?: boolean;
  sprinkler_description?: string;

  fire_alarm_required?: boolean;
  fire_alarm_type?: 'local' | 'central_station';

  burglar_alarm_required?: boolean;
  burglar_alarm_type?: 'local' | 'central_station';

  security_service_required?: boolean;

  watchman_required?: boolean;
  watchman_schedule?: string;

  /** Heat maintenance warranty */
  heat_maintenance_required?: boolean;
  minimum_temperature?: number;

  /** Other conditions */
  other_requirements?: string[];
}

export interface VacancyClause {
  /** Vacancy clause applies */
  applies: boolean;

  /** Days until vacancy penalty applies */
  vacancy_period_days?: number;

  /** Reduction percentage when vacant */
  reduction_percent?: number;

  /** Perils excluded when vacant */
  excluded_perils?: string[];

  /** Vacancy permit purchased */
  vacancy_permit_purchased?: boolean;
  vacancy_permit_duration_days?: number;
}

// =============================================================================
// MORTGAGEES / LOSS PAYEES
// =============================================================================

export type InterestType = 'mortgagee' | 'loss_payee' | 'lenders_loss_payable' | 'additional_insured' | 'additional_interest';

export interface PropertyInterest {
  /** Interest type */
  interest_type: InterestType;

  /** Name */
  name: string;

  /** Address */
  address?: Address;

  /** Loan number / reference */
  loan_number?: string;

  /** Applies to location/building */
  location_number?: number;
  building_number?: number;

  /** Evidence tracking */
  evidence_ids?: string[];
}

// =============================================================================
// ENDORSEMENTS
// =============================================================================

export type EndorsementCategory =
  | 'wind_hail'
  | 'water_damage'
  | 'ordinance_or_law'
  | 'protective_safeguards'
  | 'vacancy'
  | 'margin_clause'
  | 'coinsurance'
  | 'acv'
  | 'roof'
  | 'flood_quake'
  | 'named_storm'
  | 'other';

export interface PropertyEndorsement {
  /** Form number */
  form_number: string;

  /** Title */
  title: string;

  /** Edition date */
  edition_date?: string;

  /** Effective date */
  effective_date?: string;

  /** Category for flagging high-impact */
  category?: EndorsementCategory;

  /** Is this a limitation/restriction? */
  is_limitation?: boolean;

  /** Premium impact */
  premium_impact?: number;

  /** Related location/building */
  location_number?: number;
  building_number?: number;

  /** Evidence tracking */
  evidence_ids?: string[];
}

// =============================================================================
// PREMIUM SUMMARY
// =============================================================================

export interface PropertyPremiumSummary {
  /** Total premium */
  total_premium: number;

  /** Premium by coverage */
  building_premium?: number;
  bpp_premium?: number;
  business_income_premium?: number;
  extra_expense_premium?: number;
  ordinance_or_law_premium?: number;
  equipment_breakdown_premium?: number;
  flood_premium?: number;
  earthquake_premium?: number;

  /** Fees and taxes */
  policy_fee?: number;
  inspection_fee?: number;
  state_taxes?: number;
  stamping_fee?: number;

  /** TRIA */
  terrorism_premium?: number;
  terrorism_rejected?: boolean;

  /** Deposit premium */
  deposit_premium?: number;

  /** Premium by location */
  premium_by_location?: {
    location_number: number;
    premium: number;
  }[];
}

// =============================================================================
// VALUATION SUMMARY
// =============================================================================

export interface ValuationSummary {
  /** Total Insured Value */
  total_insured_value?: number;

  /** Total building value */
  total_building_value: number;

  /** Total BPP value */
  total_bpp_value?: number;

  /** Total BI value */
  total_bi_value?: number;

  /** Is blanket coverage? */
  is_blanket: boolean;

  /** Blanket limit if applicable */
  blanket_limit?: number;

  /** Overall coinsurance */
  coinsurance_percent?: number;

  /** Agreed value */
  is_agreed_value?: boolean;
  agreed_value_expiration?: string;

  /** Margin clause */
  margin_clause_percent?: number;
}

// =============================================================================
// FULL POLICY DETAILS
// =============================================================================

export interface PropertyPolicyDetails {
  identity: PropertyPolicyIdentity;
  dates: PropertyPolicyDates;
  form_details: PolicyFormDetails;
  valuation_summary: ValuationSummary;
  locations: PropertyLocation[];
  buildings: PropertyBuilding[];
  building_coverages: BuildingCoverageLimits[];
  blanket_coverages?: BlanketCoverage[];
  business_income?: BusinessIncomeCoverage;
  ordinance_or_law?: OrdinanceOrLawCoverage;
  deductibles: PropertyDeductible[];
  additional_coverages?: AdditionalPropertyCoverages;
  protective_safeguards?: ProtectiveSafeguards;
  vacancy_clause?: VacancyClause;
  interests: PropertyInterest[];
  endorsements: PropertyEndorsement[];
  premium: PropertyPremiumSummary;

  /** Extraction metadata */
  extraction_source?: 'manual' | 'ai_extracted' | 'azure_di_claude';
  extraction_confidence?: number;
  extracted_at?: string;
  evidence_catalog_id?: string;
}

// =============================================================================
// TAB CONFIGURATION
// =============================================================================

export type PropertyPolicyTab =
  | 'overview'
  | 'buildings'
  | 'builders_risk'
  | 'coverages'
  | 'deductibles'
  | 'interests'
  | 'premium';

export const PROPERTY_POLICY_TABS: { value: PropertyPolicyTab; label: string; conditional?: boolean }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'buildings', label: 'Buildings' },
  { value: 'builders_risk', label: 'Builders Risk', conditional: true }, // Only show if BR is included
  { value: 'coverages', label: 'Coverages' },
  { value: 'deductibles', label: 'Deductibles' },
  { value: 'interests', label: 'Interests' },
  { value: 'premium', label: 'Premium' },
];

// =============================================================================
// CONSTRUCTION CLASS LABELS
// =============================================================================

export const CONSTRUCTION_CLASS_LABELS: Record<ConstructionClass, string> = {
  frame: 'Frame (Class 1)',
  joisted_masonry: 'Joisted Masonry (Class 2)',
  noncombustible: 'Non-Combustible (Class 3)',
  masonry_noncombustible: 'Masonry Non-Combustible (Class 4)',
  modified_fire_resistive: 'Modified Fire Resistive (Class 5)',
  fire_resistive: 'Fire Resistive (Class 6)',
};

// =============================================================================
// VALUATION LABELS
// =============================================================================

export const VALUATION_LABELS: Record<ValuationBasis, string> = {
  replacement_cost: 'Replacement Cost (RCV)',
  actual_cash_value: 'Actual Cash Value (ACV)',
  functional_replacement: 'Functional Replacement (FRV)',
  stated_amount: 'Stated Amount',
  agreed_value: 'Agreed Value',
};

// =============================================================================
// HIGH-IMPACT ENDORSEMENT CATEGORIES
// =============================================================================

export const HIGH_IMPACT_CATEGORIES: EndorsementCategory[] = [
  'wind_hail',
  'water_damage',
  'protective_safeguards',
  'vacancy',
  'acv',
  'roof',
  'named_storm',
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function isPropertyPolicy(lineOfBusiness: string | null | undefined): boolean {
  if (!lineOfBusiness) return false;
  const lob = lineOfBusiness.toLowerCase();
  return (
    lob.includes('property') ||
    lob.includes('building') ||
    lob === 'cp' ||
    lob === 'cpp' ||
    (lob.includes('commercial') && lob.includes('property'))
  );
}

export function getBuildingsForLocation(
  buildings: PropertyBuilding[],
  locationNumber: number
): PropertyBuilding[] {
  return buildings.filter((b) => b.location_number === locationNumber);
}

export function getCoveragesForBuilding(
  coverages: BuildingCoverageLimits[],
  locationNumber: number,
  buildingNumber: number
): BuildingCoverageLimits | undefined {
  return coverages.find(
    (c) => c.location_number === locationNumber && c.building_number === buildingNumber
  );
}

export function getDeductibleByPeril(
  deductibles: PropertyDeductible[],
  peril: PropertyDeductible['peril']
): PropertyDeductible | undefined {
  return deductibles.find((d) => d.peril === peril);
}

export function getHighImpactEndorsements(endorsements: PropertyEndorsement[]): PropertyEndorsement[] {
  return endorsements.filter(
    (e) => e.category && HIGH_IMPACT_CATEGORIES.includes(e.category)
  );
}

export function formatValuation(amount: number | undefined | null): string {
  if (amount == null) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDeductible(deductible: PropertyDeductible): string {
  if (deductible.type === 'flat') {
    return formatValuation(deductible.amount);
  }
  if (deductible.type === 'percentage_tiv' || deductible.type === 'percentage_building') {
    return `${deductible.percentage}% of ${deductible.type === 'percentage_tiv' ? 'TIV' : 'Building Value'}`;
  }
  return `${deductible.percentage}%`;
}

export function calculateTotalBuildingValue(coverages: BuildingCoverageLimits[]): number {
  return coverages.reduce((sum, c) => sum + (c.building_limit || 0), 0);
}

export function calculateTotalBPPValue(coverages: BuildingCoverageLimits[]): number {
  return coverages.reduce((sum, c) => sum + (c.bpp_limit || 0), 0);
}

export function calculateTIV(coverages: BuildingCoverageLimits[]): number {
  return coverages.reduce(
    (sum, c) =>
      sum +
      (c.building_limit || 0) +
      (c.bpp_limit || 0) +
      (c.tenant_improvements_limit || 0) +
      (c.stock_limit || 0),
    0
  );
}
