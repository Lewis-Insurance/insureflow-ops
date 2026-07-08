/**
 * Commercial Auto / Business Auto Policy Extraction Edge Function
 *
 * Uses Azure Document Intelligence for OCR and builds evidence catalogs
 * for click-to-highlight support.
 *
 * Flow:
 * 1. Fetch document from storage
 * 2. Call Azure Document Intelligence for OCR
 * 3. Build evidence catalog with BAP-specific field patterns
 * 4. Send evidence to Claude for extraction (NO GUESSING - evidence only)
 * 5. Store results with evidence IDs for traceability
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { anthropicBoundaryCreate } from '../_shared/modelBoundaryFetch.ts';
import { nullifyRedactedTokens } from '../_shared/floorSafety.ts';
import { requireAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import {
  BAP_EXTRACTION_TOOL_NAME,
  BAP_EXTRACTION_TOOL_SCHEMA,
  shapeBapDetails,
  shapeVehicleRows,
  shapeDriverRows,
  shapeCoverageRows,
  shapeInterestRows,
  type RawBapExtraction,
} from './shape.ts';

// =============================================================================
// BAP EXTRACTION SYSTEM PROMPT
// =============================================================================

const BAP_EXTRACTION_SYSTEM_PROMPT = `You are an expert Commercial Auto (Business Auto Policy) insurance document analyst.

You MUST return your extraction by calling the ${BAP_EXTRACTION_TOOL_NAME} tool. Do not answer in prose.

## CRITICAL RULES
1. ONLY extract values that appear in the evidence catalog provided. Cite the evidence IDs (E####) that support each value in that field's evidence_ids array.
2. NEVER guess or infer. If a value is not in the evidence, return null for that field.
3. NEVER fabricate an evidence ID — only use IDs that appear in the catalog.

## Coverage (this drives the ACORD 25 auto section — get it right)
- liability.limit_type: "csl" (Combined Single Limit) or "split" (separate BI/PD limits).
- liability.csl_limit when csl; otherwise bodily_injury_per_person, bodily_injury_per_accident, property_damage.
- coverage.covered_auto_symbols: the covered-auto SYMBOL CODES marked on the coverage grid. Legend:
    1 = Any Auto
    2 = Owned Autos Only (3-6 are owned subsets)
    7 = Specifically Described Autos  (this is "SCHEDULED AUTOS" on the certificate)
    8 = Hired Autos Only
    9 = Non-Owned Autos Only
  Return the integer codes you actually see. Do not convert them.

## Insurer NAIC
- carrier_naic is the 5-digit INSURER (company) NAIC code. It is NOT an industry NAICS or SIC classification code. If the policy does not clearly show the insurer's NAIC number, return null — a name-to-NAIC lookup happens later.

## Premium
- Do NOT extract premium, fees, taxes, or any dollar amount that is not a coverage limit or deductible. Premium is never captured.

## Additional Insured / Waiver of Subrogation (evidence only)
- Capture blanket endorsements as EVIDENCE in additional_insured_evidence / waiver_of_subrogation_evidence:
  { present, basis: "blanket" | "scheduled", form_numbers: [...], source_span }.
- Name specifically-listed additional insureds / loss payees / lienholders in additional_interests.
- Do NOT assert a confirmed "Y" for any specific certificate holder. You are recording what the policy shows, not certifying an endorsement.

## Vehicles
- Full VINs are masked before you receive the document. Store whatever VIN fragment is present; never invent a VIN.

## Drivers / dates
- Dates as YYYY-MM-DD. Regulated PII (dates of birth, license numbers) may already be redacted — leave those null when so.`;

// =============================================================================
// TYPES
// =============================================================================

interface RequestBody {
  document_id: string;
  policy_id: string;
  document_type?: 'application' | 'quote' | 'binder' | 'policy' | 'endorsement' | 'schedule';
  use_azure_di?: boolean;
}

interface EvidenceEntry {
  evidenceId: string;
  sourceType: 'key_value' | 'table_cell' | 'text_span' | 'layout_element';
  label: string | null;
  value: string;
  normalizedValue: string;
  confidence: number;
  pageNumber: number;
  boundingBox: {
    x: number; y: number; width: number; height: number;
    pageWidth: number; pageHeight: number;
  } | null;
  tableContext?: {
    tableIndex: number; rowIndex: number; columnIndex: number;
    columnHeader?: string; rowHeader?: string;
  };
  tags: string[];
}

interface EvidenceCatalog {
  entries: Record<string, EvidenceEntry>;
  byBAPField: Record<string, string[]>;
  stats: { totalEntries: number; avgConfidence: number; pageCount: number; };
}

// =============================================================================
// BAP FIELD PATTERNS
// =============================================================================

const BAP_FIELD_PATTERNS: Record<string, RegExp[]> = {
  PolicyNumber: [/policy\s*(number|no|#)/i],
  NamedInsured: [/named\s*insured/i, /insured\s*name/i],
  VIN: [/vin/i, /vehicle\s*id/i, /\b[A-HJ-NPR-Z0-9]{17}\b/],
  Year: [/year/i, /model\s*year/i],
  Make: [/make/i, /manufacturer/i],
  Model: [/model/i],
  BodyType: [/body\s*type/i, /vehicle\s*type/i],
  GVW: [/gvw/i, /gross\s*vehicle\s*weight/i],
  GaragingZip: [/garaging\s*zip/i, /garaged?\s*at/i],
  CombinedSingleLimit: [/csl/i, /combined\s*single/i],
  BodilyInjury: [/bodily\s*injury/i, /bi\s*limit/i],
  PropertyDamage: [/property\s*damage/i, /pd\s*limit/i],
  CompDeductible: [/comp\s*ded/i, /comprehensive\s*ded/i],
  CollDeductible: [/coll\s*ded/i, /collision\s*ded/i],
  UMLimit: [/um\s*limit/i, /uninsured\s*motorist/i],
  UIMLimit: [/uim\s*limit/i, /underinsured/i],
  PIPLimit: [/pip\s*limit/i, /personal\s*injury\s*protection/i],
  MedPayLimit: [/med\s*pay/i, /medical\s*payments/i],
  HiredAutoLimit: [/hired\s*auto/i],
  NonOwnedLimit: [/non-?owned/i],
  DriverName: [/driver\s*name/i],
  LicenseNumber: [/license\s*(number|no|#)/i, /dl\s*#/i],
  DateOfBirth: [/date\s*of\s*birth/i, /dob/i, /birth\s*date/i],
  LossPayee: [/loss\s*payee/i, /lienholder/i],
  AdditionalInsured: [/additional\s*insured/i, /add'l\s*insured/i],
  Symbol: [/symbol/i, /sym\./i],
};

// =============================================================================
// AZURE DOCUMENT INTELLIGENCE
// =============================================================================

async function callAzureDocumentIntelligence(
  documentUrl: string,
  azureEndpoint: string,
  azureKey: string
): Promise<any> {
  const analyzeUrl = `${azureEndpoint}/documentintelligence/documentModels/prebuilt-layout:analyze?api-version=2024-11-30&features=keyValuePairs`;

  const analyzeResponse = await fetch(analyzeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": azureKey,
    },
    body: JSON.stringify({ urlSource: documentUrl }),
  });

  if (!analyzeResponse.ok) {
    throw new Error(`Azure DI analyze failed: ${await analyzeResponse.text()}`);
  }

  const operationLocation = analyzeResponse.headers.get("Operation-Location");
  if (!operationLocation) throw new Error("No operation location returned");

  let result = null;
  let attempts = 0;
  while (attempts < 30) {
    await new Promise((r) => setTimeout(r, 2000));
    const statusResponse = await fetch(operationLocation, {
      headers: { "Ocp-Apim-Subscription-Key": azureKey },
    });
    const statusData = await statusResponse.json();
    if (statusData.status === "succeeded") {
      result = statusData.analyzeResult;
      break;
    } else if (statusData.status === "failed") {
      throw new Error(`Azure DI failed: ${statusData.error?.message}`);
    }
    attempts++;
  }

  if (!result) throw new Error("Azure DI timed out");
  return result;
}

// =============================================================================
// EVIDENCE CATALOG BUILDER
// =============================================================================

function buildEvidenceCatalog(azureResult: any): EvidenceCatalog {
  const entries: Record<string, EvidenceEntry> = {};
  let counter = 0;
  const pageInfo: Map<number, { width: number; height: number }> = new Map();

  for (const page of azureResult.pages || []) {
    pageInfo.set(page.pageNumber, { width: page.width, height: page.height });
  }

  const generateId = () => `E${String(++counter).padStart(4, "0")}`;

  const polygonToBbox = (polygon: number[] | undefined, pageNum: number) => {
    if (!polygon || polygon.length < 8) return null;
    const info = pageInfo.get(pageNum);
    if (!info) return null;
    const xs = [polygon[0], polygon[2], polygon[4], polygon[6]];
    const ys = [polygon[1], polygon[3], polygon[5], polygon[7]];
    return {
      x: Math.min(...xs), y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      pageWidth: info.width, pageHeight: info.height,
    };
  };

  const inferTags = (label: string, value: string): string[] => {
    const tags: string[] = [];
    for (const [field, patterns] of Object.entries(BAP_FIELD_PATTERNS)) {
      for (const p of patterns) {
        if (p.test(label) || p.test(value)) { tags.push(field); break; }
      }
    }
    // VIN pattern detection
    if (/^[A-HJ-NPR-Z0-9]{17}$/i.test(value)) tags.push("VIN");
    return tags;
  };

  // Process key-value pairs
  for (const kv of azureResult.keyValuePairs || []) {
    const key = kv.key?.content?.trim();
    const value = kv.value?.content?.trim();
    if (!value) continue;
    const pageNum = kv.value?.boundingRegions?.[0]?.pageNumber || 1;
    const id = generateId();
    entries[id] = {
      evidenceId: id,
      sourceType: "key_value",
      label: key || null,
      value,
      normalizedValue: value,
      confidence: kv.confidence || 0.8,
      pageNumber: pageNum,
      boundingBox: polygonToBbox(kv.value?.boundingRegions?.[0]?.polygon, pageNum),
      tags: inferTags(key || "", value),
    };
  }

  // Process tables (critical for vehicle/driver schedules)
  for (let ti = 0; ti < (azureResult.tables || []).length; ti++) {
    const table = azureResult.tables[ti];
    const headers: Record<number, string> = {};
    for (const cell of table.cells) {
      if (cell.kind === "columnHeader") headers[cell.columnIndex] = cell.content;
    }
    for (const cell of table.cells) {
      if (cell.kind !== "content" || !cell.content?.trim()) continue;
      const pageNum = cell.boundingRegions?.[0]?.pageNumber || 1;
      const id = generateId();
      const header = headers[cell.columnIndex] || "";
      entries[id] = {
        evidenceId: id,
        sourceType: "table_cell",
        label: header || null,
        value: cell.content.trim(),
        normalizedValue: cell.content.trim(),
        confidence: cell.confidence || 0.85,
        pageNumber: pageNum,
        boundingBox: polygonToBbox(cell.boundingRegions?.[0]?.polygon, pageNum),
        tableContext: { tableIndex: ti, rowIndex: cell.rowIndex, columnIndex: cell.columnIndex, columnHeader: header },
        tags: inferTags(header, cell.content),
      };
    }
  }

  // Build field index
  const byBAPField: Record<string, string[]> = {};
  for (const [id, entry] of Object.entries(entries)) {
    for (const tag of entry.tags) {
      if (!byBAPField[tag]) byBAPField[tag] = [];
      byBAPField[tag].push(id);
    }
  }

  const list = Object.values(entries);
  return {
    entries,
    byBAPField,
    stats: {
      totalEntries: list.length,
      avgConfidence: list.length ? list.reduce((s, e) => s + e.confidence, 0) / list.length : 0,
      pageCount: new Set(list.map(e => e.pageNumber)).size,
    },
  };
}

// =============================================================================
// FORMAT EVIDENCE FOR PROMPT
// =============================================================================

function formatEvidenceForPrompt(catalog: EvidenceCatalog): string {
  const lines: string[] = [];
  lines.push("## Evidence Catalog");
  lines.push(`Total entries: ${catalog.stats.totalEntries}`);
  lines.push(`Avg confidence: ${(catalog.stats.avgConfidence * 100).toFixed(1)}%`);
  lines.push("");

  const byPage: Record<number, EvidenceEntry[]> = {};
  for (const e of Object.values(catalog.entries)) {
    if (!byPage[e.pageNumber]) byPage[e.pageNumber] = [];
    byPage[e.pageNumber].push(e);
  }

  for (const pageNum of Object.keys(byPage).map(Number).sort((a, b) => a - b)) {
    lines.push(`### Page ${pageNum}`);
    for (const e of byPage[pageNum]) {
      const label = e.label ? `[${e.label}]` : "";
      const conf = `(${(e.confidence * 100).toFixed(0)}%)`;
      const tags = e.tags.length ? ` {${e.tags.join(", ")}}` : "";
      const val = e.value.length > 100 ? e.value.substring(0, 100) + "..." : e.value;
      lines.push(`- **${e.evidenceId}** ${label}: "${val}" ${conf}${tags}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const jobStartTime = Date.now();
  let jobId: string | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
    const azureEndpoint = Deno.env.get("AZURE_DI_ENDPOINT");
    const azureKey = Deno.env.get("AZURE_DI_KEY");

    if (!anthropicApiKey) throw new Error("ANTHROPIC_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Require authentication
    const authResult = await requireAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) {
      return authResult;
    }

    const body: RequestBody = await req.json();
    const { document_id, policy_id, document_type = "policy", use_azure_di = true } = body;

    if (!policy_id) throw new Error("policy_id is required");
    if (!document_id) throw new Error("document_id is required");

    console.log(`[extract-bap-policy] Starting extraction for policy ${policy_id}`);

    // Create job record
    const { data: jobData } = await supabase
      .from("policy_bap_extraction_jobs")
      .insert({ policy_id, document_id, status: "pending", llm_model: "claude-haiku-4-5-20251001" })
      .select("id")
      .single();
    if (jobData) jobId = jobData.id;

    // Get document
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("*, file_path, ocr_text")
      .eq("id", document_id)
      .single();
    if (docError) throw docError;

    let evidenceCatalog: EvidenceCatalog | null = null;

    // Use Azure DI if available
    if (use_azure_di && azureEndpoint && azureKey && doc.file_path) {
      console.log("[extract-bap-policy] Using Azure Document Intelligence");

      if (jobId) {
        await supabase.from("policy_bap_extraction_jobs")
          .update({ status: "ocr_processing", ocr_started_at: new Date().toISOString() })
          .eq("id", jobId);
      }

      const { data: signedUrl } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.file_path, 3600);

      if (!signedUrl?.signedUrl) throw new Error("Failed to get signed URL");

      const ocrStart = Date.now();
      const azureResult = await callAzureDocumentIntelligence(signedUrl.signedUrl, azureEndpoint, azureKey);
      const ocrTime = Date.now() - ocrStart;

      console.log(`[extract-bap-policy] Azure DI completed in ${ocrTime}ms`);

      evidenceCatalog = buildEvidenceCatalog(azureResult);

      console.log(`[extract-bap-policy] Evidence catalog: ${evidenceCatalog.stats.totalEntries} entries`);

      if (jobId) {
        await supabase.from("policy_bap_extraction_jobs")
          .update({
            status: "extracting",
            ocr_completed_at: new Date().toISOString(),
            extraction_started_at: new Date().toISOString(),
            azure_processing_time_ms: ocrTime,
          })
          .eq("id", jobId);
      }

      // Store evidence catalog
      await supabase.from("policy_bap_evidence_catalog").upsert({
        policy_id,
        document_id,
        evidence_entries: evidenceCatalog.entries,
        evidence_by_field: evidenceCatalog.byBAPField,
        azure_avg_confidence: evidenceCatalog.stats.avgConfidence,
        azure_page_count: evidenceCatalog.stats.pageCount,
        total_entries: evidenceCatalog.stats.totalEntries,
      }, { onConflict: "policy_id" });
    }

    // Build LLM prompt
    let userPrompt = `## Document Type: ${document_type.toUpperCase()}\n\n`;
    if (evidenceCatalog) {
      userPrompt += formatEvidenceForPrompt(evidenceCatalog);
    } else if (doc.ocr_text) {
      userPrompt += `## Document Content\n\`\`\`\n${doc.ocr_text}\n\`\`\`\n`;
    } else {
      throw new Error("No document content available");
    }
    userPrompt += `\n## Extraction Task\nExtract the Commercial Auto policy details and return them by calling the ${BAP_EXTRACTION_TOOL_NAME} tool.\nCite evidence IDs for every value; return null for anything not present in the catalog.\nDo not extract premium. Capture blanket AI / waiver of subrogation as evidence only.\n`;

    console.log(`[extract-bap-policy] Calling Claude...`);

    const llmStart = Date.now();
    // Claude tool-use / structured output. `tools` + `tool_choice` are passed
    // through the boundary wrapper unchanged, so redactPII still redacts the
    // user prompt (evidence catalog) before it leaves the process. The wrapper
    // needed NO change: it JSON-round-trips and recursively redacts the whole
    // body, and our schema strings carry no PII.
    const response = await anthropicBoundaryCreate(anthropicApiKey, {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8000,
      system: BAP_EXTRACTION_SYSTEM_PROMPT,
      tools: [
        {
          name: BAP_EXTRACTION_TOOL_NAME,
          description: "Emit the structured Commercial Auto (BAP) extraction. Every value must be backed by evidence IDs from the catalog; return null for anything not present.",
          input_schema: BAP_EXTRACTION_TOOL_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: BAP_EXTRACTION_TOOL_NAME },
      messages: [{ role: "user", content: userPrompt }],
    });
    const llmTime = Date.now() - llmStart;

    console.log(`[extract-bap-policy] Claude completed in ${llmTime}ms`);

    // Read the tool_use block from the response content (order-independent).
    const contentBlocks = (response.content ?? []) as Array<Record<string, any>>;
    const toolBlock = contentBlocks.find(
      (b) => b?.type === "tool_use" && b?.name === BAP_EXTRACTION_TOOL_NAME,
    );
    if (!toolBlock || !toolBlock.input || typeof toolBlock.input !== "object") {
      throw new Error("Claude did not return the expected tool_use extraction block");
    }

    // Keep the redaction guard: a model shown redacted text echoes tokens like
    // "[REDACTED_DOB]" into structured output; nullify pure-token strings.
    const rawExtraction = nullifyRedactedTokens(toolBlock.input) as RawBapExtraction;

    // Shape into the EXACT bap_details paths + flat-dotted bap_field_evidence
    // that get_master_coi / coi_build_line read.
    const nowIso = new Date().toISOString();
    const { bapDetails, fieldEvidence } = shapeBapDetails(rawExtraction, nowIso);

    // Update policy (scalar columns written to `policies` are unchanged).
    await supabase.from("policies").update({
      bap_details: bapDetails,
      bap_field_evidence: fieldEvidence,
      extraction_source: "azure_di_claude",
      extraction_confidence: bapDetails.extraction_confidence,
      extracted_from_document_id: document_id,
    }).eq("id", policy_id);

    let vehiclesCount = 0, driversCount = 0, coveragesCount = 0, interestsCount = 0;

    // Child tables: DELETE-then-INSERT, only when the extraction produced rows.
    const vehicleRows = shapeVehicleRows(rawExtraction).map((r) => ({ ...r, policy_id }));
    if (vehicleRows.length > 0) {
      await supabase.from("policy_bap_vehicles").delete().eq("policy_id", policy_id);
      const { error } = await supabase.from("policy_bap_vehicles").insert(vehicleRows);
      if (!error) vehiclesCount = vehicleRows.length;
      else console.error("[extract-bap-policy] vehicles insert error:", error.message);
    }

    const driverRows = shapeDriverRows(rawExtraction).map((r) => ({ ...r, policy_id }));
    if (driverRows.length > 0) {
      await supabase.from("policy_bap_drivers").delete().eq("policy_id", policy_id);
      const { error } = await supabase.from("policy_bap_drivers").insert(driverRows);
      if (!error) driversCount = driverRows.length;
      else console.error("[extract-bap-policy] drivers insert error:", error.message);
    }

    const coverageRows = shapeCoverageRows(rawExtraction).map((r) => ({ ...r, policy_id }));
    if (coverageRows.length > 0) {
      await supabase.from("policy_bap_coverages").delete().eq("policy_id", policy_id);
      const { error } = await supabase.from("policy_bap_coverages").insert(coverageRows);
      if (!error) coveragesCount = coverageRows.length;
      else console.error("[extract-bap-policy] coverages insert error:", error.message);
    }

    const interestRows = shapeInterestRows(rawExtraction).map((r) => ({ ...r, policy_id }));
    if (interestRows.length > 0) {
      await supabase.from("policy_bap_interests").delete().eq("policy_id", policy_id);
      const { error } = await supabase.from("policy_bap_interests").insert(interestRows);
      if (!error) interestsCount = interestRows.length;
      else console.error("[extract-bap-policy] interests insert error:", error.message);
    }

    // Update job as completed
    if (jobId) {
      const usage = (response as any).usage;
      await supabase.from("policy_bap_extraction_jobs").update({
        status: "completed",
        extraction_completed_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        llm_tokens_input: usage?.input_tokens,
        llm_tokens_output: usage?.output_tokens,
        llm_latency_ms: llmTime,
        vehicles_extracted: vehiclesCount,
        drivers_extracted: driversCount,
        coverages_extracted: coveragesCount,
        interests_extracted: interestsCount,
        overall_confidence: bapDetails.extraction_confidence,
      }).eq("id", jobId);
    }

    console.log(`[extract-bap-policy] Success for policy ${policy_id}`);

    return new Response(JSON.stringify({
      success: true,
      policy_id,
      job_id: jobId,
      extraction_method: evidenceCatalog ? "azure_di_claude" : "ocr_text_claude",
      evidence_entries: evidenceCatalog?.stats.totalEntries || 0,
      vehicles_count: vehiclesCount,
      drivers_count: driversCount,
      coverages_count: coveragesCount,
      interests_count: interestsCount,
      processing_time_ms: Date.now() - jobStartTime,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("[extract-bap-policy] Error:", error);

    if (jobId) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await supabase.from("policy_bap_extraction_jobs").update({
        status: "failed",
        error_message: error.message,
        completed_at: new Date().toISOString(),
      }).eq("id", jobId);
    }

    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
