/**
 * Commercial Umbrella / Excess Liability Extraction Prompts
 *
 * Two-layer prompt architecture:
 * 1. SYSTEM_PROMPT - Stable rules for umbrella extraction
 * 2. USER_PROMPT - Per-job context with evidence catalog
 *
 * Umbrella is deceptively simple on the dec page but the real value is:
 * - Underlying policy schedule with compliance checks
 * - Drop-down conditions
 * - High-impact endorsements/exclusions
 */

// =============================================================================
// SYSTEM PROMPT - STABLE RULES
// =============================================================================

export const UMBRELLA_EXTRACTION_SYSTEM_PROMPT = `You are an expert Commercial Umbrella and Excess Liability policy data extractor for insurance professionals.

## YOUR ROLE
Extract structured umbrella/excess policy data from quotes, binders, policies, and endorsements.
Every extracted value MUST cite its source evidence ID(s) from the OCR catalog.

## CRITICAL RULES

### 1. EVIDENCE-BASED EXTRACTION ONLY
- ONLY extract values that appear in the evidence catalog
- NEVER guess, infer, or use industry defaults
- If a field is not in the evidence, return status: "NOT_FOUND"
- Each field MUST include evidence_ids array linking to source

### 2. CONFIDENCE SCORING
- 0.95-1.00: Exact match with clear label
- 0.85-0.94: Strong match from context/table
- 0.70-0.84: Reasonable inference
- Below 0.70: Mark as NEEDS_REVIEW

### 3. UMBRELLA-SPECIFIC KNOWLEDGE

POLICY TYPES:
- Umbrella: Provides broader coverage than underlying + may drop down
- Excess: Follows form of underlying, typically no drop-down

FORM BASIS:
- Follow Form: Coverage terms follow the underlying policies
- Stand-Alone: Has its own independent coverage terms

LIMITS:
- Per Occurrence (headline limit): $1M, $2M, $5M, $10M common
- Aggregate: May be same as occurrence or higher
- Defense: Usually outside limits (supplementary)

RETENTION/SIR:
- Self-Insured Retention (SIR): Amount insured pays when underlying doesn't respond
- Typically applies to claims not covered by underlying
- May also apply to drop-down situations

UNDERLYING SCHEDULE (CRITICAL):
The underlying policy schedule is the most important part. For each:
- Coverage Type: GL, Auto, Employer's Liability, WC, etc.
- Carrier: Insurance company name
- Policy Number: Full policy number
- Dates: Effective and expiration (check alignment with umbrella)
- Limits: Must meet umbrella's minimum requirements

COMMON UNDERLYING REQUIREMENTS:
- GL: Usually $1M/$2M occurrence/aggregate minimum
- Auto: Usually $1M CSL minimum
- Employer's Liability: Usually $500K/$500K/$500K or $1M

HIGH-IMPACT ENDORSEMENTS:
- Designated Underlying Insurance
- Auto Liability Limitations/Follow Form
- Employer's Liability Exclusion
- Professional Liability Exclusion
- Pollution Exclusion
- Abuse/Molestation Exclusion
- Assault & Battery Exclusion
- Communicable Disease Exclusion
- Residential Work Exclusion
- Height Limitation
- EIFS/Stucco Exclusion
- Territory Limitations

### 4. LIMIT NORMALIZATION
- "$1,000,000" → 1000000
- "$1M" → 1000000
- "$5 Million" → 5000000
- "$500K" → 500000
- "$500,000/500,000/500,000" → Parse EL split limits

### 5. COMPLIANCE FLAGS
Automatically flag issues:
- Underlying expires before umbrella
- Underlying limit below required minimum
- Missing required underlying coverage
- Carrier or policy number not listed

## OUTPUT FORMAT
Return valid JSON matching the schema provided.
Never include explanatory text outside the JSON structure.`;

// =============================================================================
// USER PROMPT BUILDER
// =============================================================================

export interface UmbrellaExtractionContext {
  evidenceCatalog: string;
  documentType: 'application' | 'quote' | 'binder' | 'policy' | 'endorsement' | 'dec_page' | 'schedule';
  existingData?: {
    carrier_name?: string;
    policy_number?: string;
    named_insured?: string;
  };
}

export function buildUmbrellaExtractionUserPrompt(context: UmbrellaExtractionContext): string {
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

Extract Commercial Umbrella/Excess policy data. For each field include:
- value: The extracted value (normalized)
- evidence_ids: Array of evidence IDs
- confidence: Score 0.0-1.0
- status: "AUTO_APPLIED" | "NEEDS_REVIEW" | "LOW_CONFIDENCE" | "NOT_FOUND" | "CONFLICT"

\`\`\`json
{
  "identity": {
    "carrier_name": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
    "carrier_naic": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "policy_number": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
    "transaction_type": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
    "named_insured": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
    "dba": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "mailing_address": {
      "street": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "city": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "state": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "zip": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" }
    },
    "producer": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "dates": {
    "effective_date": { "value": "YYYY-MM-DD", "evidence_ids": [], "confidence": 0, "status": "" },
    "expiration_date": { "value": "YYYY-MM-DD", "evidence_ids": [], "confidence": 0, "status": "" },
    "issue_date": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "policy_type": { "value": "umbrella", "evidence_ids": [], "confidence": 0, "status": "" },
  "form_basis": { "value": "follow_form", "evidence_ids": [], "confidence": 0, "status": "" },
  "limits": {
    "per_occurrence": { "value": 0, "evidence_ids": [], "confidence": 0, "status": "" },
    "aggregate": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "products_completed_ops_aggregate": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "defense_costs": { "value": "outside_limits", "evidence_ids": [], "confidence": 0, "status": "" },
    "territory": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "retention": {
    "amount": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "applicability": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "notes": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "underlying_requirements": {
    "gl_each_occurrence": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "gl_general_aggregate": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "auto_liability": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "el_per_accident": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "el_disease_policy": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "el_disease_employee": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "underlying_policies": [
    {
      "type": { "value": "general_liability", "evidence_ids": [], "confidence": 0, "status": "" },
      "carrier": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "policy_number": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "effective_date": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "expiration_date": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "limits": {
        "each_occurrence": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
        "general_aggregate": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
      }
    }
  ],
  "drop_down": {
    "is_available": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "conditions": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "exclusions": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "who_is_insured": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "additional_insureds": [
    {
      "name": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "ai_type": { "value": "blanket", "evidence_ids": [], "confidence": 0, "status": "" },
      "primary_noncontributory": { "value": false, "evidence_ids": [], "confidence": 0, "status": "" },
      "waiver_of_subrogation": { "value": false, "evidence_ids": [], "confidence": 0, "status": "" }
    }
  ],
  "endorsements": [
    {
      "form_number": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "title": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "edition_date": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "category": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "is_limitation": { "value": false, "evidence_ids": [], "confidence": 0, "status": "" }
    }
  ],
  "premium": {
    "total_premium": { "value": 0, "evidence_ids": [], "confidence": 0, "status": "" },
    "base_premium": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "policy_fee": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "terrorism_premium": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "terrorism_rejected": { "value": false, "evidence_ids": [], "confidence": 0, "status": "" }
  }
}
\`\`\`

## EXTRACTION INSTRUCTIONS

1. **Limits**: Look for per occurrence limit (headline), aggregate if different
2. **Retention/SIR**: Critical - extract amount and when it applies
3. **Underlying Schedule**: VERY IMPORTANT - extract ALL scheduled underlying policies with:
   - Type (GL, Auto, EL, WC, etc.)
   - Carrier name
   - Policy number
   - Effective/Expiration dates (check for alignment issues)
   - Limits (must meet minimum requirements)
4. **Requirements**: Look for "Schedule of Underlying Insurance" or "Minimum Required Limits"
5. **Drop-Down**: If mentioned, capture conditions
6. **Endorsements**: List ALL forms, flag high-impact categories (auto limitations, exclusions)

REMEMBER: NO GUESSING. Only extract what's in the evidence.`;
}

// =============================================================================
// UNDERLYING SCHEDULE EXTRACTION PROMPT
// =============================================================================

export function buildUnderlyingSchedulePrompt(evidenceCatalog: string): string {
  return `## TASK: Extract Underlying Insurance Schedule

This is the MOST IMPORTANT part of umbrella extraction. Extract every scheduled underlying policy.

## EVIDENCE CATALOG
\`\`\`json
${evidenceCatalog}
\`\`\`

## EXTRACTION SCHEMA
Extract all underlying policies:

\`\`\`json
{
  "underlying_policies": [
    {
      "type": "general_liability" | "commercial_auto" | "employers_liability" | "workers_compensation" | "professional_liability" | "hired_non_owned_auto" | "employee_benefits" | "other",
      "carrier": string,
      "policy_number": string,
      "effective_date": "YYYY-MM-DD",
      "expiration_date": "YYYY-MM-DD",
      "limits": {
        "each_occurrence": number | null,
        "general_aggregate": number | null,
        "auto_csl": number | null,
        "el_per_accident": number | null,
        "el_disease_policy": number | null,
        "el_disease_employee": number | null,
        "other_limit": number | null
      },
      "notes": string | null
    }
  ],
  "required_minimums": {
    "gl_each_occurrence": number | null,
    "gl_general_aggregate": number | null,
    "auto_liability": number | null,
    "el_per_accident": number | null,
    "el_disease_policy": number | null,
    "el_disease_employee": number | null
  }
}
\`\`\`

## LOOK FOR:
- "Schedule of Underlying Insurance"
- "Underlying Policies"
- "Required Underlying Limits"
- Tables listing carriers, policy numbers, limits
- Common patterns: GL, Auto, EL/WC listed together`;
}

// =============================================================================
// ENDORSEMENT FLAGGING PROMPT
// =============================================================================

export function buildUmbrellaEndorsementPrompt(evidenceCatalog: string): string {
  return `## TASK: Extract and Flag Umbrella Endorsements

## EVIDENCE CATALOG
\`\`\`json
${evidenceCatalog}
\`\`\`

## HIGH-IMPACT CATEGORIES TO FLAG:
- designated_underlying: Modifies required underlying
- auto_liability: Limits or excludes auto coverage
- employers_liability: EL exclusions
- professional_liability: E&O, D&O exclusions
- pollution: Pollution/environmental exclusions
- abuse_molestation: Sexual abuse exclusions
- assault_battery: A&B exclusions
- communicable_disease: Disease exclusions
- residential_work: Excludes residential contractors
- height_limitation: Height restrictions for contractors
- eifs_stucco: EIFS/exterior insulation exclusions
- liquor_liability: Liquor-related
- cyber: Cyber/data breach exclusions
- territory_limitation: Geographic restrictions

## EXTRACTION SCHEMA
\`\`\`json
{
  "endorsements": [
    {
      "form_number": string,
      "title": string,
      "edition_date": string | null,
      "effective_date": string | null,
      "category": string | null,
      "is_limitation": boolean,
      "is_enhancement": boolean,
      "impact_description": string | null
    }
  ]
}
\`\`\`

Flag is_limitation=true for any endorsement that:
- Excludes coverage
- Adds restrictions
- Limits scope of coverage
- Adds deductibles/retentions`;
}
