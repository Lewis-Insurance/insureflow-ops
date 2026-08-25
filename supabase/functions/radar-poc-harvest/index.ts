import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import readXlsxFile, { readSheetNames } from "npm:read-excel-file@5.8.8/node";
import { Buffer } from "node:buffer";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { verifyAgencyAuth } from "../_shared/agency-auth.ts";
import { acceptedCancelStagingCounts } from "../_shared/radarCancelPull.ts";
import { canonicalizeRow, parseCsv, preflightXlsx, sha256Hex, sourceRowHash, validateRawRow, validateRow, type RadarKind } from "../_shared/radarIngest.ts";

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors(req);
  const cors = getCorsHeaders(req.headers.get("origin"));
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "Server configuration error" }, 500, cors);
  const db = createClient(url, key);
  let insertedUploadId: string | null = null;
  let stagingAccepted = false;

  try {
    const body = await req.json();
    const workspaceId = String(body.agencyWorkspaceId ?? "");
    const kind = body.kind as RadarKind;
    const internal = req.headers.get("X-Radar-Internal-Secret");
    const expectedInternal = Deno.env.get("RADAR_INTERNAL_SECRET");
    let actorId: string | null = null;
    if (internal) {
      if (!expectedInternal || !constantTimeEqual(internal, expectedInternal)) {
        return json({ error: "Unauthorized" }, 401, cors);
      }
      if (kind === "cancel" && (!body.expectedCounty || !body.expectedExactDate)) {
        return json({ error: "Internal cancel harvest requires its county and exact date slice" }, 400, cors);
      }
    } else {
      const auth = await verifyAgencyAuth(req, db);
      if (!auth.user) return json({ error: auth.error }, auth.statusCode, cors);
      if (!auth.user.isStaff || !auth.user.agencyWorkspaceIds.includes(workspaceId)) {
        return json({ error: "Active staff workspace membership required" }, 403, cors);
      }
      actorId = auth.user.id;
    }
    if (kind !== "cancel" && kind !== "swo") return json({ error: "kind must be cancel or swo" }, 400, cors);
    const storagePath = String(body.storagePath ?? "");
    const filename = String(body.filename ?? storagePath.split("/").pop() ?? "");
    if (!storagePath || !filename) return json({ error: "storagePath and filename are required" }, 400, cors);
    if (!storagePath.startsWith(`${workspaceId}/`) || storagePath.includes("..")) {
      return json({ error: "storagePath must be inside the workspace prefix" }, 400, cors);
    }
    const bucket = Deno.env.get("RADAR_POC_BUCKET") ?? "radar-poc-uploads";
    const { data: blob, error: downloadError } = await db.storage.from(bucket).download(storagePath);
    if (downloadError || !blob) throw new Error(`Unable to download upload: ${downloadError?.message ?? "not found"}`);
    if (blob.size > 20_000_000) return json({ error: "Upload exceeds the 20 MB limit" }, 413, cors);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const sha256 = await sha256Hex(bytes);

    const { data: existing } = await db.from("poc_uploads").select("id,row_count")
      .eq("agency_workspace_id", workspaceId).eq("sha256", sha256).maybeSingle();
    if (existing) return json({ uploadId: existing.id, rowCount: existing.row_count,
      duplicate: true, durable: true, artifactAccepted: false }, 200, cors);

    const extension = filename.toLowerCase().split(".").pop();
    let rawRows: Record<string, unknown>[];
    if (extension === "csv") rawRows = parseCsv(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    else if (extension === "xlsx") {
      preflightXlsx(bytes);
      const input = Buffer.from(bytes);
      if ((await readSheetNames(input)).length !== 1) throw new Error("XLSX must contain exactly one worksheet");
      const matrix = await readXlsxFile(input);
      if (!matrix.length) rawRows = [];
      else {
        const headers = matrix[0].map((cell) => String(cell ?? ""));
        rawRows = matrix.slice(1).map((cells) => Object.fromEntries(headers.map((header, i) => [header, cells[i] ?? ""])));
      }
    } else return json({ error: "Only CSV and XLSX files are supported" }, 400, cors);
    if (!rawRows.length) return json({ error: "The upload contains no data rows" }, 400, cors);
    if (rawRows.length > 25_000) return json({ error: "Upload exceeds the 25,000 row limit" }, 413, cors);
    rawRows.forEach(validateRawRow);

    const { data: upload, error: uploadError } = await db.from("poc_uploads").insert({
      agency_workspace_id: workspaceId, kind, filename, storage_path: storagePath,
      sha256, row_count: rawRows.length, uploaded_by: actorId,
    }).select("id").single();
    if (uploadError) throw uploadError;
    insertedUploadId = upload.id;

    const parsed = await Promise.all(rawRows.map(async (raw, index) => {
      const row = canonicalizeRow(raw);
      if (internal && kind === "cancel" && (
        String(row.county ?? "").trim().toLowerCase() !== String(body.expectedCounty).trim().toLowerCase() ||
        row.expiration_date !== body.expectedExactDate
      )) throw new Error("Cancel artifact contains a row outside its requested county/date slice");
      const parseErrors = validateRow(row);
      return {
        agency_workspace_id: workspaceId, poc_upload_id: upload.id, row_number: index + 1, kind,
        ...row, expiration_date: parseErrors.includes("expiration_date is invalid") ? null : row.expiration_date,
        raw_row: raw, source_row_hash: await sourceRowHash(kind, row), parse_errors: parseErrors,
      };
    }));
    const staging = [...new Map(parsed.map((row) => [row.source_row_hash, row])).values()];
    const { error: stagingError } = await db.from("poc_staging").upsert(staging, {
      onConflict: "agency_workspace_id,source_row_hash", ignoreDuplicates: true,
    });
    if (stagingError) throw stagingError;
    const { data: acceptedRows, error: acceptedRowsError } = await db.from("poc_staging").select("parse_errors")
      .eq("agency_workspace_id", workspaceId).eq("poc_upload_id", upload.id);
    if (acceptedRowsError) throw acceptedRowsError;
    let insertedRows: number;
    let invalidRows: number;
    if (kind === "cancel") {
      ({ insertedRows, invalidRows } = acceptedCancelStagingCounts(acceptedRows ?? [], {
        county: String(body.expectedCounty), exact_date: String(body.expectedExactDate),
      }));
    } else {
      if (!acceptedRows?.length) throw new Error("Harvest produced no staging rows");
      insertedRows = acceptedRows.length;
      invalidRows = acceptedRows.filter((row) => Array.isArray(row.parse_errors) && row.parse_errors.length).length;
    }
    stagingAccepted = true;
    return json({ uploadId: upload.id, rowCount: rawRows.length, uniqueRows: insertedRows,
      validRows: insertedRows - invalidRows, invalidRows, durable: true, artifactAccepted: true }, 201, cors);
  } catch (error) {
    console.error("radar-poc-harvest", error);
    if (insertedUploadId && !stagingAccepted) {
      const { error: cleanupError } = await db.from("poc_uploads").delete().eq("id", insertedUploadId);
      if (cleanupError) {
        console.error("radar-poc-harvest pre-staging cleanup failed", insertedUploadId, cleanupError);
        return json({ error: "Harvest failed and pre-staging cleanup could not be confirmed", durable: true }, 500, cors);
      }
      insertedUploadId = null;
    }
    return json({ error: error instanceof Error ? error.message : "Harvest failed", durable: stagingAccepted }, 500, cors);
  }
});

function constantTimeEqual(left: string, right: string): boolean {
  const size = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < size; index++) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}
