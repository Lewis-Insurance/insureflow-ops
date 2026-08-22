import type { Database } from '@/integrations/supabase/types';
import { lobMatchesPolicyAndQuote } from '@/lib/quoteIncumbent/lineKey';

type PolicyRow = Database['public']['Tables']['policies']['Row'];

export interface IncumbentPolicyCandidate {
  policy: PolicyRow;
  score: number;
  reasons: string[];
}

export interface ProposeIncumbentInput {
  policies: PolicyRow[];
  quoteLineOfBusiness: string;
  /** Hints from extract snapshot or quote context. */
  policyNumberHint?: string | null;
  carrierHint?: string | null;
}

const OPEN_STATUSES = new Set(['active', 'bound', 'pending']);

function normalizePolicyNumber(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, '').toUpperCase();
}

function isOpenPolicy(policy: PolicyRow): boolean {
  const status = (policy.status ?? 'active').toLowerCase();
  return OPEN_STATUSES.has(status);
}

/**
 * Rank incumbent candidates. Returns sorted list; first entry is the suggested default.
 * Never auto-applies policy changes; producer must confirm selection in UI.
 */
export function proposeIncumbentPolicies(input: ProposeIncumbentInput): IncumbentPolicyCandidate[] {
  const { policies, quoteLineOfBusiness, policyNumberHint } = input;
  const hintNumber = normalizePolicyNumber(policyNumberHint);

  const candidates: IncumbentPolicyCandidate[] = [];

  for (const policy of policies) {
    if (!isOpenPolicy(policy)) continue;

    let score = 0;
    const reasons: string[] = [];

    if (lobMatchesPolicyAndQuote(policy.line_of_business, quoteLineOfBusiness)) {
      score += 100;
      reasons.push('Line of business matches the quote');
    } else {
      continue;
    }

    const policyNumber = normalizePolicyNumber(policy.policy_number);
    if (hintNumber && policyNumber && policyNumber === hintNumber) {
      score += 500;
      reasons.unshift('Policy number matches the extract snapshot');
    } else if (hintNumber && policyNumber && policyNumber.includes(hintNumber)) {
      score += 200;
      reasons.push('Policy number partially matches the extract snapshot');
    }

    if (policy.effective_date) {
      score += 10;
      reasons.push('Open policy with effective date on file');
    }

    candidates.push({ policy, score, reasons });
  }

  return candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.policy.effective_date ?? '').localeCompare(a.policy.effective_date ?? '');
  });
}

export function incumbentProposalLabel(candidate: IncumbentPolicyCandidate): string {
  const lob = candidate.policy.line_of_business ?? 'policy';
  const number = candidate.policy.policy_number ?? 'No number';
  const carrier = candidate.policy.carrier ?? 'Unknown carrier';
  return `${lob} · ${number} · ${carrier}`;
}
