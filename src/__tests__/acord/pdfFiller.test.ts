// ============================================
// PDF Filler Tests
// Tests for ACORD PDF filling functionality
// ============================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fillPdfForm,
  getFieldTypeFromName,
  formatFieldValue,
} from '@/lib/acord/pdfFiller';
import type { PdfFillOptions, FieldTypeMap } from '@/types/acord';

// Mock pdf-lib
vi.mock('pdf-lib', () => ({
  PDFDocument: {
    load: vi.fn().mockResolvedValue({
      getForm: vi.fn().mockReturnValue({
        getFields: vi.fn().mockReturnValue([
          { getName: () => 'applicant_name', constructor: { name: 'PDFTextField' } },
          { getName: () => 'effective_date', constructor: { name: 'PDFTextField' } },
          { getName: () => 'coverage_gl', constructor: { name: 'PDFCheckBox' } },
        ]),
        getTextField: vi.fn().mockReturnValue({
          setText: vi.fn(),
          setFontSize: vi.fn(),
        }),
        getCheckBox: vi.fn().mockReturnValue({
          check: vi.fn(),
          uncheck: vi.fn(),
        }),
        flatten: vi.fn(),
      }),
      save: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    }),
  },
}));

describe('PDF Filler', () => {
  describe('getFieldTypeFromName', () => {
    it('should identify checkbox fields by naming patterns', () => {
      expect(getFieldTypeFromName('coverage_gl')).toBe('checkbox');
      expect(getFieldTypeFromName('has_losses')).toBe('checkbox');
      expect(getFieldTypeFromName('is_owner')).toBe('checkbox');
      expect(getFieldTypeFromName('include_umbrella')).toBe('checkbox');
    });

    it('should identify date fields by naming patterns', () => {
      expect(getFieldTypeFromName('effective_date')).toBe('text');
      expect(getFieldTypeFromName('expiration_date')).toBe('text');
      expect(getFieldTypeFromName('date_of_birth')).toBe('text');
    });

    it('should default to text for unknown patterns', () => {
      expect(getFieldTypeFromName('applicant_name')).toBe('text');
      expect(getFieldTypeFromName('some_random_field')).toBe('text');
    });
  });

  describe('formatFieldValue', () => {
    it('should format dates correctly', () => {
      const date = new Date('2024-03-15');
      expect(formatFieldValue(date.toISOString(), 'date', { dateFormat: 'MM/DD/YYYY' }))
        .toMatch(/03\/15\/2024/);
    });

    it('should format phone numbers', () => {
      expect(formatFieldValue('5551234567', 'phone', { phoneFormat: '(###) ###-####' }))
        .toBe('(555) 123-4567');
    });

    it('should handle boolean values for checkboxes', () => {
      expect(formatFieldValue(true, 'checkbox', {})).toBe(true);
      expect(formatFieldValue('Yes', 'checkbox', {})).toBe(true);
      expect(formatFieldValue('1', 'checkbox', {})).toBe(true);
      expect(formatFieldValue(false, 'checkbox', {})).toBe(false);
      expect(formatFieldValue('No', 'checkbox', {})).toBe(false);
    });

    it('should apply uppercase transform', () => {
      expect(formatFieldValue('test value', 'text', { uppercase: true }))
        .toBe('TEST VALUE');
    });

    it('should apply trim transform', () => {
      expect(formatFieldValue('  test value  ', 'text', { trim: true }))
        .toBe('test value');
    });

    it('should handle null and undefined', () => {
      expect(formatFieldValue(null, 'text', {})).toBe('');
      expect(formatFieldValue(undefined, 'text', {})).toBe('');
    });
  });

  describe('fillPdfForm', () => {
    const mockPdfBytes = new Uint8Array([1, 2, 3, 4]);
    const defaultOptions: PdfFillOptions = {
      flatten: true,
      updateAppearances: true,
      preserveEmptyFields: false,
    };

    it('should fill text fields with provided values', async () => {
      const fieldValues = {
        applicant_name: 'Test Company LLC',
        effective_date: '2024-01-01',
      };

      const result = await fillPdfForm(mockPdfBytes, fieldValues, {}, defaultOptions);

      expect(result.success).toBe(true);
      expect(result.filledFieldCount).toBeGreaterThan(0);
    });

    it('should handle checkbox fields', async () => {
      const fieldValues = {
        coverage_gl: true,
      };

      const result = await fillPdfForm(mockPdfBytes, fieldValues, {}, defaultOptions);

      expect(result.success).toBe(true);
    });

    it('should skip fields not in the PDF', async () => {
      const fieldValues = {
        nonexistent_field: 'value',
      };

      const result = await fillPdfForm(mockPdfBytes, fieldValues, {}, defaultOptions);

      expect(result.skippedFields).toContain('nonexistent_field');
    });

    it('should return PDF bytes on success', async () => {
      const result = await fillPdfForm(mockPdfBytes, {}, {}, defaultOptions);

      expect(result.success).toBe(true);
      expect(result.pdfBytes).toBeInstanceOf(Uint8Array);
    });
  });
});
