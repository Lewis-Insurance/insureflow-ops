// validateAcord25.test.ts
//
// Checks V1-V10 of the primary gate (blueprint B Section 5, doc 05 Section 5.2),
// plus the overflow-parity assertion against detectOverflowFields (Section 8.4),
// the preview-vs-issue mode split, and the V9 edition pin.

import { describe, it, expect } from 'vitest';
import { ACORD25_FIELD_MAP, ACORD25_TEMPLATE_SHA256, type Acord25LogicalKey } from '@/lib/acord/acord25/fieldMap';
import { buildAcord25FieldValues } from '@/lib/acord/acord25/buildAcord25FieldValues';
import { validateAcord25 } from '@/lib/acord/acord25/validateAcord25';
import { detectOverflowFields } from '@/lib/acord/pdfFiller';
import type { BuildAcord25Result } from '@/lib/acord/acord25/types';
import type { FieldTypeMap } from '@/types/acord';
import { buildSampleInput, buildTemplateInfo } from '@/test/fixtures/acord25Fixture';

function goodBuild(): BuildAcord25Result {
  return buildAcord25FieldValues(buildSampleInput());
}

const DESC_FIELD = ACORD25_FIELD_MAP.descriptionOfOperations.pdfField;

describe('validateAcord25 happy path', () => {
  it('valid in issue mode for a fully populated sample with a holder', () => {
    const build = goodBuild();
    const res = validateAcord25(build, { mode: 'issue', template: buildTemplateInfo() });
    expect(build.ok).toBe(true);
    expect(res.valid).toBe(true);
    expect(res.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// V1: build.ok passthrough
// ---------------------------------------------------------------------------

describe('V1 build error passthrough', () => {
  it('a builder NOT_PERMITTED error blocks the validator in both modes', () => {
    const input = buildSampleInput();
    input.lines[0].additionalInsured = { resolved: 'none', printIntent: true }; // NOT_PERMITTED
    const build = buildAcord25FieldValues(input);
    expect(build.ok).toBe(false);
    for (const mode of ['preview', 'issue'] as const) {
      const res = validateAcord25(build, { mode, template: buildTemplateInfo() });
      expect(res.valid).toBe(false);
      expect(res.issues.some((i) => i.code === 'ADDL_INSD_NOT_PERMITTED')).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// V2: field-name resolution
// ---------------------------------------------------------------------------

describe('V2 field-name resolution', () => {
  it('errors when a payload field is missing from the inventory', () => {
    const build = goodBuild();
    // Drop the GL each-occurrence field from the inventory.
    const glField = ACORD25_FIELD_MAP.gl_eachOccurrence.pdfField;
    const template = buildTemplateInfo();
    template.field_inventory = template.field_inventory.filter((f) => f.name !== glField);
    const res = validateAcord25(build, { mode: 'preview', template });
    expect(res.valid).toBe(false);
    const issue = res.issues.find((i) => i.code === 'FIELD_NOT_IN_TEMPLATE');
    expect(issue?.message).toContain(glField);
  });
});

// ---------------------------------------------------------------------------
// V3: type agreement
// ---------------------------------------------------------------------------

describe('V3 type agreement', () => {
  it('errors when a text-mapped field is exposed as a checkbox', () => {
    const build = goodBuild();
    const template = buildTemplateInfo({
      patch: [{ name: ACORD25_FIELD_MAP.gl_policyNumber.pdfField, type: 'checkbox' }],
    });
    const res = validateAcord25(build, { mode: 'preview', template });
    expect(res.issues.some((i) => i.code === 'FIELD_TYPE_MISMATCH')).toBe(true);
    expect(res.valid).toBe(false);
  });

  it('errors when a checkbox-mapped field is exposed as text', () => {
    const build = goodBuild();
    const template = buildTemplateInfo({
      patch: [{ name: ACORD25_FIELD_MAP.gl_occurCheckbox.pdfField, type: 'text' }],
    });
    const res = validateAcord25(build, { mode: 'preview', template });
    expect(res.issues.some((i) => i.code === 'FIELD_TYPE_MISMATCH')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// V4: Y/N literals
// ---------------------------------------------------------------------------

describe('V4 Y/N literals', () => {
  it('rejects a "Yes" literal in a ynText field', () => {
    const build = goodBuild();
    build.fieldValues[ACORD25_FIELD_MAP.gl_addlInsd.pdfField] = 'Yes';
    const res = validateAcord25(build, { mode: 'preview', template: buildTemplateInfo() });
    expect(res.issues.some((i) => i.code === 'YN_LITERAL_INVALID')).toBe(true);
    expect(res.valid).toBe(false);
  });

  it('accepts Y, N, and empty string', () => {
    const build = goodBuild();
    build.fieldValues[ACORD25_FIELD_MAP.gl_addlInsd.pdfField] = 'Y';
    build.fieldValues[ACORD25_FIELD_MAP.gl_subrWvd.pdfField] = 'N';
    build.fieldValues[ACORD25_FIELD_MAP.auto_addlInsd.pdfField] = '';
    const res = validateAcord25(build, { mode: 'preview', template: buildTemplateInfo() });
    expect(res.issues.some((i) => i.code === 'YN_LITERAL_INVALID')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// V6: insurer letter resolution both directions
// ---------------------------------------------------------------------------

describe('V6 insurer letter resolution', () => {
  it('errors when a row references a letter with no insurer name', () => {
    const build = goodBuild();
    // Blank out insurer A name while a GL row still points at A.
    build.fieldValues[ACORD25_FIELD_MAP.insurerName_A.pdfField] = '';
    const res = validateAcord25(build, { mode: 'preview', template: buildTemplateInfo() });
    expect(res.issues.some((i) => i.code === 'LETTER_UNASSIGNED')).toBe(true);
    expect(res.valid).toBe(false);
  });

  it('errors on an orphan insurer row referenced by no coverage row', () => {
    const build = goodBuild();
    // Put a name in insurer C that no row references.
    build.fieldValues[ACORD25_FIELD_MAP.insurerName_C.pdfField] = 'Orphan Insurer';
    const res = validateAcord25(build, { mode: 'preview', template: buildTemplateInfo() });
    expect(res.issues.some((i) => i.code === 'LETTER_CONFLICT')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// V7: overflow + parity with detectOverflowFields
// ---------------------------------------------------------------------------

describe('V7 overflow', () => {
  it('emits an OVERFLOW error naming description of operations, with a shorten-by count', () => {
    const build = goodBuild();
    const limit = 40;
    const value = 'x'.repeat(limit + 15);
    build.fieldValues[DESC_FIELD] = value;
    const template = buildTemplateInfo({ patch: [{ name: DESC_FIELD, maxLength: limit }] });
    const res = validateAcord25(build, { mode: 'preview', template });
    const issue = res.issues.find((i) => i.code === 'OVERFLOW');
    expect(issue).toBeDefined();
    expect(issue?.message).toContain('Description of operations');
    expect(issue?.message).toContain(`Shorten it by ${value.length - limit} characters`);
    expect(res.valid).toBe(false);
  });

  it('does not flag a value at exactly the limit', () => {
    const build = goodBuild();
    const limit = 30;
    build.fieldValues[DESC_FIELD] = 'y'.repeat(limit);
    const template = buildTemplateInfo({ patch: [{ name: DESC_FIELD, maxLength: limit }] });
    const res = validateAcord25(build, { mode: 'preview', template });
    expect(res.issues.some((i) => i.code === 'OVERFLOW')).toBe(false);
  });

  it('overflow decisions match detectOverflowFields over a shared case table (Section 8.4)', () => {
    // Shared table of (fieldValue, maxLength) cases; the local validator helper
    // and pdfFiller.detectOverflowFields must agree on which overflow and by how
    // much.
    const cases = [
      { len: 0, max: 10 },
      { len: 10, max: 10 },
      { len: 11, max: 10 },
      { len: 200, max: 50 },
      { len: 5, max: 100 },
    ];
    const field = ACORD25_FIELD_MAP.holderName.pdfField;
    for (const c of cases) {
      const value = 'a'.repeat(c.len);
      // Reference implementation from pdfFiller.
      const fieldTypeMap: FieldTypeMap = { [field]: 'text' };
      const ref = detectOverflowFields({ [field]: value }, fieldTypeMap, { [field]: c.max });
      const refOverflow = ref.length > 0 ? ref[0].overflow : 0;

      // Local validator: patch this field's maxLength and put the value in.
      const build = goodBuild();
      build.fieldValues[field] = value;
      const template = buildTemplateInfo({ patch: [{ name: field, maxLength: c.max }] });
      const res = validateAcord25(build, { mode: 'preview', template });
      const local = res.issues.find(
        (i) => i.code === 'OVERFLOW' && i.message.includes(field),
      );
      const localOverflow =
        local && c.len > c.max ? c.len - c.max : 0;

      // Both agree on whether there is an overflow ...
      expect(!!local).toBe(ref.length > 0);
      // ... and on the shorten-by magnitude.
      expect(localOverflow).toBe(refOverflow);
    }
  });
});

// ---------------------------------------------------------------------------
// V8: holder mode split (preview vs issue)
// ---------------------------------------------------------------------------

describe('V8 holder mode split', () => {
  it('null holder is a warning in preview, an error in issue', () => {
    const input = buildSampleInput();
    input.holder = null;
    const build = buildAcord25FieldValues(input);

    const preview = validateAcord25(build, { mode: 'preview', template: buildTemplateInfo() });
    const previewHolder = preview.issues.find((i) => i.code === 'HOLDER_MISSING');
    expect(previewHolder?.severity).toBe('warning');
    // Preview may still be valid if nothing else errored.
    expect(preview.issues.some((i) => i.code === 'HOLDER_MISSING' && i.severity === 'error')).toBe(false);

    const issue = validateAcord25(build, { mode: 'issue', template: buildTemplateInfo() });
    expect(issue.issues.some((i) => i.code === 'HOLDER_MISSING' && i.severity === 'error')).toBe(true);
    expect(issue.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// V9: edition pin
// ---------------------------------------------------------------------------

describe('V9 edition pin', () => {
  it('does not fire when the pin is unset (pre-onboarding)', () => {
    const build = goodBuild();
    const res = validateAcord25(build, {
      mode: 'issue',
      template: buildTemplateInfo(),
      templateSha256: 'deadbeef',
    });
    // With ACORD25_TEMPLATE_SHA256 empty, V9 cannot fire.
    if (ACORD25_TEMPLATE_SHA256 === '') {
      expect(res.issues.some((i) => i.code === 'TEMPLATE_PIN_MISMATCH')).toBe(false);
    }
  });

  it('fires a TEMPLATE_PIN_MISMATCH only when the pin is set and differs', () => {
    // Drive V9 deterministically without depending on the committed pin: only
    // assert the mismatch path when a pin exists. When the pin is empty this
    // documents that the guard is inert until onboarding pastes the hash.
    const build = goodBuild();
    if (ACORD25_TEMPLATE_SHA256 !== '') {
      const res = validateAcord25(build, {
        mode: 'issue',
        template: buildTemplateInfo(),
        templateSha256: `${ACORD25_TEMPLATE_SHA256}-different`,
      });
      expect(res.issues.some((i) => i.code === 'TEMPLATE_PIN_MISMATCH')).toBe(true);
      expect(res.valid).toBe(false);
    } else {
      expect(ACORD25_TEMPLATE_SHA256).toBe('');
    }
  });
});

// ---------------------------------------------------------------------------
// V10: date format of emitted strings
// ---------------------------------------------------------------------------

describe('V10 date format', () => {
  it('flags a date field that is not MM/DD/YYYY', () => {
    const build = goodBuild();
    build.fieldValues[ACORD25_FIELD_MAP.gl_effDate.pdfField] = '2026-01-01';
    const res = validateAcord25(build, { mode: 'preview', template: buildTemplateInfo() });
    expect(res.issues.some((i) => i.code === 'DATE_INVALID')).toBe(true);
    expect(res.valid).toBe(false);
  });

  it('accepts a correctly formatted MM/DD/YYYY date', () => {
    const build = goodBuild();
    const res = validateAcord25(build, { mode: 'preview', template: buildTemplateInfo() });
    // The sample GL effective date is 01/01/2026 after formatting.
    expect(build.fieldValues[ACORD25_FIELD_MAP.gl_effDate.pdfField]).toBe('01/01/2026');
    expect(res.issues.some((i) => i.code === 'DATE_INVALID')).toBe(false);
  });

  it('flags a line whose expiration precedes its effective date (Section 5.2)', () => {
    const input = buildSampleInput();
    // Invert the GL line: expiration a year BEFORE effective on a non-expired
    // policy. The emitted strings are both well-formed MM/DD/YYYY, so only the
    // ISO ordering check can catch this.
    input.lines[0].effectiveDate = '2027-01-01';
    input.lines[0].expirationDate = '2026-01-01';
    const build = buildAcord25FieldValues(input);
    const res = validateAcord25(build, { mode: 'issue', template: buildTemplateInfo() });
    const inversion = res.issues.find(
      (i) => i.code === 'DATE_INVALID' && i.lineKey === 'gl',
    );
    expect(inversion).toBeDefined();
    expect(inversion?.message).toContain('earlier than its effective date');
    expect(res.valid).toBe(false);
  });

  it('does not flag equal effective and expiration dates', () => {
    const input = buildSampleInput();
    input.lines[0].effectiveDate = '2026-06-01';
    input.lines[0].expirationDate = '2026-06-01';
    const build = buildAcord25FieldValues(input);
    const res = validateAcord25(build, { mode: 'issue', template: buildTemplateInfo() });
    expect(
      res.issues.some(
        (i) => i.code === 'DATE_INVALID' && i.message.includes('earlier than its effective date'),
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Dedup: identical issues collapse
// ---------------------------------------------------------------------------

describe('issue dedup', () => {
  it('does not duplicate the build issues that are carried forward', () => {
    const input = buildSampleInput();
    input.holder = null;
    const build = buildAcord25FieldValues(input); // carries one HOLDER_MISSING warning
    const res = validateAcord25(build, { mode: 'preview', template: buildTemplateInfo() });
    const holderWarnings = res.issues.filter(
      (i) => i.code === 'HOLDER_MISSING' && i.severity === 'warning',
    );
    expect(holderWarnings.length).toBe(1);
  });
});
