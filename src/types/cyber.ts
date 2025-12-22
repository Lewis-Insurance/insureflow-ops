/**
 * Cyber Liability / Data Breach Policy Types
 *
 * Basic type definitions for Cyber policy data including:
 * - Policy identity and dates
 * - Coverage structure (first-party and third-party)
 * - Key limits and sublimits
 * - Retention/Deductible
 * - Premium
 */

// =============================================================================
// POLICY IDENTITY
// =============================================================================

export interface CyberPolicyIdentity {
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

export interface CyberPolicyDates {
  effective_date: string; // YYYY-MM-DD
  expiration_date: string;
  issue_date?: string;
  /** Retroactive date (claims-made) */
  retroactive_date?: string;
  /** Full prior acts coverage */
  full_prior_acts?: boolean;
}

// =============================================================================
// COVERAGE STRUCTURE
// =============================================================================

export type CyberPolicyFormType = 'claims_made' | 'occurrence';

/**
 * First-Party Coverages (direct losses to the insured)
 */
export interface CyberFirstPartyCoverages {
  /** Data breach response / notification costs */
  breach_response?: {
    included: boolean;
    limit?: number;
    sublimit?: number;
  };

  /** Business interruption due to cyber event */
  business_interruption?: {
    included: boolean;
    limit?: number;
    waiting_period_hours?: number;
    max_period_days?: number;
  };

  /** Data restoration / recovery */
  data_restoration?: {
    included: boolean;
    limit?: number;
  };

  /** Cyber extortion / ransomware */
  cyber_extortion?: {
    included: boolean;
    limit?: number;
    ransom_payment_included?: boolean;
  };

  /** Computer fraud / funds transfer fraud */
  computer_fraud?: {
    included: boolean;
    limit?: number;
    social_engineering_sublimit?: number;
  };

  /** Forensic investigation */
  forensic_investigation?: {
    included: boolean;
    limit?: number;
  };

  /** Crisis management / PR expenses */
  crisis_management?: {
    included: boolean;
    limit?: number;
  };

  /** Credit monitoring for affected individuals */
  credit_monitoring?: {
    included: boolean;
    limit?: number;
    duration_months?: number;
  };
}

/**
 * Third-Party Coverages (liability to others)
 */
export interface CyberThirdPartyCoverages {
  /** Privacy liability / data breach liability */
  privacy_liability?: {
    included: boolean;
    limit?: number;
  };

  /** Network security liability */
  network_security_liability?: {
    included: boolean;
    limit?: number;
  };

  /** Media liability (website content, defamation) */
  media_liability?: {
    included: boolean;
    limit?: number;
  };

  /** Regulatory defense and penalties */
  regulatory_coverage?: {
    included: boolean;
    defense_limit?: number;
    penalties_limit?: number;
    pci_fines_included?: boolean;
  };

  /** Payment card industry (PCI) coverage */
  pci_coverage?: {
    included: boolean;
    limit?: number;
  };
}

// =============================================================================
// LIMITS & RETENTION
// =============================================================================

export interface CyberPolicyLimits {
  /** Per occurrence / claim limit */
  per_claim_limit: number;

  /** Aggregate limit */
  aggregate_limit: number;

  /** Defense costs inside or outside limits */
  defense_costs: 'inside_limits' | 'outside_limits';

  /** Waiting period (hours) for BI coverage */
  waiting_period_hours?: number;

  /** Is there a shared aggregate with other coverages? */
  shared_aggregate?: boolean;
  shared_aggregate_with?: string[];
}

export interface CyberRetention {
  /** Retention / deductible amount */
  amount: number;

  /** Applies per claim or per occurrence */
  applies_per: 'claim' | 'occurrence' | 'wrongful_act';

  /** Does retention apply to defense costs? */
  applies_to_defense?: boolean;

  /** Coinsurance percentage (if any) */
  coinsurance_percent?: number;

  /** Separate retention for specific coverages */
  ransomware_retention?: number;
  social_engineering_retention?: number;
}

// =============================================================================
// EXTENDED REPORTING PERIOD (ERP)
// =============================================================================

export interface CyberERP {
  /** Basic ERP (automatic) */
  basic_erp_days?: number;

  /** Supplemental ERP available? */
  supplemental_erp_available?: boolean;

  /** Supplemental ERP options */
  supplemental_erp_options?: {
    duration_months: number;
    premium_percent?: number;
    deadline_days?: number;
  }[];

  /** Was ERP purchased? */
  erp_purchased?: boolean;
  erp_purchased_duration_months?: number;
}

// =============================================================================
// PREMIUM
// =============================================================================

export interface CyberPremiumSummary {
  /** Total premium */
  total_premium: number;

  /** Base premium */
  base_premium?: number;

  /** Terrorism premium */
  terrorism_premium?: number;
  terrorism_rejected?: boolean;

  /** Policy fee */
  policy_fee?: number;

  /** State taxes */
  state_taxes?: number;
}

// =============================================================================
// FULL POLICY DETAILS
// =============================================================================

export interface CyberPolicyDetails {
  identity: CyberPolicyIdentity;
  dates: CyberPolicyDates;

  /** Policy form (almost always claims-made) */
  policy_form: CyberPolicyFormType;

  /** Limits */
  limits: CyberPolicyLimits;

  /** Retention / Deductible */
  retention?: CyberRetention;

  /** First-party coverages */
  first_party: CyberFirstPartyCoverages;

  /** Third-party coverages */
  third_party: CyberThirdPartyCoverages;

  /** Extended Reporting Period */
  erp?: CyberERP;

  /** Key exclusions */
  key_exclusions?: string[];

  /** Endorsement form numbers */
  endorsement_forms?: string[];

  /** Premium */
  premium: CyberPremiumSummary;

  /** Extraction metadata */
  extraction_source?: 'manual' | 'ai_extracted' | 'azure_di_claude';
  extraction_confidence?: number;
  extracted_at?: string;
  evidence_catalog_id?: string;
}

// =============================================================================
// TAB CONFIGURATION
// =============================================================================

export type CyberPolicyTab =
  | 'overview'
  | 'first_party'
  | 'third_party'
  | 'premium';

export const CYBER_POLICY_TABS: { value: CyberPolicyTab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'first_party', label: 'First Party' },
  { value: 'third_party', label: 'Third Party' },
  { value: 'premium', label: 'Premium' },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function isCyberPolicy(lineOfBusiness: string | null | undefined): boolean {
  if (!lineOfBusiness) return false;
  const lob = lineOfBusiness.toLowerCase();
  return (
    lob.includes('cyber') ||
    lob.includes('data breach') ||
    lob.includes('network security') ||
    lob.includes('privacy')
  );
}

export function formatCyberLimit(amount: number | undefined | null): string {
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

export function hasCyberExtortion(firstParty: CyberFirstPartyCoverages): boolean {
  return firstParty.cyber_extortion?.included === true;
}

export function hasBusinessInterruption(firstParty: CyberFirstPartyCoverages): boolean {
  return firstParty.business_interruption?.included === true;
}

export function hasPCICoverage(thirdParty: CyberThirdPartyCoverages): boolean {
  return thirdParty.pci_coverage?.included === true;
}

export function hasRegulatoryDefense(thirdParty: CyberThirdPartyCoverages): boolean {
  return thirdParty.regulatory_coverage?.included === true;
}
