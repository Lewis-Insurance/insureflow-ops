import { describe, expect, it } from 'vitest';
import type { DuplicateAccount } from '@/hooks/useDuplicateAccounts';
import type { ExtractSnapshotV1 } from '@/lib/extractSnapshot';
import {
  classifyLineCategory,
  inferAccountType,
  mapDuplicateToCandidate,
  mapNameSearchToCandidate,
  mapPolicySearchToCandidate,
  mergeBookingIntoExtractedData,
  rankAccountMatches,
  readBookingFromExtractedData,
  type AccountMatchCandidate,
} from '@/lib/extractAccountMatch';

function makeSnapshot(overrides: Partial<ExtractSnapshotV1> = {}): ExtractSnapshotV1 {
  return {
    schema_version: 1,
    insured_name: 'Synthetic Test Insured LLC',
    carriers: [],
    effective_date: null,
    expiration_date: null,
    claims_made: null,
    defense_inside_limits: null,
    premium: { total: null, frequency: null },
    fees: [],
    commission: null,
    coverages: [],
    locations: [],
    vehicles: [],
    drivers: [],
    document_type: null,
    policy_number: null,
    key_details: [],
    ...overrides,
  };
}

describe('extractAccountMatch classification', () => {
  it('classifies commercial_* document types as commercial', () => {
    const snapshot = makeSnapshot({ document_type: 'commercial_policy' });
    expect(classifyLineCategory(snapshot)).toBe('commercial');
    expect(inferAccountType(snapshot)).toBe('commercial_business');
  });

  it('classifies non-commercial document types as personal', () => {
    const snapshot = makeSnapshot({ document_type: 'auto_policy' });
    expect(classifyLineCategory(snapshot)).toBe('personal');
    expect(inferAccountType(snapshot)).toBe('household');
  });

  it('reads booking override from extracted_data when present', () => {
    const snapshot = makeSnapshot({ document_type: 'commercial_policy' });
    const booking = readBookingFromExtractedData(
      {
        booking: {
          line_category: 'personal',
          line_category_source: 'override',
        },
      },
      snapshot,
    );

    expect(booking.line_category).toBe('personal');
    expect(booking.line_category_source).toBe('override');
  });

  it('merges booking without wiping other extracted_data keys', () => {
    const merged = mergeBookingIntoExtractedData(
      { carrier_name: 'Synthetic Carrier', booking: { line_category: 'commercial' } },
      { line_category: 'personal', line_category_source: 'override' },
    );

    expect(merged).toMatchObject({
      carrier_name: 'Synthetic Carrier',
      booking: {
        line_category: 'personal',
        line_category_source: 'override',
      },
    });
  });
});

describe('extractAccountMatch ranking', () => {
  const duplicate: DuplicateAccount = {
    account_id: 'acct-dup-1',
    name: 'Synthetic Test Insured LLC',
    email: null,
    phone: null,
    city: null,
    state: null,
    account_status: 'active',
    active_policy_count: 1,
    match_basis: 'name',
  };

  it('ranks duplicate matches ahead of search matches and dedupes by account id', () => {
    const candidates: AccountMatchCandidate[] = [
      mapNameSearchToCandidate(
        {
          entity_type: 'account',
          id: 'acct-dup-1',
          label: 'Synthetic Test Insured LLC',
        },
        0,
      )!,
      mapDuplicateToCandidate(duplicate, 0),
      mapPolicySearchToCandidate(
        'acct-policy-1',
        'Synthetic Test Insured LLC',
        'Policy #POL-TEST-001',
        0,
      ),
    ];

    const ranked = rankAccountMatches(candidates);

    expect(ranked).toHaveLength(2);
    expect(ranked[0].accountId).toBe('acct-dup-1');
    expect(ranked[0].source).toBe('duplicate');
    expect(ranked[1].accountId).toBe('acct-policy-1');
    expect(ranked[1].source).toBe('search_policy');
  });

  it('ignores non-account global search rows for name matching', () => {
    const mapped = mapNameSearchToCandidate(
      {
        entity_type: 'policy',
        id: 'policy-1',
        label: 'Policy #POL-TEST-001',
      },
      0,
    );

    expect(mapped).toBeNull();
  });
});
