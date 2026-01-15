import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseISO, format } from 'date-fns';
import {
  calcExpirationDate,
  isValidPolicyTerm,
  parsePolicyTerm,
  VALID_POLICY_TERMS,
  PolicyTerm,
} from '@/lib/policyDates';

// Helper to avoid timezone issues - use parseISO and format for consistent results
const formatDate = (date: Date) => format(date, 'yyyy-MM-dd');

describe('calcExpirationDate', () => {
  it('semiannual: 01/10/2026 -> 07/10/2026', () => {
    const effective = parseISO('2026-01-10');
    const result = calcExpirationDate(effective, 'semiannual');
    expect(formatDate(result)).toBe('2026-07-10');
  });

  it('annual: 01/10/2026 -> 01/10/2027', () => {
    const effective = parseISO('2026-01-10');
    const result = calcExpirationDate(effective, 'annual');
    expect(formatDate(result)).toBe('2027-01-10');
  });

  it('handles month boundary: Jan 31 + 6 months -> Jul 31', () => {
    const effective = parseISO('2026-01-31');
    const result = calcExpirationDate(effective, 'semiannual');
    // date-fns addMonths handles this correctly (clamps to last day of month)
    expect(formatDate(result)).toBe('2026-07-31');
  });

  it('quarterly: 01/10/2026 -> 04/10/2026', () => {
    const effective = parseISO('2026-01-10');
    const result = calcExpirationDate(effective, 'quarterly');
    expect(formatDate(result)).toBe('2026-04-10');
  });

  it('monthly: 01/10/2026 -> 02/10/2026', () => {
    const effective = parseISO('2026-01-10');
    const result = calcExpirationDate(effective, 'monthly');
    expect(formatDate(result)).toBe('2026-02-10');
  });

  it('handles Feb 29 (leap year) + 6 months -> Aug 29', () => {
    const effective = parseISO('2024-02-29'); // 2024 is a leap year
    const result = calcExpirationDate(effective, 'semiannual');
    expect(formatDate(result)).toBe('2024-08-29');
  });

  it('handles Feb 28 (non-leap year) + 12 months -> Feb 28', () => {
    const effective = parseISO('2025-02-28');
    const result = calcExpirationDate(effective, 'annual');
    expect(formatDate(result)).toBe('2026-02-28');
  });

  it('handles end of month: Mar 31 + 1 month -> Apr 30 (not May 1)', () => {
    const effective = parseISO('2026-03-31');
    const result = calcExpirationDate(effective, 'monthly');
    expect(formatDate(result)).toBe('2026-04-30');
  });
});

describe('isValidPolicyTerm', () => {
  it('returns true for valid terms', () => {
    expect(isValidPolicyTerm('annual')).toBe(true);
    expect(isValidPolicyTerm('semiannual')).toBe(true);
    expect(isValidPolicyTerm('quarterly')).toBe(true);
    expect(isValidPolicyTerm('monthly')).toBe(true);
  });

  it('returns false for invalid terms', () => {
    expect(isValidPolicyTerm('yearly')).toBe(false);
    expect(isValidPolicyTerm('6month')).toBe(false);
    expect(isValidPolicyTerm('')).toBe(false);
    expect(isValidPolicyTerm('ANNUAL')).toBe(false); // case sensitive
  });
});

describe('parsePolicyTerm', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('returns valid terms unchanged', () => {
    expect(parsePolicyTerm('annual')).toBe('annual');
    expect(parsePolicyTerm('semiannual')).toBe('semiannual');
    expect(parsePolicyTerm('quarterly')).toBe('quarterly');
    expect(parsePolicyTerm('monthly')).toBe('monthly');
  });

  it('normalizes case', () => {
    expect(parsePolicyTerm('ANNUAL')).toBe('annual');
    expect(parsePolicyTerm('SemiAnnual')).toBe('semiannual');
  });

  it('handles common variations', () => {
    expect(parsePolicyTerm('6month')).toBe('semiannual');
    expect(parsePolicyTerm('6-month')).toBe('semiannual');
    expect(parsePolicyTerm('semi-annual')).toBe('semiannual');
    expect(parsePolicyTerm('yearly')).toBe('annual');
  });

  it('returns default for null/undefined', () => {
    expect(parsePolicyTerm(null)).toBe('annual');
    expect(parsePolicyTerm(undefined)).toBe('annual');
  });

  it('returns default for invalid terms and logs warning', () => {
    expect(parsePolicyTerm('invalid')).toBe('annual');
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Invalid policy term')
    );
  });

  it('uses custom default when provided', () => {
    expect(parsePolicyTerm('invalid', 'monthly')).toBe('monthly');
  });
});

describe('VALID_POLICY_TERMS', () => {
  it('contains all expected terms', () => {
    expect(VALID_POLICY_TERMS).toEqual(['annual', 'semiannual', 'quarterly', 'monthly']);
  });
});
