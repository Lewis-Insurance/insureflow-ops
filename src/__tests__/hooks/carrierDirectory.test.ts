// The carrier directory is the one carrier store, and "no NAIC on file" must be
// null there, never ''. An empty string short-circuited the NAIC lookup in
// get_master_coi and printed a blank NAIC box on the ACORD 25 insurer table
// (2026-09-02, Donald Roberts Masonry LLC).

import { describe, it, expect } from 'vitest';
import { normalizeNaic } from '@/hooks/useCarrierDirectory';

describe('normalizeNaic', () => {
  it('turns blank input into null', () => {
    expect(normalizeNaic('')).toBeNull();
    expect(normalizeNaic('   ')).toBeNull();
    expect(normalizeNaic(null)).toBeNull();
    expect(normalizeNaic(undefined)).toBeNull();
  });

  it('trims a real NAIC', () => {
    expect(normalizeNaic(' 19879 ')).toBe('19879');
    expect(normalizeNaic('19879')).toBe('19879');
  });
});
