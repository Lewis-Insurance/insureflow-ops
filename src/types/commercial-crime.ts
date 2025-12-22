/**
 * Commercial Crime / Fidelity Bond Types
 *
 * Covers losses from dishonest acts and criminal activity:
 * - Employee Dishonesty / Fidelity
 * - Forgery or Alteration
 * - Computer Fraud
 * - Funds Transfer Fraud
 * - Money & Securities
 * - Theft/Disappearance/Destruction
 * - ERISA Fidelity
 */

import { Address } from './address';
import { EvidenceReference, ExtractionStatus, FieldConfidence } from './extraction-common';

// =============================================================================
// POLICY FORM TYPES
// =============================================================================

export type CrimeFormType =
  | 'discovery_form'      // Covers losses discovered during policy period
  | 'loss_sustained_form' // Covers losses occurring during policy period
  | 'hybrid';

export type CrimePolicyType =
  | 'crime_policy'
  | 'fidelity_bond'
  | 'erisa_bond'
  | 'financial_institution_bond'
  | 'public_official_bond';

// =============================================================================
// INSURING AGREEMENTS (COVERAGES)
// =============================================================================

export type CrimeCoverageType =
  | 'employee_dishonesty'
  | 'forgery_alteration'
  | 'inside_premises_theft'
  | 'inside_premises_robbery'
  | 'outside_premises'
  | 'computer_fraud'
  | 'funds_transfer_fraud'
  | 'money_orders_counterfeit'
  | 'credit_card_fraud'
  | 'erisa_fidelity'
  | 'social_engineering'
  | 'client_property'
  | 'impersonation_fraud'
  | 'telephone_fraud'
  | 'invoice_manipulation';

export const CRIME_COVERAGE_LABELS: Record<CrimeCoverageType, string> = {
  employee_dishonesty: 'Employee Dishonesty / Fidelity',
  forgery_alteration: 'Forgery or Alteration',
  inside_premises_theft: 'Inside the Premises - Theft of Money & Securities',
  inside_premises_robbery: 'Inside the Premises - Robbery/Safe Burglary',
  outside_premises: 'Outside the Premises',
  computer_fraud: 'Computer Fraud',
  funds_transfer_fraud: 'Funds Transfer Fraud',
  money_orders_counterfeit: 'Money Orders & Counterfeit Money',
  credit_card_fraud: 'Credit Card Fraud',
  erisa_fidelity: 'ERISA Fidelity',
  social_engineering: 'Social Engineering Fraud',
  client_property: 'Client Property',
  impersonation_fraud: 'Impersonation Fraud',
  telephone_fraud: 'Telephone Fraud',
  invoice_manipulation: 'Invoice Manipulation',
};

// =============================================================================
// INDIVIDUAL COVERAGE DETAILS
// =============================================================================

export interface EmployeeDishonestyCoverage {
  included: boolean;
  limit: number;
  deductible: number;

  // Form basis
  coverage_form: 'blanket' | 'scheduled' | 'name_schedule' | 'position_schedule';

  // If scheduled
  scheduled_employees?: {
    name?: string;
    position?: string;
    limit: number;
  }[];

  // Definition of employee
  includes_leased_employees?: boolean;
  includes_volunteers?: boolean;
  includes_directors?: boolean;
  includes_seasonal?: boolean;

  // ERISA-related
  erisa_plan_covered?: boolean;

  // Prior acts
  prior_dishonesty_date?: string;

  // Cancellation as to individual
  individual_cancellation_provision?: boolean;
}

export interface ForgeryAlterationCoverage {
  included: boolean;
  limit: number;
  deductible: number;

  // What's covered
  outgoing_checks?: boolean;
  incoming_checks?: boolean;
  promissory_notes?: boolean;
  drafts?: boolean;
  bills_of_exchange?: boolean;

  // Third-party forgery
  third_party_forgery?: boolean;
}

export interface InsidePremisesCoverage {
  included: boolean;

  // Theft coverage
  theft?: {
    included: boolean;
    limit: number;
    deductible: number;
    money_limit?: number;
    securities_limit?: number;
  };

  // Robbery/Safe Burglary
  robbery_safe_burglary?: {
    included: boolean;
    limit: number;
    deductible: number;
    other_property_limit?: number;
  };
}

export interface OutsidePremisesCoverage {
  included: boolean;
  limit: number;
  deductible: number;

  // Coverage for money/securities
  money_limit?: number;
  securities_limit?: number;
  other_property_limit?: number;

  // Messenger definition
  messenger_includes_armored_car?: boolean;
}

export interface ComputerFraudCoverage {
  included: boolean;
  limit: number;
  deductible: number;

  // What's covered
  theft_of_money?: boolean;
  theft_of_securities?: boolean;
  theft_of_property?: boolean;

  // Direct vs indirect
  direct_loss_only?: boolean;

  // Virus/malware
  virus_coverage?: boolean;
}

export interface FundsTransferFraudCoverage {
  included: boolean;
  limit: number;
  deductible: number;

  // Transfer types
  wire_transfer?: boolean;
  ach_transfer?: boolean;

  // Verification
  callback_verification_required?: boolean;
  dual_authorization_required?: boolean;
}

export interface SocialEngineeringCoverage {
  included: boolean;
  limit: number;
  deductible: number;

  // What triggers coverage
  impersonation_of_vendor?: boolean;
  impersonation_of_executive?: boolean;
  impersonation_of_client?: boolean;

  // Verification requirements
  verification_procedures_required?: boolean;
  verification_procedure_description?: string;

  // Discovery period
  discovery_period_days?: number;
}

export interface ClientPropertyCoverage {
  included: boolean;
  limit: number;
  deductible: number;

  // What client property
  client_money?: boolean;
  client_securities?: boolean;
  client_other_property?: boolean;

  // While in custody
  includes_premises?: boolean;
  includes_transit?: boolean;
}

export interface ERISAFidelityCoverage {
  included: boolean;
  limit: number;
  deductible: number;

  // Plans covered
  plan_names?: string[];
  all_plans_covered?: boolean;

  // Fiduciary requirement
  fiduciary_dishonesty?: boolean;

  // Limit basis (DOL requires 10% of plan assets or $500K minimum)
  meets_dol_requirements?: boolean;
}

// =============================================================================
// AGGREGATE STRUCTURE
// =============================================================================

export interface CrimeCoverages {
  employee_dishonesty?: EmployeeDishonestyCoverage;
  forgery_alteration?: ForgeryAlterationCoverage;
  inside_premises?: InsidePremisesCoverage;
  outside_premises?: OutsidePremisesCoverage;
  computer_fraud?: ComputerFraudCoverage;
  funds_transfer_fraud?: FundsTransferFraudCoverage;
  social_engineering?: SocialEngineeringCoverage;
  client_property?: ClientPropertyCoverage;
  erisa_fidelity?: ERISAFidelityCoverage;
}

// =============================================================================
// CONDITIONS & DEFINITIONS
// =============================================================================

export interface CrimeConditions {
  // Discovery period
  discovery_period_after_policy_days?: number;

  // Loss sustained during (for loss sustained forms)
  loss_sustained_retroactive_date?: string;

  // Territory
  territory?: 'usa' | 'usa_and_canada' | 'worldwide';

  // Ownership changes
  acquisition_provision?: {
    automatic_days?: number;
    premium_threshold?: number;
  };

  // Joint insured
  joint_insured_provision?: boolean;

  // Interrelation of coverage parts
  non_cumulation?: boolean;

  // Other insurance
  other_insurance?: 'primary' | 'excess' | 'contributory';
}

export interface CrimeDefinitions {
  // Employee definition
  employee_includes?: string[];
  employee_excludes?: string[];

  // Custodian definition
  custodian_definition?: string;

  // Messenger definition
  messenger_definition?: string;

  // Computer system definition
  computer_system_definition?: string;
}

// =============================================================================
// ENDORSEMENTS & EXCLUSIONS
// =============================================================================

export interface CrimeEndorsement {
  endorsement_number: string;
  endorsement_name: string;
  form_number?: string;
  edition_date?: string;

  endorsement_type: 'coverage_extension' | 'coverage_restriction' | 'exclusion' | 'condition' | 'sublimit' | 'additional_insured';

  high_impact: boolean;
  impact_description?: string;

  // Limit/deductible changes
  new_limit?: number;
  new_deductible?: number;
  applies_to_coverage?: CrimeCoverageType;
}

export const COMMON_CRIME_EXCLUSIONS = [
  'indirect_loss',
  'governmental_action',
  'legal_fees',
  'nuclear_hazard',
  'war',
  'inventory_shortages',
  'voluntary_parting',
  'trading_losses',
  'confidential_information',
  'proprietary_information',
  'income_program_manipulation',
  'authorized_access',
  'unidentified_third_party',
] as const;

export type CommonCrimeExclusion = typeof COMMON_CRIME_EXCLUSIONS[number];

// =============================================================================
// PREMIUM
// =============================================================================

export interface CrimePremium {
  total_annual_premium: number;

  // By coverage
  coverage_premiums?: {
    coverage: CrimeCoverageType;
    premium: number;
  }[];

  // Minimum premium
  minimum_premium?: number;
  deposit_premium?: number;

  // Audit
  subject_to_audit?: boolean;

  // Payment
  installments?: {
    due_date: string;
    amount: number;
  }[];
}

// =============================================================================
// MAIN EXTRACTED DATA STRUCTURE
// =============================================================================

export interface CommercialCrimeExtractedData {
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

  // Policy type and form
  policy_type: CrimePolicyType;
  form_type: CrimeFormType;

  // Overall limits
  policy_aggregate?: number;

  // Individual coverages
  coverages: CrimeCoverages;

  // Conditions
  conditions?: CrimeConditions;

  // Definitions
  definitions?: CrimeDefinitions;

  // Endorsements
  endorsements: CrimeEndorsement[];

  // Notable exclusions
  notable_exclusions?: CommonCrimeExclusion[];

  // Premium
  premium: CrimePremium;

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

export interface CommercialCrimeDetails {
  id: string;
  policy_id: string;
  extracted_data: CommercialCrimeExtractedData;

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

export function hasCrimeCoverage(data: CommercialCrimeExtractedData | null | undefined): boolean {
  return Boolean(data && data.policy_number);
}

export function hasEmployeeDishonesty(data: CommercialCrimeExtractedData): boolean {
  return Boolean(data.coverages.employee_dishonesty?.included);
}

export function hasComputerFraud(data: CommercialCrimeExtractedData): boolean {
  return Boolean(data.coverages.computer_fraud?.included);
}

export function hasFundsTransferFraud(data: CommercialCrimeExtractedData): boolean {
  return Boolean(data.coverages.funds_transfer_fraud?.included);
}

export function hasSocialEngineering(data: CommercialCrimeExtractedData): boolean {
  return Boolean(data.coverages.social_engineering?.included);
}

export function hasERISACoverage(data: CommercialCrimeExtractedData): boolean {
  return Boolean(data.coverages.erisa_fidelity?.included);
}

export function isDiscoveryForm(data: CommercialCrimeExtractedData): boolean {
  return data.form_type === 'discovery_form';
}

export function isLossSustainedForm(data: CommercialCrimeExtractedData): boolean {
  return data.form_type === 'loss_sustained_form';
}

export function getHighImpactEndorsements(endorsements: CrimeEndorsement[]): CrimeEndorsement[] {
  return endorsements.filter(e => e.high_impact);
}

export function getExclusionEndorsements(endorsements: CrimeEndorsement[]): CrimeEndorsement[] {
  return endorsements.filter(e => e.endorsement_type === 'exclusion');
}

export function getIncludedCoverages(coverages: CrimeCoverages): CrimeCoverageType[] {
  const included: CrimeCoverageType[] = [];

  if (coverages.employee_dishonesty?.included) included.push('employee_dishonesty');
  if (coverages.forgery_alteration?.included) included.push('forgery_alteration');
  if (coverages.inside_premises?.included) included.push('inside_premises_theft');
  if (coverages.outside_premises?.included) included.push('outside_premises');
  if (coverages.computer_fraud?.included) included.push('computer_fraud');
  if (coverages.funds_transfer_fraud?.included) included.push('funds_transfer_fraud');
  if (coverages.social_engineering?.included) included.push('social_engineering');
  if (coverages.client_property?.included) included.push('client_property');
  if (coverages.erisa_fidelity?.included) included.push('erisa_fidelity');

  return included;
}

export function getTotalLimit(coverages: CrimeCoverages): number {
  let total = 0;

  if (coverages.employee_dishonesty?.included) total = Math.max(total, coverages.employee_dishonesty.limit);
  if (coverages.forgery_alteration?.included) total = Math.max(total, coverages.forgery_alteration.limit);
  if (coverages.inside_premises?.theft?.included) total = Math.max(total, coverages.inside_premises.theft.limit);
  if (coverages.outside_premises?.included) total = Math.max(total, coverages.outside_premises.limit);
  if (coverages.computer_fraud?.included) total = Math.max(total, coverages.computer_fraud.limit);
  if (coverages.funds_transfer_fraud?.included) total = Math.max(total, coverages.funds_transfer_fraud.limit);

  return total;
}
