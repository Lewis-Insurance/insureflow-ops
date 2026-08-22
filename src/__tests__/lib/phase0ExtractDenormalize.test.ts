import { describe, it, expect } from 'vitest';
import { normalizeExtractSnapshot } from '@/lib/extractSnapshot';
import { denormalizeExtractSnapshotColumns } from '@/lib/phase0ExtractDenormalize';

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
    { type: 'surplus_lines', amount: '1,250.50', label: 'Surplus lines tax' },
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
  ],
  locations: [{ address: '123 Industrial Way, Austin, TX 78701', occupancy: 'Manufacturing' }],
  vehicles: [],
  drivers: [],
  key_details: [],
};

describe('denormalizeExtractSnapshotColumns', () => {
  it('maps commercial quote fixture to document_analysis top-level columns', () => {
    const snapshot = normalizeExtractSnapshot(commercialQuoteFixture);
    const columns = denormalizeExtractSnapshotColumns(snapshot);

    expect(columns.policy_number).toBe('COM-2026-0042');
    expect(columns.insured_name).toBe('Acme Manufacturing LLC');
    expect(columns.effective_date).toBe('2026-03-01');
    expect(columns.expiration_date).toBe('2027-03-01');
  });

  it('returns nulls for empty snapshot', () => {
    const snapshot = normalizeExtractSnapshot({});
    const columns = denormalizeExtractSnapshotColumns(snapshot);

    expect(columns.policy_number).toBeNull();
    expect(columns.insured_name).toBeNull();
    expect(columns.effective_date).toBeNull();
    expect(columns.expiration_date).toBeNull();
  });
});
