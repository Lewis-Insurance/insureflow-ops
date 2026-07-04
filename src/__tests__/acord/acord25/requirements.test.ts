// requirements.test.ts
//
// Covers the shared pure holder-requirements evaluator (07 Section 4). The
// evaluator is ADVISORY: severity 'fail' rows make all_pass false but the result
// never blocks generation. These tests assert the acceptance criteria in
// 07 Section 4.5 plus the (line_key, field) resolution against the real per-line
// master COI shapes (GL nests limits, umbrella/wc/property/auto do not).

import { describe, it, expect } from 'vitest';
import {
  evaluateHolderRequirements,
  parseHolderRequirements,
  type HolderRequirements,
} from '@/lib/acord/acord25/requirements';
import type {
  COICell,
  COILineAuto,
  COILineGL,
  COILineOtherEntry,
  COILineProperty,
  COILineUmbrella,
  COILineWC,
  COILines,
  MasterCOI,
} from '@/types/master-coi';

// ---------------------------------------------------------------------------
// Compact cell + line factories (only the fields the evaluator reads).
// ---------------------------------------------------------------------------

function cell<T>(v: T | null): COICell<T> {
  return { v, src: 'manual', path: null };
}

// GL with a $1M general_aggregate (nested under limits) for the failing case.
function glLine(generalAggregate: number | null): COILineGL {
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
      general_aggregate: cell<number>(generalAggregate),
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

function lines(generalAggregate: number | null): COILines {
  return {
    gl: glLine(generalAggregate),
    auto: autoLine(),
    umbrella: absentUmbrella(),
    wc: absentWC(),
    property: absentProperty(),
    other: [] as COILineOtherEntry[],
  };
}

function masterCoi(generalAggregate: number | null): MasterCOI {
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
    lines: lines(generalAggregate),
    description_of_operations: { v: null, src: 'missing', prefill_candidates: [] },
    review: { last_reviewed_at: null, last_reviewed_by: null, stale: false },
    readiness: { ready: true, blockers: [], warnings: [] },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('evaluateHolderRequirements: min_limits', () => {
  it('a $2M GL aggregate requirement against a $1M policy fails with expected 2,000,000 actual 1,000,000', () => {
    const requirements: HolderRequirements = {
      min_limits: [{ line_key: 'gl', field: 'general_aggregate', min: 2000000 }],
      flags: [],
      required_endorsement_forms: [],
      notice_days: null,
      required_lines: [],
    };

    const evaluation = evaluateHolderRequirements({
      requirements,
      masterCoi: masterCoi(1000000),
      selectedLineKeys: ['gl'],
      holderResolution: [],
    });

    expect(evaluation.has_requirements).toBe(true);
    expect(evaluation.results).toHaveLength(1);
    const row = evaluation.results[0];
    expect(row.kind).toBe('min_limit');
    expect(row.pass).toBe(false);
    expect(row.severity).toBe('fail');
    expect(row.expected).toBe('2,000,000');
    expect(row.actual).toBe('1,000,000');
    expect(evaluation.all_pass).toBe(false);
    expect(evaluation.failure_count).toBe(1);
  });

  it('a $2M GL aggregate requirement against a $2M policy passes', () => {
    const requirements: HolderRequirements = {
      min_limits: [{ line_key: 'gl', field: 'general_aggregate', min: 2000000 }],
      flags: [],
      required_endorsement_forms: [],
      notice_days: null,
      required_lines: [],
    };

    const evaluation = evaluateHolderRequirements({
      requirements,
      masterCoi: masterCoi(2000000),
      selectedLineKeys: ['gl'],
      holderResolution: [],
    });

    expect(evaluation.results[0].pass).toBe(true);
    expect(evaluation.all_pass).toBe(true);
    expect(evaluation.failure_count).toBe(0);
  });

  it('a min_limit on a line that is not selected fails', () => {
    const requirements: HolderRequirements = {
      min_limits: [{ line_key: 'gl', field: 'general_aggregate', min: 2000000 }],
      flags: [],
      required_endorsement_forms: [],
      notice_days: null,
      required_lines: [],
    };

    const evaluation = evaluateHolderRequirements({
      requirements,
      masterCoi: masterCoi(2000000),
      selectedLineKeys: ['auto'],
      holderResolution: [],
    });

    expect(evaluation.results[0].pass).toBe(false);
    expect(evaluation.results[0].actual).toBe('line not selected');
    expect(evaluation.all_pass).toBe(false);
  });
});

describe('evaluateHolderRequirements: flags via holderResolution', () => {
  const requirements: HolderRequirements = {
    min_limits: [],
    flags: [{ line_key: 'gl', requires_additional_insured: true }],
    required_endorsement_forms: [],
    notice_days: null,
    required_lines: [],
  };

  it('requires_additional_insured passes when the line is endorsed', () => {
    const evaluation = evaluateHolderRequirements({
      requirements,
      masterCoi: masterCoi(2000000),
      selectedLineKeys: ['gl'],
      holderResolution: [
        { line_key: 'gl', addl_insd_resolved: 'endorsed', subr_wvd_resolved: 'none', basis: null },
      ],
    });

    expect(evaluation.results).toHaveLength(1);
    expect(evaluation.results[0].kind).toBe('flag_ai');
    expect(evaluation.results[0].pass).toBe(true);
    expect(evaluation.all_pass).toBe(true);
  });

  it('requires_additional_insured fails when the line resolves to none', () => {
    const evaluation = evaluateHolderRequirements({
      requirements,
      masterCoi: masterCoi(2000000),
      selectedLineKeys: ['gl'],
      holderResolution: [
        { line_key: 'gl', addl_insd_resolved: 'none', subr_wvd_resolved: 'none', basis: null },
      ],
    });

    expect(evaluation.results[0].pass).toBe(false);
    expect(evaluation.results[0].actual).toBe('none');
    expect(evaluation.all_pass).toBe(false);
    expect(evaluation.failure_count).toBe(1);
  });

  it('requires_waiver passes only on endorsed', () => {
    const waiverReq: HolderRequirements = {
      min_limits: [],
      flags: [{ line_key: 'gl', requires_waiver: true }],
      required_endorsement_forms: [],
      notice_days: null,
      required_lines: [],
    };

    const endorsed = evaluateHolderRequirements({
      requirements: waiverReq,
      masterCoi: masterCoi(2000000),
      selectedLineKeys: ['gl'],
      holderResolution: [
        { line_key: 'gl', addl_insd_resolved: 'none', subr_wvd_resolved: 'endorsed', basis: null },
      ],
    });
    expect(endorsed.results[0].kind).toBe('flag_waiver');
    expect(endorsed.results[0].pass).toBe(true);

    const requested = evaluateHolderRequirements({
      requirements: waiverReq,
      masterCoi: masterCoi(2000000),
      selectedLineKeys: ['gl'],
      holderResolution: [
        { line_key: 'gl', addl_insd_resolved: 'none', subr_wvd_resolved: 'requested', basis: null },
      ],
    });
    expect(requested.results[0].pass).toBe(false);
  });
});

describe('evaluateHolderRequirements: required_lines', () => {
  it('a required line missing from the selection fails', () => {
    const requirements: HolderRequirements = {
      min_limits: [],
      flags: [],
      required_endorsement_forms: [],
      notice_days: null,
      required_lines: ['gl', 'auto'],
    };

    const evaluation = evaluateHolderRequirements({
      requirements,
      masterCoi: masterCoi(2000000),
      selectedLineKeys: ['gl'],
      holderResolution: [],
    });

    expect(evaluation.results).toHaveLength(2);
    const gl = evaluation.results.find((r) => r.line_key === 'gl');
    const auto = evaluation.results.find((r) => r.line_key === 'auto');
    expect(gl?.pass).toBe(true);
    expect(auto?.pass).toBe(false);
    expect(auto?.actual).toBe('line not selected');
    expect(evaluation.all_pass).toBe(false);
    expect(evaluation.failure_count).toBe(1);
  });
});

describe('evaluateHolderRequirements: endorsement forms', () => {
  it('passes when the form appears in a line basis (case-insensitive)', () => {
    const requirements: HolderRequirements = {
      min_limits: [],
      flags: [],
      required_endorsement_forms: ['CG 20 10'],
      notice_days: null,
      required_lines: [],
    };

    const evaluation = evaluateHolderRequirements({
      requirements,
      masterCoi: masterCoi(2000000),
      selectedLineKeys: ['gl'],
      holderResolution: [
        {
          line_key: 'gl',
          addl_insd_resolved: 'endorsed',
          subr_wvd_resolved: 'none',
          basis: 'Endorsed via form cg 20 10 04 13',
        },
      ],
    });

    expect(evaluation.results[0].kind).toBe('endorsement_form');
    expect(evaluation.results[0].pass).toBe(true);
  });

  it('fails with a clear message when there is no endorsement data', () => {
    const requirements: HolderRequirements = {
      min_limits: [],
      flags: [],
      required_endorsement_forms: ['CG 20 10'],
      notice_days: null,
      required_lines: [],
    };

    const evaluation = evaluateHolderRequirements({
      requirements,
      masterCoi: masterCoi(2000000),
      selectedLineKeys: ['gl'],
      holderResolution: [],
    });

    expect(evaluation.results[0].pass).toBe(false);
    expect(evaluation.results[0].actual).toBe('no endorsement data');
    expect(evaluation.all_pass).toBe(false);
  });
});

describe('evaluateHolderRequirements: notice_days is informational', () => {
  it('emits an info row that never fails', () => {
    const requirements: HolderRequirements = {
      min_limits: [],
      flags: [],
      required_endorsement_forms: [],
      notice_days: 30,
      required_lines: [],
    };

    const evaluation = evaluateHolderRequirements({
      requirements,
      masterCoi: masterCoi(2000000),
      selectedLineKeys: ['gl'],
      holderResolution: [],
    });

    expect(evaluation.results).toHaveLength(1);
    expect(evaluation.results[0].kind).toBe('notice_days');
    expect(evaluation.results[0].severity).toBe('info');
    expect(evaluation.results[0].pass).toBe(true);
    expect(evaluation.all_pass).toBe(true);
    expect(evaluation.failure_count).toBe(0);
  });
});

describe('evaluateHolderRequirements: no requirements', () => {
  it('has_requirements false, all_pass true, empty results', () => {
    const evaluation = evaluateHolderRequirements({
      requirements: null,
      masterCoi: masterCoi(2000000),
      selectedLineKeys: ['gl'],
      holderResolution: [],
    });

    expect(evaluation.has_requirements).toBe(false);
    expect(evaluation.all_pass).toBe(true);
    expect(evaluation.results).toEqual([]);
    expect(evaluation.failure_count).toBe(0);
  });
});

describe('parseHolderRequirements: defensive read', () => {
  it('returns null for empty or absent payloads', () => {
    expect(parseHolderRequirements(null)).toBeNull();
    expect(parseHolderRequirements(undefined)).toBeNull();
    expect(parseHolderRequirements({})).toBeNull();
    expect(parseHolderRequirements([])).toBeNull();
    expect(
      parseHolderRequirements({
        min_limits: [],
        flags: [],
        required_endorsement_forms: [],
        notice_days: null,
        required_lines: [],
      }),
    ).toBeNull();
  });

  it('parses the closed schema and drops malformed rows', () => {
    const parsed = parseHolderRequirements({
      min_limits: [
        { line_key: 'gl', field: 'general_aggregate', min: 2000000 },
        { line_key: 'bogus', field: 'x', min: 1 },
        { line_key: 'auto', field: 'csl' },
      ],
      flags: [
        { line_key: 'gl', requires_additional_insured: true, requires_waiver: true },
        { line_key: 'auto' },
      ],
      required_endorsement_forms: ['CG 20 10', '', '  CG 20 37  '],
      notice_days: 30,
      required_lines: ['gl', 'gl', 'auto', 'nope'],
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.min_limits).toEqual([
      { line_key: 'gl', field: 'general_aggregate', min: 2000000 },
    ]);
    expect(parsed?.flags).toEqual([
      { line_key: 'gl', requires_additional_insured: true, requires_waiver: true },
    ]);
    expect(parsed?.required_endorsement_forms).toEqual(['CG 20 10', 'CG 20 37']);
    expect(parsed?.notice_days).toBe(30);
    expect(parsed?.required_lines).toEqual(['gl', 'auto']);
  });

  it('resolves a min_limit end to end through parse then evaluate', () => {
    const parsed = parseHolderRequirements({
      min_limits: [{ line_key: 'gl', field: 'general_aggregate', min: 2000000 }],
      flags: [],
      required_endorsement_forms: [],
      notice_days: null,
      required_lines: [],
    });

    const evaluation = evaluateHolderRequirements({
      requirements: parsed,
      masterCoi: masterCoi(1000000),
      selectedLineKeys: ['gl'],
      holderResolution: [],
    });

    expect(evaluation.results[0].expected).toBe('2,000,000');
    expect(evaluation.results[0].actual).toBe('1,000,000');
    expect(evaluation.all_pass).toBe(false);
  });
});
