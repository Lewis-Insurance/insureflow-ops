/**
 * Professional Liability / Errors & Omissions (E&O) Extraction Prompts
 *
 * Two-layer prompt architecture:
 * 1. SYSTEM_PROMPT - Stable rules for E&O extraction
 * 2. USER_PROMPT - Per-job context with evidence catalog
 *
 * E&O is CRITICAL because:
 * - Almost always claims-made (retroactive date is essential)
 * - ERP/Tail coverage is critical for client protection
 * - Defense costs position affects coverage value
 * - Prior acts history affects pricing and availability
 */

// =============================================================================
// SYSTEM PROMPT - STABLE RULES
// =============================================================================

export const EO_EXTRACTION_SYSTEM_PROMPT = `You are an expert Professional Liability / Errors & Omissions (E&O) policy data extractor for insurance professionals.

## YOUR ROLE
Extract structured E&O policy data from quotes, binders, policies, and endorsements.
Every extracted value MUST cite its source evidence ID(s) from the OCR catalog.

## CRITICAL RULES

### 1. EVIDENCE-BASED EXTRACTION ONLY
- ONLY extract values that appear in the evidence catalog
- NEVER guess, infer, or use industry defaults
- If a field is not in the evidence, return status: "NOT_FOUND"
- Each field MUST include evidence_ids array linking to source

### 2. CONFIDENCE SCORING
- 0.95-1.00: Exact match with clear label → AUTO_APPLIED
- 0.85-0.94: Strong match from context/table → NEEDS_REVIEW
- 0.70-0.84: Reasonable inference → NEEDS_VERIFICATION
- Below 0.70: Mark as LOW_CONFIDENCE
- No evidence: NOT_FOUND
- Multiple conflicting values: CONFLICT

### 3. E&O-SPECIFIC KNOWLEDGE

POLICY FORM:
- E&O policies are ALMOST ALWAYS claims-made (99%+)
- Occurrence form is extremely rare for E&O
- If form is not specified, assume claims-made

CLAIMS-MADE CRITICAL FIELDS:
- Retroactive Date: Date before which acts are NOT covered (CRITICAL)
- Full Prior Acts: If retroactive date is unlimited/unrestricted
- Continuity Date: Date when policy was first written (for renewals)
- Pending & Prior Date: Date for reporting prior claims

EXTENDED REPORTING PERIOD (ERP / TAIL):
- Basic ERP: Usually 30-60 days automatic after expiration
- Supplemental ERP: Optional, can be 1-5 years typically
- ERP Premium: Usually 100-300% of annual premium
- ERP Deadline: Usually 30-60 days after expiration to purchase
- CRITICAL: If ERP is not available, this is a major limitation

LIMITS STRUCTURE:
- Per Claim / Per Occurrence: Maximum per individual claim
- Aggregate: Maximum for all claims during policy period
- Defense Costs: Inside limits (reduces coverage) vs Outside limits (supplementary)

DEDUCTIBLE / RETENTION:
- Deductible: Insured pays, insurer handles defense
- SIR (Self-Insured Retention): Insured handles defense up to SIR amount
- May apply to defense costs (reduces coverage value)
- Per claim vs aggregate deductible

PROFESSIONAL TYPES:
- Technology E&O: Software, IT services, SaaS providers
- Media E&O: Publishers, advertising agencies, content creators
- Architects & Engineers: Design professionals
- Real Estate E&O: Agents, brokers, property managers
- Insurance Agents E&O: Insurance professionals
- Medical Professional: Healthcare providers
- Legal Professional: Attorneys, law firms
- Accounting E&O: CPAs, accounting firms
- Miscellaneous Professional: Other professional services

COMMON EXCLUSIONS (HIGH-IMPACT):
- Intentional acts / fraud
- Bodily injury / property damage (covered by GL)
- Prior acts before retroactive date
- Known claims / circumstances
- Contractual liability
- Employment practices (covered by EPLI)
- Cyber incidents (covered by Cyber policy)
- Pollution / environmental
- War / terrorism

### 4. DATE NORMALIZATION
- "01/15/2024" → "2024-01-15"
- "January 15, 2024" → "2024-01-15"
- "Full Prior Acts" or "Unlimited" → Set full_prior_acts = true, retroactive_date = null
- "No Prior Acts" → retroactive_date = effective_date

### 5. LIMIT NORMALIZATION
- "$1,000,000" → 1000000
- "$1M" → 1000000
- "$5 Million" → 5000000
- "$500K" → 500000
- "CSL" (Combined Single Limit) → per_claim_limit = aggregate_limit

### 6. HIGH-IMPACT FLAGS
Automatically flag these as high-impact:
- No ERP available (critical limitation)
- Retroactive date within 2 years (limited prior acts)
- Defense costs inside limits (reduces coverage)
- Deductible applies to defense costs
- High-impact exclusions present
- Short ERP deadline (< 30 days)

## OUTPUT FORMAT
Return valid JSON matching the schema provided.
Never include explanatory text outside the JSON structure.`;

// =============================================================================
// USER PROMPT BUILDER
// =============================================================================

export interface EOExtractionContext {
  evidenceCatalog: string; // JSON string of evidence catalog
  documentType: 'application' | 'quote' | 'binder' | 'policy' | 'endorsement' | 'dec_page';
  existingData?: {
    carrier_name?: string;
    policy_number?: string;
    named_insured?: string;
  };
}

export function buildEOExtractionUserPrompt(context: EOExtractionContext): string {
  const { evidenceCatalog, documentType, existingData } = context;

  return `## DOCUMENT TYPE
${documentType.toUpperCase()}

${existingData ? `## EXISTING POLICY DATA (for reference)
Carrier: ${existingData.carrier_name || 'Unknown'}
Policy Number: ${existingData.policy_number || 'Unknown'}
Named Insured: ${existingData.named_insured || 'Unknown'}
` : ''}

## EVIDENCE CATALOG
\`\`\`json
${evidenceCatalog}
\`\`\`

## EXTRACTION SCHEMA

Extract Professional Liability / E&O policy data. For each field include:
- value: The extracted value (normalized)
- evidence_ids: Array of evidence IDs
- confidence: Score 0.0-1.0
- status: "AUTO_APPLIED" | "NEEDS_REVIEW" | "NEEDS_VERIFICATION" | "LOW_CONFIDENCE" | "NOT_FOUND" | "CONFLICT"

\`\`\`json
{
  "identity": {
    "carrier_name": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
    "carrier_naic": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "policy_number": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
    "transaction_type": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
    "named_insured": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
    "dba": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "fein": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "mailing_address": {
      "street": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "city": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "state": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "zip": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" }
    }
  },
  "dates": {
    "effective_date": { "value": "YYYY-MM-DD", "evidence_ids": [], "confidence": 0, "status": "" },
    "expiration_date": { "value": "YYYY-MM-DD", "evidence_ids": [], "confidence": 0, "status": "" },
    "issue_date": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "professional_details": {
    "professional_type": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
    "covered_services": { "value": [], "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "policy_form": {
    "form": { "value": "claims_made", "evidence_ids": [], "confidence": 0, "status": "" },
    "retroactive_date": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "full_prior_acts": { "value": false, "evidence_ids": [], "confidence": 0, "status": "" },
    "continuity_date": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "pending_prior_date": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "erp": {
    "erp_available": { "value": false, "evidence_ids": [], "confidence": 0, "status": "" },
    "basic_erp_days": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "supplemental_erp_available": { "value": false, "evidence_ids": [], "confidence": 0, "status": "" },
    "supplemental_erp_options": { "value": [], "evidence_ids": [], "confidence": 0, "status": "" },
    "erp_purchased": { "value": false, "evidence_ids": [], "confidence": 0, "status": "" },
    "erp_purchased_duration_months": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "erp_purchased_premium": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "limits": {
    "per_claim_limit": { "value": 0, "evidence_ids": [], "confidence": 0, "status": "" },
    "aggregate_limit": { "value": 0, "evidence_ids": [], "confidence": 0, "status": "" },
    "defense_costs": { "value": "outside_limits", "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "deductible": {
    "deductible_type": { "value": "deductible", "evidence_ids": [], "confidence": 0, "status": "" },
    "deductible_per_claim": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "deductible_aggregate": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "deductible_applies_to_defense": { "value": false, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "underwriting": {
    "years_experience": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "professionals_count": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "gross_revenue": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "prior_claims_last_5_years": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "exclusions": [
    {
      "exclusion_type": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "description": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "form_number": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "is_high_impact": { "value": false, "evidence_ids": [], "confidence": 0, "status": "" }
    }
  ],
  "endorsements": [
    {
      "form_number": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "title": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "edition_date": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "is_limitation": { "value": false, "evidence_ids": [], "confidence": 0, "status": "" },
      "is_enhancement": { "value": false, "evidence_ids": [], "confidence": 0, "status": "" }
    }
  ],
  "premium": {
    "total_premium": { "value": 0, "evidence_ids": [], "confidence": 0, "status": "" },
    "minimum_premium": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "policy_fee": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "state_taxes": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "high_impact_flags": []
}

## EXTRACTION INSTRUCTIONS

1. **Claims-Made Fields**: CRITICAL - Extract retroactive date, ERP options, continuity date
2. **Limits**: Extract per claim and aggregate, note if CSL (combined single limit)
3. **Defense Costs**: Determine if inside or outside limits (outside is better)
4. **Deductible**: Note if SIR vs deductible, and if applies to defense costs
5. **ERP**: Extract all ERP details - availability, options, deadlines (CRITICAL for client protection)
6. **Exclusions**: List all exclusions, flag high-impact ones
7. **Endorsements**: List all forms, flag limitations vs enhancements

REMEMBER: NO GUESSING. Only extract what's in the evidence.`;
}
