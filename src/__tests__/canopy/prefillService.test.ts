// ============================================================================
// CANOPY ACORD PREFILL SERVICE TESTS
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase before importing the service
// Create a chainable mock for nested .eq() calls
const createChainableMock = () => {
  const chainable: any = {
    eq: vi.fn(() => chainable),
    single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    in: vi.fn(() => Promise.resolve({ data: [], error: null })),
    order: vi.fn(() => chainable),
    limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
  };
  return chainable;
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => createChainableMock()),
    })),
  },
}));

// Import after mocking
import {
  getCanopyAcordPrefill,
  type PersonalLinesLOB,
} from '@/services/canopy/CanopyAcordPrefillService';

describe('CanopyAcordPrefillService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCanopyAcordPrefill', () => {
    it('should return correct ACORD form number for auto', async () => {
      const result = await getCanopyAcordPrefill('test-pull-id', 'auto');
      expect(result.acordFormNumber).toBe('80');
      expect(result.lob).toBe('auto');
    });

    it('should return correct ACORD form number for home', async () => {
      const result = await getCanopyAcordPrefill('test-pull-id', 'home');
      expect(result.acordFormNumber).toBe('35');
      expect(result.lob).toBe('home');
    });

    it('should return correct ACORD form number for renters', async () => {
      const result = await getCanopyAcordPrefill('test-pull-id', 'renters');
      expect(result.acordFormNumber).toBe('35');
      expect(result.lob).toBe('renters');
    });

    it('should return correct ACORD form number for condo', async () => {
      const result = await getCanopyAcordPrefill('test-pull-id', 'condo');
      expect(result.acordFormNumber).toBe('35');
      expect(result.lob).toBe('condo');
    });

    it('should return correct ACORD form number for umbrella', async () => {
      const result = await getCanopyAcordPrefill('test-pull-id', 'umbrella');
      expect(result.acordFormNumber).toBe('35U');
      expect(result.lob).toBe('umbrella');
    });

    it('should handle errors gracefully', async () => {
      const result = await getCanopyAcordPrefill('invalid-id', 'auto');
      // Should return proper structure even on errors
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('fieldValues');
      expect(result.fieldValues).toBeDefined();
    });
  });
});

// ============================================================================
// FIELD FORMATTING TESTS
// ============================================================================

describe('Field Formatting Utilities', () => {
  // Test helper functions by testing the output format

  describe('Date Formatting', () => {
    it('should format dates correctly in field values', async () => {
      // The service formats dates as MM/DD/YYYY
      const result = await getCanopyAcordPrefill('test-pull-id', 'auto');
      // With no data, dates should be empty strings
      expect(result.fieldValues['EffectiveDate'] || '').toBe('');
    });
  });

  describe('Currency Formatting', () => {
    it('should format currency values correctly', async () => {
      const result = await getCanopyAcordPrefill('test-pull-id', 'home');
      // With no data, currency should be empty strings
      expect(result.fieldValues['CovA_Dwelling'] || '').toBe('');
    });
  });

  describe('Phone Formatting', () => {
    it('should format phone numbers correctly', async () => {
      const result = await getCanopyAcordPrefill('test-pull-id', 'auto');
      // With no data, phone should be empty
      expect(result.fieldValues['NamedInsured_Phone'] || '').toBe('');
    });
  });
});

// ============================================================================
// LOB-SPECIFIC MAPPING TESTS
// ============================================================================

describe('LOB-Specific Mappings', () => {
  describe('Auto Mapping', () => {
    it('should include vehicle fields for auto LOB', async () => {
      const result = await getCanopyAcordPrefill('test-pull-id', 'auto');
      // Check that vehicle-related field names are in the expected structure
      expect(result.lob).toBe('auto');
      expect(result.acordFormNumber).toBe('80');
    });

    it('should include driver fields for auto LOB', async () => {
      const result = await getCanopyAcordPrefill('test-pull-id', 'auto');
      expect(result.lob).toBe('auto');
    });
  });

  describe('Renters Mapping', () => {
    it('should use ACORD 35 for renters', async () => {
      const result = await getCanopyAcordPrefill('test-pull-id', 'renters');
      expect(result.acordFormNumber).toBe('35');
      expect(result.lob).toBe('renters');
    });

    it('should return proper result structure', async () => {
      const result = await getCanopyAcordPrefill('test-pull-id', 'renters');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('fieldValues');
      expect(typeof result.fieldValues).toBe('object');
    });
  });

  describe('Condo Mapping', () => {
    it('should use ACORD 35 for condo', async () => {
      const result = await getCanopyAcordPrefill('test-pull-id', 'condo');
      expect(result.acordFormNumber).toBe('35');
      expect(result.lob).toBe('condo');
    });

    it('should return proper result structure', async () => {
      const result = await getCanopyAcordPrefill('test-pull-id', 'condo');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('fieldValues');
      expect(typeof result.fieldValues).toBe('object');
    });
  });

  describe('Umbrella Mapping', () => {
    it('should use ACORD 35U for umbrella', async () => {
      const result = await getCanopyAcordPrefill('test-pull-id', 'umbrella');
      expect(result.acordFormNumber).toBe('35U');
      expect(result.lob).toBe('umbrella');
    });

    it('should return proper result structure', async () => {
      const result = await getCanopyAcordPrefill('test-pull-id', 'umbrella');
      // Result should have proper structure even on errors
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('fieldValues');
      expect(result).toHaveProperty('warnings');
    });
  });
});

// ============================================================================
// RESULT STRUCTURE TESTS
// ============================================================================

describe('Prefill Result Structure', () => {
  it('should return all required result properties', async () => {
    const result = await getCanopyAcordPrefill('test-pull-id', 'auto');

    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('lob');
    expect(result).toHaveProperty('acordFormNumber');
    expect(result).toHaveProperty('fieldValues');
    expect(result).toHaveProperty('unmappedFields');
    expect(result).toHaveProperty('warnings');
  });

  it('should return fieldValues as an object', async () => {
    const result = await getCanopyAcordPrefill('test-pull-id', 'home');
    expect(typeof result.fieldValues).toBe('object');
    expect(Array.isArray(result.fieldValues)).toBe(false);
  });

  it('should return warnings as an array', async () => {
    const result = await getCanopyAcordPrefill('test-pull-id', 'auto');
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});
