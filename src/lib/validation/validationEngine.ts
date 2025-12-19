// ============================================
// ACORD Validation Engine
// Validates form data against field schema and rules
// ============================================

import type {
  ValidationRule,
  ValidationResult,
  ValidationError,
  FieldSchemaItem,
} from '@/types/acord';

// ============================================
// TYPES
// ============================================

export interface ValidationContext {
  fieldValues: Record<string, any>;
  fieldSchema: FieldSchemaItem[];
  validationRules: ValidationRule[];
  carrierOverrides?: Record<string, any>;
}

export interface FieldValidationResult {
  fieldName: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export type ValidatorFunction = (
  value: any,
  fieldName: string,
  context: ValidationContext
) => { valid: boolean; message?: string };

// ============================================
// BUILT-IN VALIDATORS
// ============================================

const VALIDATORS: Record<string, ValidatorFunction> = {
  required: (value) => ({
    valid: value !== null && value !== undefined && value !== '',
    message: 'This field is required',
  }),

  email: (value) => {
    if (!value) return { valid: true };
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return {
      valid: emailRegex.test(String(value)),
      message: 'Please enter a valid email address',
    };
  },

  phone: (value) => {
    if (!value) return { valid: true };
    const digitsOnly = String(value).replace(/\D/g, '');
    return {
      valid: digitsOnly.length >= 10 && digitsOnly.length <= 11,
      message: 'Please enter a valid phone number',
    };
  },

  zip: (value) => {
    if (!value) return { valid: true };
    const zipRegex = /^\d{5}(-\d{4})?$/;
    return {
      valid: zipRegex.test(String(value)),
      message: 'Please enter a valid ZIP code (12345 or 12345-6789)',
    };
  },

  fein: (value) => {
    if (!value) return { valid: true };
    const feinRegex = /^\d{2}-?\d{7}$/;
    return {
      valid: feinRegex.test(String(value).replace(/\D/g, '')),
      message: 'Please enter a valid FEIN (XX-XXXXXXX)',
    };
  },

  ssn: (value) => {
    if (!value) return { valid: true };
    const ssnRegex = /^\d{3}-?\d{2}-?\d{4}$/;
    const digitsOnly = String(value).replace(/\D/g, '');
    return {
      valid: ssnRegex.test(value) || digitsOnly.length === 9,
      message: 'Please enter a valid SSN',
    };
  },

  vin: (value) => {
    if (!value) return { valid: true };
    const vinRegex = /^[A-HJ-NPR-Z0-9]{17}$/i;
    return {
      valid: vinRegex.test(String(value)),
      message: 'Please enter a valid 17-character VIN',
    };
  },

  date: (value) => {
    if (!value) return { valid: true };
    const date = new Date(value);
    return {
      valid: !isNaN(date.getTime()),
      message: 'Please enter a valid date',
    };
  },

  futureDate: (value) => {
    if (!value) return { valid: true };
    const date = new Date(value);
    return {
      valid: !isNaN(date.getTime()) && date > new Date(),
      message: 'Date must be in the future',
    };
  },

  pastDate: (value) => {
    if (!value) return { valid: true };
    const date = new Date(value);
    return {
      valid: !isNaN(date.getTime()) && date < new Date(),
      message: 'Date must be in the past',
    };
  },

  number: (value) => {
    if (!value && value !== 0) return { valid: true };
    return {
      valid: !isNaN(Number(value)),
      message: 'Please enter a valid number',
    };
  },

  positiveNumber: (value) => {
    if (!value && value !== 0) return { valid: true };
    const num = Number(value);
    return {
      valid: !isNaN(num) && num > 0,
      message: 'Please enter a positive number',
    };
  },

  currency: (value) => {
    if (!value && value !== 0) return { valid: true };
    const currencyRegex = /^\$?\d{1,3}(,\d{3})*(\.\d{2})?$/;
    const numericValue = String(value).replace(/[$,]/g, '');
    return {
      valid: currencyRegex.test(value) || !isNaN(Number(numericValue)),
      message: 'Please enter a valid currency amount',
    };
  },

  state: (value) => {
    if (!value) return { valid: true };
    const states = [
      'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
      'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
      'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
      'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
      'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
      'DC', 'PR', 'VI', 'GU', 'AS', 'MP',
    ];
    return {
      valid: states.includes(String(value).toUpperCase()),
      message: 'Please enter a valid state code',
    };
  },
};

// ============================================
// MAIN VALIDATION FUNCTIONS
// ============================================

/**
 * Validate entire form
 */
export function validateForm(context: ValidationContext): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  let totalFields = 0;
  let completedFields = 0;

  const { fieldValues, fieldSchema, validationRules, carrierOverrides } = context;

  // Validate based on field schema
  for (const field of fieldSchema) {
    totalFields++;
    const value = fieldValues[field.name];
    const hasValue = value !== null && value !== undefined && value !== '';

    if (hasValue) {
      completedFields++;
    }

    // Check required (can be overridden by carrier)
    const isRequired = carrierOverrides?.[field.name]?.required ?? field.required;
    if (isRequired && !hasValue) {
      errors.push({
        field: field.name,
        message: `${field.label || field.name} is required`,
      });
    }

    // Validate format based on type
    if (hasValue) {
      const formatResult = validateFieldFormat(value, field);
      if (!formatResult.valid) {
        errors.push({
          field: field.name,
          message: formatResult.message || `Invalid format for ${field.label || field.name}`,
        });
      }
    }

    // Check field-level validation rules
    if (field.validation) {
      const validationResult = validateFieldRules(value, field);
      errors.push(...validationResult.errors.map(msg => ({ field: field.name, message: msg })));
      warnings.push(...validationResult.warnings.map(msg => ({ field: field.name, message: msg })));
    }
  }

  // Process custom validation rules
  for (const rule of validationRules) {
    const ruleResult = evaluateRule(rule, fieldValues);
    if (!ruleResult.valid) {
      const item: ValidationError = {
        field: rule.field,
        message: rule.message,
        rule,
      };

      if (rule.severity === 'warning') {
        warnings.push(item);
      } else {
        errors.push(item);
      }
    }
  }

  const completionPercentage = totalFields > 0 ? Math.round((completedFields / totalFields) * 100) : 100;

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    completionPercentage,
  };
}

/**
 * Validate a single field
 */
export function validateField(
  fieldName: string,
  value: any,
  context: ValidationContext
): FieldValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const field = context.fieldSchema.find(f => f.name === fieldName);

  if (field) {
    const hasValue = value !== null && value !== undefined && value !== '';

    // Check required
    if (field.required && !hasValue) {
      errors.push(`${field.label || fieldName} is required`);
    }

    // Validate format
    if (hasValue) {
      const formatResult = validateFieldFormat(value, field);
      if (!formatResult.valid) {
        errors.push(formatResult.message || 'Invalid format');
      }

      // Field-level validation rules
      if (field.validation) {
        const ruleResult = validateFieldRules(value, field);
        errors.push(...ruleResult.errors);
        warnings.push(...ruleResult.warnings);
      }
    }
  }

  // Check custom rules that affect this field
  const relevantRules = context.validationRules.filter(r => r.field === fieldName);
  for (const rule of relevantRules) {
    const ruleResult = evaluateRule(rule, { ...context.fieldValues, [fieldName]: value });
    if (!ruleResult.valid) {
      if (rule.severity === 'warning') {
        warnings.push(rule.message);
      } else {
        errors.push(rule.message);
      }
    }
  }

  return {
    fieldName,
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================
// RULE EVALUATION
// ============================================

/**
 * Evaluate a validation rule
 */
function evaluateRule(
  rule: ValidationRule,
  fieldValues: Record<string, any>
): { valid: boolean } {
  const value = fieldValues[rule.field];
  const hasValue = value !== null && value !== undefined && value !== '';

  switch (rule.type) {
    case 'required':
      return { valid: hasValue };

    case 'conditional_required':
      if (!rule.condition) return { valid: true };

      const conditionMet = evaluateCondition(rule.condition, fieldValues);
      if (conditionMet) {
        return { valid: hasValue };
      }
      return { valid: true };

    case 'format':
      // Format rules would have a pattern in the condition
      return { valid: true };

    case 'range':
      if (!hasValue) return { valid: true };
      // Range validation would check min/max
      return { valid: true };

    case 'dependency':
      // Check if dependent field has value when this field has value
      if (hasValue && rule.condition) {
        const dependentValue = fieldValues[rule.condition.dependsOn];
        return { valid: dependentValue !== null && dependentValue !== undefined && dependentValue !== '' };
      }
      return { valid: true };

    default:
      return { valid: true };
  }
}

/**
 * Evaluate a condition
 */
function evaluateCondition(
  condition: NonNullable<ValidationRule['condition']>,
  fieldValues: Record<string, any>
): boolean {
  const dependentValue = fieldValues[condition.dependsOn];

  switch (condition.operator) {
    case 'equals':
      return dependentValue === condition.value;

    case 'not_equals':
      return dependentValue !== condition.value;

    case 'contains':
      return String(dependentValue || '').includes(String(condition.value));

    case 'greater_than':
      return Number(dependentValue) > Number(condition.value);

    case 'less_than':
      return Number(dependentValue) < Number(condition.value);

    case 'checked':
      return dependentValue === true || dependentValue === 'true' || dependentValue === '1';

    case 'unchecked':
      return dependentValue === false || dependentValue === 'false' || dependentValue === '0' || !dependentValue;

    default:
      return false;
  }
}

// ============================================
// FORMAT VALIDATION
// ============================================

/**
 * Validate field format based on type
 */
function validateFieldFormat(
  value: any,
  field: FieldSchemaItem
): { valid: boolean; message?: string } {
  const type = field.type.toLowerCase();

  // Map schema types to validators
  const typeValidators: Record<string, string> = {
    email: 'email',
    phone: 'phone',
    zip: 'zip',
    fein: 'fein',
    ein: 'fein',
    ssn: 'ssn',
    vin: 'vin',
    date: 'date',
    number: 'number',
    currency: 'currency',
    state: 'state',
  };

  const validatorName = typeValidators[type];
  if (validatorName && VALIDATORS[validatorName]) {
    return VALIDATORS[validatorName](value, field.name, {} as ValidationContext);
  }

  return { valid: true };
}

/**
 * Validate field-level rules (min, max, pattern, etc.)
 */
function validateFieldRules(
  value: any,
  field: FieldSchemaItem
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const validation = field.validation;

  if (!validation) return { errors, warnings };

  const stringValue = String(value);

  // Min length
  if (validation.minLength && stringValue.length < validation.minLength) {
    errors.push(`Minimum length is ${validation.minLength} characters`);
  }

  // Max length
  if (validation.maxLength && stringValue.length > validation.maxLength) {
    errors.push(`Maximum length is ${validation.maxLength} characters`);
  }

  // Min value (numeric)
  if (validation.min !== undefined) {
    const numValue = Number(value);
    if (!isNaN(numValue) && numValue < validation.min) {
      errors.push(`Minimum value is ${validation.min}`);
    }
  }

  // Max value (numeric)
  if (validation.max !== undefined) {
    const numValue = Number(value);
    if (!isNaN(numValue) && numValue > validation.max) {
      errors.push(`Maximum value is ${validation.max}`);
    }
  }

  // Pattern
  if (validation.pattern) {
    const regex = new RegExp(validation.pattern);
    if (!regex.test(stringValue)) {
      errors.push('Value does not match required format');
    }
  }

  return { errors, warnings };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Create a validation rule
 */
export function createValidationRule(
  field: string,
  type: ValidationRule['type'],
  message: string,
  options: {
    condition?: ValidationRule['condition'];
    severity?: 'error' | 'warning';
  } = {}
): ValidationRule {
  return {
    id: `rule_${field}_${type}_${Date.now()}`,
    type,
    field,
    message,
    condition: options.condition,
    severity: options.severity || 'error',
  };
}

/**
 * Create conditional required rule
 */
export function createConditionalRequired(
  field: string,
  dependsOn: string,
  operator: NonNullable<ValidationRule['condition']>['operator'],
  value: any,
  message: string
): ValidationRule {
  return createValidationRule(field, 'conditional_required', message, {
    condition: { dependsOn, operator, value },
  });
}

/**
 * Get validation summary for display
 */
export function getValidationSummary(result: ValidationResult): {
  status: 'complete' | 'incomplete' | 'invalid';
  errorCount: number;
  warningCount: number;
  completionPercentage: number;
  message: string;
} {
  const errorCount = result.errors.length;
  const warningCount = result.warnings.length;

  let status: 'complete' | 'incomplete' | 'invalid';
  let message: string;

  if (errorCount > 0) {
    status = 'invalid';
    message = `${errorCount} error${errorCount > 1 ? 's' : ''} found`;
  } else if (result.completionPercentage < 100) {
    status = 'incomplete';
    message = `${result.completionPercentage}% complete`;
  } else {
    status = 'complete';
    message = 'All fields validated';
  }

  if (warningCount > 0) {
    message += ` (${warningCount} warning${warningCount > 1 ? 's' : ''})`;
  }

  return {
    status,
    errorCount,
    warningCount,
    completionPercentage: result.completionPercentage,
    message,
  };
}

/**
 * Register custom validator
 */
export function registerValidator(name: string, validator: ValidatorFunction): void {
  VALIDATORS[name] = validator;
}

/**
 * Get all available validators
 */
export function getAvailableValidators(): string[] {
  return Object.keys(VALIDATORS);
}
