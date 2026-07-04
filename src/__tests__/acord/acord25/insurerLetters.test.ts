// insurerLetters.test.ts
//
// Pure tests for the builder's letter-consumption logic and the validator's V6
// cross-check (blueprint B Section 4.3, 8). The letter ASSIGNMENT algorithm
// itself lives in SQL (get_master_coi, doc 02, R7) and is tested there; here we
// prove the builder faithfully PLACES a supplied letter map and that the
// defensive backstops fire on hand-built (buggy-caller) inputs.

import { describe, it, expect } from 'vitest';
import { ACORD25_FIELD_MAP } from '@/lib/acord/acord25/fieldMap';
import { buildAcord25FieldValues } from '@/lib/acord/acord25/buildAcord25FieldValues';
import { validateAcord25 } from '@/lib/acord/acord25/validateAcord25';
import type {
  Acord25BuildInput,
  Acord25CoverageLine,
  Acord25LineKey,
  InsurerAssignment,
} from '@/lib/acord/acord25/types';
import { buildTemplateInfo } from '@/test/fixtures/acord25Fixture';

// A tiny factory: one coverage line per requested line key, with valid detail so
// only the letter logic is exercised.
function lineFor(line: Acord25LineKey): Acord25CoverageLine {
  const base = {
    policyId: `p-${line}`,
    policyNumber: `PN-${line}`,
    effectiveDate: '2026-01-01',
    expirationDate: '2027-01-01',
    additionalInsured: line === 'wc' ? null : { resolved: 'none' as const, printIntent: false },
    waiverOfSubrogation: { resolved: 'none' as const, printIntent: false },
  };
  switch (line) {
    case 'gl':
      return {
        line,
        ...base,
        gl: {
          occurrence: true,
          claimsMade: false,
          aggregateAppliesPer: 'policy',
          eachOccurrence: 1000000,
          damageToRented: null,
          medExp: null,
          personalAdvInjury: null,
          generalAggregate: null,
          productsCompOpAgg: null,
        },
      };
    case 'auto':
      return {
        line,
        ...base,
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
        line,
        ...base,
        umbrella: { type: 'umbrella', basis: 'occurrence', dedOrRetention: null, eachOccurrence: 1000000, aggregate: 1000000 },
      };
    case 'wc':
      return {
        line,
        ...base,
        wc: {
          perStatute: true,
          other: false,
          proprietorExcluded: null,
          elEachAccident: 1000000,
          elDiseaseEachEmployee: 1000000,
          elDiseasePolicyLimit: 1000000,
        },
      };
    default:
      return { line, ...base, otherRow: { typeLabel: 'Other', limitsText: 'X' } };
  }
}

function inputWith(lines: Acord25LineKey[], assignments: InsurerAssignment[]): Acord25BuildInput {
  return {
    certificateDate: '2026-07-01',
    certificateNumber: null,
    revisionNumber: null,
    producer: { agencyName: 'A', addressLines: ['1 St'], contactName: 'c', phone: 'p', fax: '', email: 'e@x.com' },
    insured: { name: 'I', addressLines: ['2 Ave'] },
    lines: lines.map(lineFor),
    letterAssignments: assignments,
    descriptionOfOperations: '',
    remarks: '',
    holder: { name: 'H', addressLines: ['3 Rd'] },
    authorizedRepName: 'R',
  };
}

// ---------------------------------------------------------------------------
// Faithful placement
// ---------------------------------------------------------------------------

describe('letter placement', () => {
  it('writes each line insurer letter and populates only referenced insurer rows', () => {
    const build = buildAcord25FieldValues(
      inputWith(
        ['gl', 'auto'],
        [
          { letter: 'A', name: 'Carrier A', naic: '111', lines: ['gl'] },
          { letter: 'B', name: 'Carrier B', naic: '222', lines: ['auto'] },
        ],
      ),
    );
    expect(build.fieldValues[ACORD25_FIELD_MAP.gl_insrLtr.pdfField]).toBe('A');
    expect(build.fieldValues[ACORD25_FIELD_MAP.auto_insrLtr.pdfField]).toBe('B');
    expect(build.fieldValues[ACORD25_FIELD_MAP.insurerName_A.pdfField]).toBe('Carrier A');
    expect(build.fieldValues[ACORD25_FIELD_MAP.insurerNaic_A.pdfField]).toBe('111');
    expect(build.fieldValues[ACORD25_FIELD_MAP.insurerName_B.pdfField]).toBe('Carrier B');
    // Unreferenced rows stay empty (totality).
    expect(build.fieldValues[ACORD25_FIELD_MAP.insurerName_C.pdfField]).toBe('');
    expect(build.fieldValues[ACORD25_FIELD_MAP.insurerNaic_C.pdfField]).toBe('');
    expect(build.ok).toBe(true);
  });

  it('one carrier can write two rows (GL + Umbrella on A)', () => {
    const build = buildAcord25FieldValues(
      inputWith(['gl', 'umbrella'], [{ letter: 'A', name: 'A Co', naic: '111', lines: ['gl', 'umbrella'] }]),
    );
    expect(build.fieldValues[ACORD25_FIELD_MAP.gl_insrLtr.pdfField]).toBe('A');
    expect(build.fieldValues[ACORD25_FIELD_MAP.umb_insrLtr.pdfField]).toBe('A');
    expect(build.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Defensive backstops
// ---------------------------------------------------------------------------

describe('letter backstops', () => {
  it('LETTER_UNASSIGNED when a selected line is in no assignment', () => {
    const build = buildAcord25FieldValues(
      inputWith(['gl', 'auto'], [{ letter: 'A', name: 'A Co', naic: '1', lines: ['gl'] }]),
    );
    const issue = build.issues.find((i) => i.code === 'LETTER_UNASSIGNED');
    expect(issue).toBeDefined();
    expect(issue?.lineKey).toBe('auto');
    expect(build.ok).toBe(false);
  });

  it('LETTER_CONFLICT when a line is in more than one assignment', () => {
    const build = buildAcord25FieldValues(
      inputWith(
        ['gl'],
        [
          { letter: 'A', name: 'A Co', naic: '1', lines: ['gl'] },
          { letter: 'B', name: 'B Co', naic: '2', lines: ['gl'] },
        ],
      ),
    );
    expect(build.issues.some((i) => i.code === 'LETTER_CONFLICT')).toBe(true);
    expect(build.ok).toBe(false);
  });

  it('LETTER_CONFLICT when two assignments share a letter', () => {
    const build = buildAcord25FieldValues(
      inputWith(
        ['gl', 'auto'],
        [
          { letter: 'A', name: 'A Co', naic: '1', lines: ['gl'] },
          { letter: 'A', name: 'Dup A', naic: '2', lines: ['auto'] },
        ],
      ),
    );
    expect(build.issues.some((i) => i.code === 'LETTER_CONFLICT')).toBe(true);
    expect(build.ok).toBe(false);
  });

  it('TOO_MANY_CARRIERS when more than six assignments', () => {
    const assignments: InsurerAssignment[] = ['A', 'B', 'C', 'D', 'E', 'F'].map((l, idx) => ({
      letter: l as InsurerAssignment['letter'],
      name: `Co ${l}`,
      naic: String(idx),
      lines: [],
    }));
    // A seventh assignment (reuse letter A but that is fine; the count is what trips it).
    assignments.push({ letter: 'A', name: 'Seventh', naic: '9', lines: ['gl'] });
    const build = buildAcord25FieldValues(inputWith(['gl'], assignments));
    expect(build.issues.some((i) => i.code === 'TOO_MANY_CARRIERS')).toBe(true);
    expect(build.ok).toBe(false);
  });

  it('NAIC_MISSING (warning) when a referenced carrier has null NAIC', () => {
    const build = buildAcord25FieldValues(
      inputWith(['gl'], [{ letter: 'A', name: 'A Co', naic: null, lines: ['gl'] }]),
    );
    const issue = build.issues.find((i) => i.code === 'NAIC_MISSING');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('warning');
    // A missing NAIC is only a warning; the build still succeeds.
    expect(build.ok).toBe(true);
    expect(build.fieldValues[ACORD25_FIELD_MAP.insurerNaic_A.pdfField]).toBe('');
  });
});

// ---------------------------------------------------------------------------
// V6 cross-check in both directions
// ---------------------------------------------------------------------------

describe('V6 validator cross-check', () => {
  it('flags a row that points at an insurer letter with no name', () => {
    const build = buildAcord25FieldValues(
      inputWith(['gl'], [{ letter: 'A', name: 'A Co', naic: '1', lines: ['gl'] }]),
    );
    build.fieldValues[ACORD25_FIELD_MAP.insurerName_A.pdfField] = ''; // orphan the row letter
    const res = validateAcord25(build, { mode: 'preview', template: buildTemplateInfo() });
    expect(res.issues.some((i) => i.code === 'LETTER_UNASSIGNED')).toBe(true);
  });

  it('flags an insurer row that no coverage row references', () => {
    const build = buildAcord25FieldValues(
      inputWith(['gl'], [{ letter: 'A', name: 'A Co', naic: '1', lines: ['gl'] }]),
    );
    build.fieldValues[ACORD25_FIELD_MAP.insurerName_D.pdfField] = 'Ghost D';
    const res = validateAcord25(build, { mode: 'preview', template: buildTemplateInfo() });
    expect(res.issues.some((i) => i.code === 'LETTER_CONFLICT')).toBe(true);
  });

  it('a clean single-carrier build passes V6', () => {
    const build = buildAcord25FieldValues(
      inputWith(['gl'], [{ letter: 'A', name: 'A Co', naic: '1', lines: ['gl'] }]),
    );
    const res = validateAcord25(build, { mode: 'preview', template: buildTemplateInfo() });
    expect(res.issues.some((i) => i.code === 'LETTER_UNASSIGNED')).toBe(false);
    expect(res.issues.some((i) => i.code === 'LETTER_CONFLICT')).toBe(false);
  });
});
