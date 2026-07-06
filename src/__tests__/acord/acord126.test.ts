// acord126.test.ts
//
// Contract tests for the ACORD 126 Phase 1b core engine
// (src/lib/acord/acord126/). Covers:
//   (a) inventory membership, THE critical test: every fieldMap pdfField (and
//       every ACORD126_EXPECTED_FIELD_NAMES entry) resolves verbatim in
//       src/lib/acord/blanks/acord126.inventory.json, mapped kinds agree with
//       inventory types (checkbox <-> CheckBox, everything else <-> TextField),
//       and no two logical keys share a pdfField.
//   (b) labelmap coverage: this blank's names are generic, so every mapped
//       field must carry an audited label correlation in
//       src/lib/acord/blanks/acord126.labelmap.json (non-empty label, page and
//       rect agreeing with the inventory).
//   (c) builder golden test over a fully populated input: date and limit
//       formatting (bare digits where the $ is preprinted, '$' where it is
//       not), coverage checkbox pass-through, aggregate-applies-per one-hot
//       exclusivity, hazard row placement, totality over the map, plus the
//       DATE_INVALID / HAZARDS_OVERFLOW / empty-input edges.
//   (d) validator accept/reject for the three authored rules.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ACORD126_EXPECTED_FIELD_NAMES,
  ACORD126_FIELD_MAP,
  type Acord126LogicalKey,
} from '@/lib/acord/acord126/fieldMap';
import { buildAcord126FieldValues } from '@/lib/acord/acord126/buildAcord126FieldValues';
import { validateAcord126 } from '@/lib/acord/acord126/validateAcord126';
import type { Acord126Input } from '@/lib/acord/acord126/types';

// ---------------------------------------------------------------------------
// Inventory + labelmap (the authorities the field map is authored against)
// ---------------------------------------------------------------------------

interface InventoryField {
  name: string;
  type: string;
  page: number;
  rect: number[];
}

interface LabelMapEntry {
  pdfField: string;
  page: number;
  rect: number[];
  label: string;
  labelXY: number[];
}

// Resolved from the repo root (vitest cwd); import.meta.url is not a file URL
// under the jsdom test environment.
const inventoryPath = resolve(process.cwd(), 'src/lib/acord/blanks/acord126.inventory.json');
const inventory: InventoryField[] = JSON.parse(readFileSync(inventoryPath, 'utf8'));
const inventoryNames = new Set(inventory.map((f) => f.name));
const inventoryTypeByName = new Map(inventory.map((f) => [f.name, f.type]));
const inventoryByName = new Map(inventory.map((f) => [f.name, f]));

const labelmapPath = resolve(process.cwd(), 'src/lib/acord/blanks/acord126.labelmap.json');
const labelmap: LabelMapEntry[] = JSON.parse(readFileSync(labelmapPath, 'utf8'));
const labelmapByField = new Map(labelmap.map((e) => [e.pdfField, e]));

const mapKeys = Object.keys(ACORD126_FIELD_MAP) as Acord126LogicalKey[];

/** Shorthand: logical key -> exact pdf field name. */
function F(key: Acord126LogicalKey): string {
  return ACORD126_FIELD_MAP[key].pdfField;
}

// ---------------------------------------------------------------------------
// Fixtures (inline; the module has no pdf-lib dependency to synthesize around)
// ---------------------------------------------------------------------------

function fullInput(): Acord126Input {
  return {
    header: {
      namedInsured: 'Riverbend Electrical LLC',
      effectiveDate: '2026-08-01',
      producerName: 'Lewis Insurance Associates',
    },
    coverage: { occurrence: true, claimsMade: false },
    limits: {
      eachOccurrence: 1000000,
      damageToRentedPremises: 100000,
      medicalExpense: 5000,
      personalAdvInjury: 1000000,
      generalAggregate: 2000000,
      productsCompOpsAggregate: 2000000,
    },
    aggregateAppliesPer: 'policy',
    hazards: [
      {
        classCode: '92478',
        premiumBasis: 'P',
        exposure: 850000,
        territory: '005',
        rate: 6.25,
        premium: 5313,
      },
      {
        classCode: '10026',
        premiumBasis: 'S',
        exposure: 1200000,
        territory: '005',
        rate: 0.514,
        premium: 617,
      },
    ],
  };
}

function emptyInput(): Acord126Input {
  return {
    header: { namedInsured: '', effectiveDate: '', producerName: '' },
    coverage: { occurrence: false, claimsMade: false },
    limits: {
      eachOccurrence: null,
      damageToRentedPremises: null,
      medicalExpense: null,
      personalAdvInjury: null,
      generalAggregate: null,
      productsCompOpsAggregate: null,
    },
    aggregateAppliesPer: null,
    hazards: [],
  };
}

// ---------------------------------------------------------------------------
// (a) Inventory membership (the critical test)
// ---------------------------------------------------------------------------

describe('ACORD126_FIELD_MAP vs the blank inventory', () => {
  it('reads the committed 279-field inventory (drift tripwire, see blanks/README.md)', () => {
    expect(inventory.length).toBe(279);
  });

  it('every pdfField in the map exists VERBATIM in the inventory', () => {
    for (const key of mapKeys) {
      const { pdfField } = ACORD126_FIELD_MAP[key];
      expect(inventoryNames.has(pdfField), `${key} -> "${pdfField}" is not in the inventory`).toBe(
        true,
      );
    }
  });

  it('mapped kinds agree with inventory field types', () => {
    for (const key of mapKeys) {
      const entry = ACORD126_FIELD_MAP[key];
      const invType = inventoryTypeByName.get(entry.pdfField);
      if (entry.kind === 'checkbox') {
        expect(invType, `${key} should be a CheckBox on the blank`).toBe('CheckBox');
      } else {
        expect(invType, `${key} should be a TextField on the blank`).toBe('TextField');
      }
    }
  });

  it('no two logical keys share a pdfField', () => {
    const fields = mapKeys.map((k) => ACORD126_FIELD_MAP[k].pdfField);
    expect(new Set(fields).size).toBe(fields.length);
  });

  it('every ACORD126_EXPECTED_FIELD_NAMES entry exists in the inventory', () => {
    for (const name of ACORD126_EXPECTED_FIELD_NAMES) {
      expect(inventoryNames.has(name), `expected field "${name}" is not in the inventory`).toBe(
        true,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// (b) Labelmap coverage (the coordinate-mapping audit trail)
// ---------------------------------------------------------------------------

describe('ACORD126_FIELD_MAP vs the labelmap sidecar', () => {
  it('every mapped pdfField has a labelmap entry with a non-empty label', () => {
    for (const key of mapKeys) {
      const { pdfField } = ACORD126_FIELD_MAP[key];
      const entry = labelmapByField.get(pdfField);
      expect(entry, `${key} -> "${pdfField}" has no labelmap entry`).toBeDefined();
      expect(
        (entry?.label ?? '').trim().length,
        `${key} -> "${pdfField}" has an empty label`,
      ).toBeGreaterThan(0);
      expect(entry?.labelXY, `${key} -> "${pdfField}" has no labelXY`).toHaveLength(2);
    }
  });

  it('labelmap page and rect agree with the inventory verbatim', () => {
    for (const entry of labelmap) {
      const inv = inventoryByName.get(entry.pdfField);
      expect(inv, `labelmap field "${entry.pdfField}" is not in the inventory`).toBeDefined();
      expect(entry.page, `labelmap page for "${entry.pdfField}"`).toBe(inv?.page);
      expect(entry.rect, `labelmap rect for "${entry.pdfField}"`).toEqual(inv?.rect);
    }
  });

  it('labelmap carries no fields outside the map (one sidecar entry per mapped field)', () => {
    const mapped = new Set(mapKeys.map((k) => ACORD126_FIELD_MAP[k].pdfField));
    for (const entry of labelmap) {
      expect(mapped.has(entry.pdfField), `labelmap field "${entry.pdfField}" is not mapped`).toBe(
        true,
      );
    }
    expect(labelmap.length).toBe(mapped.size);
  });
});

// ---------------------------------------------------------------------------
// (c) Builder golden test
// ---------------------------------------------------------------------------

describe('buildAcord126FieldValues golden output', () => {
  it('is total over the field map: exactly one value per pdfField', () => {
    const build = buildAcord126FieldValues(fullInput());
    const expected = new Set(mapKeys.map((k) => ACORD126_FIELD_MAP[k].pdfField));
    expect(new Set(Object.keys(build.fieldValues))).toEqual(expected);
    expect(Object.keys(build.fieldValues).length).toBe(expected.size);
  });

  it('fills the full input with formatted dates, grouped limits, and checkbox booleans', () => {
    const build = buildAcord126FieldValues(fullInput());
    expect(build.ok).toBe(true);
    expect(build.issues).toEqual([]);

    // Header strip.
    expect(build.fieldValues[F('producerName')]).toBe('Lewis Insurance Associates');
    expect(build.fieldValues[F('insuredName')]).toBe('Riverbend Electrical LLC');
    expect(build.fieldValues[F('effectiveDate')]).toBe('08/01/2026');
    // No Phase 1b input backing: form date and customer id boxes stay blank.
    expect(build.fieldValues[F('formDate')]).toBe('');
    expect(build.fieldValues[F('agencyCustomerId')]).toBe('');
    expect(build.fieldValues[F('agencyCustomerIdP2')]).toBe('');
    expect(build.fieldValues[F('agencyCustomerIdP3')]).toBe('');
    expect(build.fieldValues[F('agencyCustomerIdP4')]).toBe('');

    // Coverage form: occurrence checked, claims made not.
    expect(build.fieldValues[F('coverageOccurrenceCheckbox')]).toBe(true);
    expect(build.fieldValues[F('coverageClaimsMadeCheckbox')]).toBe(false);

    // Limits: bare grouped digits (the blank preprints the $ column).
    expect(build.fieldValues[F('limitEachOccurrence')]).toBe('1,000,000');
    expect(build.fieldValues[F('limitDamageToRentedPremises')]).toBe('100,000');
    expect(build.fieldValues[F('limitMedicalExpense')]).toBe('5,000');
    expect(build.fieldValues[F('limitPersonalAdvInjury')]).toBe('1,000,000');
    expect(build.fieldValues[F('limitGeneralAggregate')]).toBe('2,000,000');
    expect(build.fieldValues[F('limitProductsCompOpsAggregate')]).toBe('2,000,000');

    // Aggregate applies per: policy one-hot.
    expect(build.fieldValues[F('aggregatePolicyCheckbox')]).toBe(true);
    expect(build.fieldValues[F('aggregateProjectCheckbox')]).toBe(false);
    expect(build.fieldValues[F('aggregateLocationCheckbox')]).toBe(false);

    // Deductibles: no input backing, totality defaults.
    expect(build.fieldValues[F('deductiblePropertyDamageCheckbox')]).toBe(false);
    expect(build.fieldValues[F('deductiblePropertyDamageAmount')]).toBe('');
    expect(build.fieldValues[F('deductibleBodilyInjuryCheckbox')]).toBe(false);
    expect(build.fieldValues[F('deductibleBodilyInjuryAmount')]).toBe('');
    expect(build.fieldValues[F('deductiblePerClaimCheckbox')]).toBe(false);
    expect(build.fieldValues[F('deductiblePerOccurrenceCheckbox')]).toBe(false);

    // Hazard rows 1-2: exposure bare, rate decimal via String, premium '$'
    // prefixed (that column has no preprinted $).
    expect(build.fieldValues[F('hazard1ClassCode')]).toBe('92478');
    expect(build.fieldValues[F('hazard1PremiumBasis')]).toBe('P');
    expect(build.fieldValues[F('hazard1Exposure')]).toBe('850,000');
    expect(build.fieldValues[F('hazard1Territory')]).toBe('005');
    expect(build.fieldValues[F('hazard1Rate')]).toBe('6.25');
    expect(build.fieldValues[F('hazard1Premium')]).toBe('$5,313');
    expect(build.fieldValues[F('hazard2ClassCode')]).toBe('10026');
    expect(build.fieldValues[F('hazard2Exposure')]).toBe('1,200,000');
    expect(build.fieldValues[F('hazard2Rate')]).toBe('0.514');
    expect(build.fieldValues[F('hazard2Premium')]).toBe('$617');

    // Rows 3-9 at totality defaults.
    expect(build.fieldValues[F('hazard3ClassCode')]).toBe('');
    expect(build.fieldValues[F('hazard3Rate')]).toBe('');
    expect(build.fieldValues[F('hazard9Premium')]).toBe('');

    // The logicalValues view mirrors fieldValues.
    expect(build.logicalValues.effectiveDate).toBe('08/01/2026');
    expect(build.logicalValues.limitEachOccurrence).toBe('1,000,000');
    expect(build.logicalValues.hazard1Premium).toBe('$5,313');
  });

  it('output vocabulary: checkbox kinds are booleans, everything else strings', () => {
    const build = buildAcord126FieldValues(fullInput());
    for (const key of mapKeys) {
      const entry = ACORD126_FIELD_MAP[key];
      const v = build.fieldValues[entry.pdfField];
      if (entry.kind === 'checkbox') {
        expect(typeof v, `${key} should be boolean`).toBe('boolean');
      } else {
        expect(typeof v, `${key} should be string`).toBe('string');
      }
    }
  });

  it('coverage form boxes are mutually exclusive one way each (claims made alone)', () => {
    const input = fullInput();
    input.coverage = { occurrence: false, claimsMade: true };
    const build = buildAcord126FieldValues(input);
    expect(build.fieldValues[F('coverageClaimsMadeCheckbox')]).toBe(true);
    expect(build.fieldValues[F('coverageOccurrenceCheckbox')]).toBe(false);
  });

  it('aggregate applies per is one-hot for each vocabulary value and empty for null', () => {
    const boxes: Acord126LogicalKey[] = [
      'aggregatePolicyCheckbox',
      'aggregateProjectCheckbox',
      'aggregateLocationCheckbox',
    ];
    const cases: Array<['policy' | 'project' | 'location' | null, Acord126LogicalKey | null]> = [
      ['policy', 'aggregatePolicyCheckbox'],
      ['project', 'aggregateProjectCheckbox'],
      ['location', 'aggregateLocationCheckbox'],
      [null, null],
    ];
    for (const [value, checkedKey] of cases) {
      const input = fullInput();
      input.aggregateAppliesPer = value;
      const build = buildAcord126FieldValues(input);
      for (const box of boxes) {
        expect(build.fieldValues[F(box)], `${String(value)} -> ${box}`).toBe(box === checkedKey);
      }
    }
  });

  it('null limits print blank, never 0', () => {
    const input = fullInput();
    input.limits.medicalExpense = null;
    input.limits.damageToRentedPremises = null;
    const build = buildAcord126FieldValues(input);
    expect(build.fieldValues[F('limitMedicalExpense')]).toBe('');
    expect(build.fieldValues[F('limitDamageToRentedPremises')]).toBe('');
  });

  it('flags a malformed ISO date with DATE_INVALID and prints blank', () => {
    const input = fullInput();
    input.header.effectiveDate = '08/01/2026'; // not ISO
    const build = buildAcord126FieldValues(input);
    expect(build.ok).toBe(false);
    expect(build.fieldValues[F('effectiveDate')]).toBe('');
    expect(
      build.issues.some(
        (i) => i.code === 'DATE_INVALID' && i.logicalKeys?.includes('effectiveDate'),
      ),
    ).toBe(true);
  });

  it('drops hazard rows past row 9 with a HAZARDS_OVERFLOW warning (still ok)', () => {
    const input = fullInput();
    input.hazards = Array.from({ length: 10 }, (_, i) => ({
      classCode: `9000${i}`,
      premiumBasis: 'P',
      exposure: 1000 * (i + 1),
      territory: '001',
      rate: 1.5,
      premium: 100 + i,
    }));
    const build = buildAcord126FieldValues(input);
    expect(build.ok).toBe(true);
    expect(build.issues.some((i) => i.code === 'HAZARDS_OVERFLOW' && i.severity === 'warning')).toBe(
      true,
    );
    expect(build.fieldValues[F('hazard9ClassCode')]).toBe('90008');
    // Row 10 has nowhere to print; nothing in fieldValues carries it.
    expect(Object.values(build.fieldValues)).not.toContain('90009');
  });

  it('prints only the given values on an empty input; every field is its totality default', () => {
    const build = buildAcord126FieldValues(emptyInput());
    expect(build.ok).toBe(true);
    expect(build.issues).toEqual([]);
    for (const key of mapKeys) {
      const entry = ACORD126_FIELD_MAP[key];
      const v = build.fieldValues[entry.pdfField];
      if (entry.kind === 'checkbox') {
        expect(v, `${key} should default to false`).toBe(false);
      } else {
        expect(v, `${key} should default to ''`).toBe('');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// (d) Validator
// ---------------------------------------------------------------------------

describe('validateAcord126', () => {
  it('accepts a fully populated input', () => {
    const result = validateAcord126(fullInput());
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('rejects a missing each occurrence limit', () => {
    const input = fullInput();
    input.limits.eachOccurrence = null;
    const result = validateAcord126(input);
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.code)).toEqual(['EACH_OCCURRENCE_MISSING']);
  });

  it('rejects a missing general aggregate limit', () => {
    const input = fullInput();
    input.limits.generalAggregate = null;
    const result = validateAcord126(input);
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.code)).toEqual(['GENERAL_AGGREGATE_MISSING']);
  });

  it('rejects claims made and occurrence checked together', () => {
    const input = fullInput();
    input.coverage = { occurrence: true, claimsMade: true };
    const result = validateAcord126(input);
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.code)).toEqual(['COVERAGE_FORM_CONFLICT']);
  });

  it('accepts either coverage form alone, or neither', () => {
    for (const coverage of [
      { occurrence: true, claimsMade: false },
      { occurrence: false, claimsMade: true },
      { occurrence: false, claimsMade: false },
    ]) {
      const input = fullInput();
      input.coverage = coverage;
      const result = validateAcord126(input);
      expect(result.valid, JSON.stringify(coverage)).toBe(true);
    }
  });

  it('a zero limit is a value, not a missing limit', () => {
    const input = fullInput();
    input.limits.eachOccurrence = 0;
    const result = validateAcord126(input);
    expect(result.valid).toBe(true);
  });

  it('flags all three rules together on the worst input', () => {
    const input = fullInput();
    input.limits.eachOccurrence = null;
    input.limits.generalAggregate = null;
    input.coverage = { occurrence: true, claimsMade: true };
    const result = validateAcord126(input);
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.code).sort()).toEqual([
      'COVERAGE_FORM_CONFLICT',
      'EACH_OCCURRENCE_MISSING',
      'GENERAL_AGGREGATE_MISSING',
    ]);
  });

  it('flags both limit rules on an empty input', () => {
    const result = validateAcord126(emptyInput());
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.code).sort()).toEqual([
      'EACH_OCCURRENCE_MISSING',
      'GENERAL_AGGREGATE_MISSING',
    ]);
  });
});
