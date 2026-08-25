import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { verifyAgencyAuth } from "../_shared/agency-auth.ts";
import {
  cancelRequestsFromPlan, cancelSessionCookie, canResumeCancelUpload, CANCEL_MISS_REASON, detectCancelArtifact,
  recordCancelMiss, validateCancelSource,
  type CancelRequest,
} from "../_shared/radarCancelPull.ts";
import { sha256Hex } from "../_shared/radarIngest.ts";

const reply = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
type CancelDb = ReturnType<typeof createClient>;

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors(req);
  const cors = getCorsHeaders(req.headers.get("origin"));
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405, cors);
  const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const easternDate = easternCalendarDate(new Date());
  try {
    const body = await req.json().catch(() => ({}));
    const isCron = req.headers.has("X-Cron-Secret");
    const requestedWorkspace = typeof body.agencyWorkspaceId === "string" ? body.agencyWorkspaceId : undefined;
    if (isCron) {
      const denied = verifyStrictCronSecret(req, cors);
      if (denied) return denied;
      const easternHour = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York", hour: "2-digit", hour12: false,
      }).format(new Date());
      if (easternHour !== "08") return reply({ skipped: true, reason: "outside_08_ET_window" }, 200, cors);
    } else {
      const auth = await verifyAgencyAuth(req, db);
      if (!auth.user) return reply({ error: auth.error }, auth.statusCode, cors);
      if (!requestedWorkspace || !auth.user.isStaff || !auth.user.agencyWorkspaceIds.includes(requestedWorkspace)) {
        return reply({ error: "Active staff workspace membership required" }, 403, cors);
      }
    }

    let query = db.from("radar_config").select("agency_workspace_id,cancel_source_url,cancel_requires_session,counties");
    if (requestedWorkspace) query = query.eq("agency_workspace_id", requestedWorkspace);
    const { data: configs, error: configError } = await query;
    if (configError) throw configError;
    if (!configs?.length) return reply({ error: "No radar_config targets found" }, 503, cors);

    const allowedHosts = new Set((Deno.env.get("RADAR_CANCEL_ALLOWED_HOSTS") ?? "")
      .split(",").map((value) => value.trim()).filter(Boolean));
    const results: unknown[] = [];
    for (const config of configs) {
      try {
        if (!allowedHosts.size) throw new Error("RADAR_CANCEL_ALLOWED_HOSTS is not configured");
        const source = validateCancelSource(config.cancel_source_url ?? Deno.env.get("RADAR_POC_CANCEL_URL"), allowedHosts);
        const { data: plan, error: planError } = await db.rpc("radar_harvest_plan", {
          p_workspace_id: config.agency_workspace_id, p_eastern_date: easternDate,
        });
        if (planError) throw planError;
        const requests = cancelRequestsFromPlan(plan, easternDate, config.counties ?? []);
        const pulls: unknown[] = [];
        for (const cancelRequest of requests) {
          try {
            pulls.push(await pullSlice(db, config.agency_workspace_id, source,
              config.cancel_requires_session === true, cancelRequest));
          } catch (error) {
            const reason = error instanceof Error ? error.message : "Cancel slice failed";
            console.error("radar-cancel-pull slice failed", config.agency_workspace_id, cancelRequest, error);
            let alertCreated = false;
            try {
              await recordCancelMiss(db, config.agency_workspace_id, easternDate, reason);
              alertCreated = true;
            } catch (alertError) {
              console.error("radar-cancel-pull failed to record alert", config.agency_workspace_id, alertError);
            }
            pulls.push({ ...cancelRequest, error: reason, alertCreated });
          }
        }
        results.push({ agencyWorkspaceId: config.agency_workspace_id, pulls });
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Workspace cancel pull failed";
        console.error("radar-cancel-pull workspace failed", config.agency_workspace_id, error);
        let alertCreated = false;
        try {
          await recordCancelMiss(db, config.agency_workspace_id, easternDate, reason);
          alertCreated = true;
        } catch (alertError) {
          console.error("radar-cancel-pull failed to record alert", config.agency_workspace_id, alertError);
        }
        results.push({ agencyWorkspaceId: config.agency_workspace_id, error: reason, alertCreated });
      }
    }
    const hasError = results.some((workspace) => {
      const value = workspace as { error?: unknown; pulls?: Array<{ error?: unknown }> };
      return Boolean(value.error) || value.pulls?.some((pull) => Boolean(pull.error));
    });
    return reply({ easternDate, results }, hasError ? 207 : 200, cors);
  } catch (error) {
    console.error("radar-cancel-pull", error);
    return reply({ error: error instanceof Error ? error.message : "Cancel pull failed" }, 500, cors);
  }
});

async function pullSlice(
  db: CancelDb, agencyWorkspaceId: string, source: URL, requiresSession: boolean, request: CancelRequest,
): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  const session = cancelSessionCookie(requiresSession, Deno.env.get("RADAR_POC_SESSION"));
  if (session) headers.Cookie = session;
  const fetched = await fetch(source, {
    method: "POST", headers, redirect: "manual", signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({ county: request.county, exact_date: request.exact_date }),
  });
  if (fetched.status >= 300 && fetched.status < 400) throw new Error("Cancel source redirects are prohibited");
  if (!fetched.ok) throw new Error(CANCEL_MISS_REASON.fetch(request.county, request.exact_date, fetched.status));
  const declaredLength = Number(fetched.headers.get("content-length") ?? 0);
  if (declaredLength > 20_000_000) throw new Error("Cancel response exceeds 20 MB");
  const bytes = await readLimited(fetched.body, 20_000_000);
  if (!bytes.length) throw new Error(CANCEL_MISS_REASON.emptyPayload(request.county, request.exact_date));
  const hash = await sha256Hex(bytes);
  const { data: duplicate, error: duplicateError } = await db.from("poc_uploads")
    .select("id,row_count,kind,filename,storage_path,sha256")
    .eq("agency_workspace_id", agencyWorkspaceId).eq("sha256", hash).maybeSingle();
  if (duplicateError) throw duplicateError;
  if (duplicate) {
    const { data: existingRows, error: existingRowsError } = await db.from("poc_staging")
      .select("kind,county,expiration_date,parse_errors,processed_at").eq("agency_workspace_id", agencyWorkspaceId)
      .eq("poc_upload_id", duplicate.id);
    if (existingRowsError) throw existingRowsError;
    if (!canResumeCancelUpload(duplicate, existingRows ?? [], agencyWorkspaceId, request, hash)) {
      throw new Error(CANCEL_MISS_REASON.duplicate(request.county, request.exact_date));
    }
    const processing = await processUpload(agencyWorkspaceId, duplicate.id);
    return { ...request, uploadId: duplicate.id, rowCount: duplicate.row_count, resumed: true, processing };
  }
  const extension = detectCancelArtifact(bytes, fetched.headers.get("content-type"));
  const filename = `cancel-${request.exact_date}-${request.county.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.${extension}`;
  const storagePath = `${agencyWorkspaceId}/harvester/${request.exact_date}/${crypto.randomUUID()}-${filename}`;
  const bucket = Deno.env.get("RADAR_POC_BUCKET") ?? "radar-poc-uploads";
  const { error: storageError } = await db.storage.from(bucket).upload(storagePath, bytes, {
    contentType: extension === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv",
    upsert: false,
  });
  if (storageError) throw storageError;
  let harvested: Awaited<ReturnType<typeof invokeHarvest>>;
  try {
    harvested = await invokeHarvest(agencyWorkspaceId, storagePath, filename, request);
  } catch (error) {
    if (error instanceof HarvestInvocationError && !error.artifactAccepted) {
      const { error: cleanupError } = await db.storage.from(bucket).remove([storagePath]);
      if (cleanupError) throw new Error(`${error.message}; fetched artifact cleanup failed: ${cleanupError.message}`);
    }
    throw error;
  }
  const processing = await processUpload(agencyWorkspaceId, harvested.uploadId);
  return { ...request, ...harvested, processing };
}

function easternCalendarDate(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(value);
}

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

async function invokeHarvest(
  agencyWorkspaceId: string,
  storagePath: string,
  filename: string,
  request: CancelRequest,
): Promise<{ uploadId: string; rowCount: number; uniqueRows: number; validRows: number; invalidRows: number }> {
  const internalSecret = Deno.env.get("RADAR_INTERNAL_SECRET");
  if (!internalSecret) throw new Error("RADAR_INTERNAL_SECRET is not configured");
  const harvested = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/radar-poc-harvest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Radar-Internal-Secret": internalSecret },
    body: JSON.stringify({ agencyWorkspaceId, kind: "cancel", storagePath, filename,
      expectedCounty: request.county, expectedExactDate: request.exact_date }),
    signal: AbortSignal.timeout(60_000),
  });
  const result = await harvested.json();
  if (!harvested.ok || !result.uploadId) {
    throw new HarvestInvocationError(
      result.error ?? `Cancel harvest failed: ${harvested.status}`,
      result.artifactAccepted === true || result.durable === true,
    );
  }
  if (result.duplicate) throw new HarvestInvocationError(
    CANCEL_MISS_REASON.duplicate(request.county, request.exact_date), false,
  );
  return result;
}

class HarvestInvocationError extends Error {
  constructor(message: string, readonly artifactAccepted: boolean) {
    super(message);
    this.name = "HarvestInvocationError";
  }
}

function verifyStrictCronSecret(req: Request, cors: Record<string, string>): Response | null {
  const expected = Deno.env.get("CRON_SECRET");
  const actual = req.headers.get("X-Cron-Secret");
  if (!expected) return reply({ error: "Cron authentication is not configured" }, 500, cors);
  if (!actual || !constantTimeEqual(actual, expected)) return reply({ error: "Unauthorized" }, 401, cors);
  return null;
}

function constantTimeEqual(left: string, right: string): boolean {
  const size = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < size; index++) mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
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
      throw new Error("Cancel response exceeds 20 MB");
    }
    chunks.push(value);
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}
