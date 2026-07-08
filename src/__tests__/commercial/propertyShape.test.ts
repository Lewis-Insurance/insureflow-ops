// ============================================================================
// Commercial Property extractor shaping tests
// ============================================================================
// Proves the pure shaping helpers land the model's raw tool-use output on the
// EXACT property_details paths + flat-dotted property_field_evidence keys that
// get_master_coi / coi_build_line read for the ACORD 25 "OTHER" row (migration
// 20260702172000, property cells L951-960):
//   property_details.coi_summary.{label, limit_amount, limit_description}
// If these keys drift, Property contributes NOTHING to a certificate.
// ============================================================================

import { describe, expect, it } from 'vitest';
import {
  shapePropertyDetails,
  buildCoiSummary,
  normalizeNaic,
  normalizeConstructionType,
  shapeInterestRows,
  shapeBuildingRows,
  shapeDeductibleRows,
  type RawPropertyExtraction,
} from '../../../supabase/functions/extract-property-policy/shape.ts';

const NOW = '2026-07-08T00:00:00.000Z';

// Representative raw tool_use output: a blanket Building & BPP program with a
// model-supplied coi_summary, an insurer NAIC, a mortgagee, a named AI, and a
// blanket AI + waiver of subrogation endorsement.
function rawFixture(): RawPropertyExtraction {
  return {
    identity: {
      named_insured: { value: 'Harbor Point Holdings LLC', evidence_ids: ['E0002'] },
      dba: { value: null, evidence_ids: [] },
      carrier_name: { value: 'Cincinnati Insurance Company', evidence_ids: ['E0003'] },
      carrier_naic: { value: '10677', evidence_ids: ['E0004'] },
      policy_number: { value: 'CPP-998877', evidence_ids: ['E0001'] },
      fein: { value: '82-7654321', evidence_ids: ['E0016'] },
      mailing_address: {
        street: { value: '400 Dock St', evidence_ids: ['E0005'] },
        city: { value: 'Baltimore', evidence_ids: ['E0006'] },
        state: { value: 'MD', evidence_ids: ['E0007'] },
        zip: { value: '21230', evidence_ids: ['E0008'] },
      },
    },
    dates: {
      effective_date: { value: '2026-03-01', evidence_ids: ['E0009'] },
      expiration_date: { value: '2027-03-01', evidence_ids: ['E0010'] },
    },
    coi_summary: {
      label: { value: 'Blanket Building & BPP', evidence_ids: ['E0020'] },
      limit_amount: { value: '$5,000,000', evidence_ids: ['E0021'] },
      limit_description: { value: 'Blanket Bldg & BPP, Special Form, RC', evidence_ids: ['E0022'] },
    },
    form_details: {
      form_type: { value: 'special', evidence_ids: ['E0030'] },
      is_iso_form: { value: true, evidence_ids: [] },
      form_number: { value: 'CP 10 30', evidence_ids: ['E0031'] },
    },
    valuation_summary: {
      total_insured_value: { value: 5000000, evidence_ids: ['E0040'] },
      total_building_value: { value: 3500000, evidence_ids: ['E0041'] },
      total_bpp_value: { value: 1500000, evidence_ids: ['E0042'] },
      is_blanket: { value: true, evidence_ids: ['E0043'] },
      blanket_limit: { value: 5000000, evidence_ids: ['E0044'] },
      coinsurance_percent: { value: 90, evidence_ids: ['E0045'] },
      is_agreed_value: { value: false, evidence_ids: [] },
      margin_clause_percent: { value: null, evidence_ids: [] },
    },
    buildings: [
      {
        building_number: { value: 1, evidence_ids: ['E0050'] },
        location_number: { value: 1, evidence_ids: ['E0051'] },
        construction_type: { value: 'Masonry Non-Combustible', evidence_ids: ['E0052'] },
        year_built: { value: 1998, evidence_ids: ['E0053'] },
      },
    ],
    deductibles: [
      { peril: { value: 'aop' }, amount: { value: '$10,000' }, deductible_type: { value: 'flat' }, evidence_ids: ['E0060'] },
      // Wind/Hail as a percentage with NO amount -> must be skipped (amount NOT NULL).
      { peril: { value: 'wind_hail' }, amount: { value: null }, deductible_type: { value: 'percentage_tiv' }, percentage: { value: 2 } },
    ],
    interests: [
      {
        interest_type: { value: 'mortgagee' },
        name: { value: 'First National Bank' },
        street: { value: '1 Finance Way' },
        loan_number: { value: 'LN-4455' },
        evidence_ids: ['E0070'],
      },
    ],
    additional_insured_evidence: { present: true, basis: 'blanket', form_numbers: ['CP 12 19'], source_span: 'Blanket AI per written contract' },
    waiver_of_subrogation_evidence: { present: true, basis: 'blanket', form_numbers: ['CP 12 18'], source_span: 'Blanket WOS' },
    extraction_confidence: 0.9,
  };
}

describe('shapePropertyDetails - coi_summary contract (the OTHER-row cells)', () => {
  const { propertyDetails } = shapePropertyDetails(rawFixture(), NOW);

  it('writes the three coi_summary paths coi_build_line reads', () => {
    expect(propertyDetails.coi_summary.label).toBe('Blanket Building & BPP');
    expect(propertyDetails.coi_summary.limit_amount).toBe(5000000); // "$5,000,000" -> number
    expect(propertyDetails.coi_summary.limit_description).toBe('Blanket Bldg & BPP, Special Form, RC');
  });

  it('mirrors the GL/BAP house-standard identity/dates shape and stamps extraction_source', () => {
    expect(propertyDetails.identity.named_insured).toBe('Harbor Point Holdings LLC');
    expect(propertyDetails.identity.carrier_name).toBe('Cincinnati Insurance Company');
    expect(propertyDetails.identity.carrier_naic).toBe('10677');
    expect(propertyDetails.identity.policy_number).toBe('CPP-998877');
    expect(propertyDetails.identity.fein).toBe('82-7654321');
    expect(propertyDetails.identity.mailing_address.city).toBe('Baltimore');
    expect(propertyDetails.dates.effective_date).toBe('2026-03-01');
    expect(propertyDetails.dates.expiration_date).toBe('2027-03-01');
    expect(propertyDetails.extraction_source).toBe('azure_di_claude');
    expect(propertyDetails.extraction_confidence).toBe(0.9);
  });

  it('keeps the rich valuation blob but never a premium', () => {
    expect(propertyDetails.valuation_summary.is_blanket).toBe(true);
    expect(propertyDetails.valuation_summary.blanket_limit).toBe(5000000);
    expect(propertyDetails.valuation_summary.total_bpp_value).toBe(1500000);
    expect((propertyDetails as Record<string, unknown>).premium).toBeUndefined();
  });
});

describe('shapePropertyDetails - flat-dotted property_field_evidence keys', () => {
  const { fieldEvidence } = shapePropertyDetails(rawFixture(), NOW);

  it('emits the coi_summary evidence keys the RPC tests with v_ev ? <path>', () => {
    expect(fieldEvidence['coi_summary.label']).toEqual(['E0020']);
    expect(fieldEvidence['coi_summary.limit_amount']).toEqual(['E0021']);
    expect(fieldEvidence['coi_summary.limit_description']).toEqual(['E0022']);
  });

  it('emits identity/dates evidence keys (GL house standard)', () => {
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
});

describe('buildCoiSummary - limit_amount derivation fallback', () => {
  it('derives limit_amount from the blanket limit when the model omits coi_summary.limit_amount, carrying that source evidence', () => {
    const raw = rawFixture();
    // Model gave a label but no headline limit -> derive from blanket_limit.
    raw.coi_summary = { label: { value: 'Blanket Building & BPP', evidence_ids: ['E0020'] } };
    const coi = buildCoiSummary(raw);
    expect(coi.limit_amount).toBe(5000000);
    expect(coi.derived.limit_amount).toBe(true);
    expect(coi.derived.limit_source).toBe('valuation_summary.blanket_limit');
    expect(coi.evidence.limit_amount).toEqual(['E0044']); // blanket_limit's evidence
  });

  it('falls back to Total Insured Value when not blanket', () => {
    const raw = rawFixture();
    raw.coi_summary = {};
    raw.valuation_summary!.is_blanket = { value: false, evidence_ids: [] };
    raw.valuation_summary!.blanket_limit = { value: null, evidence_ids: [] };
    const coi = buildCoiSummary(raw);
    expect(coi.limit_amount).toBe(5000000);
    expect(coi.derived.limit_source).toBe('valuation_summary.total_insured_value');
  });

  it('falls back to building + BPP total when TIV/blanket are absent', () => {
    const raw = rawFixture();
    raw.coi_summary = {};
    raw.valuation_summary!.is_blanket = { value: false, evidence_ids: [] };
    raw.valuation_summary!.blanket_limit = { value: null, evidence_ids: [] };
    raw.valuation_summary!.total_insured_value = { value: null, evidence_ids: [] };
    const coi = buildCoiSummary(raw);
    expect(coi.limit_amount).toBe(3500000 + 1500000);
    expect(coi.derived.limit_source).toBe('valuation_summary.total_building_value+total_bpp_value');
    expect(coi.evidence.limit_amount).toEqual(['E0041', 'E0042']);
  });

  it('derives a label + description heuristically when the model omits them (no fabricated evidence)', () => {
    const raw = rawFixture();
    raw.coi_summary = { limit_amount: { value: 5000000, evidence_ids: ['E0021'] } };
    const coi = buildCoiSummary(raw);
    expect(coi.label).toBe('Blanket Building & Personal Property');
    expect(coi.derived.label).toBe(true);
    expect(coi.evidence.label).toBeUndefined();
    expect(coi.limit_description).toContain('Blanket');
    expect(coi.limit_description).toContain('Special Form');
    expect(coi.derived.limit_description).toBe(true);
  });
});

describe('normalizeNaic - insurer NAIC, never industry NAICS/SIC', () => {
  it('keeps a 5-digit insurer NAIC', () => {
    expect(normalizeNaic('10677')).toBe('10677');
  });
  it('rejects a 6-digit industry NAICS code', () => {
    expect(normalizeNaic('531120')).toBeNull();
  });
  it('returns null when absent (downstream name->NAIC lookup)', () => {
    expect(normalizeNaic(null)).toBeNull();
    expect(normalizeNaic('')).toBeNull();
  });
});

describe('normalizeConstructionType - free text -> CHECK enum', () => {
  it('maps common phrasings to the enum values', () => {
    expect(normalizeConstructionType('Masonry Non-Combustible')).toBe('masonry_noncombustible');
    expect(normalizeConstructionType('Frame')).toBe('frame');
    expect(normalizeConstructionType('Fire Resistive')).toBe('fire_resistive');
    expect(normalizeConstructionType('something else')).toBeNull();
  });
});

describe('building rows - defend the construction_type CHECK', () => {
  const rows = shapeBuildingRows(rawFixture());
  it('normalizes construction_type and derives the ISO class', () => {
    expect(rows).toHaveLength(1);
    expect(rows[0].construction_type).toBe('masonry_noncombustible');
    expect(rows[0].iso_construction_class).toBe(4);
    expect(rows[0].building_number).toBe(1);
    expect(rows[0].location_number).toBe(1);
  });
});

describe('deductible rows - amount is NOT NULL', () => {
  const rows = shapeDeductibleRows(rawFixture());
  it('keeps the AOP deductible and drops the amount-less wind/hail row', () => {
    expect(rows).toHaveLength(1);
    expect(rows[0].peril).toBe('aop');
    expect(rows[0].amount).toBe(10000);
    expect(rows[0].deductible_type).toBe('flat');
  });
});

describe('interest rows - blanket-as-evidence, never fabricate a Y', () => {
  const rows = shapeInterestRows(rawFixture());

  it('named non-AI interest stays endorsement_status none (constraint) and blanket false', () => {
    const bank = rows.find((r) => r.name === 'First National Bank')!;
    expect(bank.interest_type).toBe('mortgagee');
    expect(bank.endorsement_status).toBe('none');
    expect(bank.blanket).toBe(false);
    expect(bank.loan_number).toBe('LN-4455');
  });

  it('synthesizes one blanket AI row (blanket=true, requested not endorsed, WOS carried)', () => {
    const blanket = rows.find((r) => r.blanket === true)!;
    expect(blanket.interest_type).toBe('additional_insured');
    expect(blanket.endorsement_status).toBe('requested'); // never 'endorsed'
    expect(blanket.waiver_of_subrogation).toBe(true);
    expect(blanket.endorsement_form).toContain('CP 12 19');
    expect(blanket.endorsement_form).toContain('CP 12 18');
  });

  it('no blanket row when there is no blanket evidence', () => {
    const raw = rawFixture();
    raw.additional_insured_evidence = { present: false, basis: null, form_numbers: [] };
    raw.waiver_of_subrogation_evidence = { present: false, basis: null, form_numbers: [] };
    const only = shapeInterestRows(raw);
    expect(only.some((r) => r.blanket === true)).toBe(false);
  });
});
