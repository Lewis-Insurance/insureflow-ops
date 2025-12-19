// ============================================
// Mapping Processor Tests
// Tests for intake-to-ACORD field mapping
// ============================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  processIntakeToAcord,
  resolveFieldPath,
  applyTransform,
} from '@/lib/mapping/mappingProcessor';
import type { IntakeAcordMapping, TransformConfig } from '@/types/intake';

describe('Mapping Processor', () => {
  describe('resolveFieldPath', () => {
    const testData = {
      business: {
        name: 'Test Corp',
        address: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zip: '90210',
        },
      },
      vehicles: [
        { year: 2020, make: 'Ford', model: 'F-150' },
        { year: 2021, make: 'Toyota', model: 'Camry' },
      ],
      hasLosses: true,
      employeeCount: 25,
    };

    it('should resolve simple paths', () => {
      expect(resolveFieldPath(testData, 'hasLosses')).toBe(true);
      expect(resolveFieldPath(testData, 'employeeCount')).toBe(25);
    });

    it('should resolve nested paths', () => {
      expect(resolveFieldPath(testData, 'business.name')).toBe('Test Corp');
      expect(resolveFieldPath(testData, 'business.address.city')).toBe('Anytown');
    });

    it('should resolve array paths', () => {
      expect(resolveFieldPath(testData, 'vehicles[0].make')).toBe('Ford');
      expect(resolveFieldPath(testData, 'vehicles[1].model')).toBe('Camry');
    });

    it('should return undefined for invalid paths', () => {
      expect(resolveFieldPath(testData, 'nonexistent')).toBeUndefined();
      expect(resolveFieldPath(testData, 'business.nonexistent')).toBeUndefined();
      expect(resolveFieldPath(testData, 'vehicles[10].make')).toBeUndefined();
    });
  });

  describe('applyTransform', () => {
    it('should apply direct transform (no change)', () => {
      const result = applyTransform('test value', 'direct', {
        onError: 'skip',
      });
      expect(result).toBe('test value');
    });

    it('should apply date format transform', () => {
      const result = applyTransform('2024-03-15', 'format', {
        dateFormat: 'MM/DD/YYYY',
        onError: 'skip',
      });
      expect(result).toBe('03/15/2024');
    });

    it('should apply phone format transform', () => {
      const result = applyTransform('5551234567', 'format', {
        phoneFormat: '(###) ###-####',
        onError: 'skip',
      });
      expect(result).toBe('(555) 123-4567');
    });

    it('should apply uppercase transform', () => {
      const result = applyTransform('hello world', 'format', {
        uppercase: true,
        onError: 'skip',
      });
      expect(result).toBe('HELLO WORLD');
    });

    it('should apply concatenation transform', () => {
      const result = applyTransform(
        { first: 'John', last: 'Doe' },
        'concatenate',
        {
          sourceFields: ['first', 'last'],
          separator: ' ',
          onError: 'skip',
        }
      );
      expect(result).toBe('John Doe');
    });

    it('should apply boolean mapping transform', () => {
      const config: TransformConfig = {
        trueValue: 'X',
        falseValue: '',
        onError: 'skip',
      };

      expect(applyTransform(true, 'boolean', config)).toBe('X');
      expect(applyTransform(false, 'boolean', config)).toBe('');
      expect(applyTransform('Yes', 'boolean', config)).toBe('X');
    });

    it('should handle overflow with truncation', () => {
      const result = applyTransform('This is a very long string that exceeds the limit', 'format', {
        maxLength: 20,
        overflowBehavior: 'truncate',
        onError: 'skip',
      });
      expect(result.length).toBe(20);
    });

    it('should use default value on error when configured', () => {
      const result = applyTransform(null, 'format', {
        dateFormat: 'MM/DD/YYYY',
        onError: 'default',
        defaultValue: 'N/A',
      });
      expect(result).toBe('N/A');
    });
  });

  describe('processIntakeToAcord', () => {
    const intakeResponses = {
      business_name: 'Acme Corporation',
      business_address: '123 Main Street',
      business_city: 'Springfield',
      business_state: 'IL',
      business_zip: '62701',
      effective_date: '2024-06-01',
      coverage_gl: true,
      coverage_auto: false,
      employee_count: 50,
    };

    const mappings: IntakeAcordMapping[] = [
      {
        id: '1',
        intake_template_id: 'test',
        acord_template_id: 'acord125',
        intake_field_path: 'business_name',
        acord_field_name: 'ApplicantName',
        transform_type: 'direct',
        transform_config: { onError: 'skip' },
        is_required: true,
        is_active: true,
        created_at: '',
      },
      {
        id: '2',
        intake_template_id: 'test',
        acord_template_id: 'acord125',
        intake_field_path: 'effective_date',
        acord_field_name: 'EffDate',
        transform_type: 'format',
        transform_config: { dateFormat: 'MM/DD/YYYY', onError: 'skip' },
        is_required: true,
        is_active: true,
        created_at: '',
      },
      {
        id: '3',
        intake_template_id: 'test',
        acord_template_id: 'acord125',
        intake_field_path: 'coverage_gl',
        acord_field_name: 'GLCoverage',
        transform_type: 'boolean',
        transform_config: { trueValue: 'X', falseValue: '', onError: 'skip' },
        is_required: false,
        is_active: true,
        created_at: '',
      },
    ];

    it('should process all active mappings', () => {
      const result = processIntakeToAcord(intakeResponses, mappings);

      expect(result.acordFieldValues['ApplicantName']).toBe('Acme Corporation');
      expect(result.acordFieldValues['EffDate']).toBe('06/01/2024');
      expect(result.acordFieldValues['GLCoverage']).toBe('X');
    });

    it('should skip inactive mappings', () => {
      const mappingsWithInactive = [
        ...mappings,
        {
          id: '4',
          intake_template_id: 'test',
          acord_template_id: 'acord125',
          intake_field_path: 'business_city',
          acord_field_name: 'City',
          transform_type: 'direct',
          transform_config: { onError: 'skip' },
          is_required: false,
          is_active: false,
          created_at: '',
        },
      ];

      const result = processIntakeToAcord(intakeResponses, mappingsWithInactive);

      expect(result.acordFieldValues['City']).toBeUndefined();
    });

    it('should report errors for missing required fields', () => {
      const incompleteResponses = {
        ...intakeResponses,
        business_name: '', // Empty required field
      };

      const result = processIntakeToAcord(incompleteResponses, mappings);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.includes('ApplicantName'))).toBe(true);
    });

    it('should handle missing source fields gracefully', () => {
      const partialResponses = {
        business_name: 'Test Corp',
        // Missing other fields
      };

      const result = processIntakeToAcord(partialResponses, mappings);

      expect(result.acordFieldValues['ApplicantName']).toBe('Test Corp');
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
