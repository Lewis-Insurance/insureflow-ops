// acord125.test.ts
//
// Contract tests for the ACORD 125 Phase 1b core engine
// (src/lib/acord/acord125/). Covers:
//   (a) inventory membership, THE critical test: every fieldMap pdfField (and
//       every ACORD125_EXPECTED_FIELD_NAMES entry) resolves verbatim in
//       src/lib/acord/blanks/acord125.inventory.json, mapped kinds agree with
//       inventory types (checkbox <-> CheckBox, everything else <-> TextField),
//       and no two logical keys share a pdfField.
//   (b) builder golden test over a fully populated input: date and premium
//       formatting, checkbox booleans, totality over the map, plus the
//       DATE_INVALID / premium-gating / PREMISES_OVERFLOW edges.
//   (c) empty input: only the completion date prints.
//   (d) validator accept/reject for the two authored rules.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ACORD125_EXPECTED_FIELD_NAMES,
  ACORD125_FIELD_MAP,
  type Acord125LogicalKey,
} from '@/lib/acord/acord125/fieldMap';
import { buildAcord125FieldValues } from '@/lib/acord/acord125/buildAcord125FieldValues';
import { validateAcord125 } from '@/lib/acord/acord125/validateAcord125';
import type { Acord125Input } from '@/lib/acord/acord125/types';

// ---------------------------------------------------------------------------
// Inventory (the authority the field map is authored against)
// ---------------------------------------------------------------------------

interface InventoryField {
  name: string;
  type: string;
  page: number;
  rect: number[];
}

// Resolved from the repo root (vitest cwd); import.meta.url is not a file URL
// under the jsdom test environment.
const inventoryPath = resolve(process.cwd(), 'src/lib/acord/blanks/acord125.inventory.json');
const inventory: InventoryField[] = JSON.parse(readFileSync(inventoryPath, 'utf8'));
const inventoryNames = new Set(inventory.map((f) => f.name));
const inventoryTypeByName = new Map(inventory.map((f) => [f.name, f.type]));

const mapKeys = Object.keys(ACORD125_FIELD_MAP) as Acord125LogicalKey[];

/** Shorthand: logical key -> exact pdf field name. */
function F(key: Acord125LogicalKey): string {
  return ACORD125_FIELD_MAP[key].pdfField;
}

// ---------------------------------------------------------------------------
// Fixtures (inline; the module has no pdf-lib dependency to synthesize around)
// ---------------------------------------------------------------------------

function fullInput(): Acord125Input {
  return {
    completionDate: '2026-07-01',
    producer: {
      name: 'Lewis Insurance Associates',
      addressLine1: '100 Main St',
      addressLine2: 'Suite 4',
      city: 'Fredericksburg',
      state: 'VA',
      zip: '22401',
      contactName: 'Landen Lewis',
      phone: '540 555 0100',
      fax: '540 555 0101',
      email: 'commercial@lewisinsurance.com',
      customerId: 'C-00042',
      authorizedRepName: 'Landen Lewis',
    },
    namedInsured: {
      name: 'Riverbend Electrical LLC',
      addressLine1: '9 Dock Rd',
      addressLine2: 'Unit B',
      city: 'Richmond',
      state: 'VA',
      zip: '23220',
      entityType: 'llc',
      fein: '12-3456789',
      sic: '1731',
      naics: '238210',
      phone: '804 555 0102',
      website: 'https://riverbend.example.com',
    },
    policy: {
      effectiveDate: '2026-08-01',
      expirationDate: '2027-08-01',
      policyNumber: 'CPP0012345',
    },
    linesOfBusiness: {
      gl: true,
      glPremium: 12500,
      property: true,
      auto: false,
      umbrella: true,
    },
    premises: [
      { street: '9 Dock Rd', city: 'Richmond', state: 'VA', zip: '23220', county: 'Henrico', interest: 'own' },
      { street: '14 Yard Way', city: 'Ashland', state: 'VA', zip: '23005', county: 'Hanover', interest: 'lease' },
    ],
    natureOfBusiness: {
      description: 'Electrical contractor serving commercial builds in central Virginia.',
    },
  };
}

function emptyInput(): Acord125Input {
  return {
    completionDate: '2026-07-01',
    producer: {
      name: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      zip: '',
      contactName: '',
      phone: '',
      fax: '',
      email: '',
      customerId: '',
      authorizedRepName: '',
    },
    namedInsured: {
      name: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      zip: '',
      entityType: null,
      fein: '',
      sic: '',
      naics: '',
      phone: '',
      website: '',
    },
    policy: { effectiveDate: '', expirationDate: '', policyNumber: '' },
    linesOfBusiness: { gl: false, glPremium: null, property: false, auto: false, umbrella: false },
    premises: [],
    natureOfBusiness: { description: '' },
  };
}

// ---------------------------------------------------------------------------
// (a) Inventory membership (the critical test)
// ---------------------------------------------------------------------------

describe('ACORD125_FIELD_MAP vs the blank inventory', () => {
  it('reads the committed 603-field inventory (drift tripwire, see blanks/README.md)', () => {
    expect(inventory.length).toBe(603);
  });

  it('every pdfField in the map exists VERBATIM in the inventory', () => {
    for (const key of mapKeys) {
      const { pdfField } = ACORD125_FIELD_MAP[key];
      expect(inventoryNames.has(pdfField), `${key} -> "${pdfField}" is not in the inventory`).toBe(
        true,
      );
    }
  });

  it('mapped kinds agree with inventory field types', () => {
    for (const key of mapKeys) {
      const entry = ACORD125_FIELD_MAP[key];
      const invType = inventoryTypeByName.get(entry.pdfField);
      if (entry.kind === 'checkbox') {
        expect(invType, `${key} should be a CheckBox on the blank`).toBe('CheckBox');
      } else {
        expect(invType, `${key} should be a TextField on the blank`).toBe('TextField');
      }
    }
  });

  it('no two logical keys share a pdfField', () => {
    const fields = mapKeys.map((k) => ACORD125_FIELD_MAP[k].pdfField);
    expect(new Set(fields).size).toBe(fields.length);
  });

  it('every ACORD125_EXPECTED_FIELD_NAMES entry exists in the inventory', () => {
    for (const name of ACORD125_EXPECTED_FIELD_NAMES) {
      expect(inventoryNames.has(name), `expected field "${name}" is not in the inventory`).toBe(
        true,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// (b) Builder golden test
// ---------------------------------------------------------------------------

describe('buildAcord125FieldValues golden output', () => {
  it('is total over the field map: exactly one value per pdfField', () => {
    const build = buildAcord125FieldValues(fullInput());
    const expected = new Set(mapKeys.map((k) => ACORD125_FIELD_MAP[k].pdfField));
    expect(new Set(Object.keys(build.fieldValues))).toEqual(expected);
    expect(Object.keys(build.fieldValues).length).toBe(expected.size);
  });

  it('fills the full input with formatted dates, grouped premium, and checkbox booleans', () => {
    const build = buildAcord125FieldValues(fullInput());
    expect(build.ok).toBe(true);
    expect(build.issues).toEqual([]);

    // Header + producer block.
    expect(build.fieldValues[F('completionDate')]).toBe('07/01/2026');
    expect(build.fieldValues[F('producerName')]).toBe('Lewis Insurance Associates');
    expect(build.fieldValues[F('producerAddress')]).toBe('100 Main St');
    expect(build.fieldValues[F('producerAddress2')]).toBe('Suite 4');
    expect(build.fieldValues[F('producerCity')]).toBe('Fredericksburg');
    expect(build.fieldValues[F('producerState')]).toBe('VA');
    expect(build.fieldValues[F('producerZip')]).toBe('22401');
    expect(build.fieldValues[F('producerContactName')]).toBe('Landen Lewis');
    expect(build.fieldValues[F('producerPhone')]).toBe('540 555 0100');
    expect(build.fieldValues[F('producerFax')]).toBe('540 555 0101');
    expect(build.fieldValues[F('producerEmail')]).toBe('commercial@lewisinsurance.com');

    // Agency customer id repeats on all four pages.
    expect(build.fieldValues[F('producerCustomerId')]).toBe('C-00042');
    expect(build.fieldValues[F('producerCustomerIdP2')]).toBe('C-00042');
    expect(build.fieldValues[F('producerCustomerIdP3')]).toBe('C-00042');
    expect(build.fieldValues[F('producerCustomerIdP4')]).toBe('C-00042');

    // Named insured #1.
    expect(build.fieldValues[F('insuredName')]).toBe('Riverbend Electrical LLC');
    expect(build.fieldValues[F('insuredAddress')]).toBe('9 Dock Rd');
    expect(build.fieldValues[F('insuredAddress2')]).toBe('Unit B');
    expect(build.fieldValues[F('insuredCity')]).toBe('Richmond');
    expect(build.fieldValues[F('insuredState')]).toBe('VA');
    expect(build.fieldValues[F('insuredZip')]).toBe('23220');
    expect(build.fieldValues[F('insuredFein')]).toBe('12-3456789');
    expect(build.fieldValues[F('insuredSic')]).toBe('1731');
    expect(build.fieldValues[F('insuredNaics')]).toBe('238210');
    expect(build.fieldValues[F('insuredPhone')]).toBe('804 555 0102');
    expect(build.fieldValues[F('insuredWebsite')]).toBe('https://riverbend.example.com');

    // Legal entity: llc checked, every other box false.
    expect(build.fieldValues[F('insuredEntityLlcCheckbox')]).toBe(true);
    expect(build.fieldValues[F('insuredEntityCorporationCheckbox')]).toBe(false);
    expect(build.fieldValues[F('insuredEntityIndividualCheckbox')]).toBe(false);
    expect(build.fieldValues[F('insuredEntityPartnershipCheckbox')]).toBe(false);
    expect(build.fieldValues[F('insuredEntityJointVentureCheckbox')]).toBe(false);
    expect(build.fieldValues[F('insuredEntityTrustCheckbox')]).toBe(false);
    expect(build.fieldValues[F('insuredEntityOtherCheckbox')]).toBe(false);
    expect(build.fieldValues[F('insuredEntityNotForProfitCheckbox')]).toBe(false);
    expect(build.fieldValues[F('insuredEntitySubchapterSCorpCheckbox')]).toBe(false);

    // Policy block.
    expect(build.fieldValues[F('policyNumber')]).toBe('CPP0012345');
    expect(build.fieldValues[F('policyEffectiveDate')]).toBe('08/01/2026');
    expect(build.fieldValues[F('policyExpirationDate')]).toBe('08/01/2027');

    // Lines of business: checkboxes are booleans, premium grouped, no '$'
    // (the blank preprints the dollar sign in the premium column).
    expect(build.fieldValues[F('lobGlCheckbox')]).toBe(true);
    expect(build.fieldValues[F('lobGlPremium')]).toBe('12,500');
    expect(build.fieldValues[F('lobPropertyCheckbox')]).toBe(true);
    expect(build.fieldValues[F('lobAutoCheckbox')]).toBe(false);
    expect(build.fieldValues[F('lobUmbrellaCheckbox')]).toBe(true);

    // Premises rows 1-2 filled, rows 3-4 at totality defaults.
    expect(build.fieldValues[F('premises1Street')]).toBe('9 Dock Rd');
    expect(build.fieldValues[F('premises1City')]).toBe('Richmond');
    expect(build.fieldValues[F('premises1State')]).toBe('VA');
    expect(build.fieldValues[F('premises1Zip')]).toBe('23220');
    expect(build.fieldValues[F('premises1County')]).toBe('Henrico');
    expect(build.fieldValues[F('premises1OwnCheckbox')]).toBe(true);
    expect(build.fieldValues[F('premises1LeaseCheckbox')]).toBe(false);
    expect(build.fieldValues[F('premises2Street')]).toBe('14 Yard Way');
    expect(build.fieldValues[F('premises2County')]).toBe('Hanover');
    expect(build.fieldValues[F('premises2OwnCheckbox')]).toBe(false);
    expect(build.fieldValues[F('premises2LeaseCheckbox')]).toBe(true);
    expect(build.fieldValues[F('premises3Street')]).toBe('');
    expect(build.fieldValues[F('premises3OwnCheckbox')]).toBe(false);
    expect(build.fieldValues[F('premises4Street')]).toBe('');
    expect(build.fieldValues[F('premises4LeaseCheckbox')]).toBe(false);

    // Nature of business: description prints, checkbox group stays unchecked
    // (no input backing in the Phase 1b model).
    expect(build.fieldValues[F('natureOfBusinessDescription')]).toBe(
      'Electrical contractor serving commercial builds in central Virginia.',
    );
    expect(build.fieldValues[F('natureContractorCheckbox')]).toBe(false);

    // Page 4 signature line: one input, both boxes.
    expect(build.fieldValues[F('producerSignature')]).toBe('Landen Lewis');
    expect(build.fieldValues[F('producerPrintedName')]).toBe('Landen Lewis');

    // The logicalValues view mirrors fieldValues.
    expect(build.logicalValues.completionDate).toBe('07/01/2026');
    expect(build.logicalValues.lobGlPremium).toBe('12,500');
  });

  it('output vocabulary: checkbox kinds are booleans, everything else strings', () => {
    const build = buildAcord125FieldValues(fullInput());
    for (const key of mapKeys) {
      const entry = ACORD125_FIELD_MAP[key];
      const v = build.fieldValues[entry.pdfField];
      if (entry.kind === 'checkbox') {
        expect(typeof v, `${key} should be boolean`).toBe('boolean');
      } else {
        expect(typeof v, `${key} should be string`).toBe('string');
      }
    }
  });

  it('groups a seven-figure premium', () => {
    const input = fullInput();
    input.linesOfBusiness.glPremium = 1234567;
    const build = buildAcord125FieldValues(input);
    expect(build.fieldValues[F('lobGlPremium')]).toBe('1,234,567');
  });

  it('never prints a premium on an unchecked GL line', () => {
    const input = fullInput();
    input.linesOfBusiness.gl = false;
    input.linesOfBusiness.glPremium = 9999;
    const build = buildAcord125FieldValues(input);
    expect(build.fieldValues[F('lobGlCheckbox')]).toBe(false);
    expect(build.fieldValues[F('lobGlPremium')]).toBe('');
  });

  it('flags a malformed ISO date with DATE_INVALID and prints blank', () => {
    const input = fullInput();
    input.policy.effectiveDate = '08/01/2026'; // not ISO
    const build = buildAcord125FieldValues(input);
    expect(build.ok).toBe(false);
    expect(build.fieldValues[F('policyEffectiveDate')]).toBe('');
    expect(
      build.issues.some(
        (i) => i.code === 'DATE_INVALID' && i.logicalKeys?.includes('policyEffectiveDate'),
      ),
    ).toBe(true);
  });

  it('drops premises past row 4 with a PREMISES_OVERFLOW warning (still ok)', () => {
    const input = fullInput();
    input.premises = [1, 2, 3, 4, 5].map((n) => ({
      street: `${n} Extra St`,
      city: 'Richmond',
      state: 'VA',
      zip: '23220',
      county: 'Henrico',
      interest: null,
    }));
    const build = buildAcord125FieldValues(input);
    expect(build.ok).toBe(true);
    expect(build.issues.some((i) => i.code === 'PREMISES_OVERFLOW' && i.severity === 'warning')).toBe(
      true,
    );
    expect(build.fieldValues[F('premises4Street')]).toBe('4 Extra St');
    // Row 5 has nowhere to print; nothing in fieldValues carries it.
    expect(Object.values(build.fieldValues)).not.toContain('5 Extra St');
  });
});

// ---------------------------------------------------------------------------
// (c) Empty input
// ---------------------------------------------------------------------------

describe('buildAcord125FieldValues empty input', () => {
  it('prints only the completion date; every other field is its totality default', () => {
    const build = buildAcord125FieldValues(emptyInput());
    expect(build.ok).toBe(true);
    expect(build.issues).toEqual([]);
    for (const key of mapKeys) {
      const entry = ACORD125_FIELD_MAP[key];
      const v = build.fieldValues[entry.pdfField];
      if (key === 'completionDate') {
        expect(v).toBe('07/01/2026');
      } else if (entry.kind === 'checkbox') {
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

describe('validateAcord125', () => {
  it('accepts a fully populated input', () => {
    const result = validateAcord125(fullInput());
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('rejects a blank named insured name', () => {
    const input = fullInput();
    input.namedInsured.name = '   ';
    const result = validateAcord125(input);
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.code)).toEqual(['INSURED_NAME_MISSING']);
  });

  it('rejects a checked line of business without an effective date', () => {
    const input = fullInput();
    input.policy.effectiveDate = '';
    const result = validateAcord125(input);
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.code)).toEqual(['EFFECTIVE_DATE_MISSING']);
  });

  it('fires only the name rule on an empty input (no LOB checked, so no date rule)', () => {
    const result = validateAcord125(emptyInput());
    expect(result.valid).toBe(false);
    // Name missing fires; the effective-date rule does not, because no line of
    // business is checked on the empty input.
    expect(result.issues.map((i) => i.code)).toEqual(['INSURED_NAME_MISSING']);
  });

  it('accepts a named insured with no lines checked and no effective date', () => {
    const input = emptyInput();
    input.namedInsured.name = 'Riverbend Electrical LLC';
    const result = validateAcord125(input);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('flags name and date together when both rules fail', () => {
    const input = fullInput();
    input.namedInsured.name = '';
    input.policy.effectiveDate = '';
    const result = validateAcord125(input);
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.code).sort()).toEqual([
      'EFFECTIVE_DATE_MISSING',
      'INSURED_NAME_MISSING',
    ]);
  });
});
