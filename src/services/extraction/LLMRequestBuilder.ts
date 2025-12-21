/**
 * LLM Request Builder
 *
 * Constructs structured requests for ACORD extraction LLM calls:
 * - Assembles system + user prompts
 * - Embeds JSON schema for validation
 * - Builds evidence catalog from extraction data
 * - Formats candidates for LLM consumption
 * - Tracks prompt versions for replay
 */

import {
  ACORD_MAPPING_SYSTEM_PROMPT,
  FIELD_REFINER_SYSTEM_PROMPT,
  SCHEMA_CORRECTION_SYSTEM_PROMPT,
  buildAcordMappingUserPrompt,
  buildFieldRefinerUserPrompt,
  buildSchemaCorrectionUserPrompt,
  getPromptMetadata,
  hashPrompt,
  PROMPT_VERSIONS,
  AcordMappingContext,
  FieldRefinerContext,
  EvidenceEntry,
  CandidateEntry,
} from './prompts';

// =============================================================================
// REQUEST TYPES
// =============================================================================

export interface LLMRequest {
  requestId: string;
  requestType: 'acord_mapping' | 'field_refiner' | 'schema_correction';
  systemPrompt: string;
  userPrompt: string;
  outputSchema: object;
  metadata: LLMRequestMetadata;
}

export interface LLMRequestMetadata {
  jobId: string;
  acordFormId?: string;
  promptVersions: {
    system: string;
    user: string;
  };
  promptHashes: {
    system: string;
    user: string;
  };
  model: string;
  modelParameters: {
    maxTokens: number;
    temperature: number;
  };
  inputArtifacts: {
    schemaId?: string;
    evidenceCatalogId?: string;
    candidatesId?: string;
  };
  timestamp: string;
}

// =============================================================================
// OUTPUT SCHEMA DEFINITIONS
// =============================================================================

export const ACORD_MAPPING_OUTPUT_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['extraction_id', 'fields', 'document_classification'],
  properties: {
    extraction_id: { type: 'string' },
    fields: {
      type: 'array',
      items: {
        type: 'object',
        required: ['field_name', 'selected_candidate_id', 'status', 'confidence', 'reasoning'],
        properties: {
          field_name: { type: 'string' },
          selected_candidate_id: { type: ['string', 'null'] },
          status: {
            type: 'string',
            enum: ['AUTO_APPLIED', 'NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'NOT_FOUND', 'CONFLICT'],
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          reasoning: { type: 'string' },
          conflict_candidate_ids: {
            type: 'array',
            items: { type: 'string' },
          },
          conflict_reason: { type: 'string' },
        },
      },
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
    },
    document_classification: {
      type: 'object',
      properties: {
        detected_doc_type: { type: 'string' },
        detected_carrier: { type: ['string', 'null'] },
        detected_lob: { type: ['string', 'null'] },
      },
    },
  },
};

export const FIELD_REFINER_OUTPUT_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['extraction_id', 'fields'],
  properties: {
    extraction_id: { type: 'string' },
    fields: {
      type: 'array',
      items: {
        type: 'object',
        required: ['field_name', 'selected_candidate_id', 'status', 'confidence', 'reasoning'],
        properties: {
          field_name: { type: 'string' },
          selected_candidate_id: { type: ['string', 'null'] },
          status: {
            type: 'string',
            enum: ['AUTO_APPLIED', 'NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'NOT_FOUND', 'CONFLICT'],
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          reasoning: { type: 'string' },
          conflict_candidate_ids: {
            type: 'array',
            items: { type: 'string' },
          },
          conflict_reason: { type: 'string' },
        },
      },
    },
  },
};

// =============================================================================
// REQUEST BUILDER
// =============================================================================

export interface BuildAcordMappingRequestParams {
  jobId: string;
  acordFormId: string;
  targetFormNumber: string;
  targetFields: string[];
  accountAnchors?: AcordMappingContext['accountAnchors'];
  documentSummary: AcordMappingContext['documentSummary'];
  evidenceCatalog: Record<string, EvidenceEntry>;
  fieldCandidates: Record<string, CandidateEntry[]>;
  validationRules?: AcordMappingContext['validationRules'];
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export function buildAcordMappingRequest(
  params: BuildAcordMappingRequestParams
): LLMRequest {
  const {
    jobId,
    acordFormId,
    targetFormNumber,
    targetFields,
    accountAnchors,
    documentSummary,
    evidenceCatalog,
    fieldCandidates,
    validationRules,
    model = 'claude-3-5-sonnet-20241022',
    maxTokens = 8192,
    temperature = 0.1,
  } = params;

  const context: AcordMappingContext = {
    jobId,
    acordFormId,
    targetFormNumber,
    targetFields,
    accountAnchors,
    documentSummary,
    evidenceCatalog,
    fieldCandidates,
    validationRules,
  };

  const systemPrompt = ACORD_MAPPING_SYSTEM_PROMPT;
  const userPrompt = buildAcordMappingUserPrompt(context);

  return {
    requestId: crypto.randomUUID(),
    requestType: 'acord_mapping',
    systemPrompt,
    userPrompt,
    outputSchema: ACORD_MAPPING_OUTPUT_SCHEMA,
    metadata: {
      jobId,
      acordFormId,
      promptVersions: {
        system: PROMPT_VERSIONS.ACORD_MAPPING_SYSTEM,
        user: PROMPT_VERSIONS.ACORD_MAPPING_USER,
      },
      promptHashes: {
        system: hashPrompt(systemPrompt),
        user: hashPrompt(userPrompt),
      },
      model,
      modelParameters: {
        maxTokens,
        temperature,
      },
      inputArtifacts: {},
      timestamp: new Date().toISOString(),
    },
  };
}

export interface BuildFieldRefinerRequestParams {
  jobId: string;
  targetFields: string[];
  previousResults: FieldRefinerContext['previousResults'];
  additionalEvidence: Record<string, EvidenceEntry>;
  additionalCandidates: Record<string, CandidateEntry[]>;
  crossFieldContext: Record<string, string>;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export function buildFieldRefinerRequest(
  params: BuildFieldRefinerRequestParams
): LLMRequest {
  const {
    jobId,
    targetFields,
    previousResults,
    additionalEvidence,
    additionalCandidates,
    crossFieldContext,
    model = 'claude-3-5-sonnet-20241022',
    maxTokens = 4096,
    temperature = 0.1,
  } = params;

  const context: FieldRefinerContext = {
    jobId,
    targetFields,
    previousResults,
    additionalEvidence,
    additionalCandidates,
    crossFieldContext,
  };

  const systemPrompt = FIELD_REFINER_SYSTEM_PROMPT;
  const userPrompt = buildFieldRefinerUserPrompt(context);

  return {
    requestId: crypto.randomUUID(),
    requestType: 'field_refiner',
    systemPrompt,
    userPrompt,
    outputSchema: FIELD_REFINER_OUTPUT_SCHEMA,
    metadata: {
      jobId,
      promptVersions: {
        system: PROMPT_VERSIONS.FIELD_REFINER_SYSTEM,
        user: PROMPT_VERSIONS.FIELD_REFINER_USER,
      },
      promptHashes: {
        system: hashPrompt(systemPrompt),
        user: hashPrompt(userPrompt),
      },
      model,
      modelParameters: {
        maxTokens,
        temperature,
      },
      inputArtifacts: {},
      timestamp: new Date().toISOString(),
    },
  };
}

export interface BuildSchemaCorrectionRequestParams {
  jobId: string;
  originalOutput: string;
  validationErrors: string[];
  targetSchema: object;
  model?: string;
  maxTokens?: number;
}

export function buildSchemaCorrectionRequest(
  params: BuildSchemaCorrectionRequestParams
): LLMRequest {
  const {
    jobId,
    originalOutput,
    validationErrors,
    targetSchema,
    model = 'claude-3-5-sonnet-20241022',
    maxTokens = 4096,
  } = params;

  const systemPrompt = SCHEMA_CORRECTION_SYSTEM_PROMPT;
  const userPrompt = buildSchemaCorrectionUserPrompt(
    originalOutput,
    validationErrors,
    targetSchema
  );

  return {
    requestId: crypto.randomUUID(),
    requestType: 'schema_correction',
    systemPrompt,
    userPrompt,
    outputSchema: targetSchema,
    metadata: {
      jobId,
      promptVersions: {
        system: PROMPT_VERSIONS.SCHEMA_CORRECTION,
        user: PROMPT_VERSIONS.SCHEMA_CORRECTION,
      },
      promptHashes: {
        system: hashPrompt(systemPrompt),
        user: hashPrompt(userPrompt),
      },
      model,
      modelParameters: {
        maxTokens,
        temperature: 0,
      },
      inputArtifacts: {},
      timestamp: new Date().toISOString(),
    },
  };
}

// =============================================================================
// EVIDENCE CATALOG BUILDER
// Converts Azure DI output to evidence catalog
// =============================================================================

export interface AzureDIWord {
  content: string;
  polygon: number[];
  confidence: number;
}

export interface AzureDIKeyValuePair {
  key: { content: string; boundingRegions?: any[] };
  value: { content: string; boundingRegions?: any[] };
  confidence: number;
}

export interface AzureDIPage {
  pageNumber: number;
  width: number;
  height: number;
  words: AzureDIWord[];
}

export function buildEvidenceCatalog(
  documentId: string,
  pages: AzureDIPage[],
  keyValuePairs: AzureDIKeyValuePair[]
): Record<string, EvidenceEntry> {
  const catalog: Record<string, EvidenceEntry> = {};

  // Build evidence from key-value pairs
  for (const kv of keyValuePairs) {
    if (!kv.key?.content || !kv.value?.content) continue;

    const evidenceId = generateEvidenceId(
      documentId,
      kv.value.boundingRegions?.[0]?.pageNumber || 1,
      kv.value.content
    );

    catalog[evidenceId] = {
      evidence_id: evidenceId,
      page_index: (kv.value.boundingRegions?.[0]?.pageNumber || 1) - 1,
      snippet_text: kv.value.content.substring(0, 200), // Limit snippet size
      label_nearby: kv.key.content.substring(0, 100),
      extraction_method: 'key_value_pair',
      ocr_confidence: kv.confidence,
    };
  }

  return catalog;
}

export function generateEvidenceId(
  documentId: string,
  pageNumber: number,
  snippetText: string
): string {
  // Create stable ID from content (hash-based)
  const content = `${documentId}:${pageNumber}:${snippetText.substring(0, 50)}`;
  return `ev_${hashPrompt(content)}`;
}

// =============================================================================
// CANDIDATE BUILDER
// Formats candidates for LLM consumption
// =============================================================================

export function formatCandidatesForLLM(
  candidates: CandidateEntry[],
  maxCandidates: number = 5
): CandidateEntry[] {
  // Sort by score and take top N
  return candidates
    .sort((a, b) => b.score_overall - a.score_overall)
    .slice(0, maxCandidates)
    .map(c => ({
      candidate_id: c.candidate_id,
      raw_value: c.raw_value,
      normalized_value: c.normalized_value,
      evidence_ids: c.evidence_ids,
      score_overall: Math.round(c.score_overall * 100) / 100, // Round for cleaner display
      validator_results: c.validator_results,
    }));
}

// =============================================================================
// REQUEST SERIALIZATION
// For artifact storage
// =============================================================================

export function serializeRequest(request: LLMRequest): {
  serialized: string;
  size: number;
  hash: string;
} {
  // Remove actual prompts from serialized version (stored separately)
  const forStorage = {
    requestId: request.requestId,
    requestType: request.requestType,
    metadata: request.metadata,
    outputSchema: request.outputSchema,
    promptSummary: {
      systemLength: request.systemPrompt.length,
      userLength: request.userPrompt.length,
    },
  };

  const serialized = JSON.stringify(forStorage);

  return {
    serialized,
    size: serialized.length,
    hash: hashPrompt(serialized),
  };
}
