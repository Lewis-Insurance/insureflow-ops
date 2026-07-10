import { describe, it, expect } from 'vitest';
import {
  AO_PERSONAL_AUTO_SHOW_FROM,
  isAutoOwnersPersonalAuto,
  isHiddenByAoMigration,
} from './aoMigrationFilter';

const BEFORE = new Date('2026-07-10T12:00:00Z'); // during the migration window
const AFTER = new Date('2027-02-01T12:00:00Z'); // after the cutover

const make = (
  over: Partial<{ carrier: string | null; policy_type: string | null; type: string | null }> = {},
) => ({
  carrier: over.carrier ?? 'Auto-Owners',
  policy_type: over.policy_type ?? 'auto',
  account: { type: over.type ?? 'household' },
});

describe('isAutoOwnersPersonalAuto', () => {
  it('matches Auto-Owners personal auto on a household account', () => {
    expect(isAutoOwnersPersonalAuto(make())).toBe(true);
  });
  it('matches carrier text variants', () => {
    for (const c of ['auto-owners', 'AUTO OWNERS', 'Auto_Owners', 'Auto-Owners Insurance'])
      expect(isAutoOwnersPersonalAuto(make({ carrier: c }))).toBe(true);
  });
  it('matches personal-auto line variants', () => {
    for (const t of ['auto', 'Auto', 'auto_policy', 'personal_auto', 'automobile'])
      expect(isAutoOwnersPersonalAuto(make({ policy_type: t }))).toBe(true);
  });
  it('excludes the Southern-Owners subsidiary', () => {
    expect(isAutoOwnersPersonalAuto(make({ carrier: 'Southern-Owners Insurance Company' }))).toBe(
      false,
    );
  });
  it('excludes other carriers', () => {
    expect(isAutoOwnersPersonalAuto(make({ carrier: 'Progressive' }))).toBe(false);
  });
  it('excludes commercial auto', () => {
    expect(isAutoOwnersPersonalAuto(make({ policy_type: 'commercial_auto' }))).toBe(false);
  });
  it('excludes non-auto lines', () => {
    for (const t of ['home', 'homeowners', 'Life', 'umbrella'])
      expect(isAutoOwnersPersonalAuto(make({ policy_type: t }))).toBe(false);
  });
  it('excludes commercial / business accounts', () => {
    expect(isAutoOwnersPersonalAuto(make({ type: 'commercial_business' }))).toBe(false);
  });
});

describe('isHiddenByAoMigration', () => {
  it('hides matching renewals during the migration window', () => {
    expect(isHiddenByAoMigration(make(), BEFORE)).toBe(true);
  });
  it('shows matching renewals again on/after the cutover (Feb 2027)', () => {
    expect(isHiddenByAoMigration(make(), AFTER)).toBe(false);
    expect(isHiddenByAoMigration(make(), AO_PERSONAL_AUTO_SHOW_FROM)).toBe(false);
  });
  it('never hides business Auto-Owners autos, even during the window', () => {
    expect(isHiddenByAoMigration(make({ type: 'commercial_business' }), BEFORE)).toBe(false);
  });
  it('never hides other carriers or non-auto lines during the window', () => {
    expect(isHiddenByAoMigration(make({ carrier: 'Progressive' }), BEFORE)).toBe(false);
    expect(isHiddenByAoMigration(make({ policy_type: 'home' }), BEFORE)).toBe(false);
  });
  it('cutover boundary is exclusive of instants before it', () => {
    const oneMsBefore = new Date(AO_PERSONAL_AUTO_SHOW_FROM.getTime() - 1);
    expect(isHiddenByAoMigration(make(), oneMsBefore)).toBe(true);
  });
});
