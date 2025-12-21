/**
 * Coverage Comparison Prompts
 *
 * Two-layer architecture:
 * - System prompts: Stable rules and behavior
 * - User prompts: Per-job context with evidence and schema
 *
 * CRITICAL: LLM is used ONLY for:
 * - Extracting PolicySnapshot from documents
 * - Generating narrative summaries from deterministic diffs
 * - Answering Q&A questions with citations
 *
 * LLM is NOT used for computing diffs - that's deterministic.
 */

import type {
  PolicySnapshot,
  SnapshotField,
  ComparisonResult,
  ComparisonDifference,
  DocMismatch,
  CoverageGap,
  DocumentType,
  LineOfBusiness,
  ExtractionProfile,
  EXTRACTION_PROFILES,
} from '@/types/coverage-comparison';

import type { EvidenceEntry } from '@/services/extraction/EvidenceCatalogBuilder';

// =============================================================================
// PROMPT VERSIONS
// =============================================================================

export const COMPARISON_PROMPT_VERSIONS = {
  POLICY_EXTRACTION_SYSTEM: '1.0.0',
  POLICY_EXTRACTION_USER: '1.0.0',
  COMPARISON_SUMMARY_SYSTEM: '1.0.0',
  COMPARISON_SUMMARY_USER: '1.0.0',
  COMPARISON_QA_SYSTEM: '1.0.0',
  COMPARISON_QA_USER: '1.0.0',
} as const;

// =============================================================================
// POLICY EXTRACTION SYSTEM PROMPT
// For extracting PolicySnapshot from a single document
// =============================================================================

export const POLICY_EXTRACTION_SYSTEM_PROMPT = `You are a Policy Extraction Engine for an insurance agency coverage comparison system.

## SCOPE
- You extract structured data from insurance documents (dec pages, quotes, policies, endorsements, loss runs)
- You map extracted data to a PolicySnapshot schema for comparison
- This is NOT a court workflow. Only insurance-agency auditability applies.

## NON-NEGOTIABLE RULES

### Rule 1: NO GUESSING
You must NEVER guess, infer, or invent field values. You may ONLY:
- Extract values that appear in the evidence catalog
- Return NOT_FOUND if no suitable evidence exists
- Return CONFLICT if multiple contradictory values exist

### Rule 2: EVIDENCE REQUIRED
Every field value you extract MUST be traceable to an evidence_id from the provided catalog.

### Rule 3: STRICT JSON OUTPUT
Your response must be valid JSON that conforms to the provided schema:
- No markdown formatting (no \`\`\`json blocks)
- No explanatory text outside the JSON
- All required fields must be present

### Rule 4: STATUS DETERMINATION
Assign status based on your confidence:
- AUTO_APPLIED: Confidence >= 0.95, strong evidence, format-valid
- NEEDS_REVIEW: Confidence 0.80-0.94, good evidence, minor uncertainty
- NEEDS_VERIFICATION: Confidence 0.70-0.79, plausible but needs review
- LOW_CONFIDENCE: Confidence < 0.70
- NOT_FOUND: No suitable evidence exists
- CONFLICT: Multiple equally valid but contradictory values

### Rule 5: DOCUMENT CLASSIFICATION
Detect the document type and line of business:
- Document types: dec_page, quote, policy, endorsement, loss_run, certificate, application, binder
- Lines of business: GL, AUTO, WC, PROP, UMBRELLA, BOP, EPLI, CYBER, PROF

### Rule 6: ENDORSEMENT HANDLING
If the document is an endorsement that modifies other values:
- Set is_endorsement_override = true for affected fields
- Record the original value in overridden_value
- Use the endorsement effective date

## OUTPUT STRUCTURE

Your response must be a JSON object with this structure:
{
  "document_classification": {
    "document_type": "<dec_page|quote|policy|endorsement|loss_run|etc>",
    "line_of_business": "<GL|AUTO|WC|PROP|UMBRELLA|etc>",
    "carrier": "<carrier name or null>",
    "carrier_naic": "<5-digit NAIC or null>",
    "confidence": <0.0-1.0>
  },
  "fields": {
    "<field_name>": {
      "raw_value": "<extracted text>",
      "normalized_value": "<normalized value>",
      "status": "AUTO_APPLIED|NEEDS_REVIEW|NEEDS_VERIFICATION|LOW_CONFIDENCE|NOT_FOUND|CONFLICT",
      "confidence": <0.0-1.0>,
      "evidence_ids": ["<evidence_id>", ...],
      "primary_evidence_id": "<main evidence_id>",
      "is_endorsement_override": <boolean>,
      "overridden_value": "<original value if override>",
      "reasoning": "<brief explanation>"
    }
  },
  "notes_for_review": [
    "<key issue requiring human attention>",
    ...
  ]
}`;

// =============================================================================
// POLICY EXTRACTION USER PROMPT BUILDER
// =============================================================================

export interface PolicyExtractionContext {
  jobId: string;
  workspaceId: string;
  documentId: string;
  docRole: 'A' | 'B';

  // Document metadata
  fileName: string;
  pageCount: number;
  qualityTier: string;

  // Extraction profile
  profile: ExtractionProfile;

  // Evidence catalog
  evidenceCatalog: Record<string, EvidenceEntry>;

  // Optional: hints from user
  documentTypeHint?: DocumentType;
  lobHint?: LineOfBusiness;
  carrierHint?: string;
}

export function buildPolicyExtractionUserPrompt(context: PolicyExtractionContext): string {
  const {
    jobId,
    workspaceId,
    documentId,
    docRole,
    fileName,
    pageCount,
    qualityTier,
    profile,
    evidenceCatalog,
    documentTypeHint,
    lobHint,
    carrierHint,
  } = context;

  const sections: string[] = [];

  // Job context
  sections.push(`## JOB CONTEXT
- Job ID: ${jobId}
- Workspace ID: ${workspaceId}
- Document ID: ${documentId}
- Document Role: ${docRole} (for comparison)
- File Name: ${fileName}
- Pages: ${pageCount}
- Quality: ${qualityTier}`);

  // Hints if provided
  if (documentTypeHint || lobHint || carrierHint) {
    const hints: string[] = [];
    if (documentTypeHint) hints.push(`- Document Type Hint: ${documentTypeHint}`);
    if (lobHint) hints.push(`- Line of Business Hint: ${lobHint}`);
    if (carrierHint) hints.push(`- Carrier Hint: ${carrierHint}`);
    sections.push(`## USER HINTS\n${hints.join('\n')}`);
  }

  // Target fields from profile
  const fieldsList = profile.targetFields
    .sort((a, b) => a.priority - b.priority)
    .map(f => `- ${f.fieldName} (${f.fieldType})${f.required ? ' [REQUIRED]' : ''}`);

  sections.push(`## TARGET FIELDS
Extract these fields for the PolicySnapshot:
${fieldsList.join('\n')}`);

  // Evidence catalog
  const evidenceList = Object.entries(evidenceCatalog)
    .slice(0, 100) // Limit to prevent prompt overflow
    .map(([id, evidence]) => {
      const preview = evidence.value?.substring(0, 100) || '';
      return `- ${id}: Page ${evidence.pageIndex + 1}, "${preview}"${evidence.value && evidence.value.length > 100 ? '...' : ''} (conf: ${(evidence.confidence * 100).toFixed(0)}%)`;
    });

  sections.push(`## EVIDENCE CATALOG (${Object.keys(evidenceCatalog).length} entries)
${evidenceList.join('\n')}`);

  // Anchor patterns for reliable extraction
  if (profile.anchorPatterns.length > 0) {
    const anchors = profile.anchorPatterns
      .map(a => `- "${a.pattern}" → ${a.fieldName}`);
    sections.push(`## ANCHOR PATTERNS
Look for these patterns to locate fields:
${anchors.join('\n')}`);
  }

  return sections.join('\n\n');
}

// =============================================================================
// COMPARISON SUMMARY SYSTEM PROMPT
// For generating narrative from deterministic diff
// =============================================================================

export const COMPARISON_SUMMARY_SYSTEM_PROMPT = `You are a Coverage Comparison Analyst for an insurance agency.

## SCOPE
- You generate executive summaries and recommendations from coverage comparison results
- You are given DETERMINISTIC diff results computed by a comparison engine
- Your job is to DESCRIBE the diffs in professional insurance language
- You do NOT compute or modify the diffs - they are already computed

## NON-NEGOTIABLE RULES

### Rule 1: USE ONLY PROVIDED DATA
You must ONLY describe differences that appear in the provided comparison result.
Do NOT invent or infer additional differences.

### Rule 2: PROFESSIONAL INSURANCE LANGUAGE
Write in clear, professional insurance terminology suitable for:
- Agency staff reviewing quotes
- Producers presenting to clients
- Underwriters reviewing submissions

### Rule 3: PRIORITIZE BY SEVERITY
Lead with critical and high-severity differences.
Group related differences logically.

### Rule 4: ACTIONABLE RECOMMENDATIONS
Provide specific, actionable recommendations:
- "Increase GL aggregate to $2M to match competitor quote"
- "Add products/completed ops coverage which is missing"
- NOT vague advice like "review the coverage differences"

### Rule 5: EVIDENCE AWARENESS
When referencing specific values, cite which document (A or B) they come from.

## OUTPUT STRUCTURE

Return JSON with:
{
  "executive_summary": "<2-3 sentence overview of most important differences>",
  "key_findings": [
    "<finding 1>",
    "<finding 2>",
    ...
  ],
  "recommendations": [
    "<specific recommendation 1>",
    "<specific recommendation 2>",
    ...
  ]
}`;

// =============================================================================
// COMPARISON SUMMARY USER PROMPT BUILDER
// =============================================================================

export interface ComparisonSummaryContext {
  // Document metadata
  documentAName: string;
  documentAType: DocumentType;
  documentACarrier: string | null;

  documentBName: string;
  documentBType: DocumentType;
  documentBCarrier: string | null;

  // Comparison results (deterministic)
  summary: {
    totalFieldsCompared: number;
    unchangedCount: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
  };

  // Top differences (limited to prevent prompt overflow)
  topDifferences: Array<{
    field: string;
    leftValue: string;
    rightValue: string;
    changeType: string;
    severity: string;
  }>;

  // Coverage gaps
  coverageGaps: Array<{
    coverageType: string;
    missingIn: 'A' | 'B';
    severity: string;
    description: string;
  }>;

  // Document mismatches
  docMismatches: Array<{
    type: string;
    description: string;
    severity: string;
  }>;
}

export function buildComparisonSummaryUserPrompt(context: ComparisonSummaryContext): string {
  const sections: string[] = [];

  // Document overview
  sections.push(`## DOCUMENTS COMPARED
Document A: ${context.documentAName}
- Type: ${context.documentAType}
- Carrier: ${context.documentACarrier || 'Unknown'}

Document B: ${context.documentBName}
- Type: ${context.documentBType}
- Carrier: ${context.documentBCarrier || 'Unknown'}`);

  // Summary statistics
  sections.push(`## COMPARISON SUMMARY
- Total Fields Compared: ${context.summary.totalFieldsCompared}
- Unchanged: ${context.summary.unchangedCount}
- Critical Differences: ${context.summary.criticalCount}
- High Differences: ${context.summary.highCount}
- Medium Differences: ${context.summary.mediumCount}
- Low Differences: ${context.summary.lowCount}`);

  // Document mismatches (if any)
  if (context.docMismatches.length > 0) {
    const mismatches = context.docMismatches
      .map(m => `- [${m.severity.toUpperCase()}] ${m.type}: ${m.description}`);
    sections.push(`## DOCUMENT MISMATCHES
${mismatches.join('\n')}`);
  }

  // Top differences
  if (context.topDifferences.length > 0) {
    const diffs = context.topDifferences
      .map(d => `- [${d.severity.toUpperCase()}] ${d.field}: ${d.leftValue} → ${d.rightValue} (${d.changeType})`);
    sections.push(`## TOP DIFFERENCES
${diffs.join('\n')}`);
  }

  // Coverage gaps
  if (context.coverageGaps.length > 0) {
    const gaps = context.coverageGaps
      .map(g => `- [${g.severity.toUpperCase()}] ${g.coverageType} missing in Document ${g.missingIn}: ${g.description}`);
    sections.push(`## COVERAGE GAPS
${gaps.join('\n')}`);
  }

  sections.push(`## TASK
Generate an executive summary, key findings, and actionable recommendations based on the above comparison results.`);

  return sections.join('\n\n');
}

// =============================================================================
// COMPARISON Q&A SYSTEM PROMPT
// =============================================================================

export const COMPARISON_QA_SYSTEM_PROMPT = `You are a Coverage Comparison Q&A Assistant for an insurance agency.

## SCOPE
- You answer questions about coverage comparison results
- You have access to PolicySnapshot A, PolicySnapshot B, and the comparison result
- You must cite evidence IDs and specify which document (A or B) you're referencing

## NON-NEGOTIABLE RULES

### Rule 1: EVIDENCE-BACKED ANSWERS
Every factual claim must cite:
- The evidence_id(s) supporting it
- Which document (A or B) it comes from

### Rule 2: NO GUESSING
If the information is not in the provided context, say "This information is not available in the comparison."

### Rule 3: CLEAR ATTRIBUTION
Always specify which document you're referencing:
- "Document A shows..." or "The first quote from [Carrier A] shows..."
- "Document B shows..." or "The second quote from [Carrier B] shows..."

### Rule 4: COMPARISON FOCUS
When asked about a specific field, compare both documents:
- What is the value in Document A?
- What is the value in Document B?
- Is this a critical difference?

## OUTPUT STRUCTURE

Return JSON with:
{
  "answer": "<your answer>",
  "citations": [
    {
      "evidence_id": "<id>",
      "doc_role": "A|B",
      "snippet": "<relevant text>",
      "relevance": "<why this is relevant>"
    }
  ],
  "confidence": <0.0-1.0>
}`;

// =============================================================================
// COMPARISON Q&A USER PROMPT BUILDER
// =============================================================================

export interface ComparisonQAContext {
  question: string;

  // Compact snapshot summaries
  snapshotASummary: {
    carrier: string | null;
    docType: DocumentType;
    insured: string;
    effectiveDate: string;
    expirationDate: string;
    keyLimits: Record<string, string>;
    premium: string | null;
  };

  snapshotBSummary: {
    carrier: string | null;
    docType: DocumentType;
    insured: string;
    effectiveDate: string;
    expirationDate: string;
    keyLimits: Record<string, string>;
    premium: string | null;
  };

  // Relevant differences (filtered to question topic if possible)
  relevantDifferences: Array<{
    field: string;
    leftValue: string;
    rightValue: string;
    severity: string;
  }>;

  // Evidence snippets (indexed by ID)
  evidenceSnippets: Record<string, {
    snippet: string;
    docRole: 'A' | 'B';
    page: number;
  }>;
}

export function buildComparisonQAUserPrompt(context: ComparisonQAContext): string {
  const sections: string[] = [];

  // User question
  sections.push(`## USER QUESTION
${context.question}`);

  // Document A summary
  const limitsA = Object.entries(context.snapshotASummary.keyLimits)
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join('\n');

  sections.push(`## DOCUMENT A SUMMARY
- Carrier: ${context.snapshotASummary.carrier || 'Unknown'}
- Type: ${context.snapshotASummary.docType}
- Insured: ${context.snapshotASummary.insured}
- Term: ${context.snapshotASummary.effectiveDate} to ${context.snapshotASummary.expirationDate}
- Premium: ${context.snapshotASummary.premium || 'Not available'}
- Key Limits:
${limitsA}`);

  // Document B summary
  const limitsB = Object.entries(context.snapshotBSummary.keyLimits)
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join('\n');

  sections.push(`## DOCUMENT B SUMMARY
- Carrier: ${context.snapshotBSummary.carrier || 'Unknown'}
- Type: ${context.snapshotBSummary.docType}
- Insured: ${context.snapshotBSummary.insured}
- Term: ${context.snapshotBSummary.effectiveDate} to ${context.snapshotBSummary.expirationDate}
- Premium: ${context.snapshotBSummary.premium || 'Not available'}
- Key Limits:
${limitsB}`);

  // Relevant differences
  if (context.relevantDifferences.length > 0) {
    const diffs = context.relevantDifferences
      .map(d => `- ${d.field}: A=${d.leftValue}, B=${d.rightValue} [${d.severity}]`);
    sections.push(`## RELEVANT DIFFERENCES
${diffs.join('\n')}`);
  }

  // Evidence snippets
  if (Object.keys(context.evidenceSnippets).length > 0) {
    const snippets = Object.entries(context.evidenceSnippets)
      .slice(0, 20) // Limit
      .map(([id, s]) => `- ${id} (Doc ${s.docRole}, Page ${s.page}): "${s.snippet.substring(0, 80)}..."`);
    sections.push(`## EVIDENCE SNIPPETS
${snippets.join('\n')}`);
  }

  sections.push(`## TASK
Answer the user's question using the comparison data above. Cite evidence IDs and specify which document (A or B).`);

  return sections.join('\n\n');
}

// =============================================================================
// PROMPT METADATA HELPERS
// =============================================================================

/**
 * Generate a hash for prompt caching/deduplication
 */
export function hashPrompt(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).substring(0, 16);
}

/**
 * Get prompt metadata for tracking
 */
export function getPromptMetadata(
  promptType: keyof typeof COMPARISON_PROMPT_VERSIONS,
  promptContent: string
): {
  type: string;
  version: string;
  hash: string;
  charCount: number;
} {
  return {
    type: promptType,
    version: COMPARISON_PROMPT_VERSIONS[promptType],
    hash: hashPrompt(promptContent),
    charCount: promptContent.length,
  };
}
