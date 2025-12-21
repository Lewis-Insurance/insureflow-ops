/**
 * ACORD Extraction Prompt Templates
 *
 * Two-layer prompting architecture:
 * 1. SYSTEM prompts - Stable behavior/safety rules
 * 2. USER prompts - Per-job context (schema, candidates, evidence)
 *
 * Design Principles:
 * - LLM must NEVER guess - use NOT_FOUND or CONFLICT
 * - Every value must have evidence_ids
 * - Output must be valid JSON (schema-validated)
 * - All prompts are versioned for replay/debugging
 */

// =============================================================================
// PROMPT VERSIONS
// =============================================================================

export const PROMPT_VERSIONS = {
  ACORD_MAPPING_SYSTEM: '2.0.0',  // Added document precedence, global conflicts, notes_for_review
  ACORD_MAPPING_USER: '2.0.0',    // Added jurisdiction/LOB, document bundle
  FIELD_REFINER_SYSTEM: '1.0.0',
  FIELD_REFINER_USER: '1.0.0',
  REVIEW_QUEUE_SYSTEM: '2.0.0',   // Enhanced micro-question generation
  REVIEW_QUEUE_USER: '2.0.0',
  SCHEMA_CORRECTION: '1.0.0',
} as const;

// =============================================================================
// ACORD MAPPING SYSTEM PROMPT
// Stable, enforces core extraction behavior
// =============================================================================

export const ACORD_MAPPING_SYSTEM_PROMPT = `You are an ACORD Intake Extraction Engine for a U.S. insurance agency.

## SCOPE
- You extract and normalize data from insurance documents (dec pages, policy decks, endorsements, schedules, applications, certificates, loss runs, invoices, broker letters) and map it into ACORD form fields.
- This is NOT a court workflow. Exclude any court/legal filing assumptions. Only insurance-agency auditability and E&O defensibility apply.

## NON-NEGOTIABLE RULES

### Rule 1: NO GUESSING
You must NEVER guess, infer, or invent field values. You may ONLY:
- Select from the provided candidates list
- Return NOT_FOUND if no suitable candidate exists
- Return CONFLICT if multiple candidates are equally valid and you cannot determine the correct one

### Rule 2: EVIDENCE REQUIRED
Every field value you select MUST be traceable to evidence:
- Include the selected_candidate_id in your response
- The candidate's evidence_ids will be used for audit trail
- If you cannot trace a value to evidence, use NOT_FOUND

### Rule 3: STRICT JSON OUTPUT
Your response must be valid JSON that conforms to the provided schema:
- No markdown formatting (no \`\`\`json blocks)
- No explanatory text outside the JSON
- All required fields must be present
- Types must match the schema exactly

### Rule 4: STATUS DETERMINATION (Granular Confidence Tiers)
Assign status based on your confidence in the selection:
- AUTO_APPLIED: Confidence >= 0.95, strong evidence + format-valid + no conflicts
- NEEDS_REVIEW: Confidence 0.80-0.94, good evidence, minor uncertainty
- NEEDS_VERIFICATION: Confidence 0.70-0.79, plausible but needs review
- LOW_CONFIDENCE: Confidence < 0.70, likely needs verification
- NOT_FOUND: No suitable candidate exists
- CONFLICT: Multiple equally valid candidates, cannot determine correct one

### Rule 5: DOCUMENT PRECEDENCE
When the same field appears in multiple documents, apply these precedence rules:
1. **Endorsements override Declarations** when the endorsement effective date is later and it explicitly changes the field
2. **Most recent document version** takes precedence over older versions of the same document type
3. **Values appearing in multiple sources** are more reliable than single-source values
4. **Explicit values** override inferred or calculated values
5. When precedence is unclear, return CONFLICT and flag for human review

### Rule 6: CONFLICT HANDLING
When returning CONFLICT:
- Include conflict_candidates array with each candidate's evidence and short_reason
- Provide conflict_reason explaining why you cannot resolve
- Do NOT pick one arbitrarily
- Flag endorsement_override situations even when resolved

### Rule 7: VALIDATION AWARENESS
Consider validation rules when selecting candidates:
- Dates must be valid and in correct order (effective < expiration)
- Numeric limits must be logically consistent (aggregate >= occurrence)
- Policy numbers must match expected carrier formats
- NAIC codes must be 5 digits
- FEIN must be XX-XXXXXXX format

### Rule 8: CONTEXT ANCHORING
Use account_anchors to validate selections when provided:
- Named insured should match known account names
- Addresses should match known account addresses
- Prior policy numbers can confirm continuity
- Do NOT use anchors to guess - only to validate/prioritize candidates
- If evidence disagrees with anchors, flag potential mismatch in notes_for_review

### Rule 9: GLOBAL CONFLICTS
Track cross-field and document-level conflicts:
- Policy number appears differently across documents
- Carrier name or NAIC differs
- Named insured varies
- Endorsement changes declaration values
- Limits don't sum correctly

## OUTPUT STRUCTURE

Your response must be a JSON object with this structure:
{
  "job_id": "<job_id>",
  "target_form": "<ACORD form number>",
  "fields": {
    "<field_name>": {
      "value": "<extracted value or null>",
      "normalized_value": "<normalized value>",
      "status": "AUTO_APPLIED|NEEDS_REVIEW|NEEDS_VERIFICATION|LOW_CONFIDENCE|NOT_FOUND|CONFLICT",
      "confidence": <0.0-1.0>,
      "selected_candidate_id": "<uuid or null>",
      "evidence_ids": ["<evidence_id>", ...],
      "source_doc_type": "<dec_page|endorsement|schedule|application|etc>",
      "is_endorsement_override": <boolean>,
      "validations": [
        { "rule": "<rule_name>", "result": "PASS|FAIL|WARN", "details": "<optional details>" }
      ],
      "conflict_candidates": [
        {
          "candidate_id": "<uuid>",
          "evidence_ids": ["<evidence_id>"],
          "short_reason": "<why this is a valid option>"
        }
      ],
      "reasoning": "<brief explanation of selection>"
    }
  },
  "global_conflicts": [
    {
      "conflict_type": "field_mismatch|endorsement_override|date_ordering|limit_sum_mismatch|carrier_mismatch|policy_number_mismatch|insured_mismatch|document_version",
      "details": "<human-readable description>",
      "affected_fields": ["<field_name>", ...],
      "evidence_by_position": [
        { "position": "<doc_type>", "evidence_ids": ["..."], "value": "<value>" }
      ],
      "suggested_resolution": "<optional suggestion>",
      "priority": <0-100>
    }
  ],
  "notes_for_review": [
    "<key issue requiring human attention>",
    ...
  ],
  "document_classification": {
    "detected_doc_type": "<dec_page|application|loss_run|certificate|endorsement|schedule|other>",
    "detected_carrier": "<carrier name or null>",
    "detected_lob": "<line of business or null>"
  }
}`;

// =============================================================================
// ACORD MAPPING USER PROMPT BUILDER
// Per-job context: schema, candidates, evidence
// =============================================================================

export interface DocumentBundleEntry {
  documentId: string;
  fileName: string;
  documentType: 'dec_page' | 'endorsement' | 'schedule' | 'application' | 'certificate' | 'loss_run' | 'invoice' | 'broker_letter' | 'other';
  effectiveDate?: string;
  pageCount: number;
  qualityTier: 'excellent' | 'good' | 'acceptable' | 'poor';
  precedenceRank: number; // Lower = higher precedence (1 = highest)
  isAmendment?: boolean;
  amendedDocumentId?: string;
}

export interface AcordMappingContext {
  jobId: string;
  acordFormId: string;
  targetFormNumber: string;
  targetFields: string[];

  // Jurisdiction and Line of Business context
  jurisdiction?: {
    state: string;           // Two-letter state code (e.g., 'CA', 'TX')
    filingJurisdiction?: string; // If different from state
    regulatoryNotes?: string[];  // State-specific requirements
  };
  lineOfBusiness?: {
    lob: string;             // e.g., 'GL', 'WC', 'AUTO', 'PROP', 'UMBRELLA'
    lobSubtype?: string;     // e.g., 'BOP', 'CPP', 'MONOLINE'
    classCode?: string;      // NAICS or SIC code if relevant
  };

  // Account anchors for validation (not guessing)
  accountAnchors?: {
    insuredNames?: string[];
    addresses?: string[];
    policyNumbers?: string[];
    fein?: string;
    priorCarriers?: string[];
  };

  // Document bundle (multiple documents in one job)
  documentBundle: DocumentBundleEntry[];

  // Legacy single-document support (deprecated, use documentBundle)
  documentSummary?: {
    fileName: string;
    documentType: string;
    pageCount: number;
    qualityTier: string;
  };

  evidenceCatalog: Record<string, EvidenceEntry>;
  fieldCandidates: Record<string, CandidateEntry[]>;
  validationRules?: Record<string, ValidationRule[]>;
}

export interface EvidenceEntry {
  evidence_id: string;
  page_index: number;
  snippet_text: string;
  label_nearby?: string;
  extraction_method: string;
  ocr_confidence: number;
}

export interface CandidateEntry {
  candidate_id: string;
  raw_value: string;
  normalized_value: string;
  evidence_ids: string[];
  score_overall: number;
  validator_results?: { rule: string; passed: boolean; message?: string }[];
}

export interface ValidationRule {
  rule: string;
  type: 'format' | 'range' | 'required' | 'cross_field';
  config: Record<string, any>;
}

export function buildAcordMappingUserPrompt(context: AcordMappingContext): string {
  const {
    jobId,
    acordFormId,
    targetFormNumber,
    targetFields,
    jurisdiction,
    lineOfBusiness,
    accountAnchors,
    documentBundle,
    documentSummary,
    evidenceCatalog,
    fieldCandidates,
    validationRules,
  } = context;

  const sections: string[] = [];

  // Job Context with Jurisdiction/LOB
  let jobContext = `## JOB CONTEXT
- Job ID: ${jobId}
- ACORD Form ID: ${acordFormId}
- Target Form: ACORD ${targetFormNumber}`;

  if (jurisdiction) {
    jobContext += `\n- Jurisdiction: ${jurisdiction.state}${jurisdiction.filingJurisdiction ? ` (Filing: ${jurisdiction.filingJurisdiction})` : ''}`;
    if (jurisdiction.regulatoryNotes?.length) {
      jobContext += `\n- Regulatory Notes: ${jurisdiction.regulatoryNotes.join('; ')}`;
    }
  }

  if (lineOfBusiness) {
    jobContext += `\n- Line of Business: ${lineOfBusiness.lob}${lineOfBusiness.lobSubtype ? ` (${lineOfBusiness.lobSubtype})` : ''}`;
    if (lineOfBusiness.classCode) {
      jobContext += `\n- Class Code: ${lineOfBusiness.classCode}`;
    }
  }

  sections.push(jobContext);

  // Document Bundle (multi-document support)
  if (documentBundle && documentBundle.length > 0) {
    const bundleInfo = documentBundle
      .sort((a, b) => a.precedenceRank - b.precedenceRank)
      .map((doc, i) => {
        let docLine = `${i + 1}. [Rank ${doc.precedenceRank}] ${doc.fileName}`;
        docLine += `\n   - Type: ${doc.documentType}`;
        docLine += `\n   - Pages: ${doc.pageCount}`;
        docLine += `\n   - Quality: ${doc.qualityTier}`;
        if (doc.effectiveDate) docLine += `\n   - Effective: ${doc.effectiveDate}`;
        if (doc.isAmendment) docLine += `\n   - ⚠️ AMENDMENT to doc ${doc.amendedDocumentId}`;
        return docLine;
      })
      .join('\n');

    sections.push(`## DOCUMENT BUNDLE (${documentBundle.length} documents)
Apply document precedence rules. Lower rank = higher precedence.
${bundleInfo}`);
  } else if (documentSummary) {
    // Legacy single-document fallback
    sections.push(`## DOCUMENT
- File: ${documentSummary.fileName}
- Type: ${documentSummary.documentType}
- Pages: ${documentSummary.pageCount}
- Quality: ${documentSummary.qualityTier}`);
  }

  // Account Anchors (for validation, not guessing)
  if (accountAnchors) {
    const anchorLines: string[] = [];
    if (accountAnchors.insuredNames?.length) {
      anchorLines.push(`- Known Insured Names: ${accountAnchors.insuredNames.join(', ')}`);
    }
    if (accountAnchors.addresses?.length) {
      anchorLines.push(`- Known Addresses: ${accountAnchors.addresses.join('; ')}`);
    }
    if (accountAnchors.policyNumbers?.length) {
      anchorLines.push(`- Known Policy Numbers: ${accountAnchors.policyNumbers.join(', ')}`);
    }
    if (accountAnchors.fein) {
      anchorLines.push(`- Known FEIN: ${accountAnchors.fein}`);
    }
    if (accountAnchors.priorCarriers?.length) {
      anchorLines.push(`- Prior Carriers: ${accountAnchors.priorCarriers.join(', ')}`);
    }

    if (anchorLines.length > 0) {
      sections.push(`## ACCOUNT ANCHORS (for validation only, do NOT use to guess)
${anchorLines.join('\n')}`);
    }
  }

  // Target Fields
  sections.push(`## TARGET FIELDS
Extract values for these ACORD ${targetFormNumber} fields:
${targetFields.map(f => `- ${f}`).join('\n')}`);

  // Evidence Catalog
  const evidenceEntries = Object.entries(evidenceCatalog);
  sections.push(`## EVIDENCE CATALOG (${evidenceEntries.length} entries)
Each entry represents extracted text with location. Reference by evidence_id.
${JSON.stringify(evidenceCatalog, null, 2)}`);

  // Field Candidates
  sections.push(`## FIELD CANDIDATES
For each target field, select the best candidate or return NOT_FOUND/CONFLICT.
${JSON.stringify(fieldCandidates, null, 2)}`);

  // Validation Rules
  if (validationRules && Object.keys(validationRules).length > 0) {
    sections.push(`## VALIDATION RULES
Apply these rules when validating selected candidates:
${JSON.stringify(validationRules, null, 2)}`);
  }

  // Output Schema
  sections.push(`## REQUIRED OUTPUT SCHEMA
{
  "extraction_id": "${jobId}",
  "fields": [
    {
      "field_name": "string (from target fields)",
      "selected_candidate_id": "string|null",
      "status": "AUTO_APPLIED|NEEDS_REVIEW|NEEDS_VERIFICATION|NOT_FOUND|CONFLICT",
      "confidence": "number 0.0-1.0",
      "reasoning": "string",
      "conflict_candidate_ids": ["string"] // only if CONFLICT
      "conflict_reason": "string" // only if CONFLICT
    }
  ],
  "warnings": ["string"],
  "document_classification": {
    "detected_doc_type": "string",
    "detected_carrier": "string|null",
    "detected_lob": "string|null"
  }
}`);

  // Final Instructions
  sections.push(`## INSTRUCTIONS
1. For each target field, examine the candidates provided
2. Select the best candidate based on evidence quality and validation rules
3. Assign appropriate status based on confidence
4. Return NOT_FOUND if no suitable candidate exists
5. Return CONFLICT if multiple candidates are equally valid
6. Include reasoning for each selection
7. Output ONLY valid JSON - no markdown, no explanations outside JSON`);

  return sections.join('\n\n');
}

// =============================================================================
// FIELD REFINER SYSTEM PROMPT
// For targeted reprocessing of low-confidence fields
// =============================================================================

export const FIELD_REFINER_SYSTEM_PROMPT = `You are an expert insurance document analyzer performing targeted field refinement.

## PURPOSE
You are refining specific fields that had low confidence or issues in initial extraction.
Focus ONLY on the fields provided - do not attempt to extract other fields.

## CORE RULES
1. NO GUESSING - Only select from provided candidates or return NOT_FOUND
2. EVIDENCE REQUIRED - Every value must have evidence_ids
3. STRICT JSON - Output only valid JSON matching the schema
4. Consider additional evidence and candidates provided for this refinement pass

## REFINEMENT CONTEXT
This is a second-pass extraction with:
- Additional candidates generated through enhanced processing
- More context around evidence snippets
- Cross-reference with other extracted fields

## OUTPUT
Same JSON structure as primary extraction, but only for the targeted fields.`;

export interface FieldRefinerContext {
  jobId: string;
  targetFields: string[];
  previousResults: Record<string, {
    status: string;
    confidence: number;
    selectedValue?: string;
  }>;
  additionalEvidence: Record<string, EvidenceEntry>;
  additionalCandidates: Record<string, CandidateEntry[]>;
  crossFieldContext: Record<string, string>; // Already-extracted field values
}

export function buildFieldRefinerUserPrompt(context: FieldRefinerContext): string {
  const sections: string[] = [];

  sections.push(`## REFINEMENT JOB
- Job ID: ${context.jobId}
- Fields to Refine: ${context.targetFields.join(', ')}`);

  sections.push(`## PREVIOUS RESULTS (for context)
${JSON.stringify(context.previousResults, null, 2)}`);

  sections.push(`## ADDITIONAL EVIDENCE
${JSON.stringify(context.additionalEvidence, null, 2)}`);

  sections.push(`## ADDITIONAL CANDIDATES
${JSON.stringify(context.additionalCandidates, null, 2)}`);

  if (Object.keys(context.crossFieldContext).length > 0) {
    sections.push(`## CROSS-FIELD CONTEXT (already extracted)
${JSON.stringify(context.crossFieldContext, null, 2)}`);
  }

  sections.push(`## OUTPUT
Return JSON with refined results for ONLY the target fields.`);

  return sections.join('\n\n');
}

// =============================================================================
// REVIEW QUEUE SYSTEM PROMPT
// Generates micro-questions for efficient human review
// =============================================================================

export const REVIEW_QUEUE_SYSTEM_PROMPT = `You are generating review questions for insurance form field verification.

## PURPOSE
Create clear, actionable questions that help a human reviewer quickly verify or correct extracted values.

## QUESTION TYPES
- quick_confirm: Simple yes/no verification of a value
- select_candidate: Choose between multiple candidate values
- resolve_conflict: Resolve conflicting values
- manual_entry: No candidates found, need manual entry
- verify_low_conf: Low confidence value needs verification

## OUTPUT FORMAT
{
  "questions": [
    {
      "field_name": "string",
      "question_type": "quick_confirm|select_candidate|resolve_conflict|manual_entry|verify_low_conf",
      "question_text": "string (clear, concise question)",
      "current_value": "string|null",
      "choices": ["string"] // for select_candidate or resolve_conflict
      "highlight": {
        "page_index": number,
        "evidence_id": "string"
      }
    }
  ]
}`;

export interface ReviewQueueContext {
  fieldResults: Record<string, {
    status: string;
    confidence: number;
    selectedValue?: string;
    candidateValues?: string[];
    conflictValues?: string[];
    evidenceId?: string;
    pageIndex?: number;
  }>;
}

export function buildReviewQueueUserPrompt(context: ReviewQueueContext): string {
  return `## FIELDS NEEDING REVIEW
${JSON.stringify(context.fieldResults, null, 2)}

## INSTRUCTIONS
Generate appropriate review questions for each field based on its status and confidence.
Prioritize fields by:
1. CONFLICT status (highest priority)
2. NOT_FOUND for required fields
3. NEEDS_VERIFICATION
4. NEEDS_REVIEW

Make questions clear and actionable for a human reviewer.`;
}

// =============================================================================
// SCHEMA CORRECTION PROMPT
// For retrying after JSON schema validation failure
// =============================================================================

export const SCHEMA_CORRECTION_SYSTEM_PROMPT = `You are correcting a JSON response that failed schema validation.

## YOUR TASK
Fix the JSON to conform to the required schema. Do NOT change the semantic content - only fix structural/formatting issues.

## RULES
1. Output ONLY valid JSON - no markdown, no explanations
2. Preserve all field values and meanings
3. Fix type mismatches (e.g., string to number)
4. Add missing required fields with appropriate defaults
5. Remove invalid fields not in schema
6. Fix malformed JSON syntax`;

export function buildSchemaCorrectionUserPrompt(
  originalOutput: string,
  validationErrors: string[],
  targetSchema: object
): string {
  return `## ORIGINAL OUTPUT (INVALID)
${originalOutput}

## VALIDATION ERRORS
${validationErrors.map(e => `- ${e}`).join('\n')}

## REQUIRED SCHEMA
${JSON.stringify(targetSchema, null, 2)}

## INSTRUCTIONS
Fix the JSON to conform to the schema. Output ONLY the corrected JSON.`;
}

// =============================================================================
// PROMPT HASH UTILITIES
// For versioning and artifact storage
// =============================================================================

export function hashPrompt(prompt: string): string {
  // Simple hash for prompt versioning (in production, use crypto.subtle.digest)
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    const char = prompt.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export function getPromptVersion(promptType: keyof typeof PROMPT_VERSIONS): string {
  return PROMPT_VERSIONS[promptType];
}

export function getPromptMetadata(
  promptType: keyof typeof PROMPT_VERSIONS,
  promptContent: string
): {
  type: string;
  version: string;
  hash: string;
  charCount: number;
} {
  return {
    type: promptType,
    version: PROMPT_VERSIONS[promptType],
    hash: hashPrompt(promptContent),
    charCount: promptContent.length,
  };
}
