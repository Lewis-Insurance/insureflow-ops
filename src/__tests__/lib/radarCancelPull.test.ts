import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../../');
const pull = readFileSync(resolve(root, 'supabase/functions/radar-cancel-pull/index.ts'), 'utf8');
const helper = readFileSync(resolve(root, 'supabase/functions/_shared/radarCancelPull.ts'), 'utf8');
const harvest = readFileSync(resolve(root, 'supabase/functions/radar-poc-harvest/index.ts'), 'utf8');
const ingest = readFileSync(resolve(root, 'supabase/functions/_shared/radarIngest.ts'), 'utf8');
const upsert = readFileSync(resolve(root, 'supabase/functions/radar-opportunity-upsert/index.ts'), 'utf8');
const migration = readFileSync(resolve(root, 'supabase/migrations/20260825120000_radar_cancel_exact_date_pull.sql'), 'utf8');
const config = readFileSync(resolve(root, 'supabase/config.toml'), 'utf8');

const allowed = [
  '5551', '5190', '5183', '5537', '5474', '0042', '5478', '5445', '5022', '5403', '5645', '5606',
  '9014', '0917', '8835', '8829', '8824', '8869', '9082', '9083', '9084', '9052', '8006', '8017',
  '8380', '8393', '9015', '8292',
];

describe('radar cancellation exact-date pull', () => {
  it('reads only today ET cancel requests from radar_harvest_plan and performs one request per slice', () => {
    expect(pull).toContain('const easternDate = easternCalendarDate(new Date())');
    expect(pull).toContain('db.rpc("radar_harvest_plan"');
    expect(pull).toContain('cancelRequestsFromPlan(plan, easternDate, config.counties ?? [])');
    expect(pull).toContain('for (const cancelRequest of requests)');
    expect(pull).toContain('config.cancel_requires_session === true, cancelRequest)');
    expect(pull).toContain('body: JSON.stringify({ county: request.county, exact_date: request.exact_date })');
    expect(helper).toContain('request.exact_date !== easternDate');
    expect(pull).not.toContain('generate_series');
    expect(pull).not.toContain('xdate.requests');
  });

  it('uses the canonical ingest identity and never uses name as an update/merge key', () => {
    expect(pull).toContain('/functions/v1/radar-poc-harvest');
    expect(pull).toContain('kind: "cancel", storagePath, filename,');
    expect(pull).toContain('expectedCounty: request.county, expectedExactDate: request.exact_date');
    expect(harvest).toContain('canonicalizeRow(raw)');
    expect(harvest).toContain('validateRawRow');
    expect(harvest).toContain('sourceRowHash(kind, row)');
    expect(harvest).toContain('onConflict: "agency_workspace_id,source_row_hash"');
    expect(harvest).toContain('X-Radar-Internal-Secret');
    expect(harvest).toContain('Cancel artifact contains a row outside its requested county/date slice');
    expect(ingest).toContain('export async function sourceRowHash');
    expect(upsert).toContain('.eq("source_row_hash", staged.source_row_hash)');
    expect(upsert).not.toMatch(/\.eq\(["']employer_name["']/);
  });

  it('retains the exact 28-code post-ingest filter and excludes 8810/8742', () => {
    expect(allowed).toHaveLength(28);
    for (const code of allowed) expect(migration).toContain(`'${code}'`);
    expect(upsert).toContain('config.class_allowlist');
    expect(upsert).toContain('!classCodeAllowed(staged.class_code, allowlist)');
    expect(migration).not.toMatch(/class_allowlist[^;]*'8810'/s);
    expect(migration).not.toMatch(/class_allowlist[^;]*'8742'/s);
  });

  it('fails closed on source, redirects, empty and duplicate content with a renewal alert', () => {
    expect(helper).toContain('Cancel source URL is not configured');
    expect(helper).toContain('Cancel pull returned zero rows');
    expect(helper).toContain('duplicate content');
    expect(pull).toContain('redirect: "manual"');
    expect(pull).toContain('await recordCancelMiss');
    expect(pull).toContain('hasError ? 207 : 200');
    expect(pull).toContain('detectCancelArtifact(bytes, fetched.headers.get("content-type"))');
    expect(pull).toContain('!error.artifactAccepted');
    expect(pull).toContain('remove([storagePath])');
    expect(pull).toContain('canResumeCancelUpload(duplicate, existingRows ?? []');
    expect(pull).toContain('resumed: true');
    expect(helper).toContain('cancelSessionCookie(requiresSession');
    expect(helper).toContain('Cancel source requires RADAR_POC_SESSION');
    expect(helper).toContain('if (!requiresSession) return null');
    expect(helper).toContain('row.processed_at === null');
    expect(pull).toContain('parse_errors,processed_at');
    expect(harvest).toContain('insertedUploadId && !stagingAccepted');
    expect(harvest).toContain('durable: stagingAccepted');
    expect(harvest).toContain('.eq("agency_workspace_id", workspaceId).eq("poc_upload_id", upload.id)');
    expect(harvest).toContain('acceptedCancelStagingCounts(acceptedRows ?? []');
    expect(harvest).toContain('uniqueRows: insertedRows');
    expect(migration).toContain("'renewal','wc_renewal_radar','radar_cancel_pull'");
    expect(migration).toContain("'wc_renewal_radar:cancel_miss:'||p_workspace_id||':'||p_eastern_date");
    expect(migration).toContain("lower(btrim(p.full_name))='landen lewis'");
    expect(migration).toContain("lower(btrim(p.full_name))='lewi'");
    expect(migration).not.toContain('task_type');
  });

  it('uses secure cron configuration and backward-compatible protected config', () => {
    expect(pull).toContain('verifyStrictCronSecret(req, cors)');
    expect(pull).toContain('RADAR_POC_SESSION');
    expect(pull).toContain('RADAR_CANCEL_ALLOWED_HOSTS');
    expect(helper).toContain('source.protocol !== "https:"');
    expect(helper).toContain('source.username');
    expect(helper).toContain('source.search');
    expect(helper).toContain('source.hash');
    expect(migration).toContain("cron.schedule('radar-cancel-pull-08-et','0 12,13 * * *'");
    expect(migration).toContain('p_cancel_source_url text DEFAULT NULL');
    expect(migration).toContain('p_cancel_requires_session boolean DEFAULT NULL');
    expect(migration).toContain('IF NOT public.is_staff()');
    expect(migration).toContain("status='active' AND role IN ('owner','admin')");
    expect(config).toContain('[functions.radar-cancel-pull]\nverify_jwt = false');
    expect(config).toContain('[functions.radar-poc-harvest]\nverify_jwt = false');
  });
});
