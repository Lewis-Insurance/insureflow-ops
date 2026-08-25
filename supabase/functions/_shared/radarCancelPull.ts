export const CANCEL_MISS_REASON = {
  noSource: "Cancel source URL is not configured",
  host: "Cancel source host is not allowed",
  emptyPayload: (county: string, exactDate: string) =>
    `Cancel pull returned zero rows for ${county} on ${exactDate}`,
  duplicate: (county: string, exactDate: string) =>
    `Cancel pull produced no new staging rows for ${county} on ${exactDate} (duplicate content)`,
  noStaging: (county: string, exactDate: string) =>
    `Cancel pull produced no staging rows for ${county} on ${exactDate}`,
  noValidRows: (county: string, exactDate: string) =>
    `Cancel pull produced no valid staging rows for ${county} on ${exactDate}`,
  fetch: (county: string, exactDate: string, status: number) =>
    `Cancel source returned ${status} for ${county} on ${exactDate}`,
} as const;

export const LOCKED_CANCEL_COUNTIES = [
  "Columbia", "Suwannee", "Alachua", "Union", "Hamilton", "Lafayette", "Gilchrist",
] as const;

export interface CancelRequest {
  county: string;
  exact_date: string;
}

export interface ExistingCancelUpload {
  id: string;
  kind: string;
  filename: string;
  storage_path: string;
  sha256: string;
}

export interface ExistingCancelStagingRow {
  kind: string;
  county: string | null;
  expiration_date: string | null;
  parse_errors: unknown;
  processed_at: string | null;
}

export function acceptedCancelStagingCounts(
  rows: readonly { parse_errors: unknown }[],
  request: CancelRequest,
): { insertedRows: number; invalidRows: number } {
  if (!rows.length) throw new Error(CANCEL_MISS_REASON.noStaging(request.county, request.exact_date));
  const invalidRows = rows.filter((row) => Array.isArray(row.parse_errors) && row.parse_errors.length > 0).length;
  if (invalidRows === rows.length) throw new Error(CANCEL_MISS_REASON.noValidRows(request.county, request.exact_date));
  return { insertedRows: rows.length, invalidRows };
}

export function cancelSessionCookie(requiresSession: boolean, session: string | null | undefined): string | null {
  if (!requiresSession) return null;
  if (requiresSession && !session) throw new Error("Cancel source requires RADAR_POC_SESSION but it is not configured");
  if (/[\r\n]/.test(session)) throw new Error("RADAR_POC_SESSION is invalid");
  return session;
}

export function canResumeCancelUpload(
  upload: ExistingCancelUpload,
  stagingRows: readonly ExistingCancelStagingRow[],
  agencyWorkspaceId: string,
  request: CancelRequest,
  expectedSha256: string,
): boolean {
  const slug = request.county.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const expectedFilename = new RegExp(`^cancel-${request.exact_date}-${slug}\\.(csv|xlsx)$`);
  const expectedPrefix = `${agencyWorkspaceId}/harvester/${request.exact_date}/`;
  return upload.kind === "cancel" && upload.sha256 === expectedSha256 &&
    expectedFilename.test(upload.filename) && upload.storage_path.startsWith(expectedPrefix) &&
    upload.storage_path.endsWith(`-${upload.filename}`) && stagingRows.length > 0 &&
    stagingRows.some((row) => row.processed_at === null &&
      Array.isArray(row.parse_errors) && row.parse_errors.length === 0) &&
    stagingRows.every((row) => row.kind === "cancel" &&
      row.county?.trim().toLowerCase() === request.county.toLowerCase() &&
      row.expiration_date === request.exact_date);
}

export function detectCancelArtifact(bytes: Uint8Array, contentType: string | null): "csv" | "xlsx" {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return "xlsx";
  }
  const mediaType = (contentType ?? "").split(";", 1)[0].trim().toLowerCase();
  if (mediaType === "text/csv" || mediaType === "application/csv") return "csv";
  throw new Error("Cancel source returned an unsupported payload type");
}

type RadarRpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ error: unknown }>;
};

export async function recordCancelMiss(
  db: RadarRpcClient,
  agencyWorkspaceId: string,
  easternDate: string,
  reason: string,
): Promise<void> {
  const { error } = await db.rpc("radar_record_cancel_miss", {
    p_workspace_id: agencyWorkspaceId,
    p_eastern_date: easternDate,
    p_reason: reason,
  });
  if (error) throw error;
}

export function validateCancelSource(raw: string | null | undefined, allowedHosts: Set<string>): URL {
  if (!raw) throw new Error(CANCEL_MISS_REASON.noSource);
  let source: URL;
  try { source = new URL(raw); }
  catch { throw new Error(CANCEL_MISS_REASON.host); }
  if (
    source.protocol !== "https:" || !allowedHosts.has(source.hostname) || source.username ||
    source.password || source.search || source.hash
  ) throw new Error(CANCEL_MISS_REASON.host);
  return source;
}

export function cancelRequestsFromPlan(
  plan: unknown,
  easternDate: string,
  configuredCounties: readonly string[],
): CancelRequest[] {
  if (
    configuredCounties.length !== LOCKED_CANCEL_COUNTIES.length ||
    configuredCounties.some((county, index) => county !== LOCKED_CANCEL_COUNTIES[index])
  ) throw new Error("radar_config.counties does not match the locked seven-county cancel scope");
  const requests = (plan as { cancel?: { requests?: unknown } } | null)?.cancel?.requests;
  if (!Array.isArray(requests) || requests.length === 0) throw new Error("Cancel harvest plan has no requests");
  if (requests.length !== 7) throw new Error("Cancel harvest plan must contain exactly seven requests");
  const normalized = requests.map((value) => {
    const request = value as Partial<CancelRequest>;
    if (typeof request.county !== "string" || !request.county.trim() || request.exact_date !== easternDate) {
      throw new Error("Cancel harvest plan contains an invalid or non-today request");
    }
    return { county: request.county.trim(), exact_date: request.exact_date };
  });
  if (new Set(normalized.map((request) => request.county.toLowerCase())).size !== normalized.length) {
    throw new Error("Cancel harvest plan contains duplicate counties");
  }
  if (normalized.some((request, index) => request.county !== configuredCounties[index])) {
    throw new Error("Cancel harvest plan does not match radar_config.counties");
  }
  return normalized;
}
