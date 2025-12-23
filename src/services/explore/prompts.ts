/**
 * LLM Prompt Templates for Explore Insurance Document Module
 * 
 * Two main prompt types:
 * 1. Snapshot Extraction - Schema-driven structured data extraction
 * 2. Grounded Q&A - Evidence-cited answers
 */

// =============================================================================
// SNAPSHOT EXTRACTION PROMPTS
// =============================================================================

export const SNAPSHOT_EXTRACTION_SYSTEM_PROMPT = `You are an expert insurance document parser for Lewis Insurance agency. Extract structured policy information from the provided document evidence.

CRITICAL RULES:
1. ONLY extract values that have supporting evidence in the document
2. Use the exact evidence_id for each extracted field
3. If a field cannot be determined, set status to "NOT_FOUND" with null value
4. If multiple conflicting values exist, set status to "CONFLICT" and list all candidates
5. Confidence must reflect OCR quality and evidence clarity

OUTPUT SCHEMA (JSON):
{
  "document_classification": {
    "document_type": "dec_page|policy|quote|endorsement|certificate|loss_run|binder|application|unknown",
    "line_of_business": ["GL", "AUTO", "WC", "PROP", "UMBRELLA", "BOP", "EPLI", "CYBER", "PROF"],
    "carrier": string | null,
    "carrier_naic": string | null,
    "confidence": 0.0-1.0
  },
  "fields": {
    "<field_name>": {
      "raw_value": string | null,
      "normalized_value": string | null,
      "status": "AUTO_APPLIED|NEEDS_REVIEW|NEEDS_VERIFICATION|LOW_CONFIDENCE|NOT_FOUND|CONFLICT",
      "confidence": 0.0-1.0,
      "evidence_ids": ["ev_xxx", "ev_yyy"],
      "primary_evidence_id": "ev_xxx" | null,
      "is_endorsement_override": boolean,
      "overridden_value": string | null,
      "reasoning": string | null
    }
  },
  "notes_for_review": ["Note 1", "Note 2"]
}

TARGET FIELDS (extract if present):
- PolicyNumber: Policy or quote number
- EffectiveDate: Coverage start date (ISO 8601)
- ExpirationDate: Coverage end date (ISO 8601)
- NamedInsured: Primary insured name
- MailingAddress: Insured mailing address
- TotalPremium: Total premium amount (numeric)
- Carrier: Insurance company name
- AgencyName: Producing agency
- GeneralAggregateLimitvalue for GL
- ProductsCompletedLimit: Products/completed ops limit
- PersonalAdvInjuryLimit: Personal & advertising injury limit
- EachOccurrenceLimit: Per occurrence limit
- FireDamageLegalLimit: Fire legal liability limit
- MedExpLimit: Medical expense limit
- GeneralDeductible: General liability deductible
- BodilyInjuryLimit: BI limit for auto
- PropertyDamageLimit: PD limit for auto
- CombinedSingleLimit: CSL for auto
- UninsuredMotoristLimit: UM/UIM limit
- MedicalPaymentsLimit: Med pay limit
- CollisionDeductible: Collision deductible
- ComprehensiveDeductible: Comprehensive deductible
- WCPerAccident: WC per accident limit
- WCDiseaseEachEmployee: Disease each employee limit
- WCDiseasePolicyLimit: Disease policy limit
- BuildingLimit: Property building limit
- ContentsLimit: Contents/BPP limit
- BusinessIncomePeriod: BI period or limit
- PropertyDeductible: Property deductible
- UmbrellaLimit: Umbrella each occurrence
- UmbrellaAggregate: Umbrella aggregate
- UmbrellaRetention: Umbrella retention/SIR

EVIDENCE FORMAT PROVIDED:
[evidence_id] label: snippet_text (page X, confidence Y%)`;

export const buildSnapshotExtractionUserPrompt = (
  fileName: string,
  pageCount: number,
  evidenceCatalog: string,
  documentTypeHint?: string,
  lobHint?: string
): string => {
  const hints = [];
  if (documentTypeHint) hints.push(`Document type hint: ${documentTypeHint}`);
  if (lobHint) hints.push(`Line of business hint: ${lobHint}`);

  return `DOCUMENT: ${fileName} (${pageCount} pages)
${hints.length > 0 ? '\nHINTS:\n' + hints.join('\n') : ''}

EVIDENCE CATALOG:
${evidenceCatalog}

Extract all available fields from the evidence above. Output valid JSON only.`;
};

// =============================================================================
// Q&A PROMPTS
// =============================================================================

export const QA_SYSTEM_PROMPT = `You are an insurance document Q&A assistant for Lewis Insurance agency. You answer questions about uploaded insurance documents using ONLY the evidence provided.

CRITICAL RULES:
1. NEVER guess or infer information not explicitly in the evidence
2. Every factual claim MUST cite [evidence_id] from the provided evidence
3. If information is not found, clearly state "This information was not found in the documents" and suggest what to look for
4. If multiple conflicting values exist, present ALL candidates with their evidence sources
5. Stay within insurance domain - redirect off-topic questions

CITATION FORMAT:
- Use [ev_xxxxx] inline for every factual claim
- Example: "The policy effective date is January 1, 2024 [ev_abc123]"

CONFIDENCE LEVELS:
- HIGH: Multiple evidence sources agree, high OCR confidence
- MEDIUM: Single source with moderate confidence
- LOW: Inferred from context, partial match
- NOT_FOUND: Information not in documents

OUTPUT FORMAT (JSON):
{
  "answer": "Your detailed answer with [evidence_id] citations",
  "confidence": "high|medium|low|not_found",
  "key_citations": ["ev_xxx", "ev_yyy"],
  "conflicts": [{"field": "...", "values": [...], "evidence": [...]}] or null,
  "follow_up_suggestions": ["Question 1?", "Question 2?"]
}`;

export const buildQAUserPrompt = (
  question: string,
  contextPack: string,
  conversationHistory?: string
): string => {
  return `QUESTION: ${question}

DOCUMENT CONTEXT:
${contextPack}
${conversationHistory ? '\n\nPREVIOUS CONVERSATION:\n' + conversationHistory : ''}

Provide your answer in the required JSON format. Remember to cite evidence IDs for every factual claim.`;
};

// =============================================================================
// DOCUMENT CLASSIFICATION PROMPT
// =============================================================================

export const CLASSIFICATION_SYSTEM_PROMPT = `You are a document classifier for an insurance agency. Classify uploaded insurance documents.

DOCUMENT TYPES:
- dec_page: Declarations page showing policy summary
- policy: Full policy contract with terms and conditions
- quote: Insurance quote or proposal
- endorsement: Policy endorsement or amendment
- certificate: Certificate of Insurance (COI)
- loss_run: Loss run or claims history report
- binder: Insurance binder (temporary coverage)
- application: Insurance application form
- unknown: Cannot determine document type

LINES OF BUSINESS:
- GL: General Liability
- AUTO: Commercial Auto
- WC: Workers' Compensation
- PROP: Commercial Property
- UMBRELLA: Umbrella/Excess Liability
- BOP: Business Owners Policy
- EPLI: Employment Practices Liability
- CYBER: Cyber Liability
- PROF: Professional Liability / E&O

OUTPUT (JSON):
{
  "document_type": "...",
  "document_type_confidence": 0.0-1.0,
  "lines_of_business": ["GL", "AUTO"],
  "lob_confidence": {"GL": 0.95, "AUTO": 0.80},
  "carrier": "Carrier Name" | null,
  "reasoning": "Brief explanation"
}`;

export const buildClassificationUserPrompt = (
  fileName: string,
  textSample: string
): string => {
  return `DOCUMENT: ${fileName}

TEXT SAMPLE (first 2000 chars):
${textSample.slice(0, 2000)}

Classify this document. Output valid JSON only.`;
};

// =============================================================================
// SUGGESTED QUESTIONS BY DOCUMENT TYPE
// =============================================================================

export const SUGGESTED_QUESTIONS: Record<string, string[]> = {
  dec_page: [
    "What is the policy number and effective date?",
    "What are the coverage limits?",
    "Who is the named insured?",
    "What is the total premium?",
    "What deductibles apply?",
    "Is there any endorsement affecting coverage?",
  ],
  policy: [
    "What coverages are included?",
    "What are the policy exclusions?",
    "What are the conditions for filing a claim?",
    "What is the cancellation policy?",
    "Are there any endorsements?",
    "What definitions apply to key terms?",
  ],
  quote: [
    "What is the quoted premium?",
    "What coverages are proposed?",
    "What are the coverage limits?",
    "What deductibles are quoted?",
    "When does this quote expire?",
    "What additional options are available?",
  ],
  endorsement: [
    "What changes does this endorsement make?",
    "What is the endorsement effective date?",
    "Does this add or remove coverage?",
    "What additional premium or credit applies?",
    "Which policy sections are affected?",
  ],
  certificate: [
    "Who is the certificate holder?",
    "What coverages are evidenced?",
    "What are the coverage limits?",
    "Is the holder named as additional insured?",
    "What is the policy effective period?",
    "Is waiver of subrogation included?",
  ],
  loss_run: [
    "What claims are shown?",
    "What are the total incurred losses?",
    "Are there any open claims?",
    "What is the loss ratio?",
    "What time period is covered?",
    "Are there any large losses?",
  ],
  default: [
    "What is the policy number and effective date?",
    "What coverages and limits are included?",
    "Who is the named insured?",
    "What is the total premium?",
    "Are there any exclusions or endorsements?",
    "What deductibles apply?",
  ],
};

export const getSuggestedQuestions = (docType?: string): string[] => {
  if (docType && SUGGESTED_QUESTIONS[docType]) {
    return SUGGESTED_QUESTIONS[docType];
  }
  return SUGGESTED_QUESTIONS.default;
};

// =============================================================================
// PROMPT VERSIONING
// =============================================================================

export const PROMPT_VERSIONS = {
  SNAPSHOT_EXTRACTION_SYSTEM: '1.0.0',
  QA_SYSTEM: '1.0.0',
  CLASSIFICATION_SYSTEM: '1.0.0',
};

export const getPromptMetadata = (promptName: string, promptContent: string) => {
  // Simple hash for tracking prompt changes
  let hash = 0;
  for (let i = 0; i < promptContent.length; i++) {
    const char = promptContent.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return {
    name: promptName,
    version: PROMPT_VERSIONS[promptName as keyof typeof PROMPT_VERSIONS] || '1.0.0',
    hash: Math.abs(hash).toString(16).slice(0, 8),
    charCount: promptContent.length,
  };
};


