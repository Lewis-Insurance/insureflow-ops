/**
 * Retry Controller Service
 *
 * Progressive extraction enhancement strategy:
 * - Attempt 1: Baseline Azure DI extraction
 * - Attempt 2: Improved preprocessing (higher DPI, contrast, deskew)
 * - Attempt 3: Alternative DI models based on doc type
 * - Targeted retries for specific low-confidence fields
 *
 * Features:
 * - Retry triggers based on confidence thresholds
 * - Critical field detection
 * - Merge results from multiple attempts
 * - Cap attempts to prevent infinite loops
 */

import { supabase } from '@/integrations/supabase/client';

export interface ExtractionAttempt {
  attemptNo: number;
  settings: RetrySettings;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  endedAt?: string;
  error?: string;
  result?: ExtractionResult;
}

export interface RetrySettings {
  renderDpi: number;
  preprocessors: ('contrast' | 'deskew' | 'denoise' | 'sharpen')[];
  models: string[];
  targetFields?: string[]; // For targeted retries
  useTemplateMatching: boolean;
  useLLMMapping: boolean;
}

export interface ExtractionResult {
  fields: Record<string, ExtractedField>;
  overallConfidence: number;
  confidenceTier: 'high' | 'medium' | 'low';
  missingCriticalFields: string[];
  conflicts: string[];
}

export interface ExtractedField {
  value: string | null;
  confidence: number;
  status: 'AUTO_APPLIED' | 'NEEDS_REVIEW' | 'NEEDS_VERIFICATION' | 'NOT_FOUND' | 'CONFLICT';
  evidenceIds: string[];
}

// Critical fields that trigger retries if missing or low confidence
const CRITICAL_FIELDS = [
  'NamedInsured',
  'PolicyNumber',
  'EffectiveDate',
  'ExpirationDate',
  'CarrierName',
  'CarrierNAIC',
  'TotalPremium',
  'GeneralAggregate',
  'EachOccurrence',
];

// Thresholds for retry triggers
const THRESHOLDS = {
  overallConfidenceRetry: 0.70, // Retry if overall < this
  criticalFieldRetry: 0.80, // Retry if critical field < this
  maxAttempts: 3,
};

// Retry strategies by attempt number
const RETRY_STRATEGIES: Record<number, RetrySettings> = {
  1: {
    renderDpi: 200,
    preprocessors: [],
    models: ['prebuilt-document'],
    useTemplateMatching: true,
    useLLMMapping: true,
  },
  2: {
    renderDpi: 300,
    preprocessors: ['contrast', 'deskew', 'denoise'],
    models: ['prebuilt-document', 'prebuilt-layout'],
    useTemplateMatching: true,
    useLLMMapping: true,
  },
  3: {
    renderDpi: 400,
    preprocessors: ['contrast', 'deskew', 'denoise', 'sharpen'],
    models: ['prebuilt-document', 'prebuilt-layout', 'prebuilt-invoice'],
    useTemplateMatching: true,
    useLLMMapping: true,
  },
};

export interface RetryProgress {
  currentAttempt: number;
  maxAttempts: number;
  status: 'idle' | 'running' | 'completed' | 'failed';
  message: string;
  attempts: ExtractionAttempt[];
  bestResult?: ExtractionResult;
}

export type ProgressCallback = (progress: RetryProgress) => void;

class RetryControllerClass {
  private abortControllers: Map<string, AbortController> = new Map();

  /**
   * Start extraction with automatic retries
   */
  async extractWithRetries(
    documentUrl: string,
    documentName: string,
    options: {
      accountId?: string;
      acordFormId?: string;
      documentType?: string;
      onProgress?: ProgressCallback;
    }
  ): Promise<{
    success: boolean;
    extractionId: string;
    result: ExtractionResult;
    attempts: ExtractionAttempt[];
  }> {
    const jobId = crypto.randomUUID();
    const abortController = new AbortController();
    this.abortControllers.set(jobId, abortController);

    const attempts: ExtractionAttempt[] = [];
    let bestResult: ExtractionResult | null = null;
    let extractionId = '';

    const updateProgress = (status: RetryProgress['status'], message: string) => {
      options.onProgress?.({
        currentAttempt: attempts.length,
        maxAttempts: THRESHOLDS.maxAttempts,
        status,
        message,
        attempts,
        bestResult: bestResult || undefined,
      });
    };

    try {
      for (let attemptNo = 1; attemptNo <= THRESHOLDS.maxAttempts; attemptNo++) {
        if (abortController.signal.aborted) {
          throw new Error('Extraction cancelled');
        }

        const settings = this.getSettingsForAttempt(attemptNo, bestResult);

        const attempt: ExtractionAttempt = {
          attemptNo,
          settings,
          status: 'running',
          startedAt: new Date().toISOString(),
        };
        attempts.push(attempt);

        updateProgress('running', this.getProgressMessage(attemptNo));

        try {
          const result = await this.runExtraction(
            documentUrl,
            documentName,
            settings,
            options,
            abortController.signal
          );

          attempt.status = 'completed';
          attempt.endedAt = new Date().toISOString();
          attempt.result = result;
          extractionId = result.extractionId || extractionId;

          // Merge with best result
          if (!bestResult || result.overallConfidence > bestResult.overallConfidence) {
            bestResult = result;
          } else {
            // Merge specific improved fields
            bestResult = this.mergeResults(bestResult, result);
          }

          // Check if we should continue retrying
          if (!this.shouldRetry(bestResult, attemptNo)) {
            updateProgress('completed', 'Extraction complete');
            break;
          }

          // If retrying, update message
          if (attemptNo < THRESHOLDS.maxAttempts) {
            updateProgress('running', 'Improving extraction quality...');
          }

        } catch (error: any) {
          attempt.status = 'failed';
          attempt.endedAt = new Date().toISOString();
          attempt.error = error.message;

          // Don't fail completely on intermediate attempts
          if (attemptNo === THRESHOLDS.maxAttempts && !bestResult) {
            throw error;
          }
        }
      }

      if (!bestResult) {
        throw new Error('All extraction attempts failed');
      }

      this.abortControllers.delete(jobId);

      return {
        success: true,
        extractionId,
        result: bestResult,
        attempts,
      };

    } catch (error: any) {
      this.abortControllers.delete(jobId);
      updateProgress('failed', error.message);
      throw error;
    }
  }

  /**
   * Retry extraction for specific fields only
   */
  async retryForFields(
    extractionId: string,
    fieldNames: string[],
    options?: {
      onProgress?: ProgressCallback;
    }
  ): Promise<{
    success: boolean;
    improvedFields: string[];
    result: Partial<ExtractionResult>;
  }> {
    const updateProgress = (status: RetryProgress['status'], message: string) => {
      options?.onProgress?.({
        currentAttempt: 1,
        maxAttempts: 1,
        status,
        message,
        attempts: [],
      });
    };

    updateProgress('running', `Reprocessing ${fieldNames.length} field(s)...`);

    try {
      // Get the original extraction
      const { data: extraction, error } = await supabase
        .from('document_extractions')
        .select('document_url, document_name, account_id, acord_form_id, document_type')
        .eq('id', extractionId)
        .single();

      if (error || !extraction) {
        throw new Error('Extraction not found');
      }

      // Queue reprocessing for specific fields
      await supabase.from('reprocessing_queue').insert({
        extraction_id: extractionId,
        reprocess_type: 'field_candidates',
        target_field_names: fieldNames,
        trigger_reason: 'user_request',
        settings: {
          renderDpi: 400,
          preprocessors: ['contrast', 'deskew', 'denoise', 'sharpen'],
          useEnhancedOCR: true,
        },
        status: 'queued',
      });

      updateProgress('completed', 'Reprocessing queued');

      return {
        success: true,
        improvedFields: [],
        result: {},
      };

    } catch (error: any) {
      updateProgress('failed', error.message);
      throw error;
    }
  }

  /**
   * Cancel an ongoing extraction
   */
  cancelExtraction(jobId: string): void {
    const controller = this.abortControllers.get(jobId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(jobId);
    }
  }

  /**
   * Get retry recommendation for a result
   */
  getRetryRecommendation(result: ExtractionResult): {
    shouldRetry: boolean;
    reason: string;
    targetFields: string[];
    strategy: 'full' | 'targeted' | 'none';
  } {
    const lowConfidenceFields = Object.entries(result.fields)
      .filter(([_, field]) => field.confidence < THRESHOLDS.criticalFieldRetry)
      .map(([name]) => name);

    const missingCritical = result.missingCriticalFields;

    if (missingCritical.length > 0) {
      return {
        shouldRetry: true,
        reason: `Missing critical fields: ${missingCritical.join(', ')}`,
        targetFields: missingCritical,
        strategy: 'full', // Full retry for missing fields
      };
    }

    const criticalLowConfidence = lowConfidenceFields.filter(f =>
      CRITICAL_FIELDS.includes(f)
    );

    if (criticalLowConfidence.length > 0) {
      return {
        shouldRetry: true,
        reason: `Low confidence on critical fields: ${criticalLowConfidence.join(', ')}`,
        targetFields: criticalLowConfidence,
        strategy: criticalLowConfidence.length > 3 ? 'full' : 'targeted',
      };
    }

    if (result.overallConfidence < THRESHOLDS.overallConfidenceRetry) {
      return {
        shouldRetry: true,
        reason: `Overall confidence too low (${(result.overallConfidence * 100).toFixed(0)}%)`,
        targetFields: lowConfidenceFields,
        strategy: 'full',
      };
    }

    return {
      shouldRetry: false,
      reason: 'Extraction quality acceptable',
      targetFields: [],
      strategy: 'none',
    };
  }

  // Private methods

  private getSettingsForAttempt(
    attemptNo: number,
    previousResult: ExtractionResult | null
  ): RetrySettings {
    const baseSettings = RETRY_STRATEGIES[attemptNo] || RETRY_STRATEGIES[3];

    // If we have previous results, target specific fields
    if (previousResult && attemptNo > 1) {
      const recommendation = this.getRetryRecommendation(previousResult);

      if (recommendation.strategy === 'targeted') {
        return {
          ...baseSettings,
          targetFields: recommendation.targetFields,
        };
      }
    }

    return baseSettings;
  }

  private getProgressMessage(attemptNo: number): string {
    switch (attemptNo) {
      case 1:
        return 'Extracting document data...';
      case 2:
        return 'Enhancing scan quality and retrying...';
      case 3:
        return 'Applying advanced extraction models...';
      default:
        return 'Processing...';
    }
  }

  private shouldRetry(result: ExtractionResult, attemptNo: number): boolean {
    if (attemptNo >= THRESHOLDS.maxAttempts) {
      return false;
    }

    const recommendation = this.getRetryRecommendation(result);
    return recommendation.shouldRetry;
  }

  private mergeResults(
    existing: ExtractionResult,
    newer: ExtractionResult
  ): ExtractionResult {
    const merged: ExtractionResult = {
      ...existing,
      fields: { ...existing.fields },
    };

    // Take fields from newer result if they have higher confidence
    for (const [fieldName, newerField] of Object.entries(newer.fields)) {
      const existingField = merged.fields[fieldName];

      if (!existingField || newerField.confidence > existingField.confidence) {
        merged.fields[fieldName] = newerField;
      }
    }

    // Recalculate overall metrics
    const fieldConfidences = Object.values(merged.fields).map(f => f.confidence);
    merged.overallConfidence = fieldConfidences.length > 0
      ? fieldConfidences.reduce((sum, c) => sum + c, 0) / fieldConfidences.length
      : 0;

    merged.confidenceTier =
      merged.overallConfidence >= 0.9 ? 'high' :
      merged.overallConfidence >= 0.7 ? 'medium' : 'low';

    merged.missingCriticalFields = CRITICAL_FIELDS.filter(
      f => !merged.fields[f] || merged.fields[f].status === 'NOT_FOUND'
    );

    return merged;
  }

  private async runExtraction(
    documentUrl: string,
    documentName: string,
    settings: RetrySettings,
    options: {
      accountId?: string;
      acordFormId?: string;
      documentType?: string;
    },
    signal: AbortSignal
  ): Promise<ExtractionResult & { extractionId: string }> {
    const { data: { session } } = await supabase.auth.getSession();

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/acord-extraction-pipeline`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          document_url: documentUrl,
          document_name: documentName,
          account_id: options.accountId,
          acord_form_id: options.acordFormId,
          user_hints: {
            doc_type: options.documentType,
          },
          settings: {
            render_dpi: settings.renderDpi,
            preprocessors: settings.preprocessors,
            models: settings.models,
            target_fields: settings.targetFields,
            use_template_matching: settings.useTemplateMatching,
            use_llm_mapping: settings.useLLMMapping,
          },
        }),
        signal,
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Extraction failed');
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Extraction returned unsuccessful');
    }

    // Transform response to ExtractionResult
    const fields: Record<string, ExtractedField> = {};

    for (const output of (data.field_outputs || [])) {
      fields[output.field_name] = {
        value: output.normalized_value,
        confidence: output.confidence_calibrated || output.confidence_raw || 0,
        status: output.status,
        evidenceIds: output.evidence_ids || [],
      };
    }

    const metrics = data.metrics || {};

    return {
      extractionId: data.extraction_id,
      fields,
      overallConfidence: metrics.avg_confidence || 0,
      confidenceTier: data.confidence_tier || 'low',
      missingCriticalFields: CRITICAL_FIELDS.filter(
        f => !fields[f] || fields[f].status === 'NOT_FOUND'
      ),
      conflicts: Object.keys(fields).filter(f => fields[f].status === 'CONFLICT'),
    };
  }
}

// Export singleton
export const retryController = new RetryControllerClass();
