/**
 * Display formatter tests (src/lib/format.ts)
 */

import { describe, it, expect } from 'vitest';
import { formatPhoneForDisplay } from '@/lib/format';

describe('formatPhoneForDisplay', () => {
  it('formats a bare 10-digit US number with dashes', () => {
    expect(formatPhoneForDisplay('3867550050')).toBe('386-755-0050');
  });

  it('strips a +1 country code', () => {
    expect(formatPhoneForDisplay('+13867550050')).toBe('386-755-0050');
  });

  it('strips a leading 1 country code (11 digits, no plus)', () => {
    expect(formatPhoneForDisplay('13867550050')).toBe('386-755-0050');
  });

  it('normalizes an already-punctuated number', () => {
    expect(formatPhoneForDisplay('(386) 755-0050')).toBe('386-755-0050');
    expect(formatPhoneForDisplay('386.755.0050')).toBe('386-755-0050');
    expect(formatPhoneForDisplay('+1 (386) 755-0050')).toBe('386-755-0050');
  });

  it('is idempotent on an already-formatted number', () => {
    expect(formatPhoneForDisplay('386-755-0050')).toBe('386-755-0050');
  });

  it('preserves a trailing extension', () => {
    expect(formatPhoneForDisplay('+13867550050 x123')).toBe('386-755-0050 x123');
    expect(formatPhoneForDisplay('3867550050 ext. 45')).toBe('386-755-0050 x45');
  });

  it('handles a toll-free number', () => {
    expect(formatPhoneForDisplay('18007275540')).toBe('800-727-5540');
  });

  it('returns an empty string for null / undefined / blank', () => {
    expect(formatPhoneForDisplay(null)).toBe('');
    expect(formatPhoneForDisplay(undefined)).toBe('');
    expect(formatPhoneForDisplay('   ')).toBe('');
  });

  it('leaves a genuinely non-US number untouched rather than mangling it', () => {
    expect(formatPhoneForDisplay('+44 20 7946 0958')).toBe('+44 20 7946 0958');
  });

  it('leaves a too-short / malformed value untouched', () => {
    expect(formatPhoneForDisplay('755-0050')).toBe('755-0050');
    expect(formatPhoneForDisplay('N/A')).toBe('N/A');
  });
});
