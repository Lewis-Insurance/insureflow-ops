import { describe, it, expect } from 'vitest';
import { redactForLog } from '../../../supabase/functions/_shared/coterie/client.ts';

describe('redactForLog', () => {
  const payload = {
    businessName: 'Acme Coffee Roasters',
    legalBusinessName: 'Acme Coffee Roasters, LLC',
    applicationTypes: ['BOP', 'GL'],
    annualPayroll: 250000,
    grossAnnualSales: 800000,
    AKHash: 'AKHASH-SUPER-SECRET',
    FEIN: '12-3456789',
    contactFirstName: 'Jane',
    contactLastName: 'Doe',
    contactEmail: 'jane@acme.test',
    contactPhone: '555-123-4567',
    mailingAddressStreet: '1 Main St',
    mailingAddressCity: 'Austin',
    tokenizedPaymentID: 'tok_live_supersecret',
    note: 'Reach Jane at jane@acme.test or 555-123-4567, SSN 123-45-6789',
    // Nested contact object (intake shape) + a fully-populated location.
    contact: { firstName: 'Jane', lastName: 'Doe', email: 'jane@acme.test', phone: '555-123-4567' },
    locations: [
      {
        street: '1 Main St',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
        locationType: 'BuildingLeased',
        bppLimit: 50000,
      },
    ],
  };

  const result = redactForLog(payload) as Record<string, unknown>;
  const serialized = JSON.stringify(result);

  it('removes the tokenized payment id', () => {
    expect(result.tokenizedPaymentID).toBe('[REDACTED]');
    expect(serialized).not.toContain('tok_live_supersecret');
  });

  it('removes AKHash and FEIN', () => {
    expect(result.AKHash).toBe('[REDACTED]');
    expect(result.FEIN).toBe('[REDACTED]');
    expect(serialized).not.toContain('AKHASH-SUPER-SECRET');
    expect(serialized).not.toContain('12-3456789');
  });

  it('removes contact PII (email + phone keys)', () => {
    expect(result.contactEmail).toBe('[REDACTED]');
    expect(result.contactPhone).toBe('[REDACTED]');
    expect(serialized).not.toContain('jane@acme.test'.toLowerCase());
    expect(serialized).not.toContain('555-123-4567');
  });

  it('removes payroll and gross sales financials', () => {
    expect(result.annualPayroll).toBe('[REDACTED]');
    expect(result.grossAnnualSales).toBe('[REDACTED]');
    expect(serialized).not.toContain('250000');
    expect(serialized).not.toContain('800000');
  });

  it('removes mailing address fields', () => {
    expect(result.mailingAddressStreet).toBe('[REDACTED]');
    expect(result.mailingAddressCity).toBe('[REDACTED]');
  });

  it('redacts PII that appears inside free-text fields', () => {
    const note = String(result.note);
    expect(note).not.toContain('jane@acme.test');
    expect(note).not.toContain('555-123-4567');
    expect(note).not.toContain('123-45-6789');
  });

  it('preserves non-sensitive fields', () => {
    expect(result.businessName).toBe('Acme Coffee Roasters');
    expect(result.applicationTypes).toEqual(['BOP', 'GL']);
  });

  it('redacts the contact first/last name (flattened keys)', () => {
    expect(result.contactFirstName).toBe('[REDACTED]');
    expect(result.contactLastName).toBe('[REDACTED]');
  });

  it('redacts contact identity inside a nested contact object', () => {
    const contact = result.contact as Record<string, unknown>;
    expect(contact.firstName).toBe('[REDACTED]');
    expect(contact.lastName).toBe('[REDACTED]');
    expect(contact.email).toBe('[REDACTED]');
    expect(contact.phone).toBe('[REDACTED]');
  });

  it('redacts physical address parts inside nested locations[]', () => {
    const locations = result.locations as Array<Record<string, unknown>>;
    expect(locations).toHaveLength(1);
    const loc = locations[0];
    expect(loc.street).toBe('[REDACTED]');
    expect(loc.city).toBe('[REDACTED]');
    expect(loc.state).toBe('[REDACTED]');
    expect(loc.zip).toBe('[REDACTED]');
    // Non-PII location attributes survive for debuggability.
    expect(loc.bppLimit).toBe(50000);
    expect(loc.locationType).toBe('BuildingLeased');
    // The address must not leak anywhere in the serialized log payload.
    expect(serialized).not.toContain('1 Main St');
    expect(serialized).not.toContain('78701');
  });
});
