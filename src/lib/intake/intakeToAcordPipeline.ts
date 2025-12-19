// ============================================
// Intake to ACORD Pipeline
// End-to-end processing from intake submission to ACORD forms
// ============================================

import { supabase } from '@/integrations/supabase/client';
import { processMultiFormMapping, MappingResult } from '@/lib/mapping/mappingProcessor';
import { fillPdfForm, FillPdfResult } from '@/lib/acord/pdfFiller';
import { validateForm, ValidationResult } from '@/lib/validation/validationEngine';
import type { IntakeSubmission, IntakeAcordMapping } from '@/types/intake';
import type { AcordTemplate, AcordForm, FieldDefinition, ValidationRule, CarrierOverride } from '@/types/acord';

// ============================================
// TYPES
// ============================================

export interface PipelineOptions {
  generatePdfs?: boolean;
  flattenPdfs?: boolean;
  validateForCarrier?: string;
  skipValidation?: boolean;
  includeAddendums?: boolean;
  autoSaveToDb?: boolean;
}

export interface PipelineResult {
  success: boolean;
  submissionId: string;
  forms: FormResult[];
  totalErrors: number;
  totalWarnings: number;
  processingTimeMs: number;
}

export interface FormResult {
  formNumber: string;
  templateId: string;
  acordFormId?: string;
  fieldValues: Record<string, any>;
  mappingResult: MappingResult['forms'][string];
  validationResult?: ValidationResult;
  pdfResult?: FillPdfResult;
  errors: string[];
  warnings: string[];
}

export interface PipelineContext {
  submission: IntakeSubmission;
  mappings: IntakeAcordMapping[];
  templates: Map<string, AcordTemplate>;
  carrierOverrides?: CarrierOverride[];
  options: PipelineOptions;
}

// ============================================
// MAIN PIPELINE
// ============================================

/**
 * Process an intake submission through the full ACORD pipeline
 */
export async function processIntakeToAcord(
  submissionId: string,
  options: PipelineOptions = {}
): Promise<PipelineResult> {
  const startTime = Date.now();
  const forms: FormResult[] = [];
  let totalErrors = 0;
  let totalWarnings = 0;

  try {
    // Step 1: Load submission data
    const submission = await loadSubmission(submissionId);
    if (!submission) {
      return {
        success: false,
        submissionId,
        forms: [],
        totalErrors: 1,
        totalWarnings: 0,
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Step 2: Load mappings for template
    const mappings = await loadMappings(submission.template_id);
    if (mappings.length === 0) {
      return {
        success: false,
        submissionId,
        forms: [],
        totalErrors: 1,
        totalWarnings: 0,
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Step 3: Get unique form numbers and load templates
    const formNumbers = [...new Set(mappings.map(m => m.acord_form_number))];
    const templates = await loadTemplates(formNumbers);

    // Step 4: Load carrier overrides if specified
    const carrierOverrides = options.validateForCarrier
      ? await loadCarrierOverrides(options.validateForCarrier, formNumbers)
      : undefined;

    // Create pipeline context
    const context: PipelineContext = {
      submission,
      mappings,
      templates,
      carrierOverrides,
      options,
    };

    // Step 5: Process mappings
    const mappingResult = processMultiFormMapping(
      submission.responses,
      mappings,
      formNumbers,
      {
        submissionId: submission.id,
        accountId: submission.account_id,
      }
    );

    // Step 6: Process each form
    for (const formNumber of formNumbers) {
      const formResult = await processForm(formNumber, context, mappingResult);
      forms.push(formResult);
      totalErrors += formResult.errors.length;
      totalWarnings += formResult.warnings.length;
    }

    // Step 7: Update submission status if saving to DB
    if (options.autoSaveToDb) {
      await updateSubmissionStatus(submissionId, forms);
    }

    return {
      success: totalErrors === 0,
      submissionId,
      forms,
      totalErrors,
      totalWarnings,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error('Pipeline error:', error);
    return {
      success: false,
      submissionId,
      forms,
      totalErrors: totalErrors + 1,
      totalWarnings,
      processingTimeMs: Date.now() - startTime,
    };
  }
}

// ============================================
// PIPELINE STEPS
// ============================================

async function loadSubmission(submissionId: string): Promise<IntakeSubmission | null> {
  const { data, error } = await supabase
    .from('intake_submissions')
    .select(`
      *,
      intake_templates (
        id,
        name,
        questions
      )
    `)
    .eq('id', submissionId)
    .single();

  if (error) {
    console.error('Failed to load submission:', error);
    return null;
  }

  return data as IntakeSubmission;
}

async function loadMappings(templateId: string): Promise<IntakeAcordMapping[]> {
  const { data, error } = await supabase
    .from('intake_acord_mappings')
    .select('*')
    .eq('intake_template_id', templateId);

  if (error) {
    console.error('Failed to load mappings:', error);
    return [];
  }

  return data || [];
}

async function loadTemplates(formNumbers: string[]): Promise<Map<string, AcordTemplate>> {
  const templates = new Map<string, AcordTemplate>();

  const { data, error } = await supabase
    .from('acord_templates')
    .select('*')
    .in('form_number', formNumbers)
    .eq('is_current', true);

  if (error) {
    console.error('Failed to load templates:', error);
    return templates;
  }

  data?.forEach(template => {
    templates.set(template.form_number, template as AcordTemplate);
  });

  return templates;
}

async function loadCarrierOverrides(
  carrierId: string,
  formNumbers: string[]
): Promise<CarrierOverride[]> {
  const { data, error } = await supabase
    .from('carrier_form_overrides')
    .select('*')
    .eq('carrier_id', carrierId)
    .in('form_number', formNumbers);

  if (error) {
    console.error('Failed to load carrier overrides:', error);
    return [];
  }

  return data || [];
}

async function processForm(
  formNumber: string,
  context: PipelineContext,
  mappingResult: MappingResult
): Promise<FormResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const template = context.templates.get(formNumber);
  const formMappingResult = mappingResult.forms[formNumber];

  if (!template) {
    errors.push(`Template not found for ACORD ${formNumber}`);
    return {
      formNumber,
      templateId: '',
      fieldValues: {},
      mappingResult: formMappingResult || { fieldValues: {}, errors: [], warnings: [] },
      errors,
      warnings,
    };
  }

  // Collect mapping errors
  if (formMappingResult) {
    formMappingResult.errors.forEach(e => errors.push(e.message));
    warnings.push(...formMappingResult.warnings);
  }

  const fieldValues = formMappingResult?.fieldValues || {};
  let validationResult: ValidationResult | undefined;
  let pdfResult: FillPdfResult | undefined;
  let acordFormId: string | undefined;

  // Validate if not skipped
  if (!context.options.skipValidation && template.field_definitions) {
    const carrierOverride = context.carrierOverrides?.find(
      o => o.form_number === formNumber
    );

    validationResult = validateForm({
      templateId: template.id,
      formNumber,
      fieldDefinitions: template.field_definitions as FieldDefinition[],
      validationRules: (template.validation_rules || []) as ValidationRule[],
      fieldValues,
      carrierOverrides: carrierOverride ? [carrierOverride] : undefined,
    });

    validationResult.errors.forEach(e => errors.push(`${e.field}: ${e.message}`));
    validationResult.warnings.forEach(w => warnings.push(`${w.field}: ${w.message}`));
  }

  // Generate PDF if requested
  if (context.options.generatePdfs && template.pdf_url) {
    try {
      pdfResult = await fillPdfForm({
        pdfUrl: template.pdf_url,
        fieldValues,
        fieldDefinitions: (template.field_definitions || []) as FieldDefinition[],
        options: {
          flatten: context.options.flattenPdfs,
          generateAddendum: context.options.includeAddendums,
          formNumber,
          formTitle: template.form_name,
        },
      });

      if (pdfResult.errors.length > 0) {
        pdfResult.errors.forEach(e => errors.push(`PDF: ${e}`));
      }
    } catch (error) {
      errors.push(`PDF generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Save to database if auto-save enabled
  if (context.options.autoSaveToDb) {
    acordFormId = await saveAcordForm(context, formNumber, template, fieldValues, validationResult);
  }

  return {
    formNumber,
    templateId: template.id,
    acordFormId,
    fieldValues,
    mappingResult: formMappingResult || { fieldValues: {}, errors: [], warnings: [] },
    validationResult,
    pdfResult,
    errors,
    warnings,
  };
}

async function saveAcordForm(
  context: PipelineContext,
  formNumber: string,
  template: AcordTemplate,
  fieldValues: Record<string, any>,
  validationResult?: ValidationResult
): Promise<string | undefined> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('acord_forms')
      .insert({
        account_id: context.submission.account_id,
        template_id: template.id,
        intake_submission_id: context.submission.id,
        field_values: fieldValues,
        submission_status: 'draft',
        signature_status: 'unsigned',
        validation_status: validationResult?.valid ? 'valid' : 'invalid',
        completion_percentage: validationResult?.completionPercentage || 0,
        created_by: user?.id,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to save ACORD form:', error);
      return undefined;
    }

    return data.id;
  } catch (error) {
    console.error('Error saving ACORD form:', error);
    return undefined;
  }
}

async function updateSubmissionStatus(
  submissionId: string,
  forms: FormResult[]
): Promise<void> {
  const hasErrors = forms.some(f => f.errors.length > 0);
  const allFormsGenerated = forms.every(f => f.acordFormId);

  await supabase
    .from('intake_submissions')
    .update({
      status: hasErrors ? 'submitted' : 'processed',
      processed_at: new Date().toISOString(),
    })
    .eq('id', submissionId);
}

// ============================================
// BATCH PROCESSING
// ============================================

export interface BatchPipelineOptions extends PipelineOptions {
  concurrency?: number;
  onProgress?: (completed: number, total: number) => void;
}

export interface BatchPipelineResult {
  totalSubmissions: number;
  successful: number;
  failed: number;
  results: PipelineResult[];
  processingTimeMs: number;
}

/**
 * Process multiple intake submissions in batch
 */
export async function processBatchIntakeToAcord(
  submissionIds: string[],
  options: BatchPipelineOptions = {}
): Promise<BatchPipelineResult> {
  const startTime = Date.now();
  const results: PipelineResult[] = [];
  const concurrency = options.concurrency || 3;
  let completed = 0;

  // Process in chunks for controlled concurrency
  for (let i = 0; i < submissionIds.length; i += concurrency) {
    const chunk = submissionIds.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(id => processIntakeToAcord(id, options))
    );

    results.push(...chunkResults);
    completed += chunk.length;

    if (options.onProgress) {
      options.onProgress(completed, submissionIds.length);
    }
  }

  const successful = results.filter(r => r.success).length;

  return {
    totalSubmissions: submissionIds.length,
    successful,
    failed: submissionIds.length - successful,
    results,
    processingTimeMs: Date.now() - startTime,
  };
}

// ============================================
// PREVIEW / DRY RUN
// ============================================

/**
 * Preview the pipeline result without saving to database
 */
export async function previewIntakeToAcord(
  submissionId: string,
  options: Omit<PipelineOptions, 'autoSaveToDb'> = {}
): Promise<PipelineResult> {
  return processIntakeToAcord(submissionId, {
    ...options,
    autoSaveToDb: false,
  });
}

/**
 * Preview mapping results for specific responses (without submission)
 */
export async function previewMappingResults(
  templateId: string,
  responses: Record<string, any>
): Promise<MappingResult | null> {
  const mappings = await loadMappings(templateId);
  if (mappings.length === 0) return null;

  const formNumbers = [...new Set(mappings.map(m => m.acord_form_number))];

  return processMultiFormMapping(responses, mappings, formNumbers);
}

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Validate a submission without processing
 */
export async function validateSubmission(
  submissionId: string,
  carrierId?: string
): Promise<{
  isValid: boolean;
  validationResults: Map<string, ValidationResult>;
  totalErrors: number;
  totalWarnings: number;
}> {
  const validationResults = new Map<string, ValidationResult>();
  let totalErrors = 0;
  let totalWarnings = 0;

  const result = await processIntakeToAcord(submissionId, {
    generatePdfs: false,
    validateForCarrier: carrierId,
    autoSaveToDb: false,
  });

  result.forms.forEach(form => {
    if (form.validationResult) {
      validationResults.set(form.formNumber, form.validationResult);
      totalErrors += form.validationResult.errors.length;
      totalWarnings += form.validationResult.warnings.length;
    }
  });

  return {
    isValid: totalErrors === 0,
    validationResults,
    totalErrors,
    totalWarnings,
  };
}

// ============================================
// REGENERATION
// ============================================

/**
 * Regenerate ACORD forms from an existing submission
 */
export async function regenerateAcordForms(
  submissionId: string,
  options: PipelineOptions = {}
): Promise<PipelineResult> {
  // Delete existing forms for this submission
  await supabase
    .from('acord_forms')
    .delete()
    .eq('intake_submission_id', submissionId);

  // Process again
  return processIntakeToAcord(submissionId, {
    ...options,
    autoSaveToDb: true,
  });
}

// ============================================
// EXPORTS
// ============================================

export {
  loadSubmission,
  loadMappings,
  loadTemplates,
  loadCarrierOverrides,
};
