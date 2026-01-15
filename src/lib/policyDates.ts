import { addMonths, addYears } from 'date-fns';

/**
 * Valid policy term values
 */
export type PolicyTerm = 'annual' | 'semiannual' | 'quarterly' | 'monthly';

/**
 * Valid policy terms for validation
 */
export const VALID_POLICY_TERMS: PolicyTerm[] = ['annual', 'semiannual', 'quarterly', 'monthly'];

/**
 * Calculate the expiration date based on the effective date and policy term.
 * Uses date-fns which correctly handles month boundary edge cases.
 *
 * @param effective - The policy effective date
 * @param term - The policy term (annual, semiannual, quarterly, monthly)
 * @returns The calculated expiration date
 *
 * @example
 * // Semiannual: 6 months
 * calcExpirationDate(new Date('2026-01-10'), 'semiannual') // => 2026-07-10
 *
 * // Annual: 1 year
 * calcExpirationDate(new Date('2026-01-10'), 'annual') // => 2027-01-10
 *
 * // Handles month boundaries correctly
 * calcExpirationDate(new Date('2026-01-31'), 'semiannual') // => 2026-07-31
 */
export function calcExpirationDate(effective: Date, term: PolicyTerm): Date {
  switch (term) {
    case 'semiannual':
      return addMonths(effective, 6);
    case 'quarterly':
      return addMonths(effective, 3);
    case 'monthly':
      return addMonths(effective, 1);
    case 'annual':
    default:
      return addYears(effective, 1);
  }
}

/**
 * Validate that a term value is a valid PolicyTerm
 *
 * @param term - The term to validate
 * @returns true if valid, false otherwise
 */
export function isValidPolicyTerm(term: string): term is PolicyTerm {
  return VALID_POLICY_TERMS.includes(term as PolicyTerm);
}

/**
 * Parse and validate a policy term, returning a default if invalid
 *
 * @param term - The term to parse
 * @param defaultTerm - The default term to use if invalid (defaults to 'annual')
 * @returns A valid PolicyTerm
 */
export function parsePolicyTerm(term: string | null | undefined, defaultTerm: PolicyTerm = 'annual'): PolicyTerm {
  if (!term) return defaultTerm;

  const normalized = term.toLowerCase().trim();

  if (isValidPolicyTerm(normalized)) {
    return normalized;
  }

  // Handle common variations
  const variations: Record<string, PolicyTerm> = {
    '6month': 'semiannual',
    '6-month': 'semiannual',
    'semi-annual': 'semiannual',
    '3month': 'quarterly',
    '3-month': 'quarterly',
    '1month': 'monthly',
    '1-month': 'monthly',
    '12month': 'annual',
    '12-month': 'annual',
    'yearly': 'annual',
  };

  if (variations[normalized]) {
    return variations[normalized];
  }

  console.warn(`Invalid policy term: "${term}", defaulting to "${defaultTerm}"`);
  return defaultTerm;
}
