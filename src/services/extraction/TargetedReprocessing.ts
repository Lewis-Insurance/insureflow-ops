/**
 * Targeted Reprocessing Service
 *
 * Focused extraction for specific fields that need improvement.
 * More efficient than full re-extraction when only a few fields need attention.
 *
 * Features:
 * - Field-specific candidate generation
 * - Enhanced preprocessing for problem areas
 * - Context expansion for related fields
 * - Merge with existing extraction results
 */

import { supabase } from '@/integrations/supabase/client';
import { EvidenceCatalogBuilder, EvidenceCatalog, EvidenceEntry } from './EvidenceCatalogBuilder';
import { FieldResult, FieldStatus, determineFieldStatus } from './FieldResult';
import { CONFIDENCE_THRESHOLDS } from './FieldResult';

// =============================================================================
// TYPES
// =============================================================================

export interface ReprocessingRequest {
  /** Original extraction ID */
  extractionId: string;

  /** Fields to reprocess */
  targetFields: string[];

  /** Reason for reprocessing */
  reason: ReprocessingReason;

  /** Optional: user hints for the field */
  userHints?: Record<string, UserHint>;

  /** Optional: additional preprocessing options */
  preprocessingOptions?: PreprocessingOptions;
}

export type ReprocessingReason =
  | 'low_confidence'
  | 'conflict_resolution'
  | 'not_found'
  | 'validation_failure'
  | 'user_request';

export interface UserHint {
  /** User's suggested value */
  suggestedValue?: string;

  /** Region of document where field might be */
  pageHint?: number;

  /** Bounding box where to look */
  regionHint?: { x: number; y: number; width: number; height: number };

  /** Additional context */
  context?: string;
}

export interface PreprocessingOptions {
  /** DPI for rendering */
  renderDpi?: number;

  /** Preprocessing filters */
  filters?: ('contrast' | 'deskew' | 'denoise' | 'sharpen' | 'binarize')[];

  /** Use OCR enhancement */
  enhancedOcr?: boolean;

  /** Expand search region by percentage */
  regionExpansion?: number;
}

export interface ReprocessingResult {
  /** Request ID for tracking */
  requestId: string;

  /** Success status */
  success: boolean;

  /** Original extraction ID */
  extractionId: string;

  /** Reprocessed field results */
  fieldResults: Record<string, FieldResult>;

  /** Fields that improved */
  improvedFields: string[];

  /** Fields still needing attention */
  unimprovedFields: string[];

  /** Error if failed */
  error?: string;

  /** Processing metrics */
  metrics: ReprocessingMetrics;
}

export interface ReprocessingMetrics {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  candidatesGenerated: number;
  llmCalls: number;
}

// =============================================================================
// RELATED FIELD GROUPS
// =============================================================================

/**
 * Fields that should be reprocessed together for context
 */
const RELATED_FIELD_GROUPS: Record<string, string[]> = {
  // Address components
  MailingAddress: ['MailingAddress', 'MailingCity', 'MailingState', 'MailingZip'],
  MailingCity: ['MailingAddress', 'MailingCity', 'MailingState', 'MailingZip'],
  MailingState: ['MailingAddress', 'MailingCity', 'MailingState', 'MailingZip'],
  MailingZip: ['MailingAddress', 'MailingCity', 'MailingState', 'MailingZip'],

  // Date pairs
  EffectiveDate: ['EffectiveDate', 'ExpirationDate'],
  ExpirationDate: ['EffectiveDate', 'ExpirationDate'],

  // Liability limits
  GeneralAggregate: ['GeneralAggregate', 'EachOccurrence', 'ProductsCompletedOps'],
  EachOccurrence: ['GeneralAggregate', 'EachOccurrence', 'ProductsCompletedOps'],
  ProductsCompletedOps: ['GeneralAggregate', 'EachOccurrence', 'ProductsCompletedOps'],

  // Auto limits
  BodilyInjuryPerPerson: ['BodilyInjuryPerPerson', 'BodilyInjuryPerAccident', 'PropertyDamage'],
  BodilyInjuryPerAccident: ['BodilyInjuryPerPerson', 'BodilyInjuryPerAccident', 'PropertyDamage'],
  PropertyDamage: ['BodilyInjuryPerPerson', 'BodilyInjuryPerAccident', 'PropertyDamage'],

  // Carrier info
  CarrierName: ['CarrierName', 'CarrierNAIC', 'PolicyNumber'],
  CarrierNAIC: ['CarrierName', 'CarrierNAIC', 'PolicyNumber'],
};

// =============================================================================
// REPROCESSING SERVICE
// =============================================================================

export class TargetedReprocessingService {
  private evidenceCatalogBuilder: EvidenceCatalogBuilder;

  constructor() {
    this.evidenceCatalogBuilder = new EvidenceCatalogBuilder();
  }

  /**
   * Reprocess specific fields with enhanced extraction
   */
  async reprocess(request: ReprocessingRequest): Promise<ReprocessingResult> {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();

    let llmCalls = 0;
    let candidatesGenerated = 0;

    try {
      // 1. Get original extraction data
      const { data: extraction, error } = await supabase
        .from('document_extractions')
        .select('*')
        .eq('id', request.extractionId)
        .single();

      if (error || !extraction) {
        throw new Error(`Extraction not found: ${request.extractionId}`);
      }

      // 2. Expand target fields to include related fields
      const expandedFields = this.expandRelatedFields(request.targetFields);

      // 3. Rebuild evidence catalog with focus on target fields
      const existingEvidence = extraction.azure_raw_response as any;
      const catalog = this.evidenceCatalogBuilder.build(existingEvidence || {});

      // 4. Generate focused candidates for each field
      const fieldCandidates: Record<string, EvidenceEntry[]> = {};

      for (const fieldName of expandedFields) {
        const candidates = this.generateCandidatesForField(
          catalog,
          fieldName,
          request.userHints?.[fieldName]
        );
        fieldCandidates[fieldName] = candidates;
        candidatesGenerated += candidates.length;
      }

      // 5. Queue for LLM processing with focused prompt
      const { data: queueData, error: queueError } = await supabase
        .from('reprocessing_queue')
        .insert({
          extraction_id: request.extractionId,
          reprocess_type: 'field_candidates',
          target_field_names: expandedFields,
          trigger_reason: request.reason,
          settings: {
            ...request.preprocessingOptions,
            userHints: request.userHints,
          },
          field_candidates: fieldCandidates,
          status: 'queued',
        })
        .select()
        .single();

      if (queueError) {
        throw new Error(`Failed to queue reprocessing: ${queueError.message}`);
      }

      // 6. For now, return queued status
      // In production, this would wait for the Edge Function to process
      const endTime = Date.now();

      return {
        requestId,
        success: true,
        extractionId: request.extractionId,
        fieldResults: {},
        improvedFields: [],
        unimprovedFields: expandedFields,
        metrics: {
          startedAt: new Date(startTime).toISOString(),
          completedAt: new Date(endTime).toISOString(),
          durationMs: endTime - startTime,
          candidatesGenerated,
          llmCalls,
        },
      };

    } catch (error: any) {
      const endTime = Date.now();

      return {
        requestId,
        success: false,
        extractionId: request.extractionId,
        fieldResults: {},
        improvedFields: [],
        unimprovedFields: request.targetFields,
        error: error.message,
        metrics: {
          startedAt: new Date(startTime).toISOString(),
          completedAt: new Date(endTime).toISOString(),
          durationMs: endTime - startTime,
          candidatesGenerated,
          llmCalls,
        },
      };
    }
  }

  /**
   * Synchronous reprocessing (blocks until complete)
   */
  async reprocessSync(request: ReprocessingRequest): Promise<ReprocessingResult> {
    const result = await this.reprocess(request);

    if (!result.success) {
      return result;
    }

    // Poll for completion
    const maxWaitMs = 30000;
    const pollIntervalMs = 1000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const { data: queueItem } = await supabase
        .from('reprocessing_queue')
        .select('*')
        .eq('extraction_id', request.extractionId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (queueItem) {
        // Merge results
        return {
          ...result,
          fieldResults: queueItem.result_fields || {},
          improvedFields: queueItem.improved_fields || [],
          unimprovedFields: queueItem.unimproved_fields || [],
        };
      }

      // Check for failure
      const { data: failedItem } = await supabase
        .from('reprocessing_queue')
        .select('*')
        .eq('extraction_id', request.extractionId)
        .eq('status', 'failed')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (failedItem) {
        return {
          ...result,
          success: false,
          error: failedItem.error_message || 'Reprocessing failed',
        };
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    return {
      ...result,
      success: false,
      error: 'Reprocessing timed out',
    };
  }

  /**
   * Get recommended fields for reprocessing
   */
  getReprocessingRecommendations(
    fieldResults: Record<string, FieldResult>
  ): {
    fields: string[];
    priority: 'high' | 'medium' | 'low';
    reason: ReprocessingReason;
  }[] {
    const recommendations: {
      fields: string[];
      priority: 'high' | 'medium' | 'low';
      reason: ReprocessingReason;
    }[] = [];

    // Group fields by issue type
    const notFound: string[] = [];
    const conflicts: string[] = [];
    const lowConfidence: string[] = [];
    const validationFailed: string[] = [];

    for (const [fieldName, result] of Object.entries(fieldResults)) {
      if (result.status === 'NOT_FOUND') {
        notFound.push(fieldName);
      } else if (result.status === 'CONFLICT') {
        conflicts.push(fieldName);
      } else if (result.confidenceCalibrated < CONFIDENCE_THRESHOLDS.REVIEW) {
        lowConfidence.push(fieldName);
      } else if (result.validations.some(v => !v.passed && v.severity === 'error')) {
        validationFailed.push(fieldName);
      }
    }

    // Critical fields not found = high priority
    const criticalFields = ['NamedInsured', 'PolicyNumber', 'EffectiveDate', 'ExpirationDate'];
    const criticalNotFound = notFound.filter(f => criticalFields.includes(f));

    if (criticalNotFound.length > 0) {
      recommendations.push({
        fields: this.expandRelatedFields(criticalNotFound),
        priority: 'high',
        reason: 'not_found',
      });
    }

    // Conflicts = high priority
    if (conflicts.length > 0) {
      recommendations.push({
        fields: this.expandRelatedFields(conflicts),
        priority: 'high',
        reason: 'conflict_resolution',
      });
    }

    // Validation failures = medium priority
    if (validationFailed.length > 0) {
      recommendations.push({
        fields: this.expandRelatedFields(validationFailed),
        priority: 'medium',
        reason: 'validation_failure',
      });
    }

    // Low confidence = low priority
    if (lowConfidence.length > 0) {
      recommendations.push({
        fields: this.expandRelatedFields(lowConfidence),
        priority: 'low',
        reason: 'low_confidence',
      });
    }

    return recommendations;
  }

  /**
   * Merge reprocessing results with original extraction
   */
  mergeResults(
    original: Record<string, FieldResult>,
    reprocessed: Record<string, FieldResult>
  ): Record<string, FieldResult> {
    const merged = { ...original };

    for (const [fieldName, newResult] of Object.entries(reprocessed)) {
      const existingResult = merged[fieldName];

      // Always take reprocessed result if:
      // - Original doesn't exist
      // - New result has higher confidence
      // - New result resolves NOT_FOUND status
      // - New result resolves CONFLICT status
      if (
        !existingResult ||
        newResult.confidenceCalibrated > existingResult.confidenceCalibrated ||
        (existingResult.status === 'NOT_FOUND' && newResult.status !== 'NOT_FOUND') ||
        (existingResult.status === 'CONFLICT' && newResult.status !== 'CONFLICT')
      ) {
        merged[fieldName] = newResult;
      }
    }

    return merged;
  }

  // Private methods

  private expandRelatedFields(targetFields: string[]): string[] {
    const expanded = new Set(targetFields);

    for (const field of targetFields) {
      const related = RELATED_FIELD_GROUPS[field];
      if (related) {
        for (const relatedField of related) {
          expanded.add(relatedField);
        }
      }
    }

    return Array.from(expanded);
  }

  private generateCandidatesForField(
    catalog: EvidenceCatalog,
    fieldName: string,
    userHint?: UserHint
  ): EvidenceEntry[] {
    // Get evidence tagged for this field
    let candidates = this.evidenceCatalogBuilder.getEvidenceForField(catalog, fieldName);

    // If no direct matches, broaden search
    if (candidates.length === 0) {
      // Search by value patterns
      candidates = this.searchByValuePattern(catalog, fieldName);
    }

    // Apply user hints
    if (userHint) {
      candidates = this.applyUserHints(candidates, catalog, userHint);
    }

    // Sort by confidence
    candidates.sort((a, b) => b.confidence - a.confidence);

    // Limit to reasonable number
    return candidates.slice(0, 10);
  }

  private searchByValuePattern(catalog: EvidenceCatalog, fieldName: string): EvidenceEntry[] {
    const entries = Object.values(catalog.entries);

    switch (fieldName) {
      case 'EffectiveDate':
      case 'ExpirationDate':
        // Look for date patterns
        return entries.filter(e =>
          /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(e.value) ||
          /\d{4}-\d{2}-\d{2}/.test(e.value)
        );

      case 'PolicyNumber':
        // Look for alphanumeric patterns
        return entries.filter(e =>
          /^[A-Z]{1,4}[\d-]+$/.test(e.value) ||
          /^\d{6,}$/.test(e.value)
        );

      case 'FEIN':
        // Look for EIN pattern
        return entries.filter(e => /^\d{2}-\d{7}$/.test(e.value));

      case 'TotalPremium':
      case 'GeneralAggregate':
      case 'EachOccurrence':
        // Look for currency patterns
        return entries.filter(e =>
          /^\$?[\d,]+\.?\d*$/.test(e.value) ||
          /^[\d,]+\.?\d*$/.test(e.normalizedValue)
        );

      case 'MailingAddress':
        // Look for address patterns
        return entries.filter(e =>
          /\d+\s+[A-Za-z]/.test(e.value) &&
          e.value.length > 10
        );

      case 'MailingState':
        // Look for state codes
        return entries.filter(e =>
          /^[A-Z]{2}$/.test(e.value.trim())
        );

      case 'MailingZip':
        // Look for zip codes
        return entries.filter(e =>
          /^\d{5}(-\d{4})?$/.test(e.value.trim())
        );

      default:
        return [];
    }
  }

  private applyUserHints(
    candidates: EvidenceEntry[],
    catalog: EvidenceCatalog,
    hint: UserHint
  ): EvidenceEntry[] {
    let filtered = [...candidates];

    // Filter by page
    if (hint.pageHint !== undefined) {
      const pageFiltered = filtered.filter(e => e.pageNumber === hint.pageHint);
      if (pageFiltered.length > 0) {
        filtered = pageFiltered;
      }
    }

    // Filter by region
    if (hint.regionHint && hint.regionHint.x !== undefined) {
      const regionFiltered = filtered.filter(e => {
        if (!e.boundingBox) return false;

        const region = hint.regionHint!;
        return (
          e.boundingBox.x >= region.x - 50 &&
          e.boundingBox.x <= region.x + region.width + 50 &&
          e.boundingBox.y >= region.y - 50 &&
          e.boundingBox.y <= region.y + region.height + 50
        );
      });

      if (regionFiltered.length > 0) {
        filtered = regionFiltered;
      }
    }

    // If suggested value provided, add as synthetic candidate
    if (hint.suggestedValue) {
      // Check if any existing candidate matches
      const hasMatch = filtered.some(e =>
        e.value.toLowerCase() === hint.suggestedValue!.toLowerCase() ||
        e.normalizedValue.toLowerCase() === hint.suggestedValue!.toLowerCase()
      );

      if (!hasMatch) {
        // Add synthetic candidate with moderate confidence
        filtered.unshift({
          evidenceId: 'USER_HINT',
          sourceType: 'text_span',
          label: 'User Suggestion',
          value: hint.suggestedValue,
          normalizedValue: hint.suggestedValue,
          confidence: 0.75, // User hints get moderate confidence
          pageNumber: hint.pageHint || 1,
          boundingBox: null,
          relatedEvidenceIds: [],
          tags: [],
        });
      }
    }

    return filtered;
  }
}

// Export singleton
export const targetedReprocessing = new TargetedReprocessingService();
