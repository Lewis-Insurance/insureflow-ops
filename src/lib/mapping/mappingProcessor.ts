// ============================================
// Mapping Processor
// Transforms intake responses to ACORD field values
// ============================================

import type { IntakeAcordMapping, TransformType, TransformConfig } from '@/types/intake';
import { applyTransform } from './transformEngine';

// ============================================
// TYPES
// ============================================

export interface MappingContext {
  intakeResponses: Record<string, any>;
  mappings: IntakeAcordMapping[];
  formNumber: string;
  metadata?: {
    submissionId?: string;
    accountId?: string;
    effectiveDate?: string;
    producerInfo?: Record<string, any>;
  };
}

export interface MappingResult {
  fieldValues: Record<string, any>;
  unmappedQuestions: string[];
  errors: MappingError[];
  warnings: string[];
}

export interface MappingError {
  questionId: string;
  fieldName: string;
  message: string;
  transformType?: TransformType;
}

export interface BatchMappingResult {
  forms: Record<string, MappingResult>; // keyed by form number
  totalFieldsMapped: number;
  totalErrors: number;
}

// ============================================
// MAIN MAPPING FUNCTION
// ============================================

/**
 * Process intake responses and map to ACORD field values
 */
export function processIntakeMapping(context: MappingContext): MappingResult {
  const { intakeResponses, mappings, formNumber } = context;

  const fieldValues: Record<string, any> = {};
  const unmappedQuestions: string[] = [];
  const errors: MappingError[] = [];
  const warnings: string[] = [];

  // Track which questions have mappings
  const mappedQuestionIds = new Set(mappings.map(m => m.intake_question_id));

  // Find questions that don't have mappings
  for (const questionId of Object.keys(intakeResponses)) {
    if (!mappedQuestionIds.has(questionId)) {
      unmappedQuestions.push(questionId);
    }
  }

  // Filter mappings for this form
  const formMappings = mappings.filter(m => m.acord_form_number === formNumber);

  // Process each mapping
  for (const mapping of formMappings) {
    try {
      const result = processSingleMapping(mapping, intakeResponses, context.metadata);

      if (result.success) {
        fieldValues[mapping.acord_field_name] = result.value;
      } else if (result.error) {
        errors.push({
          questionId: mapping.intake_question_id,
          fieldName: mapping.acord_field_name,
          message: result.error,
          transformType: mapping.transform_type,
        });
      }

      if (result.warning) {
        warnings.push(result.warning);
      }
    } catch (error) {
      errors.push({
        questionId: mapping.intake_question_id,
        fieldName: mapping.acord_field_name,
        message: error instanceof Error ? error.message : 'Unknown error',
        transformType: mapping.transform_type,
      });
    }
  }

  return {
    fieldValues,
    unmappedQuestions,
    errors,
    warnings,
  };
}

/**
 * Process mappings for multiple ACORD forms
 */
export function processMultiFormMapping(
  intakeResponses: Record<string, any>,
  mappings: IntakeAcordMapping[],
  formNumbers: string[],
  metadata?: MappingContext['metadata']
): BatchMappingResult {
  const forms: Record<string, MappingResult> = {};
  let totalFieldsMapped = 0;
  let totalErrors = 0;

  for (const formNumber of formNumbers) {
    const result = processIntakeMapping({
      intakeResponses,
      mappings,
      formNumber,
      metadata,
    });

    forms[formNumber] = result;
    totalFieldsMapped += Object.keys(result.fieldValues).length;
    totalErrors += result.errors.length;
  }

  return {
    forms,
    totalFieldsMapped,
    totalErrors,
  };
}

// ============================================
// SINGLE MAPPING PROCESSOR
// ============================================

interface SingleMappingResult {
  success: boolean;
  value?: any;
  error?: string;
  warning?: string;
}

function processSingleMapping(
  mapping: IntakeAcordMapping,
  responses: Record<string, any>,
  metadata?: MappingContext['metadata']
): SingleMappingResult {
  const { intake_question_id, transform_type, transform_config, is_repeater_field } = mapping;

  // Get source value
  let sourceValue = responses[intake_question_id];

  // Handle repeater fields
  if (is_repeater_field && mapping.repeater_config_id) {
    sourceValue = extractRepeaterValue(responses, intake_question_id, mapping.repeater_config_id);
  }

  // Handle null/undefined
  if (sourceValue === null || sourceValue === undefined) {
    // Check if there's a default value in config
    if (transform_config?.defaultValue !== undefined) {
      return { success: true, value: transform_config.defaultValue };
    }

    // Check onError behavior
    if (transform_config?.onError === 'skip') {
      return { success: false };
    }

    return { success: false };
  }

  // Apply transformation
  try {
    const transformedValue = applyTransform(
      sourceValue,
      transform_type,
      transform_config,
      responses,
      metadata
    );

    return { success: true, value: transformedValue };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Transform failed';

    // Handle based on onError config
    switch (transform_config?.onError) {
      case 'skip':
        return { success: false, warning: `Skipped ${mapping.acord_field_name}: ${errorMessage}` };
      case 'default':
        return {
          success: true,
          value: transform_config.defaultValue ?? '',
          warning: `Used default for ${mapping.acord_field_name}: ${errorMessage}`,
        };
      case 'fail':
      default:
        return { success: false, error: errorMessage };
    }
  }
}

// ============================================
// REPEATER HANDLING
// ============================================

function extractRepeaterValue(
  responses: Record<string, any>,
  questionId: string,
  repeaterConfigId: string
): any {
  // Parse repeater config ID to get array path and index
  // Format: "arrayPath.fieldName.index" or "arrayPath[index].fieldName"
  const match = repeaterConfigId.match(/^(.+?)\.(\d+)\.(.+)$/) ||
                repeaterConfigId.match(/^(.+?)\[(\d+)\]\.(.+)$/);

  if (!match) {
    // Try simple array access
    const arrayValue = responses[questionId];
    if (Array.isArray(arrayValue)) {
      return arrayValue;
    }
    return responses[questionId];
  }

  const [, arrayPath, indexStr, fieldPath] = match;
  const index = parseInt(indexStr, 10);

  // Get array from responses
  const array = getNestedValue(responses, arrayPath);
  if (!Array.isArray(array) || index >= array.length) {
    return undefined;
  }

  // Get field from array item
  return getNestedValue(array[index], fieldPath);
}

// ============================================
// MAPPING CREATION HELPERS
// ============================================

/**
 * Create a simple direct mapping
 */
export function createDirectMapping(
  intakeQuestionId: string,
  acordFormNumber: string,
  acordFieldName: string,
  options: Partial<IntakeAcordMapping> = {}
): Omit<IntakeAcordMapping, 'id' | 'intake_template_id' | 'created_at'> {
  return {
    intake_question_id: intakeQuestionId,
    acord_form_number: acordFormNumber,
    acord_field_name: acordFieldName,
    transform_type: 'direct',
    transform_config: { onError: 'skip' },
    is_repeater_field: false,
    ...options,
  };
}

/**
 * Create a format transformation mapping
 */
export function createFormatMapping(
  intakeQuestionId: string,
  acordFormNumber: string,
  acordFieldName: string,
  formatOptions: {
    dateFormat?: string;
    phoneFormat?: string;
    uppercase?: boolean;
    lowercase?: boolean;
  }
): Omit<IntakeAcordMapping, 'id' | 'intake_template_id' | 'created_at'> {
  return {
    intake_question_id: intakeQuestionId,
    acord_form_number: acordFormNumber,
    acord_field_name: acordFieldName,
    transform_type: 'format',
    transform_config: {
      ...formatOptions,
      onError: 'skip',
    },
    is_repeater_field: false,
  };
}

/**
 * Create a concatenation mapping
 */
export function createConcatMapping(
  sourceQuestionIds: string[],
  acordFormNumber: string,
  acordFieldName: string,
  separator: string = ' '
): Omit<IntakeAcordMapping, 'id' | 'intake_template_id' | 'created_at'> {
  return {
    intake_question_id: sourceQuestionIds[0], // Primary question
    acord_form_number: acordFormNumber,
    acord_field_name: acordFieldName,
    transform_type: 'concatenate',
    transform_config: {
      sourceFields: sourceQuestionIds,
      separator,
      onError: 'skip',
    },
    is_repeater_field: false,
  };
}

/**
 * Create a boolean mapping
 */
export function createBooleanMapping(
  intakeQuestionId: string,
  acordFormNumber: string,
  acordFieldName: string,
  trueValue: string = 'X',
  falseValue: string = ''
): Omit<IntakeAcordMapping, 'id' | 'intake_template_id' | 'created_at'> {
  return {
    intake_question_id: intakeQuestionId,
    acord_form_number: acordFormNumber,
    acord_field_name: acordFieldName,
    transform_type: 'boolean',
    transform_config: {
      trueValue,
      falseValue,
      onError: 'default',
      defaultValue: falseValue,
    },
    is_repeater_field: false,
  };
}

/**
 * Create a repeater field mapping
 */
export function createRepeaterMapping(
  intakeQuestionId: string,
  acordFormNumber: string,
  acordFieldName: string,
  repeaterConfigId: string,
  options: Partial<IntakeAcordMapping> = {}
): Omit<IntakeAcordMapping, 'id' | 'intake_template_id' | 'created_at'> {
  return {
    intake_question_id: intakeQuestionId,
    acord_form_number: acordFormNumber,
    acord_field_name: acordFieldName,
    transform_type: options.transform_type || 'direct',
    transform_config: options.transform_config || { onError: 'skip' },
    is_repeater_field: true,
    repeater_config_id: repeaterConfigId,
    ...options,
  };
}

// ============================================
// VALIDATION
// ============================================

/**
 * Validate a mapping configuration
 */
export function validateMapping(
  mapping: Omit<IntakeAcordMapping, 'id' | 'intake_template_id' | 'created_at'>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!mapping.intake_question_id) {
    errors.push('Intake question ID is required');
  }

  if (!mapping.acord_form_number) {
    errors.push('ACORD form number is required');
  }

  if (!mapping.acord_field_name) {
    errors.push('ACORD field name is required');
  }

  if (!mapping.transform_type) {
    errors.push('Transform type is required');
  }

  // Validate transform-specific requirements
  if (mapping.transform_type === 'concatenate') {
    if (!mapping.transform_config?.sourceFields?.length) {
      errors.push('Concatenate transform requires source fields');
    }
  }

  if (mapping.transform_type === 'lookup') {
    if (!mapping.transform_config?.lookupTable) {
      errors.push('Lookup transform requires a lookup table');
    }
  }

  if (mapping.is_repeater_field && !mapping.repeater_config_id) {
    errors.push('Repeater field requires a repeater config ID');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

/**
 * Generate mapping suggestions based on field names
 */
export function suggestMappings(
  intakeQuestionId: string,
  intakeQuestionLabel: string,
  acordFields: Array<{ name: string; label: string }>
): Array<{ fieldName: string; confidence: number }> {
  const suggestions: Array<{ fieldName: string; confidence: number }> = [];
  const normalizedLabel = intakeQuestionLabel.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const field of acordFields) {
    const normalizedFieldLabel = field.label.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedFieldName = field.name.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Exact match
    if (normalizedLabel === normalizedFieldLabel || normalizedLabel === normalizedFieldName) {
      suggestions.push({ fieldName: field.name, confidence: 1.0 });
      continue;
    }

    // Contains match
    if (normalizedFieldLabel.includes(normalizedLabel) || normalizedLabel.includes(normalizedFieldLabel)) {
      suggestions.push({ fieldName: field.name, confidence: 0.7 });
      continue;
    }

    // Word overlap
    const labelWords = normalizedLabel.split(/(?=[A-Z])|_/).filter(Boolean);
    const fieldWords = normalizedFieldLabel.split(/(?=[A-Z])|_/).filter(Boolean);
    const overlap = labelWords.filter(w => fieldWords.some(fw => fw.includes(w) || w.includes(fw)));

    if (overlap.length > 0) {
      const confidence = overlap.length / Math.max(labelWords.length, fieldWords.length);
      if (confidence >= 0.3) {
        suggestions.push({ fieldName: field.name, confidence });
      }
    }
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}
