/**
 * Commercial Property Extraction Prompts
 *
 * Two-layer prompt architecture:
 * 1. SYSTEM_PROMPT - Stable rules for property extraction
 * 2. USER_PROMPT - Per-job context with evidence catalog
 *
 * Property is complex due to:
 * - Multiple locations and buildings
 * - Various coverage types (Building, BPP, BI, O&L)
 * - Layered deductibles (AOP, Wind/Hail, Named Storm)
 * - Protective safeguards and conditions
 * - Blanket vs scheduled coverage structures
 */

// =============================================================================
// SYSTEM PROMPT - STABLE RULES
// =============================================================================

export const PROPERTY_EXTRACTION_SYSTEM_PROMPT = `You are an expert Commercial Property policy data extractor for insurance professionals.

## YOUR ROLE
Extract structured property policy data from quotes, binders, policies, and endorsements.
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

### 3. PROPERTY-SPECIFIC KNOWLEDGE

POLICY FORMS:
- Special Form (CP 10 30): Covers all risks except specifically excluded
- Broad Form (CP 10 20): Covers named perils
- Basic Form (CP 10 10): Limited named perils

VALUATION BASIS:
- Replacement Cost (RCV): Cost to replace with like kind/quality
- Actual Cash Value (ACV): RCV minus depreciation
- Functional Replacement (FRV): Cost to replace with functional equivalent
- Stated Amount: Maximum payable regardless of actual value
- Agreed Value: Suspends coinsurance; pays stated amount

CONSTRUCTION CLASSES (ISO):
- Class 1: Frame
- Class 2: Joisted Masonry
- Class 3: Non-Combustible
- Class 4: Masonry Non-Combustible
- Class 5: Modified Fire Resistive
- Class 6: Fire Resistive

COVERED PROPERTY CATEGORIES:
- Building: The structure itself
- BPP (Business Personal Property): Contents, furniture, equipment
- TIB (Tenant Improvements & Betterments): Lessee improvements
- Stock: Inventory/merchandise
- Property of Others: Customer goods in care

BUSINESS INCOME:
- ALS (Actual Loss Sustained): No dollar limit, pays actual loss
- Specific Limit: Capped dollar amount
- Period of Restoration: Time to repair/rebuild
- Waiting Period: Usually 72 hours
- Extended Period of Indemnity: Ramp-up time after reopening

DEDUCTIBLE TYPES:
- AOP (All Other Perils): Standard per-occurrence
- Wind/Hail: Often % of TIV or building value
- Named Storm/Hurricane: Higher %, coastal areas
- Flood: If included, usually high deductible
- Earthquake: Usually % of building value

### 4. LIMIT NORMALIZATION
- "$1,000,000" → 1000000
- "$1M" → 1000000
- "1 Million" → 1000000
- "Included" or "See Schedule" → null, note in comments
- "Blanket" → note blanket structure

### 5. DEDUCTIBLE PARSING
- "$5,000 AOP" → type: flat, amount: 5000
- "2% of TIV" → type: percentage_tiv, percentage: 2
- "5% per building" → type: percentage_building, percentage: 5
- "$25,000 / 2% Wind/Hail" → flat OR percentage, capture both options

### 6. HIGH-IMPACT FLAGS
Flag these endorsement categories:
- Wind/Hail limitations (coastal exclusions, sublimits)
- Water damage limitations
- Roof limitations (ACV, age restrictions)
- Protective safeguards requirements
- Vacancy conditions
- Coinsurance changes
- Named storm deductibles

## OUTPUT FORMAT
Return valid JSON matching the schema provided.
Never include explanatory text outside the JSON structure.`;

// =============================================================================
// USER PROMPT BUILDER
// =============================================================================

export interface PropertyExtractionContext {
  evidenceCatalog: string;
  documentType: 'application' | 'quote' | 'binder' | 'policy' | 'endorsement' | 'dec_page' | 'schedule';
  existingData?: {
    carrier_name?: string;
    policy_number?: string;
    named_insured?: string;
  };
}

export function buildPropertyExtractionUserPrompt(context: PropertyExtractionContext): string {
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

Extract Commercial Property policy data. For each field include:
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
    }
  },
  "dates": {
    "effective_date": { "value": "YYYY-MM-DD", "evidence_ids": [], "confidence": 0, "status": "" },
    "expiration_date": { "value": "YYYY-MM-DD", "evidence_ids": [], "confidence": 0, "status": "" },
    "issue_date": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "form_details": {
    "form_type": { "value": "special", "evidence_ids": [], "confidence": 0, "status": "" },
    "is_iso_form": { "value": true, "evidence_ids": [], "confidence": 0, "status": "" },
    "form_number": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "valuation_summary": {
    "total_insured_value": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "total_building_value": { "value": 0, "evidence_ids": [], "confidence": 0, "status": "" },
    "total_bpp_value": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "is_blanket": { "value": false, "evidence_ids": [], "confidence": 0, "status": "" },
    "blanket_limit": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "coinsurance_percent": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "is_agreed_value": { "value": false, "evidence_ids": [], "confidence": 0, "status": "" },
    "margin_clause_percent": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "locations": [
    {
      "location_number": { "value": 1, "evidence_ids": [], "confidence": 0, "status": "" },
      "street": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "city": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "state": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "zip": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "territory": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "county": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "protection_class": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "occupancy": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
    }
  ],
  "buildings": [
    {
      "building_number": { "value": 1, "evidence_ids": [], "confidence": 0, "status": "" },
      "location_number": { "value": 1, "evidence_ids": [], "confidence": 0, "status": "" },
      "description": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "construction_type": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "occupancy": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "year_built": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "square_footage": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "stories": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "roof_type": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "roof_age": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "has_sprinklers": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "valuation_basis": { "value": "replacement_cost", "evidence_ids": [], "confidence": 0, "status": "" },
      "coinsurance_percent": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
    }
  ],
  "building_coverages": [
    {
      "building_number": { "value": 1, "evidence_ids": [], "confidence": 0, "status": "" },
      "location_number": { "value": 1, "evidence_ids": [], "confidence": 0, "status": "" },
      "building_limit": { "value": 0, "evidence_ids": [], "confidence": 0, "status": "" },
      "bpp_limit": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "tenant_improvements_limit": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "stock_limit": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
    }
  ],
  "business_income": {
    "is_included": { "value": false, "evidence_ids": [], "confidence": 0, "status": "" },
    "limit_type": { "value": "specific_limit", "evidence_ids": [], "confidence": 0, "status": "" },
    "limit": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "waiting_period_hours": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "extra_expense_included": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "ordinance_or_law": {
    "is_included": { "value": false, "evidence_ids": [], "confidence": 0, "status": "" },
    "coverage_a_limit": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "coverage_b_limit": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "coverage_c_limit": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "combined_limit": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "deductibles": [
    {
      "name": { "value": "All Other Perils", "evidence_ids": [], "confidence": 0, "status": "" },
      "peril": { "value": "aop", "evidence_ids": [], "confidence": 0, "status": "" },
      "amount": { "value": 0, "evidence_ids": [], "confidence": 0, "status": "" },
      "deductible_type": { "value": "flat", "evidence_ids": [], "confidence": 0, "status": "" },
      "percentage": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "applies_to": { "value": "per_occurrence", "evidence_ids": [], "confidence": 0, "status": "" }
    }
  ],
  "interests": [
    {
      "interest_type": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "name": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "address": {
        "street": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
        "city": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
        "state": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
        "zip": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
      },
      "loan_number": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "location_number": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "building_number": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
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
    "building_premium": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "bpp_premium": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "business_income_premium": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "policy_fee": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "terrorism_premium": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  }
}
\`\`\`

## EXTRACTION INSTRUCTIONS

1. **Locations/Buildings**: Look for Schedule of Locations/Buildings tables
2. **Limits**: Extract from coverage summary or schedule pages
3. **Deductibles**: CRITICAL - Extract ALL deductible types (AOP, Wind/Hail, Named Storm, Flood, etc.)
4. **BI/O&L**: Look for Business Income and Ordinance or Law sections
5. **Interests**: Check mortgagee/loss payee schedules
6. **Endorsements**: List all forms, flag high-impact categories

REMEMBER: NO GUESSING. Only extract what's in the evidence.`;
}

// =============================================================================
// BUILDING SCHEDULE EXTRACTION PROMPT
// =============================================================================

export function buildBuildingSchedulePrompt(evidenceCatalog: string): string {
  return `## TASK: Extract Building/Location Schedule

## EVIDENCE CATALOG
\`\`\`json
${evidenceCatalog}
\`\`\`

## EXTRACTION SCHEMA
Extract all buildings and their coverage limits:

\`\`\`json
{
  "locations": [
    {
      "location_number": number,
      "street": string,
      "city": string,
      "state": string,
      "zip": string,
      "territory": string | null,
      "county": string | null,
      "protection_class": string | null,
      "occupancy": string | null
    }
  ],
  "buildings": [
    {
      "building_number": number,
      "location_number": number,
      "description": string,
      "construction_type": "frame" | "joisted_masonry" | "noncombustible" | "masonry_noncombustible" | "modified_fire_resistive" | "fire_resistive",
      "year_built": number | null,
      "square_footage": number | null,
      "stories": number | null,
      "roof_type": string | null,
      "roof_age": number | null,
      "has_sprinklers": boolean | null,
      "valuation_basis": "replacement_cost" | "actual_cash_value" | "stated_amount" | "agreed_value",
      "coinsurance_percent": number | null
    }
  ],
  "coverages": [
    {
      "building_number": number,
      "location_number": number,
      "building_limit": number,
      "bpp_limit": number | null,
      "tenant_improvements_limit": number | null,
      "stock_limit": number | null
    }
  ]
}
\`\`\`

Look for:
- Schedule of Locations/Buildings pages
- Coverage tables with Bldg/Loc columns
- Construction codes (FR, JM, NC, MNC, MFR, FR)
- Coinsurance indicators (80%, 90%, 100%)`;
}

// =============================================================================
// DEDUCTIBLE EXTRACTION PROMPT
// =============================================================================

export function buildPropertyDeductiblePrompt(evidenceCatalog: string): string {
  return `## TASK: Extract ALL Property Deductibles

## EVIDENCE CATALOG
\`\`\`json
${evidenceCatalog}
\`\`\`

## CRITICAL: Property policies often have MULTIPLE deductibles

## EXTRACTION SCHEMA
Extract all deductibles from the evidence:

\`\`\`json
{
  "deductibles": [
    {
      "name": string,
      "peril": "aop" | "wind_hail" | "named_storm" | "hurricane" | "flood" | "earthquake" | "water_damage" | "theft" | "vandalism" | "freeze",
      "amount": number,
      "deductible_type": "flat" | "percentage_tiv" | "percentage_building" | "percentage_claim",
      "percentage": number | null,
      "applies_to": "per_occurrence" | "per_building" | "per_location" | "policy" | "tiv",
      "state_conditions": string[] | null
    }
  ]
}
\`\`\`

## DEDUCTIBLE CLUES
- "AOP Deductible" or "All Other Perils" → peril: "aop"
- "Wind/Hail" or "Windstorm" → peril: "wind_hail"
- "Named Storm" or "Hurricane" → peril: "named_storm" or "hurricane"
- "2%" or "5%" with building/TIV → percentage type
- "$X per occurrence" → applies_to: "per_occurrence"
- "Tier 1 Counties" or state lists → state_conditions`;
}
