import { describe, expect, it } from 'vitest';
import { containsUnsafeFloorPayload, validateFloorMessageForModel } from './floorSafety';

describe('floor safety guard', () => {
  it('allows normal servicing instructions', () => {
    expect(validateFloorMessageForModel('Prep the renewal review for the bound client context.')).toEqual({ ok: true });
  });

  it('blocks regulated fields before model submission', () => {
    expect(validateFloorMessageForModel('SSN 123-45-6789')).toMatchObject({ ok: false });
    expect(validateFloorMessageForModel('DOB is 01/02/1980')).toMatchObject({ ok: false });
    expect(validateFloorMessageForModel('DLN A1234567')).toMatchObject({ ok: false });
  });

  it('blocks raw refs and signed storage URLs from chat payloads', () => {
    const unsafe = 'Use 550e8400-e29b-41d4-a716-446655440000 and https://host/storage/v1/object/sign/file?token=abc';
    expect(validateFloorMessageForModel(unsafe)).toMatchObject({ ok: false });
    expect(containsUnsafeFloorPayload(unsafe)).toBe(true);
  });
});
