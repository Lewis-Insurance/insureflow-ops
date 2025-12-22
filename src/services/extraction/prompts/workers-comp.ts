/**
 * Workers' Compensation Document Extraction Prompts
 *
 * Specialized prompts for extracting comprehensive WC policy data
 * from applications, quotes, binders, and policy documents.
 */

// =============================================================================
// SYSTEM PROMPT - Stable rules for WC extraction
// =============================================================================

export const WC_EXTRACTION_SYSTEM_PROMPT = `You are an expert insurance document analyst specializing in Workers' Compensation policies. Your task is to extract comprehensive policy data from WC documents.

## Document Types You May Encounter
- Workers' Compensation Applications (ACORD 130)
- WC Quote Documents
- WC Binders
- WC Policy Declarations Pages
- WC Endorsements
- Experience Modification Worksheets

## Critical WC-Specific Fields to Extract

### Policy Identity
- Carrier Name (exact as printed)
- NAIC Number (5-digit carrier code)
- Policy Number
- Status (Quote/Bound/Issued/Renewed/Cancelled)
- Named Insured (legal entity name)
- DBA (Doing Business As)
- FEIN/Tax ID
- Producer/Agency Name

### Addresses
- Mailing Address (street, city, state, zip)
- Primary Location Address (if different)

### Policy Dates
- Effective Date
- Expiration Date
- Issue Date (if shown)
- Policy Term (e.g., "12 months")

### Coverage Structure
- Policy Type (Standard, Assigned Risk, PEO, Ghost)
- Item 3.A States (States of Operation)
- Item 3.C States (Other States Insurance)
- Part One: Workers' Compensation (always "Statutory")
- Part Two: Employers Liability Limits:
  - Each Accident limit
  - Disease - Each Employee limit
  - Disease - Policy Limit
- Deductible (if any, with type and amount)

### Classifications (CRITICAL)
For each classification row, extract:
- State (2-letter code)
- Class Code (e.g., 8810, 5474)
- Description
- Exposure Basis (Payroll/Per Capita)
- Estimated Annual Payroll
- Rate (per $100 of payroll)
- Premium
- Whether it's the Governing Class
- Whether it's a Standard Exception (8810 clerical, 8742 outside sales)

### Experience Rating
- Experience Modification Factor (X-Mod) - format as decimal (e.g., 0.850, 1.150)
- X-Mod Effective Date
- Rating Bureau (NCCI or state bureau name)
- Schedule Rating Credit/Debit (percent)
- Merit Rating (if applicable)
- Premium Discount

### Premium Details
- Estimated Annual Premium (total)
- WC Premium Subtotal (before taxes)
- Expense Constant
- State Assessments
- Terrorism Charge (TRIA)
- Other Carrier Fees
- Total Taxes & Assessments
- Deposit Premium
- Payment Plan (monthly, quarterly, paid in full)
- Minimum Premium

### Officer/Owner Elections (VERY IMPORTANT)
For each officer/owner:
- Full Name
- Title (President, VP, Secretary, etc.)
- Ownership Percentage
- Included or Excluded from coverage
- Annual Remuneration (if shown)
- Duties (if described)

Also note:
- Sole Proprietor inclusion/exclusion
- Partner inclusion/exclusion
- LLC Member inclusion/exclusion
- Independent contractor coverage notes

### Employer Information
- Business Description
- Years in Business
- Nature of Operations
- Number of Employees
- Total Annual Payroll

## Extraction Rules

1. **Numeric Precision**
   - Extract dollar amounts without currency symbols
   - Extract percentages as decimals (15% = 0.15)
   - X-Mod should be 3 decimal places (0.850, 1.150)
   - Rates should be 4 decimal places

2. **Date Formatting**
   - Use ISO format: YYYY-MM-DD
   - If only month/year, use first of month

3. **State Codes**
   - Always use 2-letter state abbreviations
   - Mark monopolistic states (ND, OH, WA, WY)

4. **Classification Codes**
   - Preserve leading zeros (e.g., "0042" not "42")
   - Note governing class with "GOV" flag
   - Note standard exceptions with "EXC" flag

5. **Officer Elections**
   - "Included" means covered under the policy
   - "Excluded" means opted out of coverage
   - This is critical for claims eligibility

6. **Confidence Levels**
   - HIGH: Clearly visible, unambiguous text
   - MEDIUM: Partially visible or requires interpretation
   - LOW: Inferred or uncertain

## Output Format
Return a JSON object matching the WCPolicyDetails TypeScript interface with all extracted fields.
Include confidence_score (0-1) for the overall extraction.
Include field-level confidence where uncertain.`;

// =============================================================================
// USER PROMPT BUILDER - Per-document context
// =============================================================================

export function buildWCExtractionUserPrompt(options: {
  documentType: 'application' | 'quote' | 'binder' | 'policy' | 'endorsement' | 'mod_worksheet' | 'unknown';
  documentText: string;
  existingData?: any; // Previously extracted data to merge/validate
  focusAreas?: string[]; // Specific areas to prioritize
}): string {
  const { documentType, documentText, existingData, focusAreas } = options;

  let prompt = `## Document Type: ${documentType.toUpperCase()}

## Document Content
\`\`\`
${documentText}
\`\`\`

## Extraction Task
Extract ALL Workers' Compensation policy details from this document. Return a complete JSON object matching the WCPolicyDetails schema.

`;

  // Add focus areas if specified
  if (focusAreas && focusAreas.length > 0) {
    prompt += `## Priority Extraction Areas
Focus especially on these fields:
${focusAreas.map(area => `- ${area}`).join('\n')}

`;
  }

  // Add existing data for merge/validation
  if (existingData) {
    prompt += `## Existing Data (validate and merge)
The following data was previously extracted. Update with any new or corrected information:
\`\`\`json
${JSON.stringify(existingData, null, 2)}
\`\`\`

`;
  }

  // Document-specific instructions
  switch (documentType) {
    case 'application':
      prompt += `## Application-Specific Notes
- Extract proposed classifications and payroll estimates
- Capture all officer/owner information
- Note any prior carrier information
- Extract loss history if present
`;
      break;

    case 'quote':
      prompt += `## Quote-Specific Notes
- Premium figures are estimates
- Status should be "quote"
- Note any quote expiration date
- Capture all rating factors
`;
      break;

    case 'binder':
      prompt += `## Binder-Specific Notes
- Status should be "bound"
- Effective date is critical
- Coverage is confirmed but policy not yet issued
- Premium may be deposit or estimated
`;
      break;

    case 'policy':
      prompt += `## Policy-Specific Notes
- This is the issued policy - data is authoritative
- Status should be "issued"
- Capture all endorsements listed
- Premium figures are final
`;
      break;

    case 'mod_worksheet':
      prompt += `## Experience Mod Worksheet Notes
- Focus on X-Mod calculation
- Extract all loss data if shown
- Capture rating effective period
- Note any disputes or pending changes
`;
      break;
  }

  prompt += `
## Required Output Format
Return a JSON object with this structure:
{
  "identity": { ... },
  "dates": { ... },
  "coverage": { ... },
  "classifications": [ ... ],
  "experience_rating": { ... },
  "premium": { ... },
  "employer_info": { ... },
  "ownership_elections": { ... },
  "extraction_confidence": 0.0-1.0,
  "extraction_source": "ai_extracted",
  "extracted_at": "ISO timestamp"
}

Ensure all fields match the WCPolicyDetails TypeScript schema.`;

  return prompt;
}

// =============================================================================
// CLASSIFICATION EXTRACTION PROMPT
// =============================================================================

export const WC_CLASSIFICATION_EXTRACTION_PROMPT = `Extract all Workers' Compensation classification codes from this document.

For each classification, extract:
1. State (2-letter code)
2. Class Code (preserve leading zeros)
3. Description (full text)
4. Exposure Basis (Payroll, Per Capita, or Other)
5. Estimated Annual Payroll or Exposure Amount
6. Rate (per $100 of payroll, 4 decimal places)
7. Premium (calculated or shown)
8. Is Governing Class (true/false)
9. Is Standard Exception (true/false - applies to 8810, 8742)

Common class codes to look for:
- 8810: Clerical Office Employees
- 8742: Outside Salespersons
- 5474: Painting - Interior
- 5403: Carpentry - Residential
- 8017: Store - Retail
- 8018: Store - Wholesale
- 8832: Physicians & Clerical
- 8820: Attorney - All Employees

Return as JSON array of classification objects.`;

// =============================================================================
// OFFICER EXTRACTION PROMPT
// =============================================================================

export const WC_OFFICER_EXTRACTION_PROMPT = `Extract all Officer, Owner, Partner, and LLC Member information from this Workers' Compensation document.

For each person, extract:
1. Full Name
2. Title (President, Vice President, Secretary, Treasurer, Partner, Member, etc.)
3. Ownership Percentage (if shown)
4. Inclusion Status:
   - INCLUDED: Covered under the WC policy
   - EXCLUDED: Opted out of coverage (will not receive WC benefits)
5. Annual Remuneration (salary/pay if shown)
6. Duties Description (if provided)
7. Type: officer, partner, llc_member, or sole_proprietor

IMPORTANT: Officer inclusion/exclusion is critical for:
- Claims eligibility
- Premium calculation
- Legal compliance

Look for:
- "Officers are excluded" or "Officers are included" statements
- Individual election forms
- Checkboxes or X marks indicating inclusion/exclusion
- Remuneration figures listed

Return as JSON object with officers array and any sole_proprietor info.`;

// =============================================================================
// EXPERIENCE MOD EXTRACTION PROMPT
// =============================================================================

export const WC_EXPERIENCE_MOD_PROMPT = `Extract Experience Modification (X-Mod) information from this document.

Key fields to extract:
1. Experience Modification Factor (format as decimal, e.g., 0.850 for 15% credit, 1.150 for 15% debit)
2. Effective Date of the mod
3. Rating Bureau (NCCI, or state-specific bureau)
4. Schedule Rating:
   - Type (credit or debit)
   - Percentage
   - Factor
5. Merit Rating (if applicable)
6. Premium Discount percentage
7. Deductible Credit (if applicable)

X-Mod Interpretation:
- 1.000 = Unity (no modification)
- < 1.000 = Credit (better than average loss experience)
- > 1.000 = Debit (worse than average loss experience)

Return as JSON object matching WCExperienceRating schema.`;

// =============================================================================
// PREMIUM BREAKDOWN PROMPT
// =============================================================================

export const WC_PREMIUM_BREAKDOWN_PROMPT = `Extract the complete premium breakdown from this Workers' Compensation document.

Extract these premium components:
1. Estimated Annual Premium (total)
2. WC Premium Subtotal (before taxes/fees)
3. Expense Constant
4. State Assessments
5. Terrorism Charge (TRIA/TRIPRA)
6. Carrier Administration Fees
7. Other Fees or Surcharges
8. Total Taxes & Assessments
9. Deposit Premium
10. Payment Plan (monthly, quarterly, semi-annual, paid in full)
11. Minimum Premium (if applicable)

Also extract:
- Premium by state (if multi-state policy)
- Premium by classification (link to class codes)

Return as JSON object matching WCPremiumSummary schema.`;

// =============================================================================
// QUICK VALIDATION PROMPT
// =============================================================================

export const WC_VALIDATION_PROMPT = `Review this Workers' Compensation extraction for accuracy and completeness.

Check for:
1. X-Mod format (should be decimal like 0.850, not percentage like 85%)
2. Premium math (classifications + mods should approximate total)
3. State coverage consistency (classifications match covered states)
4. Officer elections completeness (all owners accounted for)
5. Date validity (effective before expiration)
6. Classification code validity (standard NCCI codes)

Return any errors or warnings found as JSON:
{
  "errors": [{ "field": "...", "message": "...", "severity": "high|medium|low" }],
  "warnings": [{ "field": "...", "message": "..." }],
  "suggestions": [{ "field": "...", "suggestion": "..." }]
}`;
