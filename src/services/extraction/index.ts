/**
 * ACORD Extraction Services
 *
 * Two-layer prompting architecture for ACORD form field extraction:
 * - Evidence-based extraction (no LLM guessing)
 * - Candidate selection (not generation)
 * - Schema validation with correction
 * - Confidence calibration
 * - Full audit trail
 */

// Prompt templates and versioning
export {
  PROMPT_VERSIONS,
  ACORD_MAPPING_SYSTEM_PROMPT,
  FIELD_REFINER_SYSTEM_PROMPT,
  SCHEMA_CORRECTION_SYSTEM_PROMPT,
  buildAcordMappingUserPrompt,
  buildFieldRefinerUserPrompt,
  buildSchemaCorrectionUserPrompt,
  getPromptMetadata,
  hashPrompt,
} from './prompts';

export type {
  AcordMappingContext,
  FieldRefinerContext,
  EvidenceEntry as PromptEvidenceEntry,
  CandidateEntry,
  PromptMetadata,
  DocumentBundleEntry,
} from './prompts';

// Core types
export * from './FieldResult';

// Evidence processing
export {
  EvidenceCatalogBuilder,
  evidenceCatalogBuilder,
} from './EvidenceCatalogBuilder';

export type {
  EvidenceEntry,
  EvidenceCatalog,
  BoundingBox,
  TableContext,
  CatalogStats,
  AzureDIResponse,
} from './EvidenceCatalogBuilder';

// LLM request construction
export {
  buildAcordMappingRequest,
  buildFieldRefinerRequest,
  buildSchemaCorrectionRequest,
  buildEvidenceCatalog,
  formatCandidatesForLLM,
  serializeRequest,
  ACORD_MAPPING_OUTPUT_SCHEMA,
  FIELD_REFINER_OUTPUT_SCHEMA,
} from './LLMRequestBuilder';

export type {
  LLMRequest,
  LLMRequestMetadata,
  BuildAcordMappingRequestParams,
  BuildFieldRefinerRequestParams,
  BuildSchemaCorrectionRequestParams,
} from './LLMRequestBuilder';

// Schema validation
export {
  SchemaValidator,
  schemaValidator,
} from './SchemaValidator';

export type {
  ValidationResult,
  SchemaValidationOptions,
} from './SchemaValidator';

// LLM invocation with tracking
export {
  LLMInvocationService,
  llmInvocationService,
} from './LLMInvocationService';

export type {
  InvocationOptions,
  InvocationResult,
  AcordExtractionInput,
} from './LLMInvocationService';

// Targeted reprocessing
export {
  TargetedReprocessingService,
  targetedReprocessing,
} from './TargetedReprocessing';

export type {
  ReprocessingRequest,
  ReprocessingReason,
  ReprocessingResult,
  UserHint,
  PreprocessingOptions,
} from './TargetedReprocessing';

// Review Queue Builder (micro-question UI)
export {
  buildReviewQueue,
  buildReviewQueueFromOutput,
  serializeForPrompt,
} from './ReviewQueueBuilder';

export type {
  ReviewQuestionType,
  ReviewHighlight,
  ReviewChoice,
  ReviewQuestion,
  GlobalConflictQuestion,
  ReviewQueue,
  BuildReviewQueueOptions,
} from './ReviewQueueBuilder';
