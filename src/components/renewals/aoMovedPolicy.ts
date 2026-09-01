import type { PolicyFormData } from '@/components/customers/PolicyFormFields';
import type { AORenewal, AORenewalTerm } from '@/hooks/useAORenewals';
import { extractLocalDate } from '@/lib/date/localDate';

/**
 * Shared glue between an AO renewal and the standard Add New Policy modal.
 *
 * Marking an AO renewal "Moved" means the book policy went to another carrier,
 * so the CSR now records the real replacement policy on a CRM customer. Both AO
 * surfaces (the list and the record editor) open the same Add New Policy modal
 * and reuse the helpers below, so the prefill and the write-back stay identical.
 */

/** AO renewals store a term of 6_month / annual; the policy form uses semiannual / annual. */
export function policyTermToAoTerm(policyTerm: string | null | undefined): AORenewalTerm | null {
  if (policyTerm === 'semiannual') return '6_month';
  if (policyTerm === 'annual') return 'annual';
  return null;
}

type AoMovedRenewalInput = Pick<AORenewal, 'policy_type' | 'renewal_date' | 'term_months'>;

/**
 * Seed the policy form from what the AO file already knows. Carrier, policy
 * number, and premium are deliberately left blank: the moved policy is a new
 * policy with a new carrier, so those are the facts the CSR has to supply.
 */
export function buildAoMovedPrefill(renewal: AoMovedRenewalInput): Partial<PolicyFormData> {
  const prefill: Partial<PolicyFormData> = {};

  if (renewal.policy_type) prefill.line_of_business = renewal.policy_type;

  if (renewal.term_months === 6) prefill.policy_term = 'semiannual';
  else if (renewal.term_months === 12) prefill.policy_term = 'annual';

  // The replacement policy starts when the AO policy would have renewed.
  const effectiveDate = extractLocalDate(renewal.renewal_date);
  if (effectiveDate) prefill.effective_date = effectiveDate;

  return prefill;
}

/**
 * The ao_renewals write-back that runs only after the policy row is saved.
 * Also links the AO file to the CRM account it was just matched to, which is
 * what makes the moved renewal reachable from the customer record.
 */
export function buildAoMovedUpdates(form: PolicyFormData, accountId: string) {
  const premium = parseFloat((form.premium || '').replace(/,/g, ''));

  return {
    status: 'moved' as const,
    account_id: accountId,
    moved_carrier: form.carrier.trim(),
    moved_term: policyTermToAoTerm(form.policy_term),
    moved_premium: Number.isFinite(premium) ? premium : null,
    // A terminal status has nothing left to follow up on.
    follow_up_date: null,
    follow_up_reason: null,
  };
}

/**
 * Guard for the status-only path ("Only change status"), used when the
 * replacement policy is already on the CRM customer so there is nothing to
 * insert. It checks exactly what `buildAoMovedUpdates` has to write: the
 * carrier the policy moved to. The account link is enforced by the modal's own
 * customer picker. Returns an error message, or null when the write can run.
 */
export function validateAoMovedStatusOnly(form: PolicyFormData): string | null {
  if (!form.carrier?.trim()) {
    return 'Enter the carrier this policy moved to before changing the status.';
  }
  return null;
}
