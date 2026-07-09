// ============================================
// AO Renewals status/pipeline logic tests
// Workflow is Pending -> Quoted -> Contacted (quote built first, then outreach).
// Guards the corrected status-advance suggestions and stale-reason wording.
// ============================================

import { describe, it, expect } from 'vitest';
import {
  suggestStatusAdvance,
  getAORenewalOperationalMetrics,
  type AORenewal,
  type AORenewalStatus,
} from '@/hooks/useAORenewals';

// Fixed reference point so day math is deterministic.
const NOW = new Date('2026-07-08T12:00:00');

const isoDaysBefore = (days: number) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};
const isoDaysAfter = (days: number) => isoDaysBefore(-days);

const makeRenewal = (overrides: Partial<AORenewal> = {}): AORenewal => ({
  id: 'r1',
  account_id: null,
  customer_name: 'Test Insured',
  policy_number: 'POL-1',
  policy_type: 'Personal Automobile',
  renewal_date: isoDaysAfter(45),
  current_premium: 1500,
  term_months: 12,
  current_carrier: 'Auto-Owners',
  status: 'pending',
  priority: 'normal',
  assigned_to: null,
  notes: null,
  custom_data: null,
  losses_3yr: null,
  oldest_in_household: null,
  created_at: NOW.toISOString(),
  updated_at: NOW.toISOString(),
  last_contact_date: null,
  follow_up_date: null,
  follow_up_reason: null,
  follow_up_task_id: null,
  moved_carrier: null,
  moved_term: null,
  moved_premium: null,
  ...overrides,
});

describe('suggestStatusAdvance (quote-first pipeline)', () => {
  it('advances a pending file to "quoted" when a quote is presented or sent', () => {
    expect(suggestStatusAdvance('quote_presented', 'pending')).toBe('quoted');
    expect(suggestStatusAdvance('quote_sent', 'pending')).toBe('quoted');
  });

  it('advances to "contacted" only after the quote is done (from pending or quoted)', () => {
    expect(suggestStatusAdvance('spoke_with_insured', 'pending')).toBe('contacted');
    expect(suggestStatusAdvance('spoke_with_insured', 'quoted')).toBe('contacted');
  });

  it('never walks a further-along file backwards', () => {
    // A quote logged on an already-contacted file should not drop it back to quoted.
    expect(suggestStatusAdvance('quote_presented', 'contacted')).toBeNull();
    // Speaking with an already-contacted file has no advance to offer.
    expect(suggestStatusAdvance('spoke_with_insured', 'contacted')).toBeNull();
  });

  it('never suggests advancing a terminal file', () => {
    const terminal: AORenewalStatus[] = ['renewed', 'lost', 'cancelled', 'moved'];
    for (const status of terminal) {
      expect(suggestStatusAdvance('quote_sent', status)).toBeNull();
      expect(suggestStatusAdvance('spoke_with_insured', status)).toBeNull();
    }
  });

  it('ignores log types with no pipeline meaning', () => {
    expect(suggestStatusAdvance('voicemail', 'pending')).toBeNull();
    expect(suggestStatusAdvance('other', 'quoted')).toBeNull();
    expect(suggestStatusAdvance(null, 'pending')).toBeNull();
  });
});

describe('getAORenewalOperationalMetrics stale-reason wording', () => {
  it('flags a quoted file that has not been contacted', () => {
    const r = makeRenewal({ status: 'quoted', last_contact_date: isoDaysBefore(4) });
    expect(getAORenewalOperationalMetrics(r, NOW).staleReason).toBe(
      'Quoted 4 days ago, not contacted',
    );
  });

  it('flags a contacted file with no recent movement (does not say "no quote")', () => {
    const r = makeRenewal({ status: 'contacted', last_contact_date: isoDaysBefore(6) });
    const reason = getAORenewalOperationalMetrics(r, NOW).staleReason;
    expect(reason).toBe('No update in 6 days');
    expect(reason).not.toMatch(/quote/i);
  });

  it('stays quiet on a freshly contacted file', () => {
    const r = makeRenewal({ status: 'contacted', last_contact_date: isoDaysBefore(2) });
    expect(getAORenewalOperationalMetrics(r, NOW).staleReason).toBeNull();
  });
});

describe('getAORenewalOperationalMetrics attention drivers', () => {
  it('treats a quoted file inside 5 days of renewal as a critical window (contact now)', () => {
    const r = makeRenewal({ status: 'quoted', renewal_date: isoDaysAfter(3) });
    expect(getAORenewalOperationalMetrics(r, NOW).isCriticalWindow).toBe(true);
  });

  it('marks an overdue scheduled follow-up on an active file', () => {
    const r = makeRenewal({ status: 'contacted', follow_up_date: isoDaysBefore(2) });
    expect(getAORenewalOperationalMetrics(r, NOW).isFollowUpOverdue).toBe(true);
  });
});
