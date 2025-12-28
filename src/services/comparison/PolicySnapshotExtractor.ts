/**
 * Policy Snapshot Extractor
 *
 * Extracts PolicySnapshot from document evidence using LLM.
 * Uses two-phase approach:
 * 1. Initial extraction with full evidence catalog
 * 2. Targeted retry for low-confidence fields
 *
 * LLM is used ONLY for extraction - NOT for comparison/diff.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import {
  PolicySnapshot,
  SnapshotField,
  DocumentType,
  LineOfBusiness,
  FieldType,
  ComparisonCategory,
  NormalizedValue,
  ExtractionProfile,
  EXTRACTION_PROFILES,
  CURRENT_VERSIONS,
} from '@/types/coverage-comparison';
import {
  ComparisonEvidenceCatalog,
  ComparisonEvidenceEntry,
  ComparisonEvidenceService,
} from './ComparisonEvidenceService';
import {
  POLICY_EXTRACTION_SYSTEM_PROMPT,
  buildPolicyExtractionUserPrompt,
  PolicyExtractionContext,
  COMPARISON_PROMPT_VERSIONS,
  getPromptMetadata,
} from './prompts';
import {
  normalizeValue,
  getDisplayValue,
} from './normalization';
import type { FieldStatus } from '@/services/extraction/FieldResult';

// =============================================================================
// TYPES
// =============================================================================

/** LLM extraction response */
interface LLMExtractionResponse {
  document_classification: {
    document_type: string;
    line_of_business: string;
    carrier: string | null;
    carrier_naic: string | null;
    confidence: number;
  };
  fields: Record<string, {
    raw_value: string | null;
    normalized_value: string | null;
    status: string;
    confidence: number;
    evidence_ids: string[];
    primary_evidence_id: string | null;
    is_endorsement_override: boolean;
    overridden_value?: string;
    reasoning?: string;
  }>;
  notes_for_review: string[];
}

/** Extraction job for tracking */
interface ExtractionJob {
  id: string;
  workspaceId: string;
  documentId: string;
  docRole: 'A' | 'B';
  status: 'pending' | 'extracting' | 'retrying' | 'completed' | 'failed';
  attemptCount: number;
  lowConfidenceFields: string[];
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
  processingTimeMs?: number;
}

/** Prompt run record for debugging */
interface PromptRun {
  jobId: string;
  promptType: 'extraction' | 'retry';
  systemPromptHash: string;
  userPromptHash: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  latencyMs: number;
  status: 'success' | 'error' | 'validation_failed';
  errorMessage?: string;
}

// =============================================================================
// SERVICE CLASS
// =============================================================================

export class PolicySnapshotExtractor {
  private supabase: SupabaseClient;
  private evidenceService: ComparisonEvidenceService;

  // Model configuration
  private readonly MODEL = 'gpt-4o-2024-08-06';
  private readonly MAX_TOKENS = 4000;
  private readonly TEMPERATURE = 0.1; // Low for deterministic extraction

  // Retry configuration
  private readonly MAX_ATTEMPTS = 2;
  private readonly LOW_CONFIDENCE_THRESHOLD = 0.80;
  private readonly RETRY_CONFIDENCE_THRESHOLD = 0.70;

  constructor(supabaseClient?: SupabaseClient) {
    this.supabase = supabaseClient || createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );
    this.evidenceService = new ComparisonEvidenceService(this.supabase);
  }

  // ===========================================================================
  // MAIN EXTRACTION METHOD
  // ===========================================================================

  /**
   * Extract PolicySnapshot from document
   */
  async extract(
    workspaceId: string,
    documentId: string,
    docRole: 'A' | 'B',
    evidenceCatalog: ComparisonEvidenceCatalog,
    options?: {
      documentTypeHint?: DocumentType;
      lobHint?: LineOfBusiness;
      carrierHint?: string;
      skipRetry?: boolean;
    }
  ): Promise<PolicySnapshot> {
    const jobId = crypto.randomUUID();
    const startTime = Date.now();

    // Determine extraction profile
    const profile = this.selectProfile(options?.documentTypeHint);

    // Build extraction context
    const context: PolicyExtractionContext = {
      jobId,
      workspaceId,
      documentId,
      docRole,
      fileName: await this.getDocumentFileName(documentId),
      pageCount: Object.keys(
        Object.values(evidenceCatalog.entries).reduce((acc, e) => {
          acc[e.pageNumber] = true;
          return acc;
        }, {} as Record<number, boolean>)
      ).length,
      qualityTier: this.getQualityTier(evidenceCatalog.azureConfidenceScore),
      profile,
      evidenceCatalog: this.formatCatalogForPrompt(evidenceCatalog),
      documentTypeHint: options?.documentTypeHint,
      lobHint: options?.lobHint,
      carrierHint: options?.carrierHint,
    };

    // Phase 1: Initial extraction
    let response = await this.callLLMExtraction(context);

    // Validate response
    const validationErrors = this.validateExtractionResponse(response, profile);
    if (validationErrors.length > 0) {
      logger.warn('[Extractor] Validation errors:', validationErrors);
    }

    // Phase 2: Retry for low-confidence fields (if needed)
    const lowConfidenceFields = this.findLowConfidenceFields(response);
    if (lowConfidenceFields.length > 0 && !options?.skipRetry) {
      response = await this.retryLowConfidenceFields(
        context,
        response,
        lowConfidenceFields,
        evidenceCatalog
      );
    }

    // Build PolicySnapshot
    const snapshot = this.buildSnapshot(
      jobId,
      workspaceId,
      documentId,
      docRole,
      response,
      evidenceCatalog,
      profile
    );

    // Calculate processing time
    snapshot.extractedAt = new Date().toISOString();

    // Save to database
    await this.saveSnapshot(snapshot);

    // Record prompt run for debugging
    await this.recordPromptRun({
      jobId,
      promptType: 'extraction',
      systemPromptHash: getPromptMetadata('POLICY_EXTRACTION_SYSTEM', POLICY_EXTRACTION_SYSTEM_PROMPT).hash,
      userPromptHash: getPromptMetadata('POLICY_EXTRACTION_USER', buildPolicyExtractionUserPrompt(context)).hash,
      model: this.MODEL,
      tokensInput: 0, // TODO: Track actual tokens
      tokensOutput: 0,
      latencyMs: Date.now() - startTime,
      status: 'success',
    });

    return snapshot;
  }

  // ===========================================================================
  // LLM INTERACTION
  // ===========================================================================

  /**
   * Call LLM for extraction
   */
  private async callLLMExtraction(
    context: PolicyExtractionContext
  ): Promise<LLMExtractionResponse> {
    const systemPrompt = POLICY_EXTRACTION_SYSTEM_PROMPT;
    const userPrompt = buildPolicyExtractionUserPrompt(context);

    // Call Azure OpenAI
    const response = await this.callAzureOpenAI(systemPrompt, userPrompt);

    // Parse JSON response
    try {
      const parsed = JSON.parse(response);
      return parsed as LLMExtractionResponse;
    } catch (e) {
      // Try to extract JSON from markdown blocks
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]) as LLMExtractionResponse;
      }
      throw new Error(`Failed to parse LLM response as JSON: ${e}`);
    }
  }

  /**
   * Call Azure OpenAI API
   */
  private async callAzureOpenAI(
    systemPrompt: string,
    userPrompt: string
  ): Promise<string> {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';

    if (!endpoint || !apiKey) {
      throw new Error('Azure OpenAI credentials not configured');
    }

    const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-08-01-preview`;

    const body = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: this.MAX_TOKENS,
      temperature: this.TEMPERATURE,
      response_format: { type: 'json_object' },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Azure OpenAI API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  }

  // ===========================================================================
  // RETRY LOGIC
  // ===========================================================================

  /**
   * Find fields with low confidence
   */
  private findLowConfidenceFields(response: LLMExtractionResponse): string[] {
    const lowConfidence: string[] = [];

    for (const [fieldName, field] of Object.entries(response.fields)) {
      if (field.confidence < this.LOW_CONFIDENCE_THRESHOLD && field.status !== 'NOT_FOUND') {
        lowConfidence.push(fieldName);
      }
    }

    return lowConfidence;
  }

  /**
   * Retry extraction for low-confidence fields
   */
  private async retryLowConfidenceFields(
    context: PolicyExtractionContext,
    originalResponse: LLMExtractionResponse,
    lowConfidenceFields: string[],
    evidenceCatalog: ComparisonEvidenceCatalog
  ): Promise<LLMExtractionResponse> {
    // Build targeted retry context
    const targetedEvidence: Record<string, any> = {};

    for (const fieldName of lowConfidenceFields) {
      const evidence = this.evidenceService.getEvidenceForField(evidenceCatalog, fieldName);
      if (evidence.length > 0) {
        targetedEvidence[fieldName] = evidence.map(e => ({
          evidenceId: e.evidenceId,
          value: e.value,
          confidence: e.confidence,
          page: e.pageNumber,
        }));
      }
    }

    // Build retry prompt
    const retryPrompt = this.buildRetryPrompt(
      lowConfidenceFields,
      originalResponse,
      targetedEvidence
    );

    // Call LLM
    const retryResponse = await this.callAzureOpenAI(
      POLICY_EXTRACTION_SYSTEM_PROMPT,
      retryPrompt
    );

    // Parse and merge
    try {
      const parsed = JSON.parse(retryResponse) as LLMExtractionResponse;

      // Merge improved fields
      for (const [fieldName, field] of Object.entries(parsed.fields)) {
        if (field.confidence > originalResponse.fields[fieldName]?.confidence) {
          originalResponse.fields[fieldName] = field;
        }
      }
    } catch (e) {
      logger.warn('[Extractor] Retry parsing failed:', e);
    }

    return originalResponse;
  }

  /**
   * Build retry prompt for specific fields
   */
  private buildRetryPrompt(
    fields: string[],
    originalResponse: LLMExtractionResponse,
    targetedEvidence: Record<string, any>
  ): string {
    const sections: string[] = [];

    sections.push('## TARGETED RETRY EXTRACTION');
    sections.push('');
    sections.push('The following fields had low confidence in the initial extraction.');
    sections.push('Please re-examine the evidence and provide improved values if possible.');
    sections.push('');

    sections.push('## FIELDS TO RETRY');
    for (const fieldName of fields) {
      const original = originalResponse.fields[fieldName];
      const evidence = targetedEvidence[fieldName];

      sections.push(`### ${fieldName}`);
      sections.push(`- Original value: "${original?.raw_value || 'N/A'}"`);
      sections.push(`- Original confidence: ${(original?.confidence || 0) * 100}%`);
      sections.push(`- Original status: ${original?.status || 'UNKNOWN'}`);

      if (evidence) {
        sections.push('- Evidence:');
        for (const e of evidence) {
          sections.push(`  - ${e.evidenceId}: "${e.value}" (${(e.confidence * 100).toFixed(0)}%, page ${e.page})`);
        }
      }
      sections.push('');
    }

    sections.push('## OUTPUT');
    sections.push('Return improved field values in the same JSON format.');

    return sections.join('\n');
  }

  // ===========================================================================
  // SNAPSHOT BUILDING
  // ===========================================================================

  /**
   * Build PolicySnapshot from LLM response
   */
  private buildSnapshot(
    jobId: string,
    workspaceId: string,
    documentId: string,
    docRole: 'A' | 'B',
    response: LLMExtractionResponse,
    evidenceCatalog: ComparisonEvidenceCatalog,
    profile: ExtractionProfile
  ): PolicySnapshot {
    const fields: Record<string, SnapshotField> = {};
    const limits: Record<string, SnapshotField> = {};
    const deductibles: Record<string, SnapshotField> = {};
    const premiums: Record<string, SnapshotField> = {};
    const forms: string[] = [];

    let autoAppliedCount = 0;
    let needsReviewCount = 0;
    let notFoundCount = 0;
    let conflictCount = 0;
    let totalConfidence = 0;

    // Process each field
    for (const [fieldName, fieldData] of Object.entries(response.fields)) {
      const fieldDef = profile.targetFields.find(f => f.fieldName === fieldName);
      const category = fieldDef?.category || 'other';
      const fieldType = fieldDef?.fieldType || 'text';

      // Build SnapshotField
      const snapshotField = this.buildSnapshotField(
        fieldName,
        fieldType,
        category,
        fieldData,
        evidenceCatalog
      );

      fields[fieldName] = snapshotField;

      // Organize by category
      if (category === 'limits') limits[fieldName] = snapshotField;
      if (category === 'deductibles') deductibles[fieldName] = snapshotField;
      if (category === 'premium') premiums[fieldName] = snapshotField;
      if (category === 'forms' && snapshotField.rawValue) {
        forms.push(...snapshotField.rawValue.split(/[,;]/));
      }

      // Update counts
      switch (snapshotField.status) {
        case 'AUTO_APPLIED':
          autoAppliedCount++;
          break;
        case 'NEEDS_REVIEW':
        case 'NEEDS_VERIFICATION':
        case 'LOW_CONFIDENCE':
          needsReviewCount++;
          break;
        case 'NOT_FOUND':
          notFoundCount++;
          break;
        case 'CONFLICT':
          conflictCount++;
          break;
      }

      totalConfidence += snapshotField.confidenceCalibrated;
    }

    // Extract core identifier fields
    const namedInsured = fields['NamedInsured'] || this.createEmptyField('NamedInsured', 'text', 'identifiers');
    const policyNumber = fields['PolicyNumber'] || this.createEmptyField('PolicyNumber', 'identifier', 'identifiers');
    const effectiveDate = fields['EffectiveDate'] || this.createEmptyField('EffectiveDate', 'date', 'dates');
    const expirationDate = fields['ExpirationDate'] || this.createEmptyField('ExpirationDate', 'date', 'dates');

    // Build snapshot
    const snapshot: PolicySnapshot = {
      id: jobId,
      workspaceId,
      workspaceDocumentId: documentId,
      docRole,

      // Document classification
      documentType: this.mapDocumentType(response.document_classification.document_type),
      lineOfBusiness: this.mapLOB(response.document_classification.line_of_business),
      carrier: response.document_classification.carrier,
      carrierNAIC: response.document_classification.carrier_naic,

      // Core identifiers
      namedInsured,
      policyNumber,
      effectiveDate,
      expirationDate,

      // All fields
      fields,

      // Structured sections
      limits,
      deductibles,
      premiums,
      forms: [...new Set(forms.map(f => f.trim()).filter(Boolean))],

      // Counts
      vehicleCount: this.extractCount(fields['VehicleCount']),
      locationCount: this.extractCount(fields['LocationCount']),
      employeeCount: this.extractCount(fields['EmployeeCount']),

      // Quality summary
      extractionConfidence: Object.keys(fields).length > 0
        ? totalConfidence / Object.keys(fields).length
        : 0,
      totalFields: Object.keys(fields).length,
      autoAppliedCount,
      needsReviewCount,
      notFoundCount,
      conflictCount,

      // Status
      status: 'extracted',

      // Versioning
      versions: CURRENT_VERSIONS,
      extractedAt: new Date().toISOString(),
    };

    return snapshot;
  }

  /**
   * Build single SnapshotField
   */
  private buildSnapshotField(
    fieldName: string,
    fieldType: FieldType,
    category: ComparisonCategory,
    data: LLMExtractionResponse['fields'][string],
    evidenceCatalog: ComparisonEvidenceCatalog
  ): SnapshotField {
    // Map LLM status to our FieldStatus
    const status = this.mapFieldStatus(data.status, data.confidence);

    // Normalize value
    const normalizedValue = data.raw_value
      ? normalizeValue(data.raw_value, fieldType)
      : { type: 'not_found' as const };

    // Get display value
    const displayValue = data.raw_value
      ? getDisplayValue(normalizedValue)
      : 'Not found';

    // Validate evidence IDs exist in catalog
    const validEvidenceIds = data.evidence_ids.filter(
      id => evidenceCatalog.entries[id] !== undefined
    );

    return {
      fieldName,
      fieldType,
      category,

      rawValue: data.raw_value,
      normalizedValue,
      displayValue,

      status,
      confidenceRaw: data.confidence,
      confidenceCalibrated: this.calibrateConfidence(data.confidence, validEvidenceIds.length),
      validations: [],

      evidenceIds: validEvidenceIds,
      primaryEvidenceId: data.primary_evidence_id,

      isConflict: status === 'CONFLICT',
      isEndorsementOverride: data.is_endorsement_override || false,
      overriddenValue: data.overridden_value,
    };
  }

  /**
   * Create empty field for required fields that weren't extracted
   */
  private createEmptyField(
    fieldName: string,
    fieldType: FieldType,
    category: ComparisonCategory
  ): SnapshotField {
    return {
      fieldName,
      fieldType,
      category,
      rawValue: null,
      normalizedValue: { type: 'not_found' },
      displayValue: 'Not found',
      status: 'NOT_FOUND',
      confidenceRaw: 0,
      confidenceCalibrated: 0,
      validations: [],
      evidenceIds: [],
      primaryEvidenceId: null,
      isConflict: false,
      isEndorsementOverride: false,
    };
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Select extraction profile based on document type
   */
  private selectProfile(documentType?: DocumentType): ExtractionProfile {
    if (!documentType) return EXTRACTION_PROFILES.DEC_PAGE;

    for (const profile of Object.values(EXTRACTION_PROFILES)) {
      if (profile.documentTypes.includes(documentType)) {
        return profile;
      }
    }

    return EXTRACTION_PROFILES.DEC_PAGE;
  }

  /**
   * Format evidence catalog for prompt
   */
  private formatCatalogForPrompt(
    catalog: ComparisonEvidenceCatalog
  ): Record<string, any> {
    const entries: Record<string, any> = {};

    for (const [id, entry] of Object.entries(catalog.entries)) {
      entries[id] = {
        value: entry.value,
        label: entry.label,
        confidence: entry.confidence,
        pageIndex: entry.pageNumber - 1, // Convert to 0-indexed for prompt
        sourceType: entry.sourceType,
        tags: entry.tags,
      };
    }

    return entries;
  }

  /**
   * Get document file name from database
   */
  private async getDocumentFileName(documentId: string): Promise<string> {
    const { data } = await this.supabase
      .from('workspace_documents')
      .select('file_name')
      .eq('id', documentId)
      .single();

    return data?.file_name || 'unknown';
  }

  /**
   * Get quality tier string
   */
  private getQualityTier(confidence: number): string {
    if (confidence >= 0.85) return 'high';
    if (confidence >= 0.70) return 'medium';
    if (confidence >= 0.50) return 'low';
    return 'very_low';
  }

  /**
   * Map LLM status string to FieldStatus
   */
  private mapFieldStatus(status: string, confidence: number): FieldStatus {
    const normalized = status.toUpperCase().replace(/[^A-Z_]/g, '');

    switch (normalized) {
      case 'AUTO_APPLIED':
      case 'AUTOAPPLIED':
        return 'AUTO_APPLIED';
      case 'NEEDS_REVIEW':
      case 'NEEDSREVIEW':
        return 'NEEDS_REVIEW';
      case 'NEEDS_VERIFICATION':
      case 'NEEDSVERIFICATION':
        return 'NEEDS_VERIFICATION';
      case 'LOW_CONFIDENCE':
      case 'LOWCONFIDENCE':
        return 'LOW_CONFIDENCE';
      case 'NOT_FOUND':
      case 'NOTFOUND':
        return 'NOT_FOUND';
      case 'CONFLICT':
        return 'CONFLICT';
      default:
        // Infer from confidence
        if (confidence >= 0.95) return 'AUTO_APPLIED';
        if (confidence >= 0.80) return 'NEEDS_REVIEW';
        if (confidence >= 0.70) return 'NEEDS_VERIFICATION';
        if (confidence >= 0.50) return 'LOW_CONFIDENCE';
        return 'NOT_FOUND';
    }
  }

  /**
   * Calibrate confidence based on evidence support
   */
  private calibrateConfidence(rawConfidence: number, evidenceCount: number): number {
    // Boost confidence if multiple evidence sources agree
    const evidenceBoost = Math.min(0.1, evidenceCount * 0.02);

    // Penalize if no evidence
    const evidencePenalty = evidenceCount === 0 ? 0.2 : 0;

    return Math.min(1.0, Math.max(0, rawConfidence + evidenceBoost - evidencePenalty));
  }

  /**
   * Map document type string to enum
   */
  private mapDocumentType(type: string): DocumentType {
    const normalized = type.toLowerCase().replace(/[^a-z]/g, '');
    const mapping: Record<string, DocumentType> = {
      decpage: 'dec_page',
      declarationspage: 'dec_page',
      declarations: 'dec_page',
      quote: 'quote',
      proposal: 'quote',
      policy: 'policy',
      endorsement: 'endorsement',
      lossrun: 'loss_run',
      losshistory: 'loss_run',
      certificate: 'certificate',
      coi: 'certificate',
      application: 'application',
      app: 'application',
      binder: 'binder',
      invoice: 'invoice',
    };
    return mapping[normalized] || 'unknown';
  }

  /**
   * Map LOB string to enum
   */
  private mapLOB(lob: string): LineOfBusiness {
    const normalized = lob.toUpperCase().replace(/[^A-Z]/g, '');
    const mapping: Record<string, LineOfBusiness> = {
      GL: 'GL',
      GENERALLIABILITY: 'GL',
      CGL: 'GL',
      AUTO: 'AUTO',
      COMMERCIALAUTO: 'AUTO',
      BUSINESSAUTO: 'AUTO',
      WC: 'WC',
      WORKERSCOMP: 'WC',
      WORKERSCOMPENSATION: 'WC',
      PROP: 'PROP',
      PROPERTY: 'PROP',
      UMBRELLA: 'UMBRELLA',
      EXCESS: 'UMBRELLA',
      BOP: 'BOP',
      BUSINESSOWNERS: 'BOP',
      EPLI: 'EPLI',
      EMPLOYMENTPRACTICES: 'EPLI',
      CYBER: 'CYBER',
      CYBERLIABILITY: 'CYBER',
      PROF: 'PROF',
      PROFESSIONALLIABILITY: 'PROF',
      EO: 'PROF',
    };
    return mapping[normalized] || 'UNKNOWN';
  }

  /**
   * Extract count value from field
   */
  private extractCount(field?: SnapshotField): number | null {
    if (!field || field.status === 'NOT_FOUND') return null;
    if (field.normalizedValue.type === 'count') {
      return field.normalizedValue.value;
    }
    const parsed = parseInt(field.rawValue || '', 10);
    return isNaN(parsed) ? null : parsed;
  }

  /**
   * Validate extraction response
   */
  private validateExtractionResponse(
    response: LLMExtractionResponse,
    profile: ExtractionProfile
  ): string[] {
    const errors: string[] = [];

    // Check required fields
    for (const fieldDef of profile.targetFields.filter(f => f.required)) {
      const field = response.fields[fieldDef.fieldName];
      if (!field || field.status === 'NOT_FOUND') {
        errors.push(`Required field ${fieldDef.fieldName} not found`);
      }
    }

    // Check document classification
    if (!response.document_classification) {
      errors.push('Missing document_classification');
    }

    // Check evidence IDs are present for non-NOT_FOUND fields
    for (const [fieldName, field] of Object.entries(response.fields)) {
      if (field.status !== 'NOT_FOUND' && field.evidence_ids.length === 0) {
        errors.push(`Field ${fieldName} has no evidence IDs`);
      }
    }

    return errors;
  }

  // ===========================================================================
  // DATABASE OPERATIONS
  // ===========================================================================

  /**
   * Save snapshot to database
   */
  private async saveSnapshot(snapshot: PolicySnapshot): Promise<void> {
    const row = {
      id: snapshot.id,
      workspace_id: snapshot.workspaceId,
      workspace_document_id: snapshot.workspaceDocumentId,
      doc_role: snapshot.docRole,
      document_type: snapshot.documentType,
      line_of_business: snapshot.lineOfBusiness,
      carrier: snapshot.carrier,
      carrier_naic: snapshot.carrierNAIC,
      field_results: snapshot.fields,
      limits: snapshot.limits,
      deductibles: snapshot.deductibles,
      premiums: snapshot.premiums,
      forms: snapshot.forms,
      vehicle_count: snapshot.vehicleCount,
      location_count: snapshot.locationCount,
      employee_count: snapshot.employeeCount,
      extraction_confidence: snapshot.extractionConfidence,
      total_fields: snapshot.totalFields,
      auto_applied_count: snapshot.autoAppliedCount,
      needs_review_count: snapshot.needsReviewCount,
      not_found_count: snapshot.notFoundCount,
      conflict_count: snapshot.conflictCount,
      status: snapshot.status,
      versions: snapshot.versions,
      extracted_at: snapshot.extractedAt,
    };

    const { error } = await this.supabase
      .from('policy_snapshots')
      .upsert(row, { onConflict: 'id' });

    if (error) {
      throw new Error(`Failed to save snapshot: ${error.message}`);
    }
  }

  /**
   * Load snapshot from database
   */
  async loadSnapshot(snapshotId: string): Promise<PolicySnapshot | null> {
    const { data, error } = await this.supabase
      .from('policy_snapshots')
      .select('*')
      .eq('id', snapshotId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to load snapshot: ${error.message}`);
    }

    return this.rowToSnapshot(data);
  }

  /**
   * Load snapshots for workspace
   */
  async loadSnapshotsForWorkspace(workspaceId: string): Promise<{
    snapshotA: PolicySnapshot | null;
    snapshotB: PolicySnapshot | null;
  }> {
    const { data, error } = await this.supabase
      .from('policy_snapshots')
      .select('*')
      .eq('workspace_id', workspaceId);

    if (error) {
      throw new Error(`Failed to load snapshots: ${error.message}`);
    }

    let snapshotA: PolicySnapshot | null = null;
    let snapshotB: PolicySnapshot | null = null;

    for (const row of data || []) {
      const snapshot = this.rowToSnapshot(row);
      if (row.doc_role === 'A') snapshotA = snapshot;
      if (row.doc_role === 'B') snapshotB = snapshot;
    }

    return { snapshotA, snapshotB };
  }

  /**
   * Convert database row to PolicySnapshot
   */
  private rowToSnapshot(row: any): PolicySnapshot {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      workspaceDocumentId: row.workspace_document_id,
      docRole: row.doc_role,
      documentType: row.document_type,
      lineOfBusiness: row.line_of_business,
      carrier: row.carrier,
      carrierNAIC: row.carrier_naic,
      namedInsured: row.field_results?.NamedInsured || this.createEmptyField('NamedInsured', 'text', 'identifiers'),
      policyNumber: row.field_results?.PolicyNumber || this.createEmptyField('PolicyNumber', 'identifier', 'identifiers'),
      effectiveDate: row.field_results?.EffectiveDate || this.createEmptyField('EffectiveDate', 'date', 'dates'),
      expirationDate: row.field_results?.ExpirationDate || this.createEmptyField('ExpirationDate', 'date', 'dates'),
      fields: row.field_results || {},
      limits: row.limits || {},
      deductibles: row.deductibles || {},
      premiums: row.premiums || {},
      forms: row.forms || [],
      vehicleCount: row.vehicle_count,
      locationCount: row.location_count,
      employeeCount: row.employee_count,
      extractionConfidence: row.extraction_confidence,
      totalFields: row.total_fields,
      autoAppliedCount: row.auto_applied_count,
      needsReviewCount: row.needs_review_count,
      notFoundCount: row.not_found_count,
      conflictCount: row.conflict_count,
      status: row.status,
      versions: row.versions || CURRENT_VERSIONS,
      extractedAt: row.extracted_at,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
    };
  }

  /**
   * Record prompt run for debugging
   */
  private async recordPromptRun(run: PromptRun): Promise<void> {
    // Skip if comparison_prompt_runs table doesn't exist yet
    try {
      await this.supabase
        .from('comparison_prompt_runs')
        .insert({
          workspace_id: null, // Set if available
          policy_snapshot_id: run.jobId,
          prompt_type: run.promptType,
          prompt_version: COMPARISON_PROMPT_VERSIONS.POLICY_EXTRACTION_SYSTEM,
          system_prompt_hash: run.systemPromptHash,
          model_used: run.model,
          tokens_input: run.tokensInput,
          tokens_output: run.tokensOutput,
          latency_ms: run.latencyMs,
          status: run.status,
          error_message: run.errorMessage,
        });
    } catch (e) {
      // Ignore if table doesn't exist
      logger.warn('[Extractor] Failed to record prompt run:', e);
    }
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const policySnapshotExtractor = new PolicySnapshotExtractor();
