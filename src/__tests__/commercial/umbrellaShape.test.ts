// ============================================================================
// Umbrella / Excess extractor shaping tests
// ============================================================================
// Proves the pure shaping helpers land the model's raw tool-use output on the
// EXACT umbrella_details paths + flat-dotted umbrella_field_evidence keys that
// get_master_coi / coi_build_line read (migration 20260702172000, umbrella
// cells L883-900). If these keys drift, the COI Umbrella section silently reads
// null. The two NEW cells this rework fills are coi_summary.occurrence_or_claims_made
// and coi_summary.ded_or_retention_kind.
// ============================================================================

import { describe, expect, it } from 'vitest';
import {
  shapeUmbrellaDetails,
  shapeUnderlyingRows,
  shapeRequirementsRow,
  shapeAdditionalInsuredRows,
  shapeEndorsementRows,
  normalizeNaic,
  normalizePolicyType,
  normalizeOccurrenceBasis,
  normalizeDedRetentionKind,
  type RawUmbrellaExtraction,
} from '../../../supabase/functions/extract-umbrella-policy/shape.ts';

const NOW = '2026-07-08T00:00:00.000Z';

// Representative raw tool_use output: an umbrella written occurrence with a
// $5M per-occurrence / $5M aggregate limit over a $10K SIR, one GL underlying,
// required GL minimums, a blanket AI + blanket waiver, and an exclusion.
function rawFixture(): RawUmbrellaExtraction {
  return {
    identity: {
      named_insured: { value: 'Acme Holdings LLC', evidence_ids: ['E0002'] },
      dba: { value: null, evidence_ids: [] },
      carrier_name: { value: 'Great American', evidence_ids: ['E0003'] },
      carrier_naic: { value: '16691', evidence_ids: ['E0004'] },
      policy_number: { value: 'UMB-778899', evidence_ids: ['E0001'] },
      transaction_type: { value: 'renewal', evidence_ids: ['E0017'] },
      fein: { value: '59-7654321', evidence_ids: ['E0016'] },
      mailing_address: {
        street: { value: '900 Bay St', evidence_ids: ['E0005'] },
        city: { value: 'Tampa', evidence_ids: ['E0006'] },
        state: { value: 'FL', evidence_ids: ['E0007'] },
        zip: { value: '33602', evidence_ids: ['E0008'] },
      },
    },
    dates: {
      effective_date: { value: '2026-02-01', evidence_ids: ['E0009'] },
      expiration_date: { value: '2027-02-01', evidence_ids: ['E0010'] },
    },
    policy_type: { value: 'Commercial Umbrella', evidence_ids: ['E0011'] },
    form_basis: { value: 'Follow Form', evidence_ids: ['E0018'] },
    coi_summary: {
      occurrence_or_claims_made: { value: 'Occurrence', evidence_ids: ['E0019'] },
      ded_or_retention_kind: { value: 'Self-Insured Retention', evidence_ids: ['E0020'] },
    },
    limits: {
      per_occurrence: { value: '$5,000,000', evidence_ids: ['E0012'] },
      aggregate: { value: '$5,000,000', evidence_ids: ['E0013'] },
      defense_costs: { value: 'in addition to limits', evidence_ids: ['E0021'] },
      territory: { value: null, evidence_ids: [] },
    },
    retention: {
      amount: { value: '$10,000', evidence_ids: ['E0014'] },
      applicability: { value: 'per occurrence', evidence_ids: ['E0022'] },
      notes: { value: null, evidence_ids: [] },
    },
    drop_down: {
      is_available: { value: true, evidence_ids: ['E0023'] },
      conditions: { value: null, evidence_ids: [] },
    },
    underlying_requirements: {
      gl_each_occurrence: { value: 1000000, evidence_ids: ['E0024'] },
      gl_general_aggregate: { value: 2000000, evidence_ids: ['E0025'] },
      auto_liability: { value: null, evidence_ids: [] },
      el_per_accident: { value: null, evidence_ids: [] },
    },
    underlying_policies: [
      {
        underlying_type: 'general_liability',
        carrier: 'Travelers',
        policy_number: 'GL-111',
        effective_date: '2026-02-01',
        expiration_date: '2027-02-01',
        each_occurrence: 1000000,
        general_aggregate: 2000000,
        evidence_ids: ['E0026'],
        confidence: 0.9,
        status: 'AUTO_APPLIED',
      },
    ],
    additional_insureds: [
      {
        name: 'Port Authority',
        ai_type: 'scheduled',
        address: { street: '1 Dock Rd', city: 'Tampa', state: 'FL', zip: '33605' },
        waiver_of_subrogation: true,
        evidence_ids: ['E0027'],
        confidence: 0.88,
        status: 'AUTO_APPLIED',
      },
    ],
    additional_insured_evidence: { present: true, basis: 'blanket', form_numbers: ['UMB 20 01'], source_span: 'Blanket AI where required by written contract' },
    waiver_of_subrogation_evidence: { present: true, basis: 'blanket', form_numbers: ['UMB 24 04'], source_span: 'Blanket WOS' },
    endorsements: [
      { form_number: 'UMB 31 15', title: 'Pollution Exclusion', category: 'pollution', is_limitation: true, evidence_ids: ['E0028'] },
    ],
    extraction_confidence: 0.91,
  };
}

describe('shapeUmbrellaDetails - COI contract paths', () => {
  const { umbrellaDetails } = shapeUmbrellaDetails(rawFixture(), NOW);

  it('keeps the already-correct COI paths (policy_type, limits, retention.amount) EXACTLY', () => {
    expect(umbrellaDetails.policy_type).toBe('umbrella');
    expect(umbrellaDetails.limits.per_occurrence).toBe(5000000); // "$5,000,000" -> number
    expect(umbrellaDetails.limits.aggregate).toBe(5000000);
    expect(umbrellaDetails.retention.amount).toBe(10000); // "$10,000" -> number
  });

  it('fills the two NEW coi_summary cells the RPC reads', () => {
    expect(umbrellaDetails.coi_summary.occurrence_or_claims_made).toBe('occurrence');
    expect(umbrellaDetails.coi_summary.ded_or_retention_kind).toBe('retention'); // SIR => retention
  });

  it('ded_or_retention_kind is the KIND only; the amount stays at retention.amount', () => {
    // The number never leaks into the kind cell.
    expect(umbrellaDetails.coi_summary.ded_or_retention_kind).not.toBe(10000);
    expect(umbrellaDetails.retention.amount).toBe(10000);
  });

  it('mirrors the GL house-standard identity/dates shape, keeps producer OUT, stamps source', () => {
    expect(umbrellaDetails.identity.named_insured).toBe('Acme Holdings LLC');
    expect(umbrellaDetails.identity.carrier_name).toBe('Great American');
    expect(umbrellaDetails.identity.carrier_naic).toBe('16691');
    expect(umbrellaDetails.identity.policy_number).toBe('UMB-778899');
    expect(umbrellaDetails.identity.transaction_type).toBe('renewal');
    expect(umbrellaDetails.identity.fein).toBe('59-7654321');
    expect(umbrellaDetails.identity.mailing_address.street).toBe('900 Bay St');
    expect((umbrellaDetails.identity as Record<string, unknown>).producer).toBeUndefined();
    expect(umbrellaDetails.dates.effective_date).toBe('2026-02-01');
    expect(umbrellaDetails.dates.expiration_date).toBe('2027-02-01');
    expect(umbrellaDetails.extraction_source).toBe('azure_di_claude');
    expect(umbrellaDetails.extraction_confidence).toBe(0.91);
  });

  it('never carries a premium field anywhere in the blob', () => {
    const json = JSON.stringify(umbrellaDetails);
    expect(json.toLowerCase()).not.toContain('premium');
  });
});

describe('shapeUmbrellaDetails - flat-dotted umbrella_field_evidence keys', () => {
  const { fieldEvidence } = shapeUmbrellaDetails(rawFixture(), NOW);

  it('emits the 6 relative in-blob paths the RPC tests with v_ev ? <path>', () => {
    expect(fieldEvidence['policy_type']).toEqual(['E0011']);
    expect(fieldEvidence['coi_summary.occurrence_or_claims_made']).toEqual(['E0019']);
    expect(fieldEvidence['coi_summary.ded_or_retention_kind']).toEqual(['E0020']);
    expect(fieldEvidence['limits.per_occurrence']).toEqual(['E0012']);
    expect(fieldEvidence['limits.aggregate']).toEqual(['E0013']);
    expect(fieldEvidence['retention.amount']).toEqual(['E0014']);
  });

  it('emits identity/dates house-standard keys', () => {
    expect(fieldEvidence['identity.carrier_naic']).toEqual(['E0004']);
    expect(fieldEvidence['identity.policy_number']).toEqual(['E0001']);
    expect(fieldEvidence['identity.named_insured']).toEqual(['E0002']);
    expect(fieldEvidence['dates.effective_date']).toEqual(['E0009']);
    expect(fieldEvidence['dates.expiration_date']).toEqual(['E0010']);
  });

  it('omits keys for fields with no cited evidence and does not descend arrays', () => {
    expect(fieldEvidence['limits.territory']).toBeUndefined();
    expect(fieldEvidence['identity.dba']).toBeUndefined();
    // underlying/AI/endorsement arrays carry their own evidence_ids columns.
    expect(Object.keys(fieldEvidence).some((k) => k.startsWith('underlying_policies'))).toBe(false);
    expect(Object.keys(fieldEvidence).some((k) => k.startsWith('additional_insureds'))).toBe(false);
  });
});

describe('enum normalizers', () => {
  it('normalizePolicyType maps umbrella/excess, null otherwise', () => {
    expect(normalizePolicyType('Commercial Umbrella')).toBe('umbrella');
    expect(normalizePolicyType('Excess Liability')).toBe('excess');
    expect(normalizePolicyType('something else')).toBeNull();
    expect(normalizePolicyType(null)).toBeNull();
  });

  it('normalizeOccurrenceBasis maps occurrence/claims-made', () => {
    expect(normalizeOccurrenceBasis('Occurrence')).toBe('occurrence');
    expect(normalizeOccurrenceBasis('Claims-Made')).toBe('claims_made');
    expect(normalizeOccurrenceBasis(null)).toBeNull();
  });

  it('normalizeDedRetentionKind treats SIR/self-insured/retained as retention', () => {
    expect(normalizeDedRetentionKind('Self-Insured Retention')).toBe('retention');
    expect(normalizeDedRetentionKind('SIR')).toBe('retention');
    expect(normalizeDedRetentionKind('Retained Limit')).toBe('retention');
    expect(normalizeDedRetentionKind('Deductible')).toBe('deductible');
    expect(normalizeDedRetentionKind(null)).toBeNull();
  });

  it('normalizeNaic keeps a 5-digit insurer NAIC, rejects a 6-digit industry code', () => {
    expect(normalizeNaic('16691')).toBe('16691');
    expect(normalizeNaic('524126')).toBeNull();
    expect(normalizeNaic(null)).toBeNull();
  });
});

describe('shapeUnderlyingRows - real columns, defends NOT NULL', () => {
  it('maps the scheduled underlying to policy_umbrella_underlying columns', () => {
    const rows = shapeUnderlyingRows(rawFixture());
    expect(rows).toHaveLength(1);
    expect(rows[0].underlying_type).toBe('general_liability');
    expect(rows[0].carrier).toBe('Travelers');
    expect(rows[0].underlying_policy_number).toBe('GL-111');
    expect(rows[0].each_occurrence).toBe(1000000);
    expect(rows[0].extraction_status).toBe('AUTO_APPLIED');
  });

  it('defaults carrier (NOT NULL) and underlying_type when the model omits them', () => {
    const raw = rawFixture();
    raw.underlying_policies = [{ each_occurrence: 1000000 }];
    const rows = shapeUnderlyingRows(raw);
    expect(rows[0].carrier).toBe('Unknown');
    expect(rows[0].underlying_type).toBe('other');
  });
});

describe('shapeRequirementsRow - single upsert row or null', () => {
  it('collects requirement values + their evidence', () => {
    const row = shapeRequirementsRow(rawFixture())!;
    expect(row.gl_each_occurrence).toBe(1000000);
    expect(row.gl_general_aggregate).toBe(2000000);
    expect(row.auto_liability).toBeNull();
    expect(row.evidence_ids).toEqual(expect.arrayContaining(['E0024', 'E0025']));
  });

  it('returns null when the doc carried no requirement values', () => {
    const raw = rawFixture();
    raw.underlying_requirements = {
      gl_each_occurrence: { value: null, evidence_ids: [] },
    };
    expect(shapeRequirementsRow(raw)).toBeNull();
  });
});

describe('shapeAdditionalInsuredRows - blanket-as-evidence, never fabricate a Y', () => {
  const rows = shapeAdditionalInsuredRows(rawFixture());

  it('named scheduled AI stays requested (never endorsed) with its address', () => {
    const scheduled = rows.find((r) => r.name === 'Port Authority')!;
    expect(scheduled.ai_type).toBe('scheduled');
    expect(scheduled.endorsement_status).toBe('requested'); // never 'endorsed'
    expect(scheduled.waiver_of_subrogation).toBe(true);
    expect(scheduled.city).toBe('Tampa');
  });

  it('synthesizes ONE blanket AI row (blanket, requested not endorsed, WOS carried, forms joined)', () => {
    const blanket = rows.find((r) => r.ai_type === 'blanket')!;
    expect(blanket.name).toContain('Blanket');
    expect(blanket.endorsement_status).toBe('requested'); // never 'endorsed'
    expect(blanket.waiver_of_subrogation).toBe(true);
    expect(blanket.endorsement_form).toContain('UMB 20 01'); // form_numbers -> endorsement_form
    expect(blanket.endorsement_form).toContain('UMB 24 04');
    expect(blanket.extraction_status).toBe('NEEDS_REVIEW');
  });

  it('no blanket row when there is no blanket evidence', () => {
    const raw = rawFixture();
    raw.additional_insured_evidence = { present: false, basis: null, form_numbers: [] };
    raw.waiver_of_subrogation_evidence = { present: false, basis: null, form_numbers: [] };
    const only = shapeAdditionalInsuredRows(raw);
    expect(only.some((r) => r.ai_type === 'blanket')).toBe(false);
  });
});

describe('shapeEndorsementRows - real columns, no premium', () => {
  it('maps title/form/category and flags limitations, drops premium_impact', () => {
    const rows = shapeEndorsementRows(rawFixture());
    expect(rows).toHaveLength(1);
    expect(rows[0].form_number).toBe('UMB 31 15');
    expect(rows[0].title).toBe('Pollution Exclusion');
    expect(rows[0].category).toBe('pollution');
    expect(rows[0].is_limitation).toBe(true);
    expect(rows[0]).not.toHaveProperty('premium_impact');
  });

  it('defaults NOT NULL form_number/title when omitted', () => {
    const raw = rawFixture();
    raw.endorsements = [{ impact_description: 'unnamed' }];
    const rows = shapeEndorsementRows(raw);
    expect(rows[0].form_number).toBe('Unknown');
    expect(rows[0].title).toBe('Endorsement');
  });
});
