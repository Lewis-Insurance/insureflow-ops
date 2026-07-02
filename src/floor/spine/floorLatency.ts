const FLOOR_INTAKE_SLA_MS = 5000;

export function intakeToPackageLatencyMs(
  intakeAt: string | null | undefined,
  packageAt: string | null | undefined,
): number | null {
  if (!intakeAt || !packageAt) return null;
  const start = Date.parse(intakeAt);
  const end = Date.parse(packageAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return end - start;
}

export function meetsFloorIntakeSla(latencyMs: number | null, slaMs = FLOOR_INTAKE_SLA_MS): boolean {
  return latencyMs !== null && latencyMs >= 0 && latencyMs <= slaMs;
}

export { FLOOR_INTAKE_SLA_MS };
