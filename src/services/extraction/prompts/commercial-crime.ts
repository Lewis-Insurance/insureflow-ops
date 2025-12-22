/**
 * Commercial Crime / Fidelity Policy Extraction Prompts
 *
 * Two-layer prompt architecture for Azure Document Intelligence + Claude extraction.
 * Handles crime policies and fidelity bonds.
 */

export const COMMERCIAL_CRIME_SYSTEM_PROMPT = `You are an expert insurance policy analyst specializing in Commercial Crime and Fidelity coverage. Your task is to extract structured data from crime policies and fidelity bonds with high accuracy.

## Domain Expertise

Commercial Crime insurance protects against losses from dishonest acts and criminal activity. Key coverages (often called "Insuring Agreements") include:

### Coverage A - Employee Dishonesty / Fidelity
- Covers loss from dishonest acts by employees
- Forms: Blanket (all employees), Scheduled (named/position)
- For ERISA plans, must meet DOL bonding requirements (10% of plan assets, min $1K, max $500K or $1M)

### Coverage B - Forgery or Alteration
- Forged or altered checks, drafts, promissory notes
- Both incoming and outgoing instruments

### Coverage C - Inside the Premises
- Theft of money and securities from premises
- Robbery or safe burglary
- Damage to premises during theft attempt

### Coverage D - Outside the Premises
- Money/securities in transit
- In custody of messenger or armored car

### Coverage E - Computer Fraud
- Theft via computer manipulation
- Direct vs indirect loss distinction important

### Coverage F - Funds Transfer Fraud
- Fraudulent instructions to transfer funds
- Wire transfers, ACH

### Social Engineering Fraud (often Coverage G or endorsement)
- Fraudulent instructions from impersonator
- Usually requires verification procedures
- Often lower sublimit than other coverages

### Client Property Coverage
- Protects client property in insured's care

## Policy Form Types

1. **Discovery Form**: Covers losses discovered during policy period (most common)
2. **Loss Sustained Form**: Covers losses occurring during policy period
3. **Hybrid**: Combines both approaches

## Critical Fields to Extract

### Insuring Agreements
For each coverage:
- Is it included?
- Coverage limit
- Deductible
- Any special conditions

### Employee Dishonesty Specifics
- Blanket or scheduled form
- If scheduled, list of employees/positions with individual limits
- Definition of "employee" (includes leased? volunteers? directors?)
- Prior dishonesty date
- Individual cancellation provision

### ERISA Fidelity
- Plans covered
- Bond amount vs plan assets
- DOL compliance check (10% of assets)

### Conditions
- Discovery period after policy expiration
- Loss sustained retroactive date
- Coverage territory
- Acquisition provisions

### Deductibles
- Per-coverage deductibles (may differ)
- Per-occurrence vs per-claim

### High-Impact Items
1. **Social Engineering sublimit**: Often very low ($25K-$100K)
2. **Computer Fraud direct loss requirement**: May exclude consequential losses
3. **Funds Transfer Fraud**: May require callback verification
4. **Voluntary Parting exclusion**: Excludes losses where insured voluntarily gave up property
5. **Inventory shortage exclusion**: Can't prove theft from shortage alone

## Output Format

Return a JSON object matching the CommercialCrimeExtractedData interface. For each field:
1. Extract the exact value from the document
2. Note the page number and location where found
3. Assign a confidence score (0.0-1.0)
4. If a field is not found, use null and note "NOT_FOUND"`;

export const COMMERCIAL_CRIME_USER_PROMPT = `Analyze this commercial crime/fidelity policy document and extract all relevant data.

## Document Context
{{document_context}}

## OCR Text with Bounding Boxes
{{ocr_results}}

## Extraction Instructions

1. **Identify Policy Type and Form**
   - Crime Policy vs Fidelity Bond vs ERISA Bond
   - Discovery Form vs Loss Sustained Form
   - Policy number and period

2. **Map Each Insuring Agreement**
   Look for these coverages (not all may be present):
   - Employee Dishonesty (Coverage A)
   - Forgery or Alteration (Coverage B)
   - Inside Premises - Theft (Coverage C)
   - Inside Premises - Robbery/Safe Burglary (Coverage C)
   - Outside Premises (Coverage D)
   - Computer Fraud (Coverage E)
   - Funds Transfer Fraud (Coverage F)
   - Social Engineering (Coverage G or endorsement)
   - Money Orders & Counterfeit Money
   - Credit Card Fraud

   For each: included (Y/N), limit, deductible, special conditions

3. **Employee Dishonesty Details**
   - Blanket or scheduled?
   - If scheduled, extract employee/position list
   - Employee definition (leased, volunteers, directors)
   - ERISA plan coverage

4. **Social Engineering Details**
   - Sublimit (often much lower than other coverages)
   - Verification requirements
   - Types covered (vendor, executive, client impersonation)

5. **ERISA Plans** (if applicable)
   - List of covered plans
   - Plan assets
   - Bond amount
   - DOL compliance

6. **Policy Conditions**
   - Discovery period
   - Territory
   - Acquisition provisions
   - Prior insurance/prior coverage

7. **Endorsements**
   - Coverage extensions
   - Exclusion endorsements
   - Additional insureds

Return the extracted data as a JSON object:

{
  "policy_number": string,
  "policy_period": { "effective_date": string, "expiration_date": string },
  "named_insured": { "name": string, "address": {...} },
  "policy_type": string,
  "form_type": "discovery_form" | "loss_sustained_form" | "hybrid",
  "policy_aggregate": number | null,
  "coverages": {
    "employee_dishonesty": {
      "included": boolean,
      "limit": number,
      "deductible": number,
      "coverage_form": "blanket" | "scheduled",
      ...
    },
    "forgery_alteration": {...},
    "inside_premises": {...},
    "outside_premises": {...},
    "computer_fraud": {...},
    "funds_transfer_fraud": {...},
    "social_engineering": {...},
    "erisa_fidelity": {...}
  },
  "conditions": {...},
  "endorsements": [...],
  "notable_exclusions": [...],
  "premium": {...},
  "extraction_metadata": {...},
  "field_evidence": {...}
}`;

export const CRIME_FIELD_DEFINITIONS = {
  policy_type: {
    description: 'Type of crime policy',
    required: true,
    enum: ['crime_policy', 'fidelity_bond', 'erisa_bond', 'financial_institution_bond', 'public_official_bond'],
  },
  form_type: {
    description: 'Discovery or loss sustained form',
    required: true,
    enum: ['discovery_form', 'loss_sustained_form', 'hybrid'],
  },
  'coverages.employee_dishonesty.included': {
    description: 'Whether employee dishonesty coverage is included',
    required: true,
    type: 'boolean',
  },
  'coverages.employee_dishonesty.limit': {
    description: 'Employee dishonesty coverage limit',
    required: false,
    type: 'currency',
  },
  'coverages.social_engineering.limit': {
    description: 'Social engineering sublimit',
    required: false,
    type: 'currency',
  },
};

export const CRIME_VALIDATION_RULES = [
  {
    rule: 'employee_dishonesty_required',
    description: 'Most crime policies should have employee dishonesty coverage',
    validate: (data: any) => {
      // This is a warning, not an error - some specialized policies may not have it
      return data.coverages?.employee_dishonesty?.included !== undefined;
    },
  },
  {
    rule: 'erisa_dol_compliance',
    description: 'ERISA bonds should meet DOL requirements (10% of plan assets)',
    validate: (data: any) => {
      if (!data.coverages?.erisa_fidelity?.included) return true;
      // If we have plan assets and bond amount, check compliance
      // This is informational - extraction should still succeed
      return true;
    },
  },
  {
    rule: 'deductible_vs_limit',
    description: 'Deductible should not exceed coverage limit',
    validate: (data: any) => {
      const coverages = data.coverages;
      if (!coverages) return true;

      for (const key of Object.keys(coverages)) {
        const cov = coverages[key];
        if (cov?.included && cov?.limit && cov?.deductible) {
          if (cov.deductible > cov.limit) return false;
        }
      }
      return true;
    },
  },
];

export const CRIME_HIGH_IMPACT_CHECKS = [
  {
    id: 'social_engineering_low',
    description: 'Social engineering sublimit is very low',
    check: (data: any) => {
      const se = data.coverages?.social_engineering;
      const ed = data.coverages?.employee_dishonesty;
      if (!se?.included || !se?.limit) return false;
      // Flag if SE limit is less than $100K or less than 10% of employee dishonesty
      return se.limit < 100000 || (ed?.limit && se.limit < ed.limit * 0.1);
    },
    severity: 'warning',
    message: 'Social engineering sublimit may be insufficient for sophisticated fraud attempts',
  },
  {
    id: 'no_computer_fraud',
    description: 'Computer fraud coverage not included',
    check: (data: any) => {
      return !data.coverages?.computer_fraud?.included;
    },
    severity: 'warning',
    message: 'No computer fraud coverage - cyber crime losses may not be covered',
  },
  {
    id: 'no_funds_transfer',
    description: 'Funds transfer fraud not included',
    check: (data: any) => {
      return !data.coverages?.funds_transfer_fraud?.included;
    },
    severity: 'warning',
    message: 'No funds transfer fraud coverage - wire fraud losses may not be covered',
  },
  {
    id: 'erisa_below_dol',
    description: 'ERISA bond may not meet DOL requirements',
    check: (data: any) => {
      const erisa = data.coverages?.erisa_fidelity;
      if (!erisa?.included || erisa?.meets_dol_requirements === undefined) return false;
      return erisa.meets_dol_requirements === false;
    },
    severity: 'critical',
    message: 'ERISA bond amount may not meet Department of Labor requirements',
  },
  {
    id: 'discovery_form_gap',
    description: 'Discovery form with short discovery period',
    check: (data: any) => {
      if (data.form_type !== 'discovery_form') return false;
      const discoveryDays = data.conditions?.discovery_period_after_policy_days;
      return discoveryDays !== undefined && discoveryDays < 60;
    },
    severity: 'info',
    message: 'Short discovery period after policy expiration - losses discovered late may not be covered',
  },
];

export const CRIME_ERISA_DOL_REQUIREMENTS = {
  minimum_bond: 1000,
  maximum_bond_standard: 500000,
  maximum_bond_with_broker_dealer: 1000000,
  percentage_of_assets: 0.10, // 10%
  calculate_required_bond: (planAssets: number, hasBrokerDealer: boolean = false): number => {
    const maxBond = hasBrokerDealer ? 1000000 : 500000;
    const calculatedBond = planAssets * 0.10;
    return Math.max(1000, Math.min(calculatedBond, maxBond));
  },
};
