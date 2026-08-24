import { describe, expect, it } from 'vitest';
import type { AORenewal } from '@/hooks/useAORenewals';
import { buildAoRenewalExtractSignal, type DocumentAnalysisExtractRow } from '@/lib/aoRenewalExtractSignal';
import {
  buildAoRenewalEvidence,
  deriveCurrentDecEvidence,
  deriveLastTouchEvidence,
  isDecDocument,
  pickNextHole,
  type AoRenewalEvidence,
  type AoRenewalEvidenceDocumentRow,
} from '@/lib/aoRenewalEvidence';

const renewal: AORenewal = {
  id: 'renewal-1', account_id: 'account-1', customer_name: 'Sample', policy_number: 'P-1',
  policy_type: 'bop', renewal_date: '2026-06-01', current_premium: 1000, term_months: 12,
  current_carrier: 'Carrier', status: 'pending', priority: 'normal', assigned_to: null,
  notes: null, custom_data: null, losses_3yr: null, oldest_in_household: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  last_contact_date: '2026-05-29T12:00:00Z', follow_up_date: null, follow_up_reason: null,
  follow_up_task_id: null, moved_carrier: null, moved_term: null, moved_premium: null,
};

const baseEvidence: Omit<AoRenewalEvidence, 'nextHole'> = {
  renewalId: 'renewal-1', accountId: 'account-1', dec: { state: 'on_file', newestAt: '2026-05-01' },
  extract: { analysisId: 'analysis-1', label: 'Extract ready' }, openQuoteCount: 1,
  items: { missingCount: 0, inReviewCount: 0, totalCount: 2, allRequiredComplete: true },
  touch: { state: 'recent', lastTouchAt: '2026-05-29', daysAgo: 3 },
};

function doc(overrides: Partial<AoRenewalEvidenceDocumentRow> = {}): AoRenewalEvidenceDocumentRow {
  return { id: 'doc-1', account_id: 'account-1', policy_id: null, document_type: null,
    category: null, kind: null, filename: 'file.pdf', uploaded_at: '2025-04-02T00:00:00Z',
    created_at: '2025-04-01T00:00:00Z', ...overrides };
}

describe('pickNextHole', () => {
  const cases: Array<[AoRenewalEvidence['nextHole']['kind'], Partial<typeof baseEvidence>]> = [
    ['confirm_extract', { extract: { analysisId: 'pending', label: 'Confirm extract' } }],
    ['get_dec', { dec: { state: 'none', newestAt: null }, items: null }],
    ['open_checklist', { items: { missingCount: 2, inReviewCount: 0, totalCount: 3, allRequiredComplete: false } }],
    ['analyze_dec', { extract: null }],
    ['start_quote', { openQuoteCount: 0 }],
    ['log_contact', { touch: { state: 'stale', lastTouchAt: '2026-05-01', daysAgo: 31 } }],
    ['ready', {}],
  ];

  it.each(cases)('returns %s at the appropriate pipeline stage', (kind, overrides) => {
    expect(pickNextHole({ ...baseEvidence, ...overrides }).kind).toBe(kind);
  });

  it('honors pipeline tie order', () => {
    const result = pickNextHole({ ...baseEvidence, extract: { analysisId: 'a', label: 'Confirm extract' },
      dec: { state: 'none', newestAt: null }, items: null, openQuoteCount: 0,
      touch: { state: 'never', lastTouchAt: null, daysAgo: null } });
    expect(result.kind).toBe('confirm_extract');
  });

  it('degrades unlinked renewals to holes 1, 4, and 6 only', () => {
    const unlinked = { ...baseEvidence, accountId: null, dec: { state: 'none' as const, newestAt: null },
      extract: null, openQuoteCount: 0, items: null, touch: { state: 'never' as const, lastTouchAt: null, daysAgo: null } };
    expect(pickNextHole(unlinked).kind).toBe('log_contact');
    expect(pickNextHole({ ...unlinked, dec: { state: 'on_file', newestAt: '2026-01-01' } }).kind).toBe('analyze_dec');
    expect(pickNextHole({ ...unlinked, extract: { analysisId: 'a', label: 'Confirm extract' } }).kind).toBe('confirm_extract');
  });
});

describe('current dec derivation', () => {
  it.each([
    ['document_type', { document_type: 'dec_page' }],
    ['category', { category: 'dec_page' }],
    ['kind dec_page', { kind: 'dec_page' }],
    ['kind CURRENT_DEC', { kind: 'CURRENT_DEC' }],
  ])('recognizes the %s vocabulary', (_label, override) => expect(isDecDocument(doc(override))).toBe(true));

  it('uses classification metadata from the actual #142 signal to prove a current dec', () => {
    const analysis: DocumentAnalysisExtractRow = {
      id: 'analysis-dec', account_id: 'account-1', policy_number: 'P-1', effective_date: '2025-06-01',
      expiration_date: '2026-06-01', processing_status: 'completed', extracted_data: null,
      analysis_result: { document_type: 'dec_page' }, created_at: '2026-01-01T00:00:00Z',
    };
    const signal = buildAoRenewalExtractSignal(renewal, analysis, new Set());
    expect(signal.documentType).toBe('dec_page');
    expect(signal).toEqual({ analysisId: 'analysis-dec', label: 'Extract ready' });
    expect(Object.keys(signal)).toEqual(['analysisId', 'label']);
    expect(deriveCurrentDecEvidence(renewal, [], signal)).toEqual({ state: 'on_file', newestAt: null });
  });

  it.each([
    [12, '2025-04-02T00:00:00Z', 'on_file'],
    [12, '2025-04-01T00:00:00Z', 'none'],
    [6, '2025-10-03T00:00:00Z', 'on_file'],
    [6, '2025-10-01T00:00:00Z', 'none'],
  ] as const)('applies the 60-day window for a %i-month term', (term, uploadedAt, state) => {
    expect(deriveCurrentDecEvidence({ ...renewal, term_months: term }, [doc({ document_type: 'dec_page', uploaded_at: uploadedAt })]).state).toBe(state);
  });
});

describe('quotes, items, and touches', () => {
  it('matches BOP to GL and home to property quotes', () => {
    const quotes = [
      { id: 'q1', account_id: 'account-1', line_of_business: 'gl', premium: 1, created_at: null },
      { id: 'q2', account_id: 'account-1', line_of_business: 'property', premium: 1, created_at: null },
    ];
    expect(buildAoRenewalEvidence({ renewal, documents: [], quotes, fallbackQuotes: [], rollup: null, today: '2026-06-01' }).openQuoteCount).toBe(1);
    expect(buildAoRenewalEvidence({ renewal: { ...renewal, policy_type: 'home' }, documents: [], quotes, fallbackQuotes: [], rollup: null, today: '2026-06-01' }).openQuoteCount).toBe(1);
  });

  it('counts AO quotes for both linked and unlinked renewals', () => {
    const fallbackQuotes = [{ id: 'ao-1', renewal_id: 'renewal-1', status: 'quoted' }, { id: 'ao-2', renewal_id: 'renewal-1', status: 'selected' }];
    expect(buildAoRenewalEvidence({ renewal: { ...renewal, account_id: null }, documents: [], quotes: [], fallbackQuotes, rollup: null, today: '2026-06-01' }).openQuoteCount).toBe(2);
    expect(buildAoRenewalEvidence({ renewal, documents: [], quotes: [], fallbackQuotes, rollup: null, today: '2026-06-01' }).openQuoteCount).toBe(2);
  });

  it('does not double-count the same linked quote from both sources', () => {
    const quotes = [
      { id: 'shared-quote', account_id: 'account-1', line_of_business: 'gl', premium: 1, created_at: null },
      { id: 'wrong-lob', account_id: 'account-1', line_of_business: 'auto', premium: 1, created_at: null },
    ];
    const fallbackQuotes = [
      { id: 'shared-quote', renewal_id: 'renewal-1', status: 'quoted' },
      { id: 'ao-only', renewal_id: 'renewal-1', status: 'selected' },
    ];
    expect(buildAoRenewalEvidence({ renewal, documents: [], quotes, fallbackQuotes, rollup: null, today: '2026-06-01' }).openQuoteCount).toBe(2);
  });

  it('maps RPC item counts, including an expired requirement already bucketed as missing', () => {
    const evidence = buildAoRenewalEvidence({ renewal, documents: [], quotes: [], fallbackQuotes: [], today: '2026-06-01',
      rollup: { account_id: 'account-1', ao_renewal_id: null, has_packet: true, total_count: 4,
        missing_count: 1, in_review_count: 2, all_required_complete: false, last_touch_at: null } });
    expect(evidence.items).toEqual({ missingCount: 1, inReviewCount: 2, totalCount: 4, allRequiredComplete: false });
  });

  it('treats an empty packet rollup as no real requirements and keeps Get dec available', () => {
    const evidence = buildAoRenewalEvidence({ renewal, documents: [], quotes: [], fallbackQuotes: [], today: '2026-06-01',
      rollup: { account_id: 'account-1', ao_renewal_id: null, has_packet: true, total_count: 0,
        missing_count: 0, in_review_count: 0, all_required_complete: true, last_touch_at: null } });
    expect(evidence.items).toBeNull();
    expect(evidence.nextHole.kind).toBe('get_dec');
  });

  it('takes the newest touch and aligns the seven-day stale boundary with the 7+ day queue', () => {
    expect(deriveLastTouchEvidence('2026-05-20', '2026-05-26', '2026-06-01')).toMatchObject({ state: 'recent', daysAgo: 6, lastTouchAt: '2026-05-26' });
    expect(deriveLastTouchEvidence('2026-05-20', '2026-05-25', '2026-06-01')).toMatchObject({ state: 'stale', daysAgo: 7, lastTouchAt: '2026-05-25' });
    expect(deriveLastTouchEvidence('2026-05-24', '2026-05-20', '2026-06-01')).toMatchObject({ state: 'stale', daysAgo: 8, lastTouchAt: '2026-05-24' });
    expect(deriveLastTouchEvidence(null, null, '2026-06-01').state).toBe('never');
  });

  it('uses local calendar dates rather than UTC day boundaries', () => {
    const today = new Date('2026-06-02T03:30:00.000Z'); // June 1 in the business time zone.
    expect(deriveLastTouchEvidence(null, '2026-06-01T00:30:00.000Z', today)).toMatchObject({
      state: 'today', daysAgo: 0,
    });
  });
});
