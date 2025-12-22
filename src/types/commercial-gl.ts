/**
 * Commercial General Liability (CGL) Policy Types
 *
 * Comprehensive type definitions for CGL policy data including:
 * - Policy identity and dates
 * - Claims-made specifics (retro date, ERP)
 * - Coverage structure (limits, deductibles, SIR)
 * - Premises/locations schedule
 * - Classifications/exposures/rating basis
 * - Additional insureds schedule
 * - Additional interests (mortgagees, loss payees)
 */

// =============================================================================
// POLICY IDENTITY
// =============================================================================

export interface CGLPolicyIdentity {
  carrier_name: string;
  carrier_naic?: string;
  policy_number: string;
  transaction_type: 'quote' | 'bound' | 'issued' | 'renewal' | 'endorsement' | 'cancel';
  named_insured: string;
  dba?: string;
  mailing_address: Address;
  primary_location_address?: Address;
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

export interface CGLPolicyDates {
  effective_date: string; // YYYY-MM-DD
  expiration_date: string;
  issue_date?: string;
  policy_term?: string;
}

// =============================================================================
// POLICY TYPE & CLAIMS-MADE SPECIFICS
// =============================================================================

export type CGLPolicyFormType = 'occurrence' | 'claims_made';

export interface ClaimsMadeDetails {
  /** Retroactive date - claims must arise from incidents after this date */
  retroactive_date?: string; // YYYY-MM-DD

  /** Extended Reporting Period options */
  erp_available?: boolean;
  erp_purchased?: boolean;
  erp_type?: 'basic' | 'supplemental' | 'both';
  erp_duration_months?: number;

  /** Claims-made endorsement forms */
  claims_made_endorsements?: string[];

  /** Prior acts coverage */
  prior_acts_date?: string;
}

// =============================================================================
// PROFESSIONAL LIABILITY / E&O COVERAGE (Packaged with CGL)
// =============================================================================

/**
 * Professional Liability type classification
 */
export type ProfessionalLiabilityType =
  | 'errors_omissions'
  | 'professional_services'
  | 'miscellaneous_professional'
  | 'technology_eo'
  | 'media_eo'
  | 'architects_engineers'
  | 'real_estate_eo'
  | 'insurance_agents_eo'
  | 'medical_professional'
  | 'legal_professional'
  | 'accounting_eo'
  | 'other';

export const PROFESSIONAL_LIABILITY_TYPE_LABELS: Record<ProfessionalLiabilityType, string> = {
  errors_omissions: 'Errors & Omissions',
  professional_services: 'Professional Services',
  miscellaneous_professional: 'Miscellaneous Professional',
  technology_eo: 'Technology E&O',
  media_eo: 'Media E&O',
  architects_engineers: 'Architects & Engineers',
  real_estate_eo: 'Real Estate E&O',
  insurance_agents_eo: 'Insurance Agents E&O',
  medical_professional: 'Medical Professional',
  legal_professional: 'Legal Professional',
  accounting_eo: 'Accounting E&O',
  other: 'Other Professional',
};

/**
 * Common Professional Liability / E&O forms
 */
export const COMMON_PROFESSIONAL_LIABILITY_FORMS = [
  { form: 'CG 22 79', description: 'Exclusion – Professional Services' },
  { form: 'CG 22 43', description: 'Professional Liability' },
  { form: 'GL 0001', description: 'Miscellaneous Professional Liability' },
  { form: 'GL 0002', description: 'Professional Services Extension' },
  { form: 'E&O 0001', description: 'Errors & Omissions Coverage' },
  { form: 'PL 0001', description: 'Professional Liability Coverage Form' },
];

/**
 * Comprehensive Professional Liability / E&O Coverage
 * Can be packaged with CGL or as separate coverage
 */
export interface ProfessionalLiabilityCoverage {
  /** Is E&O/Professional coverage included in this package? */
  included: boolean;

  /** Is this a separate standalone policy? */
  separate_policy?: boolean;

  /** Type of professional liability */
  professional_type?: ProfessionalLiabilityType;

  /** Description of covered professional services */
  covered_services?: string[];

  // === LIMITS ===
  /** Per claim / occurrence limit */
  per_claim_limit?: number;

  /** Aggregate limit */
  aggregate_limit?: number;

  /** Defense costs inside or outside limits */
  defense_costs?: 'inside_limits' | 'outside_limits';

  // === CLAIMS-MADE SPECIFICS ===
  /** Policy trigger - almost always claims-made for E&O */
  policy_form: 'claims_made' | 'occurrence';

  /** Retroactive date (critical for claims-made) */
  retroactive_date?: string;

  /** Is retroactive date "full prior acts" (unlimited)? */
  full_prior_acts?: boolean;

  /** Continuity date (for policy changes) */
  continuity_date?: string;

  /** Pending & Prior Date (P&P) */
  pending_prior_date?: string;

  // === EXTENDED REPORTING PERIOD (ERP / TAIL) ===
  /** Is ERP available? */
  erp_available?: boolean;

  /** Basic ERP (automatic) */
  basic_erp_days?: number;

  /** Supplemental/Optional ERP available? */
  supplemental_erp_available?: boolean;

  /** Supplemental ERP options */
  supplemental_erp_options?: {
    duration_months: number;
    premium_percent?: number; // Percent of annual premium
    deadline_days?: number; // Days after expiration to purchase
  }[];

  /** Was ERP purchased? */
  erp_purchased?: boolean;
  erp_purchased_duration_months?: number;
  erp_purchased_premium?: number;

  // === DEDUCTIBLE / RETENTION ===
  /** Deductible or SIR */
  deductible_type?: 'deductible' | 'sir' | 'none';

  /** Deductible per claim */
  deductible_per_claim?: number;

  /** Deductible aggregate */
  deductible_aggregate?: number;

  /** Does deductible apply to defense costs? */
  deductible_applies_to_defense?: boolean;

  // === EXCLUSIONS & ENDORSEMENTS ===
  /** List of specific exclusions */
  key_exclusions?: string[];

  /** Attached endorsement form numbers */
  endorsement_forms?: string[];

  // === PREMIUM ===
  /** Premium for this coverage */
  premium?: number;

  /** Minimum premium */
  minimum_premium?: number;

  // === UNDERWRITING ===
  /** Years of experience in profession */
  years_experience?: number;

  /** Number of professionals covered */
  professionals_count?: number;

  /** Gross revenue (common rating basis) */
  gross_revenue?: number;

  /** Prior claims history */
  prior_claims_last_5_years?: number;

  // === EVIDENCE TRACKING ===
  evidence_ids?: string[];
  extraction_confidence?: number;
  extraction_status?: 'AUTO_APPLIED' | 'NEEDS_REVIEW' | 'LOW_CONFIDENCE' | 'NOT_FOUND' | 'CONFLICT' | 'MANUAL';
}

/**
 * Helper to check if policy has E&O/Professional coverage
 */
export function hasProfessionalLiability(options: CGLCoverageOptions): boolean {
  return options.additional_coverages?.professional_liability?.included === true;
}

/**
 * Get ERP deadline date (typically 30-90 days after expiration)
 */
export function getERPDeadline(
  expirationDate: string,
  deadlineDays: number = 60
): Date {
  const expDate = new Date(expirationDate);
  expDate.setDate(expDate.getDate() + deadlineDays);
  return expDate;
}

// =============================================================================
// COVERAGE LIMITS
// =============================================================================

export interface CGLCoverageLimits {
  /** Each Occurrence Limit */
  each_occurrence: number;

  /** Damage to Premises Rented to You (Fire Damage) - per premises */
  damage_to_rented_premises: number;

  /** Medical Expense Limit - per person */
  medical_expense: number;

  /** Personal & Advertising Injury Limit */
  personal_advertising_injury: number;

  /** General Aggregate Limit */
  general_aggregate: number;

  /** Products/Completed Operations Aggregate Limit */
  products_completed_ops_aggregate: number;

  /** Aggregate applies per: */
  aggregate_applies_per?: 'policy' | 'project' | 'location';

  /** Employee Benefits Liability limit (if included) */
  employee_benefits_liability?: number;
}

// =============================================================================
// DEDUCTIBLE / SIR
// =============================================================================

export interface CGLDeductible {
  /** Deductible or SIR? */
  type: 'deductible' | 'sir' | 'none';

  /** Per occurrence amount */
  per_occurrence?: number;

  /** Property damage specific deductible (if different) */
  property_damage?: number;

  /** Bodily injury specific deductible (if different) */
  bodily_injury?: number;

  /** Who pays - insured or carrier fronts */
  payment_responsibility?: 'insured' | 'carrier_fronts';

  /** Does deductible erode limits? */
  erodes_limits?: boolean;

  /** Applies to */
  applies_to?: 'all_claims' | 'property_damage_only' | 'bodily_injury_only';

  /** Additional notes */
  notes?: string;
}

// =============================================================================
// COVERAGE OPTIONS / CONDITIONS
// =============================================================================

export interface CGLCoverageOptions {
  /** Occurrence vs Claims-Made */
  policy_form: CGLPolicyFormType;

  /** Claims-made specifics (if applicable) */
  claims_made_details?: ClaimsMadeDetails;

  /** Defense costs - inside or outside limits */
  defense_costs: 'inside_limits' | 'outside_limits';

  /** Additional coverages included */
  additional_coverages?: {
    /** Liquor Liability (if included) */
    liquor_liability?: {
      included: boolean;
      limit?: number;
      separate_policy?: boolean;
    };

    /** Hired/Non-Owned Auto (sometimes packaged) */
    hired_non_owned_auto?: {
      included: boolean;
      limit?: number;
      separate_policy?: boolean;
    };

    /** Pollution Liability (if included) */
    pollution_liability?: {
      included: boolean;
      limit?: number;
      type?: 'limited' | 'broad' | 'buy_back';
    };

    /** Professional / E&O (if in package) - See ProfessionalLiabilityCoverage for details */
    professional_liability?: ProfessionalLiabilityCoverage;

    /** Employee Benefits Liability */
    employee_benefits_liability?: {
      included: boolean;
      limit?: number;
      retroactive_date?: string;
    };

    /** Stop Gap / Employers Liability */
    stop_gap_liability?: {
      included: boolean;
      limit?: number;
      states?: string[];
    };

    /** Medical Payments Extension */
    medical_payments_extension?: {
      included: boolean;
      limit?: number;
    };
  };
}

// =============================================================================
// PREMISES / LOCATIONS
// =============================================================================

export interface CGLLocation {
  /** Location number */
  location_number: number;

  /** Location address */
  address: Address;

  /** Description of premises/operations */
  description?: string;

  /** Territory / rating territory */
  territory?: string;

  /** County */
  county?: string;

  /** Building type */
  building_type?: 'owned' | 'leased' | 'rented';

  /** Square footage */
  square_footage?: number;

  /** Year built */
  year_built?: number;

  /** Construction type */
  construction_type?: 'frame' | 'masonry' | 'fire_resistive' | 'modified_fire_resistive' | 'non_combustible';

  /** Is this the primary location? */
  is_primary?: boolean;

  /** Evidence tracking */
  evidence_ids?: string[];
  extraction_confidence?: number;
  extraction_status?: 'AUTO_APPLIED' | 'NEEDS_REVIEW' | 'LOW_CONFIDENCE' | 'NOT_FOUND' | 'MANUAL';
}

// =============================================================================
// CLASSIFICATIONS / EXPOSURES / RATING BASIS
// =============================================================================

export type ExposureBasis = 'sales' | 'payroll' | 'area' | 'units' | 'admissions' | 'per_project' | 'flat' | 'other';

export interface CGLClassification {
  /** Class code (ISO/NAICS/Carrier) */
  class_code?: string;

  /** Classification description */
  description: string;

  /** Exposure basis */
  exposure_basis: ExposureBasis;

  /** Exposure amount (sales $, payroll $, sq ft, units, etc.) */
  exposure_amount?: number;

  /** Rate (per $1000 or per unit) */
  rate?: number;

  /** Premium for this classification */
  premium?: number;

  /** Is this for Products/Completed Ops? */
  is_products_completed_ops?: boolean;

  /** Location number this applies to */
  location_number?: number;

  /** Subcontractor costs included in exposure? */
  subcontractor_costs_included?: boolean;

  /** Percent subcontracted (if shown) */
  percent_subcontracted?: number;

  /** Evidence tracking */
  evidence_ids?: string[];
  extraction_confidence?: number;
  extraction_status?: 'AUTO_APPLIED' | 'NEEDS_REVIEW' | 'LOW_CONFIDENCE' | 'NOT_FOUND' | 'MANUAL';
}

// =============================================================================
// UNDERWRITING MODIFIERS
// =============================================================================

export interface CGLRatingModifiers {
  /** Experience modification factor (not like WC, but some carriers show) */
  experience_mod?: number;

  /** Schedule credit (negative = credit) */
  schedule_credit?: number;

  /** Schedule debit (positive = debit) */
  schedule_debit?: number;

  /** Net schedule modification */
  net_schedule_modification?: number;

  /** Minimum premium */
  minimum_premium?: number;

  /** Loss free credit */
  loss_free_credit?: number;

  /** Package discount */
  package_discount?: number;

  /** Multi-year policy discount */
  multi_year_discount?: number;
}

// =============================================================================
// ADDITIONAL INSUREDS
// =============================================================================

export type AdditionalInsuredType =
  | 'ongoing_ops'
  | 'completed_ops'
  | 'both'
  | 'owners_lessees_contractors'
  | 'managers_lessors'
  | 'vendors'
  | 'co_owner'
  | 'designated_person'
  | 'other';

export interface CGLAdditionalInsured {
  /** Additional insured name */
  name: string;

  /** Address */
  address?: Address;

  /** AI type */
  ai_type: AdditionalInsuredType;

  /** Primary & non-contributory? */
  primary_noncontributory: boolean;

  /** Waiver of subrogation? */
  waiver_of_subrogation: boolean;

  /** Applies per project? */
  per_project?: boolean;

  /** Applies per location? */
  per_location?: boolean;

  /** Related job/project name */
  project_name?: string;

  /** Related location number */
  location_number?: number;

  /** Effective date (if different from policy) */
  effective_date?: string;

  /** Expiration date (if different from policy) */
  expiration_date?: string;

  /** Endorsement form number */
  endorsement_form?: string;

  /** Evidence tracking */
  evidence_ids?: string[];
  extraction_confidence?: number;
  extraction_status?: 'AUTO_APPLIED' | 'NEEDS_REVIEW' | 'LOW_CONFIDENCE' | 'NOT_FOUND' | 'MANUAL';
}

// =============================================================================
// ADDITIONAL INTERESTS
// =============================================================================

export type AdditionalInterestType = 'mortgagee' | 'loss_payee' | 'additional_interest' | 'certificate_holder';

export interface CGLAdditionalInterest {
  /** Name */
  name: string;

  /** Address */
  address?: Address;

  /** Interest type */
  interest_type: AdditionalInterestType;

  /** Reference/loan number */
  reference_number?: string;

  /** Related location number */
  location_number?: number;

  /** Evidence tracking */
  evidence_ids?: string[];
}

// =============================================================================
// PREMIUM SUMMARY
// =============================================================================

export interface CGLPremiumSummary {
  /** Total premium */
  total_premium: number;

  /** Premises/Operations premium */
  premises_operations_premium?: number;

  /** Products/Completed Operations premium */
  products_completed_ops_premium?: number;

  /** Personal & Advertising Injury premium */
  personal_advertising_injury_premium?: number;

  /** Medical Payments premium */
  medical_payments_premium?: number;

  /** Additional coverage premiums */
  liquor_liability_premium?: number;
  employee_benefits_premium?: number;
  hired_non_owned_auto_premium?: number;

  /** Fees and taxes */
  policy_fee?: number;
  state_taxes?: number;
  stamping_fee?: number; // Surplus lines

  /** TRIA/terrorism */
  terrorism_premium?: number;
  terrorism_rejected?: boolean;

  /** Deposit premium */
  deposit_premium?: number;

  /** Minimum premium */
  minimum_premium?: number;

  /** Premium by location (if itemized) */
  premium_by_location?: {
    location_number: number;
    premium: number;
  }[];
}

// =============================================================================
// ENDORSEMENTS
// =============================================================================

export interface CGLEndorsement {
  /** Form number (e.g., CG 20 10) */
  form_number: string;

  /** Edition date */
  edition_date?: string;

  /** Description/title */
  description: string;

  /** Premium impact (if any) */
  premium_impact?: number;

  /** Related location number */
  location_number?: number;

  /** Related additional insured */
  additional_insured_name?: string;

  /** Evidence tracking */
  evidence_ids?: string[];
}

// =============================================================================
// FULL POLICY DETAILS
// =============================================================================

export interface CGLPolicyDetails {
  identity: CGLPolicyIdentity;
  dates: CGLPolicyDates;
  coverage_options: CGLCoverageOptions;
  limits: CGLCoverageLimits;
  deductible?: CGLDeductible;
  locations: CGLLocation[];
  classifications: CGLClassification[];
  rating_modifiers?: CGLRatingModifiers;
  additional_insureds: CGLAdditionalInsured[];
  additional_interests: CGLAdditionalInterest[];
  endorsements: CGLEndorsement[];
  premium: CGLPremiumSummary;

  /** Extraction metadata */
  extraction_source?: 'manual' | 'ai_extracted' | 'azure_di_claude';
  extraction_confidence?: number;
  extracted_at?: string;
  evidence_catalog_id?: string;
}

// =============================================================================
// TAB CONFIGURATION
// =============================================================================

export type CGLPolicyTab =
  | 'overview'
  | 'limits'
  | 'professional'
  | 'locations'
  | 'classifications'
  | 'additional_insureds'
  | 'premium';

export const CGL_POLICY_TABS: { value: CGLPolicyTab; label: string; conditional?: boolean }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'limits', label: 'Limits' },
  { value: 'professional', label: 'E&O/Prof', conditional: true }, // Only show if E&O is included
  { value: 'locations', label: 'Locations' },
  { value: 'classifications', label: 'Classifications' },
  { value: 'additional_insureds', label: 'Add\'l Insureds' },
  { value: 'premium', label: 'Premium' },
];

// =============================================================================
// EXPOSURE BASIS LABELS
// =============================================================================

export const EXPOSURE_BASIS_LABELS: Record<ExposureBasis, string> = {
  sales: 'Gross Sales',
  payroll: 'Payroll',
  area: 'Square Feet',
  units: 'Units',
  admissions: 'Admissions',
  per_project: 'Per Project',
  flat: 'Flat Charge',
  other: 'Other',
};

// =============================================================================
// ADDITIONAL INSURED TYPE LABELS
// =============================================================================

export const AI_TYPE_LABELS: Record<AdditionalInsuredType, string> = {
  ongoing_ops: 'Ongoing Operations',
  completed_ops: 'Completed Operations',
  both: 'Ongoing & Completed Ops',
  owners_lessees_contractors: 'Owners, Lessees, Contractors',
  managers_lessors: 'Managers or Lessors',
  vendors: 'Vendors',
  co_owner: 'Co-Owner of Insured Premises',
  designated_person: 'Designated Person or Organization',
  other: 'Other',
};

// =============================================================================
// COMMON CGL ENDORSEMENT FORMS
// =============================================================================

export const COMMON_CGL_ENDORSEMENTS = [
  { form: 'CG 20 10', description: 'Additional Insured - Owners, Lessees or Contractors' },
  { form: 'CG 20 37', description: 'Additional Insured - Owners, Lessees or Contractors - Completed Operations' },
  { form: 'CG 20 11', description: 'Additional Insured - Managers or Lessors of Premises' },
  { form: 'CG 20 15', description: 'Additional Insured - Vendors' },
  { form: 'CG 24 04', description: 'Waiver of Transfer of Rights of Recovery Against Others' },
  { form: 'CG 20 01', description: 'Primary and Noncontributory - Other Insurance Condition' },
  { form: 'CG 21 39', description: 'Contractual Liability Limitation' },
  { form: 'CG 21 47', description: 'Employment-Related Practices Exclusion' },
  { form: 'CG 22 94', description: 'Limitation of Coverage to Designated Premises or Project' },
  { form: 'CG 00 33', description: 'Liquor Liability Coverage Form' },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function isCGLPolicy(lineOfBusiness: string | null | undefined): boolean {
  if (!lineOfBusiness) return false;
  const lob = lineOfBusiness.toLowerCase();
  return (
    lob.includes('general liability') ||
    lob.includes('cgl') ||
    lob === 'gl' ||
    lob.includes('commercial general') ||
    (lob.includes('liability') && !lob.includes('auto') && !lob.includes('professional'))
  );
}

export function formatExposureAmount(amount: number | undefined, basis: ExposureBasis): string {
  if (amount == null) return 'N/A';

  if (basis === 'sales' || basis === 'payroll') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  if (basis === 'area') {
    return `${amount.toLocaleString()} sq ft`;
  }

  return amount.toLocaleString();
}

export function getClassificationsByLocation(
  classifications: CGLClassification[],
  locationNumber: number
): CGLClassification[] {
  return classifications.filter((c) => c.location_number === locationNumber);
}

export function getAIsByLocation(
  additionalInsureds: CGLAdditionalInsured[],
  locationNumber: number
): CGLAdditionalInsured[] {
  return additionalInsureds.filter((ai) => ai.location_number === locationNumber);
}

export function isClaimsMade(options: CGLCoverageOptions): boolean {
  return options.policy_form === 'claims_made';
}
