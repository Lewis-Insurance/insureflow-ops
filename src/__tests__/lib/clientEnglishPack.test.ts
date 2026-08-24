import { describe, expect, it } from 'vitest';
import { buildClientEnglishPack } from '@/lib/clientEnglishPack';
import type { ExtractSnapshotV1 } from '@/lib/extractSnapshot';
import type { QuoteIncumbentDiffResult } from '@/lib/quoteIncumbent/diffQuoteIncumbent';
import type { ComparisonDifference } from '@/types/coverage-comparison';

const snapshot: ExtractSnapshotV1 = {
  schema_version: 1,
  insured_name: 'Harbor Bakery LLC',
  carriers: ['Acme Insurance'],
  effective_date: '2026-01-01',
  expiration_date: '2027-01-01',
  claims_made: true,
  defense_inside_limits: false,
  premium: { total: 1200, frequency: 'annual' },
  fees: [
    { type: 'tax', amount: 20 },
    { type: 'broker', amount: 30 },
    { type: 'surplus_lines', amount: 40 },
    { type: 'nima', amount: 5 },
    { type: 'other', amount: 10, label: 'Filing fee' },
  ],
  commission: { percent: 12, amount: 144 },
  coverages: [
    { name: 'General liability', limit: '$1,000,000', deductible: '$1,000', premium: 900, parent_coverage: null },
    { name: 'Products completed operations', limit: '$1,000,000', deductible: null, premium: null, parent_coverage: 'General liability' },
  ],
  locations: [],
  vehicles: [{ year: 2025, make: 'Ford', model: 'Transit', vin: '1M8GDM9AXKP042788' }],
  drivers: [{ name: 'Alice', date_of_birth: '1980-01-02', license_number: 'D1234567' }],
  document_type: 'quote',
  policy_number: 'POL-100',
  key_details: ['Audit applies'],
  overflow: { secret: '123-45-6789' },
};

const meta = { agencyName: 'Lewis Insurance', agencyPhone: '555-0100' };

function difference(index: number, category: ComparisonDifference['category'] = 'limits'): ComparisonDifference {
  return {
    fieldPath: category === 'premium' ? 'premium.total' : `coverage_${index}`,
    label: category === 'premium' ? 'Annual premium' : `Coverage ${index}`,
    category,
    fieldType: category === 'premium' ? 'currency' : 'limit',
    leftValueRaw: `${index}`,
    rightValueRaw: `${index + 1}`,
    leftValueNormalized: { type: 'text', value: `${index}`, rawValue: `${index}` },
    rightValueNormalized: { type: 'text', value: `${index + 1}`, rawValue: `${index + 1}` },
    leftValueDisplay: `Old ${index}`,
    rightValueDisplay: `New ${index}`,
    leftEvidenceIds: [], rightEvidenceIds: [], changeType: 'modified', severity: 'low',
    status: 'confirmed', leftConfidence: 1, rightConfidence: 1, comparisonConfidence: 1,
    isEndorsementOverride: false, requiresVerification: false,
  };
}

function delta(differences: ComparisonDifference[]): QuoteIncumbentDiffResult {
  return { materialDifferences: differences } as QuoteIncumbentDiffResult;
}

describe('buildClientEnglishPack', () => {
  it('is deterministic and maps the plain-English sections', () => {
    const first = buildClientEnglishPack(snapshot, undefined, meta);
    expect(buildClientEnglishPack(snapshot, undefined, meta)).toEqual(first);
    expect(first.coverages[1]).toMatchObject({ includedWith: 'General liability' });
    expect(first.fees.map((fee) => fee.label)).toEqual([
      'Tax', 'Broker fee', 'Surplus lines tax', 'NIMA fee', 'Filing fee',
    ]);
    expect(first.computedTotal).toBe(1305);
    expect(first.vehicles).toEqual([{ year: '2025', make: 'Ford', model: 'Transit' }]);
    expect(JSON.stringify(first)).not.toContain('1M8GDM9AXKP042788');
    expect(JSON.stringify(first)).not.toContain('commission');
  });

  it('renders policy term dates as readable calendar dates without DOB masking', () => {
    const pack = buildClientEnglishPack(snapshot, undefined, meta);
    expect(pack.effectiveDate).toBe('January 1, 2026');
    expect(pack.expirationDate).toBe('January 1, 2027');
    expect(`${pack.effectiveDate} ${pack.expirationDate}`).not.toMatch(/2026-01-01|2027-01-01|••|\?\?/);
  });

  it('groups children beneath parents while preserving stable source order', () => {
    const coverages: ExtractSnapshotV1['coverages'] = [
      { name: 'Child B1', limit: null, deductible: null, premium: null, parent_coverage: 'Parent B' },
      { name: 'Orphan 1', limit: null, deductible: null, premium: null, parent_coverage: 'Missing' },
      { name: 'Parent A', limit: null, deductible: null, premium: null, parent_coverage: null },
      { name: 'Child A1', limit: null, deductible: null, premium: null, parent_coverage: 'Parent A' },
      { name: 'Parent B', limit: null, deductible: null, premium: null, parent_coverage: null },
      { name: 'Child A2', limit: null, deductible: null, premium: null, parent_coverage: 'Parent A' },
      { name: 'Orphan 2', limit: null, deductible: null, premium: null, parent_coverage: 'Also missing' },
    ];
    const pack = buildClientEnglishPack({ ...snapshot, coverages }, undefined, meta);
    expect(pack.coverages.map((coverage) => coverage.name)).toEqual([
      'Parent A', 'Child A1', 'Child A2', 'Parent B', 'Child B1', 'Orphan 1', 'Orphan 2',
    ]);
  });

  it.each([
    [true, true, 'claims made', 'come out of'],
    [false, false, 'occurrence based', 'paid in addition'],
    [null, null, undefined, undefined],
  ] as const)('renders tri-state flags for %s and %s', (claims, defense, claimsText, defenseText) => {
    const pack = buildClientEnglishPack({ ...snapshot, claims_made: claims, defense_inside_limits: defense }, undefined, meta);
    const flags = pack.flags.join(' ');
    if (claimsText) expect(flags).toContain(claimsText); else expect(flags).not.toMatch(/claims made|occurrence based/);
    if (defenseText) expect(flags).toContain(defenseText); else expect(flags).not.toContain('Defense costs');
  });

  it('omits computed total when premium or any fee is unknown', () => {
    expect(buildClientEnglishPack({ ...snapshot, premium: { total: null, frequency: null } }, undefined, meta).computedTotal).toBeNull();
    expect(buildClientEnglishPack({ ...snapshot, fees: [{ type: 'tax', amount: null }] }, undefined, meta).computedTotal).toBeNull();
  });

  it('drops sensitive key details instead of merely masking them', () => {
    const adversarial: ExtractSnapshotV1 = {
      ...snapshot,
      key_details: [
        'SSN 123-45-6789',
        'SSN 123456789',
        'Social Security number 123 45 6789',
        'Account number 123456789',
        'Account: 123456789',
        'Acct: 123456789',
        'Agency account 123 456 789',
        'Agency account ABC12345',
        'Agency account number AB-123456',
        'VIN 1M8GDM9AXKP042788',
        'Vehicle identifier 1M8GDM9AXKP042788',
        'DOB 1980-01-02',
        'Date of birth 01/02/1980',
        'Birth date 01-02-1980',
        'DOB: January 2, 1980',
        'Date of birth Jan 2 1980',
        'Driver license D1234567',
        'DL A1234567',
        'D.L. A1234567',
        'Sprinkler inspection 2026-01-01 for account review',
        'Account 2026-01-01',
        'Account: 2026-01-01',
        'Account review completed',
        'License requirements reviewed',
        'Reference ABCDEFGHJKLMNPRST',
      ],
    };
    const pack = buildClientEnglishPack(adversarial, undefined, meta);
    expect(pack.keyDetails).toEqual([
      'Sprinkler inspection 2026-01-01 for account review',
      'Account 2026-01-01',
      'Account: 2026-01-01',
      'Account review completed',
      'License requirements reviewed',
      'Reference ABCDEFGHJKLMNPRST',
    ]);
    const output = JSON.stringify(pack);
    expect(output).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b/);
    expect(output).not.toMatch(/1M8GDM9AXKP042788|D1234567|123456789/);
    expect(output).not.toContain('Alice');
  });

  it('caps changes at six and puts premium first', () => {
    const changes = [1, 2, 3, 4, 5, 6, 7].map((item) => difference(item));
    changes.push(difference(8, 'premium'));
    const pack = buildClientEnglishPack(snapshot, delta(changes), meta);
    expect(pack.changes).toHaveLength(6);
    expect(pack.changes[0]).toEqual({ label: 'Annual premium', oldValue: 'Old 8', newValue: 'New 8' });
  });
});
