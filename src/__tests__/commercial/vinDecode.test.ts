// ============================================================================
// VIN DECODE TESTS (Commercial Lines SOW v3, Phase 6 Business Auto)
// ============================================================================
// Pure-function coverage for the NHTSA vPIC parse layer: VIN shape check,
// GVWR class-label pound extraction, and result-row picking with vPIC's
// empty vocabulary ('' / 'Not Applicable').
// ============================================================================

import { describe, expect, it } from 'vitest';
import {
  isEmptyDecode,
  isLikelyVin,
  normalizeVinValue,
  parseGvwrPounds,
  pickVinError,
  pickVinFields,
} from '@/lib/commercial/vinDecode';

describe('isLikelyVin', () => {
  it('accepts a real 17-character VIN, either case', () => {
    expect(isLikelyVin('1FTFW1ET5DFC10312')).toBe(true);
    expect(isLikelyVin('1ftfw1et5dfc10312')).toBe(true);
    expect(isLikelyVin('  1FTFW1ET5DFC10312  ')).toBe(true);
  });

  it('rejects wrong length, I/O/Q, and empties', () => {
    expect(isLikelyVin('1FTFW1ET5DFC1031')).toBe(false); // 16
    expect(isLikelyVin('1FTFW1ET5DFC103122')).toBe(false); // 18
    expect(isLikelyVin('IFTFW1ET5DFC10312')).toBe(false); // I
    expect(isLikelyVin('OFTFW1ET5DFC10312')).toBe(false); // O
    expect(isLikelyVin('QFTFW1ET5DFC10312')).toBe(false); // Q
    expect(isLikelyVin('')).toBe(false);
    expect(isLikelyVin(null)).toBe(false);
    expect(isLikelyVin(undefined)).toBe(false);
  });
});

describe('normalizeVinValue', () => {
  it('nulls the vPIC empty vocabulary and non-strings', () => {
    expect(normalizeVinValue('')).toBeNull();
    expect(normalizeVinValue('   ')).toBeNull();
    expect(normalizeVinValue('Not Applicable')).toBeNull();
    expect(normalizeVinValue('not applicable')).toBeNull();
    expect(normalizeVinValue(undefined)).toBeNull();
    expect(normalizeVinValue(42)).toBeNull();
  });

  it('trims real values through', () => {
    expect(normalizeVinValue(' FORD ')).toBe('FORD');
  });
});

describe('parseGvwrPounds', () => {
  it('extracts the upper pound bound from a range class label', () => {
    expect(parseGvwrPounds('Class 2E: 6,001 - 7,000 lb (2,722 - 3,175 kg)')).toBe(7000);
    expect(parseGvwrPounds('Class 1D: 5,001 - 6,000 lb (2,268 - 2,722 kg)')).toBe(6000);
  });

  it('handles the open-ended heavy class', () => {
    expect(parseGvwrPounds('Class 8: 33,001 lb and above (14,969 kg and above)')).toBe(33001);
  });

  it('ignores the metric parenthetical entirely', () => {
    // If the kg section leaked into the match the result would be 3175.
    expect(parseGvwrPounds('Class 2E: 6,001 - 7,000 lb (2,722 - 3,175 kg)')).not.toBe(3175);
  });

  it('returns null when there is no pound figure', () => {
    expect(parseGvwrPounds('Not Applicable')).toBeNull();
    expect(parseGvwrPounds('')).toBeNull();
    expect(parseGvwrPounds(null)).toBeNull();
    expect(parseGvwrPounds(undefined)).toBeNull();
  });
});

describe('pickVinFields', () => {
  it('picks and normalizes a realistic vPIC row', () => {
    const row = {
      ModelYear: '2013',
      Make: 'FORD',
      Model: 'F-150',
      BodyClass: 'Pickup',
      VehicleType: 'TRUCK',
      GVWR: 'Class 2E: 6,001 - 7,000 lb (2,722 - 3,175 kg)',
      ErrorCode: '0',
    };
    expect(pickVinFields(row)).toEqual({
      year: 2013,
      make: 'FORD',
      model: 'F-150',
      body_type: 'Pickup',
      vehicle_type: 'TRUCK',
      gvwr: 7000,
    });
  });

  it('nulls empty and Not Applicable fields and bad years', () => {
    const row = {
      ModelYear: '',
      Make: 'Not Applicable',
      Model: '',
      BodyClass: '',
      VehicleType: '',
      GVWR: '',
    };
    const picked = pickVinFields(row);
    expect(picked).toEqual({
      year: null, make: null, model: null, body_type: null, vehicle_type: null, gvwr: null,
    });
    expect(isEmptyDecode(picked)).toBe(true);
  });

  it('rejects nonsense years instead of storing them', () => {
    expect(pickVinFields({ ModelYear: '0' }).year).toBeNull();
    expect(pickVinFields({ ModelYear: 'abc' }).year).toBeNull();
  });

  it('is not an empty decode when any field landed', () => {
    expect(isEmptyDecode(pickVinFields({ Make: 'FORD' }))).toBe(false);
  });
});

describe('pickVinError', () => {
  it('treats a clean row as code 0 with no text', () => {
    expect(pickVinError({ ErrorCode: '0', ErrorText: '0 - VIN decoded clean.' })).toEqual({
      code: '0',
      text: '0 - VIN decoded clean.',
    });
  });

  it('takes the primary code when vPIC packs several', () => {
    expect(pickVinError({ ErrorCode: '6,14', ErrorText: 'Incomplete VIN; unable to verify.' }).code).toBe('6');
  });

  it('defaults a missing or empty code to 0', () => {
    expect(pickVinError({}).code).toBe('0');
    expect(pickVinError({ ErrorCode: '', ErrorText: '' })).toEqual({ code: '0', text: null });
  });
});
