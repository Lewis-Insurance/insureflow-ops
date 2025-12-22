/**
 * Professional Liability / Errors & Omissions (E&O) Policy Types
 * 
 * Standalone E&O policy types for extraction and management.
 * E&O policies are almost always claims-made and require special attention to:
 * - Retroactive dates (prior acts coverage)
 * - Extended Reporting Period (ERP/Tail) options
 * - Defense costs position (inside/outside limits)
 * - Deductible application to defense costs
 */

// =============================================================================
// PROFESSIONAL TYPE ENUMS
// =============================================================================

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

export type PolicyForm = 'claims_made' | 'occurrence';
export type DefenseCostsPosition = 'inside_limits' | 'outside_limits';
export type DeductibleType = 'deductible' | 'sir' | 'none';
export type TransactionType = 'quote' | 'bound' | 'issued' | 'renewal' | 'endorsement' | 'cancel';
export type ClaimStatus = 'open' | 'closed' | 'settled' | 'denied';

// =============================================================================
// MAIN E&O POLICY DETAILS
// =============================================================================

export interface EOPolicyDetails {
  id: string;
  policy_id: string;

  // Policy Identity
  carrier_name: string | null;
  carrier_naic: string | null;
  policy_number: string | null;
  transaction_type: TransactionType | null;
  named_insured: string;
  dba: string | null;
  fein: string | null;
  mailing_address_street: string | null;
  mailing_address_city: string | null;
  mailing_address_state: string | null;
  mailing_address_zip: string | null;

  // Dates
  effective_date: string | null; // ISO date string
  expiration_date: string | null; // ISO date string
  issue_date: string | null; // ISO date string

  // Professional Type
  professional_type: ProfessionalLiabilityType | null;
  covered_services: string[];

  // Policy Form (almost always claims-made)
  policy_form: PolicyForm;

  // Claims-Made Specifics (CRITICAL)
  retroactive_date: string | null; // ISO date string
  full_prior_acts: boolean;
  continuity_date: string | null; // ISO date string
  pending_prior_date: string | null; // ISO date string

  // Extended Reporting Period (ERP / Tail)
  erp_available: boolean;
  basic_erp_days: number | null;
  supplemental_erp_available: boolean;
  supplemental_erp_options: ERPOption[];
  erp_purchased: boolean;
  erp_purchased_duration_months: number | null;
  erp_purchased_premium: number | null;

  // Limits
  per_claim_limit: number | null;
  aggregate_limit: number | null;
  defense_costs: DefenseCostsPosition | null;

  // Deductible / Retention
  deductible_type: DeductibleType | null;
  deductible_per_claim: number | null;
  deductible_aggregate: number | null;
  deductible_applies_to_defense: boolean;

  // Underwriting Information
  years_experience: number | null;
  professionals_count: number | null;
  gross_revenue: number | null;
  prior_claims_last_5_years: number | null;

  // Premium
  total_premium: number | null;
  minimum_premium: number | null;
  policy_fee: number | null;
  state_taxes: number | null;

  // Evidence tracking
  evidence_ids: string[];
  extraction_confidence: number | null;
  extraction_status: ExtractionConfidence | null;

  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface ERPOption {
  duration_months: number;
  premium_percent?: number; // Percent of annual premium
  deadline_days?: number; // Days after expiration to purchase
}

export type ExtractionConfidence =
  | 'AUTO_APPLIED'
  | 'NEEDS_REVIEW'
  | 'NEEDS_VERIFICATION'
  | 'LOW_CONFIDENCE'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'MANUAL';

// =============================================================================
// E&O EXCLUSIONS
// =============================================================================

export interface EOExclusion {
  id: string;
  policy_id: string;
  exclusion_type: string;
  description: string;
  form_number: string | null;
  edition_date: string | null; // ISO date string
  is_standard_exclusion: boolean;
  is_high_impact: boolean;
  evidence_ids: string[];
  extraction_confidence: number | null;
  extraction_status: ExtractionConfidence | null;
  created_at: string;
  updated_at: string;
}

export interface EOExclusionCreateInput {
  policy_id: string;
  exclusion_type: string;
  description: string;
  form_number?: string;
  edition_date?: string;
  is_standard_exclusion?: boolean;
  is_high_impact?: boolean;
}

// =============================================================================
// E&O ENDORSEMENTS
// =============================================================================

export interface EOEndorsement {
  id: string;
  policy_id: string;
  form_number: string | null;
  title: string;
  edition_date: string | null; // ISO date string
  effective_date: string | null; // ISO date string
  description: string | null;
  category: string | null;
  is_limitation: boolean;
  is_enhancement: boolean;
  evidence_ids: string[];
  extraction_confidence: number | null;
  extraction_status: ExtractionConfidence | null;
  created_at: string;
  updated_at: string;
}

export interface EOEndorsementCreateInput {
  policy_id: string;
  form_number?: string;
  title: string;
  edition_date?: string;
  effective_date?: string;
  description?: string;
  category?: string;
  is_limitation?: boolean;
  is_enhancement?: boolean;
}

// =============================================================================
// E&O PRIOR ACTS / CLAIMS HISTORY
// =============================================================================

export interface EOPriorAct {
  id: string;
  policy_id: string;
  act_date: string | null; // ISO date string
  description: string | null;
  claim_made_date: string | null; // ISO date string
  claim_amount: number | null;
  claim_status: ClaimStatus | null;
  is_reported: boolean;
  evidence_ids: string[];
  extraction_confidence: number | null;
  extraction_status: ExtractionConfidence | null;
  created_at: string;
  updated_at: string;
}

export interface EOPriorActCreateInput {
  policy_id: string;
  act_date?: string;
  description?: string;
  claim_made_date?: string;
  claim_amount?: number;
  claim_status?: ClaimStatus;
  is_reported?: boolean;
}

// =============================================================================
// E&O EVIDENCE CATALOG
// =============================================================================

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
}

export interface EvidenceEntry {
  evidenceId: string;
  sourceType: 'key_value' | 'table_cell' | 'text_span' | 'layout_element';
  label: string | null;
  value: string;
  normalizedValue: string;
  confidence: number;
  pageNumber: number;
  boundingBox: BoundingBox | null;
  tableContext?: {
    tableIndex: number;
    rowIndex: number;
    columnIndex: number;
    columnHeader?: string;
    rowHeader?: string;
  };
  tags: string[];
}

export interface EOEvidenceCatalog {
  id: string;
  policy_id: string;
  document_id: string | null;
  evidence_entries: Record<string, EvidenceEntry>;
  evidence_by_field: Record<string, string[]>;
  claims_made_evidence: EvidenceEntry[];
  erp_evidence: EvidenceEntry[];
  limits_evidence: EvidenceEntry[];
  azure_raw_response: any | null;
  azure_model_id: string;
  azure_processing_time_ms: number | null;
  azure_page_count: number | null;
  azure_avg_confidence: number | null;
  total_entries: number;
  entries_by_source_type: Record<string, number>;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// E&O EXTRACTION JOB
// =============================================================================

export interface EOExtractionJob {
  id: string;
  policy_id: string;
  document_id: string | null;
  status: 'pending' | 'ocr_processing' | 'extracting' | 'completed' | 'failed';
  ocr_started_at: string | null;
  ocr_completed_at: string | null;
  extraction_started_at: string | null;
  extraction_completed_at: string | null;
  azure_operation_id: string | null;
  azure_model_id: string;
  llm_model: string;
  llm_tokens_input: number | null;
  llm_tokens_output: number | null;
  llm_latency_ms: number | null;
  fields_extracted: number;
  fields_auto_applied: number;
  fields_needs_review: number;
  fields_not_found: number;
  fields_conflict: number;
  overall_confidence: number | null;
  error_message: string | null;
  error_stack: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// CREATE/UPDATE INPUTS
// =============================================================================

export interface EOPolicyDetailsCreateInput {
  policy_id: string;
  carrier_name?: string;
  carrier_naic?: string;
  policy_number?: string;
  transaction_type?: TransactionType;
  named_insured: string;
  dba?: string;
  fein?: string;
  mailing_address_street?: string;
  mailing_address_city?: string;
  mailing_address_state?: string;
  mailing_address_zip?: string;
  effective_date?: string;
  expiration_date?: string;
  issue_date?: string;
  professional_type?: ProfessionalLiabilityType;
  covered_services?: string[];
  policy_form?: PolicyForm;
  retroactive_date?: string;
  full_prior_acts?: boolean;
  continuity_date?: string;
  pending_prior_date?: string;
  erp_available?: boolean;
  basic_erp_days?: number;
  supplemental_erp_available?: boolean;
  supplemental_erp_options?: ERPOption[];
  erp_purchased?: boolean;
  erp_purchased_duration_months?: number;
  erp_purchased_premium?: number;
  per_claim_limit?: number;
  aggregate_limit?: number;
  defense_costs?: DefenseCostsPosition;
  deductible_type?: DeductibleType;
  deductible_per_claim?: number;
  deductible_aggregate?: number;
  deductible_applies_to_defense?: boolean;
  years_experience?: number;
  professionals_count?: number;
  gross_revenue?: number;
  prior_claims_last_5_years?: number;
  total_premium?: number;
  minimum_premium?: number;
  policy_fee?: number;
  state_taxes?: number;
}

export interface EOPolicyDetailsUpdateInput {
  carrier_name?: string;
  carrier_naic?: string;
  policy_number?: string;
  transaction_type?: TransactionType;
  named_insured?: string;
  dba?: string;
  fein?: string;
  mailing_address_street?: string;
  mailing_address_city?: string;
  mailing_address_state?: string;
  mailing_address_zip?: string;
  effective_date?: string;
  expiration_date?: string;
  issue_date?: string;
  professional_type?: ProfessionalLiabilityType;
  covered_services?: string[];
  policy_form?: PolicyForm;
  retroactive_date?: string;
  full_prior_acts?: boolean;
  continuity_date?: string;
  pending_prior_date?: string;
  erp_available?: boolean;
  basic_erp_days?: number;
  supplemental_erp_available?: boolean;
  supplemental_erp_options?: ERPOption[];
  erp_purchased?: boolean;
  erp_purchased_duration_months?: number;
  erp_purchased_premium?: number;
  per_claim_limit?: number;
  aggregate_limit?: number;
  defense_costs?: DefenseCostsPosition;
  deductible_type?: DeductibleType;
  deductible_per_claim?: number;
  deductible_aggregate?: number;
  deductible_applies_to_defense?: boolean;
  years_experience?: number;
  professionals_count?: number;
  gross_revenue?: number;
  prior_claims_last_5_years?: number;
  total_premium?: number;
  minimum_premium?: number;
  policy_fee?: number;
  state_taxes?: number;
}

