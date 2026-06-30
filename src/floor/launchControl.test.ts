import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertFloorCockpitEnabled,
  isFloorCockpitEnabled,
  setFloorCockpitLaunchControlOverrideForTests,
} from './launchControl';

describe('Floor cockpit launch control', () => {
  afterEach(() => {
    setFloorCockpitLaunchControlOverrideForTests(null);
  });

  it('defaults OFF when no explicit flag is set', () => {
    expect(isFloorCockpitEnabled({})).toBe(false);
    expect(() => assertFloorCockpitEnabled({})).toThrow(/disabled/i);
  });

  it('only enables on an explicit true-like flag', () => {
    expect(isFloorCockpitEnabled({ VITE_LEWIS_FLOOR_COCKPIT_ENABLED: 'true' })).toBe(true);
    expect(isFloorCockpitEnabled({ VITE_LEWIS_FLOOR_COCKPIT_ENABLED: '1' })).toBe(true);
    expect(isFloorCockpitEnabled({ VITE_LEWIS_FLOOR_COCKPIT_ENABLED: 'false' })).toBe(false);
  });

  it('prevents client bridge calls while disabled by default', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { sendFloorChatMessage } = await import('./floorChatClient');

    await expect(
      sendFloorChatMessage(
        { sessionRef: 'chat:practice-session', message: 'Prepare work.', contextRefs: { clientRef: 'client:practice' } },
        () => undefined,
      ),
    ).rejects.toThrow(/disabled/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
