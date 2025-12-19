// ============================================
// Validation Engine Tests
// Tests for ACORD form validation
// ============================================

import { describe, it, expect, beforeEach } from 'vitest';
import type { ValidationRule, ValidationResult, ValidationError } from '@/types/acord';

// ============================================
// VALIDATION FUNCTIONS (inline for testing)
// ============================================

function validateRequired(
  fieldName: string,
  value: any,
  rule: ValidationRule
): ValidationError | null {
  if (value === undefined || value === null || value === '') {
    return {
      field: fieldName,
      message: rule.message,
      rule,
    };
  }
  return null;
}

function validateFormat(
  fieldName: string,
  value: any,
  rule: ValidationRule,
  pattern: string
): ValidationError | null {
  if (!value) return null;

  const regex = new RegExp(pattern);
  if (!regex.test(String(value))) {
    return {
      field: fieldName,
      message: rule.message,
      rule,
    };
  }
  return null;
}

function validateRange(
  fieldName: string,
  value: any,
  rule: ValidationRule,
  min?: number,
  max?: number
): ValidationError | null {
  if (value === undefined || value === null) return null;

  const numValue = Number(value);
  if (isNaN(numValue)) {
    return {
      field: fieldName,
      message: 'Value must be a number',
      rule,
    };
  }

  if (min !== undefined && numValue < min) {
    return {
      field: fieldName,
      message: rule.message,
      rule,
    };
  }

  if (max !== undefined && numValue > max) {
    return {
      field: fieldName,
      message: rule.message,
      rule,
    };
  }

  return null;
}

function validateConditional(
  fieldName: string,
  value: any,
  rule: ValidationRule,
  allValues: Record<string, any>
): ValidationError | null {
  if (!rule.condition) return null;

  const dependentValue = allValues[rule.condition.dependsOn];
  let conditionMet = false;

  switch (rule.condition.operator) {
    case 'equals':
      conditionMet = dependentValue === rule.condition.value;
      break;
    case 'not_equals':
      conditionMet = dependentValue !== rule.condition.value;
      break;
    case 'contains':
      conditionMet = String(dependentValue).includes(String(rule.condition.value));
      break;
    case 'greater_than':
      conditionMet = Number(dependentValue) > Number(rule.condition.value);
      break;
    case 'less_than':
      conditionMet = Number(dependentValue) < Number(rule.condition.value);
      break;
    case 'checked':
      conditionMet = dependentValue === true || dependentValue === 'true' || dependentValue === '1';
      break;
    case 'unchecked':
      conditionMet = !dependentValue || dependentValue === false || dependentValue === 'false' || dependentValue === '0';
      break;
  }

  if (conditionMet) {
    // Condition is met, so this field is required
    if (value === undefined || value === null || value === '') {
      return {
        field: fieldName,
        message: rule.message,
        rule,
      };
    }
  }

  return null;
}

function validateForm(
  fieldValues: Record<string, any>,
  rules: ValidationRule[]
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  for (const rule of rules) {
    let error: ValidationError | null = null;

    switch (rule.type) {
      case 'required':
        error = validateRequired(rule.field, fieldValues[rule.field], rule);
        break;

      case 'conditional_required':
        error = validateConditional(rule.field, fieldValues[rule.field], rule, fieldValues);
        break;

      case 'format':
        if (rule.condition?.value) {
          error = validateFormat(rule.field, fieldValues[rule.field], rule, String(rule.condition.value));
        }
        break;

      case 'range':
        const minVal = rule.condition?.value as number | undefined;
        error = validateRange(rule.field, fieldValues[rule.field], rule, minVal);
        break;
    }

    if (error) {
      if (rule.severity === 'error') {
        errors.push(error);
      } else {
        warnings.push(error);
      }
    }
  }

  // Calculate completion percentage
  const totalRequiredFields = rules.filter(r => r.type === 'required' || r.type === 'conditional_required').length;
  const filledRequiredFields = totalRequiredFields - errors.filter(e =>
    e.rule?.type === 'required' || e.rule?.type === 'conditional_required'
  ).length;
  const completionPercentage = totalRequiredFields > 0
    ? Math.round((filledRequiredFields / totalRequiredFields) * 100)
    : 100;

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    completionPercentage,
  };
}

// ============================================
// TESTS
// ============================================

describe('Validation Engine', () => {
  describe('validateRequired', () => {
    const rule: ValidationRule = {
      id: '1',
      type: 'required',
      field: 'applicant_name',
      message: 'Applicant name is required',
      severity: 'error',
    };

    it('should return error for empty string', () => {
      const result = validateRequired('applicant_name', '', rule);
      expect(result).not.toBeNull();
      expect(result?.message).toBe('Applicant name is required');
    });

    it('should return error for null', () => {
      const result = validateRequired('applicant_name', null, rule);
      expect(result).not.toBeNull();
    });

    it('should return error for undefined', () => {
      const result = validateRequired('applicant_name', undefined, rule);
      expect(result).not.toBeNull();
    });

    it('should return null for valid value', () => {
      const result = validateRequired('applicant_name', 'Test Company', rule);
      expect(result).toBeNull();
    });

    it('should return null for zero (valid number)', () => {
      const result = validateRequired('employee_count', 0, rule);
      expect(result).toBeNull();
    });
  });

  describe('validateFormat', () => {
    const emailRule: ValidationRule = {
      id: '2',
      type: 'format',
      field: 'email',
      condition: { dependsOn: '', operator: 'equals', value: '^[^@]+@[^@]+\\.[^@]+$' },
      message: 'Invalid email format',
      severity: 'error',
    };

    it('should return error for invalid email', () => {
      const result = validateFormat('email', 'invalid-email', emailRule, '^[^@]+@[^@]+\\.[^@]+$');
      expect(result).not.toBeNull();
    });

    it('should return null for valid email', () => {
      const result = validateFormat('email', 'test@example.com', emailRule, '^[^@]+@[^@]+\\.[^@]+$');
      expect(result).toBeNull();
    });

    it('should return null for empty value (not required)', () => {
      const result = validateFormat('email', '', emailRule, '^[^@]+@[^@]+\\.[^@]+$');
      expect(result).toBeNull();
    });
  });

  describe('validateRange', () => {
    const rangeRule: ValidationRule = {
      id: '3',
      type: 'range',
      field: 'employee_count',
      condition: { dependsOn: '', operator: 'greater_than', value: 1 },
      message: 'Employee count must be at least 1',
      severity: 'error',
    };

    it('should return error for value below minimum', () => {
      const result = validateRange('employee_count', 0, rangeRule, 1);
      expect(result).not.toBeNull();
    });

    it('should return null for value at minimum', () => {
      const result = validateRange('employee_count', 1, rangeRule, 1);
      expect(result).toBeNull();
    });

    it('should return null for value above minimum', () => {
      const result = validateRange('employee_count', 100, rangeRule, 1);
      expect(result).toBeNull();
    });

    it('should return error for non-numeric value', () => {
      const result = validateRange('employee_count', 'abc', rangeRule, 1);
      expect(result).not.toBeNull();
    });
  });

  describe('validateConditional', () => {
    const conditionalRule: ValidationRule = {
      id: '4',
      type: 'conditional_required',
      field: 'vehicle_count',
      condition: {
        dependsOn: 'has_vehicles',
        operator: 'checked',
        value: true,
      },
      message: 'Vehicle count is required when vehicles are selected',
      severity: 'error',
    };

    it('should return error when condition is met but field is empty', () => {
      const values = { has_vehicles: true, vehicle_count: '' };
      const result = validateConditional('vehicle_count', '', conditionalRule, values);
      expect(result).not.toBeNull();
    });

    it('should return null when condition is met and field has value', () => {
      const values = { has_vehicles: true, vehicle_count: 5 };
      const result = validateConditional('vehicle_count', 5, conditionalRule, values);
      expect(result).toBeNull();
    });

    it('should return null when condition is not met', () => {
      const values = { has_vehicles: false, vehicle_count: '' };
      const result = validateConditional('vehicle_count', '', conditionalRule, values);
      expect(result).toBeNull();
    });
  });

  describe('validateForm (integration)', () => {
    const rules: ValidationRule[] = [
      {
        id: '1',
        type: 'required',
        field: 'applicant_name',
        message: 'Applicant name is required',
        severity: 'error',
      },
      {
        id: '2',
        type: 'required',
        field: 'effective_date',
        message: 'Effective date is required',
        severity: 'error',
      },
      {
        id: '3',
        type: 'conditional_required',
        field: 'loss_details',
        condition: {
          dependsOn: 'has_losses',
          operator: 'checked',
          value: true,
        },
        message: 'Loss details are required when losses are reported',
        severity: 'error',
      },
      {
        id: '4',
        type: 'required',
        field: 'fein',
        message: 'FEIN is recommended',
        severity: 'warning',
      },
    ];

    it('should return valid for complete form', () => {
      const values = {
        applicant_name: 'Test Company',
        effective_date: '2024-01-01',
        has_losses: false,
        fein: '12-3456789',
      };

      const result = validateForm(values, rules);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.completionPercentage).toBe(100);
    });

    it('should return errors for missing required fields', () => {
      const values = {
        applicant_name: '',
        effective_date: '2024-01-01',
        has_losses: false,
      };

      const result = validateForm(values, rules);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.field === 'applicant_name')).toBe(true);
    });

    it('should return warnings separately from errors', () => {
      const values = {
        applicant_name: 'Test Company',
        effective_date: '2024-01-01',
        has_losses: false,
        fein: '', // Missing but only a warning
      };

      const result = validateForm(values, rules);

      expect(result.valid).toBe(true); // Still valid because only warnings
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.field === 'fein')).toBe(true);
    });

    it('should validate conditional fields correctly', () => {
      const values = {
        applicant_name: 'Test Company',
        effective_date: '2024-01-01',
        has_losses: true,
        loss_details: '', // Required because has_losses is true
        fein: '12-3456789',
      };

      const result = validateForm(values, rules);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'loss_details')).toBe(true);
    });

    it('should calculate completion percentage correctly', () => {
      const values = {
        applicant_name: 'Test Company',
        effective_date: '', // Missing
        has_losses: false,
        fein: '12-3456789',
      };

      const result = validateForm(values, rules);

      // 2 required fields, 1 filled = 50% (not counting conditional since condition not met)
      expect(result.completionPercentage).toBeLessThan(100);
    });
  });
});
