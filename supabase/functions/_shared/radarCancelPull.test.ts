import {
  acceptedCancelStagingCounts, cancelRequestsFromPlan, cancelSessionCookie, canResumeCancelUpload,
  CANCEL_MISS_REASON, detectCancelArtifact,
  recordCancelMiss, validateCancelSource,
} from "./radarCancelPull.ts";

const counties = ["Columbia", "Suwannee", "Alachua", "Union", "Hamilton", "Lafayette", "Gilchrist"];

Deno.test("cancel plan is exactly today once for each of the seven configured counties", () => {
  const requests = cancelRequestsFromPlan({ cancel: { requests: counties.map((county) => ({
    county, exact_date: "2026-08-24",
  })) } }, "2026-08-24", counties);
  if (requests.length !== 7 || requests.map((request) => request.county).join("|") !== counties.join("|")) {
    throw new Error("county order or cardinality changed");
  }
  if (requests.some((request) => request.exact_date !== "2026-08-24" || request.county === "Leon")) {
    throw new Error("non-today date or Leon entered the cancel plan");
  }
});

Deno.test("cancel plan rejects X-date or historic/future dates", () => {
  for (const plan of [
    { cancel: { requests: [{ county: "Columbia", exact_date: "2026-09-23" }] } },
    { xdate: { requests: [{ county: "Columbia", exact_date: "2026-09-23" }] } },
  ]) {
    let failed = false;
    try { cancelRequestsFromPlan(plan, "2026-08-24", counties); } catch { failed = true; }
    if (!failed) throw new Error("non-today plan was accepted");
  }
});

Deno.test("cancel URL validation is HTTPS allowlisted and rejects URL capability smuggling", () => {
  const hosts = new Set(["poc.example.test"]);
  validateCancelSource("https://poc.example.test/export", hosts);
  for (const source of [
    "http://poc.example.test/export", "https://evil.example.test/export",
    "https://user:secret@poc.example.test/export", "https://poc.example.test/export?q=1",
    "https://poc.example.test/export#fragment",
  ]) {
    let failed = false;
    try { validateCancelSource(source, hosts); } catch { failed = true; }
    if (!failed) throw new Error(`unsafe source accepted: ${source}`);
  }
});

Deno.test("cancel artifact detection uses XLSX ZIP magic and strict CSV media types", () => {
  const csv = new TextEncoder().encode("Employer,County\nAcme,Columbia\n");
  if (detectCancelArtifact(csv, "text/csv; charset=utf-8") !== "csv") throw new Error("CSV rejected");
  if (detectCancelArtifact(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1]), "application/octet-stream") !== "xlsx") {
    throw new Error("XLSX signature rejected");
  }
  for (const type of ["text/html", "application/json", "application/octet-stream", null]) {
    let failed = false;
    try { detectCancelArtifact(csv, type); } catch { failed = true; }
    if (!failed) throw new Error(`unsupported payload accepted: ${type}`);
  }
});

Deno.test("public cancel source permits no session while saved-session mode fails closed", () => {
  if (cancelSessionCookie(false, undefined) !== null) throw new Error("public source unexpectedly required session");
  if (cancelSessionCookie(false, "secret-cookie") !== null) throw new Error("session leaked to public source");
  if (cancelSessionCookie(true, "session=value") !== "session=value") throw new Error("saved session was not used");
  let failed = false;
  try { cancelSessionCookie(true, undefined); } catch { failed = true; }
  if (!failed) throw new Error("required saved session was silently omitted");
});

Deno.test("duplicate cancel upload resumes only the identical durable county/date artifact", () => {
  const request = { county: "Columbia", exact_date: "2026-08-24" };
  const upload = { id: "upload-1", kind: "cancel", sha256: "abc",
    filename: "cancel-2026-08-24-columbia.csv",
    storage_path: "workspace-1/harvester/2026-08-24/random-cancel-2026-08-24-columbia.csv" };
  const rows = [{ kind: "cancel", county: "Columbia", expiration_date: "2026-08-24",
    parse_errors: [], processed_at: null }];
  if (!canResumeCancelUpload(upload, rows, "workspace-1", request, "abc")) throw new Error("safe recovery rejected");
  for (const unsafe of [
    { ...upload, kind: "swo" }, { ...upload, sha256: "other" },
    { ...upload, storage_path: "workspace-2/harvester/2026-08-24/random-cancel-2026-08-24-columbia.csv" },
  ]) if (canResumeCancelUpload(unsafe, rows, "workspace-1", request, "abc")) throw new Error("unsafe recovery accepted");
  if (canResumeCancelUpload(upload, [{ ...rows[0], county: "Leon" }], "workspace-1", request, "abc")) {
    throw new Error("wrong-slice recovery accepted");
  }
  if (canResumeCancelUpload(upload, [{ ...rows[0], parse_errors: ["invalid"] }], "workspace-1", request, "abc")) {
    throw new Error("all-invalid recovery accepted");
  }
  const interrupted = [{ ...rows[0], processed_at: "2026-08-24T12:00:00Z" }, rows[0]];
  if (!canResumeCancelUpload(upload, interrupted, "workspace-1", request, "abc")) {
    throw new Error("interrupted upload with valid unprocessed work was rejected");
  }
  if (canResumeCancelUpload(upload, [{ ...rows[0], processed_at: "2026-08-24T12:00:00Z" }],
    "workspace-1", request, "abc")) {
    throw new Error("fully processed duplicate was resumable");
  }
});

Deno.test("zero-valid and all-invalid cancel staging fail before durable acceptance", () => {
  const request = { county: "Columbia", exact_date: "2026-08-24" };
  for (const rows of [[], [{ parse_errors: ["employer_name is required"] }]]) {
    let failed = false;
    try { acceptedCancelStagingCounts(rows, request); } catch { failed = true; }
    if (!failed) throw new Error("invalid-only artifact was accepted");
  }
  const counts = acceptedCancelStagingCounts([{ parse_errors: [] }, { parse_errors: ["bad fein"] }], request);
  if (counts.insertedRows !== 2 || counts.invalidRows !== 1) throw new Error("accepted counts are wrong");
});

Deno.test("cancel plan rejects a wrong seven-county set and Leon", () => {
  for (const configured of [
    ["Columbia", "Suwannee", "Alachua", "Union", "Hamilton", "Lafayette", "Leon"],
    ["Columbia", "Suwannee", "Alachua", "Union", "Hamilton", "Lafayette", "Baker"],
  ]) {
    let failed = false;
    try {
      cancelRequestsFromPlan({ cancel: { requests: configured.map((county) => ({
        county, exact_date: "2026-08-24",
      })) } }, "2026-08-24", configured);
    } catch { failed = true; }
    if (!failed) throw new Error("wrong county set was accepted");
  }
  let mismatched = false;
  try {
    const wrongRequests = [...counties.slice(0, 6), "Leon"].map((county) => ({
      county, exact_date: "2026-08-24",
    }));
    cancelRequestsFromPlan({ cancel: { requests: wrongRequests } }, "2026-08-24", counties);
  } catch { mismatched = true; }
  if (!mismatched) throw new Error("Leon request was accepted against locked config");
});

for (const reason of [CANCEL_MISS_REASON.noSource, CANCEL_MISS_REASON.emptyPayload("Columbia", "2026-08-24")]) {
  Deno.test(`cancel miss records renewal alert: ${reason}`, async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    await recordCancelMiss({ rpc: (name, args) => {
      calls.push({ name, args }); return Promise.resolve({ error: null });
    } }, "workspace-1", "2026-08-24", reason);
    if (calls.length !== 1 || calls[0].name !== "radar_record_cancel_miss") throw new Error("miss RPC not called");
  });
}

Deno.test("cancel miss recording surfaces RPC failures", async () => {
  let failed = false;
  try {
    await recordCancelMiss({ rpc: () => Promise.resolve({ error: new Error("unavailable") }) },
      "workspace-1", "2026-08-24", CANCEL_MISS_REASON.noSource);
  } catch { failed = true; }
  if (!failed) throw new Error("RPC failure was swallowed");
});
