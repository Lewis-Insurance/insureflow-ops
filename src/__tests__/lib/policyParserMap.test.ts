import { describe, it, expect } from 'vitest';
import {
  fuzzyMatchOption,
  mapLineOfBusiness,
  mapCarrier,
  LOB_SYNONYMS,
} from '@/lib/policyParserMap';

const LOB_OPTIONS = [
  { id: '1', name: 'Auto' },
  { id: '2', name: 'Home' },
  { id: '3', name: 'Life' },
  { id: '4', name: 'Commercial Auto' },
  { id: '5', name: 'General Liability' },
  { id: '6', name: 'Workers Compensation' },
  { id: '7', name: 'Property' },
  { id: '8', name: 'Umbrella' },
];

const CARRIERS = [
  { id: 'c1', name: 'State Farm' },
  { id: 'c2', name: 'GEICO' },
  { id: 'c3', name: 'Progressive' },
];

describe('mapLineOfBusiness', () => {
  it('exact-matches canonical names case-insensitively', () => {
    expect(mapLineOfBusiness({ line_of_business: 'auto' }, LOB_OPTIONS)).toEqual({
      value: 'Auto',
      needsConfirmation: false,
    });
    expect(mapLineOfBusiness({ line_of_business: 'HOME' }, LOB_OPTIONS)).toEqual({
      value: 'Home',
      needsConfirmation: false,
    });
  });

  it('maps the parser bug example: home_homeowners → Home', () => {
    expect(
      mapLineOfBusiness({ line_of_business: 'home_homeowners' }, LOB_OPTIONS),
    ).toEqual({ value: 'Home', needsConfirmation: false });
  });

  it('maps document_type fallback (auto_policy → Auto)', () => {
    expect(
      mapLineOfBusiness({ document_type: 'auto_policy' }, LOB_OPTIONS),
    ).toEqual({ value: 'Auto', needsConfirmation: false });
  });

  it('maps shorthand WC → Workers Compensation', () => {
    expect(mapLineOfBusiness({ line_of_business: 'WC' }, LOB_OPTIONS)).toEqual({
      value: 'Workers Compensation',
      needsConfirmation: false,
    });
  });

  it('maps GL → General Liability', () => {
    expect(mapLineOfBusiness({ line_of_business: 'GL' }, LOB_OPTIONS)).toEqual({
      value: 'General Liability',
      needsConfirmation: false,
    });
  });

  it('maps "Personal Auto" → Auto, "Business Auto" → Commercial Auto', () => {
    expect(
      mapLineOfBusiness({ line_of_business: 'Personal Auto' }, LOB_OPTIONS).value,
    ).toBe('Auto');
    expect(
      mapLineOfBusiness({ line_of_business: 'Business Auto' }, LOB_OPTIONS).value,
    ).toBe('Commercial Auto');
  });

  it('treats generic "application" as no match (no LOB)', () => {
    expect(
      mapLineOfBusiness({ document_type: 'application' }, LOB_OPTIONS),
    ).toEqual({ value: '', needsConfirmation: false });
  });

  it('flags unknown values for user confirmation', () => {
    expect(
      mapLineOfBusiness({ line_of_business: 'spaceship_insurance' }, LOB_OPTIONS),
    ).toEqual({ value: '', needsConfirmation: true });
  });

  it('returns empty without confirmation when nothing was parsed', () => {
    expect(mapLineOfBusiness({}, LOB_OPTIONS)).toEqual({
      value: '',
      needsConfirmation: false,
    });
  });
});

describe('mapCarrier', () => {
  it('matches against the lookup', () => {
    expect(mapCarrier('GEICO', CARRIERS).value).toBe('GEICO');
    expect(mapCarrier('state farm', CARRIERS).value).toBe('State Farm');
  });

  it('passes through unknown carriers (free-text allowed)', () => {
    const r = mapCarrier('Bass Underwriting', CARRIERS);
    expect(r.value).toBe('Bass Underwriting');
    expect(r.needsConfirmation).toBe(false);
  });

  it('returns empty for empty input', () => {
    expect(mapCarrier('', CARRIERS)).toEqual({ value: '', needsConfirmation: false });
    expect(mapCarrier(null, CARRIERS)).toEqual({ value: '', needsConfirmation: false });
  });
});

describe('fuzzyMatchOption', () => {
  it('substring match works when synonyms miss', () => {
    const r = fuzzyMatchOption('homeowners ho-3 dwelling form', LOB_OPTIONS, LOB_SYNONYMS);
    expect(r.value).toBe('Home');
  });
});
