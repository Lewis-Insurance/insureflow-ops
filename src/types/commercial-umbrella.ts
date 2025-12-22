/**
 * Commercial Umbrella / Excess Liability Types
 *
 * Comprehensive type definitions for Umbrella/Excess policy data including:
 * - Policy identity and dates
 * - Limits (per occurrence, aggregate, territory)
 * - Retention/SIR
 * - Underlying policy schedule with compliance checks
 * - Drop-down coverage
 * - Additional insureds
 * - Endorsements and exclusions
 * - Premium summary
 */

// =============================================================================
// POLICY IDENTITY
// =============================================================================

export interface UmbrellaPolicyIdentity {
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

export interface UmbrellaPolicyDates {
  effective_date: string; // YYYY-MM-DD
  expiration_date: string;
  issue_date?: string;
  policy_term?: string;
}

// =============================================================================
// POLICY TYPE
// =============================================================================

/**
 * Policy Type:
 * - Umbrella: Provides broader coverage than underlying + drops down
 * - Excess: Follows form of underlying, no drop-down
 */
export type UmbrellaExcessType = 'umbrella' | 'excess' | 'unknown';

/**
 * Form Basis:
 * - Follow Form: Coverage follows the underlying policies
 * - Stand-Alone: Has its own coverage terms independent of underlying
 */
export type FormBasisType = 'follow_form' | 'stand_alone' | 'unknown';

// =============================================================================
// LIMITS
// =============================================================================

export interface UmbrellaLimits {
  /** Per occurrence limit (the headline limit) */
  per_occurrence: number;

  /** Aggregate limit (may be same as occurrence or higher) */
  aggregate?: number;

  /** Products/Completed Operations aggregate (if separate - uncommon) */
  products_completed_ops_aggregate?: number;

  /** Defense costs positioning */
  defense_costs: 'outside_limits' | 'inside_limits';

  /** Territory */
  territory?: 'us_canada' | 'worldwide' | 'us_only' | 'other';
  territory_description?: string;
}

// =============================================================================
// RETENTION / SELF-INSURED RETENTION
// =============================================================================

export interface UmbrellaRetention {
  /** Retention amount when underlying doesn't respond */
  amount: number;

  /** How retention applies */
  applicability: 'when_underlying_exhausted' | 'when_underlying_not_covered' | 'drop_down' | 'all_claims';

  /** Additional notes about retention */
  notes?: string;
}

// =============================================================================
// UNDERLYING POLICY SCHEDULE
// =============================================================================

/**
 * Underlying policy types that can be scheduled under an umbrella
 */
export type UnderlyingPolicyType =
  | 'general_liability'
  | 'commercial_auto'
  | 'employers_liability'
  | 'workers_compensation'
  | 'professional_liability'
  | 'hired_non_owned_auto'
  | 'employee_benefits'
  | 'other';

export const UNDERLYING_POLICY_TYPE_LABELS: Record<UnderlyingPolicyType, string> = {
  general_liability: 'General Liability (CGL)',
  commercial_auto: 'Commercial Auto',
  employers_liability: "Employer's Liability",
  workers_compensation: "Workers' Compensation",
  professional_liability: 'Professional Liability',
  hired_non_owned_auto: 'Hired & Non-Owned Auto',
  employee_benefits: 'Employee Benefits Liability',
  other: 'Other',
};

export interface UnderlyingPolicy {
  /** Type of underlying coverage */
  type: UnderlyingPolicyType;

  /** Carrier providing underlying coverage */
  carrier: string;

  /** Policy number */
  policy_number: string;

  /** Policy period */
  effective_date: string;
  expiration_date: string;

  /** Underlying limits */
  limits: {
    /** For GL: each occurrence */
    each_occurrence?: number;
    /** For GL: general aggregate */
    general_aggregate?: number;
    /** For Auto: CSL or BI/PD split */
    auto_csl?: number;
    auto_bi_per_person?: number;
    auto_bi_per_accident?: number;
    auto_pd?: number;
    /** For EL: per accident / disease policy / disease employee */
    el_per_accident?: number;
    el_disease_policy?: number;
    el_disease_employee?: number;
    /** Generic limit field */
    limit?: number;
  };

  /** Whether limits meet umbrella requirements */
  meets_requirements?: boolean;

  /** Notes about this underlying */
  notes?: string;

  /** Evidence tracking */
  evidence_ids?: string[];
  extraction_confidence?: number;
  extraction_status?: 'AUTO_APPLIED' | 'NEEDS_REVIEW' | 'LOW_CONFIDENCE' | 'NOT_FOUND' | 'CONFLICT' | 'MANUAL';
}

// =============================================================================
// REQUIRED UNDERLYING MINIMUMS
// =============================================================================

/**
 * Minimum underlying requirements specified by the umbrella policy
 */
export interface UnderlyingRequirements {
  /** GL required minimum per occurrence */
  gl_each_occurrence?: number;
  /** GL required minimum aggregate */
  gl_general_aggregate?: number;

  /** Auto required minimum (usually CSL) */
  auto_liability?: number;

  /** Employer's Liability minimums */
  el_per_accident?: number;
  el_disease_policy?: number;
  el_disease_employee?: number;

  /** Other requirements text */
  other_requirements?: string[];

  /** Evidence tracking */
  evidence_ids?: string[];
}

// =============================================================================
// UNDERLYING COMPLIANCE FLAGS
// =============================================================================

export interface UnderlyingComplianceFlags {
  /** Are all required underlying policies scheduled? */
  all_underlying_scheduled: boolean;

  /** Do all underlying term dates align with umbrella? */
  terms_aligned: boolean;

  /** Do all underlying limits meet minimums? */
  limits_sufficient: boolean;

  /** Are there any gaps in underlying coverage? */
  has_coverage_gaps: boolean;

  /** List of specific issues */
  issues: UnderlyingComplianceIssue[];
}

export interface UnderlyingComplianceIssue {
  type: 'missing_underlying' | 'term_mismatch' | 'limit_insufficient' | 'carrier_missing' | 'policy_number_missing';
  severity: 'high' | 'medium' | 'low';
  underlying_type: UnderlyingPolicyType;
  message: string;
}

// =============================================================================
// DROP-DOWN / BROADENED COVERAGE
// =============================================================================

export interface DropDownCoverage {
  /** Is drop-down coverage provided? */
  is_available: boolean;

  /** Conditions for drop-down */
  conditions?: string;

  /** Exclusions to drop-down */
  exclusions?: string[];

  /** Who is an insured - blanket vs scheduled */
  who_is_insured?: 'blanket' | 'scheduled' | 'follow_underlying' | 'unknown';

  /** Evidence tracking */
  evidence_ids?: string[];
}

// =============================================================================
// ADDITIONAL INSUREDS
// =============================================================================

export interface UmbrellaAdditionalInsured {
  name: string;
  address?: Address;

  /** How AIs are handled */
  ai_type: 'blanket' | 'scheduled' | 'follow_underlying';

  /** Primary & Noncontributory (rare at umbrella layer) */
  primary_noncontributory?: boolean;

  /** Waiver of Subrogation */
  waiver_of_subrogation?: boolean;

  /** Project/Location specific */
  project_name?: string;

  /** Evidence tracking */
  evidence_ids?: string[];
  extraction_confidence?: number;
  extraction_status?: 'AUTO_APPLIED' | 'NEEDS_REVIEW' | 'LOW_CONFIDENCE' | 'NOT_FOUND' | 'CONFLICT' | 'MANUAL';
}

// =============================================================================
// ENDORSEMENTS & EXCLUSIONS
// =============================================================================

/**
 * High-impact endorsement categories for umbrella policies
 */
export type UmbrellaEndorsementCategory =
  | 'designated_underlying'
  | 'auto_liability'
  | 'employers_liability'
  | 'professional_liability'
  | 'pollution'
  | 'abuse_molestation'
  | 'assault_battery'
  | 'communicable_disease'
  | 'residential_work'
  | 'height_limitation'
  | 'eifs_stucco'
  | 'liquor_liability'
  | 'cyber'
  | 'territory_limitation'
  | 'aircraft_watercraft'
  | 'other';

export const ENDORSEMENT_CATEGORY_LABELS: Record<UmbrellaEndorsementCategory, string> = {
  designated_underlying: 'Designated Underlying Insurance',
  auto_liability: 'Auto Liability Limitation',
  employers_liability: "Employer's Liability Exclusion",
  professional_liability: 'Professional Liability Exclusion',
  pollution: 'Pollution Exclusion',
  abuse_molestation: 'Abuse/Molestation Exclusion',
  assault_battery: 'Assault & Battery Exclusion',
  communicable_disease: 'Communicable Disease Exclusion',
  residential_work: 'Residential Work Exclusion',
  height_limitation: 'Height Limitation',
  eifs_stucco: 'EIFS/Stucco Exclusion',
  liquor_liability: 'Liquor Liability',
  cyber: 'Cyber Exclusion',
  territory_limitation: 'Territory Limitation',
  aircraft_watercraft: 'Aircraft/Watercraft Exclusion',
  other: 'Other',
};

export interface UmbrellaEndorsement {
  form_number: string;
  title: string;
  edition_date?: string;
  effective_date?: string;
  category?: UmbrellaEndorsementCategory;

  /** Is this a limitation/exclusion? */
  is_limitation: boolean;

  /** Is this a coverage enhancement? */
  is_enhancement?: boolean;

  /** Premium impact if any */
  premium_impact?: number;

  /** Brief description of impact */
  impact_description?: string;

  /** Evidence tracking */
  evidence_ids?: string[];
  extraction_confidence?: number;
  extraction_status?: 'AUTO_APPLIED' | 'NEEDS_REVIEW' | 'LOW_CONFIDENCE' | 'NOT_FOUND' | 'CONFLICT' | 'MANUAL';
}

// =============================================================================
// PREMIUM SUMMARY
// =============================================================================

export interface UmbrellaPremiumSummary {
  total_premium: number;

  /** Base premium before adjustments */
  base_premium?: number;

  /** Fees and taxes */
  policy_fee?: number;
  state_taxes?: number;
  stamping_fee?: number; // Surplus lines

  /** Terrorism */
  terrorism_premium?: number;
  terrorism_rejected?: boolean;

  /** Deposit if applicable */
  deposit_premium?: number;

  /** Rating basis if shown */
  rating_basis?: string;
  exposure_base?: number;
}

// =============================================================================
// FULL POLICY DETAILS
// =============================================================================

export interface UmbrellaPolicyDetails {
  identity: UmbrellaPolicyIdentity;
  dates: UmbrellaPolicyDates;

  /** Umbrella vs Excess */
  policy_type: UmbrellaExcessType;

  /** Follow Form vs Stand-Alone */
  form_basis: FormBasisType;

  /** Coverage limits */
  limits: UmbrellaLimits;

  /** Retention/SIR */
  retention?: UmbrellaRetention;

  /** Required underlying minimums */
  underlying_requirements?: UnderlyingRequirements;

  /** Underlying policy schedule */
  underlying_policies: UnderlyingPolicy[];

  /** Compliance analysis */
  compliance_flags?: UnderlyingComplianceFlags;

  /** Drop-down coverage */
  drop_down?: DropDownCoverage;

  /** Additional insureds */
  additional_insureds: UmbrellaAdditionalInsured[];

  /** Endorsements/Exclusions */
  endorsements: UmbrellaEndorsement[];

  /** Premium */
  premium: UmbrellaPremiumSummary;

  /** Underwriting notes */
  underwriting_notes?: string[];

  /** Extraction metadata */
  extraction_source?: 'manual' | 'ai_extracted' | 'azure_di_claude';
  extraction_confidence?: number;
  extracted_at?: string;
  evidence_catalog_id?: string;
}

// =============================================================================
// TAB CONFIGURATION
// =============================================================================

export type UmbrellaPolicyTab =
  | 'overview'
  | 'limits'
  | 'underlying'
  | 'compliance'
  | 'endorsements'
  | 'premium';

export const UMBRELLA_POLICY_TABS: { value: UmbrellaPolicyTab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'limits', label: 'Limits' },
  { value: 'underlying', label: 'Underlying' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'endorsements', label: 'Endorsements' },
  { value: 'premium', label: 'Premium' },
];

// =============================================================================
// COMMON UMBRELLA LIMITS
// =============================================================================

export const COMMON_UMBRELLA_LIMITS = [
  1_000_000,
  2_000_000,
  3_000_000,
  4_000_000,
  5_000_000,
  10_000_000,
  15_000_000,
  20_000_000,
  25_000_000,
  50_000_000,
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function isUmbrellaPolicy(lineOfBusiness: string | null | undefined): boolean {
  if (!lineOfBusiness) return false;
  const lob = lineOfBusiness.toLowerCase();
  return (
    lob.includes('umbrella') ||
    lob.includes('excess') ||
    lob === 'umb' ||
    lob === 'ul' ||
    lob === 'el' ||
    lob.includes('excess liability')
  );
}

export function formatUmbrellaLimit(amount: number | undefined | null): string {
  if (amount == null) return 'N/A';
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    return millions === Math.floor(millions)
      ? `$${millions}M`
      : `$${millions.toFixed(1)}M`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getUnderlyingTypeLabel(type: UnderlyingPolicyType): string {
  return UNDERLYING_POLICY_TYPE_LABELS[type] || type;
}

export function getEndorsementCategoryLabel(category: UmbrellaEndorsementCategory): string {
  return ENDORSEMENT_CATEGORY_LABELS[category] || category;
}

/**
 * Checks if underlying policies have term alignment issues with umbrella
 */
export function checkTermAlignment(
  umbrellaEffective: string,
  umbrellaExpiration: string,
  underlyingPolicies: UnderlyingPolicy[]
): UnderlyingComplianceIssue[] {
  const issues: UnderlyingComplianceIssue[] = [];

  for (const underlying of underlyingPolicies) {
    const umbrellaEff = new Date(umbrellaEffective);
    const umbrellaExp = new Date(umbrellaExpiration);
    const underlyingEff = new Date(underlying.effective_date);
    const underlyingExp = new Date(underlying.expiration_date);

    // Check if underlying expires before umbrella
    if (underlyingExp < umbrellaExp) {
      issues.push({
        type: 'term_mismatch',
        severity: 'high',
        underlying_type: underlying.type,
        message: `${getUnderlyingTypeLabel(underlying.type)} expires before umbrella (${underlying.expiration_date} vs ${umbrellaExpiration})`,
      });
    }

    // Check if underlying starts after umbrella
    if (underlyingEff > umbrellaEff) {
      issues.push({
        type: 'term_mismatch',
        severity: 'medium',
        underlying_type: underlying.type,
        message: `${getUnderlyingTypeLabel(underlying.type)} starts after umbrella effective date`,
      });
    }
  }

  return issues;
}

/**
 * Checks if underlying limits meet umbrella requirements
 */
export function checkLimitCompliance(
  requirements: UnderlyingRequirements,
  underlyingPolicies: UnderlyingPolicy[]
): UnderlyingComplianceIssue[] {
  const issues: UnderlyingComplianceIssue[] = [];

  // Check GL
  if (requirements.gl_each_occurrence) {
    const glPolicy = underlyingPolicies.find((p) => p.type === 'general_liability');
    if (!glPolicy) {
      issues.push({
        type: 'missing_underlying',
        severity: 'high',
        underlying_type: 'general_liability',
        message: 'Required General Liability underlying not scheduled',
      });
    } else if (
      glPolicy.limits.each_occurrence &&
      glPolicy.limits.each_occurrence < requirements.gl_each_occurrence
    ) {
      issues.push({
        type: 'limit_insufficient',
        severity: 'high',
        underlying_type: 'general_liability',
        message: `GL limit ${formatUmbrellaLimit(glPolicy.limits.each_occurrence)} below required ${formatUmbrellaLimit(requirements.gl_each_occurrence)}`,
      });
    }
  }

  // Check Auto
  if (requirements.auto_liability) {
    const autoPolicy = underlyingPolicies.find((p) => p.type === 'commercial_auto');
    if (!autoPolicy) {
      issues.push({
        type: 'missing_underlying',
        severity: 'high',
        underlying_type: 'commercial_auto',
        message: 'Required Commercial Auto underlying not scheduled',
      });
    } else if (autoPolicy.limits.auto_csl && autoPolicy.limits.auto_csl < requirements.auto_liability) {
      issues.push({
        type: 'limit_insufficient',
        severity: 'high',
        underlying_type: 'commercial_auto',
        message: `Auto limit ${formatUmbrellaLimit(autoPolicy.limits.auto_csl)} below required ${formatUmbrellaLimit(requirements.auto_liability)}`,
      });
    }
  }

  // Check Employer's Liability
  if (requirements.el_per_accident) {
    const elPolicy = underlyingPolicies.find((p) => p.type === 'employers_liability');
    if (!elPolicy) {
      issues.push({
        type: 'missing_underlying',
        severity: 'medium',
        underlying_type: 'employers_liability',
        message: "Employer's Liability underlying not scheduled",
      });
    } else if (
      elPolicy.limits.el_per_accident &&
      elPolicy.limits.el_per_accident < requirements.el_per_accident
    ) {
      issues.push({
        type: 'limit_insufficient',
        severity: 'medium',
        underlying_type: 'employers_liability',
        message: `EL limit ${formatUmbrellaLimit(elPolicy.limits.el_per_accident)} below required ${formatUmbrellaLimit(requirements.el_per_accident)}`,
      });
    }
  }

  return issues;
}
