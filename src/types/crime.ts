/**
 * Commercial Crime Policy Types
 *
 * Basic type definitions for Crime policy data including:
 * - Policy identity and dates
 * - Coverage structure (Insuring Agreements A-H)
 * - Key limits and sublimits
 * - Deductibles
 * - Premium
 */

// =============================================================================
// POLICY IDENTITY
// =============================================================================

export interface CrimePolicyIdentity {
  carrier_name: string;
  carrier_naic?: string;
  policy_number: string;
  transaction_type: 'quote' | 'bound' | 'issued' | 'renewal' | 'endorsement' | 'cancel';
  named_insured: string;
  dba?: string;
  mailing_address?: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  producer?: string;
  agency?: string;
}

// =============================================================================
// POLICY DATES
// =============================================================================

export interface CrimePolicyDates {
  effective_date: string; // YYYY-MM-DD
  expiration_date: string;
  issue_date?: string;
  /** Discovery period (most crime policies are discovery-based) */
  discovery_period_months?: number;
  /** Prior loss date (for loss sustained policies) */
  prior_loss_date?: string;
}

// =============================================================================
// POLICY FORM
// =============================================================================

export type CrimePolicyFormType = 'discovery' | 'loss_sustained';

export type CrimePolicyEdition = 'iso_2016' | 'iso_2013' | 'proprietary' | 'other';

// =============================================================================
// INSURING AGREEMENTS (Coverage Parts)
// =============================================================================

/**
 * Standard ISO Crime Coverage Parts
 */
export interface CrimeInsuringAgreements {
  /**
   * Coverage A: Employee Theft
   * Loss of money, securities, or other property caused by dishonest employees
   */
  employee_theft?: {
    included: boolean;
    limit: number;
    deductible?: number;
    /** Per employee vs blanket */
    coverage_type: 'blanket' | 'per_employee' | 'schedule';
    /** ERISA fidelity bond included? */
    erisa_included?: boolean;
    erisa_sublimit?: number;
  };

  /**
   * Coverage B: Forgery or Alteration
   * Loss from forged or altered checks, drafts, promissory notes
   */
  forgery_alteration?: {
    included: boolean;
    limit: number;
    deductible?: number;
  };

  /**
   * Coverage C: Inside the Premises - Theft of Money and Securities
   * Theft, disappearance, destruction of money/securities inside premises
   */
  inside_premises_money?: {
    included: boolean;
    limit: number;
    deductible?: number;
    /** Covered perils */
    robbery_included?: boolean;
    safe_burglary_included?: boolean;
  };

  /**
   * Coverage D: Inside the Premises - Robbery or Safe Burglary of Other Property
   * Theft of other property from inside the premises
   */
  inside_premises_other_property?: {
    included: boolean;
    limit: number;
    deductible?: number;
  };

  /**
   * Coverage E: Outside the Premises
   * Theft, disappearance, destruction while being conveyed by messenger
   */
  outside_premises?: {
    included: boolean;
    limit: number;
    deductible?: number;
  };

  /**
   * Coverage F: Computer Fraud
   * Loss from fraudulent computer entry or electronic transfer
   */
  computer_fraud?: {
    included: boolean;
    limit: number;
    deductible?: number;
  };

  /**
   * Coverage G: Funds Transfer Fraud
   * Loss from fraudulent instructions to transfer funds
   */
  funds_transfer_fraud?: {
    included: boolean;
    limit: number;
    deductible?: number;
    /** Social engineering coverage */
    social_engineering_included?: boolean;
    social_engineering_sublimit?: number;
  };

  /**
   * Coverage H: Money Orders and Counterfeit Money
   * Loss from accepting counterfeit money or money orders
   */
  counterfeit_money?: {
    included: boolean;
    limit: number;
    deductible?: number;
  };
}

/**
 * Additional Crime Coverages (often endorsements)
 */
export interface CrimeAdditionalCoverages {
  /** Client Coverage (loss of client property in your care) */
  client_coverage?: {
    included: boolean;
    limit?: number;
    deductible?: number;
  };

  /** Credit Card Fraud */
  credit_card_fraud?: {
    included: boolean;
    limit?: number;
  };

  /** Extortion / Kidnap & Ransom */
  extortion?: {
    included: boolean;
    limit?: number;
    deductible?: number;
  };

  /** Impersonation Fraud */
  impersonation_fraud?: {
    included: boolean;
    limit?: number;
    sublimit?: number;
  };

  /** Invoice Manipulation */
  invoice_manipulation?: {
    included: boolean;
    limit?: number;
    sublimit?: number;
  };

  /** Telephone Fraud / Phishing */
  telephone_fraud?: {
    included: boolean;
    limit?: number;
    sublimit?: number;
  };
}

// =============================================================================
// LIMITS & DEDUCTIBLE
// =============================================================================

export interface CrimePolicyLimits {
  /** Single loss limit (overall policy limit) */
  single_loss_limit?: number;

  /** Aggregate limit (if any) */
  aggregate_limit?: number;

  /** Is there a combined single limit? */
  combined_single_limit?: boolean;
}

export interface CrimeDeductible {
  /** Standard deductible */
  amount: number;

  /** Applies per occurrence or per claim */
  applies_per: 'occurrence' | 'claim' | 'loss';

  /** Separate deductibles for specific coverages */
  employee_theft_deductible?: number;
  computer_fraud_deductible?: number;
  social_engineering_deductible?: number;
}

// =============================================================================
// PREMIUM
// =============================================================================

export interface CrimePremiumSummary {
  /** Total premium */
  total_premium: number;

  /** Base premium */
  base_premium?: number;

  /** Policy fee */
  policy_fee?: number;

  /** State taxes */
  state_taxes?: number;
}

// =============================================================================
// FULL POLICY DETAILS
// =============================================================================

export interface CrimePolicyDetails {
  identity: CrimePolicyIdentity;
  dates: CrimePolicyDates;

  /** Policy form (discovery vs loss sustained) */
  policy_form: CrimePolicyFormType;

  /** Form edition */
  form_edition?: CrimePolicyEdition;

  /** Overall limits */
  limits?: CrimePolicyLimits;

  /** Standard deductible */
  deductible?: CrimeDeductible;

  /** Insuring Agreements (Coverage Parts A-H) */
  insuring_agreements: CrimeInsuringAgreements;

  /** Additional coverages */
  additional_coverages?: CrimeAdditionalCoverages;

  /** Key exclusions */
  key_exclusions?: string[];

  /** Endorsement form numbers */
  endorsement_forms?: string[];

  /** Premium */
  premium: CrimePremiumSummary;

  /** Extraction metadata */
  extraction_source?: 'manual' | 'ai_extracted' | 'azure_di_claude';
  extraction_confidence?: number;
  extracted_at?: string;
  evidence_catalog_id?: string;
}

// =============================================================================
// TAB CONFIGURATION
// =============================================================================

export type CrimePolicyTab =
  | 'overview'
  | 'coverages'
  | 'premium';

export const CRIME_POLICY_TABS: { value: CrimePolicyTab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'coverages', label: 'Coverages' },
  { value: 'premium', label: 'Premium' },
];

// =============================================================================
// COVERAGE LABELS
// =============================================================================

export const CRIME_COVERAGE_LABELS: Record<string, string> = {
  employee_theft: 'Coverage A: Employee Theft',
  forgery_alteration: 'Coverage B: Forgery or Alteration',
  inside_premises_money: 'Coverage C: Inside Premises - Money & Securities',
  inside_premises_other_property: 'Coverage D: Inside Premises - Other Property',
  outside_premises: 'Coverage E: Outside Premises',
  computer_fraud: 'Coverage F: Computer Fraud',
  funds_transfer_fraud: 'Coverage G: Funds Transfer Fraud',
  counterfeit_money: 'Coverage H: Money Orders & Counterfeit',
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function isCrimePolicy(lineOfBusiness: string | null | undefined): boolean {
  if (!lineOfBusiness) return false;
  const lob = lineOfBusiness.toLowerCase();
  return (
    lob.includes('crime') ||
    lob.includes('fidelity') ||
    lob.includes('employee dishonesty') ||
    lob.includes('employee theft')
  );
}

export function formatCrimeLimit(amount: number | undefined | null): string {
  if (amount == null) return 'N/A';
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(amount % 1000000 === 0 ? 0 : 1)}M`;
  }
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function hasEmployeeTheft(agreements: CrimeInsuringAgreements): boolean {
  return agreements.employee_theft?.included === true;
}

export function hasComputerFraud(agreements: CrimeInsuringAgreements): boolean {
  return agreements.computer_fraud?.included === true;
}

export function hasSocialEngineering(agreements: CrimeInsuringAgreements): boolean {
  return agreements.funds_transfer_fraud?.social_engineering_included === true;
}

export function getIncludedCoverages(agreements: CrimeInsuringAgreements): string[] {
  const included: string[] = [];
  if (agreements.employee_theft?.included) included.push('employee_theft');
  if (agreements.forgery_alteration?.included) included.push('forgery_alteration');
  if (agreements.inside_premises_money?.included) included.push('inside_premises_money');
  if (agreements.inside_premises_other_property?.included) included.push('inside_premises_other_property');
  if (agreements.outside_premises?.included) included.push('outside_premises');
  if (agreements.computer_fraud?.included) included.push('computer_fraud');
  if (agreements.funds_transfer_fraud?.included) included.push('funds_transfer_fraud');
  if (agreements.counterfeit_money?.included) included.push('counterfeit_money');
  return included;
}

export function calculateTotalLimits(agreements: CrimeInsuringAgreements): number {
  let total = 0;
  if (agreements.employee_theft?.included) total += agreements.employee_theft.limit || 0;
  if (agreements.forgery_alteration?.included) total += agreements.forgery_alteration.limit || 0;
  if (agreements.inside_premises_money?.included) total += agreements.inside_premises_money.limit || 0;
  if (agreements.inside_premises_other_property?.included) total += agreements.inside_premises_other_property.limit || 0;
  if (agreements.outside_premises?.included) total += agreements.outside_premises.limit || 0;
  if (agreements.computer_fraud?.included) total += agreements.computer_fraud.limit || 0;
  if (agreements.funds_transfer_fraud?.included) total += agreements.funds_transfer_fraud.limit || 0;
  if (agreements.counterfeit_money?.included) total += agreements.counterfeit_money.limit || 0;
  return total;
}
