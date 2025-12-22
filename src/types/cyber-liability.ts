/**
 * Cyber Liability Policy Types
 *
 * First-party and third-party cyber coverage:
 * - Data Breach Response
 * - Network Security Liability
 * - Privacy Liability
 * - Media Liability
 * - Cyber Extortion
 * - Business Interruption
 * - System Failure
 * - Social Engineering
 * - Regulatory Defense
 */

import { Address } from './address';
import { EvidenceReference, ExtractionStatus, FieldConfidence } from './extraction-common';

// =============================================================================
// POLICY FORM & STRUCTURE
// =============================================================================

export type CyberPolicyForm = 'claims_made' | 'occurrence';

export type CyberCarrierType =
  | 'admitted'
  | 'non_admitted'
  | 'surplus_lines';

// =============================================================================
// FIRST-PARTY COVERAGES
// =============================================================================

export interface DataBreachResponseCoverage {
  included: boolean;
  limit?: number;
  sublimit?: number;
  deductible?: number;

  // Component sublimits
  forensic_investigation?: {
    included: boolean;
    limit?: number;
  };

  notification_costs?: {
    included: boolean;
    limit?: number;
    per_person_cost_cap?: number;
  };

  credit_monitoring?: {
    included: boolean;
    limit?: number;
    duration_months?: number;
  };

  call_center?: {
    included: boolean;
    limit?: number;
  };

  public_relations?: {
    included: boolean;
    limit?: number;
  };

  legal_services?: {
    included: boolean;
    limit?: number;
  };

  // Breach coach / incident response
  breach_coach?: {
    included: boolean;
    panel_required?: boolean;
    pre_approved_vendors?: string[];
  };
}

export interface CyberExtortionCoverage {
  included: boolean;
  limit?: number;
  sublimit?: number;
  deductible?: number;

  // Ransomware specifics
  ransom_payment?: {
    included: boolean;
    limit?: number;
    cryptocurrency_allowed?: boolean;
  };

  extortion_expenses?: {
    included: boolean;
    limit?: number;
  };

  // Threat types covered
  threat_types?: ('ransomware' | 'data_theft_threat' | 'dos_threat' | 'reputation_threat')[];

  // Waiting period
  waiting_period_hours?: number;
}

export interface BusinessInterruptionCoverage {
  included: boolean;
  limit?: number;
  sublimit?: number;
  deductible?: number;

  // Waiting period
  waiting_period_hours: number;

  // Period of restoration
  restoration_period_days?: number;
  extended_period_days?: number;

  // Coverage basis
  coverage_basis?: 'actual_loss' | 'daily_limit';
  daily_limit?: number;

  // Dependent business
  dependent_business?: {
    included: boolean;
    limit?: number;
    waiting_period_hours?: number;
  };

  // System failure (non-malicious)
  system_failure?: {
    included: boolean;
    limit?: number;
    waiting_period_hours?: number;
  };

  // Contingent BI (third-party vendor)
  contingent_bi?: {
    included: boolean;
    limit?: number;
    covered_vendors?: string[];
  };

  // Extra expense
  extra_expense?: {
    included: boolean;
    limit?: number;
  };

  // Forensic accounting
  forensic_accounting?: {
    included: boolean;
    limit?: number;
  };
}

export interface DataRestorationCoverage {
  included: boolean;
  limit?: number;
  sublimit?: number;
  deductible?: number;

  // What's covered
  data_recreation?: boolean;
  software_restoration?: boolean;
  hardware_replacement?: boolean;

  // Bricking coverage
  bricking_coverage?: {
    included: boolean;
    limit?: number;
  };
}

export interface SocialEngineeringCoverage {
  included: boolean;
  limit?: number;
  sublimit?: number;
  deductible?: number;

  // Types covered
  funds_transfer_fraud?: boolean;
  invoice_manipulation?: boolean;
  vendor_impersonation?: boolean;
  executive_impersonation?: boolean;

  // Verification requirements
  callback_verification_required?: boolean;
  dual_authorization_required?: boolean;

  // Timing
  discovery_period_days?: number;
}

export interface CyberCrimeCoverage {
  included: boolean;
  limit?: number;
  sublimit?: number;
  deductible?: number;

  // Types
  computer_fraud?: boolean;
  funds_transfer_fraud?: boolean;
  telecommunications_fraud?: boolean;

  // Cryptojacking
  cryptojacking?: {
    included: boolean;
    limit?: number;
  };
}

export interface FirstPartyCoverages {
  data_breach_response: DataBreachResponseCoverage;
  cyber_extortion: CyberExtortionCoverage;
  business_interruption: BusinessInterruptionCoverage;
  data_restoration: DataRestorationCoverage;
  social_engineering?: SocialEngineeringCoverage;
  cyber_crime?: CyberCrimeCoverage;

  // Reputational harm
  reputational_harm?: {
    included: boolean;
    limit?: number;
    waiting_period_days?: number;
  };
}

// =============================================================================
// THIRD-PARTY COVERAGES
// =============================================================================

export interface NetworkSecurityLiabilityCoverage {
  included: boolean;
  limit?: number;
  sublimit?: number;
  deductible?: number;

  // Covered events
  unauthorized_access?: boolean;
  denial_of_service?: boolean;
  malware_transmission?: boolean;

  // Defense costs
  defense_costs: 'inside_limits' | 'outside_limits';
}

export interface PrivacyLiabilityCoverage {
  included: boolean;
  limit?: number;
  sublimit?: number;
  deductible?: number;

  // Types of claims
  negligent_disclosure?: boolean;
  failure_to_protect?: boolean;
  wrongful_collection?: boolean;

  // Regulatory
  regulatory_defense?: {
    included: boolean;
    limit?: number;
  };

  regulatory_fines?: {
    included: boolean;
    limit?: number;
    where_insurable?: boolean;
  };

  pci_dss_fines?: {
    included: boolean;
    limit?: number;
  };

  // Defense costs
  defense_costs: 'inside_limits' | 'outside_limits';
}

export interface MediaLiabilityCoverage {
  included: boolean;
  limit?: number;
  sublimit?: number;
  deductible?: number;

  // Types
  defamation?: boolean;
  copyright_infringement?: boolean;
  trademark_infringement?: boolean;
  invasion_of_privacy?: boolean;

  // Digital only or all media
  digital_only?: boolean;

  // Defense costs
  defense_costs: 'inside_limits' | 'outside_limits';
}

export interface TechnologyEOCoverage {
  included: boolean;
  limit?: number;
  sublimit?: number;
  deductible?: number;

  // Professional services errors
  professional_services_covered?: string[];

  // Defense costs
  defense_costs: 'inside_limits' | 'outside_limits';
}

export interface ThirdPartyCoverages {
  network_security_liability: NetworkSecurityLiabilityCoverage;
  privacy_liability: PrivacyLiabilityCoverage;
  media_liability?: MediaLiabilityCoverage;
  technology_eo?: TechnologyEOCoverage;
}

// =============================================================================
// CLAIMS-MADE SPECIFICS
// =============================================================================

export interface ClaimsMadeProvisions {
  retroactive_date?: string;
  full_prior_acts: boolean;

  // Continuity
  continuity_date?: string;
  pending_prior_date?: string;

  // ERP / Tail
  erp_available: boolean;
  basic_erp_days?: number;

  supplemental_erp_options?: {
    duration_months: number;
    premium_percent?: number;
    deadline_days?: number;
  }[];

  // Non-renewal provisions
  automatic_erp_on_nonrenewal?: boolean;
}

// =============================================================================
// LIMITS & DEDUCTIBLES
// =============================================================================

export interface CyberLimits {
  // Policy aggregate
  policy_aggregate: number;

  // Per occurrence / per claim
  per_occurrence_limit?: number;
  per_claim_limit?: number;

  // First-party sublimits
  first_party_aggregate?: number;

  // Third-party sublimits
  third_party_aggregate?: number;

  // Defense costs
  defense_costs_position: 'inside_limits' | 'outside_limits' | 'varies_by_coverage';
}

export interface CyberDeductibles {
  // Standard
  per_claim_deductible: number;

  // By coverage (if different)
  breach_response_deductible?: number;
  business_interruption_deductible?: number;
  extortion_deductible?: number;
  social_engineering_deductible?: number;
  liability_deductible?: number;

  // Retention
  retention_type?: 'deductible' | 'sir';

  // Waiting periods (expressed as deductibles for BI)
  bi_waiting_period_hours?: number;
  system_failure_waiting_period_hours?: number;
}

// =============================================================================
// EXCLUSIONS & ENDORSEMENTS
// =============================================================================

export interface CyberEndorsement {
  endorsement_number: string;
  endorsement_name: string;
  form_number?: string;
  edition_date?: string;

  endorsement_type: 'coverage_extension' | 'coverage_restriction' | 'exclusion' | 'condition' | 'sublimit';

  high_impact: boolean;
  impact_description?: string;
}

export const COMMON_CYBER_EXCLUSIONS = [
  'acts_of_war',
  'terrorism',
  'infrastructure_failure',
  'prior_known_incidents',
  'intentional_acts',
  'bodily_injury',
  'property_damage',
  'contractual_liability',
  'patent_infringement',
  'trade_secret',
  'antitrust',
  'employment_practices',
  'securities',
  'erisa',
  'government_action',
  'nuclear',
  'pollution',
  'unencrypted_device',
  'failure_to_patch',
] as const;

export type CommonCyberExclusion = typeof COMMON_CYBER_EXCLUSIONS[number];

// =============================================================================
// INCIDENT RESPONSE PANEL
// =============================================================================

export interface IncidentResponsePanel {
  breach_coach_required: boolean;
  breach_coach_firms?: string[];

  forensic_vendors?: string[];
  notification_vendors?: string[];
  pr_firms?: string[];
  legal_firms?: string[];
  credit_monitoring_vendors?: string[];

  // Pre-approval requirements
  pre_approval_required?: boolean;
  pre_approval_threshold?: number;

  // Hotline
  claims_hotline?: string;
  incident_hotline?: string;
}

// =============================================================================
// PREMIUM
// =============================================================================

export interface CyberPremium {
  total_annual_premium: number;

  // If broken down
  first_party_premium?: number;
  third_party_premium?: number;

  // Adjustments
  credits?: {
    description: string;
    amount?: number;
    percentage?: number;
  }[];

  surcharges?: {
    description: string;
    amount?: number;
    percentage?: number;
  }[];

  // Taxes and fees
  taxes_and_fees?: number;

  // Payment
  minimum_earned_premium?: number;
  deposit_premium?: number;
}

// =============================================================================
// MAIN EXTRACTED DATA STRUCTURE
// =============================================================================

export interface CyberLiabilityExtractedData {
  // Policy identification
  policy_number: string;
  policy_period: {
    effective_date: string;
    expiration_date: string;
  };

  // Insured
  named_insured: {
    name: string;
    address?: Address;
    website?: string;
    industry?: string;
  };

  // Policy form
  policy_form: CyberPolicyForm;
  carrier_type: CyberCarrierType;

  // Limits
  limits: CyberLimits;

  // Deductibles
  deductibles: CyberDeductibles;

  // First-party coverages
  first_party: FirstPartyCoverages;

  // Third-party coverages
  third_party: ThirdPartyCoverages;

  // Claims-made provisions
  claims_made?: ClaimsMadeProvisions;

  // Endorsements
  endorsements: CyberEndorsement[];

  // Known exclusions
  notable_exclusions?: CommonCyberExclusion[];

  // Incident response
  incident_response?: IncidentResponsePanel;

  // Premium
  premium: CyberPremium;

  // Extraction metadata
  extraction_metadata: {
    document_source: string;
    extraction_date: string;
    extraction_version: string;
    confidence_score?: number;
  };
}

// =============================================================================
// DATABASE ENTITY
// =============================================================================

export interface CyberLiabilityDetails {
  id: string;
  policy_id: string;
  extracted_data: CyberLiabilityExtractedData;

  // Field-level extraction status
  field_status: Record<string, ExtractionStatus>;
  field_confidence: Record<string, FieldConfidence>;

  // Evidence references
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

export function hasCyberCoverage(data: CyberLiabilityExtractedData | null | undefined): boolean {
  return Boolean(data && data.policy_number);
}

export function hasFirstPartyCoverage(data: CyberLiabilityExtractedData): boolean {
  const fp = data.first_party;
  return Boolean(
    fp.data_breach_response?.included ||
    fp.cyber_extortion?.included ||
    fp.business_interruption?.included ||
    fp.data_restoration?.included ||
    fp.social_engineering?.included
  );
}

export function hasThirdPartyCoverage(data: CyberLiabilityExtractedData): boolean {
  const tp = data.third_party;
  return Boolean(
    tp.network_security_liability?.included ||
    tp.privacy_liability?.included ||
    tp.media_liability?.included ||
    tp.technology_eo?.included
  );
}

export function hasSocialEngineering(data: CyberLiabilityExtractedData): boolean {
  return Boolean(data.first_party.social_engineering?.included);
}

export function hasRansomwareCoverage(data: CyberLiabilityExtractedData): boolean {
  return Boolean(
    data.first_party.cyber_extortion?.included &&
    data.first_party.cyber_extortion?.ransom_payment?.included
  );
}

export function getHighImpactEndorsements(endorsements: CyberEndorsement[]): CyberEndorsement[] {
  return endorsements.filter(e => e.high_impact);
}

export function getExclusionEndorsements(endorsements: CyberEndorsement[]): CyberEndorsement[] {
  return endorsements.filter(e => e.endorsement_type === 'exclusion');
}

export function isClaimsMadePolicy(data: CyberLiabilityExtractedData): boolean {
  return data.policy_form === 'claims_made';
}

export function hasERPAvailable(data: CyberLiabilityExtractedData): boolean {
  return Boolean(data.claims_made?.erp_available);
}
