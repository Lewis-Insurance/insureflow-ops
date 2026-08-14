import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Ajv = require('ajv').default || require('ajv');

import {
  normalizeExtractSnapshot,
  readExtractSnapshot,
  isExtractSnapshotComplete,
  maskSnapshotForDisplay,
  maskStringForDisplay,
  type ExtractSnapshotV1,
} from '@/lib/extractSnapshot';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const schema = JSON.parse(
  readFileSync(join(ROOT, 'lib', 'extractSnapshot.schema.json'), 'utf8'),
);

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
      name: 'Products-Completed Ops',
      limit: '$1,000,000 (included in GL)',
      deductible: null,
      premium: null,
      parent_coverage: null,
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
  key_details: ['Blanket additional insured on file', 'Waiver of subrogation requested'],
  legacy_custom_field: { nested: true },
};

describe('extractSnapshot', () => {
  describe('normalizeExtractSnapshot', () => {
    it('normalizes commercial multi-carrier quote fixture', () => {
      const snapshot = normalizeExtractSnapshot(commercialQuoteFixture);

      expect(snapshot.schema_version).toBe(1);
      expect(snapshot.carriers).toEqual(['Hartford', 'Travelers']);
      expect(snapshot.premium.total).toBe(48250);
      expect(snapshot.fees).toHaveLength(2);
      expect(snapshot.fees[0].type).toBe('surplus_lines');
      expect(snapshot.fees[0].amount).toBe(1250.5);
      expect(snapshot.fees[1].type).toBe('broker');
      expect(snapshot.commission?.percent).toBe(12.5);
      expect(snapshot.commission?.amount).toBe(5781.25);

      const productsCoverage = snapshot.coverages.find((c) =>
        c.name.includes('Products-Completed'),
      );
      expect(productsCoverage?.parent_coverage).toBe('GL');

      expect(snapshot.locations).toEqual([
        {
          address: '100 Industrial Park Dr, Springfield, IL 62701',
          occupancy: 'manufacturing',
        },
      ]);
      expect(snapshot.overflow).toEqual({
        legacy_custom_field: { nested: true },
      });
    });

    it('maps legacy carrier string to carriers array', () => {
      const snapshot = normalizeExtractSnapshot({
        carrier: 'Progressive',
        insured_name: 'Test Insured',
      });

      expect(snapshot.carriers).toEqual(['Progressive']);
    });

    it('prefers carriers array over legacy carrier string', () => {
      const snapshot = normalizeExtractSnapshot({
        carrier: 'Legacy Carrier',
        carriers: ['Primary Carrier'],
      });

      expect(snapshot.carriers).toEqual(['Primary Carrier']);
    });

    it('maps legacy property object to locations array', () => {
      const snapshot = normalizeExtractSnapshot({
        property: {
          address: '200 Main St',
          type: 'office',
        },
      });

      expect(snapshot.locations).toEqual([
        { address: '200 Main St', occupancy: 'office' },
      ]);
    });

    it('preserves unknown keys in overflow', () => {
      const snapshot = normalizeExtractSnapshot({
        insured_name: 'Test',
        unknown_field: 'keep me',
        another: 42,
      });

      expect(snapshot.overflow).toEqual({
        unknown_field: 'keep me',
        another: 42,
      });
    });

    it('preserves raw_response in overflow when parse fails', () => {
      const rawContent = 'not valid json { broken';
      const snapshot = normalizeExtractSnapshot({ raw_response: rawContent });

      expect(snapshot.overflow).toEqual({ raw_response: rawContent });
    });
  });

  describe('readExtractSnapshot', () => {
    it('returns normalized V1 snapshot', () => {
      const snapshot = readExtractSnapshot(commercialQuoteFixture);
      expect(snapshot.schema_version).toBe(1);
      expect(snapshot.insured_name).toBe('Acme Manufacturing LLC');
    });
  });

  describe('isExtractSnapshotComplete', () => {
    it('returns true for normal snapshots', () => {
      const snapshot = normalizeExtractSnapshot(commercialQuoteFixture);
      expect(isExtractSnapshotComplete(snapshot)).toBe(true);
    });

    it('returns false when overflow has >= 1000 keys', () => {
      const overflow: Record<string, unknown> = {};
      for (let i = 0; i < 1000; i++) {
        overflow[`key_${i}`] = i;
      }

      const snapshot: ExtractSnapshotV1 = {
        ...normalizeExtractSnapshot({}),
        overflow,
      };

      expect(isExtractSnapshotComplete(snapshot)).toBe(false);
    });

    it('returns false when key_details has >= 1000 items', () => {
      const snapshot: ExtractSnapshotV1 = {
        ...normalizeExtractSnapshot({}),
        key_details: Array.from({ length: 1000 }, (_, i) => `detail-${i}`),
      };

      expect(isExtractSnapshotComplete(snapshot)).toBe(false);
    });
  });

  describe('maskSnapshotForDisplay', () => {
    it('masks SSN, DOB, and DLN in string fields', () => {
      const snapshot = normalizeExtractSnapshot({
        insured_name: 'Driver SSN 123-45-6789',
        key_details: ['DOB 1990-05-15 on file', 'DL A1234567'],
        drivers: [
          {
            name: 'Jane Doe',
            date_of_birth: '1990-05-15',
            license_number: 'A1234567',
          },
        ],
      });

      const masked = maskSnapshotForDisplay(snapshot);
      expect(masked.insured_name).toContain('XXX-XX-6789');
      expect(masked.key_details[0]).toContain('••/••/1990');
      expect(masked.drivers[0].date_of_birth).toBe('••/••/1990');
      expect(masked.drivers[0].license_number).toContain('•');
    });

    it('masks inline PII via maskStringForDisplay', () => {
      expect(maskStringForDisplay('SSN 987-65-4321')).toContain('XXX-XX-4321');
    });

    it('does not mask policy effective or expiration dates', () => {
      const snapshot = normalizeExtractSnapshot({
        effective_date: '2026-03-01',
        expiration_date: '2027-03-01',
      });

      const masked = maskSnapshotForDisplay(snapshot);
      expect(masked.effective_date).toBe('2026-03-01');
      expect(masked.expiration_date).toBe('2027-03-01');
    });

    it('recursively masks PII in overflow values', () => {
      const snapshot = normalizeExtractSnapshot({
        insured_name: 'Test',
        unknown_field: 'SSN 123-45-6789',
      });

      const masked = maskSnapshotForDisplay(snapshot);
      expect(masked.overflow?.unknown_field).toContain('XXX-XX-6789');
    });

    it('recursively masks nested overflow PII', () => {
      const snapshot: ExtractSnapshotV1 = {
        ...normalizeExtractSnapshot({}),
        overflow: {
          nested: {
            dob: 'DOB 1990-05-15',
            items: ['DL A1234567'],
          },
        },
      };

      const masked = maskSnapshotForDisplay(snapshot);
      const nested = masked.overflow?.nested as Record<string, unknown>;
      expect(String(nested.dob)).toContain('••/••/1990');
      expect(String((nested.items as string[])[0])).toContain('DL');
    });
  });

  describe('JSON schema validation', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);

    it('validates normalized commercial fixture against schema', () => {
      const snapshot = normalizeExtractSnapshot(commercialQuoteFixture);
      const valid = validate(snapshot);
      expect(valid, JSON.stringify(validate.errors, null, 2)).toBe(true);
    });

    it('validates minimal empty snapshot', () => {
      const snapshot = normalizeExtractSnapshot({});
      const valid = validate(snapshot);
      expect(valid, JSON.stringify(validate.errors, null, 2)).toBe(true);
    });

    it('rejects invalid schema_version', () => {
      const invalid = {
        ...normalizeExtractSnapshot({}),
        schema_version: 2,
      };
      expect(validate(invalid)).toBe(false);
    });

    it('rejects unknown top-level properties', () => {
      const invalid = {
        ...normalizeExtractSnapshot({}),
        extra_field: 'not allowed',
      };
      expect(validate(invalid)).toBe(false);
    });
  });
});
