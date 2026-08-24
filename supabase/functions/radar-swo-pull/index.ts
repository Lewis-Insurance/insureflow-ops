import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { verifyAgencyAuth } from "../_shared/agency-auth.ts";
import { canonicalizeRow, parseCsv, sha256Hex, sourceRowHash, validateRawRow, validateRow } from "../_shared/radarIngest.ts";

const response = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors(req);
  const cors = getCorsHeaders(req.headers.get("origin"));
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405, cors);
  const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  try {
    const body = await req.json().catch(() => ({}));
    const isCron = req.headers.has("X-Cron-Secret");
    let requestedWorkspace: string | undefined = body.agencyWorkspaceId;
    let actor: string | null = null;
    if (isCron) {
      const denied = verifyStrictCronSecret(req, cors);
      if (denied) return denied;
      const easternHour = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hour12: false }).format(new Date());
      if (easternHour !== "08") return response({ skipped: true, reason: "outside_08_ET_window" }, 200, cors);
    } else {
      const auth = await verifyAgencyAuth(req, db);
      if (!auth.user) return response({ error: auth.error }, auth.statusCode, cors);
      if (!requestedWorkspace || !auth.user.isStaff || !auth.user.agencyWorkspaceIds.includes(requestedWorkspace)) {
        return response({ error: "Active staff workspace membership required" }, 403, cors);
      }
      actor = auth.user.id;
    }

    let query = db.from("radar_config").select("agency_workspace_id,swo_source_url").not("swo_source_url", "is", null);
    if (requestedWorkspace) query = query.eq("agency_workspace_id", requestedWorkspace);
    const { data: configs, error: configError } = await query;
    if (configError) throw configError;
    const allowedHosts = new Set((Deno.env.get("RADAR_SWO_ALLOWED_HOSTS") ?? "").split(",").map((v) => v.trim()).filter(Boolean));
    if (!allowedHosts.size) throw new Error("RADAR_SWO_ALLOWED_HOSTS is not configured");
    const results: unknown[] = [];
    for (const config of configs ?? []) {
      const source = new URL(config.swo_source_url);
      if (source.protocol !== "https:" || !allowedHosts.has(source.hostname) || source.username || source.password || source.search || source.hash) {
        results.push({ agencyWorkspaceId: config.agency_workspace_id, error: "SWO source host is not allowed" });
        continue;
      }
      const fetched = await fetch(source, {
        headers: Deno.env.get("RADAR_SWO_API_TOKEN") ? { Authorization: `Bearer ${Deno.env.get("RADAR_SWO_API_TOKEN")}` } : {},
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
      });
      if (fetched.status >= 300 && fetched.status < 400) {
        results.push({ agencyWorkspaceId: config.agency_workspace_id, error: "SWO source redirects are prohibited" });
        continue;
      }
      if (!fetched.ok) {
        results.push({ agencyWorkspaceId: config.agency_workspace_id, error: `SWO source returned ${fetched.status}` });
        continue;
      }
      const declaredLength = Number(fetched.headers.get("content-length") ?? 0);
      if (declaredLength > 20_000_000) throw new Error("SWO response exceeds 20 MB");
      const bytes = await readLimited(fetched.body, 20_000_000);
      const hash = await sha256Hex(bytes);
      const { data: duplicate } = await db.from("poc_uploads").select("id,row_count")
        .eq("agency_workspace_id", config.agency_workspace_id).eq("sha256", hash).maybeSingle();
      if (duplicate) {
        const processing = await processUpload(config.agency_workspace_id, duplicate.id);
        results.push({ agencyWorkspaceId: config.agency_workspace_id, uploadId: duplicate.id, duplicate: true, processing });
        continue;
      }
      const content = new TextDecoder().decode(bytes);
      const contentType = fetched.headers.get("content-type") ?? "";
      const rawRows = contentType.includes("json")
        ? normalizeJsonRows(JSON.parse(content))
        : parseCsv(content);
      if (rawRows.length > 25_000) throw new Error("SWO response exceeds 25,000 rows");
      rawRows.forEach(validateRawRow);
      const filename = `swo-${new Date().toISOString().slice(0, 10)}.${contentType.includes("json") ? "json" : "csv"}`;
      const { data: upload, error: uploadError } = await db.from("poc_uploads").insert({
        agency_workspace_id: config.agency_workspace_id, kind: "swo", filename,
        storage_path: `${source.origin}${source.pathname}`, sha256: hash, row_count: rawRows.length, uploaded_by: actor,
      }).select("id").single();
      if (uploadError) throw uploadError;
      const parsed = await Promise.all(rawRows.map(async (raw, index) => {
        const row = canonicalizeRow(raw);
        return { agency_workspace_id: config.agency_workspace_id, poc_upload_id: upload.id,
          row_number: index + 1, kind: "swo", ...row, raw_row: raw,
          source_row_hash: await sourceRowHash("swo", row), parse_errors: validateRow(row) };
      }));
      const staging = [...new Map(parsed.map((row) => [row.source_row_hash, row])).values()];
      const { error } = await db.from("poc_staging").upsert(staging, {
        onConflict: "agency_workspace_id,source_row_hash", ignoreDuplicates: true,
      });
      if (error) throw error;
      const processingBatches = await processUpload(config.agency_workspace_id, upload.id);
      results.push({ agencyWorkspaceId: config.agency_workspace_id, uploadId: upload.id, rowCount: staging.length,
        invalidRows: staging.filter((row) => row.parse_errors.length).length, processing: processingBatches });
    }
    return response({ results }, 200, cors);
  } catch (error) {
    console.error("radar-swo-pull", error);
    return response({ error: error instanceof Error ? error.message : "SWO pull failed" }, 500, cors);
  }
});

async function processUpload(agencyWorkspaceId: string, uploadId: string): Promise<unknown[]> {
  const internalSecret = Deno.env.get("RADAR_INTERNAL_SECRET");
  if (!internalSecret) throw new Error("RADAR_INTERNAL_SECRET is not configured");
  const batches: unknown[] = [];
  for (let batch = 0; batch < 25; batch++) {
    const processed = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/radar-opportunity-upsert`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Radar-Internal-Secret": internalSecret },
      body: JSON.stringify({ agencyWorkspaceId, uploadId, limit: 1000 }), signal: AbortSignal.timeout(60_000),
    });
    const result = await processed.json();
    if (!processed.ok && processed.status !== 207) throw new Error(`Opportunity processing failed: ${result.error ?? processed.status}`);
    batches.push(result);
    if (result.errors?.length) throw new Error("Opportunity processing returned row errors");
    if (!result.processed) break;
  }
  return batches;
}

function verifyStrictCronSecret(req: Request, cors: Record<string, string>): Response | null {
  const expected = Deno.env.get("CRON_SECRET");
  const actual = req.headers.get("X-Cron-Secret");
  if (!expected) return response({ error: "Cron authentication is not configured" }, 500, cors);
  if (!actual || !constantTimeEqual(actual, expected)) return response({ error: "Unauthorized" }, 401, cors);
  return null;
}

function constantTimeEqual(left: string, right: string): boolean {
  const size = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < size; index++) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

async function readLimited(stream: ReadableStream<Uint8Array> | null, maximum: number): Promise<Uint8Array> {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximum) {
      await reader.cancel("response too large");
      throw new Error("SWO response exceeds 20 MB");
    }
    chunks.push(value);
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

function normalizeJsonRows(value: unknown): Record<string, unknown>[] {
  const rows = Array.isArray(value) ? value : (value as { rows?: unknown })?.rows;
  if (!Array.isArray(rows) || !rows.every((row) => row && typeof row === "object" && !Array.isArray(row))) {
    throw new Error("SWO JSON must be an array of row objects or { rows: [...] }");
  }
  return rows as Record<string, unknown>[];
}
