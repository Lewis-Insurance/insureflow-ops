import { recordSwoMiss, SWO_MISS_REASON } from './radarSwoAlert.ts';

for (const [scenario, reason] of Object.entries({
  empty_payload: SWO_MISS_REASON.emptyPayload,
  fetch_failure: SWO_MISS_REASON.fetch(401),
  host_failure: SWO_MISS_REASON.host,
  duplicate_content: SWO_MISS_REASON.duplicate,
  no_staging: SWO_MISS_REASON.noStaging,
})) {
  Deno.test(`SWO ${scenario} records the workspace miss`, async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const db = { rpc: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return Promise.resolve({ error: null });
    } };
    await recordSwoMiss(db, 'workspace-1', '2026-08-24', reason);
    if (calls.length !== 1 || calls[0].name !== 'radar_record_swo_miss') throw new Error('miss RPC not called exactly once');
    if (calls[0].args.p_workspace_id !== 'workspace-1' || calls[0].args.p_reason !== reason) {
      throw new Error('miss RPC payload was not preserved');
    }
  });
}

Deno.test('SWO miss recording surfaces RPC failures', async () => {
  const db = { rpc: () => Promise.resolve({ error: new Error('database unavailable') }) };
  let failed = false;
  try { await recordSwoMiss(db, 'workspace-1', '2026-08-24', SWO_MISS_REASON.emptyPayload); }
  catch { failed = true; }
  if (!failed) throw new Error('RPC failure was swallowed');
});
