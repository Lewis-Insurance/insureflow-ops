/**
 * Workers' Compensation Policy Types
 *
 * Comprehensive type definitions for WC policy data capture,
 * including classifications, experience mods, and premium details.
 */

// =============================================================================
// POLICY IDENTITY
// =============================================================================

export interface WCPolicyIdentity {
  carrier_name: string;
  carrier_naic?: string;
  policy_number: string;
  status: 'quote' | 'bound' | 'issued' | 'renewed' | 'cancelled' | 'expired';
  line_of_business: 'Workers Compensation';
  named_insured: string;
  dba?: string;
  mailing_address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  primary_location_address?: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  fein?: string; // Federal Employer ID Number
  producer?: string;
  agency?: string;
  sub_producer?: string;
}

// =============================================================================
// DATES & TERMS
// =============================================================================

export interface WCPolicyDates {
  effective_date: string; // ISO date
  expiration_date: string;
  issue_date?: string;
  policy_term?: string; // e.g., "12 months"
}

// =============================================================================
// COVERAGE STRUCTURE
// =============================================================================

export type WCPolicyType =
  | 'standard'
  | 'assigned_risk'
  | 'peo'
  | 'ghost'
  | 'monopolistic'
  | 'other';

export interface WCCoverageState {
  state: string; // State code (e.g., "TX", "CA")
  type: 'item_3a' | 'item_3c' | 'monopolistic'; // 3.A = primary, 3.C = other states
  is_monopolistic?: boolean; // ND, OH, WA, WY
}

export interface WCEmployersLiabilityLimits {
  each_accident: number;
  disease_each_employee: number;
  disease_policy_limit: number;
}

export interface WCCoverageStructure {
  policy_type: WCPolicyType;
  covered_states: WCCoverageState[];
  part_one_wc: 'statutory'; // Always statutory per state
  part_two_employers_liability: WCEmployersLiabilityLimits;
  deductible?: {
    type: 'per_claim' | 'per_occurrence' | 'aggregate';
    amount: number;
    applies_to: string; // e.g., "medical only", "indemnity", "both"
  };
  reimbursement_program?: string;
}

// =============================================================================
// CLASSIFICATIONS (Heart of WC)
// =============================================================================

export interface WCClassification {
  state: string;
  class_code: string; // e.g., "8810", "8742", "5474"
  description: string;
  exposure_basis: 'payroll' | 'per_capita' | 'other';
  estimated_payroll?: number;
  estimated_exposure?: number;
  rate: number;
  premium: number;
  is_governing_class?: boolean;
  is_standard_exception?: boolean; // 8810 clerical, 8742 outside sales
  premium_modifiers?: {
    name: string;
    factor: number;
  }[];
}

// =============================================================================
// EXPERIENCE MODIFICATION & RATING
// =============================================================================

export interface WCExperienceRating {
  experience_mod?: number; // X-Mod value (e.g., 0.85 = 15% credit, 1.15 = 15% debit)
  experience_mod_effective_date?: string;
  rating_bureau: 'NCCI' | 'state_bureau' | string;
  merit_rating?: {
    type: 'debit' | 'credit';
    percent: number;
    factor: number;
  };
  schedule_rating?: {
    type: 'debit' | 'credit';
    percent: number;
    factor: number;
  };
  premium_discount?: number;
  deductible_credit?: number;
}

// =============================================================================
// PREMIUM SUMMARY
// =============================================================================

export interface WCPremiumSummary {
  estimated_annual_premium: number;
  wc_premium_subtotal?: number; // Before taxes/fees
  expense_constant?: number;
  taxes_and_assessments?: {
    state_assessments?: number;
    terrorism_charge?: number;
    other_carrier_fees?: number;
    total: number;
  };
  deposit_premium?: number;
  payment_plan?: 'monthly' | 'quarterly' | 'paid_in_full' | 'other';
  minimum_premium?: number;
  // Premium breakdown by state
  premium_by_state?: {
    state: string;
    premium: number;
  }[];
}

// =============================================================================
// EMPLOYER DESCRIPTORS & OPERATIONS
// =============================================================================

export interface WCEmployerInfo {
  business_description?: string;
  years_in_business?: number;
  nature_of_operations?: string;
  number_of_employees?: number;
  annual_payroll?: number;
}

// =============================================================================
// OFFICER/OWNER ELECTIONS (Very Important)
// =============================================================================

export interface WCOfficerElection {
  name: string;
  title: string;
  ownership_percent?: number;
  included: boolean; // True = covered, False = excluded
  annual_remuneration?: number;
  duties?: string;
}

export interface WCOwnershipElections {
  officers: WCOfficerElection[];
  partners?: WCOfficerElection[];
  sole_proprietor?: {
    name: string;
    included: boolean;
  };
  llc_members?: WCOfficerElection[];
  independent_contractors_notes?: string;
}

// =============================================================================
// FULL WC POLICY DETAILS
// =============================================================================

export interface WCPolicyDetails {
  // Core sections
  identity: WCPolicyIdentity;
  dates: WCPolicyDates;
  coverage: WCCoverageStructure;

  // Classifications & Rating
  classifications: WCClassification[];
  experience_rating: WCExperienceRating;

  // Premium
  premium: WCPremiumSummary;

  // Employer Info
  employer_info: WCEmployerInfo;
  ownership_elections: WCOwnershipElections;

  // Metadata
  extraction_source?: 'manual' | 'ai_extracted' | 'document_upload';
  extraction_confidence?: number;
  extracted_at?: string;
  last_updated_at?: string;
}

// =============================================================================
// DISPLAY HELPERS
// =============================================================================

export const WC_POLICY_STATUS_LABELS: Record<WCPolicyIdentity['status'], string> = {
  quote: 'Quote',
  bound: 'Bound',
  issued: 'Issued',
  renewed: 'Renewed',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

export const WC_POLICY_TYPE_LABELS: Record<WCPolicyType, string> = {
  standard: 'Standard WC',
  assigned_risk: 'Assigned Risk',
  peo: 'PEO (Professional Employer Organization)',
  ghost: 'Ghost Policy',
  monopolistic: 'Monopolistic State Fund',
  other: 'Other',
};

export const MONOPOLISTIC_STATES = ['ND', 'OH', 'WA', 'WY'] as const;

export const COMMON_CLASS_CODES: Record<string, string> = {
  '8810': 'Clerical Office Employees',
  '8742': 'Outside Salespersons',
  '5474': 'Painting - Interior',
  '5403': 'Carpentry - Residential',
  '8017': 'Store - Retail',
  '8018': 'Store - Wholesale',
  '8832': 'Physicians & Clerical',
  '8820': 'Attorney - All Employees',
  '5183': 'Plumbing',
  '5190': 'Electrical Wiring',
  '5213': 'Concrete Construction',
  '5437': 'Carpentry - Commercial',
  '5645': 'Carpentry - Detached Structures',
  '8380': 'Automobile Service or Repair',
  '8393': 'Automobile Body Repair',
  '9014': 'Building Operation - All',
  '9015': 'Building Operation - Professional',
};

// =============================================================================
// FORM DEFAULTS
// =============================================================================

export const DEFAULT_WC_DETAILS: Partial<WCPolicyDetails> = {
  identity: {
    carrier_name: '',
    policy_number: '',
    status: 'quote',
    line_of_business: 'Workers Compensation',
    named_insured: '',
    mailing_address: { street: '', city: '', state: '', zip: '' },
  },
  dates: {
    effective_date: '',
    expiration_date: '',
  },
  coverage: {
    policy_type: 'standard',
    covered_states: [],
    part_one_wc: 'statutory',
    part_two_employers_liability: {
      each_accident: 500000,
      disease_each_employee: 500000,
      disease_policy_limit: 500000,
    },
  },
  classifications: [],
  experience_rating: {
    rating_bureau: 'NCCI',
  },
  premium: {
    estimated_annual_premium: 0,
  },
  employer_info: {},
  ownership_elections: {
    officers: [],
  },
};

// =============================================================================
// TAB CONFIGURATION FOR UI
// =============================================================================

export type WCPolicyTab =
  | 'overview'
  | 'coverage'
  | 'classifications'
  | 'experience'
  | 'premium'
  | 'officers';

export const WC_POLICY_TABS: { id: WCPolicyTab; label: string; description: string }[] = [
  { id: 'overview', label: 'Overview', description: 'Policy identity and key details' },
  { id: 'coverage', label: 'Coverage', description: 'States, limits, and coverage structure' },
  { id: 'classifications', label: 'Class Codes', description: 'Job classifications and payroll' },
  { id: 'experience', label: 'Experience Mod', description: 'X-Mod and rating factors' },
  { id: 'premium', label: 'Premium', description: 'Premium breakdown and fees' },
  { id: 'officers', label: 'Officers', description: 'Executive inclusions/exclusions' },
];
