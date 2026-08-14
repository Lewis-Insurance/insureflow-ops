import { describe, it, expect } from 'vitest';
import { parseCohortFromUrl, parseScopeFromUrl } from '@/hooks/useTriageCohortFromUrl';

const POLICY_COHORTS = [
  'all',
  'expiring_30d',
  'lapsed',
  'no_renewal_date',
  'recently_bound',
] as const;

describe('parseCohortFromUrl', () => {
  it('returns the cohort when the value is in validCohorts', () => {
    expect(parseCohortFromUrl('expiring_30d', POLICY_COHORTS, 'all')).toBe('expiring_30d');
    expect(parseCohortFromUrl('lapsed', POLICY_COHORTS, 'all')).toBe('lapsed');
  });

  it('returns defaultCohort when the value is not in validCohorts', () => {
    expect(parseCohortFromUrl('bogus', POLICY_COHORTS, 'all')).toBe('all');
    expect(parseCohortFromUrl('overdue', POLICY_COHORTS, 'all')).toBe('all');
  });

  it('returns defaultCohort when the value is null', () => {
    expect(parseCohortFromUrl(null, POLICY_COHORTS, 'all')).toBe('all');
  });

  it('accepts each page cohort enum value', () => {
    const taskCohorts = ['all', 'overdue', 'due_this_week', 'high_priority', 'completed'] as const;
    expect(parseCohortFromUrl('overdue', taskCohorts, 'all')).toBe('overdue');

    const leadCohorts = ['all', 'new', 'hot', 'qualified', 'quoted'] as const;
    expect(parseCohortFromUrl('new', leadCohorts, 'all')).toBe('new');

    const customerCohorts = [
      'all',
      'renewals_30d',
      'overdue',
      'no_active_policy',
      'new_30d',
    ] as const;
    expect(parseCohortFromUrl('renewals_30d', customerCohorts, 'all')).toBe('renewals_30d');
  });
});

describe('parseScopeFromUrl', () => {
  it('returns mine when scope=mine', () => {
    expect(parseScopeFromUrl('mine')).toBe('mine');
  });

  it('returns unclaimed when scope=unclaimed', () => {
    expect(parseScopeFromUrl('unclaimed')).toBe('unclaimed');
  });

  it('returns office when scope=office', () => {
    expect(parseScopeFromUrl('office')).toBe('office');
  });

  it('returns undefined for other or null values', () => {
    expect(parseScopeFromUrl(null)).toBeUndefined();
    expect(parseScopeFromUrl('all')).toBeUndefined();
    expect(parseScopeFromUrl('')).toBeUndefined();
  });
});
