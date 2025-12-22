/**
 * Cyber Liability Policy Extraction Prompts
 *
 * Two-layer prompt architecture for Azure Document Intelligence + Claude extraction.
 * Handles first-party and third-party cyber coverages.
 */

export const CYBER_LIABILITY_SYSTEM_PROMPT = `You are an expert insurance policy analyst specializing in Cyber Liability insurance. Your task is to extract structured data from cyber policies with high accuracy.

## Domain Expertise

Cyber liability policies typically include two main coverage categories:

### First-Party Coverages (Insured's Own Losses)
1. **Data Breach Response**: Forensics, notification, credit monitoring, PR, legal
2. **Cyber Extortion/Ransomware**: Ransom payments, negotiation expenses
3. **Business Interruption**: Lost income during cyber incident
4. **Data Restoration**: Recreating lost data, software, systems
5. **Social Engineering**: Fraudulent funds transfers via deception
6. **System Failure**: BI from non-malicious system outages (if covered)

### Third-Party Coverages (Claims from Others)
1. **Network Security Liability**: Claims from breaches affecting others
2. **Privacy Liability**: Claims from improper data handling
3. **Media Liability**: Defamation, copyright infringement online
4. **Technology E&O**: Professional liability for tech services

## Critical Fields to Extract

### Limits Structure
- Policy aggregate limit
- Per-occurrence or per-claim limit
- Sublimits for each coverage part
- Defense costs position (inside/outside limits)

### Deductibles
- Per-claim deductible
- Coverage-specific deductibles
- Business interruption waiting period (in hours)
- Retention type (deductible vs SIR)

### Claims-Made Provisions (CRITICAL)
- Policy form: claims-made vs occurrence
- Retroactive date (affects prior acts coverage)
- Full prior acts? (no retro date)
- Extended Reporting Period (ERP/tail) availability
- Basic ERP days included
- Supplemental ERP options (duration, cost, deadline)

### Breach Response Components
- Forensic investigation limit
- Notification costs (per-person cap?)
- Credit monitoring (duration)
- Call center costs
- Public relations expenses
- Breach coach requirement (panel firms?)

### Ransomware/Extortion
- Ransom payment covered?
- Cryptocurrency payments allowed?
- Extortion expenses
- Waiting period before coverage triggers

### Business Interruption
- Waiting period (hours)
- Period of restoration (days)
- Daily limit vs actual loss
- Dependent business BI
- Contingent BI (third-party vendors)
- System failure coverage (non-malicious)

### Regulatory
- Regulatory defense covered?
- Regulatory fines/penalties covered?
- PCI-DSS fines covered?
- "Where insurable by law" language

### Incident Response Panel
- Breach coach required?
- Pre-approved vendor list
- Pre-approval threshold for expenses

## High-Impact Items to Flag

1. **Social Engineering sublimit**: Often low ($100K-$250K) - major gap
2. **Ransomware sublimit**: May be separate from extortion limit
3. **System failure exclusion**: Many policies exclude non-malicious outages
4. **War/nation-state exclusion**: Critical for sophisticated attacks
5. **Infrastructure failure exclusion**: Power grid, internet backbone
6. **Failure to maintain security exclusion**: Unpatched systems
7. **Retroactive date**: Affects coverage for prior unknown breaches

## Output Format

Return a JSON object matching the CyberLiabilityExtractedData interface. For each field:
1. Extract the exact value from the document
2. Note the page number and location where found
3. Assign a confidence score (0.0-1.0)
4. If a field is not found, use null and note "NOT_FOUND"`;

export const CYBER_LIABILITY_USER_PROMPT = `Analyze this cyber liability policy document and extract all relevant data.

## Document Context
{{document_context}}

## OCR Text with Bounding Boxes
{{ocr_results}}

## Extraction Instructions

1. **Identify Policy Form**
   - Claims-made or occurrence
   - Carrier and policy number
   - Policy period

2. **Extract Limits Tower**
   - Overall aggregate
   - Per-claim/occurrence limit
   - Each coverage sublimit
   - Defense costs inside or outside

3. **Map First-Party Coverages**
   For each coverage (breach response, extortion, BI, data restoration, social engineering):
   - Is it included?
   - What's the limit/sublimit?
   - What's the deductible?
   - Any special conditions?

4. **Map Third-Party Coverages**
   For each coverage (network security, privacy, media, tech E&O):
   - Is it included?
   - What's the limit/sublimit?
   - What's the deductible?
   - Defense costs position?

5. **Claims-Made Details** (if applicable)
   - Retroactive date (exact date or "full prior acts")
   - ERP/tail availability and terms
   - Continuity provisions

6. **Business Interruption Details**
   - Waiting period (critical - affects small incidents)
   - Period of restoration
   - System failure coverage?
   - Contingent BI?

7. **Incident Response Panel**
   - Required breach coach firms
   - Pre-approval requirements
   - Hotline numbers

8. **High-Impact Endorsements**
   - Coverage extensions
   - Exclusion endorsements
   - Sublimit endorsements

Return the extracted data as a JSON object:

{
  "policy_number": string,
  "policy_period": { "effective_date": string, "expiration_date": string },
  "named_insured": { "name": string, "address": {...} },
  "policy_form": "claims_made" | "occurrence",
  "carrier_type": string,
  "limits": {
    "policy_aggregate": number,
    "per_occurrence_limit": number,
    "defense_costs_position": string
  },
  "deductibles": {
    "per_claim_deductible": number,
    "bi_waiting_period_hours": number,
    ...
  },
  "first_party": {
    "data_breach_response": {...},
    "cyber_extortion": {...},
    "business_interruption": {...},
    "data_restoration": {...},
    "social_engineering": {...}
  },
  "third_party": {
    "network_security_liability": {...},
    "privacy_liability": {...},
    "media_liability": {...},
    "technology_eo": {...}
  },
  "claims_made": {...},
  "incident_response": {...},
  "endorsements": [...],
  "notable_exclusions": [...],
  "premium": {...},
  "extraction_metadata": {...},
  "field_evidence": {...}
}`;

export const CYBER_FIELD_DEFINITIONS = {
  policy_form: {
    description: 'Claims-made or occurrence form',
    required: true,
    enum: ['claims_made', 'occurrence'],
  },
  'limits.policy_aggregate': {
    description: 'Overall policy aggregate limit',
    required: true,
    type: 'currency',
  },
  'deductibles.per_claim_deductible': {
    description: 'Standard per-claim deductible',
    required: true,
    type: 'currency',
  },
  'first_party.data_breach_response.included': {
    description: 'Whether breach response coverage is included',
    required: true,
    type: 'boolean',
  },
  'first_party.business_interruption.waiting_period_hours': {
    description: 'BI waiting period in hours',
    required: false,
    type: 'number',
  },
  'claims_made.retroactive_date': {
    description: 'Retroactive date for claims-made coverage',
    required: false,
    type: 'date',
  },
};

export const CYBER_VALIDATION_RULES = [
  {
    rule: 'claims_made_retro',
    description: 'Claims-made policies should have retroactive date or full prior acts flag',
    validate: (data: any) => {
      if (data.policy_form !== 'claims_made') return true;
      return data.claims_made?.retroactive_date || data.claims_made?.full_prior_acts;
    },
  },
  {
    rule: 'bi_waiting_period',
    description: 'Business interruption should have waiting period if included',
    validate: (data: any) => {
      if (!data.first_party?.business_interruption?.included) return true;
      return data.first_party.business_interruption.waiting_period_hours !== undefined;
    },
  },
  {
    rule: 'social_engineering_sublimit',
    description: 'Social engineering sublimit should be flagged if significantly lower than aggregate',
    validate: (data: any) => {
      const se = data.first_party?.social_engineering;
      const agg = data.limits?.policy_aggregate;
      if (!se?.included || !se?.limit || !agg) return true;
      // Flag if SE limit is less than 25% of aggregate
      return se.limit >= agg * 0.25;
    },
  },
];

export const CYBER_HIGH_IMPACT_CHECKS = [
  {
    id: 'social_engineering_low',
    description: 'Social engineering sublimit is low relative to policy aggregate',
    check: (data: any) => {
      const se = data.first_party?.social_engineering;
      const agg = data.limits?.policy_aggregate;
      return se?.included && se?.limit && agg && se.limit < agg * 0.1;
    },
    severity: 'warning',
  },
  {
    id: 'no_ransomware_payment',
    description: 'Ransomware payment not covered',
    check: (data: any) => {
      return data.first_party?.cyber_extortion?.included &&
             !data.first_party?.cyber_extortion?.ransom_payment?.included;
    },
    severity: 'warning',
  },
  {
    id: 'no_system_failure',
    description: 'System failure (non-malicious) BI not covered',
    check: (data: any) => {
      return data.first_party?.business_interruption?.included &&
             !data.first_party?.business_interruption?.system_failure?.included;
    },
    severity: 'info',
  },
  {
    id: 'short_retro_date',
    description: 'Retroactive date is within 2 years (limited prior acts coverage)',
    check: (data: any) => {
      if (!data.claims_made?.retroactive_date) return false;
      const retro = new Date(data.claims_made.retroactive_date);
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      return retro > twoYearsAgo;
    },
    severity: 'warning',
  },
];
