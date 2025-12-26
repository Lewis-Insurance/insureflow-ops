// ============================================
// Mapping Processor
// Transforms intake responses to ACORD field values
// ============================================

import type { TransformConfig } from '@/types/acord';

// Re-export types that tests expect
export type { IntakeAcordMapping as TestIntakeAcordMapping } from '@/types/intake';

// ============================================
// TEST-COMPATIBLE EXPORTS
// These functions match the test file signatures
// ============================================

/**
 * Resolve a dot-notation or bracket-notation path from an object
 * Examples: 'business.name', 'vehicles[0].make', 'address.city'
 */
export function resolveFieldPath(data: Record<string, any>, path: string): any {
  if (!data || !path) return undefined;

  // Handle array notation: vehicles[0].make -> vehicles.0.make
  const normalizedPath = path.replace(/\[(\d+)\]/g, '.$1');
  const parts = normalizedPath.split('.');

  let current: any = data;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    // Handle array index
    if (/^\d+$/.test(part)) {
      const index = parseInt(part, 10);
      if (!Array.isArray(current) || index >= current.length) {
        return undefined;
      }
      current = current[index];
    } else {
      current = current[part];
    }
  }

  return current;
}

/**
 * Apply a transformation to a value based on transform type and config
 */
export function applyTransform(
  value: any,
  transformType: string,
  config: TransformConfig
): any {
  // Handle null/undefined
  if (value === null || value === undefined) {
    if (config.onError === 'default' && config.defaultValue !== undefined) {
      return config.defaultValue;
    }
    return '';
  }

  try {
    switch (transformType) {
      case 'direct':
        return value;

      case 'format':
        return applyFormatTransformUtil(value, config);

      case 'concatenate':
        return applyConcatenateTransformUtil(value, config);

      case 'boolean':
        return applyBooleanTransformUtil(value, config);

      case 'date_format':
        return formatDateUtil(String(value), config.dateFormat || 'MM/DD/YYYY');

      case 'phone_format':
        return formatPhoneUtil(String(value), config.phoneFormat || '(###) ###-####');

      case 'uppercase':
        return String(value).toUpperCase();

      case 'lowercase':
        return String(value).toLowerCase();

      default:
        return String(value);
    }
  } catch (error) {
    if (config.onError === 'default' && config.defaultValue !== undefined) {
      return config.defaultValue;
    }
    if (config.onError === 'skip') {
      return '';
    }
    throw error;
  }
}

function applyFormatTransformUtil(value: any, config: TransformConfig): string {
  let result = String(value);

  if (config.dateFormat && isDateValueUtil(result)) {
    result = formatDateUtil(result, config.dateFormat);
  }

  if (config.phoneFormat && isPhoneValueUtil(result)) {
    result = formatPhoneUtil(result, config.phoneFormat);
  }

  if (config.uppercase) {
    result = result.toUpperCase();
  }

  if (config.lowercase) {
    result = result.toLowerCase();
  }

  if (config.trim !== false) {
    result = result.trim();
  }

  if (config.maxLength && result.length > config.maxLength) {
    result = result.substring(0, config.maxLength);
  }

  return result;
}

function applyConcatenateTransformUtil(value: any, config: TransformConfig): string {
  const sourceFields = config.sourceFields || [];
  const separator = config.separator ?? ' ';

  if (typeof value === 'object' && value !== null) {
    const parts = sourceFields.map(field => value[field] || '').filter(Boolean);
    return parts.join(separator);
  }

  return String(value);
}

function applyBooleanTransformUtil(value: any, config: TransformConfig): string {
  const trueValue = config.trueValue ?? 'X';
  const falseValue = config.falseValue ?? '';

  if (typeof value === 'boolean') {
    return value ? trueValue : falseValue;
  }

  const strValue = String(value).toLowerCase();
  const truthyValues = ['true', '1', 'yes', 'y', 'on', 'checked', 'x'];

  return truthyValues.includes(strValue) ? trueValue : falseValue;
}

function isDateValueUtil(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(value) || /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(value);
}

function formatDateUtil(value: string, format: string): string {
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return value;

    // Use UTC methods to avoid timezone issues
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = date.getUTCDate().toString().padStart(2, '0');
    const year = date.getUTCFullYear();
    const shortYear = year.toString().slice(-2);

    const patterns: Record<string, string> = {
      'MM/DD/YYYY': `${month}/${day}/${year}`,
      'MM/DD/YY': `${month}/${day}/${shortYear}`,
      'YYYY-MM-DD': `${year}-${month}-${day}`,
      'MM-DD-YYYY': `${month}-${day}-${year}`,
    };

    return patterns[format] || patterns['MM/DD/YYYY'];
  } catch {
    return value;
  }
}

function isPhoneValueUtil(value: string): boolean {
  return /^[\d\s\-\(\)\+]+$/.test(value) && value.replace(/\D/g, '').length >= 10;
}

function formatPhoneUtil(value: string, format: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 10) return value;

  const phone = digits.slice(-10);
  const area = phone.substring(0, 3);
  const prefix = phone.substring(3, 6);
  const line = phone.substring(6, 10);

  const patterns: Record<string, string> = {
    '(###) ###-####': `(${area}) ${prefix}-${line}`,
    '###-###-####': `${area}-${prefix}-${line}`,
    '### ### ####': `${area} ${prefix} ${line}`,
  };

  return patterns[format] || patterns['(###) ###-####'];
}

// Test-compatible intake mapping type
interface TestIntakeMapping {
  id: string;
  intake_template_id: string;
  acord_template_id: string;
  intake_field_path: string;
  acord_field_name: string;
  transform_type: string;
  transform_config: TransformConfig;
  is_required: boolean;
  is_active: boolean;
  created_at: string;
}

/**
 * Process intake responses through mappings to generate ACORD field values
 * (Test-compatible signature)
 */
export function processIntakeToAcord(
  intakeResponses: Record<string, any>,
  mappings: TestIntakeMapping[]
): { acordFieldValues: Record<string, any>; errors: string[]; warnings: string[] } {
  const acordFieldValues: Record<string, any> = {};
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const mapping of mappings) {
    if (!mapping.is_active) continue;

    try {
      const sourceValue = resolveFieldPath(intakeResponses, mapping.intake_field_path);

      if (mapping.is_required && (sourceValue === undefined || sourceValue === null || sourceValue === '')) {
        errors.push(`Required field "${mapping.acord_field_name}" is missing (source: ${mapping.intake_field_path})`);
        continue;
      }

      if (sourceValue === undefined || sourceValue === null) {
        warnings.push(`Optional field "${mapping.intake_field_path}" not found in intake responses`);
        continue;
      }

      const transformedValue = applyTransform(sourceValue, mapping.transform_type, mapping.transform_config);
      acordFieldValues[mapping.acord_field_name] = transformedValue;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`Error processing mapping for "${mapping.acord_field_name}": ${errorMsg}`);
    }
  }

  return { acordFieldValues, errors, warnings };
}

// ============================================
// ORIGINAL IMPLEMENTATION BELOW
// ============================================

import type { IntakeAcordMapping, TransformType } from '@/types/intake';

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
