type LaunchEnv = Record<string, string | boolean | undefined>;

let testOverride: boolean | null = null;

function truthy(value: string | boolean | undefined): boolean {
  return value === true || value === 'true' || value === '1';
}

export function isFloorCockpitEnabled(env: LaunchEnv = import.meta.env): boolean {
  if (testOverride !== null) return testOverride;
  return truthy(env.VITE_LEWIS_FLOOR_COCKPIT_ENABLED);
}

export function assertFloorCockpitEnabled(env: LaunchEnv = import.meta.env): void {
  if (!isFloorCockpitEnabled(env)) {
    throw new Error('Lewis Floor cockpit is disabled by launch control. No cockpit effect was attempted.');
  }
}

export function setFloorCockpitLaunchControlOverrideForTests(value: boolean | null): void {
  testOverride = value;
}
