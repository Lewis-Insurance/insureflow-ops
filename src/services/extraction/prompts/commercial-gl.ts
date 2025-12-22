/**
 * Commercial General Liability (CGL) Extraction Prompts
 *
 * Two-layer prompt architecture:
 * 1. SYSTEM_PROMPT - Stable rules (personality, output format, constraints)
 * 2. USER_PROMPT - Per-job context (evidence catalog, field list, instructions)
 *
 * Uses Azure Document Intelligence evidence for grounded extraction.
 */

// =============================================================================
// SYSTEM PROMPT - STABLE RULES
// =============================================================================

export const CGL_EXTRACTION_SYSTEM_PROMPT = `You are an expert Commercial General Liability (CGL) policy data extractor for insurance professionals.

## YOUR ROLE
Extract structured policy data from CGL documents (quotes, binders, policies, endorsements).
Every extracted value MUST cite its source evidence ID(s) from the OCR catalog.

## CRITICAL RULES

### 1. EVIDENCE-BASED EXTRACTION ONLY
- ONLY extract values that appear in the evidence catalog
- NEVER guess, infer, or use industry defaults
- If a field is not in the evidence, return status: "NOT_FOUND"
- Each field MUST include evidence_ids array linking to source

### 2. CONFIDENCE SCORING
Rate your confidence for each extracted field:
- 0.95-1.00: Exact match with clear label (e.g., "Each Occurrence: $1,000,000")
- 0.85-0.94: Strong match from context (e.g., limit in coverage table)
- 0.70-0.84: Reasonable inference from nearby values
- Below 0.70: Mark as NEEDS_REVIEW

### 3. CGL-SPECIFIC KNOWLEDGE

POLICY FORMS:
- Occurrence: Covers claims for incidents during policy period, regardless of when claim filed
- Claims-Made: Covers claims FILED during policy period for incidents after retroactive date

STANDARD LIMITS STRUCTURE (ISO CG 00 01):
- Each Occurrence: Per-incident limit
- Damage to Rented Premises (Fire Damage): Per-premises limit
- Medical Expense: Per-person limit
- Personal & Advertising Injury: Per-person/organization limit
- General Aggregate: Total for all claims except Products/Completed Ops
- Products/Completed Operations Aggregate: Separate aggregate for P&CO claims

AGGREGATE APPLICABILITY:
- Per Policy: One aggregate for entire policy (default)
- Per Project: Separate aggregate per construction project (CG 25 03)
- Per Location: Separate aggregate per premises (CG 25 04)

COMMON ENDORSEMENT FORMS:
- CG 20 10: Additional Insured - Owners, Lessees, Contractors (Ongoing Ops)
- CG 20 37: Additional Insured - Completed Operations
- CG 24 04: Waiver of Transfer of Rights (Waiver of Subrogation)
- CG 20 01: Primary and Noncontributory

EXPOSURE BASES:
- Sales (Gross Receipts): Per $1,000 of sales
- Payroll: Per $1,000 of remuneration
- Area: Per 1,000 square feet
- Units/Admissions: Per unit count

### 4. LIMIT NORMALIZATION
Always normalize limits to numbers:
- "$1,000,000" → 1000000
- "$1M" → 1000000
- "1 Million" → 1000000
- "$500K" → 500000
- "Included" with no amount → null, note in comments

### 5. HANDLING AMBIGUITY
- Multiple values for same field: Return all with CONFLICT status
- Unclear which limit applies: Include all candidates, mark NEEDS_REVIEW
- Claims-made policies: Always look for retroactive date
- Package policies (BOP): Extract GL section only, note if bundled

## OUTPUT FORMAT
Return valid JSON matching the schema provided in the user prompt.
Never include explanatory text outside the JSON structure.`;

// =============================================================================
// USER PROMPT BUILDER
// =============================================================================

export interface CGLExtractionContext {
  evidenceCatalog: string;
  documentType: 'application' | 'quote' | 'binder' | 'policy' | 'endorsement' | 'dec_page';
  existingData?: {
    carrier_name?: string;
    policy_number?: string;
    named_insured?: string;
  };
}

export function buildCGLExtractionUserPrompt(context: CGLExtractionContext): string {
  const { evidenceCatalog, documentType, existingData } = context;

  return `## DOCUMENT TYPE
${documentType.toUpperCase()}

${existingData ? `## EXISTING POLICY DATA (for reference)
Carrier: ${existingData.carrier_name || 'Unknown'}
Policy Number: ${existingData.policy_number || 'Unknown'}
Named Insured: ${existingData.named_insured || 'Unknown'}
` : ''}

## EVIDENCE CATALOG
The following evidence was extracted via Azure Document Intelligence OCR.
Each entry has a unique ID (e.g., "E0001") that you MUST reference.

\`\`\`json
${evidenceCatalog}
\`\`\`

## EXTRACTION SCHEMA

Extract the following CGL policy data. For each field:
- value: The extracted value (normalized)
- evidence_ids: Array of evidence IDs that support this value
- confidence: Your confidence score (0.0-1.0)
- status: "AUTO_APPLIED" | "NEEDS_REVIEW" | "LOW_CONFIDENCE" | "NOT_FOUND" | "CONFLICT"

\`\`\`json
{
  "identity": {
    "carrier_name": { "value": string, "evidence_ids": [], "confidence": number, "status": string },
    "carrier_naic": { "value": string | null, "evidence_ids": [], "confidence": number, "status": string },
    "policy_number": { "value": string, "evidence_ids": [], "confidence": number, "status": string },
    "transaction_type": { "value": "quote" | "bound" | "issued" | "renewal" | "endorsement" | "cancel", "evidence_ids": [], "confidence": number, "status": string },
    "named_insured": { "value": string, "evidence_ids": [], "confidence": number, "status": string },
    "dba": { "value": string | null, "evidence_ids": [], "confidence": number, "status": string },
    "mailing_address": {
      "street": { "value": string, "evidence_ids": [], "confidence": number, "status": string },
      "city": { "value": string, "evidence_ids": [], "confidence": number, "status": string },
      "state": { "value": string, "evidence_ids": [], "confidence": number, "status": string },
      "zip": { "value": string, "evidence_ids": [], "confidence": number, "status": string }
    },
    "fein": { "value": string | null, "evidence_ids": [], "confidence": number, "status": string },
    "producer": { "value": string | null, "evidence_ids": [], "confidence": number, "status": string }
  },
  "dates": {
    "effective_date": { "value": "YYYY-MM-DD", "evidence_ids": [], "confidence": number, "status": string },
    "expiration_date": { "value": "YYYY-MM-DD", "evidence_ids": [], "confidence": number, "status": string },
    "issue_date": { "value": "YYYY-MM-DD" | null, "evidence_ids": [], "confidence": number, "status": string }
  },
  "coverage_options": {
    "policy_form": { "value": "occurrence" | "claims_made", "evidence_ids": [], "confidence": number, "status": string },
    "defense_costs": { "value": "inside_limits" | "outside_limits", "evidence_ids": [], "confidence": number, "status": string },
    "claims_made_details": {
      "retroactive_date": { "value": "YYYY-MM-DD" | null, "evidence_ids": [], "confidence": number, "status": string },
      "erp_available": { "value": boolean, "evidence_ids": [], "confidence": number, "status": string }
    }
  },
  "limits": {
    "each_occurrence": { "value": number, "evidence_ids": [], "confidence": number, "status": string },
    "damage_to_rented_premises": { "value": number, "evidence_ids": [], "confidence": number, "status": string },
    "medical_expense": { "value": number, "evidence_ids": [], "confidence": number, "status": string },
    "personal_advertising_injury": { "value": number, "evidence_ids": [], "confidence": number, "status": string },
    "general_aggregate": { "value": number, "evidence_ids": [], "confidence": number, "status": string },
    "products_completed_ops_aggregate": { "value": number, "evidence_ids": [], "confidence": number, "status": string },
    "aggregate_applies_per": { "value": "policy" | "project" | "location" | null, "evidence_ids": [], "confidence": number, "status": string }
  },
  "deductible": {
    "type": { "value": "deductible" | "sir" | "none", "evidence_ids": [], "confidence": number, "status": string },
    "per_occurrence": { "value": number | null, "evidence_ids": [], "confidence": number, "status": string },
    "property_damage": { "value": number | null, "evidence_ids": [], "confidence": number, "status": string }
  },
  "locations": [
    {
      "location_number": { "value": number, "evidence_ids": [], "confidence": number, "status": string },
      "street": { "value": string, "evidence_ids": [], "confidence": number, "status": string },
      "city": { "value": string, "evidence_ids": [], "confidence": number, "status": string },
      "state": { "value": string, "evidence_ids": [], "confidence": number, "status": string },
      "zip": { "value": string, "evidence_ids": [], "confidence": number, "status": string },
      "description": { "value": string | null, "evidence_ids": [], "confidence": number, "status": string }
    }
  ],
  "classifications": [
    {
      "class_code": { "value": string | null, "evidence_ids": [], "confidence": number, "status": string },
      "description": { "value": string, "evidence_ids": [], "confidence": number, "status": string },
      "exposure_basis": { "value": "sales" | "payroll" | "area" | "units" | "admissions" | "per_project" | "flat" | "other", "evidence_ids": [], "confidence": number, "status": string },
      "exposure_amount": { "value": number | null, "evidence_ids": [], "confidence": number, "status": string },
      "rate": { "value": number | null, "evidence_ids": [], "confidence": number, "status": string },
      "premium": { "value": number | null, "evidence_ids": [], "confidence": number, "status": string },
      "is_products_completed_ops": { "value": boolean, "evidence_ids": [], "confidence": number, "status": string },
      "location_number": { "value": number | null, "evidence_ids": [], "confidence": number, "status": string }
    }
  ],
  "additional_insureds": [
    {
      "name": { "value": string, "evidence_ids": [], "confidence": number, "status": string },
      "address": {
        "street": { "value": string | null, "evidence_ids": [], "confidence": number, "status": string },
        "city": { "value": string | null, "evidence_ids": [], "confidence": number, "status": string },
        "state": { "value": string | null, "evidence_ids": [], "confidence": number, "status": string },
        "zip": { "value": string | null, "evidence_ids": [], "confidence": number, "status": string }
      },
      "ai_type": { "value": "ongoing_ops" | "completed_ops" | "both" | "owners_lessees_contractors" | "managers_lessors" | "vendors" | "co_owner" | "designated_person" | "other", "evidence_ids": [], "confidence": number, "status": string },
      "primary_noncontributory": { "value": boolean, "evidence_ids": [], "confidence": number, "status": string },
      "waiver_of_subrogation": { "value": boolean, "evidence_ids": [], "confidence": number, "status": string },
      "endorsement_form": { "value": string | null, "evidence_ids": [], "confidence": number, "status": string }
    }
  ],
  "endorsements": [
    {
      "form_number": { "value": string, "evidence_ids": [], "confidence": number, "status": string },
      "edition_date": { "value": string | null, "evidence_ids": [], "confidence": number, "status": string },
      "description": { "value": string, "evidence_ids": [], "confidence": number, "status": string }
    }
  ],
  "premium": {
    "total_premium": { "value": number, "evidence_ids": [], "confidence": number, "status": string },
    "premises_operations_premium": { "value": number | null, "evidence_ids": [], "confidence": number, "status": string },
    "products_completed_ops_premium": { "value": number | null, "evidence_ids": [], "confidence": number, "status": string },
    "policy_fee": { "value": number | null, "evidence_ids": [], "confidence": number, "status": string },
    "terrorism_premium": { "value": number | null, "evidence_ids": [], "confidence": number, "status": string }
  }
}
\`\`\`

## EXTRACTION INSTRUCTIONS

1. Search the evidence catalog for each field
2. For limits, look for the standard CGL declarations page format
3. For classifications, look for rating tables showing class codes, descriptions, exposures
4. For additional insureds, check endorsement schedules (CG 20 10, CG 20 37, etc.)
5. Normalize all monetary values to numbers (remove $ and commas)
6. Format dates as YYYY-MM-DD
7. If a field genuinely doesn't exist in the document, use status: "NOT_FOUND"

REMEMBER: NO GUESSING. Only extract what's in the evidence.`;
}

// =============================================================================
// LOCATION-SPECIFIC EXTRACTION PROMPT
// =============================================================================

export function buildCGLLocationExtractionPrompt(evidenceCatalog: string): string {
  return `## TASK: Extract CGL Locations/Premises Schedule

## EVIDENCE CATALOG
\`\`\`json
${evidenceCatalog}
\`\`\`

## EXTRACTION SCHEMA
Extract all insured locations/premises from the evidence:

\`\`\`json
{
  "locations": [
    {
      "location_number": { "value": number, "evidence_ids": [], "confidence": number, "status": string },
      "street": { "value": string, "evidence_ids": [], "confidence": number, "status": string },
      "city": { "value": string, "evidence_ids": [], "confidence": number, "status": string },
      "state": { "value": string, "evidence_ids": [], "confidence": number, "status": string },
      "zip": { "value": string, "evidence_ids": [], "confidence": number, "status": string },
      "description": { "value": string | null, "evidence_ids": [], "confidence": number, "status": string },
      "territory": { "value": string | null, "evidence_ids": [], "confidence": number, "status": string },
      "county": { "value": string | null, "evidence_ids": [], "confidence": number, "status": string },
      "square_footage": { "value": number | null, "evidence_ids": [], "confidence": number, "status": string },
      "building_type": { "value": "owned" | "leased" | "rented" | null, "evidence_ids": [], "confidence": number, "status": string }
    }
  ]
}
\`\`\`

Look for:
- Location schedules on declarations pages
- Premises listed in Item 1 or Schedule of Locations
- Address tables with location numbers
- Building information sections`;
}

// =============================================================================
// ADDITIONAL INSURED EXTRACTION PROMPT
// =============================================================================

export function buildCGLAdditionalInsuredPrompt(evidenceCatalog: string): string {
  return `## TASK: Extract CGL Additional Insureds

## EVIDENCE CATALOG
\`\`\`json
${evidenceCatalog}
\`\`\`

## EXTRACTION SCHEMA
Extract all additional insureds from endorsements:

\`\`\`json
{
  "additional_insureds": [
    {
      "name": { "value": string, "evidence_ids": [], "confidence": number, "status": string },
      "address": {
        "street": { "value": string | null, "evidence_ids": [], "confidence": number, "status": string },
        "city": { "value": string | null, "evidence_ids": [], "confidence": number, "status": string },
        "state": { "value": string | null, "evidence_ids": [], "confidence": number, "status": string },
        "zip": { "value": string | null, "evidence_ids": [], "confidence": number, "status": string }
      },
      "ai_type": {
        "value": "ongoing_ops" | "completed_ops" | "both" | "owners_lessees_contractors" | "managers_lessors" | "vendors" | "co_owner" | "designated_person" | "other",
        "evidence_ids": [],
        "confidence": number,
        "status": string
      },
      "primary_noncontributory": { "value": boolean, "evidence_ids": [], "confidence": number, "status": string },
      "waiver_of_subrogation": { "value": boolean, "evidence_ids": [], "confidence": number, "status": string },
      "per_project": { "value": boolean, "evidence_ids": [], "confidence": number, "status": string },
      "project_name": { "value": string | null, "evidence_ids": [], "confidence": number, "status": string },
      "endorsement_form": { "value": string | null, "evidence_ids": [], "confidence": number, "status": string },
      "effective_date": { "value": "YYYY-MM-DD" | null, "evidence_ids": [], "confidence": number, "status": string }
    }
  ]
}
\`\`\`

## AI TYPE DETERMINATION
- CG 20 10 = owners_lessees_contractors (Ongoing Ops)
- CG 20 37 = completed_ops
- CG 20 10 + CG 20 37 = both
- CG 20 11 = managers_lessors
- CG 20 15 = vendors
- Look for "Primary" or "Primary and Noncontributory" language
- Look for "Waiver of Subrogation" or CG 24 04 endorsement`;
}

// =============================================================================
// CLASSIFICATION EXTRACTION PROMPT
// =============================================================================

export function buildCGLClassificationPrompt(evidenceCatalog: string): string {
  return `## TASK: Extract CGL Classifications/Rating Basis

## EVIDENCE CATALOG
\`\`\`json
${evidenceCatalog}
\`\`\`

## EXTRACTION SCHEMA
Extract classification codes, exposures, and rating information:

\`\`\`json
{
  "classifications": [
    {
      "class_code": { "value": string | null, "evidence_ids": [], "confidence": number, "status": string },
      "description": { "value": string, "evidence_ids": [], "confidence": number, "status": string },
      "exposure_basis": {
        "value": "sales" | "payroll" | "area" | "units" | "admissions" | "per_project" | "flat" | "other",
        "evidence_ids": [],
        "confidence": number,
        "status": string
      },
      "exposure_amount": { "value": number | null, "evidence_ids": [], "confidence": number, "status": string },
      "rate": { "value": number | null, "evidence_ids": [], "confidence": number, "status": string },
      "premium": { "value": number | null, "evidence_ids": [], "confidence": number, "status": string },
      "is_products_completed_ops": { "value": boolean, "evidence_ids": [], "confidence": number, "status": string },
      "location_number": { "value": number | null, "evidence_ids": [], "confidence": number, "status": string },
      "subcontractor_costs_included": { "value": boolean | null, "evidence_ids": [], "confidence": number, "status": string },
      "percent_subcontracted": { "value": number | null, "evidence_ids": [], "confidence": number, "status": string }
    }
  ]
}
\`\`\`

## EXPOSURE BASIS CLUES
- "Per $1,000 Sales" or "Gross Receipts" → sales
- "Per $1,000 Payroll" or "Remuneration" → payroll
- "Per 1,000 Sq Ft" or "Area" → area
- "Per Unit" → units
- "Per Admission" → admissions
- "Each" or no exposure shown → per_project or flat

## PRODUCTS/COMPLETED OPS
- Look for separate "Prod/Comp Ops" or "P&CO" lines
- These may have different class codes or same code with "P&CO" suffix`;
}
