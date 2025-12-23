/**
 * Runtime Prompt Templates for Renewal Rate Watch
 * 
 * Evidence-backed, schema-driven prompts that:
 * - Never guess - NOT_FOUND if no evidence
 * - Require evidence_ids for all values
 * - Handle conflicts explicitly
 * - No new facts in reports/emails
 */

// =============================================================================
// SHARED TYPES (FieldResult primitive)
// =============================================================================

export interface FieldResult {
  status: 'FOUND' | 'NOT_FOUND' | 'CONFLICT' | 'NEEDS_VERIFICATION';
  value: string | number | Record<string, any> | null;
  display_value?: string;
  confidence?: number;
  evidence_ids: string[];
  conflict_candidates?: ConflictCandidate[];
}

export interface ConflictCandidate {
  value: string | number;
  evidence_ids: string[];
  reason: string;
}

// =============================================================================
// BUNDLE SNAPSHOT SCHEMA
// =============================================================================

export interface BundleSnapshot {
  bundle_id: string;
  bundle_role: 'CURRENT' | 'RENEWAL' | 'QUOTE';
  carrier_name: string | null;
  
  identity: {
    insured_name: FieldResult;
    carrier: FieldResult;
    policy_or_quote_number: FieldResult;
    effective_date: FieldResult;
    expiration_date: FieldResult;
  };
  
  premium: {
    term_premium: FieldResult;
    annual_premium?: FieldResult;
    fees: FieldResult;
    installment_amount?: FieldResult;
    billing_notes?: string;
  };
  
  coverages: CoverageItem[];
  
  schedules?: {
    vehicles?: ScheduleRow[];
    drivers?: ScheduleRow[];
    locations?: ScheduleRow[];
    items?: ScheduleRow[];
  };
  
  endorsements?: EndorsementItem[];
  
  unknowns: string[];
}

export interface CoverageItem {
  coverage_key: string;
  display_name: string;
  included_status: 'INCLUDED' | 'EXCLUDED' | 'UNKNOWN';
  limit?: FieldResult;
  deductible?: FieldResult;
  terms?: FieldResult;
  evidence_ids: string[];
}

export interface ScheduleRow {
  row_key: string;
  row_data: Record<string, FieldResult>;
  evidence_ids: string[];
}

export interface EndorsementItem {
  form_number: string;
  title: string;
  edition?: string;
  effective_date?: string;
  evidence_ids: string[];
}

// =============================================================================
// REPORT PACK SCHEMA
// =============================================================================

export interface ReportPack {
  title: string;
  subtitle: string;
  generated_date: string;
  
  executive_summary: string;
  
  renewal_change_summary: {
    current_premium: number | null;
    current_premium_display: string;
    renewal_premium: number | null;
    renewal_premium_display: string;
    change_amount: number | null;
    change_percent: number | null;
    change_direction: 'increase' | 'decrease' | 'unchanged' | 'unknown';
  };
  
  options_table_rows: OptionRow[];
  
  coverage_matrix: CoverageMatrixRow[];
  
  recommendation_section: {
    has_recommendation: boolean;
    recommendation_type: 'switch' | 'stay' | 'review_options' | null;
    recommendation_carrier?: string;
    recommendation_savings?: string;
    rationale: string;
  };
  
  items_to_verify: VerificationItem[];
  
  disclaimers: string[];
}

export interface OptionRow {
  carrier: string;
  is_renewal: boolean;
  term_premium: string;
  savings_vs_renewal: string;
  parity_score: string;
  key_differences: string[];
  recommendation_badge?: string;
}

export interface CoverageMatrixRow {
  coverage_key: string;
  display_name: string;
  current_terms: string;
  renewal_terms: string;
  quote_terms_by_carrier: Record<string, string>;
  notes?: string;
  has_difference: boolean;
}

export interface VerificationItem {
  field: string;
  reason: string;
  suggested_action: string;
}

// =============================================================================
// EMAIL DRAFT SCHEMA
// =============================================================================

export interface EmailDraft {
  subject: string;
  greeting_line: string;
  body_paragraphs: string[];
  bullets?: string[];
  next_steps: string[];
  items_to_confirm?: string[];
  closing_line: string;
  signature_block: string;
}

// =============================================================================
// JSON SCHEMAS FOR LLM
// =============================================================================

export const BUNDLE_SNAPSHOT_SCHEMA_JSON = {
  type: 'object',
  required: ['bundle_id', 'bundle_role', 'identity', 'premium', 'coverages', 'unknowns'],
  properties: {
    bundle_id: { type: 'string' },
    bundle_role: { type: 'string', enum: ['CURRENT', 'RENEWAL', 'QUOTE'] },
    carrier_name: { type: ['string', 'null'] },
    identity: {
      type: 'object',
      properties: {
        insured_name: { $ref: '#/$defs/FieldResult' },
        carrier: { $ref: '#/$defs/FieldResult' },
        policy_or_quote_number: { $ref: '#/$defs/FieldResult' },
        effective_date: { $ref: '#/$defs/FieldResult' },
        expiration_date: { $ref: '#/$defs/FieldResult' },
      },
    },
    premium: {
      type: 'object',
      properties: {
        term_premium: { $ref: '#/$defs/FieldResult' },
        fees: { $ref: '#/$defs/FieldResult' },
        installment_amount: { $ref: '#/$defs/FieldResult' },
      },
    },
    coverages: {
      type: 'array',
      items: {
        type: 'object',
        required: ['coverage_key', 'display_name', 'included_status', 'evidence_ids'],
        properties: {
          coverage_key: { type: 'string' },
          display_name: { type: 'string' },
          included_status: { type: 'string', enum: ['INCLUDED', 'EXCLUDED', 'UNKNOWN'] },
          limit: { $ref: '#/$defs/FieldResult' },
          deductible: { $ref: '#/$defs/FieldResult' },
          evidence_ids: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    unknowns: { type: 'array', items: { type: 'string' } },
  },
  $defs: {
    FieldResult: {
      type: 'object',
      required: ['status', 'evidence_ids'],
      properties: {
        status: { type: 'string', enum: ['FOUND', 'NOT_FOUND', 'CONFLICT', 'NEEDS_VERIFICATION'] },
        value: {},
        display_value: { type: 'string' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        evidence_ids: { type: 'array', items: { type: 'string' } },
        conflict_candidates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              value: {},
              evidence_ids: { type: 'array', items: { type: 'string' } },
              reason: { type: 'string' },
            },
          },
        },
      },
    },
  },
};

export const REPORT_PACK_SCHEMA_JSON = {
  type: 'object',
  required: ['title', 'executive_summary', 'renewal_change_summary', 'options_table_rows', 'recommendation_section', 'disclaimers'],
  properties: {
    title: { type: 'string' },
    subtitle: { type: 'string' },
    executive_summary: { type: 'string' },
    renewal_change_summary: {
      type: 'object',
      properties: {
        current_premium_display: { type: 'string' },
        renewal_premium_display: { type: 'string' },
        change_amount: { type: ['number', 'null'] },
        change_percent: { type: ['number', 'null'] },
        change_direction: { type: 'string', enum: ['increase', 'decrease', 'unchanged', 'unknown'] },
      },
    },
    options_table_rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          carrier: { type: 'string' },
          is_renewal: { type: 'boolean' },
          term_premium: { type: 'string' },
          savings_vs_renewal: { type: 'string' },
          parity_score: { type: 'string' },
          key_differences: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    recommendation_section: {
      type: 'object',
      properties: {
        has_recommendation: { type: 'boolean' },
        recommendation_type: { type: ['string', 'null'] },
        rationale: { type: 'string' },
      },
    },
    items_to_verify: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field: { type: 'string' },
          reason: { type: 'string' },
          suggested_action: { type: 'string' },
        },
      },
    },
    disclaimers: { type: 'array', items: { type: 'string' } },
  },
};

export const EMAIL_DRAFT_SCHEMA_JSON = {
  type: 'object',
  required: ['subject', 'greeting_line', 'body_paragraphs', 'next_steps', 'closing_line', 'signature_block'],
  properties: {
    subject: { type: 'string' },
    greeting_line: { type: 'string' },
    body_paragraphs: { type: 'array', items: { type: 'string' } },
    bullets: { type: 'array', items: { type: 'string' } },
    next_steps: { type: 'array', items: { type: 'string' } },
    items_to_confirm: { type: 'array', items: { type: 'string' } },
    closing_line: { type: 'string' },
    signature_block: { type: 'string' },
  },
};

// =============================================================================
// PROMPT TEMPLATES
// =============================================================================

export const BUNDLE_SNAPSHOT_SYSTEM_PROMPT = `You are a bundle snapshot mapping engine for a U.S. insurance agency (Lewis Insurance).

SCOPE
- You are given ONE bundle (CURRENT or RENEWAL or QUOTE for a specific carrier).
- Bundle contains one or more documents (dec pages, renewal offer, quote proposal, schedules, endorsements).
- Your job is to produce a normalized BundleSnapshot JSON that conforms to the schema provided.

NON-NEGOTIABLE RULES
1) NO GUESSING. If a value is not explicitly supported by evidence, mark status="NOT_FOUND".
2) EVIDENCE REQUIRED. Any value with status != "NOT_FOUND" MUST include evidence_ids (non-empty).
3) CONFLICTS. If there are multiple plausible values:
   - set status="CONFLICT"
   - provide conflict_candidates[] each with value + evidence_ids + reason
4) Output MUST be valid JSON only. No markdown. No commentary.
5) Do not compute savings or differences here. Only extract/normalize snapshot values.
6) Prefer dec pages and schedule tables over narrative text. Prefer totals labeled "Total Premium", "Policy Premium", "Term Premium".
7) If the document appears to be a billing page with installment amounts, do not treat "monthly" as term premium; capture it separately.
8) Normalize:
   - currency to numeric + display string
   - dates to ISO (YYYY-MM-DD) if possible
   - ded/limits to structured fields where feasible`;

export function buildBundleSnapshotUserPrompt(
  bundleContext: any,
  evidenceCatalog: any,
  extractedCandidates: any
): string {
  return `Create the BundleSnapshot for this bundle.

STRICT OUTPUT REQUIREMENTS
- Output MUST be valid JSON and MUST conform to target_output_schema.
- Do not output any keys not in the schema.
- Any field with a concrete value MUST include evidence_ids (non-empty).
- If insufficient evidence -> status="NOT_FOUND" and evidence_ids=[].
- If conflict -> status="CONFLICT" with conflict_candidates.

INPUTS
1) bundle_context:
${JSON.stringify(bundleContext, null, 2)}

2) target_output_schema:
${JSON.stringify(BUNDLE_SNAPSHOT_SCHEMA_JSON, null, 2)}

3) evidence_catalog:
${JSON.stringify(evidenceCatalog, null, 2)}

4) extracted_candidates:
${JSON.stringify(extractedCandidates, null, 2)}

Populate:
- identity (insured, policy/quote number, carrier, term dates)
- premium (term premium, fees, installment if present)
- key coverages (limits/deductibles) by canonical coverage_key
- schedules (vehicles/drivers/locations/buildings/items) if present
- endorsements/forms list if present
- unknowns[]: list of important fields not found
Return BundleSnapshot JSON only.`;
}

export const REPORT_WRITER_SYSTEM_PROMPT = `You are a professional insurance remarketing report writer for a U.S. insurance agency.

SCOPE
- You receive a computed, deterministic ComparisonModel JSON (already calculated by code).
- Your job is to generate a client-ready report output JSON suitable for rendering to HTML/PDF.
- You MUST NOT introduce new facts. You may only rephrase and organize what is provided.

NON-NEGOTIABLE RULES
1) NO NEW FACTS. Do not invent premiums, coverages, savings, endorsements, reasons for increases.
2) Respect uncertainty:
   - If a field is NOT_FOUND or CONFLICT or NEEDS_VERIFICATION, you MUST keep it as such.
3) Be clear and client-friendly. Avoid jargon unless explained.
4) Output MUST be valid JSON only and conform to the report schema provided.
5) Do not mention OCR, LLMs, "extraction", or internal tooling.`;

export function buildReportWriterUserPrompt(
  comparisonModel: any,
  evidenceSnippets?: Record<string, string>
): string {
  return `Generate the report pack JSON from the comparison_model.

INPUTS
1) report_output_schema:
${JSON.stringify(REPORT_PACK_SCHEMA_JSON, null, 2)}

2) comparison_model:
${JSON.stringify(comparisonModel, null, 2)}

3) optional_evidence_snippets:
${JSON.stringify(evidenceSnippets || {}, null, 2)}

OUTPUT STRUCTURE (must match schema)
- title / subtitle
- executive_summary: concise narrative
- renewal_change_summary: current vs renewal premium and % change
- options_table_rows[]: carrier, premium, savings_vs_renewal, parity_score, key_differences
- coverage_matrix[]: coverage_key, current_terms, renewal_terms, quote_terms_by_carrier, notes
- recommendation_section: recommendation + rationale (only if comparison_model says eligible)
- items_to_verify[]: missing info needed to proceed
- disclaimers[]: coverage parity assumptions and next steps
Return JSON only.`;
}

export const EMAIL_WRITER_SYSTEM_PROMPT = `You write client emails for a U.S. insurance agency.

SCOPE
- Draft a polished email based on the report summary and recommendation data provided.
- The email should reassure the client we are proactively shopping their renewal.
- The email must be accurate and must not introduce facts not in the input.

NON-NEGOTIABLE RULES
1) NO NEW FACTS. Only use values provided in the input JSON.
2) If no cheaper option exists, clearly state that we shopped alternatives and renewal is currently best value (per the data).
3) If cheaper options exist, present them as options and note that coverage comparisons matter.
4) Include a short "Next steps" section and "Items we need to confirm" if provided.
5) Never mention OCR/AI/extraction.
6) Output MUST be valid JSON only and conform to the email schema provided.`;

export function buildEmailWriterUserPrompt(
  emailContext: {
    client_name?: string;
    agency_name: string;
    producer_name?: string;
    phone?: string;
    email?: string;
  },
  reportSummary: any,
  recommendation: any
): string {
  return `Write a client email draft based on the provided report_summary and recommendation.

INPUTS
1) email_output_schema:
${JSON.stringify(EMAIL_DRAFT_SCHEMA_JSON, null, 2)}

2) email_context:
${JSON.stringify(emailContext, null, 2)}

3) report_summary:
${JSON.stringify(reportSummary, null, 2)}

4) recommendation:
${JSON.stringify(recommendation, null, 2)}

OUTPUT REQUIREMENTS (JSON only)
- subject
- greeting_line
- body_paragraphs[] (2–6)
- bullets[] (optional)
- next_steps[] (clear calls to action)
- items_to_confirm[] (if present)
- closing_line
- signature_block
Return JSON only.`;
}

// =============================================================================
// COVERAGE KEYS (Canonical Names for Parity Comparison)
// =============================================================================

export const COVERAGE_KEYS = {
  // Personal Auto
  BODILY_INJURY: 'bodily_injury_liability',
  PROPERTY_DAMAGE: 'property_damage_liability',
  COMBINED_SINGLE_LIMIT: 'combined_single_limit',
  UNINSURED_MOTORIST_BI: 'uninsured_motorist_bi',
  UNINSURED_MOTORIST_PD: 'uninsured_motorist_pd',
  UNDERINSURED_MOTORIST: 'underinsured_motorist',
  PIP: 'personal_injury_protection',
  MEDICAL_PAYMENTS: 'medical_payments',
  COMPREHENSIVE: 'comprehensive',
  COLLISION: 'collision',
  RENTAL_REIMBURSEMENT: 'rental_reimbursement',
  TOWING: 'towing_labor',
  
  // Homeowners
  DWELLING: 'dwelling_coverage',
  OTHER_STRUCTURES: 'other_structures',
  PERSONAL_PROPERTY: 'personal_property',
  LOSS_OF_USE: 'loss_of_use',
  PERSONAL_LIABILITY: 'personal_liability',
  MEDICAL_PAYMENTS_HO: 'medical_payments_ho',
  
  // GL
  EACH_OCCURRENCE: 'each_occurrence',
  GENERAL_AGGREGATE: 'general_aggregate',
  PRODUCTS_COMP_OPS: 'products_completed_ops',
  PERSONAL_ADV_INJURY: 'personal_advertising_injury',
  DAMAGE_TO_RENTED: 'damage_to_rented_premises',
  MEDICAL_EXPENSE: 'medical_expense_gl',
} as const;

