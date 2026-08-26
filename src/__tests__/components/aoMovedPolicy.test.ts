// Unit tests for the AO Moved glue: what seeds the Add New Policy form, and
// what gets written back to ao_renewals once the policy is saved.

import { describe, it, expect } from 'vitest';
import {
  buildAoMovedPrefill,
  buildAoMovedUpdates,
  policyTermToAoTerm,
} from '@/components/renewals/aoMovedPolicy';
import { initialPolicyFormData, type PolicyFormData } from '@/components/customers/PolicyFormFields';

describe('policyTermToAoTerm', () => {
  it('maps the policy form terms onto the AO term values', () => {
    expect(policyTermToAoTerm('semiannual')).toBe('6_month');
    expect(policyTermToAoTerm('annual')).toBe('annual');
  });

  it('returns null for anything it does not recognise', () => {
    expect(policyTermToAoTerm('')).toBeNull();
    expect(policyTermToAoTerm(null)).toBeNull();
    expect(policyTermToAoTerm('quarterly')).toBeNull();
  });
});

describe('buildAoMovedPrefill', () => {
  it('seeds line of business, term, and the renewal date as the effective date', () => {
    expect(
      buildAoMovedPrefill({
        policy_type: 'Personal Automobile',
        renewal_date: '2026-09-01',
        term_months: 6,
      }),
    ).toEqual({
      line_of_business: 'Personal Automobile',
      policy_term: 'semiannual',
      effective_date: '2026-09-01',
    });
  });

  it('takes the date part of a timestamp so the effective date does not shift a day', () => {
    const prefill = buildAoMovedPrefill({
      policy_type: 'Homeowners',
      renewal_date: '2026-01-15T00:00:00+00:00',
      term_months: 12,
    });
    expect(prefill.effective_date).toBe('2026-01-15');
    expect(prefill.policy_term).toBe('annual');
  });

  it('leaves out anything the renewal does not know', () => {
    expect(buildAoMovedPrefill({ policy_type: '', renewal_date: '', term_months: null })).toEqual({});
  });

  it('never seeds carrier, policy number, or premium, because those belong to the new policy', () => {
    const prefill = buildAoMovedPrefill({
      policy_type: 'Personal Automobile',
      renewal_date: '2026-09-01',
      term_months: 12,
    });
    expect(prefill.carrier).toBeUndefined();
    expect(prefill.policy_number).toBeUndefined();
    expect(prefill.premium).toBeUndefined();
  });
});

describe('buildAoMovedUpdates', () => {
  const form = (overrides: Partial<PolicyFormData> = {}): PolicyFormData => ({
    ...initialPolicyFormData,
    policy_number: 'POL-9001',
    carrier: '  Progressive  ',
    line_of_business: 'Personal Auto',
    premium: '1,234.56',
    policy_term: 'annual',
    ...overrides,
  });

  it('marks the renewal moved, links the account, and carries the new policy details', () => {
    expect(buildAoMovedUpdates(form(), 'acct-1')).toEqual({
      status: 'moved',
      account_id: 'acct-1',
      moved_carrier: 'Progressive',
      moved_term: 'annual',
      moved_premium: 1234.56,
      follow_up_date: null,
      follow_up_reason: null,
    });
  });

  it('stores a null premium rather than NaN when the field is blank', () => {
    expect(buildAoMovedUpdates(form({ premium: '' }), 'acct-1').moved_premium).toBeNull();
  });

  it('clears the follow-up, because moved is a terminal status', () => {
    const updates = buildAoMovedUpdates(form(), 'acct-1');
    expect(updates.follow_up_date).toBeNull();
    expect(updates.follow_up_reason).toBeNull();
  });
});
