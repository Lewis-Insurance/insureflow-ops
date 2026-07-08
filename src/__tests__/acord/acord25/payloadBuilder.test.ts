// payloadBuilder.test.ts
//
// Contract tests for buildAcord25FieldValues (blueprint B Sections 4.2-4.8, 8).
// Covers: totality over the field map (key set == map pdfField set), the D8
// premium sentinel, the full ADDL INSD / SUBR WVD print-flag matrix per row,
// date formatting + DATE_INVALID, limit formatting, and the DOO/remarks join.

import { describe, it, expect } from 'vitest';
import {
  ACORD25_FIELD_MAP,
  type Acord25LogicalKey,
} from '@/lib/acord/acord25/fieldMap';
import { buildAcord25FieldValues } from '@/lib/acord/acord25/buildAcord25FieldValues';
import { formatLimit } from '@/lib/acord/acord25/format';
import type {
  Acord25BuildInput,
  Acord25CoverageLine,
  Acord25LineKey,
  Acord25PrintFlag,
  HolderResolvedStatus,
} from '@/lib/acord/acord25/types';
import { buildSampleInput } from '@/test/fixtures/acord25Fixture';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapPdfFields(): string[] {
  return (Object.keys(ACORD25_FIELD_MAP) as Acord25LogicalKey[]).map(
    (k) => ACORD25_FIELD_MAP[k].pdfField,
  );
}

// A minimal single-line input with one carrier and one selected line.
function oneLineInput(line: Acord25CoverageLine, opts?: Partial<Acord25BuildInput>): Acord25BuildInput {
  return {
    certificateDate: '2026-07-01',
    certificateNumber: null,
    revisionNumber: null,
    producer: {
      agencyName: 'Agency',
      addressLines: ['1 St', 'Town, IL 60000'],
      contactName: 'C',
      phone: 'p',
      fax: '',
      email: 'e@x.com',
    },
    insured: { name: 'Insured', addressLines: ['2 Ave', 'City, IL 60001'] },
    lines: [line],
    letterAssignments: [{ letter: 'A', name: 'Carrier A', naic: '11111', lines: [line.line] }],
    descriptionOfOperations: '',
    remarks: '',
    holder: { name: 'Holder', addressLines: ['3 Rd', 'Vil, IL 60002'] },
    authorizedRepName: 'Rep',
    ...opts,
  };
}

function glLine(over?: Partial<Acord25CoverageLine>): Acord25CoverageLine {
  return {
    line: 'gl',
    policyId: 'p1',
    policyNumber: 'GL1',
    effectiveDate: '2026-01-01',
    expirationDate: '2027-01-01',
    additionalInsured: { resolved: 'endorsed', printIntent: true },
    waiverOfSubrogation: { resolved: 'endorsed', printIntent: true },
    gl: {
      occurrence: true,
      claimsMade: false,
      aggregateAppliesPer: 'policy',
      eachOccurrence: 1000000,
      damageToRented: null,
      medExp: null,
      personalAdvInjury: null,
      generalAggregate: 2000000,
      productsCompOpAgg: null,
    },
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Totality (D5)
// ---------------------------------------------------------------------------

describe('buildAcord25FieldValues totality (D5)', () => {
  it('emits exactly one value per field-map pdfField, no more no fewer', () => {
    const build = buildAcord25FieldValues(buildSampleInput());
    const expected = new Set(mapPdfFields());
    const actual = new Set(Object.keys(build.fieldValues));
    expect(actual).toEqual(expected);
    // Every mapped field is present (the two sets being equal already proves it,
    // but assert the count too so a duplicate pdfField would be caught).
    expect(Object.keys(build.fieldValues).length).toBe(expected.size);
  });

  it('unused text/date/limit/ynText fields are empty string and unused checkboxes are false', () => {
    // Select only GL: every non-GL, non-shared field must be its totality default.
    const build = buildAcord25FieldValues(oneLineInput(glLine()));
    // Auto policy number field is unused -> ''.
    expect(build.fieldValues[ACORD25_FIELD_MAP.auto_policyNumber.pdfField]).toBe('');
    // Auto any-auto checkbox unused -> false (boolean, not '').
    expect(build.fieldValues[ACORD25_FIELD_MAP.auto_anyAutoCheckbox.pdfField]).toBe(false);
    // WC subr waived unused -> '' (ynText default).
    expect(build.fieldValues[ACORD25_FIELD_MAP.wc_subrWvd.pdfField]).toBe('');
  });

  it('checkbox kinds are booleans and ynText kinds are Y/N/"" (D14 vocabulary)', () => {
    const build = buildAcord25FieldValues(buildSampleInput());
    for (const key of Object.keys(ACORD25_FIELD_MAP) as Acord25LogicalKey[]) {
      const entry = ACORD25_FIELD_MAP[key];
      const v = build.fieldValues[entry.pdfField];
      if (entry.kind === 'checkbox') {
        expect(typeof v).toBe('boolean');
      } else if (entry.kind === 'ynText') {
        expect(v === 'Y' || v === 'N' || v === '').toBe(true);
      } else {
        expect(typeof v).toBe('string');
      }
      // No export-value literals ever.
      expect(v).not.toBe('/1');
      expect(v).not.toBe('/Off');
    }
  });

  it('logicalValues mirrors fieldValues through the map', () => {
    const build = buildAcord25FieldValues(buildSampleInput());
    for (const key of Object.keys(ACORD25_FIELD_MAP) as Acord25LogicalKey[]) {
      const entry = ACORD25_FIELD_MAP[key];
      expect(build.logicalValues[key]).toEqual(build.fieldValues[entry.pdfField]);
    }
  });

  it('is pure and deterministic: same input produces byte-identical output', () => {
    // The snapshot freeze, the preview_sha256 binding, and holder-swap preview
    // regeneration all rely on the builder being a pure function. Two builds of
    // the same input must deep-equal on fieldValues, logicalValues, ok, and the
    // line-date context, and their JSON serialization must be byte-identical.
    const a = buildAcord25FieldValues(buildSampleInput());
    const b = buildAcord25FieldValues(buildSampleInput());
    expect(b.fieldValues).toEqual(a.fieldValues);
    expect(b.logicalValues).toEqual(a.logicalValues);
    expect(b.ok).toEqual(a.ok);
    expect(b.lineDates).toEqual(a.lineDates);
    expect(JSON.stringify(b.fieldValues)).toEqual(JSON.stringify(a.fieldValues));
  });
});

// ---------------------------------------------------------------------------
// Premium sentinel (D8)
// ---------------------------------------------------------------------------

describe('buildAcord25FieldValues premium exclusion (D8)', () => {
  it('no injected premium value ever appears anywhere in the payload', () => {
    // The input types have no premium field. Inject one via `as any` to simulate
    // a buggy caller and assert the sentinel numbers never leak into any string.
    const input = buildSampleInput();
    const dirty = { ...input, premium: 987654 } as unknown as Acord25BuildInput;
    const build = buildAcord25FieldValues(dirty);
    for (const v of Object.values(build.fieldValues)) {
      if (typeof v === 'string') {
        expect(v).not.toContain('987654');
        expect(v).not.toContain('987,654');
      }
    }
  });

  it('the input type does not admit a premium field (compile-time guard)', () => {
    // @ts-expect-error premium is intentionally absent from Acord25BuildInput.
    const _bad: Acord25BuildInput = { ...buildSampleInput(), premium: 1 };
    void _bad;
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Print-flag matrix (Section 4.4) across ALL rows with an ADDL/SUBR column
// ---------------------------------------------------------------------------

type MatrixCase = {
  resolved: HolderResolvedStatus;
  printIntent: boolean;
  printed: 'Y' | 'N';
  code: string | null;
  severity: 'error' | 'warning' | null;
};

// Print intent is authoritative: Y whenever the toggle is on, N when off. A Y
// with no confirmed endorsement prints Y and records a NON-BLOCKING MANUAL
// advisory (never an error); toggling off is a clean N with no issue.
const MATRIX: MatrixCase[] = [
  { resolved: 'endorsed', printIntent: true, printed: 'Y', code: null, severity: null },
  { resolved: 'endorsed', printIntent: false, printed: 'N', code: null, severity: null },
  { resolved: 'requested', printIntent: false, printed: 'N', code: null, severity: null },
  { resolved: 'requested', printIntent: true, printed: 'Y', code: 'MANUAL', severity: 'warning' },
  { resolved: 'none', printIntent: false, printed: 'N', code: null, severity: null },
  { resolved: 'none', printIntent: true, printed: 'Y', code: 'MANUAL', severity: 'warning' },
];

// Rows that carry an ADDL INSD column (WC does not).
const ADDL_ROWS: Array<{ line: Acord25LineKey; addlKey: Acord25LogicalKey; subrKey: Acord25LogicalKey }> = [
  { line: 'gl', addlKey: 'gl_addlInsd', subrKey: 'gl_subrWvd' },
  { line: 'auto', addlKey: 'auto_addlInsd', subrKey: 'auto_subrWvd' },
  { line: 'umbrella', addlKey: 'umb_addlInsd', subrKey: 'umb_subrWvd' },
  { line: 'other', addlKey: 'other_addlInsd', subrKey: 'other_subrWvd' },
];

function detailFor(line: Acord25LineKey): Partial<Acord25CoverageLine> {
  switch (line) {
    case 'gl':
      return {
        gl: {
          occurrence: true,
          claimsMade: false,
          aggregateAppliesPer: 'policy',
          eachOccurrence: 1000000,
          damageToRented: null,
          medExp: null,
          personalAdvInjury: null,
          generalAggregate: 2000000,
          productsCompOpAgg: null,
        },
      };
    case 'auto':
      return {
        auto: {
          anyAuto: true,
          ownedOnly: false,
          scheduled: false,
          hired: false,
          nonOwned: false,
          combinedSingleLimit: 1000000,
          biPerPerson: null,
          biPerAccident: null,
          propertyDamage: null,
        },
      };
    case 'umbrella':
      return {
        umbrella: {
          type: 'umbrella',
          basis: 'occurrence',
          dedOrRetention: null,
          eachOccurrence: 1000000,
          aggregate: 1000000,
        },
      };
    case 'other':
      return { otherRow: { typeLabel: 'Property', limitsText: 'Building $500,000' } };
    default:
      return {};
  }
}

describe('ADDL INSD print-flag matrix (Section 4.4)', () => {
  for (const row of ADDL_ROWS) {
    for (const c of MATRIX) {
      it(`${row.line} ADDL INSD: ${c.resolved}/${c.printIntent} -> ${c.printed}`, () => {
        const flag: Acord25PrintFlag = { resolved: c.resolved, printIntent: c.printIntent };
        const line: Acord25CoverageLine = {
          line: row.line,
          policyId: 'p',
          policyNumber: 'PN',
          effectiveDate: '2026-01-01',
          expirationDate: '2027-01-01',
          additionalInsured: flag,
          waiverOfSubrogation: { resolved: 'none', printIntent: false },
          ...detailFor(row.line),
        };
        const input = oneLineInput(line, {
          letterAssignments: [{ letter: 'A', name: 'A', naic: '1', lines: [row.line] }],
        });
        const build = buildAcord25FieldValues(input);
        expect(build.fieldValues[ACORD25_FIELD_MAP[row.addlKey].pdfField]).toBe(c.printed);
        if (c.code) {
          const issue = build.issues.find((i) => i.code === `ADDL_INSD_${c.code}`);
          expect(issue, `expected ADDL_INSD_${c.code}`).toBeDefined();
          expect(issue?.severity).toBe(c.severity);
        }
      });
    }
  }
});

describe('SUBR WVD print-flag matrix, all rows including WC (Section 4.4)', () => {
  const SUBR_ROWS: Array<{ line: Acord25LineKey; subrKey: Acord25LogicalKey }> = [
    ...ADDL_ROWS.map((r) => ({ line: r.line, subrKey: r.subrKey })),
    { line: 'wc', subrKey: 'wc_subrWvd' },
  ];
  for (const row of SUBR_ROWS) {
    for (const c of MATRIX) {
      it(`${row.line} SUBR WVD: ${c.resolved}/${c.printIntent} -> ${c.printed}`, () => {
        const flag: Acord25PrintFlag = { resolved: c.resolved, printIntent: c.printIntent };
        const wcDetail =
          row.line === 'wc'
            ? {
                wc: {
                  perStatute: true,
                  other: false,
                  proprietorExcluded: null,
                  elEachAccident: 1000000,
                  elDiseaseEachEmployee: 1000000,
                  elDiseasePolicyLimit: 1000000,
                },
              }
            : detailFor(row.line);
        const line: Acord25CoverageLine = {
          line: row.line,
          policyId: 'p',
          policyNumber: 'PN',
          effectiveDate: '2026-01-01',
          expirationDate: '2027-01-01',
          additionalInsured: row.line === 'wc' ? null : { resolved: 'none', printIntent: false },
          waiverOfSubrogation: flag,
          ...wcDetail,
        };
        const input = oneLineInput(line, {
          letterAssignments: [{ letter: 'A', name: 'A', naic: '1', lines: [row.line] }],
        });
        const build = buildAcord25FieldValues(input);
        expect(build.fieldValues[ACORD25_FIELD_MAP[row.subrKey].pdfField]).toBe(c.printed);
        if (c.code) {
          const issue = build.issues.find((i) => i.code === `SUBR_WVD_${c.code}`);
          expect(issue, `expected SUBR_WVD_${c.code}`).toBeDefined();
          expect(issue?.severity).toBe(c.severity);
        }
      });
    }
  }

  it('prints a manual Y with only a non-blocking advisory (build still ok)', () => {
    const line = glLine({
      additionalInsured: { resolved: 'none', printIntent: true }, // manual
      waiverOfSubrogation: { resolved: 'requested', printIntent: true }, // manual
    });
    const build = buildAcord25FieldValues(oneLineInput(line));
    // Manual assertions never block issuance: warnings only.
    expect(build.ok).toBe(true);
    expect(build.fieldValues[ACORD25_FIELD_MAP.gl_addlInsd.pdfField]).toBe('Y');
    expect(build.fieldValues[ACORD25_FIELD_MAP.gl_subrWvd.pdfField]).toBe('Y');
    expect(build.issues.find((i) => i.code === 'ADDL_INSD_MANUAL')?.severity).toBe('warning');
    expect(build.issues.find((i) => i.code === 'SUBR_WVD_MANUAL')?.severity).toBe('warning');
  });
});

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

describe('dates (Section 4.6)', () => {
  it('formats ISO YYYY-MM-DD to M/D/YYYY (no leading zeros)', () => {
    const build = buildAcord25FieldValues(oneLineInput(glLine({ effectiveDate: '2026-07-01' })));
    expect(build.fieldValues[ACORD25_FIELD_MAP.gl_effDate.pdfField]).toBe('7/1/2026');
  });

  it('empty date -> empty string, no issue', () => {
    const build = buildAcord25FieldValues(oneLineInput(glLine({ effectiveDate: '' })));
    expect(build.fieldValues[ACORD25_FIELD_MAP.gl_effDate.pdfField]).toBe('');
    expect(build.issues.find((i) => i.code === 'DATE_INVALID')).toBeUndefined();
  });

  it('malformed date -> DATE_INVALID error and empty field', () => {
    const build = buildAcord25FieldValues(oneLineInput(glLine({ effectiveDate: '07/01/2026' })));
    const issue = build.issues.find((i) => i.code === 'DATE_INVALID');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('error');
    expect(build.ok).toBe(false);
    expect(build.fieldValues[ACORD25_FIELD_MAP.gl_effDate.pdfField]).toBe('');
  });

  it('certificate date is formatted through the same path', () => {
    const build = buildAcord25FieldValues(oneLineInput(glLine(), { certificateDate: '2026-12-25' }));
    expect(build.fieldValues[ACORD25_FIELD_MAP.certificateDate.pdfField]).toBe('12/25/2026');
  });
});

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

describe('limits (Section 4.6)', () => {
  it('1000000 -> 1,000,000 with no $ (box has preprinted dollar)', () => {
    const build = buildAcord25FieldValues(oneLineInput(glLine()));
    expect(build.fieldValues[ACORD25_FIELD_MAP.gl_eachOccurrence.pdfField]).toBe('1,000,000');
  });

  it('null limit -> empty string, never "0"', () => {
    const build = buildAcord25FieldValues(oneLineInput(glLine()));
    expect(build.fieldValues[ACORD25_FIELD_MAP.gl_medExp.pdfField]).toBe('');
  });

  it('zero limit -> "0" (formatLimit is total)', () => {
    expect(formatLimit(0)).toBe('0');
    expect(formatLimit(250)).toBe('250');
    expect(formatLimit(1000000)).toBe('1,000,000');
  });
});

// ---------------------------------------------------------------------------
// DOO + remarks join (Section 4.6, D18)
// ---------------------------------------------------------------------------

describe('description of operations + remarks join (D18)', () => {
  it('joins doo and remarks with a blank line when both present', () => {
    const build = buildAcord25FieldValues(
      oneLineInput(glLine(), { descriptionOfOperations: 'DOO body', remarks: 'REM body' }),
    );
    expect(build.fieldValues[ACORD25_FIELD_MAP.descriptionOfOperations.pdfField]).toBe('DOO body\n\nREM body');
  });

  it('doo only when remarks empty (no trailing separator)', () => {
    const build = buildAcord25FieldValues(
      oneLineInput(glLine(), { descriptionOfOperations: 'DOO body', remarks: '   ' }),
    );
    expect(build.fieldValues[ACORD25_FIELD_MAP.descriptionOfOperations.pdfField]).toBe('DOO body');
  });

  it('trims both inputs before joining', () => {
    const build = buildAcord25FieldValues(
      oneLineInput(glLine(), { descriptionOfOperations: '  A  ', remarks: '  B  ' }),
    );
    expect(build.fieldValues[ACORD25_FIELD_MAP.descriptionOfOperations.pdfField]).toBe('A\n\nB');
  });
});

// ---------------------------------------------------------------------------
// OTHER row conflict + no-lines guard
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Per-section write-in coverages (Section 0.1 write-in rows)
// ---------------------------------------------------------------------------

describe('per-section write-in coverages', () => {
  it('fills the GL write-in description + amount when GL is selected', () => {
    const input = oneLineInput(glLine(), {
      writeInCoverages: { gl: { name: 'Hired/Non-Owned Auto', amount: 1000000 } },
    });
    const build = buildAcord25FieldValues(input);
    expect(build.fieldValues[ACORD25_FIELD_MAP.gl_writeInDesc.pdfField]).toBe('Hired/Non-Owned Auto');
    // Amount column has a preprinted $, so no leading '$'; comma-grouped.
    expect(build.fieldValues[ACORD25_FIELD_MAP.gl_writeInAmount.pdfField]).toBe('1,000,000');
    expect(build.ok).toBe(true);
  });

  it('emits nothing for a write-in whose line is not selected', () => {
    // Only GL is selected; an auto write-in must NOT print (line gating, R5).
    const input = oneLineInput(glLine(), {
      writeInCoverages: { auto: { name: 'Rental Reimbursement', amount: 50000 } },
    });
    const build = buildAcord25FieldValues(input);
    expect(build.fieldValues[ACORD25_FIELD_MAP.auto_writeInDesc.pdfField]).toBe('');
    expect(build.fieldValues[ACORD25_FIELD_MAP.auto_writeInAmount.pdfField]).toBe('');
  });

  it('a null write-in amount emits an empty amount field, never "0"', () => {
    const input = oneLineInput(glLine(), {
      writeInCoverages: { gl: { name: 'Blanket Additional Insured', amount: null } },
    });
    const build = buildAcord25FieldValues(input);
    expect(build.fieldValues[ACORD25_FIELD_MAP.gl_writeInDesc.pdfField]).toBe('Blanket Additional Insured');
    expect(build.fieldValues[ACORD25_FIELD_MAP.gl_writeInAmount.pdfField]).toBe('');
  });

  it('absent writeInCoverages leaves all write-in fields at totality default', () => {
    const build = buildAcord25FieldValues(oneLineInput(glLine()));
    expect(build.fieldValues[ACORD25_FIELD_MAP.gl_writeInDesc.pdfField]).toBe('');
    expect(build.fieldValues[ACORD25_FIELD_MAP.gl_writeInAmount.pdfField]).toBe('');
    expect(build.fieldValues[ACORD25_FIELD_MAP.auto_writeInDesc.pdfField]).toBe('');
    expect(build.fieldValues[ACORD25_FIELD_MAP.umb_writeInDesc.pdfField]).toBe('');
  });
});

describe('structural guards', () => {
  it('no selected lines -> NO_LINES_SELECTED error', () => {
    const build = buildAcord25FieldValues(oneLineInput(glLine(), { lines: [] }));
    expect(build.ok).toBe(false);
    expect(build.issues.find((i) => i.code === 'NO_LINES_SELECTED')).toBeDefined();
  });

  it('two OTHER-row lines -> OTHER_ROW_CONFLICT error', () => {
    const prop: Acord25CoverageLine = {
      line: 'property',
      policyId: 'p',
      policyNumber: 'PR1',
      effectiveDate: '2026-01-01',
      expirationDate: '2027-01-01',
      additionalInsured: { resolved: 'none', printIntent: false },
      waiverOfSubrogation: { resolved: 'none', printIntent: false },
      otherRow: { typeLabel: 'Property', limitsText: 'A' },
    };
    const other: Acord25CoverageLine = { ...prop, line: 'other', otherRow: { typeLabel: 'Other', limitsText: 'B' } };
    const input = oneLineInput(prop, {
      lines: [prop, other],
      letterAssignments: [{ letter: 'A', name: 'A', naic: '1', lines: ['property', 'other'] }],
    });
    const build = buildAcord25FieldValues(input);
    expect(build.ok).toBe(false);
    expect(build.issues.find((i) => i.code === 'OTHER_ROW_CONFLICT')).toBeDefined();
  });
});
