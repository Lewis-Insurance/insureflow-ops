// packetAdapters.test.ts
//
// Contract tests for the two risk-store -> ACORD input adapters that feed the
// GL submission-packet pipeline (Phase 1b):
//   src/lib/acord/acord125/fromRiskStore.ts
//   src/lib/acord/acord126/fromRiskStore.ts
// Covers: golden full-shape mapping, empty/null tolerance, expiration =
// effective + 1 year (incl. year boundary + leap-day clamp), premises
// truncation at 4, target_lines -> lines-of-business mapping, interest and
// aggregate-basis vocabulary guards, and integration with the downstream
// builders/validators (the adapters' output is a valid builder input).

import { describe, it, expect } from 'vitest';
import {
  buildAcord125InputFromRiskStore,
  type BuildAcord125FromRiskStoreArgs,
  type RiskStoreLocation,
} from '@/lib/acord/acord125/fromRiskStore';
import { buildAcord125FieldValues } from '@/lib/acord/acord125/buildAcord125FieldValues';
import { validateAcord125 } from '@/lib/acord/acord125/validateAcord125';
import {
  buildAcord126InputFromRiskStore,
  type BuildAcord126FromRiskStoreArgs,
  type RiskStoreGlLimits,
} from '@/lib/acord/acord126/fromRiskStore';
import { buildAcord126FieldValues } from '@/lib/acord/acord126/buildAcord126FieldValues';
import { validateAcord126 } from '@/lib/acord/acord126/validateAcord126';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PRODUCER = {
  name: 'Lewis Insurance Associates',
  addressLine1: '100 Main St',
  city: 'Fredericksburg',
  state: 'VA',
  zip: '22401',
  phone: '540 555 0100',
  email: 'commercial@lewisinsurance.com',
};

function location(overrides: Partial<RiskStoreLocation> = {}): RiskStoreLocation {
  return {
    address_line1: '9 Dock Rd',
    address_line2: 'Unit B',
    city: 'Richmond',
    state: 'VA',
    zip: '23220',
    county: 'Henrico',
    interest: 'owner',
    ...overrides,
  };
}

function fullArgs125(): BuildAcord125FromRiskStoreArgs {
  return {
    submission: {
      effective_date: '2026-08-01',
      target_lines: ['gl', 'property', 'umbrella'],
    },
    account: { name: 'Riverbend Electrical' },
    profile: {
      legal_name: 'Riverbend Electrical LLC',
      entity_type: 'llc',
      fein: '12-3456789',
      sic_code: '1731',
      naics_code: '238210',
      website: 'https://riverbend.example.com',
      description_of_operations: 'Electrical contractor serving commercial builds.',
    },
    locations: [
      location(),
      location({
        address_line1: '14 Yard Way',
        address_line2: null,
        city: 'Ashland',
        zip: '23005',
        county: 'Hanover',
        interest: 'tenant',
      }),
    ],
    producer: PRODUCER,
    completionDateIso: '2026-07-06',
  };
}

const NULL_GL_LIMITS: RiskStoreGlLimits = {
  each_occurrence: null,
  general_aggregate: null,
  damage_to_rented_premises: null,
  medical_expense: null,
  personal_advertising_injury: null,
  products_completed_ops_aggregate: null,
  aggregate_applies_per: null,
};

function fullArgs126(): BuildAcord126FromRiskStoreArgs {
  return {
    submission: { effective_date: '2026-08-01' },
    account: { name: 'Riverbend Electrical LLC' },
    glLimits: {
      each_occurrence: 1000000,
      general_aggregate: 2000000,
      damage_to_rented_premises: 100000,
      medical_expense: 5000,
      personal_advertising_injury: 1000000,
      products_completed_ops_aggregate: 2000000,
      aggregate_applies_per: 'policy',
    },
    producerName: PRODUCER.name,
    completionDateIso: '2026-07-06',
  };
}

// ---------------------------------------------------------------------------
// ACORD 125 adapter
// ---------------------------------------------------------------------------

describe('buildAcord125InputFromRiskStore', () => {
  it('maps a fully populated risk store to the golden Acord125Input', () => {
    const input = buildAcord125InputFromRiskStore(fullArgs125());

    expect(input.completionDate).toBe('2026-07-06');

    // Producer block: arg-backed fields map; blank fields stay blank.
    expect(input.producer.name).toBe('Lewis Insurance Associates');
    expect(input.producer.addressLine1).toBe('100 Main St');
    expect(input.producer.city).toBe('Fredericksburg');
    expect(input.producer.state).toBe('VA');
    expect(input.producer.zip).toBe('22401');
    expect(input.producer.phone).toBe('540 555 0100');
    expect(input.producer.email).toBe('commercial@lewisinsurance.com');
    expect(input.producer.addressLine2).toBe('');
    expect(input.producer.contactName).toBe('');
    expect(input.producer.fax).toBe('');
    expect(input.producer.customerId).toBe('');
    expect(input.producer.authorizedRepName).toBe('');

    // Named insured: legal name preferred; mailing address from location #1.
    expect(input.namedInsured.name).toBe('Riverbend Electrical LLC');
    expect(input.namedInsured.addressLine1).toBe('9 Dock Rd');
    expect(input.namedInsured.addressLine2).toBe('Unit B');
    expect(input.namedInsured.city).toBe('Richmond');
    expect(input.namedInsured.state).toBe('VA');
    expect(input.namedInsured.zip).toBe('23220');
    expect(input.namedInsured.entityType).toBe('llc');
    expect(input.namedInsured.fein).toBe('12-3456789');
    expect(input.namedInsured.sic).toBe('1731');
    expect(input.namedInsured.naics).toBe('238210');
    expect(input.namedInsured.website).toBe('https://riverbend.example.com');
    expect(input.namedInsured.phone).toBe('');

    // Policy dates: expiration = effective + 1 year; no number yet.
    expect(input.policy.effectiveDate).toBe('2026-08-01');
    expect(input.policy.expirationDate).toBe('2027-08-01');
    expect(input.policy.policyNumber).toBe('');

    // Lines of business from target_lines; premium never prefills.
    expect(input.linesOfBusiness).toEqual({
      gl: true,
      glPremium: null,
      property: true,
      auto: false,
      umbrella: true,
    });

    // Premises: street joins line1 + line2; interest vocabulary maps.
    expect(input.premises).toHaveLength(2);
    expect(input.premises[0]).toEqual({
      street: '9 Dock Rd, Unit B',
      city: 'Richmond',
      state: 'VA',
      zip: '23220',
      county: 'Henrico',
      interest: 'own',
    });
    expect(input.premises[1].street).toBe('14 Yard Way');
    expect(input.premises[1].interest).toBe('lease');

    expect(input.natureOfBusiness.description).toBe(
      'Electrical contractor serving commercial builds.',
    );
  });

  it('feeds the downstream builder and validator cleanly (golden integration)', () => {
    const input = buildAcord125InputFromRiskStore(fullArgs125());
    expect(validateAcord125(input).valid).toBe(true);
    const build = buildAcord125FieldValues(input);
    expect(build.ok).toBe(true);
    expect(build.issues).toEqual([]);
  });

  it('tolerates a null profile, no locations, and null fields end to end', () => {
    const input = buildAcord125InputFromRiskStore({
      submission: { effective_date: null, target_lines: [] },
      account: { name: null },
      profile: null,
      locations: [],
      producer: PRODUCER,
      completionDateIso: '2026-07-06',
    });

    expect(input.namedInsured.name).toBe('');
    expect(input.namedInsured.addressLine1).toBe('');
    expect(input.namedInsured.entityType).toBeNull();
    expect(input.namedInsured.fein).toBe('');
    expect(input.policy.effectiveDate).toBe('');
    expect(input.policy.expirationDate).toBe('');
    expect(input.premises).toEqual([]);
    expect(input.natureOfBusiness.description).toBe('');

    // The builder never throws on the empty shape; the validator names the gap.
    expect(() => buildAcord125FieldValues(input)).not.toThrow();
    const validation = validateAcord125(input);
    expect(validation.valid).toBe(false);
    expect(validation.issues.map((i) => i.code)).toContain('INSURED_NAME_MISSING');
  });

  it('falls back to the account name when the profile has no legal name', () => {
    const args = fullArgs125();
    args.profile = { ...args.profile!, legal_name: null };
    const input = buildAcord125InputFromRiskStore(args);
    expect(input.namedInsured.name).toBe('Riverbend Electrical');
  });

  it('computes expiration = effective + 1 year across a year boundary', () => {
    const args = fullArgs125();
    args.submission.effective_date = '2026-12-31';
    expect(buildAcord125InputFromRiskStore(args).policy.expirationDate).toBe('2027-12-31');
  });

  it('clamps a leap-day effective date to Feb 28 of the non-leap target year', () => {
    const args = fullArgs125();
    args.submission.effective_date = '2024-02-29';
    expect(buildAcord125InputFromRiskStore(args).policy.expirationDate).toBe('2025-02-28');
  });

  it('leaves expiration blank when the effective date is malformed', () => {
    const args = fullArgs125();
    args.submission.effective_date = '08/01/2026';
    const input = buildAcord125InputFromRiskStore(args);
    expect(input.policy.effectiveDate).toBe('08/01/2026');
    expect(input.policy.expirationDate).toBe('');
  });

  it('truncates premises at the 4 form rows, in caller order', () => {
    const args = fullArgs125();
    args.locations = [1, 2, 3, 4, 5, 6].map((n) =>
      location({ address_line1: `${n} Row St`, address_line2: null }),
    );
    const input = buildAcord125InputFromRiskStore(args);
    expect(input.premises).toHaveLength(4);
    expect(input.premises.map((p) => p.street)).toEqual([
      '1 Row St',
      '2 Row St',
      '3 Row St',
      '4 Row St',
    ]);
  });

  it('maps target_lines onto the four LOB checkboxes and ignores wc/other', () => {
    const args = fullArgs125();
    args.submission.target_lines = ['wc', 'other', 'auto'];
    const lob = buildAcord125InputFromRiskStore(args).linesOfBusiness;
    expect(lob).toEqual({
      gl: false,
      glPremium: null,
      property: false,
      auto: true,
      umbrella: false,
    });
  });

  it('guards the interest and entity vocabularies (unknown -> null)', () => {
    const args = fullArgs125();
    args.profile = { ...args.profile!, entity_type: 'municipality' };
    args.locations = [
      location({ interest: 'own' }),
      location({ interest: 'lease' }),
      location({ interest: 'managed' }),
      location({ interest: null }),
    ];
    const input = buildAcord125InputFromRiskStore(args);
    expect(input.namedInsured.entityType).toBeNull();
    expect(input.premises.map((p) => p.interest)).toEqual(['own', 'lease', null, null]);
  });
});

// ---------------------------------------------------------------------------
// ACORD 126 adapter
// ---------------------------------------------------------------------------

describe('buildAcord126InputFromRiskStore', () => {
  it('maps full GL limits to the golden Acord126Input', () => {
    const input = buildAcord126InputFromRiskStore(fullArgs126());

    expect(input.header).toEqual({
      namedInsured: 'Riverbend Electrical LLC',
      effectiveDate: '2026-08-01',
      producerName: 'Lewis Insurance Associates',
    });
    expect(input.coverage).toEqual({ occurrence: true, claimsMade: false });
    expect(input.limits).toEqual({
      eachOccurrence: 1000000,
      damageToRentedPremises: 100000,
      medicalExpense: 5000,
      personalAdvInjury: 1000000,
      generalAggregate: 2000000,
      productsCompOpsAggregate: 2000000,
    });
    expect(input.aggregateAppliesPer).toBe('policy');
    expect(input.hazards).toEqual([]);
  });

  it('feeds the downstream builder and validator cleanly (golden integration)', () => {
    const input = buildAcord126InputFromRiskStore(fullArgs126());
    expect(validateAcord126(input).valid).toBe(true);
    const build = buildAcord126FieldValues(input);
    expect(build.ok).toBe(true);
    expect(build.issues).toEqual([]);
  });

  it('prints all limits blank on a non-remarket (null glLimits) and lets the validator name the gaps', () => {
    const args = fullArgs126();
    args.glLimits = null;
    const input = buildAcord126InputFromRiskStore(args);

    expect(input.limits).toEqual({
      eachOccurrence: null,
      damageToRentedPremises: null,
      medicalExpense: null,
      personalAdvInjury: null,
      generalAggregate: null,
      productsCompOpsAggregate: null,
    });
    expect(input.aggregateAppliesPer).toBeNull();
    expect(input.coverage).toEqual({ occurrence: true, claimsMade: false });

    const validation = validateAcord126(input);
    expect(validation.valid).toBe(false);
    expect(validation.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(['EACH_OCCURRENCE_MISSING', 'GENERAL_AGGREGATE_MISSING']),
    );
  });

  it('tolerates junk JSONB limit values and null header fields', () => {
    const args = fullArgs126();
    args.submission.effective_date = null;
    args.account.name = null;
    args.glLimits = {
      ...NULL_GL_LIMITS,
      each_occurrence: '1000000',
      general_aggregate: Number.NaN,
      medical_expense: Number.POSITIVE_INFINITY,
    } as unknown as RiskStoreGlLimits;

    const input = buildAcord126InputFromRiskStore(args);
    expect(input.header.namedInsured).toBe('');
    expect(input.header.effectiveDate).toBe('');
    expect(input.limits.eachOccurrence).toBeNull();
    expect(input.limits.generalAggregate).toBeNull();
    expect(input.limits.medicalExpense).toBeNull();
    expect(() => buildAcord126FieldValues(input)).not.toThrow();
  });

  it('guards the aggregate-applies-per vocabulary (case folds, unknown -> null)', () => {
    const args = fullArgs126();
    args.glLimits = { ...args.glLimits!, aggregate_applies_per: 'Project' };
    expect(buildAcord126InputFromRiskStore(args).aggregateAppliesPer).toBe('project');

    args.glLimits = { ...args.glLimits!, aggregate_applies_per: 'per policy' };
    expect(buildAcord126InputFromRiskStore(args).aggregateAppliesPer).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Packet-mode validation (mode: 'packet'): a legitimately-sparse FRESH
// submission must not fail validation; the sparse-data rules downgrade to
// warnings while true contradictions stay errors. Default mode ('policy')
// keeps the original hard-error behavior, asserted alongside each case.
// ---------------------------------------------------------------------------

describe('packet-mode validation', () => {
  it('downgrades the missing GL limit pair to warnings on a fresh (null-limits) 126', () => {
    const args = fullArgs126();
    args.glLimits = null;
    const input = buildAcord126InputFromRiskStore(args);

    // Default 'policy' mode: unchanged, the pair is a hard error.
    expect(validateAcord126(input).valid).toBe(false);

    const packet = validateAcord126(input, { mode: 'packet' });
    expect(packet.valid).toBe(true);
    expect(packet.issues.map((i) => [i.code, i.severity])).toEqual(
      expect.arrayContaining([
        ['EACH_OCCURRENCE_MISSING', 'warning'],
        ['GENERAL_AGGREGATE_MISSING', 'warning'],
      ]),
    );
  });

  it('keeps the coverage-form conflict a hard error in packet mode', () => {
    const input = buildAcord126InputFromRiskStore(fullArgs126());
    input.coverage = { occurrence: true, claimsMade: true };
    const packet = validateAcord126(input, { mode: 'packet' });
    expect(packet.valid).toBe(false);
    expect(packet.issues.map((i) => i.code)).toContain('COVERAGE_FORM_CONFLICT');
  });

  it('downgrades the missing effective date to a warning on a dateless 125 packet', () => {
    const args = fullArgs125();
    args.submission.effective_date = null;
    const input = buildAcord125InputFromRiskStore(args);

    // Default 'policy' mode: unchanged, lines without a date are a hard error.
    expect(validateAcord125(input).valid).toBe(false);

    const packet = validateAcord125(input, { mode: 'packet' });
    expect(packet.valid).toBe(true);
    expect(packet.issues).toEqual([
      expect.objectContaining({ code: 'EFFECTIVE_DATE_MISSING', severity: 'warning' }),
    ]);
  });

  it('keeps the missing insured name a hard error in packet mode', () => {
    const input = buildAcord125InputFromRiskStore({
      submission: { effective_date: '2026-08-01', target_lines: ['gl'] },
      account: { name: null },
      profile: null,
      locations: [],
      producer: PRODUCER,
      completionDateIso: '2026-07-06',
    });
    const packet = validateAcord125(input, { mode: 'packet' });
    expect(packet.valid).toBe(false);
    expect(packet.issues.map((i) => i.code)).toContain('INSURED_NAME_MISSING');
  });
});
