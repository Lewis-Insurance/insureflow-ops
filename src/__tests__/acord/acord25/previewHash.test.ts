// previewHash.test.ts
//
// Exclusion behavior of hashFieldValuesForPreview (blueprint B Section 4.10, R9).
// The three header fields (certificate number, revision number, form date) are
// excluded from the hash so a server-assigned cert number or the issue-day form
// date never spuriously 409s. Any NON-excluded change must change the hash.

import { describe, it, expect } from 'vitest';
import { ACORD25_FIELD_MAP } from '@/lib/acord/acord25/fieldMap';
import {
  hashFieldValuesForPreview,
  PREVIEW_HASH_EXCLUDED_KEYS,
  PREVIEW_HASH_EXCLUDED_FIELDS,
} from '@/lib/acord/acord25/previewHash';
import { buildAcord25FieldValues } from '@/lib/acord/acord25/buildAcord25FieldValues';
import { buildSampleInput } from '@/test/fixtures/acord25Fixture';

const CERT_NUM_FIELD = ACORD25_FIELD_MAP.certificateNumber.pdfField;
const REV_NUM_FIELD = ACORD25_FIELD_MAP.revisionNumber.pdfField;
const CERT_DATE_FIELD = ACORD25_FIELD_MAP.certificateDate.pdfField;

describe('preview hash exclusion set', () => {
  it('excludes exactly cert number, revision number, and form date pdfFields', () => {
    expect(PREVIEW_HASH_EXCLUDED_KEYS).toEqual([
      'certificateNumber',
      'revisionNumber',
      'certificateDate',
    ]);
    expect(PREVIEW_HASH_EXCLUDED_FIELDS.has(CERT_NUM_FIELD)).toBe(true);
    expect(PREVIEW_HASH_EXCLUDED_FIELDS.has(REV_NUM_FIELD)).toBe(true);
    expect(PREVIEW_HASH_EXCLUDED_FIELDS.has(CERT_DATE_FIELD)).toBe(true);
    expect(PREVIEW_HASH_EXCLUDED_FIELDS.size).toBe(3);
  });
});

describe('preview hash is a 64-char lowercase hex sha256', () => {
  it('produces a stable hex digest', async () => {
    const build = buildAcord25FieldValues(buildSampleInput());
    const hash = await hashFieldValuesForPreview(build.fieldValues);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    // Deterministic: hashing the same values again yields the same digest.
    const again = await hashFieldValuesForPreview(build.fieldValues);
    expect(again).toBe(hash);
  });
});

describe('excluded header fields do not affect the hash', () => {
  it('changing certificate number, revision number, or form date leaves the hash unchanged', async () => {
    const build = buildAcord25FieldValues(buildSampleInput());
    const base = await hashFieldValuesForPreview(build.fieldValues);

    const withCertNum = { ...build.fieldValues, [CERT_NUM_FIELD]: 'CERT-2026-000123' };
    expect(await hashFieldValuesForPreview(withCertNum)).toBe(base);

    const withRev = { ...build.fieldValues, [REV_NUM_FIELD]: '2' };
    expect(await hashFieldValuesForPreview(withRev)).toBe(base);

    const withDate = { ...build.fieldValues, [CERT_DATE_FIELD]: '12/31/2027' };
    expect(await hashFieldValuesForPreview(withDate)).toBe(base);

    // All three at once.
    const allThree = {
      ...build.fieldValues,
      [CERT_NUM_FIELD]: 'CERT-9',
      [REV_NUM_FIELD]: '5',
      [CERT_DATE_FIELD]: '01/01/2099',
    };
    expect(await hashFieldValuesForPreview(allThree)).toBe(base);
  });
});

describe('non-excluded changes change the hash', () => {
  it('changing a coverage field changes the hash', async () => {
    const build = buildAcord25FieldValues(buildSampleInput());
    const base = await hashFieldValuesForPreview(build.fieldValues);

    const changed = {
      ...build.fieldValues,
      [ACORD25_FIELD_MAP.gl_eachOccurrence.pdfField]: '2,000,000',
    };
    expect(await hashFieldValuesForPreview(changed)).not.toBe(base);
  });

  it('flipping a checkbox boolean changes the hash', async () => {
    const build = buildAcord25FieldValues(buildSampleInput());
    const base = await hashFieldValuesForPreview(build.fieldValues);
    const field = ACORD25_FIELD_MAP.gl_occurCheckbox.pdfField;
    const flipped = { ...build.fieldValues, [field]: !build.fieldValues[field] };
    expect(await hashFieldValuesForPreview(flipped)).not.toBe(base);
  });

  it('changing the holder name changes the hash', async () => {
    const build = buildAcord25FieldValues(buildSampleInput());
    const base = await hashFieldValuesForPreview(build.fieldValues);
    const changed = {
      ...build.fieldValues,
      [ACORD25_FIELD_MAP.holderName.pdfField]: 'Different Holder',
    };
    expect(await hashFieldValuesForPreview(changed)).not.toBe(base);
  });
});

describe('key ordering is stable', () => {
  it('hash is independent of insertion order of the input object', async () => {
    const build = buildAcord25FieldValues(buildSampleInput());
    const forward = build.fieldValues;
    // Rebuild the object with reversed key insertion order.
    const reversed: Record<string, string | boolean> = {};
    for (const k of Object.keys(forward).reverse()) {
      reversed[k] = forward[k];
    }
    expect(await hashFieldValuesForPreview(reversed)).toBe(await hashFieldValuesForPreview(forward));
  });
});
