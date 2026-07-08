// ============================================================================
// WC extractor shaping tests
// ============================================================================
// Proves the pure shaping helpers land the model's raw tool-use output on the
// EXACT wc_details paths + flat-dotted wc_field_evidence keys that
// get_master_coi / coi_build_line read (migration 20260702172000, WC cells
// L914-936). If these keys drift, the COI Workers Comp section silently reads
// null and the policy can never be COI-ready (the three EL limits are all
// required_for_ready).
// ============================================================================

import { describe, expect, it } from 'vitest';
import {
  shapeWcDetails,
  shapeClassificationRows,
  shapeOfficerRows,
  shapeStateRows,
  shapeExperienceModRows,
  shapeSubrogationWaiverRows,
  normalizePartOne,
  normalizeNaic,
  officerIncluded,
  type RawWcExtraction,
} from '../../../supabase/functions/extract-wc-policy/shape.ts';

const NOW = '2026-07-08T00:00:00.000Z';

// Representative raw tool_use output: statutory Part One, the three EL limits,
// an insurer NAIC, one included + one excluded officer, a governing class row,
// a covered state, an experience mod, a named waiver + a blanket waiver.
function rawFixture(): RawWcExtraction {
  return {
    identity: {
      named_insured: { value: 'Acme Framing LLC', evidence_ids: ['E0002'] },
      dba: { value: null, evidence_ids: [] },
      carrier_name: { value: 'Travelers', evidence_ids: ['E0003'] },
      carrier_naic: { value: '25666', evidence_ids: ['E0004'] },
      policy_number: { value: 'WC-778899', evidence_ids: ['E0001'] },
      transaction_type: { value: 'new', evidence_ids: ['E0020'] },
      fein: { value: '59-7654321', evidence_ids: ['E0016'] },
      mailing_address: {
        street: { value: '200 Oak Ave', evidence_ids: ['E0005'] },
        city: { value: 'Tampa', evidence_ids: ['E0006'] },
        state: { value: 'FL', evidence_ids: ['E0007'] },
        zip: { value: '33601', evidence_ids: ['E0008'] },
      },
    },
    dates: {
      effective_date: { value: '2026-01-01', evidence_ids: ['E0009'] },
      expiration_date: { value: '2027-01-01', evidence_ids: ['E0010'] },
    },
    coverage: {
      part_one_wc: { value: 'statutory', evidence_ids: ['E0011'] },
      part_two_employers_liability: {
        each_accident: { value: '$1,000,000', evidence_ids: ['E0012'] },
        disease_each_employee: { value: 1000000, evidence_ids: ['E0013'] },
        disease_policy_limit: { value: 1000000, evidence_ids: ['E0014'] },
      },
    },
    classifications: [
      {
        state: 'FL', class_code: '5645', description: 'Carpentry',
        exposure_basis: 'payroll', estimated_payroll: 500000,
        rate: 12.5, premium: 62500, // §NO-PREMIUM: must NOT survive
        is_governing_class: true, evidence_ids: ['E0030'],
      },
    ],
    officers: [
      { name: 'Jane Owner', title: 'President', ownership_percent: 100, included: false, type: 'officer', evidence_ids: ['E0040'] },
      { name: 'Bob Officer', title: 'VP', included: true, evidence_ids: ['E0041'] },
    ],
    covered_states: [
      { state: 'FL', type: 'item_3a', evidence_ids: ['E0050'] },
    ],
    experience_mods: [
      { experience_mod: 0.85, effective_date: '2026-01-01', rating_bureau: 'NCCI', schedule_rating_type: 'credit', evidence_ids: ['E0060'] },
    ],
    subrogation_waivers: [
      { name: 'General Contractor Inc', address: { street: '9 Site Rd', city: 'Tampa', state: 'FL', zip: '33602' }, endorsement_form: 'WC 00 03 13', evidence_ids: ['E0070'] },
    ],
    waiver_of_subrogation_evidence: { present: true, basis: 'blanket', form_numbers: ['WC 00 03 13'], source_span: 'Blanket waiver where required by written contract' },
    extraction_confidence: 0.93,
  };
}

describe('shapeWcDetails - coverage contract paths (coi_build_line L914-936)', () => {
  const { wcDetails } = shapeWcDetails(rawFixture(), NOW);

  it('writes part_one_wc as the statutory enum the PER STATUTE box reads', () => {
    expect(wcDetails.coverage.part_one_wc).toBe('statutory');
  });

  it('writes the three Employers Liability limits (all required_for_ready)', () => {
    expect(wcDetails.coverage.part_two_employers_liability.each_accident).toBe(1000000); // "$1,000,000" -> number
    expect(wcDetails.coverage.part_two_employers_liability.disease_each_employee).toBe(1000000);
    expect(wcDetails.coverage.part_two_employers_liability.disease_policy_limit).toBe(1000000);
  });

  it('mirrors the GL house-standard identity/dates shape and stamps extraction_source', () => {
    expect(wcDetails.identity.named_insured).toBe('Acme Framing LLC');
    expect(wcDetails.identity.carrier_name).toBe('Travelers');
    expect(wcDetails.identity.carrier_naic).toBe('25666');
    expect(wcDetails.identity.policy_number).toBe('WC-778899'); // under identity, GL standard
    expect(wcDetails.identity.transaction_type).toBe('new');
    expect(wcDetails.identity.fein).toBe('59-7654321');
    expect(wcDetails.identity.mailing_address.street).toBe('200 Oak Ave');
    expect(wcDetails.dates.effective_date).toBe('2026-01-01');
    expect(wcDetails.dates.expiration_date).toBe('2027-01-01');
    expect(wcDetails.extraction_source).toBe('azure_di_claude');
    expect(wcDetails.extraction_confidence).toBe(0.93);
    expect(wcDetails.extracted_at).toBe(NOW); // nowIso passed in, no Date.now in the pure module
  });

  it('carries NO premium field anywhere in the blob (unrepresentable)', () => {
    expect(JSON.stringify(wcDetails).toLowerCase()).not.toContain('premium');
  });
});

describe('shapeWcDetails - flat-dotted wc_field_evidence keys', () => {
  const { fieldEvidence } = shapeWcDetails(rawFixture(), NOW);

  it('keys are the relative in-blob paths the RPC tests with v_ev ? <path>', () => {
    expect(fieldEvidence['coverage.part_one_wc']).toEqual(['E0011']);
    expect(fieldEvidence['coverage.part_two_employers_liability.each_accident']).toEqual(['E0012']);
    expect(fieldEvidence['coverage.part_two_employers_liability.disease_each_employee']).toEqual(['E0013']);
    expect(fieldEvidence['coverage.part_two_employers_liability.disease_policy_limit']).toEqual(['E0014']);
    expect(fieldEvidence['identity.carrier_naic']).toEqual(['E0004']);
    expect(fieldEvidence['identity.named_insured']).toEqual(['E0002']);
    expect(fieldEvidence['identity.policy_number']).toEqual(['E0001']);
    expect(fieldEvidence['identity.fein']).toEqual(['E0016']);
    expect(fieldEvidence['dates.effective_date']).toEqual(['E0009']);
    expect(fieldEvidence['dates.expiration_date']).toEqual(['E0010']);
  });

  it('omits keys for fields with no cited evidence', () => {
    expect(fieldEvidence['identity.dba']).toBeUndefined();
  });

  it('does not descend child arrays into the flat evidence map', () => {
    // classifications/officers/etc carry their own evidence_ids COLUMNS, so their
    // ids must not leak into wc_field_evidence dotted keys.
    expect(fieldEvidence['classifications']).toBeUndefined();
    expect(Object.keys(fieldEvidence).some((k) => k.startsWith('classifications'))).toBe(false);
    expect(Object.keys(fieldEvidence).some((k) => k.startsWith('officers'))).toBe(false);
  });
});

describe('normalizePartOne - statutory enum for the PER STATUTE box', () => {
  it('keeps statutory and collapses statute-worded text', () => {
    expect(normalizePartOne('statutory')).toBe('statutory');
    expect(normalizePartOne('Statutory - Per Statute')).toBe('statutory');
  });
  it('maps other and returns null when absent (never guess a box)', () => {
    expect(normalizePartOne('other')).toBe('other');
    expect(normalizePartOne(null)).toBeNull();
    expect(normalizePartOne('')).toBeNull();
  });
});

describe('normalizeNaic - insurer NAIC, never industry NAICS/SIC', () => {
  it('keeps a 5-digit insurer NAIC', () => {
    expect(normalizeNaic('25666')).toBe('25666');
  });
  it('rejects a 6-digit industry NAICS code', () => {
    expect(normalizeNaic('238130')).toBeNull();
  });
  it('returns null when absent (downstream name->NAIC lookup)', () => {
    expect(normalizeNaic(null)).toBeNull();
  });
});

describe('officer rows - drive ANY PROPRIETOR EXCLUDED', () => {
  const rows = shapeOfficerRows(rawFixture());

  it('reflects the real inclusion election (excluded stays false, unknown defaults true)', () => {
    expect(officerIncluded(false)).toBe(false);
    expect(officerIncluded('excluded')).toBe(false);
    expect(officerIncluded(true)).toBe(true);
    expect(officerIncluded(undefined)).toBe(true); // under-claim: never fabricate an exclusion
  });

  it('shapes the excluded officer with is_included=false', () => {
    const jane = rows.find((r) => r.name === 'Jane Owner')!;
    expect(jane.is_included).toBe(false);
    expect(jane.officer_type).toBe('officer');
    const bob = rows.find((r) => r.name === 'Bob Officer')!;
    expect(bob.is_included).toBe(true);
  });

  it('drops officers missing the NOT NULL name', () => {
    const raw = rawFixture();
    raw.officers = [{ title: 'Ghost', included: false }];
    expect(shapeOfficerRows(raw)).toHaveLength(0);
  });
});

describe('classification rows - §NO-PREMIUM strips rate + premium', () => {
  const rows = shapeClassificationRows(rawFixture());

  it('keeps exposure basis but never rate or premium', () => {
    const row = rows[0];
    expect(row.state).toBe('FL');
    expect(row.class_code).toBe('5645');
    expect(row.estimated_payroll).toBe(500000);
    expect(row.is_governing_class).toBe(true);
    expect('rate' in row).toBe(false);
    expect('premium' in row).toBe(false);
  });

  it('drops rows missing NOT NULL state or class_code', () => {
    const raw = rawFixture();
    raw.classifications = [{ description: 'no state or code' }];
    expect(shapeClassificationRows(raw)).toHaveLength(0);
  });
});

describe('state rows - dedupe + §NO-PREMIUM', () => {
  it('collapses duplicate states (UNIQUE policy_id, state) and carries no premium', () => {
    const raw = rawFixture();
    raw.covered_states = [
      { state: 'FL', type: 'item_3a' },
      { state: 'FL', type: 'item_3c' }, // last wins
      { state: 'GA', type: 'monopolistic' },
    ];
    const rows = shapeStateRows(raw);
    expect(rows).toHaveLength(2);
    const fl = rows.find((r) => r.state === 'FL')!;
    expect(fl.coverage_type).toBe('item_3c');
    expect('state_premium' in fl).toBe(false);
  });
});

describe('experience mod rows - both NOT NULL columns required', () => {
  it('keeps a valid mod row', () => {
    const rows = shapeExperienceModRows(rawFixture());
    expect(rows).toHaveLength(1);
    expect(rows[0].experience_mod).toBe(0.85);
    expect(rows[0].effective_date).toBe('2026-01-01');
    expect(rows[0].schedule_rating_type).toBe('credit');
  });

  it('drops a mod row missing experience_mod or effective_date', () => {
    const raw = rawFixture();
    raw.experience_mods = [
      { experience_mod: 0.9 }, // no effective_date
      { effective_date: '2026-01-01' }, // no mod
    ];
    expect(shapeExperienceModRows(raw)).toHaveLength(0);
  });
});

describe('subrogation waiver rows - blanket-as-evidence, never fabricate a Y', () => {
  const rows = shapeSubrogationWaiverRows(rawFixture());

  it('shapes the named/scheduled waiver as waiver_scope=specific with a name', () => {
    const named = rows.find((r) => r.waiver_scope === 'specific')!;
    expect(named.name).toBe('General Contractor Inc');
    expect(named.endorsement_status).toBe('requested'); // never 'endorsed'
    expect(named.endorsement_form).toBe('WC 00 03 13');
    expect(named.city).toBe('Tampa');
  });

  it('synthesizes one blanket row (waiver_scope=blanket, requested, form collapsed)', () => {
    const blanket = rows.find((r) => r.waiver_scope === 'blanket')!;
    expect(blanket.name).toBeNull(); // constraint allows null name when blanket
    expect(blanket.endorsement_status).toBe('requested'); // never 'endorsed'
    expect(blanket.endorsement_form).toBe('WC 00 03 13'); // form_numbers[] collapsed to singular
  });

  it('never writes columns the table lacks (form_numbers array, source_span, evidence_ids)', () => {
    for (const row of rows) {
      expect('form_numbers' in row).toBe(false);
      expect('source_span' in row).toBe(false);
      expect('evidence_ids' in row).toBe(false);
    }
  });

  it('writes no blanket row when the waiver evidence is not blanket', () => {
    const raw = rawFixture();
    raw.subrogation_waivers = [];
    raw.waiver_of_subrogation_evidence = { present: true, basis: 'scheduled', form_numbers: [] };
    expect(shapeSubrogationWaiverRows(raw)).toHaveLength(0);
  });
});
