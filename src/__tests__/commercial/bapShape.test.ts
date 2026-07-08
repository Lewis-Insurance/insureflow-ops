// ============================================================================
// BAP extractor shaping tests
// ============================================================================
// Proves the pure shaping helpers land the model's raw tool-use output on the
// EXACT bap_details paths + flat-dotted bap_field_evidence keys that
// get_master_coi / coi_build_line read (migration 20260702172000, auto cells
// L847-867). If these keys drift, the COI Auto section silently reads null.
// ============================================================================

import { describe, expect, it } from 'vitest';
import {
  shapeBapDetails,
  mapSymbolCodesToBooleans,
  normalizeNaic,
  vinForRow,
  shapeVehicleRows,
  shapeInterestRows,
  type RawBapExtraction,
} from '../../../supabase/functions/extract-bap-policy/shape.ts';

const NOW = '2026-07-08T00:00:00.000Z';

// Representative raw tool_use output: CSL liability, Any/Owned/Scheduled/Hired/
// Non-owned symbols (1,2,7,8,9), an insurer NAIC, a blanket AI + waiver.
function rawFixture(): RawBapExtraction {
  return {
    identity: {
      named_insured: { value: 'Acme Trucking LLC', evidence_ids: ['E0002'] },
      dba: { value: null, evidence_ids: [] },
      carrier_name: { value: 'Progressive Commercial', evidence_ids: ['E0003'] },
      carrier_naic: { value: '42986', evidence_ids: ['E0004'] },
      policy_number: { value: 'BA-123456', evidence_ids: ['E0001'] },
      fein: { value: '59-1234567', evidence_ids: ['E0016'] },
      mailing_address: {
        street: { value: '100 Main St', evidence_ids: ['E0005'] },
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
      liability: {
        limit_type: { value: 'csl', evidence_ids: ['E0011'] },
        csl_limit: { value: '$1,000,000', evidence_ids: ['E0012'] },
        bodily_injury_per_person: { value: null, evidence_ids: [] },
        bodily_injury_per_accident: { value: null, evidence_ids: [] },
        property_damage: { value: null, evidence_ids: [] },
      },
      covered_auto_symbols: { value: [1, 2, 7, 8, 9], evidence_ids: ['E0013'] },
    },
    vehicles: [
      { unit_number: '1', vin: null, year: 2020, make: 'Freightliner', model: 'Cascadia', evidence_ids: ['E0014'] },
    ],
    additional_interests: [
      { name: 'City Bank', interest_type: 'loss_payee', address: { street: '5 Bank Rd', city: 'Tampa', state: 'FL', zip: '33602' }, evidence_ids: ['E0015'] },
    ],
    additional_insured_evidence: { present: true, basis: 'blanket', form_numbers: ['CA 20 48'], source_span: 'Blanket AI per written contract' },
    waiver_of_subrogation_evidence: { present: true, basis: 'blanket', form_numbers: ['CA 04 44'], source_span: 'Blanket WOS' },
    extraction_confidence: 0.92,
  };
}

describe('shapeBapDetails - coverage contract paths', () => {
  const { bapDetails } = shapeBapDetails(rawFixture(), NOW);

  it('writes the liability limit paths coi_build_line reads', () => {
    expect(bapDetails.coverage.liability.limit_type).toBe('csl');
    expect(bapDetails.coverage.liability.csl_limit).toBe(1000000); // "$1,000,000" -> number
    expect(bapDetails.coverage.liability.bodily_injury_per_person).toBeNull();
    expect(bapDetails.coverage.liability.bodily_injury_per_accident).toBeNull();
    expect(bapDetails.coverage.liability.property_damage).toBeNull();
  });

  it('writes the five named symbol booleans (7=scheduled, 8=hired)', () => {
    expect(bapDetails.coverage.symbols).toEqual({
      any_auto: true,
      owned_autos: true,
      scheduled_autos: true, // symbol 7 = Specifically Described
      hired_autos: true, // symbol 8 = Hired
      non_owned_autos: true,
    });
  });

  it('mirrors the GL house-standard identity/dates shape and stamps extraction_source', () => {
    expect(bapDetails.identity.named_insured).toBe('Acme Trucking LLC');
    expect(bapDetails.identity.carrier_name).toBe('Progressive Commercial');
    expect(bapDetails.identity.carrier_naic).toBe('42986');
    expect(bapDetails.identity.policy_number).toBe('BA-123456'); // under identity, GL standard
    expect(bapDetails.identity.fein).toBe('59-1234567');
    expect(bapDetails.identity.mailing_address.street).toBe('100 Main St');
    expect(bapDetails.dates.effective_date).toBe('2026-01-01');
    expect(bapDetails.dates.expiration_date).toBe('2027-01-01');
    expect(bapDetails.extraction_source).toBe('azure_di_claude');
    expect(bapDetails.extraction_confidence).toBe(0.92);
  });
});

describe('shapeBapDetails - flat-dotted bap_field_evidence keys', () => {
  const { fieldEvidence } = shapeBapDetails(rawFixture(), NOW);

  it('keys are the relative in-blob paths the RPC tests with v_ev ? <path>', () => {
    expect(fieldEvidence['coverage.liability.csl_limit']).toEqual(['E0012']);
    expect(fieldEvidence['coverage.liability.limit_type']).toEqual(['E0011']);
    expect(fieldEvidence['identity.carrier_naic']).toEqual(['E0004']);
    expect(fieldEvidence['identity.named_insured']).toEqual(['E0002']);
    expect(fieldEvidence['identity.policy_number']).toEqual(['E0001']); // under identity, GL standard
    expect(fieldEvidence['identity.fein']).toEqual(['E0016']);
    expect(fieldEvidence['dates.effective_date']).toEqual(['E0009']);
    expect(fieldEvidence['dates.expiration_date']).toEqual(['E0010']);
  });

  it('attributes each TRUE symbol boolean under coverage.symbols.<name>', () => {
    expect(fieldEvidence['coverage.symbols.any_auto']).toEqual(['E0013']);
    expect(fieldEvidence['coverage.symbols.scheduled_autos']).toEqual(['E0013']);
    expect(fieldEvidence['coverage.symbols.hired_autos']).toEqual(['E0013']);
  });

  it('does not emit the raw covered_auto_symbols path (blob uses coverage.symbols.*)', () => {
    expect(fieldEvidence['coverage.covered_auto_symbols']).toBeUndefined();
  });

  it('omits keys for fields with no cited evidence', () => {
    expect(fieldEvidence['coverage.liability.property_damage']).toBeUndefined();
    expect(fieldEvidence['identity.dba']).toBeUndefined();
  });
});

describe('symbol legend mapping', () => {
  it('empty codes => all null (missing, not a definitive no)', () => {
    expect(mapSymbolCodesToBooleans([])).toEqual({
      any_auto: null, owned_autos: null, scheduled_autos: null, hired_autos: null, non_owned_autos: null,
    });
  });

  it('code 7 is scheduled and code 8 is hired (ACORD legend, not the brief hint)', () => {
    const flags = mapSymbolCodesToBooleans([7]);
    expect(flags.scheduled_autos).toBe(true);
    expect(flags.hired_autos).toBe(false);
    const flags8 = mapSymbolCodesToBooleans([8]);
    expect(flags8.hired_autos).toBe(true);
    expect(flags8.scheduled_autos).toBe(false);
  });

  it('owned subsets 3-6 roll up to owned_autos', () => {
    expect(mapSymbolCodesToBooleans([4]).owned_autos).toBe(true);
  });
});

describe('normalizeNaic - insurer NAIC, never industry NAICS/SIC', () => {
  it('keeps a 5-digit insurer NAIC', () => {
    expect(normalizeNaic('42986')).toBe('42986');
  });
  it('rejects a 6-digit industry NAICS code', () => {
    expect(normalizeNaic('484121')).toBeNull();
  });
  it('returns null when absent (downstream name->NAIC lookup)', () => {
    expect(normalizeNaic(null)).toBeNull();
    expect(normalizeNaic('')).toBeNull();
  });
});

describe('vehicle rows - masked VIN handling', () => {
  it('substitutes a unique placeholder when VIN is null/redacted, never crashes NOT NULL', () => {
    expect(vinForRow(null, 0)).toBe('UNKNOWN-1');
    expect(vinForRow('[REDACTED_VIN]', 2)).toBe('UNKNOWN-3');
    expect(vinForRow('1FUJGLDR3CSBP1234', 0)).toBe('1FUJGLDR3CSBP1234');
  });

  it('keeps a vehicle with a masked VIN (stores what is present)', () => {
    const rows = shapeVehicleRows(rawFixture());
    expect(rows).toHaveLength(1);
    expect(rows[0].vin).toBe('UNKNOWN-1');
    expect(rows[0].make).toBe('Freightliner');
    expect(rows[0].year).toBe(2020);
  });

  it('drops a vehicle missing NOT NULL make/model/year', () => {
    const raw = rawFixture();
    raw.vehicles = [{ unit_number: '9', vin: null }];
    expect(shapeVehicleRows(raw)).toHaveLength(0);
  });
});

describe('interest rows - blanket-as-evidence, never fabricate a Y', () => {
  const rows = shapeInterestRows(rawFixture());

  it('named non-AI interest stays endorsement_status none (constraint) and blanket false', () => {
    const bank = rows.find((r) => r.name === 'City Bank')!;
    expect(bank.interest_type).toBe('loss_payee');
    expect(bank.endorsement_status).toBe('none');
    expect(bank.blanket).toBe(false);
  });

  it('synthesizes one blanket AI row (blanket=true, requested not endorsed, WOS carried)', () => {
    const blanket = rows.find((r) => r.blanket === true)!;
    expect(blanket.interest_type).toBe('additional_insured');
    expect(blanket.endorsement_status).toBe('requested'); // never 'endorsed'
    expect(blanket.waiver_of_subrogation).toBe(true);
    expect(blanket.endorsement_form).toContain('CA 20 48');
    expect(blanket.endorsement_form).toContain('CA 04 44');
  });

  it('no blanket row when there is no blanket evidence', () => {
    const raw = rawFixture();
    raw.additional_insured_evidence = { present: false, basis: null, form_numbers: [] };
    raw.waiver_of_subrogation_evidence = { present: false, basis: null, form_numbers: [] };
    const only = shapeInterestRows(raw);
    expect(only.some((r) => r.blanket === true)).toBe(false);
  });
});

describe('split-limit variant', () => {
  it('carries BI/PD split limits and no CSL', () => {
    const raw = rawFixture();
    raw.coverage!.liability = {
      limit_type: { value: 'split', evidence_ids: ['E1'] },
      csl_limit: { value: null, evidence_ids: [] },
      bodily_injury_per_person: { value: 100000, evidence_ids: ['E2'] },
      bodily_injury_per_accident: { value: 300000, evidence_ids: ['E3'] },
      property_damage: { value: 50000, evidence_ids: ['E4'] },
    };
    const { bapDetails, fieldEvidence } = shapeBapDetails(raw, NOW);
    expect(bapDetails.coverage.liability.limit_type).toBe('split');
    expect(bapDetails.coverage.liability.csl_limit).toBeNull();
    expect(bapDetails.coverage.liability.bodily_injury_per_person).toBe(100000);
    expect(bapDetails.coverage.liability.property_damage).toBe(50000);
    expect(fieldEvidence['coverage.liability.bodily_injury_per_accident']).toEqual(['E3']);
  });
});
