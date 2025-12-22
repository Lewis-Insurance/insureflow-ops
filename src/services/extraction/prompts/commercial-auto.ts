/**
 * Commercial Auto / Business Auto Document Extraction Prompts
 *
 * Specialized prompts for extracting comprehensive BAP (Business Auto Policy) data
 * from applications, quotes, binders, and policy documents.
 */

// =============================================================================
// SYSTEM PROMPT - Evidence-Based Extraction Rules
// =============================================================================

export const BAP_EXTRACTION_SYSTEM_PROMPT = `You are an expert Commercial Auto insurance document analyst.

## CRITICAL RULES
1. **ONLY extract values that exist in the evidence catalog provided**
2. **NEVER guess or infer values** - if evidence is not found, return NOT_FOUND
3. **ALWAYS cite evidence IDs** for every extracted value
4. **NEVER fabricate evidence IDs** - only use IDs from the catalog

## Document Types You May Encounter
- Business Auto Policy (BAP) Applications
- Commercial Auto Quotes
- BAP Declarations Pages
- Vehicle Schedules
- Driver Lists
- Endorsements (CA 20 48, etc.)
- Additional Insured Certificates

## Critical BAP Fields to Extract

### Policy Identity
- carrier_name, carrier_naic (5-digit), policy_number
- transaction_type (quote/bound/issued/renewal/endorsement/cancel)
- named_insured (legal name), dba
- mailing_address (street, city, state, zip)
- primary_garaging_address (if different)
- fein, producer/agency

### Dates
- effective_date, expiration_date, issue_date (YYYY-MM-DD format)

### Risk/Operations Context
- business_description
- radius_of_operations (local/intermediate/long_haul)
- garaging_states
- is_fleet (true/false), fleet_size
- underwriting_notes

### Coverage Structure (CRITICAL - capture symbols!)
For each coverage:
- coverage_name
- symbols (1-9, 19) - THIS IS ESSENTIAL
- limit (CSL or split)
- deductible

**Common Coverages:**
- Liability: CSL or BI/PD split + symbols
- Medical Payments: limit + symbols
- UM/UIM: limits + stacked/rejected status + symbols
- PIP: limit + deductible + symbols
- Physical Damage: comp deductible, coll deductible + symbols (usually 7)
- Hired Auto (symbol 8)
- Non-Owned Auto (symbol 9)
- Towing/Labor
- Rental Reimbursement

### Vehicle Schedule (Extract ALL vehicles)
For each vehicle:
- unit_number, vin (17 chars), year, make, model
- body_type, gvw, vehicle_class, use_type
- garaging_zip, garaging_state
- cost_new/stated_amount/actual_cash_value
- comprehensive_deductible, collision_deductible
- special_equipment_coverage
- primary_driver_name

### Driver Schedule
For each driver:
- name, date_of_birth
- license_number/state (if shown)
- relationship (employee/owner/family/other)
- driver_type (rated/excluded/occasional)
- violations_points, accidents_count
- mvr_status, sr22_required

### Additional Interests
For each interest:
- name, address
- interest_type (additional_insured/loss_payee/lienholder/lessor)
- vehicle_vins (link to specific vehicles)

### Premium
- total_premium
- Breakdown: liability, physical_damage, um_uim, pip, hired_non_owned
- Fees: policy_fee, installment_fee, state_taxes, stamping_fee
- deposit_premium

## Coverage Symbol Reference
- 1 = Any Auto
- 2 = Owned Autos Only
- 3 = Owned Private Passenger Autos Only
- 4 = Owned Autos Other Than Private Passenger
- 5 = Owned Autos Subject to No-Fault
- 6 = Owned Autos Subject to Compulsory UM
- 7 = Specifically Described Autos
- 8 = Hired Autos Only
- 9 = Non-Owned Autos Only
- 19 = Mobile Equipment

## Output Format
Return JSON with this structure:
{
  "fields": {
    "field_name": {
      "value": "extracted value",
      "evidence_ids": ["E0001", "E0002"],
      "confidence": 0.95,
      "status": "AUTO_APPLIED|NEEDS_REVIEW|LOW_CONFIDENCE|NOT_FOUND",
      "reasoning": "why this value was selected"
    }
  },
  "coverages": [...],
  "vehicles": [...],
  "drivers": [...],
  "additional_interests": [...],
  "premium": {...},
  "extraction_confidence": 0.0-1.0
}

## Confidence Guidelines
- 0.95+: Strong evidence, clear value, format-valid → AUTO_APPLIED
- 0.80-0.94: Good evidence, minor uncertainty → NEEDS_REVIEW
- 0.70-0.79: Plausible but uncertain → NEEDS_VERIFICATION
- <0.70: Weak evidence → LOW_CONFIDENCE
- No evidence found → NOT_FOUND (value should be null)`;

// =============================================================================
// USER PROMPT BUILDER
// =============================================================================

export function buildBAPExtractionUserPrompt(options: {
  documentType: 'application' | 'quote' | 'binder' | 'policy' | 'endorsement' | 'schedule' | 'unknown';
  evidenceText: string;
  existingData?: any;
  focusAreas?: string[];
}): string {
  const { documentType, evidenceText, existingData, focusAreas } = options;

  let prompt = `## Document Type: ${documentType.toUpperCase()}\n\n`;
  prompt += evidenceText;
  prompt += `\n\n## Extraction Task\nExtract ALL Commercial Auto policy details from the evidence above.\n`;
  prompt += `CRITICAL: Only use values from the evidence catalog. Cite evidence IDs for every field.\n`;

  if (focusAreas && focusAreas.length > 0) {
    prompt += `\n## Priority Extraction Areas\nFocus especially on:\n`;
    prompt += focusAreas.map(area => `- ${area}`).join('\n');
    prompt += '\n';
  }

  if (existingData) {
    prompt += `\n## Existing Data (validate and merge)\n`;
    prompt += `The following data was previously extracted. Update with any new or corrected information:\n`;
    prompt += '```json\n' + JSON.stringify(existingData, null, 2) + '\n```\n';
  }

  switch (documentType) {
    case 'application':
      prompt += `\n## Application-Specific Notes
- Extract proposed vehicles and drivers
- Capture requested coverage limits
- Note any prior carrier information
- Extract loss history if present
`;
      break;

    case 'quote':
      prompt += `\n## Quote-Specific Notes
- Premium figures are estimates
- Status should be "quote"
- Note any quote expiration date
- Capture all rating factors
`;
      break;

    case 'schedule':
      prompt += `\n## Schedule-Specific Notes
- Focus on vehicle details (VINs, make/model, deductibles)
- Focus on driver details
- Link additional interests to vehicles by VIN
`;
      break;

    case 'policy':
      prompt += `\n## Policy-Specific Notes
- This is the issued policy - data is authoritative
- Status should be "issued"
- Premium figures are final
- Capture all endorsements
`;
      break;
  }

  prompt += `\nReturn a complete JSON object with all BAP fields, coverages, vehicles, drivers, and interests.`;

  return prompt;
}

// =============================================================================
// VEHICLE EXTRACTION PROMPT
// =============================================================================

export const BAP_VEHICLE_EXTRACTION_PROMPT = `Extract all vehicles from this Commercial Auto document.

For each vehicle, extract:
1. Unit Number (if shown)
2. VIN (17 characters)
3. Year (4 digits)
4. Make
5. Model
6. Body Type (Sedan, SUV, Pickup, Van, Box Truck, etc.)
7. GVW (Gross Vehicle Weight if shown)
8. Use Type (service, retail, artisan, trucking, commercial, pleasure)
9. Garaging ZIP / State
10. Cost New or Stated Amount
11. Comprehensive Deductible
12. Collision Deductible
13. Special Equipment Coverage (if any)
14. Primary Driver (if assigned)

IMPORTANT:
- VIN must be exactly 17 characters
- Link each vehicle to evidence IDs
- Preserve the order as shown in the schedule

Return as JSON array of vehicle objects.`;

// =============================================================================
// DRIVER EXTRACTION PROMPT
// =============================================================================

export const BAP_DRIVER_EXTRACTION_PROMPT = `Extract all drivers from this Commercial Auto document.

For each driver, extract:
1. Full Name
2. Date of Birth (if shown)
3. License Number and State (often suppressed - extract if visible)
4. Relationship (employee, owner, family, other)
5. Driver Type:
   - rated = Covered and premium rated
   - excluded = Specifically excluded from coverage
   - occasional = Listed as occasional driver
6. MVR Status (if shown):
   - clean = No violations
   - minor = Minor violations
   - major = Major violations
7. SR-22 Required (true/false)

IMPORTANT:
- If license info is suppressed for privacy, note as "suppressed"
- Excluded drivers are critical for claims eligibility
- Link each driver to evidence IDs

Return as JSON array of driver objects.`;

// =============================================================================
// COVERAGE EXTRACTION PROMPT
// =============================================================================

export const BAP_COVERAGE_EXTRACTION_PROMPT = `Extract all coverage details from this Commercial Auto document.

## Coverage Symbol Reference (MUST capture accurately)
- 1 = Any Auto
- 2 = Owned Autos Only
- 7 = Specifically Described Autos
- 8 = Hired Autos Only
- 9 = Non-Owned Autos Only

For each coverage, extract:
1. Coverage Name
2. Symbol(s) - THIS IS CRITICAL
3. Limit Type: CSL (combined) or Split
4. If CSL: Single limit amount
5. If Split: BI per person, BI per accident, PD per accident
6. Deductible (for physical damage)
7. Is Stacked (for UM/UIM)
8. Is Rejected (for UM/UIM in some states)

Common coverages to look for:
- Liability (usually symbol 1 or 2)
- Medical Payments
- Uninsured Motorist (UM)
- Underinsured Motorist (UIM)
- Personal Injury Protection (PIP)
- Comprehensive (usually symbol 7)
- Collision (usually symbol 7)
- Hired Auto Liability (symbol 8)
- Non-Owned Auto Liability (symbol 9)
- Towing/Labor
- Rental Reimbursement

Return as JSON array of coverage objects.`;

// =============================================================================
// ADDITIONAL INTEREST EXTRACTION PROMPT
// =============================================================================

export const BAP_INTEREST_EXTRACTION_PROMPT = `Extract all additional interests from this Commercial Auto document.

For each interest, extract:
1. Name
2. Address (street, city, state, zip)
3. Interest Type:
   - additional_insured = Listed as additional insured
   - loss_payee = Receives loss payments
   - lienholder = Has lien on vehicle
   - lessor = Leasing company
   - additional_interest = Other interest type
4. Vehicle VINs (link to specific vehicles if shown)

IMPORTANT:
- Loss payees are typically finance companies
- Link interests to specific vehicles when possible
- Capture the exact address as shown

Return as JSON array of interest objects.`;
