// Pure-function coverage for the Phase 2 remarket + loss-run helpers.
import { describe, expect, it } from 'vitest';
import { commercialLinesForPolicy, remarketNote } from '@/lib/commercial/remarket';
import { composeLossRunLetter } from '@/lib/commercial/lossRunLetter';

describe('commercialLinesForPolicy', () => {
  it('maps the canonical crosswalk', () => {
    expect(commercialLinesForPolicy({ line_canonical: 'General Liability' })).toEqual(['gl']);
    expect(commercialLinesForPolicy({ line_canonical: 'Commercial Auto' })).toEqual(['auto']);
    expect(commercialLinesForPolicy({ line_canonical: 'Workers Compensation' })).toEqual(['wc']);
    expect(commercialLinesForPolicy({ line_canonical: 'Business Owners Policy (BOP)' })).toEqual(['gl', 'property']);
  });

  it('falls back to the messy line_of_business vocabulary in the book', () => {
    expect(commercialLinesForPolicy({ line_of_business: 'commercial_auto' })).toEqual(['auto']);
    expect(commercialLinesForPolicy({ line_of_business: 'Commercial General Liability' })).toEqual(['gl']);
    expect(commercialLinesForPolicy({ line_of_business: 'gl' })).toEqual(['gl']);
    expect(commercialLinesForPolicy({ line_of_business: 'Workers Compensation and Employers Liability Insurance' })).toEqual(['wc']);
    expect(commercialLinesForPolicy({ line_of_business: 'bop' })).toEqual(['gl', 'property']);
  });

  it('non-empty detail blobs are authoritative over labels', () => {
    expect(
      commercialLinesForPolicy({
        line_canonical: 'Commercial (unspecified)',
        line_of_business: 'commercial_policy',
        cgl_details: { limits: { each_occurrence: 1000000 } },
        wc_details: { coverage: {} },
      }),
    ).toEqual(['gl', 'wc']);
    // Empty objects do NOT prove a line (mirrors master_coi_lines).
    expect(
      commercialLinesForPolicy({ line_of_business: 'gl', cgl_details: {} }),
    ).toEqual(['gl']);
  });

  it('canonical wins over line_of_business; unknown maps to empty', () => {
    expect(
      commercialLinesForPolicy({ line_canonical: 'Commercial Auto', line_of_business: 'gl' }),
    ).toEqual(['auto']);
    expect(commercialLinesForPolicy({ line_of_business: 'homeowners' })).toEqual([]);
    expect(commercialLinesForPolicy({})).toEqual([]);
  });
});

describe('remarketNote', () => {
  it('composes the full note', () => {
    expect(
      remarketNote({ policy_number: 'CPP123', carrier: 'Burlington', expiration_date: '2026-10-01' }),
    ).toBe('Remarket of policy CPP123, currently with Burlington, expiring 2026-10-01.');
  });
  it('degrades gracefully with missing fields and never emits an em or en dash', () => {
    const note = remarketNote({});
    expect(note).toBe('Remarket of policy (no number).');
    expect(note).not.toMatch(/[–—]/);
  });
});

describe('composeLossRunLetter', () => {
  const base = {
    carrierName: 'Progressive',
    insuredName: 'Cabinet Stuff Inc',
    yearsBack: 5,
    dateUs: '07/05/2026',
  };

  it('is deterministic and contains the request, the window, and the LOA block', () => {
    const a = composeLossRunLetter(base);
    const b = composeLossRunLetter(base);
    expect(a).toBe(b);
    expect(a).toContain('Loss run request - Cabinet Stuff Inc');
    expect(a).toContain('past 5 policy years');
    expect(a).toContain('AUTHORIZATION TO RELEASE LOSS INFORMATION');
    expect(a).toContain('I authorize Progressive to release');
    expect(a).not.toMatch(/[–—]/);
  });

  it('lists policy numbers when provided, generic scope otherwise', () => {
    expect(composeLossRunLetter({ ...base, policyNumbers: ['A1', 'B2'] })).toContain('Policies: A1, B2');
    expect(composeLossRunLetter(base)).toContain('all policies held by the named insured');
  });

  it('clamps the years window to 1..10 and singularizes one year', () => {
    expect(composeLossRunLetter({ ...base, yearsBack: 0 })).toContain('past 1 policy year,');
    expect(composeLossRunLetter({ ...base, yearsBack: 99 })).toContain('past 10 policy years');
  });
});
