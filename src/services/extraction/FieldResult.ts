/**
 * Field Result Types and Status Standardization
 *
 * Consistent type system for extraction results:
 * - Standardized status values
 * - Confidence-based status determination
 * - Evidence and validation tracking
 * - Conflict handling (field-level and global)
 * - Document precedence tracking
 */

// =============================================================================
// STATUS TYPES
// =============================================================================

export type FieldStatus =
  | 'AUTO_APPLIED'       // >= 0.95 confidence, strong evidence, format-valid, no conflicts
  | 'NEEDS_REVIEW'       // 0.80-0.94 confidence, good evidence, minor uncertainty
  | 'NEEDS_VERIFICATION' // 0.70-0.79 confidence, plausible but needs review
  | 'LOW_CONFIDENCE'     // < 0.70 confidence, likely needs verification
  | 'NOT_FOUND'          // No suitable candidate exists
  | 'CONFLICT';          // Multiple equally valid candidates

// =============================================================================
// GLOBAL CONFLICT TYPES (Cross-field and document-level)
// =============================================================================

export type GlobalConflictType =
  | 'field_mismatch'           // Same field appears with different values across documents
  | 'endorsement_override'     // Endorsement changes a value from declaration
  | 'date_ordering'            // Dates don't make sense (exp before eff, etc.)
  | 'limit_sum_mismatch'       // Individual limits don't sum to aggregate
  | 'carrier_mismatch'         // Different carriers across documents
  | 'policy_number_mismatch'   // Different policy numbers across documents
  | 'insured_mismatch'         // Named insured differs across documents
  | 'document_version';        // Multiple versions of same document type

export interface GlobalConflict {
  /** Type of conflict */
  conflictType: GlobalConflictType;

  /** Human-readable description */
  details: string;

  /** Fields involved in this conflict */
  affectedFields: string[];

  /** Evidence IDs for each side of the conflict */
  evidenceByPosition: {
    position: string;  // e.g., "dec_page", "endorsement_1"
    evidenceIds: string[];
    value: string;
  }[];

  /** Suggested resolution */
  suggestedResolution?: string;

  /** Priority for review (higher = more important) */
  priority: number;
}

// =============================================================================
// CONFLICT CANDIDATE (Enhanced with short_reason)
// =============================================================================

export interface ConflictCandidate {
  /** Candidate ID */
  candidateId: string;

  /** Evidence supporting this candidate */
  evidenceIds: string[];

  /** Brief reason why this is a valid option */
  shortReason: string;

  /** The value */
  value: string;

  /** Confidence for this candidate */
  confidence: number;

  /** Source document type */
  sourceDocType?: string;
}

// =============================================================================
// FIELD RESULT TYPE
// =============================================================================

export interface FieldResult {
  /** ACORD field name (e.g., "NamedInsured", "PolicyNumber") */
  fieldName: string;

  /** Extracted raw value before normalization */
  rawValue: string | null;

  /** Normalized value for form population */
  normalizedValue: string | null;

  /** Status indicating confidence level or special state */
  status: FieldStatus;

  /** Raw confidence score from LLM (0-1) */
  confidenceRaw: number;

  /** Calibrated confidence based on historical accuracy (0-1) */
  confidenceCalibrated: number;

  /** ID of the selected candidate */
  selectedCandidateId: string | null;

  /** Evidence IDs supporting this value */
  evidenceIds: string[];

  /** Primary evidence ID (main source) */
  primaryEvidenceId: string | null;

  /** All candidate IDs that were considered */
  candidateIds: string[];

  /** Validation results for this field */
  validations: FieldValidation[];

  /** If CONFLICT: the conflicting candidate IDs */
  conflictCandidateIds?: string[];

  /** If CONFLICT: detailed conflict candidates with reasons */
  conflictCandidates?: ConflictCandidate[];

  /** If CONFLICT: explanation of the conflict */
  conflictReason?: string;

  /** LLM's reasoning for this selection */
  reasoning: string;

  /** Source document type where value was found */
  sourceDocType?: string;

  /** Whether this value was from an endorsement that overrides declaration */
  isEndorsementOverride?: boolean;

  /** Timestamp when auto-applied (if applicable) */
  autoAppliedAt?: string;

  /** User who reviewed/edited (if applicable) */
  reviewedBy?: string;

  /** Timestamp of review/edit */
  reviewedAt?: string;

  /** User-edited value (if changed from extracted) */
  editedValue?: string;

  /** Reason for edit */
  editReason?: string;
}

export interface FieldValidation {
  rule: string;
  passed: boolean;
  message?: string;
  severity: 'error' | 'warning' | 'info';
}

// =============================================================================
// CONFIDENCE THRESHOLDS (More granular tiers)
// =============================================================================

export const CONFIDENCE_THRESHOLDS = {
  AUTO_APPLY: 0.95,       // >= 0.95: AUTO_APPLIED (strong evidence + format-valid + no conflicts)
  NEEDS_REVIEW: 0.80,     // >= 0.80: NEEDS_REVIEW (good evidence, minor uncertainty)
  NEEDS_VERIFICATION: 0.70, // >= 0.70: NEEDS_VERIFICATION (plausible but needs review)
  LOW_CONFIDENCE: 0.00,   // < 0.70: LOW_CONFIDENCE (likely needs verification)
} as const;

// Field priority for review ordering (higher = more important)
export const FIELD_PRIORITY: Record<string, number> = {
  // Critical fields - must be correct
  PolicyNumber: 100,
  NamedInsured: 99,
  EffectiveDate: 98,
  ExpirationDate: 97,
  CarrierName: 96,
  CarrierNAIC: 95,

  // High priority - limits and financials
  GeneralAggregate: 90,
  EachOccurrence: 89,
  TotalPremium: 88,
  ProductsCompletedOps: 87,
  PersonalAdvInjury: 86,

  // Medium priority - identifiers
  FEIN: 80,
  SICCode: 79,
  NAICSCode: 78,

  // Standard priority - contact info
  MailingAddress: 70,
  MailingCity: 69,
  MailingState: 68,
  MailingZip: 67,
  Phone: 66,
  Email: 65,

  // Lower priority - supplemental info
  BusinessDescription: 50,
  YearsInBusiness: 49,
  NumberOfEmployees: 48,
};

// =============================================================================
// STATUS DETERMINATION
// =============================================================================

/**
 * Determine status from confidence score (more granular tiers)
 */
export function statusFromConfidence(confidence: number): FieldStatus {
  if (confidence >= CONFIDENCE_THRESHOLDS.AUTO_APPLY) {
    return 'AUTO_APPLIED';
  }
  if (confidence >= CONFIDENCE_THRESHOLDS.NEEDS_REVIEW) {
    return 'NEEDS_REVIEW';
  }
  if (confidence >= CONFIDENCE_THRESHOLDS.NEEDS_VERIFICATION) {
    return 'NEEDS_VERIFICATION';
  }
  return 'LOW_CONFIDENCE';
}

/**
 * Determine final status considering all factors
 */
export function determineFieldStatus(params: {
  confidence: number;
  hasValue: boolean;
  isConflict: boolean;
  validationErrors: number;
}): FieldStatus {
  const { confidence, hasValue, isConflict, validationErrors } = params;

  // Special states override confidence-based status
  if (!hasValue) {
    return 'NOT_FOUND';
  }
  if (isConflict) {
    return 'CONFLICT';
  }

  // Validation errors downgrade status
  if (validationErrors > 0) {
    const baseStatus = statusFromConfidence(confidence);
    if (baseStatus === 'AUTO_APPLIED') {
      return 'NEEDS_REVIEW';
    }
    if (baseStatus === 'NEEDS_REVIEW') {
      return 'NEEDS_VERIFICATION';
    }
    return baseStatus;
  }

  return statusFromConfidence(confidence);
}

// =============================================================================
// RESULT BUILDERS
// =============================================================================

export interface LLMFieldOutput {
  field_name: string;
  selected_candidate_id: string | null;
  status: string;
  confidence: number;
  reasoning: string;
  conflict_candidate_ids?: string[];
  conflict_reason?: string;
}

export interface CandidateData {
  candidate_id: string;
  raw_value: string;
  normalized_value: string;
  evidence_ids: string[];
}

/**
 * Build FieldResult from LLM output and candidate data
 */
export function buildFieldResult(
  llmOutput: LLMFieldOutput,
  candidates: Record<string, CandidateData>,
  validations: FieldValidation[] = []
): FieldResult {
  const selectedCandidate = llmOutput.selected_candidate_id
    ? candidates[llmOutput.selected_candidate_id]
    : null;

  // Recalculate status considering validations
  const validationErrors = validations.filter(v => !v.passed && v.severity === 'error').length;
  const finalStatus = determineFieldStatus({
    confidence: llmOutput.confidence,
    hasValue: !!selectedCandidate,
    isConflict: llmOutput.status === 'CONFLICT',
    validationErrors,
  });

  return {
    fieldName: llmOutput.field_name,
    rawValue: selectedCandidate?.raw_value || null,
    normalizedValue: selectedCandidate?.normalized_value || null,
    status: finalStatus,
    confidenceRaw: llmOutput.confidence,
    confidenceCalibrated: llmOutput.confidence, // Would be adjusted by calibration service
    selectedCandidateId: llmOutput.selected_candidate_id,
    evidenceIds: selectedCandidate?.evidence_ids || [],
    primaryEvidenceId: selectedCandidate?.evidence_ids?.[0] || null,
    candidateIds: Object.keys(candidates),
    validations,
    conflictCandidateIds: llmOutput.conflict_candidate_ids,
    conflictReason: llmOutput.conflict_reason,
    reasoning: llmOutput.reasoning,
  };
}

/**
 * Create a NOT_FOUND result
 */
export function buildNotFoundResult(fieldName: string, reasoning: string): FieldResult {
  return {
    fieldName,
    rawValue: null,
    normalizedValue: null,
    status: 'NOT_FOUND',
    confidenceRaw: 0,
    confidenceCalibrated: 0,
    selectedCandidateId: null,
    evidenceIds: [],
    primaryEvidenceId: null,
    candidateIds: [],
    validations: [],
    reasoning,
  };
}

/**
 * Create a CONFLICT result
 */
export function buildConflictResult(
  fieldName: string,
  conflictCandidateIds: string[],
  conflictReason: string,
  candidates: Record<string, CandidateData>
): FieldResult {
  return {
    fieldName,
    rawValue: null,
    normalizedValue: null,
    status: 'CONFLICT',
    confidenceRaw: 0.5, // Conflicts have medium-ish confidence
    confidenceCalibrated: 0.5,
    selectedCandidateId: null,
    evidenceIds: conflictCandidateIds.flatMap(id => candidates[id]?.evidence_ids || []),
    primaryEvidenceId: null,
    candidateIds: Object.keys(candidates),
    validations: [],
    conflictCandidateIds,
    conflictReason,
    reasoning: conflictReason,
  };
}

// =============================================================================
// FULL EXTRACTION OUTPUT (includes global conflicts and notes)
// =============================================================================

export interface ExtractionOutput {
  /** Job identifier */
  jobId: string;

  /** Target ACORD form (e.g., "ACORD 125", "ACORD 126") */
  targetForm: string;

  /** Field results mapped by field name */
  fields: Record<string, FieldResult>;

  /** Global/cross-field conflicts */
  globalConflicts: GlobalConflict[];

  /** Summary notes for human review */
  notesForReview: string[];

  /** Document classification detected during extraction */
  documentClassification?: {
    detectedDocType: string;
    detectedCarrier?: string;
    detectedLOB?: string;
    confidence: number;
  };

  /** Extraction metadata */
  metadata: {
    extractionId: string;
    timestamp: string;
    modelVersion: string;
    promptVersions: {
      system: string;
      user: string;
    };
    documentCount: number;
    pageCount: number;
  };
}

// =============================================================================
// RESULT AGGREGATION
// =============================================================================

export interface ExtractionResultSummary {
  totalFields: number;
  autoApplied: number;
  needsReview: number;
  needsVerification: number;
  lowConfidence: number;
  notFound: number;
  conflicts: number;
  globalConflicts: number;
  averageConfidence: number;
  overallStatus: 'high' | 'medium' | 'low';
}

/**
 * Summarize extraction results
 */
export function summarizeResults(
  results: FieldResult[],
  globalConflicts: GlobalConflict[] = []
): ExtractionResultSummary {
  const counts: Record<FieldStatus, number> = {
    AUTO_APPLIED: 0,
    NEEDS_REVIEW: 0,
    NEEDS_VERIFICATION: 0,
    LOW_CONFIDENCE: 0,
    NOT_FOUND: 0,
    CONFLICT: 0,
  };

  let totalConfidence = 0;
  let confidenceCount = 0;

  for (const result of results) {
    counts[result.status]++;
    if (result.status !== 'NOT_FOUND' && result.status !== 'CONFLICT') {
      totalConfidence += result.confidenceCalibrated;
      confidenceCount++;
    }
  }

  const avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;

  let overallStatus: 'high' | 'medium' | 'low';
  if (avgConfidence >= CONFIDENCE_THRESHOLDS.AUTO_APPLY && counts.CONFLICT === 0 && globalConflicts.length === 0) {
    overallStatus = 'high';
  } else if (avgConfidence >= CONFIDENCE_THRESHOLDS.NEEDS_REVIEW) {
    overallStatus = 'medium';
  } else {
    overallStatus = 'low';
  }

  return {
    totalFields: results.length,
    autoApplied: counts.AUTO_APPLIED,
    needsReview: counts.NEEDS_REVIEW,
    needsVerification: counts.NEEDS_VERIFICATION,
    lowConfidence: counts.LOW_CONFIDENCE,
    notFound: counts.NOT_FOUND,
    conflicts: counts.CONFLICT,
    globalConflicts: globalConflicts.length,
    averageConfidence: avgConfidence,
    overallStatus,
  };
}

/**
 * Detect global conflicts from field results and document metadata
 */
export function detectGlobalConflicts(
  results: FieldResult[],
  documentMeta: { docId: string; docType: string; evidenceIds: string[] }[]
): GlobalConflict[] {
  const conflicts: GlobalConflict[] = [];

  // Group fields by name to find cross-document conflicts
  const fieldsByName: Record<string, FieldResult[]> = {};
  for (const result of results) {
    if (!fieldsByName[result.fieldName]) {
      fieldsByName[result.fieldName] = [];
    }
    fieldsByName[result.fieldName].push(result);
  }

  // Check for policy number mismatches
  const policyNumbers = results.filter(r =>
    r.fieldName === 'PolicyNumber' && r.normalizedValue
  );
  if (policyNumbers.length > 1) {
    const uniqueValues = new Set(policyNumbers.map(p => p.normalizedValue));
    if (uniqueValues.size > 1) {
      conflicts.push({
        conflictType: 'policy_number_mismatch',
        details: `Found ${uniqueValues.size} different policy numbers across documents`,
        affectedFields: ['PolicyNumber'],
        evidenceByPosition: policyNumbers.map(p => ({
          position: p.sourceDocType || 'unknown',
          evidenceIds: p.evidenceIds,
          value: p.normalizedValue || '',
        })),
        priority: 100,
      });
    }
  }

  // Check for carrier mismatches
  const carriers = results.filter(r =>
    r.fieldName === 'CarrierName' && r.normalizedValue
  );
  if (carriers.length > 1) {
    const uniqueCarriers = new Set(carriers.map(c => c.normalizedValue?.toLowerCase()));
    if (uniqueCarriers.size > 1) {
      conflicts.push({
        conflictType: 'carrier_mismatch',
        details: `Found ${uniqueCarriers.size} different carriers across documents`,
        affectedFields: ['CarrierName', 'CarrierNAIC'],
        evidenceByPosition: carriers.map(c => ({
          position: c.sourceDocType || 'unknown',
          evidenceIds: c.evidenceIds,
          value: c.normalizedValue || '',
        })),
        priority: 95,
      });
    }
  }

  // Check for date ordering issues
  const effDate = results.find(r => r.fieldName === 'EffectiveDate' && r.normalizedValue);
  const expDate = results.find(r => r.fieldName === 'ExpirationDate' && r.normalizedValue);
  if (effDate && expDate) {
    const eff = new Date(effDate.normalizedValue!);
    const exp = new Date(expDate.normalizedValue!);
    if (exp <= eff) {
      conflicts.push({
        conflictType: 'date_ordering',
        details: `Expiration date (${expDate.normalizedValue}) is not after effective date (${effDate.normalizedValue})`,
        affectedFields: ['EffectiveDate', 'ExpirationDate'],
        evidenceByPosition: [
          { position: 'effective', evidenceIds: effDate.evidenceIds, value: effDate.normalizedValue || '' },
          { position: 'expiration', evidenceIds: expDate.evidenceIds, value: expDate.normalizedValue || '' },
        ],
        priority: 90,
      });
    }
  }

  // Check for endorsement overrides
  const endorsementFields = results.filter(r => r.isEndorsementOverride);
  for (const field of endorsementFields) {
    const decField = results.find(r =>
      r.fieldName === field.fieldName &&
      r.sourceDocType === 'dec_page' &&
      r.normalizedValue !== field.normalizedValue
    );
    if (decField) {
      conflicts.push({
        conflictType: 'endorsement_override',
        details: `Endorsement changes ${field.fieldName} from "${decField.normalizedValue}" to "${field.normalizedValue}"`,
        affectedFields: [field.fieldName],
        evidenceByPosition: [
          { position: 'dec_page', evidenceIds: decField.evidenceIds, value: decField.normalizedValue || '' },
          { position: 'endorsement', evidenceIds: field.evidenceIds, value: field.normalizedValue || '' },
        ],
        suggestedResolution: 'Use endorsement value (later effective date)',
        priority: 85,
      });
    }
  }

  return conflicts;
}

/**
 * Generate review notes from extraction results
 */
export function generateNotesForReview(
  results: FieldResult[],
  globalConflicts: GlobalConflict[]
): string[] {
  const notes: string[] = [];

  // Add notes for global conflicts
  for (const conflict of globalConflicts) {
    notes.push(conflict.details);
  }

  // Add notes for critical fields that need attention
  const criticalFields = ['PolicyNumber', 'NamedInsured', 'EffectiveDate', 'ExpirationDate', 'CarrierName'];
  for (const fieldName of criticalFields) {
    const result = results.find(r => r.fieldName === fieldName);
    if (!result) continue;

    if (result.status === 'NOT_FOUND') {
      notes.push(`Critical field ${fieldName} was not found in any document`);
    } else if (result.status === 'CONFLICT') {
      notes.push(`${fieldName} has conflicting values - manual selection required`);
    } else if (result.status === 'LOW_CONFIDENCE') {
      notes.push(`${fieldName} has low confidence (${Math.round(result.confidenceRaw * 100)}%) - verify value`);
    }
  }

  // Add notes for validation failures
  const validationFailures = results.filter(r =>
    r.validations.some(v => !v.passed && v.severity === 'error')
  );
  for (const result of validationFailures) {
    const failedRules = result.validations
      .filter(v => !v.passed && v.severity === 'error')
      .map(v => v.message || v.rule);
    notes.push(`${result.fieldName} failed validation: ${failedRules.join(', ')}`);
  }

  return notes;
}

// =============================================================================
// FIELDS NEEDING REFINEMENT
// =============================================================================

/**
 * Identify fields that need targeted reprocessing
 */
export function fieldsNeedingRefinement(
  results: FieldResult[],
  requiredFields: string[]
): string[] {
  const needsRefinement: string[] = [];

  for (const result of results) {
    const isRequired = requiredFields.includes(result.fieldName);

    // Always include NOT_FOUND required fields
    if (result.status === 'NOT_FOUND' && isRequired) {
      needsRefinement.push(result.fieldName);
      continue;
    }

    // Include CONFLICT fields
    if (result.status === 'CONFLICT') {
      needsRefinement.push(result.fieldName);
      continue;
    }

    // Include NEEDS_VERIFICATION for required fields
    if (result.status === 'NEEDS_VERIFICATION' && isRequired) {
      needsRefinement.push(result.fieldName);
      continue;
    }

    // Include fields with validation errors
    if (result.validations.some(v => !v.passed && v.severity === 'error')) {
      needsRefinement.push(result.fieldName);
    }
  }

  return needsRefinement;
}

// =============================================================================
// SERIALIZATION
// =============================================================================

/**
 * Convert FieldResult to DB-storable format
 */
export function fieldResultToDb(result: FieldResult): Record<string, any> {
  return {
    field_name: result.fieldName,
    raw_value: result.rawValue,
    normalized_value: result.normalizedValue,
    status: result.status,
    confidence_raw: result.confidenceRaw,
    confidence_calibrated: result.confidenceCalibrated,
    selected_candidate_id: result.selectedCandidateId,
    evidence_ids: result.evidenceIds,
    primary_evidence_id: result.primaryEvidenceId,
    candidate_ids: result.candidateIds,
    validations: result.validations,
    conflict_candidate_ids: result.conflictCandidateIds,
    conflict_reason: result.conflictReason,
    reasoning: result.reasoning,
    auto_applied_at: result.autoAppliedAt,
    reviewed_by: result.reviewedBy,
    reviewed_at: result.reviewedAt,
    edited_value: result.editedValue,
    edit_reason: result.editReason,
  };
}

/**
 * Convert DB record to FieldResult
 */
export function dbToFieldResult(record: Record<string, any>): FieldResult {
  return {
    fieldName: record.field_name,
    rawValue: record.raw_value,
    normalizedValue: record.normalized_value,
    status: record.status as FieldStatus,
    confidenceRaw: record.confidence_raw,
    confidenceCalibrated: record.confidence_calibrated,
    selectedCandidateId: record.selected_candidate_id,
    evidenceIds: record.evidence_ids || [],
    primaryEvidenceId: record.primary_evidence_id,
    candidateIds: record.candidate_ids || [],
    validations: record.validations || [],
    conflictCandidateIds: record.conflict_candidate_ids,
    conflictReason: record.conflict_reason,
    reasoning: record.reasoning,
    autoAppliedAt: record.auto_applied_at,
    reviewedBy: record.reviewed_by,
    reviewedAt: record.reviewed_at,
    editedValue: record.edited_value,
    editReason: record.edit_reason,
  };
}
