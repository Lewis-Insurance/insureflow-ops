import { describe, it, expect } from 'vitest';
import { normalizeExtractSnapshot } from '@/lib/extractSnapshot';
import {
  buildProposedQuotesFromSnapshot,
  canonicalizeForHash,
  hashExtractSnapshot,
  inferLineOfBusiness,
  proposalCoverageCount,
} from '@/lib/extractWritebackProposal';

const commercialQuoteFixture = {
  policy_number: 'COM-2026-0042',
  insured_name: 'Acme Manufacturing LLC',
  carriers: ['Hartford', 'Travelers'],
  document_type: 'commercial_quote',
  effective_date: '2026-03-01',
  expiration_date: '2027-03-01',
  claims_made: true,
  defense_inside_limits: false,
  premium: { total: '$48,250.00', frequency: 'annual' },
  fees: [
    { type: 'surplus lines tax', amount: '1,250.50', label: 'Surplus lines tax' },
    { type: 'broker', amount: 500 },
  ],
  commission: { percent: '12.5', amount: '$5,781.25' },
  coverages: [
    {
      name: 'General Liability',
      limit: '$2,000,000 per occurrence',
      deductible: '$1,000',
      premium: 22000,
    },
    {
      name: 'Commercial Auto',
      limit: '$1,000,000 CSL',
      deductible: '$500',
      premium: '8,750',
    },
  ],
  property: {
    address: '100 Industrial Park Dr, Springfield, IL 62701',
    type: 'manufacturing',
  },
  key_details: ['Blanket additional insured on file'],
};

describe('extractWritebackProposal', () => {
  describe('hashExtractSnapshot', () => {
    it('returns a stable 64-char lowercase hex sha256', async () => {
      const snapshot = normalizeExtractSnapshot(commercialQuoteFixture);
      const hash = await hashExtractSnapshot(snapshot);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(await hashExtractSnapshot(snapshot)).toBe(hash);
    });

    it('changes when snapshot content changes', async () => {
      const base = normalizeExtractSnapshot(commercialQuoteFixture);
      const changed = normalizeExtractSnapshot({
        ...commercialQuoteFixture,
        policy_number: 'COM-2026-0099',
      });
      expect(await hashExtractSnapshot(changed)).not.toBe(await hashExtractSnapshot(base));
    });

    it('canonicalizeForHash sorts object keys', () => {
      expect(canonicalizeForHash({ b: 2, a: 1 })).toEqual({ a: 1, b: 2 });
    });
  });

  describe('inferLineOfBusiness', () => {
    it('maps commercial GL quote to gl', () => {
      const snapshot = normalizeExtractSnapshot(commercialQuoteFixture);
      expect(inferLineOfBusiness(snapshot, 'commercial')).toBe('gl');
    });

    it('maps personal auto document with vehicles to auto', () => {
      const snapshot = normalizeExtractSnapshot({
        document_type: 'personal_auto',
        vehicles: [{ year: 2020, make: 'Toyota', model: 'Camry' }],
      });
      expect(inferLineOfBusiness(snapshot, 'personal')).toBe('auto');
    });

    it('maps workers comp document type to workers_comp', () => {
      const snapshot = normalizeExtractSnapshot({ document_type: 'workers_comp_policy' });
      expect(inferLineOfBusiness(snapshot, 'commercial')).toBe('workers_comp');
    });

    it('maps umbrella coverage name to umbrella', () => {
      const snapshot = normalizeExtractSnapshot({
        document_type: 'commercial_policy',
        coverages: [{ name: 'Umbrella Liability', limit: '$2M', deductible: null, premium: null }],
      });
      expect(inferLineOfBusiness(snapshot, 'commercial')).toBe('umbrella');
    });

    it('maps commercial_quote with only commercial auto coverages to commercial_auto', () => {
      const snapshot = normalizeExtractSnapshot({
        document_type: 'commercial_quote',
        coverages: [
          {
            name: 'Commercial Auto Liability',
            limit: '$1,000,000 CSL',
            deductible: '$500',
            premium: 8750,
          },
          {
            name: 'Fleet Comprehensive',
            limit: 'ACV',
            deductible: '$1,000',
            premium: 3200,
          },
        ],
      });
      expect(inferLineOfBusiness(snapshot, 'commercial')).toBe('commercial_auto');
    });

    it('maps life_policy document type to life', () => {
      const snapshot = normalizeExtractSnapshot({
        document_type: 'life_policy',
        vehicles: [{ year: 2020, make: 'Toyota', model: 'Camry' }],
      });
      expect(inferLineOfBusiness(snapshot, 'personal')).toBe('life');
    });
  });

  describe('buildProposedQuotesFromSnapshot', () => {
    it('builds one payload per carrier with quote + coverages shape', () => {
      const snapshot = normalizeExtractSnapshot(commercialQuoteFixture);
      const accountId = '00000000-0000-4000-8000-000000000001';
      const payloads = buildProposedQuotesFromSnapshot(snapshot, accountId, 'commercial');

      expect(payloads).toHaveLength(2);
      expect(payloads.map((p) => p.quote.options.carrier_name)).toEqual(['Hartford', 'Travelers']);

      const hartford = payloads[0];
      expect(hartford.quote.account_id).toBe(accountId);
      expect(hartford.quote.status).toBe('open');
      expect(hartford.quote.line_of_business).toBe('gl');
      expect(hartford.quote.premium).toBe(48250);
      expect(hartford.quote.expires_at).toBe('2027-03-01');
      expect(hartford.quote.options.effective_date).toBe('2026-03-01');
      expect(hartford.quote.options.premium_frequency).toBe('annual');
      expect(hartford.quote.options.commission_pct).toBe(12.5);
      expect(hartford.quote.options.commission_amount).toBe(5781.25);
      expect(hartford.quote.options.fees).toHaveLength(2);
      expect(hartford.quote.options.fees[0].type).toBe('surplus_lines');
      expect(hartford.quote_coverages).toHaveLength(2);
      expect(hartford.quote_coverages[0]).toMatchObject({
        coverage_type: 'general_liability',
        limit_amount: '$2,000,000 per occurrence',
        deductible_amount: '$1,000',
        premium_amount: 22000,
        is_included: true,
        extracted_from_document: true,
      });
      expect(proposalCoverageCount(hartford)).toBe(2);
    });

    it('uses Unknown carrier when no carrier names are present', () => {
      const snapshot = normalizeExtractSnapshot({
        insured_name: 'Acme Manufacturing LLC',
      });
      const payloads = buildProposedQuotesFromSnapshot(
        snapshot,
        '00000000-0000-4000-8000-000000000002',
        'personal',
      );

      expect(payloads).toHaveLength(1);
      expect(payloads[0].quote.options.carrier_name).toBe('Unknown carrier');
    });

    it('generates distinct quote_ref per carrier', () => {
      const snapshot = normalizeExtractSnapshot(commercialQuoteFixture);
      const payloads = buildProposedQuotesFromSnapshot(
        snapshot,
        '00000000-0000-4000-8000-000000000003',
        'commercial',
      );
      const refs = payloads.map((p) => p.quote.quote_ref);
      expect(new Set(refs).size).toBe(2);
      expect(refs.every((ref) => ref.startsWith('extract-COM-2026-0042-'))).toBe(true);
    });
  });
});
