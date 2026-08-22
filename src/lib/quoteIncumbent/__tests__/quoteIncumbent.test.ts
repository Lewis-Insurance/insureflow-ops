import { describe, it, expect } from 'vitest';
import type { Database } from '@/integrations/supabase/types';
import type { QuoteCoverage } from '@/hooks/useRankedQuotes';
import {
  buildPolicyStructuredSnapshot,
  buildQuoteStructuredSnapshot,
} from '@/lib/quoteIncumbent/buildStructuredSnapshot';
import { diffQuoteIncumbentSnapshots } from '@/lib/quoteIncumbent/diffQuoteIncumbent';
import { proposeIncumbentPolicies } from '@/lib/quoteIncumbent/proposeIncumbentPolicy';

type PolicyRow = Database['public']['Tables']['policies']['Row'];

const incumbentPolicyFixture: PolicyRow = {
  id: 'policy-incumbent-1',
  account_id: 'acct-fixture',
  policy_number: 'COM-2026-0042',
  carrier: 'Hartford',
  carrier_id: null,
  carrier_naic: null,
  line_of_business: 'gl',
  line_category: 'commercial',
  line_canonical: 'General Liability',
  premium: 22000,
  effective_date: '2025-03-01',
  expiration_date: '2026-03-01',
  status: 'active',
  named_insured: 'Acme Manufacturing LLC',
  cgl_details: {
    limits: {
      each_occurrence: 2000000,
      general_aggregate: 2000000,
      products_completed_ops_aggregate: 2000000,
    },
    coverage_options: {
      policy_form: 'occurrence',
      defense_costs: 'outside_limits',
    },
  },
  bap_details: null,
  wc_details: null,
  property_details: null,
  umbrella_details: null,
  coverage: null,
  billing_frequency: 'annual',
  billing_method: null,
  cancellation_reason: null,
  cancelled_at: null,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  created_by: null,
  custom: null,
  dba: null,
  deleted_at: null,
  extracted_from_document_id: null,
  extraction_confidence: null,
  extraction_source: null,
  fein: null,
  import_batch_id: null,
  insured_items: null,
  insured_user_id: null,
  issue_date: null,
  line_of_business_id: null,
  mga_id: null,
  payment_type: null,
  policy_term: null,
  cgl_field_evidence: null,
  bap_field_evidence: null,
  property_field_evidence: null,
  umbrella_field_evidence: null,
  wc_field_evidence: null,
};

const quoteCoveragesFixture: QuoteCoverage[] = [
  {
    id: 'cov-1',
    coverage_type: 'general_liability',
    limit_amount: '$1,000,000',
    deductible_amount: '$1,000',
    premium_amount: 18000,
    is_included: true,
    extracted_from_document: true,
  },
  {
    id: 'cov-2',
    coverage_type: 'products_completed_ops',
    limit_amount: 'Included in parent',
    deductible_amount: null,
    premium_amount: null,
    is_included: true,
    extracted_from_document: true,
  },
];

describe('quoteIncumbent proposeIncumbentPolicies', () => {
  it('ranks LOB match and policy number hint highest', () => {
    const otherLob: PolicyRow = {
      ...incumbentPolicyFixture,
      id: 'policy-auto',
      line_of_business: 'commercial_auto',
      policy_number: 'AUTO-999',
    };
    const wrongNumber: PolicyRow = {
      ...incumbentPolicyFixture,
      id: 'policy-wrong-num',
      policy_number: 'COM-2025-0001',
    };

    const ranked = proposeIncumbentPolicies({
      policies: [otherLob, wrongNumber, incumbentPolicyFixture],
      quoteLineOfBusiness: 'gl',
      policyNumberHint: 'COM-2026-0042',
    });

    expect(ranked[0]?.policy.id).toBe('policy-incumbent-1');
    expect(ranked.some((c) => c.policy.id === 'policy-auto')).toBe(false);
  });

  it('does not include inactive policies', () => {
    const cancelled: PolicyRow = {
      ...incumbentPolicyFixture,
      id: 'policy-cancelled',
      status: 'cancelled',
    };
    const ranked = proposeIncumbentPolicies({
      policies: [cancelled],
      quoteLineOfBusiness: 'gl',
    });
    expect(ranked).toHaveLength(0);
  });

  it('does not boost quote carrier when ranking incumbent candidates', () => {
    const trueIncumbent: PolicyRow = {
      ...incumbentPolicyFixture,
      id: 'policy-true-incumbent',
      carrier: 'Hartford',
      effective_date: '2025-06-01',
    };
    const sameCarrierPolicy: PolicyRow = {
      ...incumbentPolicyFixture,
      id: 'policy-same-carrier',
      carrier: 'Travelers',
      effective_date: '2024-01-01',
    };

    const ranked = proposeIncumbentPolicies({
      policies: [sameCarrierPolicy, trueIncumbent],
      quoteLineOfBusiness: 'gl',
      carrierHint: 'Travelers',
    });

    expect(ranked[0]?.policy.id).toBe('policy-true-incumbent');
    expect(ranked.find((c) => c.policy.id === 'policy-same-carrier')?.reasons).not.toContain(
      'Carrier aligns with extracted carrier',
    );
  });

  it('excludes policies with unmapped line of business', () => {
    const cyberPolicy: PolicyRow = {
      ...incumbentPolicyFixture,
      id: 'policy-cyber',
      line_of_business: 'cyber',
    };
    const ranked = proposeIncumbentPolicies({
      policies: [cyberPolicy],
      quoteLineOfBusiness: 'cyber',
    });
    expect(ranked).toHaveLength(0);
  });
});

describe('quoteIncumbent diff engine', () => {
  it('fixture: limit drop, fee added, coverage included-in-parent', () => {
    const incumbentSnapshot = buildPolicyStructuredSnapshot(incumbentPolicyFixture);
    const quoteSnapshot = buildQuoteStructuredSnapshot({
      id: 'quote-new-1',
      line_of_business: 'gl',
      premium: 19250,
      quote_ref: 'extract-COM-2026-0042-travelers',
      effective_date: '2026-03-01',
      expiration_date: '2027-03-01',
      carrier_name: 'Travelers',
      options: {
        carrier_name: 'Travelers',
        effective_date: '2026-03-01',
        premium_frequency: 'annual',
        fees: [{ type: 'surplus_lines', amount: 1250.5, label: 'Surplus lines tax' }],
        commission_pct: 12.5,
      },
      coverages: quoteCoveragesFixture,
      claims_made: true,
      defense_inside_limits: false,
    });

    const { materialDifferences } = diffQuoteIncumbentSnapshots(incumbentSnapshot, quoteSnapshot);

    const limitDrop = materialDifferences.find((d) => d.fieldPath === 'EachOccurrence');
    expect(limitDrop).toBeDefined();
    expect(limitDrop?.changeType).toBe('decreased');

    const feeAdded = materialDifferences.find((d) => d.fieldPath === 'fee_surplus_lines');
    expect(feeAdded).toBeDefined();
    expect(feeAdded?.changeType).toBe('added');

    const includedParent = materialDifferences.find((d) => d.fieldPath === 'ProductsCompletedOps');
    expect(includedParent).toBeDefined();
    expect(includedParent?.rightValueDisplay).toMatch(/included in parent/i);

    const claimsMade = materialDifferences.find((d) => d.fieldPath === 'ClaimsMade');
    expect(claimsMade).toBeDefined();
    expect(claimsMade?.changeType).toBe('modified');

    const premiumDrop = materialDifferences.find((d) => d.fieldPath === 'TotalPremium');
    expect(premiumDrop).toBeDefined();
    expect(premiumDrop?.changeType).toBe('decreased');
  });

  it('is deterministic across repeated runs', () => {
    const incumbentSnapshot = buildPolicyStructuredSnapshot(incumbentPolicyFixture);
    const quoteSnapshot = buildQuoteStructuredSnapshot({
      id: 'quote-new-1',
      line_of_business: 'gl',
      premium: 19250,
      coverages: quoteCoveragesFixture,
      options: { fees: [{ type: 'broker', amount: 500 }] },
    });

    const first = diffQuoteIncumbentSnapshots(incumbentSnapshot, quoteSnapshot);
    const second = diffQuoteIncumbentSnapshots(incumbentSnapshot, quoteSnapshot);

    expect(first.materialDifferences.map((d) => d.fieldPath)).toEqual(
      second.materialDifferences.map((d) => d.fieldPath),
    );
  });
});
