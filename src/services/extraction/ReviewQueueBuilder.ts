/**
 * Review Queue Builder Service
 *
 * Generates micro-questions for efficient human review of extraction results.
 * Creates a prioritized queue of actionable items for the review UI.
 *
 * Question Types:
 * - quick_confirm: Simple yes/no verification of high-confidence value
 * - select_candidate: Choose between 2-4 candidate values
 * - resolve_conflict: Resolve conflicting values from different sources
 * - manual_entry: No candidates found, need manual entry
 * - verify_low_conf: Low confidence value needs verification
 * - global_conflict: Cross-document or cross-field conflict resolution
 */

import {
  FieldResult,
  FieldStatus,
  GlobalConflict,
  ExtractionOutput,
  FIELD_PRIORITY,
  ConflictCandidate,
} from './FieldResult';

// =============================================================================
// TYPES
// =============================================================================

export type ReviewQuestionType =
  | 'quick_confirm'
  | 'select_candidate'
  | 'resolve_conflict'
  | 'manual_entry'
  | 'verify_low_conf'
  | 'global_conflict';

export interface ReviewHighlight {
  pageIndex: number;
  evidenceId: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ReviewChoice {
  choiceId: string;
  value: string;
  displayLabel: string;
  confidence?: number;
  sourceDocument?: string;
  evidenceIds: string[];
  isRecommended?: boolean;
}

export interface ReviewQuestion {
  questionId: string;
  fieldName: string;
  questionType: ReviewQuestionType;
  questionText: string;
  helpText?: string;
  currentValue: string | null;
  choices?: ReviewChoice[];
  highlight?: ReviewHighlight;
  priority: number; // 0-100, higher = more urgent
  estimatedTimeSeconds: number; // Expected time to answer
  metadata: {
    status: FieldStatus;
    confidence: number;
    isRequired: boolean;
    affectsDownstream?: string[]; // Fields that depend on this answer
  };
}

export interface GlobalConflictQuestion {
  questionId: string;
  conflictType: string;
  questionText: string;
  helpText: string;
  affectedFields: string[];
  positions: {
    document: string;
    value: string;
    evidenceIds: string[];
  }[];
  suggestedResolution?: string;
  priority: number;
  estimatedTimeSeconds: number;
}

export interface ReviewQueue {
  extractionId: string;
  totalQuestions: number;
  estimatedTotalTimeMinutes: number;
  fieldQuestions: ReviewQuestion[];
  globalConflictQuestions: GlobalConflictQuestion[];
  summary: {
    byType: Record<ReviewQuestionType, number>;
    byPriority: {
      high: number;    // priority >= 80
      medium: number;  // priority 50-79
      low: number;     // priority < 50
    };
    requiredFieldsMissing: string[];
    conflictCount: number;
  };
}

// =============================================================================
// QUESTION TEXT TEMPLATES
// =============================================================================

const QUESTION_TEMPLATES = {
  quick_confirm: {
    default: (field: string, value: string) =>
      `Is "${value}" correct for ${formatFieldName(field)}?`,
    currency: (field: string, value: string) =>
      `Confirm the ${formatFieldName(field)} is ${value}`,
    date: (field: string, value: string) =>
      `Confirm ${formatFieldName(field)}: ${value}`,
  },
  select_candidate: {
    default: (field: string) =>
      `Select the correct value for ${formatFieldName(field)}:`,
    multiple_sources: (field: string, count: number) =>
      `Found ${count} possible values for ${formatFieldName(field)}. Which is correct?`,
  },
  resolve_conflict: {
    endorsement_override: (field: string) =>
      `The ${formatFieldName(field)} differs between the declaration and endorsement. Which should be used?`,
    document_mismatch: (field: string, doc1: string, doc2: string) =>
      `${formatFieldName(field)} has different values in ${doc1} vs ${doc2}. Select the correct one:`,
    default: (field: string) =>
      `Conflicting values found for ${formatFieldName(field)}. Please select:`,
  },
  manual_entry: {
    not_found: (field: string) =>
      `Could not find ${formatFieldName(field)} in the documents. Please enter:`,
    required: (field: string) =>
      `${formatFieldName(field)} is required but not found. Please provide:`,
    default: (field: string) =>
      `Please enter ${formatFieldName(field)}:`,
  },
  verify_low_conf: {
    default: (field: string, value: string) =>
      `Low confidence extraction for ${formatFieldName(field)}: "${value}". Is this correct?`,
    ocr_quality: (field: string, value: string) =>
      `OCR quality was poor for ${formatFieldName(field)}. Does "${value}" look correct?`,
  },
  global_conflict: {
    policy_number: () =>
      `Policy number appears differently across documents. Which is the official policy number?`,
    carrier_mismatch: () =>
      `Different carrier names found. Please confirm the correct carrier:`,
    insured_mismatch: () =>
      `Named insured differs across documents. Select the correct legal name:`,
    date_ordering: () =>
      `Date ordering issue detected. Please verify the dates:`,
    limit_sum: () =>
      `Individual limits don't sum to aggregate. Please verify:`,
    default: () =>
      `Cross-document conflict detected. Please resolve:`,
  },
};

function formatFieldName(fieldName: string): string {
  // Convert camelCase or snake_case to Title Case
  return fieldName
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\s+/, '')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// =============================================================================
// ESTIMATED TIME CALCULATIONS
// =============================================================================

function estimateTimeSeconds(questionType: ReviewQuestionType, choiceCount?: number): number {
  const baseTimes: Record<ReviewQuestionType, number> = {
    quick_confirm: 3,
    select_candidate: 8 + (choiceCount || 2) * 2,
    resolve_conflict: 15,
    manual_entry: 20,
    verify_low_conf: 5,
    global_conflict: 25,
  };
  return baseTimes[questionType];
}

// =============================================================================
// PRIORITY CALCULATIONS
// =============================================================================

function calculateQuestionPriority(
  fieldName: string,
  status: FieldStatus,
  confidence: number,
  isRequired: boolean
): number {
  // Base priority from field importance
  const fieldPriority = FIELD_PRIORITY[fieldName as keyof typeof FIELD_PRIORITY] || 50;

  // Status modifiers
  const statusModifiers: Record<FieldStatus, number> = {
    'CONFLICT': 20,
    'NOT_FOUND': 15,
    'LOW_CONFIDENCE': 10,
    'NEEDS_VERIFICATION': 5,
    'NEEDS_REVIEW': 0,
    'AUTO_APPLIED': -30,
  };

  // Required field bonus
  const requiredBonus = isRequired ? 10 : 0;

  // Low confidence penalty (inverse - lower confidence = higher priority)
  const confidencePenalty = Math.round((1 - confidence) * 10);

  const priority = Math.min(100, Math.max(0,
    fieldPriority + (statusModifiers[status] || 0) + requiredBonus + confidencePenalty
  ));

  return priority;
}

// =============================================================================
// QUESTION BUILDERS
// =============================================================================

function buildQuickConfirmQuestion(
  fieldName: string,
  result: FieldResult,
  questionId: string
): ReviewQuestion {
  const value = result.normalizedValue || result.value || '';

  return {
    questionId,
    fieldName,
    questionType: 'quick_confirm',
    questionText: QUESTION_TEMPLATES.quick_confirm.default(fieldName, value),
    currentValue: value,
    choices: [
      {
        choiceId: 'confirm_yes',
        value,
        displayLabel: 'Yes, this is correct',
        confidence: result.confidence,
        evidenceIds: result.evidenceIds,
        isRecommended: true,
      },
      {
        choiceId: 'confirm_no',
        value: '',
        displayLabel: 'No, this is incorrect',
        evidenceIds: [],
      },
    ],
    highlight: result.evidenceIds.length > 0 ? {
      pageIndex: 0, // TODO: Get from evidence catalog
      evidenceId: result.evidenceIds[0],
    } : undefined,
    priority: calculateQuestionPriority(fieldName, result.status, result.confidence, false),
    estimatedTimeSeconds: estimateTimeSeconds('quick_confirm'),
    metadata: {
      status: result.status,
      confidence: result.confidence,
      isRequired: false,
    },
  };
}

function buildSelectCandidateQuestion(
  fieldName: string,
  result: FieldResult,
  candidates: ConflictCandidate[],
  questionId: string
): ReviewQuestion {
  const choices: ReviewChoice[] = candidates.map((candidate, index) => ({
    choiceId: candidate.candidateId,
    value: candidate.value,
    displayLabel: `${candidate.value}${candidate.sourceDocType ? ` (from ${candidate.sourceDocType})` : ''}`,
    confidence: candidate.confidence,
    evidenceIds: candidate.evidenceIds,
    isRecommended: index === 0, // First candidate is usually best match
  }));

  return {
    questionId,
    fieldName,
    questionType: 'select_candidate',
    questionText: QUESTION_TEMPLATES.select_candidate.multiple_sources(fieldName, candidates.length),
    currentValue: result.value,
    choices,
    highlight: candidates[0]?.evidenceIds[0] ? {
      pageIndex: 0,
      evidenceId: candidates[0].evidenceIds[0],
    } : undefined,
    priority: calculateQuestionPriority(fieldName, result.status, result.confidence, false),
    estimatedTimeSeconds: estimateTimeSeconds('select_candidate', candidates.length),
    metadata: {
      status: result.status,
      confidence: result.confidence,
      isRequired: false,
    },
  };
}

function buildResolveConflictQuestion(
  fieldName: string,
  result: FieldResult,
  questionId: string
): ReviewQuestion {
  const conflictCandidates = result.conflictCandidates || [];

  const choices: ReviewChoice[] = conflictCandidates.map(candidate => ({
    choiceId: candidate.candidateId,
    value: candidate.value,
    displayLabel: `${candidate.value} — ${candidate.shortReason}`,
    confidence: candidate.confidence,
    sourceDocument: candidate.sourceDocType,
    evidenceIds: candidate.evidenceIds,
  }));

  return {
    questionId,
    fieldName,
    questionType: 'resolve_conflict',
    questionText: QUESTION_TEMPLATES.resolve_conflict.default(fieldName),
    helpText: result.conflictReason,
    currentValue: null,
    choices,
    highlight: conflictCandidates[0]?.evidenceIds[0] ? {
      pageIndex: 0,
      evidenceId: conflictCandidates[0].evidenceIds[0],
    } : undefined,
    priority: calculateQuestionPriority(fieldName, 'CONFLICT', 0, true),
    estimatedTimeSeconds: estimateTimeSeconds('resolve_conflict'),
    metadata: {
      status: 'CONFLICT',
      confidence: 0,
      isRequired: true,
    },
  };
}

function buildManualEntryQuestion(
  fieldName: string,
  result: FieldResult,
  isRequired: boolean,
  questionId: string
): ReviewQuestion {
  const template = isRequired
    ? QUESTION_TEMPLATES.manual_entry.required
    : QUESTION_TEMPLATES.manual_entry.not_found;

  return {
    questionId,
    fieldName,
    questionType: 'manual_entry',
    questionText: template(fieldName),
    currentValue: null,
    priority: calculateQuestionPriority(fieldName, 'NOT_FOUND', 0, isRequired),
    estimatedTimeSeconds: estimateTimeSeconds('manual_entry'),
    metadata: {
      status: 'NOT_FOUND',
      confidence: 0,
      isRequired,
    },
  };
}

function buildVerifyLowConfQuestion(
  fieldName: string,
  result: FieldResult,
  questionId: string
): ReviewQuestion {
  const value = result.normalizedValue || result.value || '';

  return {
    questionId,
    fieldName,
    questionType: 'verify_low_conf',
    questionText: QUESTION_TEMPLATES.verify_low_conf.default(fieldName, value),
    currentValue: value,
    choices: [
      {
        choiceId: 'verify_correct',
        value,
        displayLabel: 'Yes, this is correct',
        confidence: result.confidence,
        evidenceIds: result.evidenceIds,
        isRecommended: true,
      },
      {
        choiceId: 'verify_incorrect',
        value: '',
        displayLabel: 'No, needs correction',
        evidenceIds: [],
      },
    ],
    highlight: result.evidenceIds[0] ? {
      pageIndex: 0,
      evidenceId: result.evidenceIds[0],
    } : undefined,
    priority: calculateQuestionPriority(fieldName, result.status, result.confidence, false),
    estimatedTimeSeconds: estimateTimeSeconds('verify_low_conf'),
    metadata: {
      status: result.status,
      confidence: result.confidence,
      isRequired: false,
    },
  };
}

function buildGlobalConflictQuestion(
  conflict: GlobalConflict,
  questionId: string
): GlobalConflictQuestion {
  const templateFn = QUESTION_TEMPLATES.global_conflict[
    conflict.conflictType as keyof typeof QUESTION_TEMPLATES.global_conflict
  ] || QUESTION_TEMPLATES.global_conflict.default;

  return {
    questionId,
    conflictType: conflict.conflictType,
    questionText: templateFn(),
    helpText: conflict.details,
    affectedFields: conflict.affectedFields,
    positions: conflict.evidenceByPosition.map(pos => ({
      document: pos.position,
      value: pos.value,
      evidenceIds: pos.evidenceIds,
    })),
    suggestedResolution: conflict.suggestedResolution,
    priority: conflict.priority,
    estimatedTimeSeconds: estimateTimeSeconds('global_conflict'),
  };
}

// =============================================================================
// MAIN BUILDER
// =============================================================================

export interface BuildReviewQueueOptions {
  extractionId: string;
  fieldResults: Record<string, FieldResult>;
  globalConflicts?: GlobalConflict[];
  requiredFields?: string[];
  includeAutoApplied?: boolean; // Include high-confidence fields for spot-checking
  spotCheckPercentage?: number; // 0-100, percentage of auto-applied to include
}

export function buildReviewQueue(options: BuildReviewQueueOptions): ReviewQueue {
  const {
    extractionId,
    fieldResults,
    globalConflicts = [],
    requiredFields = [],
    includeAutoApplied = false,
    spotCheckPercentage = 10,
  } = options;

  const fieldQuestions: ReviewQuestion[] = [];
  const requiredFieldsMissing: string[] = [];
  let questionCounter = 0;

  const generateQuestionId = () => `q_${++questionCounter}`;

  // Process each field result
  for (const [fieldName, result] of Object.entries(fieldResults)) {
    const isRequired = requiredFields.includes(fieldName);

    switch (result.status) {
      case 'CONFLICT':
        fieldQuestions.push(
          buildResolveConflictQuestion(fieldName, result, generateQuestionId())
        );
        break;

      case 'NOT_FOUND':
        if (isRequired) requiredFieldsMissing.push(fieldName);
        fieldQuestions.push(
          buildManualEntryQuestion(fieldName, result, isRequired, generateQuestionId())
        );
        break;

      case 'LOW_CONFIDENCE':
      case 'NEEDS_VERIFICATION':
        fieldQuestions.push(
          buildVerifyLowConfQuestion(fieldName, result, generateQuestionId())
        );
        break;

      case 'NEEDS_REVIEW':
        // Check if we have multiple candidates
        if (result.conflictCandidates && result.conflictCandidates.length > 1) {
          fieldQuestions.push(
            buildSelectCandidateQuestion(
              fieldName,
              result,
              result.conflictCandidates,
              generateQuestionId()
            )
          );
        } else {
          fieldQuestions.push(
            buildQuickConfirmQuestion(fieldName, result, generateQuestionId())
          );
        }
        break;

      case 'AUTO_APPLIED':
        // Optionally include for spot-checking
        if (includeAutoApplied) {
          const shouldInclude = Math.random() * 100 < spotCheckPercentage;
          if (shouldInclude) {
            const question = buildQuickConfirmQuestion(fieldName, result, generateQuestionId());
            question.helpText = '(Spot check - high confidence extraction)';
            question.priority = Math.max(0, question.priority - 30); // Lower priority
            fieldQuestions.push(question);
          }
        }
        break;
    }
  }

  // Build global conflict questions
  const globalConflictQuestions: GlobalConflictQuestion[] = globalConflicts.map(conflict =>
    buildGlobalConflictQuestion(conflict, generateQuestionId())
  );

  // Sort by priority (highest first)
  fieldQuestions.sort((a, b) => b.priority - a.priority);
  globalConflictQuestions.sort((a, b) => b.priority - a.priority);

  // Calculate summary
  const byType: Record<ReviewQuestionType, number> = {
    quick_confirm: 0,
    select_candidate: 0,
    resolve_conflict: 0,
    manual_entry: 0,
    verify_low_conf: 0,
    global_conflict: globalConflictQuestions.length,
  };

  fieldQuestions.forEach(q => {
    byType[q.questionType]++;
  });

  const byPriority = {
    high: fieldQuestions.filter(q => q.priority >= 80).length +
          globalConflictQuestions.filter(q => q.priority >= 80).length,
    medium: fieldQuestions.filter(q => q.priority >= 50 && q.priority < 80).length +
            globalConflictQuestions.filter(q => q.priority >= 50 && q.priority < 80).length,
    low: fieldQuestions.filter(q => q.priority < 50).length +
         globalConflictQuestions.filter(q => q.priority < 50).length,
  };

  const totalQuestions = fieldQuestions.length + globalConflictQuestions.length;
  const totalTimeSeconds =
    fieldQuestions.reduce((sum, q) => sum + q.estimatedTimeSeconds, 0) +
    globalConflictQuestions.reduce((sum, q) => sum + q.estimatedTimeSeconds, 0);

  return {
    extractionId,
    totalQuestions,
    estimatedTotalTimeMinutes: Math.round(totalTimeSeconds / 60 * 10) / 10,
    fieldQuestions,
    globalConflictQuestions,
    summary: {
      byType,
      byPriority,
      requiredFieldsMissing,
      conflictCount: byType.resolve_conflict + globalConflictQuestions.length,
    },
  };
}

// =============================================================================
// HELPER: BUILD FROM EXTRACTION OUTPUT
// =============================================================================

export function buildReviewQueueFromOutput(
  output: ExtractionOutput,
  requiredFields?: string[]
): ReviewQueue {
  return buildReviewQueue({
    extractionId: output.extractionId,
    fieldResults: output.fields,
    globalConflicts: output.globalConflicts,
    requiredFields,
    includeAutoApplied: false,
  });
}

// =============================================================================
// SERIALIZATION FOR LLM PROMPT
// =============================================================================

export function serializeForPrompt(queue: ReviewQueue): string {
  const sections: string[] = [];

  sections.push(`## REVIEW QUEUE SUMMARY
- Total Questions: ${queue.totalQuestions}
- Estimated Time: ${queue.estimatedTotalTimeMinutes} minutes
- High Priority: ${queue.summary.byPriority.high}
- Conflicts: ${queue.summary.conflictCount}
- Required Fields Missing: ${queue.summary.requiredFieldsMissing.length > 0
    ? queue.summary.requiredFieldsMissing.join(', ')
    : 'None'}`);

  if (queue.globalConflictQuestions.length > 0) {
    sections.push(`## GLOBAL CONFLICTS (resolve first)
${queue.globalConflictQuestions.map((q, i) =>
  `${i + 1}. [${q.conflictType}] ${q.questionText}
   Affected: ${q.affectedFields.join(', ')}
   ${q.positions.map(p => `- ${p.document}: "${p.value}"`).join('\n   ')}`
).join('\n\n')}`);
  }

  sections.push(`## FIELD QUESTIONS (by priority)
${queue.fieldQuestions.slice(0, 20).map((q, i) =>
  `${i + 1}. [${q.questionType}] ${q.fieldName} (Priority: ${q.priority})
   ${q.questionText}
   ${q.choices ? `Choices: ${q.choices.map(c => c.displayLabel).join(' | ')}` : ''}`
).join('\n\n')}`);

  if (queue.fieldQuestions.length > 20) {
    sections.push(`... and ${queue.fieldQuestions.length - 20} more questions`);
  }

  return sections.join('\n\n');
}
