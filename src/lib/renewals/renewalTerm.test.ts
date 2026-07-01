import { describe, it, expect } from 'vitest';
import {
  deriveExpiration,
  movedTermToPolicyTerm,
  policyTermToMovedTerm,
  normalizePolicyTerm,
  termLabel,
  mapLostReason,
  renewalDraftSchema,
} from './renewalTerm';

describe('deriveExpiration', () => {
  it('adds one year for annual', () => {
    expect(deriveExpiration('2026-06-03', 'annual')).toBe('2027-06-03');
  });
  it('adds six months for semiannual', () => {
    expect(deriveExpiration('2026-06-03', 'semiannual')).toBe('2026-12-03');
  });
  it('rolls semiannual across a year boundary', () => {
    expect(deriveExpiration('2026-10-15', 'semiannual')).toBe('2027-04-15');
  });
  it('handles a leap-day annual via JS normalization (Feb 29 -> Mar 1)', () => {
    expect(deriveExpiration('2028-02-29', 'annual')).toBe('2029-03-01');
  });
  it('returns null for empty input', () => {
    expect(deriveExpiration('', 'annual')).toBeNull();
    expect(deriveExpiration(null, 'annual')).toBeNull();
  });
  it('seeds new-term effective = prior expiration with no off-by-one (regression)', () => {
    // The hero seeds the new-term effective date as the prior expiration EXACTLY (no +1 day),
    // so an annual renewal expires exactly one year after the prior expiration.
    const priorExpiration = '2026-06-03';
    expect(deriveExpiration(priorExpiration, 'annual')).toBe('2027-06-03');
  });
});

describe('term mapping', () => {
  it('maps moved_term <-> policy_term', () => {
    expect(movedTermToPolicyTerm('6_month')).toBe('semiannual');
    expect(movedTermToPolicyTerm('annual')).toBe('annual');
    expect(policyTermToMovedTerm('semiannual')).toBe('6_month');
    expect(policyTermToMovedTerm('annual')).toBe('annual');
  });
  it('normalizes legacy/stored term values, defaulting to annual', () => {
    expect(normalizePolicyTerm('6_month')).toBe('semiannual');
    expect(normalizePolicyTerm('semiannual')).toBe('semiannual');
    expect(normalizePolicyTerm('annual')).toBe('annual');
    expect(normalizePolicyTerm(null)).toBe('annual');
    expect(normalizePolicyTerm(undefined)).toBe('annual');
  });
  it('labels terms as 6/12 months', () => {
    expect(termLabel('semiannual')).toBe('6 months');
    expect(termLabel('annual')).toBe('12 months');
  });
});

describe('mapLostReason', () => {
  it('maps each category to renewal status, reason column, and policy status', () => {
    expect(mapLostReason('cancelled')).toEqual({
      renewalStatus: 'cancelled', reasonColumn: 'cancelled_reason', policyStatus: 'cancelled',
    });
    expect(mapLostReason('non_renewed')).toEqual({
      renewalStatus: 'non_renewed', reasonColumn: 'non_renewal_reason', policyStatus: 'non_renewed',
    });
    expect(mapLostReason('lost')).toEqual({
      renewalStatus: 'lost', reasonColumn: 'lost_reason', policyStatus: 'lost',
    });
    expect(mapLostReason('lapsed')).toEqual({
      renewalStatus: 'lapsed', reasonColumn: 'lapsed_reason', policyStatus: 'lapsed',
    });
    expect(mapLostReason('other')).toEqual({
      renewalStatus: 'lost', reasonColumn: 'lost_reason', policyStatus: 'cancelled',
    });
  });
});

describe('renewalDraftSchema', () => {
  const valid = {
    policy_number: 'POL-1',
    premium: 1500,
    policy_term: 'annual' as const,
    effective_date: '2026-06-03',
    expiration_date: '2027-06-03',
  };
  it('accepts a valid draft', () => {
    expect(renewalDraftSchema.safeParse(valid).success).toBe(true);
  });
  it('rejects a non-positive premium', () => {
    expect(renewalDraftSchema.safeParse({ ...valid, premium: 0 }).success).toBe(false);
  });
  it('rejects a blank policy number', () => {
    expect(renewalDraftSchema.safeParse({ ...valid, policy_number: '  ' }).success).toBe(false);
  });
  it('rejects expiration not strictly after effective', () => {
    expect(renewalDraftSchema.safeParse({ ...valid, expiration_date: '2026-06-03' }).success).toBe(false);
  });
});
