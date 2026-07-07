// fromMasterCoi.test.ts
//
// Covers the single Master COI -> ACORD 25 build-input adapter (doc 05 Section
// 4.9). The focus here is the multi-line holder-endorsement resolution: because
// resolve_holder_endorsements returns one row PER line, the adapter must resolve
// each selected line independently against its own row. A two-line certificate
// with both lines endorsed for the holder must print Y on both.

import { describe, it, expect } from 'vitest';
import { toAcord25BuildInput } from '@/lib/acord/acord25/fromMasterCoi';
import { buildAcord25FieldValues } from '@/lib/acord/acord25/buildAcord25FieldValues';
import { ACORD25_FIELD_MAP } from '@/lib/acord/acord25/fieldMap';
import type {
  COICell,
  COILineAuto,
  COILineGL,
  COILineOtherEntry,
  COILineProperty,
  COILineUmbrella,
  COILineWC,
  COILines,
  HolderEndorsementResolution,
  MasterCOI,
} from '@/types/master-coi';

// ---------------------------------------------------------------------------
// Compact cell + line factories (only the fields the adapter reads).
// ---------------------------------------------------------------------------

function cell<T>(v: T | null): COICell<T> {
  return { v, src: 'manual', path: null };
}

function glLine(): COILineGL {
  return {
    present: true,
    policy_id: 'pol-gl',
    insurer_letter: 'A',
    status: 'active',
    expired: false,
    policy_number: cell('GL-1'),
    effective_date: cell('2026-01-01'),
    expiration_date: cell('2027-01-01'),
    candidates: [],
    occurrence_or_claims_made: cell('occurrence'),
    aggregate_applies_per: cell('policy'),
    limits: {
      each_occurrence: cell<number>(1000000),
      damage_to_rented_premises: cell<number>(null),
      medical_expense: cell<number>(null),
      personal_advertising_injury: cell<number>(null),
      general_aggregate: cell<number>(2000000),
      products_completed_ops_aggregate: cell<number>(2000000),
    },
    additional_insureds: [],
  };
}

function autoLine(): COILineAuto {
  return {
    present: true,
    policy_id: 'pol-auto',
    insurer_letter: 'A',
    status: 'active',
    expired: false,
    policy_number: cell('AUTO-1'),
    effective_date: cell('2026-01-01'),
    expiration_date: cell('2027-01-01'),
    candidates: [],
    limit_type: cell('csl'),
    csl: cell<number>(1000000),
    bi_per_person: cell<number>(null),
    bi_per_accident: cell<number>(null),
    pd_per_accident: cell<number>(null),
    checkboxes: {
      any_auto: cell<boolean>(true),
      owned_autos: cell<boolean>(false),
      scheduled_autos: cell<boolean>(false),
      hired_autos: cell<boolean>(false),
      non_owned_autos: cell<boolean>(false),
    },
    additional_insureds: [],
  };
}

function absentUmbrella(): COILineUmbrella {
  return {
    present: false,
    policy_id: null,
    insurer_letter: null,
    status: null,
    expired: false,
    policy_number: cell<string>(null),
    effective_date: cell<string>(null),
    expiration_date: cell<string>(null),
    candidates: [],
    umbrella_or_excess: cell<string>(null),
    occurrence_or_claims_made: cell<string>(null),
    each_occurrence: cell<number>(null),
    aggregate: cell<number>(null),
    ded_or_retention: { kind: cell<string>(null), amount: cell<number>(null) },
    additional_insureds: [],
  };
}

function absentWC(): COILineWC {
  return {
    present: false,
    policy_id: null,
    insurer_letter: null,
    status: null,
    expired: false,
    policy_number: cell<string>(null),
    effective_date: cell<string>(null),
    expiration_date: cell<string>(null),
    candidates: [],
    per_statute: cell<boolean>(null),
    el_each_accident: cell<number>(null),
    el_disease_each_employee: cell<number>(null),
    el_disease_policy_limit: cell<number>(null),
    proprietor_excluded: cell<boolean>(null),
    subrogation_waivers: [],
  };
}

function absentProperty(): COILineProperty {
  return {
    present: false,
    policy_id: null,
    insurer_letter: null,
    status: null,
    expired: false,
    policy_number: cell<string>(null),
    effective_date: cell<string>(null),
    expiration_date: cell<string>(null),
    candidates: [],
    label: cell<string>(null),
    limit_amount: cell<number>(null),
    limit_description: cell<string>(null),
    additional_insureds: [],
  };
}

function lines(): COILines {
  return {
    gl: glLine(),
    auto: autoLine(),
    umbrella: absentUmbrella(),
    wc: absentWC(),
    property: absentProperty(),
    other: [] as COILineOtherEntry[],
  };
}

function masterCoi(): MasterCOI {
  return {
    version: 1,
    generated_at: '2026-07-01T00:00:00Z',
    account_id: 'acct-1',
    named_insured: {
      name: cell('Acme LLC'),
      dba: cell<string>(null),
      address_line1: cell('1 Main St'),
      address_line2: cell<string>(null),
      city: cell('Peoria'),
      state: cell('IL'),
      zip: cell('61602'),
      policy_named_insured_mismatch: false,
    },
    producer: {
      name: cell('Lewis Insurance'),
      contact_name: cell('Dana'),
      phone: cell('(217) 555-0100'),
      fax: cell<string>(null),
      email: cell('certs@lewisinsurance.com'),
      address_line1: cell('123 Main St'),
      address_line2: cell<string>(null),
      city: cell('Springfield'),
      state: cell('IL'),
      zip: cell('62704'),
      license_number: cell<string>(null),
    },
    insurers: [
      {
        letter: 'A',
        name: cell('Acme National Insurance Co'),
        naic: cell('12345'),
        carrier_id: null,
        resolution: 'exact',
        lines: ['gl', 'auto'],
        policy_ids: ['pol-gl', 'pol-auto'],
      },
    ],
    insurer_overflow: [],
    lines: lines(),
    description_of_operations: { v: null, src: 'missing', prefill_candidates: [] },
    review: { last_reviewed_at: null, last_reviewed_by: null, stale: false },
    readiness: { ready: true, blockers: [], warnings: [] },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fromMasterCoi holder endorsement resolution across lines', () => {
  it('resolves each selected line against its own holderResolution row (both endorsed print Y)', () => {
    // Two rows: GL and Auto BOTH endorsed for ADDL INSD and SUBR WVD.
    const holderResolution: HolderEndorsementResolution[] = [
      { line_key: 'gl', addl_insd_resolved: 'endorsed', subr_wvd_resolved: 'endorsed', basis: null },
      { line_key: 'auto', addl_insd_resolved: 'endorsed', subr_wvd_resolved: 'endorsed', basis: null },
    ];

    const input = toAcord25BuildInput({
      masterCoi: masterCoi(),
      selectedLines: ['gl', 'auto'],
      holder: { name: 'City of Peoria', addressLines: ['419 Fulton St', 'Peoria, IL 61602'] },
      holderResolution,
      // No printIntents override: each flag defaults to ON when resolved endorsed.
      printIntents: {},
      descriptionOfOperations: '',
      remarks: '',
      certificateDate: '2026-07-01',
      authorizedRepName: 'Dana Producer',
    });

    const build = buildAcord25FieldValues(input);

    // Both lines must print Y on both columns; regression guard for the
    // single-row bug where only the first line resolved endorsed.
    expect(build.fieldValues[ACORD25_FIELD_MAP.gl_addlInsd.pdfField]).toBe('Y');
    expect(build.fieldValues[ACORD25_FIELD_MAP.gl_subrWvd.pdfField]).toBe('Y');
    expect(build.fieldValues[ACORD25_FIELD_MAP.auto_addlInsd.pdfField]).toBe('Y');
    expect(build.fieldValues[ACORD25_FIELD_MAP.auto_subrWvd.pdfField]).toBe('Y');

    expect(build.ok).toBe(true);
  });

  it('a line with no matching resolution row falls to none and prints N', () => {
    // Only GL is endorsed; Auto has no row at all.
    const holderResolution: HolderEndorsementResolution[] = [
      { line_key: 'gl', addl_insd_resolved: 'endorsed', subr_wvd_resolved: 'endorsed', basis: null },
    ];

    const input = toAcord25BuildInput({
      masterCoi: masterCoi(),
      selectedLines: ['gl', 'auto'],
      holder: { name: 'City of Peoria', addressLines: ['419 Fulton St', 'Peoria, IL 61602'] },
      holderResolution,
      printIntents: {},
      descriptionOfOperations: '',
      remarks: '',
      certificateDate: '2026-07-01',
      authorizedRepName: 'Dana Producer',
    });

    const build = buildAcord25FieldValues(input);

    expect(build.fieldValues[ACORD25_FIELD_MAP.gl_addlInsd.pdfField]).toBe('Y');
    expect(build.fieldValues[ACORD25_FIELD_MAP.auto_addlInsd.pdfField]).toBe('N');
    expect(build.fieldValues[ACORD25_FIELD_MAP.auto_subrWvd.pdfField]).toBe('N');
  });

  it('drops a selected `other` line: no OTHER-row coverage line and no orphan insurer row', () => {
    // `other` is the 02 informational bucket (lines.other[]), "not printed by
    // default", and get_master_coi excludes it from the insurer table. But the
    // public Acord25LineKey[] contract admits 'other', so guard the adapter against
    // a hand-built caller (or a future data-source regression) that both selects
    // 'other' AND carries an `other`-only insurer assignment. Without the guard the
    // reduction retains insurer B as an orphan row (V6 looks-right-but-wrong).
    const mc = masterCoi();
    mc.lines.other = [
      {
        policy_id: 'pol-other',
        policy_number: 'MISC-1',
        line_of_business: 'Commercial (unspecified)',
        line_canonical: 'other',
        carrier: 'Unclassified Carrier',
        status: 'active',
        effective_date: '2026-01-01',
        expiration_date: '2027-01-01',
      },
    ];
    // Hypothetical orphan: an insurer whose ONLY line is 'other'. A real
    // get_master_coi never emits this (line 1001), which is exactly why the adapter
    // must not depend on that invariant to stay orphan-free.
    mc.insurers = [
      ...mc.insurers,
      {
        letter: 'B',
        name: cell('Unclassified Carrier'),
        naic: cell('99999'),
        carrier_id: null,
        resolution: 'exact',
        lines: ['other'],
        policy_ids: ['pol-other'],
      },
    ];

    const input = toAcord25BuildInput({
      masterCoi: mc,
      selectedLines: ['gl', 'other'],
      holder: null,
      holderResolution: null,
      printIntents: {},
      descriptionOfOperations: '',
      remarks: '',
      certificateDate: '2026-07-01',
      authorizedRepName: 'Dana Producer',
    });

    // No coverage line is emitted for `other`, and no letter assignment retains it.
    expect(input.lines.some((l) => l.line === 'other')).toBe(false);
    expect(input.letterAssignments.some((a) => a.lines.includes('other'))).toBe(false);
    // The orphan insurer B (its only line was `other`) is dropped, not carried.
    expect(input.letterAssignments.some((a) => a.letter === 'B')).toBe(false);

    const build = buildAcord25FieldValues(input);

    // Downstream proof: no orphan insurer row (B), OTHER row untouched, build clean.
    expect(build.fieldValues[ACORD25_FIELD_MAP.insurerName_B.pdfField]).toBe('');
    expect(build.fieldValues[ACORD25_FIELD_MAP.other_type.pdfField]).toBe('');
    expect(build.fieldValues[ACORD25_FIELD_MAP.other_limitsText.pdfField]).toBe('');
    expect(
      build.issues.some(
        (i) =>
          i.code === 'OTHER_ROW_CONFLICT' ||
          i.code === 'LETTER_UNASSIGNED' ||
          i.code === 'LETTER_CONFLICT',
      ),
    ).toBe(false);
    expect(build.ok).toBe(true);
    // The real gl line still prints normally.
    expect(build.fieldValues[ACORD25_FIELD_MAP.insurerName_A.pdfField]).toBe(
      'Acme National Insurance Co',
    );
  });

  it('a null holder forces every flag to none/false regardless of rows', () => {
    const input = toAcord25BuildInput({
      masterCoi: masterCoi(),
      selectedLines: ['gl', 'auto'],
      holder: null,
      holderResolution: null,
      printIntents: {},
      descriptionOfOperations: '',
      remarks: '',
      certificateDate: '2026-07-01',
      authorizedRepName: 'Dana Producer',
    });

    const build = buildAcord25FieldValues(input);

    expect(build.fieldValues[ACORD25_FIELD_MAP.gl_addlInsd.pdfField]).toBe('N');
    expect(build.fieldValues[ACORD25_FIELD_MAP.auto_addlInsd.pdfField]).toBe('N');
  });
});

describe('fromMasterCoi write-in coverages: native slot vs DOO spill', () => {
  it('first GL row fills the native GL write-in; 2nd GL row and a WC row spill to DOO', () => {
    const input = toAcord25BuildInput({
      masterCoi: masterCoi(),
      selectedLines: ['gl', 'auto'],
      holder: null,
      holderResolution: null,
      printIntents: {},
      additionalCoverages: [
        { line: 'gl', name: 'Hired/Non-Owned Auto', amount: 1000000 },
        { line: 'gl', name: 'Employee Benefits Liability', amount: 500000 },
        { line: 'wc', name: 'Stop Gap / Employers Liability', amount: 1000000 },
      ],
      descriptionOfOperations: 'Base narrative.',
      remarks: '',
      certificateDate: '2026-07-01',
      authorizedRepName: 'Dana Producer',
    });

    // First GL row -> native slot on the build input.
    expect(input.writeInCoverages?.gl).toEqual({
      name: 'Hired/Non-Owned Auto',
      amount: 1000000,
    });

    // The 2nd GL row and the WC row spilled into descriptionOfOperations, in order.
    expect(input.descriptionOfOperations).toContain(
      'General Liability - Employee Benefits Liability: $500,000',
    );
    expect(input.descriptionOfOperations).toContain(
      "Workers Compensation and Employers' Liability - Stop Gap / Employers Liability: $1,000,000",
    );
    // The GL native row is NOT duplicated into the spill.
    expect(input.descriptionOfOperations).not.toContain('General Liability - Hired/Non-Owned Auto');

    const build = buildAcord25FieldValues(input);

    // The native GL write-in prints in its dedicated fields.
    expect(build.fieldValues[ACORD25_FIELD_MAP.gl_writeInDesc.pdfField]).toBe('Hired/Non-Owned Auto');
    expect(build.fieldValues[ACORD25_FIELD_MAP.gl_writeInAmount.pdfField]).toBe('1,000,000');
    // Spill rode DOO through the builder (base narrative preserved, spill appended).
    const printedDoo = build.fieldValues[ACORD25_FIELD_MAP.descriptionOfOperations.pdfField] as string;
    expect(printedDoo).toContain('Base narrative.');
    expect(printedDoo).toContain('General Liability - Employee Benefits Liability: $500,000');
    expect(build.ok).toBe(true);
  });

  it('a write-in for an unselected line spills to DOO and never fills a native slot', () => {
    // Auto is NOT selected here, so its write-in has no native slot and must spill.
    const input = toAcord25BuildInput({
      masterCoi: masterCoi(),
      selectedLines: ['gl'],
      holder: null,
      holderResolution: null,
      printIntents: {},
      additionalCoverages: [{ line: 'auto', name: 'Rental Reimbursement', amount: null }],
      descriptionOfOperations: '',
      remarks: '',
      certificateDate: '2026-07-01',
      authorizedRepName: 'Dana Producer',
    });

    expect(input.writeInCoverages?.auto).toBeUndefined();
    // Amount null -> spilled label carries no ": $..." suffix.
    expect(input.descriptionOfOperations).toBe('Automobile Liability - Rental Reimbursement');

    const build = buildAcord25FieldValues(input);
    expect(build.fieldValues[ACORD25_FIELD_MAP.auto_writeInDesc.pdfField]).toBe('');
    expect(build.fieldValues[ACORD25_FIELD_MAP.auto_writeInAmount.pdfField]).toBe('');
  });
});
