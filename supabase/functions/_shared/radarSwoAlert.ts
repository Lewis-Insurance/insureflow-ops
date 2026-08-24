export const SWO_MISS_REASON = {
  host: 'SWO source host is not allowed',
  fetch: (status: number) => `SWO source returned ${status}`,
  emptyPayload: 'SWO pull returned zero rows',
  duplicate: 'SWO pull produced no new staging rows (duplicate content)',
  noStaging: 'SWO pull produced no staging rows',
} as const;

type RadarRpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ error: unknown }>;
};

export async function recordSwoMiss(
  db: RadarRpcClient,
  agencyWorkspaceId: string,
  easternDate: string,
  reason: string,
): Promise<void> {
  const { error } = await db.rpc('radar_record_swo_miss', {
    p_workspace_id: agencyWorkspaceId,
    p_eastern_date: easternDate,
    p_reason: reason,
  });
  if (error) throw error;
}
