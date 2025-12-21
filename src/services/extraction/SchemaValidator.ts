/**
 * Schema Validator
 *
 * Validates LLM output against JSON schemas:
 * - Strict validation with detailed errors
 * - Automatic correction retry on failure
 * - Controlled failure state on persistent errors
 * - Artifact logging for investigation
 */

// Using dynamic import to avoid type issues with AJV
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Ajv = require('ajv').default || require('ajv');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const addFormats = require('ajv-formats');

interface AjvError {
  instancePath?: string;
  keyword: string;
  message?: string;
  params: Record<string, any>;
  data?: any;
}

// =============================================================================
// TYPES
// =============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  corrected?: boolean;
  originalOutput?: string;
  correctedOutput?: string;
}

export interface ValidationError {
  path: string;
  message: string;
  keyword: string;
  params: Record<string, any>;
}

export interface SchemaValidationOptions {
  allowCorrection?: boolean;
  maxCorrectionAttempts?: number;
  onCorrectionAttempt?: (attempt: number, errors: ValidationError[]) => Promise<string>;
}

// =============================================================================
// VALIDATOR CLASS
// =============================================================================

export class SchemaValidator {
  private ajv: Ajv;

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false,
    });
    addFormats(this.ajv);
  }

  /**
   * Validate JSON string against a schema
   */
  validate(
    jsonString: string,
    schema: object
  ): ValidationResult {
    // First, try to parse JSON
    let parsed: any;
    try {
      parsed = this.parseJSON(jsonString);
    } catch (error) {
      return {
        valid: false,
        errors: [{
          path: '',
          message: `Invalid JSON: ${error instanceof Error ? error.message : 'Parse error'}`,
          keyword: 'parse',
          params: { error: String(error) },
        }],
      };
    }

    // Validate against schema
    const validate = this.ajv.compile(schema);
    const valid = validate(parsed);

    if (valid) {
      return { valid: true, errors: [] };
    }

    // Convert AJV errors to our format
    const errors = this.formatErrors(validate.errors || []);

    return { valid: false, errors };
  }

  /**
   * Validate with automatic correction retry
   */
  async validateWithCorrection(
    jsonString: string,
    schema: object,
    options: SchemaValidationOptions
  ): Promise<ValidationResult> {
    const { allowCorrection = true, maxCorrectionAttempts = 1, onCorrectionAttempt } = options;

    // Initial validation
    let result = this.validate(jsonString, schema);

    if (result.valid || !allowCorrection || !onCorrectionAttempt) {
      return result;
    }

    // Attempt correction
    let currentOutput = jsonString;
    let attempts = 0;

    while (!result.valid && attempts < maxCorrectionAttempts) {
      attempts++;

      try {
        const correctedOutput = await onCorrectionAttempt(attempts, result.errors);
        const correctionResult = this.validate(correctedOutput, schema);

        if (correctionResult.valid) {
          return {
            valid: true,
            errors: [],
            corrected: true,
            originalOutput: jsonString,
            correctedOutput,
          };
        }

        currentOutput = correctedOutput;
        result = correctionResult;
      } catch (error) {
        // Correction attempt failed
        result.errors.push({
          path: '',
          message: `Correction attempt ${attempts} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          keyword: 'correction',
          params: { attempt: attempts },
        });
      }
    }

    // All correction attempts failed
    return {
      valid: false,
      errors: result.errors,
      corrected: false,
      originalOutput: jsonString,
    };
  }

  /**
   * Parse JSON with better error messages
   */
  private parseJSON(jsonString: string): any {
    // Clean common LLM output issues
    let cleaned = jsonString.trim();

    // Remove markdown code blocks if present
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();

    // Try to find JSON object in response
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');

    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
    }

    return JSON.parse(cleaned);
  }

  /**
   * Format AJV errors into our structure
   */
  private formatErrors(ajvErrors: AjvError[]): ValidationError[] {
    return ajvErrors.map(error => ({
      path: error.instancePath || '/',
      message: this.formatErrorMessage(error),
      keyword: error.keyword,
      params: error.params,
    }));
  }

  /**
   * Create human-readable error message
   */
  private formatErrorMessage(error: AjvError): string {
    const path = error.instancePath || 'root';

    switch (error.keyword) {
      case 'required':
        return `${path}: Missing required property "${error.params?.missingProperty}"`;
      case 'type':
        return `${path}: Expected ${error.params?.type}, got ${typeof error.data}`;
      case 'enum':
        return `${path}: Value must be one of: ${error.params?.allowedValues?.join(', ')}`;
      case 'minimum':
        return `${path}: Value must be >= ${error.params?.limit}`;
      case 'maximum':
        return `${path}: Value must be <= ${error.params?.limit}`;
      case 'additionalProperties':
        return `${path}: Unknown property "${error.params?.additionalProperty}"`;
      case 'pattern':
        return `${path}: Value does not match pattern ${error.params?.pattern}`;
      default:
        return `${path}: ${error.message || error.keyword}`;
    }
  }

  /**
   * Get schema for a specific extraction type
   */
  getSchemaForType(type: 'acord_mapping' | 'field_refiner'): object {
    // Import from LLMRequestBuilder
    const { ACORD_MAPPING_OUTPUT_SCHEMA, FIELD_REFINER_OUTPUT_SCHEMA } = require('./LLMRequestBuilder');

    switch (type) {
      case 'acord_mapping':
        return ACORD_MAPPING_OUTPUT_SCHEMA;
      case 'field_refiner':
        return FIELD_REFINER_OUTPUT_SCHEMA;
      default:
        throw new Error(`Unknown schema type: ${type}`);
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const schemaValidator = new SchemaValidator();

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Quick validation helper
 */
export function validateExtractionOutput(
  output: string,
  type: 'acord_mapping' | 'field_refiner'
): ValidationResult {
  const schema = schemaValidator.getSchemaForType(type);
  return schemaValidator.validate(output, schema);
}

/**
 * Extract validation error summary for logging
 */
export function summarizeValidationErrors(errors: ValidationError[]): string {
  if (errors.length === 0) return 'No errors';

  const summary = errors.slice(0, 5).map(e => `${e.path}: ${e.message}`);
  if (errors.length > 5) {
    summary.push(`... and ${errors.length - 5} more errors`);
  }

  return summary.join('; ');
}

/**
 * Check if errors are correctable (structural vs semantic)
 */
export function areErrorsCorrectable(errors: ValidationError[]): boolean {
  const correctableKeywords = ['parse', 'type', 'required', 'additionalProperties', 'format'];

  return errors.every(e => correctableKeywords.includes(e.keyword));
}
