import { describe, it, expect } from 'vitest';
import {
  mapIntakeToCoterieQuoteRequest,
  mapCoterieQuoteResponseToResult,
  toCoterieDate,
  type RawCoterieQuoteResponse,
} from '../../../supabase/functions/_shared/coterie/mappers.ts';
import type { CommercialQuoteInput } from '../../../supabase/functions/_shared/carrier-adapter/types.ts';
import quoteSuccess from '../../../supabase/functions/_shared/coterie/fixtures/quote-success.json';
import quoteDecline from '../../../supabase/functions/_shared/coterie/fixtures/quote-decline.json';
import quoteValidationError from '../../../supabase/functions/_shared/coterie/fixtures/quote-validation-error.json';

const baseIntake: CommercialQuoteInput = {
  accountId: 'acc-1',
  lines: ['BOP', 'GL'],
  businessName: 'Acme Coffee Roasters',
  businessStartDate: '2020-03-15', // ISO -> should normalize to MM-DD-YYYY
  glLimit: 1000000,
  annualPayroll: 250000,
  grossAnnualSales: 800000,
  numEmployees: 6,
  contact: {
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@acme.test',
    phone: '555-123-4567',
  },
  mailingAddress: { street: '1 Main St', city: 'Austin', state: 'TX', zip: '78701' },
};

describe('mapIntakeToCoterieQuoteRequest', () => {
  it('maps a normalized intake to the bindable request body', () => {
    const req = mapIntakeToCoterieQuoteRequest(baseIntake);

    expect(req.applicationTypes).toEqual(['BOP', 'GL']);
    expect(req.glLimit).toBe(1000000);
    expect(req.annualPayroll).toBe(250000);
    expect(req.grossAnnualSales).toBe(800000);
    expect(req.numEmployees).toBe(6);

    // Mailing + contact fan-out
    expect(req.mailingAddressStreet).toBe('1 Main St');
    expect(req.mailingAddressCity).toBe('Austin');
    expect(req.mailingAddressState).toBe('TX');
    expect(req.mailingAddressZip).toBe('78701');
    expect(req.contactFirstName).toBe('Jane');
    expect(req.contactLastName).toBe('Doe');
    expect(req.contactEmail).toBe('jane@acme.test');
    expect(req.contactPhone).toBe('555-123-4567');

    // Date normalized to MM-DD-YYYY
    expect(req.businessStartDate).toBe('03-15-2020');
  });

  it('sends BOTH name fields, defaulting legalBusinessName to businessName', () => {
    const req = mapIntakeToCoterieQuoteRequest(baseIntake);
    expect(req.businessName).toBe('Acme Coffee Roasters');
    expect(req.legalBusinessName).toBe('Acme Coffee Roasters');

    const withLegal = mapIntakeToCoterieQuoteRequest({
      ...baseIntake,
      legalBusinessName: 'Acme Coffee Roasters, LLC',
    });
    expect(withLegal.businessName).toBe('Acme Coffee Roasters');
    expect(withLegal.legalBusinessName).toBe('Acme Coffee Roasters, LLC');
  });

  it('emits previousLosses: [] when there are no prior losses', () => {
    const req = mapIntakeToCoterieQuoteRequest(baseIntake);
    expect(Array.isArray(req.previousLosses)).toBe(true);
    expect(req.previousLosses).toEqual([]);
  });

  it('normalizes previousLosses dates to MM-DD-YYYY (same as businessStartDate)', () => {
    const req = mapIntakeToCoterieQuoteRequest({
      ...baseIntake,
      previousLosses: [
        { amount: 1500, description: 'Slip and fall', date: '2022-01-10' }, // ISO
        { amount: 800, description: 'Water damage', date: '3/5/2021' }, // slash
      ],
    });
    expect(req.previousLosses).toEqual([
      { amount: 1500, description: 'Slip and fall', date: '01-10-2022' },
      { amount: 800, description: 'Water damage', date: '03-05-2021' },
    ]);
  });

  it('omits an unparseable loss date instead of forwarding it raw', () => {
    const req = mapIntakeToCoterieQuoteRequest({
      ...baseIntake,
      previousLosses: [{ amount: 500, description: 'No usable date', date: 'not-a-date' }],
    });
    expect(req.previousLosses).toEqual([{ amount: 500, description: 'No usable date' }]);
  });

  it('derives exactly one location from the mailing address when intake has none', () => {
    const req = mapIntakeToCoterieQuoteRequest(baseIntake); // baseIntake has no locations
    expect(req.locations).toHaveLength(1);
    expect(req.locations[0]).toEqual({
      street: '1 Main St',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      locationType: 'BuildingLeased', // documented default
    });
  });

  it('honors an explicit locationType override for the derived location', () => {
    const req = mapIntakeToCoterieQuoteRequest({ ...baseIntake, locationType: 'BuildingOwned' });
    expect(req.locations).toHaveLength(1);
    expect(req.locations[0].locationType).toBe('BuildingOwned');
  });

  it('does not derive a mailing-address location when explicit locations exist', () => {
    const req = mapIntakeToCoterieQuoteRequest({
      ...baseIntake,
      locations: [
        {
          street: '9 Warehouse Rd',
          city: 'Dallas',
          state: 'TX',
          zip: '75201',
          locationType: 'BuildingOwned',
        },
      ],
    });
    expect(req.locations).toHaveLength(1);
    expect(req.locations[0].street).toBe('9 Warehouse Rd');
    expect(req.locations[0].locationType).toBe('BuildingOwned');
  });

  it('maps locations including bppLimit / buildingLimit / locationType', () => {
    const req = mapIntakeToCoterieQuoteRequest({
      ...baseIntake,
      locations: [
        {
          street: '1 Main St',
          city: 'Austin',
          state: 'TX',
          zip: '78701',
          locationType: 'BuildingLeased',
          bppLimit: 50000,
          buildingLimit: 0,
        },
      ],
    });
    expect(req.locations).toHaveLength(1);
    expect(req.locations[0]).toMatchObject({
      locationType: 'BuildingLeased',
      bppLimit: 50000,
      buildingLimit: 0,
    });
  });
});

describe('toCoterieDate', () => {
  it('normalizes ISO, US, and slash formats to MM-DD-YYYY', () => {
    expect(toCoterieDate('2020-03-15')).toBe('03-15-2020');
    expect(toCoterieDate('03-15-2020')).toBe('03-15-2020');
    expect(toCoterieDate('3/5/2020')).toBe('03-05-2020');
  });

  it('returns undefined for empty / unparseable input', () => {
    expect(toCoterieDate(undefined)).toBeUndefined();
    expect(toCoterieDate('')).toBeUndefined();
    expect(toCoterieDate('not-a-date')).toBeUndefined();
  });
});

describe('mapCoterieQuoteResponseToResult', () => {
  it('maps a successful response to status "quoted"', () => {
    const result = mapCoterieQuoteResponseToResult(
      quoteSuccess as unknown as RawCoterieQuoteResponse,
    );
    expect(result.status).toBe('quoted');
    expect(result.carrier).toBe('Coterie Insurance');
    expect(result.premium).toBe(1284);
    expect(result.monthlyPremium).toBe(107);
    expect(result.totalYearlyFees).toBe(36);
    expect(result.fees).toBe(36);
    expect(result.externalId).toBe('mock-ext-3f9a1c20-bop-gl');
    expect(result.lineQuotes).toHaveLength(2);
    expect(result.lineQuotes[0].lineItems.length).toBeGreaterThan(0);
    expect(result.proposalUrl).toContain('proposals/');
    // stateNoticeText surfaces as a disclosure
    expect(result.disclosures.join(' ')).toContain('MOCK quote');
  });

  it('maps a declination response to status "declined" (declination wins over errors[])', () => {
    const result = mapCoterieQuoteResponseToResult(
      quoteDecline as unknown as RawCoterieQuoteResponse,
    );
    expect(result.status).toBe('declined');
    expect(result.declinations).toBeDefined();
    expect(result.declinations).toHaveLength(1);
    expect(result.declinations?.[0].policyType).toBe('BOP');
    expect(result.declinations?.[0].reasons.length).toBeGreaterThanOrEqual(2);
    // decline payload still carried its errors[] entry
    expect(result.errors?.length).toBeGreaterThan(0);
    expect(result.underwritingId).toBe('mock-uw-decline-001');
  });

  it('maps a validation-error response to status "error"', () => {
    const result = mapCoterieQuoteResponseToResult(
      quoteValidationError as unknown as RawCoterieQuoteResponse,
    );
    expect(result.status).toBe('error');
    expect(result.errors).toHaveLength(2);
    expect(result.lineQuotes).toEqual([]);
    expect(result.declinations).toBeUndefined();
  });

  it('falls back to "error" for an unrecognized shape', () => {
    const result = mapCoterieQuoteResponseToResult({} as RawCoterieQuoteResponse);
    expect(result.status).toBe('error');
    expect(result.errors?.[0]).toContain('Unrecognized');
  });

  it('threads through a rawResponseRef when provided', () => {
    const result = mapCoterieQuoteResponseToResult(
      quoteSuccess as unknown as RawCoterieQuoteResponse,
      { rawResponseRef: 'quote-row-123' },
    );
    expect(result.rawResponseRef).toBe('quote-row-123');
  });
});
