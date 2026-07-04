// roundTrip.test.ts
//
// build -> fill (via src/lib/acord/pdfFiller.ts fillAcordPdf) -> extract read-back
// over the SYNTHETIC ACORD 25 (a pdf-lib doc carrying a real field per map entry,
// so the licensed PDF never enters CI). Proves:
//   1. every non-empty payload value survives a fill and reads back equal;
//   2. a flatten pass fills exactly the mapped-field count;
//   3. the snapshot vocabulary (D14) survives a JSON persist -> refill -> extract
//      round-trip, so no '/1' or '/Off' export string ever creeps in.

import { describe, it, expect, beforeAll } from 'vitest';
import { ACORD25_FIELD_MAP, type Acord25LogicalKey } from '@/lib/acord/acord25/fieldMap';
import { buildAcord25FieldValues } from '@/lib/acord/acord25/buildAcord25FieldValues';
import { fillAcordPdf, extractFieldValues } from '@/lib/acord/pdfFiller';
import type { BuildAcord25Result } from '@/lib/acord/acord25/types';
import { buildSyntheticAcord25, buildSampleInput } from '@/test/fixtures/acord25Fixture';

let templateBytes: Uint8Array;
let build: BuildAcord25Result;

beforeAll(async () => {
  templateBytes = await buildSyntheticAcord25();
  build = buildAcord25FieldValues(buildSampleInput());
});

const mapEntryCount = Object.keys(ACORD25_FIELD_MAP).length;

// extractFieldValues reads text via `getText() || null`, so an emitted '' reads
// back as null. Normalize the emitted payload to the same convention for compare.
function toReadBackShape(fieldValues: Record<string, string | boolean>): Record<string, string | boolean | null> {
  const out: Record<string, string | boolean | null> = {};
  for (const [k, v] of Object.entries(fieldValues)) {
    out[k] = typeof v === 'string' && v.length === 0 ? null : v;
  }
  return out;
}

describe('round-trip: fill without flatten, then extract', () => {
  it('reads back every field equal to the emitted payload (empty text -> null)', async () => {
    const result = await fillAcordPdf(templateBytes, {
      fieldValues: build.fieldValues,
      flatten: false,
      updateAppearances: true,
    });
    expect(result.success).toBe(true);
    // No field was skipped: every payload key exists on the synthetic template.
    expect(result.skippedFields).toEqual([]);
    expect(result.errors).toEqual([]);

    const readBack = await extractFieldValues(result.pdfBytes!);
    const expected = toReadBackShape(build.fieldValues);

    for (const key of Object.keys(ACORD25_FIELD_MAP) as Acord25LogicalKey[]) {
      const field = ACORD25_FIELD_MAP[key].pdfField;
      expect(readBack[field], `field ${field}`).toEqual(expected[field]);
    }
  });

  it('a non-empty text value reads back verbatim', async () => {
    const result = await fillAcordPdf(templateBytes, { fieldValues: build.fieldValues, flatten: false });
    const readBack = await extractFieldValues(result.pdfBytes!);
    expect(readBack[ACORD25_FIELD_MAP.insuredName.pdfField]).toBe('Acme Manufacturing LLC');
    expect(readBack[ACORD25_FIELD_MAP.gl_eachOccurrence.pdfField]).toBe('1,000,000');
    // A checked checkbox reads back true; an unchecked one false.
    expect(readBack[ACORD25_FIELD_MAP.gl_occurCheckbox.pdfField]).toBe(true);
    expect(readBack[ACORD25_FIELD_MAP.gl_claimsMadeCheckbox.pdfField]).toBe(false);
    // ynText reads back as the literal.
    expect(readBack[ACORD25_FIELD_MAP.gl_addlInsd.pdfField]).toBe('Y');
    expect(readBack[ACORD25_FIELD_MAP.gl_subrWvd.pdfField]).toBe('N');
  });
});

describe('round-trip: flatten pass fills the mapped-field count', () => {
  it('filledFieldCount equals the number of map entries', async () => {
    const result = await fillAcordPdf(templateBytes, {
      fieldValues: build.fieldValues,
      flatten: true,
      updateAppearances: true,
    });
    expect(result.success).toBe(true);
    expect(result.skippedFields).toEqual([]);
    // The payload is TOTAL over the map, and every field exists on the synthetic
    // template, so every entry is filled (text '' and checkbox false included).
    expect(result.filledFieldCount).toBe(mapEntryCount);
  });
});

describe('snapshot-replay: JSON round-trip preserves D14 vocabulary', () => {
  it('serializing field values then refilling and extracting is stable, no /1 creeps in', async () => {
    // Persist exactly as snapshot.field_values would (verbatim build.fieldValues).
    const persisted = JSON.parse(JSON.stringify(build.fieldValues)) as Record<string, string | boolean>;

    // No export-value string survived serialization.
    for (const v of Object.values(persisted)) {
      expect(v).not.toBe('/1');
      expect(v).not.toBe('/Off');
    }

    const first = await fillAcordPdf(templateBytes, { fieldValues: persisted, flatten: false });
    const extracted1 = await extractFieldValues(first.pdfBytes!);

    // Rebuild a payload from the extraction (text null -> '', to match D14) and
    // refill: a second pass must read back identically (idempotent replay).
    const refillPayload: Record<string, string | boolean> = {};
    for (const key of Object.keys(ACORD25_FIELD_MAP) as Acord25LogicalKey[]) {
      const field = ACORD25_FIELD_MAP[key].pdfField;
      const v = extracted1[field];
      refillPayload[field] = v === null ? '' : v;
    }
    const second = await fillAcordPdf(templateBytes, { fieldValues: refillPayload, flatten: false });
    const extracted2 = await extractFieldValues(second.pdfBytes!);

    for (const key of Object.keys(ACORD25_FIELD_MAP) as Acord25LogicalKey[]) {
      const field = ACORD25_FIELD_MAP[key].pdfField;
      expect(extracted2[field], `field ${field}`).toEqual(extracted1[field]);
    }
  });
});
