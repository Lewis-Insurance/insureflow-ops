/**
 * LLM Invocation Service
 *
 * Handles all LLM calls with:
 * - Full prompt and response logging
 * - Artifact storage for replay/debugging
 * - Token usage tracking
 * - Schema validation with auto-correction
 * - Confidence calibration
 */

import { supabase } from '@/integrations/supabase/client';
import {
  buildAcordMappingRequest,
  LLMRequest,
  BuildAcordMappingRequestParams,
} from './LLMRequestBuilder';
import { SchemaValidator } from './SchemaValidator';
import { EvidenceCatalog } from './EvidenceCatalogBuilder';
import { FieldResult, buildFieldResult, CandidateData, LLMFieldOutput } from './FieldResult';
import { EvidenceEntry, CandidateEntry } from './prompts';

// =============================================================================
// TYPES
// =============================================================================

export interface InvocationOptions {
  /** Model to use */
  model?: string;

  /** Temperature (0-1) */
  temperature?: number;

  /** Max tokens for response */
  maxTokens?: number;

  /** Timeout in ms */
  timeoutMs?: number;

  /** Skip artifact storage (for speed) */
  skipArtifacts?: boolean;

  /** Retry on validation failure */
  retryOnValidationError?: boolean;

  /** Max correction attempts */
  maxCorrectionAttempts?: number;
}

export interface InvocationResult {
  /** Invocation ID for tracking */
  invocationId: string;

  /** Success status */
  success: boolean;

  /** Parsed field results */
  fieldResults: Record<string, FieldResult>;

  /** Raw LLM response */
  rawResponse: string;

  /** Parsed JSON response */
  parsedResponse: any;

  /** Whether schema validation passed */
  schemaValid: boolean;

  /** Validation errors if any */
  validationErrors?: any[];

  /** Whether correction was needed */
  requiredCorrection: boolean;

  /** Token usage */
  tokenUsage: {
    input: number;
    output: number;
    total: number;
    estimatedCostUsd: number;
  };

  /** Duration in ms */
  durationMs: number;

  /** Error if failed */
  error?: string;
}

export interface AcordExtractionInput {
  /** Document extraction ID */
  extractionId: string;

  /** Target ACORD fields to extract */
  targetFields: string[];

  /** Evidence catalog from document */
  evidenceCatalog: Record<string, EvidenceEntry>;

  /** Pre-generated candidates per field */
  candidates: Record<string, CandidateEntry[]>;

  /** Job ID for tracking */
  jobId: string;

  /** ACORD form ID */
  acordFormId: string;

  /** Target form number (e.g., "125") */
  targetFormNumber: string;

  /** Document summary */
  documentSummary: {
    fileName: string;
    pageCount: number;
    detectedDocType?: string;
  };

  /** Document type hint */
  documentType?: string;

  /** Attempt number (for retries) */
  attemptNumber?: number;
}

// =============================================================================
// COST CALCULATION
// =============================================================================

const MODEL_PRICING: Record<string, { inputPer1k: number; outputPer1k: number }> = {
  'claude-sonnet-4-20250514': { inputPer1k: 0.003, outputPer1k: 0.015 },
  'claude-3-5-sonnet-20241022': { inputPer1k: 0.003, outputPer1k: 0.015 },
  'claude-3-5-haiku-20241022': { inputPer1k: 0.0008, outputPer1k: 0.004 },
  'claude-3-haiku-20240307': { inputPer1k: 0.00025, outputPer1k: 0.00125 },
};

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['claude-sonnet-4-20250514'];
  return (inputTokens / 1000 * pricing.inputPer1k) + (outputTokens / 1000 * pricing.outputPer1k);
}

// =============================================================================
// LLM INVOCATION SERVICE
// =============================================================================

export class LLMInvocationService {
  private schemaValidator: SchemaValidator;

  constructor() {
    this.schemaValidator = new SchemaValidator();
  }

  /**
   * Execute ACORD field extraction
   */
  async extractAcordFields(
    input: AcordExtractionInput,
    options: InvocationOptions = {}
  ): Promise<InvocationResult> {
    const startTime = Date.now();
    const invocationId = crypto.randomUUID();

    const model = options.model || 'claude-sonnet-4-20250514';
    const temperature = options.temperature ?? 0.0;
    const maxTokens = options.maxTokens || 8192;
    const retryOnValidationError = options.retryOnValidationError ?? true;
    const maxCorrectionAttempts = options.maxCorrectionAttempts || 2;

    let rawResponse = '';
    let parsedResponse: any = null;
    let schemaValid = false;
    let validationErrors: any[] = [];
    let requiredCorrection = false;

    let inputTokens = 0;
    let outputTokens = 0;

    try {
      // 1. Build the LLM request
      const requestParams: BuildAcordMappingRequestParams = {
        jobId: input.jobId,
        acordFormId: input.acordFormId,
        targetFormNumber: input.targetFormNumber,
        targetFields: input.targetFields,
        documentSummary: input.documentSummary,
        evidenceCatalog: input.evidenceCatalog,
        fieldCandidates: input.candidates,
        model,
        maxTokens,
        temperature,
      };

      const request = buildAcordMappingRequest(requestParams);

      // 2. Store initial invocation record
      await this.createInvocationRecord({
        invocationId,
        extractionId: input.extractionId,
        attemptNumber: input.attemptNumber || 1,
        request,
        model,
        temperature,
        maxTokens,
      });

      // 3. Store evidence catalog artifact
      if (!options.skipArtifacts) {
        await this.storeArtifact(invocationId, 'evidence_catalog', 'evidence', input.evidenceCatalog);
        await this.storeArtifact(invocationId, 'candidate_set', 'candidates', input.candidates);
      }

      // 4. Call the LLM
      const llmResult = await this.callLLM(request, model, temperature, maxTokens, options.timeoutMs);
      rawResponse = llmResult.rawResponse;
      inputTokens = llmResult.inputTokens;
      outputTokens = llmResult.outputTokens;

      // 5. Validate schema
      const validation = await this.schemaValidator.validateWithCorrection(
        rawResponse,
        request.outputSchema,
        {
          allowCorrection: retryOnValidationError,
          maxCorrectionAttempts,
          onCorrectionAttempt: async (attempt, errors) => {
            requiredCorrection = true;
            const errorMessages = errors.map(e => e.message);
            return this.callLLMForCorrection(errorMessages, rawResponse, request.outputSchema, model, maxTokens);
          },
        }
      );

      schemaValid = validation.valid;
      validationErrors = validation.errors || [];

      if (schemaValid) {
        // Parse the corrected output if available
        const outputToParse = validation.correctedOutput || rawResponse;
        parsedResponse = this.parseJsonSafely(outputToParse);
      }

      if (!schemaValid) {
        throw new Error(`Schema validation failed: ${JSON.stringify(validationErrors)}`);
      }

      // 6. Build field results from parsed response
      const fieldResults = this.buildFieldResults(parsedResponse, input.candidates);

      // 7. Store field outputs artifact
      if (!options.skipArtifacts) {
        await this.storeArtifact(invocationId, 'field_outputs', 'results', fieldResults);
      }

      // 8. Update invocation record with success
      const durationMs = Date.now() - startTime;
      await this.updateInvocationRecord(invocationId, {
        status: 'completed',
        rawResponse,
        parsedResponse,
        schemaValid,
        validationErrors,
        requiredCorrection,
        inputTokens,
        outputTokens,
        durationMs,
      });

      return {
        invocationId,
        success: true,
        fieldResults,
        rawResponse,
        parsedResponse,
        schemaValid,
        validationErrors,
        requiredCorrection,
        tokenUsage: {
          input: inputTokens,
          output: outputTokens,
          total: inputTokens + outputTokens,
          estimatedCostUsd: calculateCost(model, inputTokens, outputTokens),
        },
        durationMs: Date.now() - startTime,
      };

    } catch (error: any) {
      const durationMs = Date.now() - startTime;

      // Update invocation record with failure
      await this.updateInvocationRecord(invocationId, {
        status: 'failed',
        rawResponse,
        parsedResponse,
        schemaValid,
        validationErrors,
        requiredCorrection,
        inputTokens,
        outputTokens,
        durationMs,
        errorType: error.name || 'Error',
        errorMessage: error.message,
      });

      return {
        invocationId,
        success: false,
        fieldResults: {},
        rawResponse,
        parsedResponse,
        schemaValid,
        validationErrors,
        requiredCorrection,
        tokenUsage: {
          input: inputTokens,
          output: outputTokens,
          total: inputTokens + outputTokens,
          estimatedCostUsd: calculateCost(model, inputTokens, outputTokens),
        },
        durationMs,
        error: error.message,
      };
    }
  }

  /**
   * Replay a previous invocation (for debugging)
   */
  async replayInvocation(invocationId: string): Promise<{
    request: LLMRequest;
    response: any;
    artifacts: any[];
  }> {
    // Get invocation record
    const { data: invocation, error } = await supabase
      .from('llm_invocations')
      .select('*')
      .eq('id', invocationId)
      .single();

    if (error || !invocation) {
      throw new Error(`Invocation not found: ${invocationId}`);
    }

    // Get artifacts
    const { data: artifacts } = await supabase
      .from('llm_artifacts')
      .select('*')
      .eq('invocation_id', invocationId);

    // Reconstruct request
    const request: LLMRequest = {
      requestId: invocationId,
      requestType: invocation.request_type,
      systemPrompt: invocation.system_prompt_full,
      userPrompt: invocation.user_prompt_full,
      outputSchema: {},
      metadata: {
        jobId: invocationId,
        promptVersions: {
          system: invocation.system_prompt_version || '1.0.0',
          user: invocation.user_prompt_version || '1.0.0',
        },
        promptHashes: { system: '', user: '' },
        model: invocation.model_name,
        modelParameters: {
          maxTokens: invocation.max_tokens,
          temperature: invocation.temperature,
        },
        inputArtifacts: {},
        timestamp: invocation.created_at,
      },
    };

    return {
      request,
      response: invocation.parsed_response,
      artifacts: artifacts || [],
    };
  }

  /**
   * Get invocation statistics
   */
  async getInvocationStats(options?: {
    extractionId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<{
    totalInvocations: number;
    successRate: number;
    avgDurationMs: number;
    avgTokens: number;
    totalCostUsd: number;
    correctionRate: number;
  }> {
    let query = supabase
      .from('llm_invocations')
      .select('status, duration_ms, total_tokens, estimated_cost_usd, required_correction');

    if (options?.extractionId) {
      query = query.eq('extraction_id', options.extractionId);
    }
    if (options?.startDate) {
      query = query.gte('created_at', options.startDate);
    }
    if (options?.endDate) {
      query = query.lte('created_at', options.endDate);
    }

    const { data: invocations } = await query;

    if (!invocations || invocations.length === 0) {
      return {
        totalInvocations: 0,
        successRate: 0,
        avgDurationMs: 0,
        avgTokens: 0,
        totalCostUsd: 0,
        correctionRate: 0,
      };
    }

    const completed = invocations.filter(i => i.status === 'completed');
    const corrections = invocations.filter(i => i.required_correction);

    return {
      totalInvocations: invocations.length,
      successRate: completed.length / invocations.length,
      avgDurationMs: invocations.reduce((sum, i) => sum + (i.duration_ms || 0), 0) / invocations.length,
      avgTokens: invocations.reduce((sum, i) => sum + (i.total_tokens || 0), 0) / invocations.length,
      totalCostUsd: invocations.reduce((sum, i) => sum + (i.estimated_cost_usd || 0), 0),
      correctionRate: corrections.length / invocations.length,
    };
  }

  // Private methods

  private parseJsonSafely(jsonString: string): any {
    let cleaned = jsonString.trim();

    // Remove markdown code blocks
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();

    // Find JSON object
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
    }

    return JSON.parse(cleaned);
  }

  private async createInvocationRecord(params: {
    invocationId: string;
    extractionId: string;
    attemptNumber: number;
    request: LLMRequest;
    model: string;
    temperature: number;
    maxTokens: number;
  }): Promise<void> {
    await supabase.from('llm_invocations').insert({
      id: params.invocationId,
      extraction_id: params.extractionId,
      attempt_number: params.attemptNumber,
      request_type: params.request.requestType,
      system_prompt_version: params.request.metadata.promptVersions.system,
      user_prompt_version: params.request.metadata.promptVersions.user,
      system_prompt_full: params.request.systemPrompt,
      user_prompt_full: params.request.userPrompt,
      model_name: params.model,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      status: 'running',
      started_at: new Date().toISOString(),
    });
  }

  private async updateInvocationRecord(
    invocationId: string,
    updates: {
      status: string;
      rawResponse?: string;
      parsedResponse?: any;
      schemaValid?: boolean;
      validationErrors?: any[];
      requiredCorrection?: boolean;
      correctionInvocationId?: string | null;
      inputTokens?: number;
      outputTokens?: number;
      durationMs?: number;
      errorType?: string;
      errorMessage?: string;
    }
  ): Promise<void> {
    await supabase.from('llm_invocations').update({
      status: updates.status,
      raw_response: updates.rawResponse,
      parsed_response: updates.parsedResponse,
      schema_valid: updates.schemaValid,
      validation_errors: updates.validationErrors,
      required_correction: updates.requiredCorrection,
      correction_invocation_id: updates.correctionInvocationId,
      input_tokens: updates.inputTokens,
      output_tokens: updates.outputTokens,
      total_tokens: (updates.inputTokens || 0) + (updates.outputTokens || 0),
      estimated_cost_usd: updates.inputTokens && updates.outputTokens
        ? calculateCost('claude-sonnet-4-20250514', updates.inputTokens, updates.outputTokens)
        : null,
      duration_ms: updates.durationMs,
      completed_at: new Date().toISOString(),
      error_type: updates.errorType,
      error_message: updates.errorMessage,
    }).eq('id', invocationId);
  }

  private async storeArtifact(
    invocationId: string,
    artifactType: string,
    artifactName: string,
    content: any
  ): Promise<void> {
    const contentJson = content;
    const contentString = JSON.stringify(contentJson);
    const sizeBytes = new Blob([contentString]).size;

    // Simple hash for deduplication
    const contentHash = await this.hashContent(contentString);

    await supabase.from('llm_artifacts').insert({
      invocation_id: invocationId,
      artifact_type: artifactType,
      artifact_name: artifactName,
      content_json: contentJson,
      content_hash: contentHash,
      size_bytes: sizeBytes,
    });
  }

  private async hashContent(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
  }

  private async callLLM(
    request: LLMRequest,
    model: string,
    temperature: number,
    maxTokens: number,
    timeoutMs?: number
  ): Promise<{ rawResponse: string; inputTokens: number; outputTokens: number }> {
    const { data: { session } } = await supabase.auth.getSession();

    const controller = new AbortController();
    const timeout = timeoutMs || 60000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Get Supabase URL from environment
    const supabaseUrl = (window as any).__SUPABASE_URL__ ||
      import.meta.env?.VITE_SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      '';

    try {
      const response = await fetch(
        `${supabaseUrl}/functions/v1/llm-invoke`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            model,
            temperature,
            max_tokens: maxTokens,
            system: request.systemPrompt,
            messages: [
              { role: 'user', content: request.userPrompt },
            ],
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'LLM invocation failed');
      }

      const data = await response.json();

      return {
        rawResponse: data.content || data.completion || '',
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
      };

    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error(`LLM invocation timed out after ${timeout}ms`);
      }
      throw error;
    }
  }

  private async callLLMForCorrection(
    errors: string[],
    originalOutput: string,
    schema: object,
    model: string,
    maxTokens: number
  ): Promise<string> {
    const correctionPrompt = `Your previous response had JSON schema validation errors:

${errors.join('\n')}

Please correct your response to match the required schema exactly.

Original response:
${originalOutput}

Required schema:
${JSON.stringify(schema, null, 2)}

Return ONLY the corrected JSON, no explanation.`;

    const result = await this.callLLM(
      {
        requestId: crypto.randomUUID(),
        requestType: 'schema_correction',
        systemPrompt: 'You are a JSON correction assistant. Return only valid JSON.',
        userPrompt: correctionPrompt,
        outputSchema: schema,
        metadata: {
          jobId: '',
          promptVersions: { system: '1.0.0', user: '1.0.0' },
          promptHashes: { system: '', user: '' },
          model,
          modelParameters: { maxTokens, temperature: 0 },
          inputArtifacts: {},
          timestamp: new Date().toISOString(),
        },
      },
      model,
      0,
      maxTokens
    );

    return result.rawResponse;
  }

  private buildFieldResults(
    parsedResponse: any,
    candidates: Record<string, CandidateEntry[]>
  ): Record<string, FieldResult> {
    const results: Record<string, FieldResult> = {};

    const fieldOutputs: LLMFieldOutput[] = parsedResponse.fields || parsedResponse.field_outputs || [];

    for (const output of fieldOutputs) {
      // Build candidate map for this field
      const fieldCandidates = candidates[output.field_name] || [];
      const candidateMap: Record<string, CandidateData> = {};

      for (const candidate of fieldCandidates) {
        candidateMap[candidate.candidate_id] = {
          candidate_id: candidate.candidate_id,
          raw_value: candidate.raw_value,
          normalized_value: candidate.normalized_value,
          evidence_ids: candidate.evidence_ids,
        };
      }

      results[output.field_name] = buildFieldResult(output, candidateMap);
    }

    return results;
  }
}

// Export singleton
export const llmInvocationService = new LLMInvocationService();
