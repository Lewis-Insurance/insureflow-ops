import { describe, expect, it } from 'vitest';
import type { AORenewal } from '@/hooks/useAORenewals';
import {
  analysisMatchesRenewalTerm,
  buildAoRenewalExtractSignalMap,
  deriveAoRenewalEffectiveDate,
  pickThisTermExtractForRenewal,
  type DocumentAnalysisExtractRow,
} from '@/lib/aoRenewalExtractSignal';

const BASE_RENEWAL: AORenewal = {
  id: 'renewal-1',
  account_id: 'account-1',
  customer_name: 'Sample Business LLC',
  policy_number: 'POL-1001',
  policy_type: 'Commercial',
  renewal_date: '2026-06-01',
  current_premium: 1200,
  term_months: 12,
  current_carrier: 'Carrier A',
  status: 'pending',
  priority: 'normal',
  assigned_to: null,
  notes: null,
  custom_data: null,
  losses_3yr: null,
  oldest_in_household: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  last_contact_date: null,
  follow_up_date: null,
  follow_up_reason: null,
  follow_up_task_id: null,
  moved_carrier: null,
  moved_term: null,
  moved_premium: null,
};

function makeAnalysis(
  overrides: Partial<DocumentAnalysisExtractRow> & Pick<DocumentAnalysisExtractRow, 'id'>,
): DocumentAnalysisExtractRow {
  return {
    account_id: 'account-1',
    policy_number: 'POL-1001',
    effective_date: '2025-06-01',
    expiration_date: '2026-06-01',
    processing_status: 'completed',
    analysis_result: {
      schema_version: 1,
      insured_name: 'Sample Business LLC',
      carriers: ['Carrier A'],
      effective_date: '2025-06-01',
      expiration_date: '2026-06-01',
      claims_made: null,
      defense_inside_limits: null,
      premium: { total: 1200, frequency: 'annual' },
      fees: [],
      commission: null,
      coverages: [],
      locations: [],
      vehicles: [],
      drivers: [],
      document_type: 'commercial_quote',
      policy_number: 'POL-1001',
      key_details: [],
    },
    extracted_data: null,
    created_at: '2026-02-01T00:00:00Z',
    ...overrides,
  };
}

describe('aoRenewalExtractSignal', () => {
  it('derives AO effective date from renewal expiration and term', () => {
    expect(deriveAoRenewalEffectiveDate('2026-06-01', 12)).toBe('2025-06-01');
    expect(deriveAoRenewalEffectiveDate('2026-06-01', 6)).toBe('2025-12-01');
  });

  it('matches this-term extract by expiration date', () => {
    const renewal = BASE_RENEWAL;
    const analysis = makeAnalysis({ id: 'analysis-this-term' });

    expect(analysisMatchesRenewalTerm(renewal, analysis)).toBe(true);
    expect(pickThisTermExtractForRenewal(renewal, [analysis])?.id).toBe('analysis-this-term');
  });

  it('matches identity from snapshot when column policy_number is null', () => {
    const renewal = BASE_RENEWAL;
    const analysis = makeAnalysis({
      id: 'analysis-snapshot-policy',
      account_id: null,
      policy_number: null,
    });

    expect(pickThisTermExtractForRenewal(renewal, [analysis])?.id).toBe('analysis-snapshot-policy');
  });

  it('does not count old or other-term extracts', () => {
    const renewal = BASE_RENEWAL;
    const oldTerm = makeAnalysis({
      id: 'analysis-old-term',
      effective_date: '2024-06-01',
      expiration_date: '2025-06-01',
      created_at: '2025-01-01T00:00:00Z',
      analysis_result: {
        ...makeAnalysis({ id: 'tmp' }).analysis_result,
        effective_date: '2024-06-01',
        expiration_date: '2025-06-01',
      },
    });

    expect(pickThisTermExtractForRenewal(renewal, [oldTerm])).toBeNull();
  });

  it('builds signal map for renewals with this-term extract', () => {
    const renewal = BASE_RENEWAL;
    const analysis = makeAnalysis({ id: 'analysis-ready' });
    const signals = buildAoRenewalExtractSignalMap([renewal], [analysis], new Set());

    expect(signals.get('renewal-1')).toEqual({
      analysisId: 'analysis-ready',
      label: 'Extract ready',
    });
  });

  it('returns no signal when no matching extract exists', () => {
    const renewal = BASE_RENEWAL;
    const unrelated = makeAnalysis({
      id: 'analysis-other',
      account_id: 'account-2',
      policy_number: 'POL-9999',
      expiration_date: '2027-06-01',
    });

    const signals = buildAoRenewalExtractSignalMap([renewal], [unrelated], new Set());
    expect(signals.has('renewal-1')).toBe(false);
  });

  it('labels pending proposals as Confirm extract', () => {
    const renewal = BASE_RENEWAL;
    const analysis = makeAnalysis({ id: 'analysis-confirm' });
    const signals = buildAoRenewalExtractSignalMap(
      [renewal],
      [analysis],
      new Set(['analysis-confirm']),
    );

    expect(signals.get('renewal-1')).toEqual({
      analysisId: 'analysis-confirm',
      label: 'Confirm extract',
    });
  });

  it('picks the newest completed snapshot when several match this term', () => {
    const renewal = BASE_RENEWAL;
    const older = makeAnalysis({
      id: 'analysis-older',
      created_at: '2026-01-01T00:00:00Z',
    });
    const newer = makeAnalysis({
      id: 'analysis-newer',
      created_at: '2026-03-01T00:00:00Z',
    });

    const picked = pickThisTermExtractForRenewal(renewal, [older, newer]);
    expect(picked?.id).toBe('analysis-newer');
  });
});
