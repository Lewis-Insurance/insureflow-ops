import { z } from 'zod';
import { extractLocalDate } from '@/lib/date/localDate';

/**
 * Renewals term helpers — single source of truth for the policy-term vocabulary,
 * 6/12-month labels, the moved_term <-> policy_term mapping, and noon-anchored
 * expiration derivation. Pure functions only (unit-tested in renewalTerm.test.ts).
 */

// policies.policy_term domain (CHECK: 'semiannual' | 'annual').
export type PolicyTerm = 'semiannual' | 'annual';
// renewals.moved_term domain (CHECK: '6_month' | 'annual').
export type MovedTerm = '6_month' | 'annual';

export const POLICY_TERM_OPTIONS: { value: PolicyTerm; label: string }[] = [
  { value: 'semiannual', label: '6 months' },
  { value: 'annual', label: '12 months' },
];

/** Human label for a term ("6 months" / "12 months"). */
export function termLabel(term: PolicyTerm | null | undefined): string {
  return term === 'semiannual' ? '6 months' : '12 months';
}

/** Normalize any stored/legacy term value to a PolicyTerm, defaulting to 'annual'. */
export function normalizePolicyTerm(term: string | null | undefined): PolicyTerm {
  if (term === 'semiannual' || term === '6_month' || term === 'semi_annual') return 'semiannual';
  return 'annual';
}

/**
 * Map a stored renewal status to a StatusPill vocabulary key. The working/open states
 * (upcoming/in_progress/contacted) all read as "Pending"; everything else passes through
 * to the shared status vocabulary (quoted, moved, lost, cancelled, non_renewed, lapsed).
 */
export function renewalPillStatus(status: string | null | undefined): string {
  if (status === 'upcoming' || status === 'in_progress' || status === 'contacted') return 'pending';
  return status || 'pending';
}

/** renewals.moved_term ('6_month'|'annual') -> policies.policy_term ('semiannual'|'annual'). */
export function movedTermToPolicyTerm(t: MovedTerm | null | undefined): PolicyTerm {
  return t === '6_month' ? 'semiannual' : 'annual';
}

/** policies.policy_term ('semiannual'|'annual') -> renewals.moved_term ('6_month'|'annual'). */
export function policyTermToMovedTerm(t: PolicyTerm | null | undefined): MovedTerm {
  return t === 'semiannual' ? '6_month' : 'annual';
}

/**
 * Derive the new-term expiration date from an effective date + term, noon-anchored.
 * 'annual' = +1 year, 'semiannual' = +6 months. Returns YYYY-MM-DD (or null if input is empty).
 *
 * Month-end/leap-day deltas follow JS Date normalization (e.g. Feb 29 + 1yr -> Mar 1),
 * which is acceptable for term derivation and editable in the UI for off-cycle corrections.
 */
export function deriveExpiration(
  effectiveIso: string | null | undefined,
  term: PolicyTerm,
): string | null {
  const iso = extractLocalDate(effectiveIso);
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  // Component math in UTC so derivation is timezone-independent (no runtime/ET skew).
  const base = new Date(Date.UTC(y, m - 1, d));
  if (term === 'semiannual') {
    base.setUTCMonth(base.getUTCMonth() + 6);
  } else {
    base.setUTCFullYear(base.getUTCFullYear() + 1);
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(base.getUTCDate())}`;
}

/**
 * Validation schema for the hero "Update Renewal" draft + commit. Premium is a number
 * (already coerced from the input). Expiration must be strictly after effective.
 */
export const renewalDraftSchema = z
  .object({
    policy_number: z.string().trim().min(1, 'Policy number is required'),
    premium: z
      .number({ invalid_type_error: 'Premium is required' })
      .positive('Premium must be greater than 0'),
    policy_term: z.enum(['semiannual', 'annual']),
    effective_date: z.string().min(1, 'Effective date is required'),
    expiration_date: z.string().min(1, 'Expiration date is required'),
  })
  .refine(
    (v) => {
      const eff = extractLocalDate(v.effective_date);
      const exp = extractLocalDate(v.expiration_date);
      // YYYY-MM-DD strings compare lexicographically in date order.
      return !!eff && !!exp && exp > eff;
    },
    { message: 'Expiration must be after the effective date', path: ['expiration_date'] },
  );

export type RenewalDraft = z.infer<typeof renewalDraftSchema>;

/** Reason categories for the "Lost / Did Not Renew" terminal outcome. */
export type LostReasonCategory = 'cancelled' | 'non_renewed' | 'lost' | 'lapsed' | 'other';

export const LOST_REASON_OPTIONS: { value: LostReasonCategory; label: string }[] = [
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'non_renewed', label: 'Non-Renewed' },
  { value: 'lost', label: 'Lost to Competitor' },
  { value: 'lapsed', label: 'Lapsed (non-pay)' },
  { value: 'other', label: 'Other' },
];

/**
 * Map a Lost reason category to the renewal status, the renewal reason column, and the
 * policy status it writes through. 'other' buckets into 'lost' with a neutral cancelled policy.
 */
export function mapLostReason(category: LostReasonCategory): {
  renewalStatus: 'cancelled' | 'non_renewed' | 'lost' | 'lapsed';
  reasonColumn: 'cancelled_reason' | 'non_renewal_reason' | 'lost_reason' | 'lapsed_reason';
  policyStatus: 'cancelled' | 'non_renewed' | 'lost' | 'lapsed';
} {
  switch (category) {
    case 'cancelled':
      return { renewalStatus: 'cancelled', reasonColumn: 'cancelled_reason', policyStatus: 'cancelled' };
    case 'non_renewed':
      return { renewalStatus: 'non_renewed', reasonColumn: 'non_renewal_reason', policyStatus: 'non_renewed' };
    case 'lapsed':
      return { renewalStatus: 'lapsed', reasonColumn: 'lapsed_reason', policyStatus: 'lapsed' };
    case 'lost':
    case 'other':
    default:
      return { renewalStatus: 'lost', reasonColumn: 'lost_reason', policyStatus: category === 'other' ? 'cancelled' : 'lost' };
  }
}
