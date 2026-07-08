/**
 * Workers' Compensation Policy Extraction Edge Function
 *
 * UPGRADED VERSION - Uses Azure Document Intelligence for OCR
 * and builds evidence catalogs for click-to-highlight support.
 *
 * Flow:
 * 1. Fetch document from storage
 * 2. Call Azure Document Intelligence for OCR
 * 3. Build evidence catalog with WC-specific field patterns
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
  WC_EXTRACTION_TOOL_NAME,
  WC_EXTRACTION_TOOL_SCHEMA,
  shapeWcDetails,
  shapeClassificationRows,
  shapeOfficerRows,
  shapeStateRows,
  shapeExperienceModRows,
  shapeSubrogationWaiverRows,
  type RawWcExtraction,
} from './shape.ts';

// =============================================================================
// WC EXTRACTION SYSTEM PROMPT - Evidence-Based
// =============================================================================

const WC_EXTRACTION_SYSTEM_PROMPT = `You are an expert Workers' Compensation insurance document analyst.

You MUST return your extraction by calling the ${WC_EXTRACTION_TOOL_NAME} tool. Do not answer in prose.

## CRITICAL RULES
1. ONLY extract values that appear in the evidence catalog provided. Cite the evidence IDs (E####) that support each value in that field's evidence_ids array.
2. NEVER guess or infer. If a value is not in the evidence, return null for that field.
3. NEVER fabricate an evidence ID — only use IDs that appear in the catalog.

## Coverage (this drives the ACORD 25 Workers Comp section — get it right)
- coverage.part_one_wc: "statutory" when Part One (Workers Compensation) provides statutory benefits (this checks the ACORD 25 "PER STATUTE" box); "other" otherwise. null if not shown.
- coverage.part_two_employers_liability: the three Employers Liability limits printed on the certificate —
    each_accident            (E.L. EACH ACCIDENT)
    disease_each_employee    (E.L. DISEASE - EA EMPLOYEE)
    disease_policy_limit     (E.L. DISEASE - POLICY LIMIT)

## Officer / Owner Elections (drives ANY PROPRIETOR EXCLUDED)
- For each officer/owner: name, title, ownership_percent, included, annual_remuneration, duties, type.
- included=false means that officer/owner is EXCLUDED from coverage. Only set included=false when the document clearly shows an exclusion; otherwise set included=true (default). Never invent an exclusion.

## Classifications & States
- classifications: state, class_code, description, exposure_basis, estimated_payroll, is_governing_class, is_standard_exception. Do NOT extract rate or premium.
- covered_states: state + type (item_3a for Item 3.A. states of operation, item_3c for Item 3.C. other states, monopolistic). Do NOT extract state premium.

## Experience Rating
- experience_mods: experience_mod (decimal, 0.850 = 15% credit / 1.150 = 15% debit) and effective_date (YYYY-MM-DD) are BOTH required for a row; also rating_bureau, schedule_rating_percent, schedule_rating_type (credit/debit).

## Waiver of Subrogation (WC has NO Additional Insured concept — SUBR WVD is the only holder flag)
- subrogation_waivers: named/scheduled waivers where a specific organization or person is waived in favor of (name required).
- waiver_of_subrogation_evidence: evidence of a BLANKET waiver endorsement (e.g. WC 00 03 13). Capture present, basis (blanket|scheduled), form_numbers, source_span. Do NOT assert a specific holder "Y".

## Insurer NAIC
- carrier_naic is the 5-digit INSURER (company) NAIC code. It is NOT an industry NAICS or SIC classification code. If the insurer's NAIC number is not clearly shown, return null — a name-to-NAIC lookup happens later.

## Premium
- Do NOT extract premium, fees, taxes, rate, or any dollar amount that is not a coverage/EL limit. Premium is never captured.

## Confidence
- Set each field's confidence 0-1 and status (AUTO_APPLIED for strong evidence, NEEDS_REVIEW / LOW_CONFIDENCE otherwise). Set extraction_confidence to the overall 0-1 confidence.`;

// =============================================================================
// TYPES
// =============================================================================

interface RequestBody {
  document_id: string;
  policy_id: string;
  document_type?: 'application' | 'quote' | 'binder' | 'policy' | 'endorsement';
  use_azure_di?: boolean; // Flag to enable Azure DI (default true)
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
    x: number;
    y: number;
    width: number;
    height: number;
    pageWidth: number;
    pageHeight: number;
  } | null;
  tableContext?: {
    tableIndex: number;
    rowIndex: number;
    columnIndex: number;
    columnHeader?: string;
    rowHeader?: string;
  };
  tags: string[];
}

interface EvidenceCatalog {
  entries: Record<string, EvidenceEntry>;
  byWCField: Record<string, string[]>;
  stats: {
    totalEntries: number;
    avgConfidence: number;
    pageCount: number;
  };
}

// =============================================================================
// WC FIELD PATTERNS
// =============================================================================

const WC_FIELD_PATTERNS: Record<string, RegExp[]> = {
  CarrierNAIC: [/naic/i, /\b\d{5}\b/],
  FEIN: [/fein/i, /federal.*id/i, /ein/i, /\d{2}-\d{7}/],
  NamedInsured: [/named.*insured/i, /insured.*name/i, /employer.*name/i],
  ExperienceMod: [/experience.*mod/i, /x-?mod/i, /e\.?m\.?r\.?/i],
  ClassCode: [/class.*code/i, /classification/i],
  EstimatedPayroll: [/payroll/i, /remuneration/i],
  ClassRate: [/rate/i, /rate.*\$100/i],
  EachAccidentLimit: [/each.*accident/i],
  DiseaseEachEmployee: [/disease.*employee/i],
  DiseasePolicyLimit: [/disease.*policy/i, /disease.*aggregate/i],
  TotalPremium: [/total.*premium/i, /annual.*premium/i],
  OfficerIncluded: [/included/i, /covered/i],
  OfficerExcluded: [/excluded/i, /not.*covered/i, /waived/i],
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

  // Start analysis
  const analyzeResponse = await fetch(analyzeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": azureKey,
    },
    body: JSON.stringify({ urlSource: documentUrl }),
  });

  if (!analyzeResponse.ok) {
    const error = await analyzeResponse.text();
    throw new Error(`Azure DI analyze failed: ${error}`);
  }

  // Get operation location for polling
  const operationLocation = analyzeResponse.headers.get("Operation-Location");
  if (!operationLocation) {
    throw new Error("No operation location returned from Azure DI");
  }

  // Poll for results
  let result = null;
  let attempts = 0;
  const maxAttempts = 30;

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const statusResponse = await fetch(operationLocation, {
      headers: { "Ocp-Apim-Subscription-Key": azureKey },
    });

    const statusData = await statusResponse.json();

    if (statusData.status === "succeeded") {
      result = statusData.analyzeResult;
      break;
    } else if (statusData.status === "failed") {
      throw new Error(`Azure DI analysis failed: ${statusData.error?.message || "Unknown error"}`);
    }

    attempts++;
  }

  if (!result) {
    throw new Error("Azure DI analysis timed out");
  }

  return result;
}

// =============================================================================
// EVIDENCE CATALOG BUILDER
// =============================================================================

function buildEvidenceCatalog(azureResult: any): EvidenceCatalog {
  const entries: Record<string, EvidenceEntry> = {};
  let evidenceCounter = 0;
  const pageInfo: Map<number, { width: number; height: number }> = new Map();

  // Extract page dimensions
  for (const page of azureResult.pages || []) {
    pageInfo.set(page.pageNumber, { width: page.width, height: page.height });
  }

  const generateId = () => {
    evidenceCounter++;
    return `E${String(evidenceCounter).padStart(4, "0")}`;
  };

  const polygonToBbox = (polygon: number[] | undefined, pageNum: number) => {
    if (!polygon || polygon.length < 8) return null;
    const info = pageInfo.get(pageNum);
    if (!info) return null;

    const xs = [polygon[0], polygon[2], polygon[4], polygon[6]];
    const ys = [polygon[1], polygon[3], polygon[5], polygon[7]];
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      pageWidth: info.width,
      pageHeight: info.height,
    };
  };

  const inferTags = (label: string, value: string): string[] => {
    const tags: string[] = [];
    for (const [fieldName, patterns] of Object.entries(WC_FIELD_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(label) || pattern.test(value)) {
          tags.push(fieldName);
          break;
        }
      }
    }
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

  // Process tables
  for (let tableIdx = 0; tableIdx < (azureResult.tables || []).length; tableIdx++) {
    const table = azureResult.tables[tableIdx];
    const columnHeaders: Record<number, string> = {};

    // Build header map
    for (const cell of table.cells) {
      if (cell.kind === "columnHeader") {
        columnHeaders[cell.columnIndex] = cell.content;
      }
    }

    // Process content cells
    for (const cell of table.cells) {
      if (cell.kind !== "content" || !cell.content?.trim()) continue;

      const pageNum = cell.boundingRegions?.[0]?.pageNumber || 1;
      const id = generateId();
      const header = columnHeaders[cell.columnIndex] || "";

      entries[id] = {
        evidenceId: id,
        sourceType: "table_cell",
        label: header || null,
        value: cell.content.trim(),
        normalizedValue: cell.content.trim(),
        confidence: cell.confidence || 0.85,
        pageNumber: pageNum,
        boundingBox: polygonToBbox(cell.boundingRegions?.[0]?.polygon, pageNum),
        tableContext: {
          tableIndex: tableIdx,
          rowIndex: cell.rowIndex,
          columnIndex: cell.columnIndex,
          columnHeader: header,
        },
        tags: inferTags(header, cell.content),
      };
    }
  }

  // Build field index
  const byWCField: Record<string, string[]> = {};
  for (const [id, entry] of Object.entries(entries)) {
    for (const tag of entry.tags) {
      if (!byWCField[tag]) byWCField[tag] = [];
      byWCField[tag].push(id);
    }
  }

  const entryList = Object.values(entries);
  const avgConfidence = entryList.length > 0
    ? entryList.reduce((sum, e) => sum + e.confidence, 0) / entryList.length
    : 0;

  const pages = new Set(entryList.map((e) => e.pageNumber));

  return {
    entries,
    byWCField,
    stats: {
      totalEntries: entryList.length,
      avgConfidence,
      pageCount: pages.size,
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

  // Group by page
  const byPage: Record<number, EvidenceEntry[]> = {};
  for (const entry of Object.values(catalog.entries)) {
    if (!byPage[entry.pageNumber]) byPage[entry.pageNumber] = [];
    byPage[entry.pageNumber].push(entry);
  }

  for (const pageNum of Object.keys(byPage).map(Number).sort((a, b) => a - b)) {
    const pageEntries = byPage[pageNum];
    lines.push(`### Page ${pageNum}`);

    for (const entry of pageEntries) {
      const labelPart = entry.label ? `[${entry.label}]` : "";
      const confPart = `(${(entry.confidence * 100).toFixed(0)}%)`;
      const tagsPart = entry.tags.length > 0 ? ` {${entry.tags.join(", ")}}` : "";
      const valueTrunc = entry.value.length > 100 ? entry.value.substring(0, 100) + "..." : entry.value;

      lines.push(`- **${entry.evidenceId}** ${labelPart}: "${valueTrunc}" ${confPart}${tagsPart}`);
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
    const {
      document_id,
      policy_id,
      document_type = "policy",
      use_azure_di = true,
    } = body;

    if (!policy_id) throw new Error("policy_id is required");
    if (!document_id) throw new Error("document_id is required");

    console.log(`[extract-wc-policy] Starting extraction for policy ${policy_id}, document ${document_id}`);

    // Create extraction job record
    const { data: jobData, error: jobError } = await supabase
      .from("policy_wc_extraction_jobs")
      .insert({
        policy_id,
        document_id,
        status: "pending",
        // The OCR call uses the prebuilt-layout model (see callAzureDocumentIntelligence);
        // record that exact model id, not the stale 'prebuilt-document' label.
        azure_model_id: "prebuilt-layout",
        llm_model: "claude-sonnet-5",
      })
      .select("id")
      .single();

    if (jobError) {
      console.warn("Failed to create job record:", jobError);
    } else {
      jobId = jobData.id;
    }

    // Get document info
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("*, file_path, ocr_text")
      .eq("id", document_id)
      .single();

    if (docError) throw docError;

    let evidenceCatalog: EvidenceCatalog | null = null;
    let azureResult: any = null;

    // Use Azure Document Intelligence if available and enabled
    if (use_azure_di && azureEndpoint && azureKey && doc.file_path) {
      console.log("[extract-wc-policy] Using Azure Document Intelligence for OCR");

      // Update job status
      if (jobId) {
        await supabase
          .from("policy_wc_extraction_jobs")
          .update({ status: "ocr_processing", ocr_started_at: new Date().toISOString() })
          .eq("id", jobId);
      }

      // Get signed URL for document
      const { data: signedUrl, error: urlError } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.file_path, 3600);

      if (urlError || !signedUrl?.signedUrl) {
        throw new Error(`Failed to get signed URL: ${urlError?.message || "Unknown error"}`);
      }

      // Call Azure DI
      const ocrStartTime = Date.now();
      azureResult = await callAzureDocumentIntelligence(signedUrl.signedUrl, azureEndpoint, azureKey);
      const ocrTime = Date.now() - ocrStartTime;

      console.log(`[extract-wc-policy] Azure DI completed in ${ocrTime}ms`);

      // Build evidence catalog
      evidenceCatalog = buildEvidenceCatalog(azureResult);

      console.log(`[extract-wc-policy] Evidence catalog built: ${evidenceCatalog.stats.totalEntries} entries`);

      // Update job with OCR completion
      if (jobId) {
        await supabase
          .from("policy_wc_extraction_jobs")
          .update({
            status: "extracting",
            ocr_completed_at: new Date().toISOString(),
            extraction_started_at: new Date().toISOString(),
            azure_processing_time_ms: ocrTime,
          })
          .eq("id", jobId);
      }

      // Store evidence catalog
      await supabase.from("policy_wc_evidence_catalog").upsert({
        policy_id,
        document_id,
        evidence_entries: evidenceCatalog.entries,
        evidence_by_field: evidenceCatalog.byWCField,
        azure_raw_response: azureResult,
        azure_avg_confidence: evidenceCatalog.stats.avgConfidence,
        azure_page_count: evidenceCatalog.stats.pageCount,
        total_entries: evidenceCatalog.stats.totalEntries,
      }, {
        onConflict: "policy_id",
      });
    }

    // Build LLM prompt
    let userPrompt = `## Document Type: ${document_type.toUpperCase()}\n\n`;

    if (evidenceCatalog) {
      userPrompt += formatEvidenceForPrompt(evidenceCatalog);
    } else if (doc.ocr_text) {
      // Fallback to raw OCR text
      userPrompt += `## Document Content\n\`\`\`\n${doc.ocr_text}\n\`\`\`\n`;
    } else {
      throw new Error("No document content available for extraction");
    }

    userPrompt += `\n## Extraction Task\nExtract the Workers' Compensation policy details from the evidence above and return them by calling the ${WC_EXTRACTION_TOOL_NAME} tool.\n`;
    userPrompt += `Cite evidence IDs for every value; return null for anything not present in the catalog.\n`;
    userPrompt += `Do not extract premium, rate, fees, or taxes. Capture blanket waiver of subrogation as evidence only.\n`;

    console.log(`[extract-wc-policy] Calling Claude for extraction...`);

    const llmStartTime = Date.now();
    // Claude tool-use / structured output. `tools` + `tool_choice` are passed
    // through the boundary wrapper unchanged, so redactPII still redacts the user
    // prompt (evidence catalog) before it leaves the process. Same calling
    // convention as extract-bap-policy; no modelBoundaryFetch change needed.
    const response = await anthropicBoundaryCreate(anthropicApiKey, {
      model: "claude-sonnet-5",
      max_tokens: 8000,
      system: WC_EXTRACTION_SYSTEM_PROMPT,
      tools: [
        {
          name: WC_EXTRACTION_TOOL_NAME,
          description: "Emit the structured Workers' Compensation extraction. Every value must be backed by evidence IDs from the catalog; return null for anything not present.",
          input_schema: WC_EXTRACTION_TOOL_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: WC_EXTRACTION_TOOL_NAME },
      messages: [{ role: "user", content: userPrompt }],
    });

    const llmTime = Date.now() - llmStartTime;
    console.log(`[extract-wc-policy] Claude completed in ${llmTime}ms`);

    // Read the tool_use block from the response content (order-independent).
    const contentBlocks = (response.content ?? []) as Array<Record<string, any>>;
    const toolBlock = contentBlocks.find(
      (b) => b?.type === "tool_use" && b?.name === WC_EXTRACTION_TOOL_NAME,
    );
    if (!toolBlock || !toolBlock.input || typeof toolBlock.input !== "object") {
      throw new Error("Claude did not return the expected tool_use extraction block");
    }

    // Keep the redaction guard: a model shown redacted text echoes tokens like
    // "[REDACTED_DOB]" into structured output; nullify pure-token strings.
    const rawExtraction = nullifyRedactedTokens(toolBlock.input) as RawWcExtraction;

    // Shape into the EXACT wc_details paths + flat-dotted wc_field_evidence that
    // get_master_coi / coi_build_line read (migration 20260702172000, WC cells
    // L914-936). The three EL limits + part_one_wc are what the COI WC section needs.
    const nowIso = new Date().toISOString();
    const { wcDetails, fieldEvidence } = shapeWcDetails(rawExtraction, nowIso);

    // Update policy with WC details.
    const { error: updateError } = await supabase
      .from("policies")
      .update({
        wc_details: wcDetails,
        wc_field_evidence: fieldEvidence,
        extraction_source: "azure_di_claude",
        extraction_confidence: wcDetails.extraction_confidence,
        extracted_from_document_id: document_id,
      })
      .eq("id", policy_id);

    if (updateError) {
      console.error("[extract-wc-policy] Failed to update policy:", updateError);
      throw updateError;
    }

    // Child tables: DELETE-then-INSERT, only when the extraction produced rows.
    // Each shaper defends the DB CHECK / NOT NULL constraints so one bad row
    // cannot crash the batch. §NO-PREMIUM: no rate / premium / state_premium.
    let classificationsCount = 0;
    let officersCount = 0;
    let statesCount = 0;
    let experienceModsCount = 0;
    let subrogationWaiversCount = 0;

    const classificationRows = shapeClassificationRows(rawExtraction).map((r) => ({ ...r, policy_id }));
    if (classificationRows.length > 0) {
      await supabase.from("policy_wc_classifications").delete().eq("policy_id", policy_id);
      const { error } = await supabase.from("policy_wc_classifications").insert(classificationRows);
      if (!error) classificationsCount = classificationRows.length;
      else console.error("[extract-wc-policy] classifications insert error:", error.message);
    }

    // Officers drive "ANY PROPRIETOR EXCLUDED" via NOT bool_or(is_included) in the RPC.
    const officerRows = shapeOfficerRows(rawExtraction).map((r) => ({ ...r, policy_id }));
    if (officerRows.length > 0) {
      await supabase.from("policy_wc_officers").delete().eq("policy_id", policy_id);
      const { error } = await supabase.from("policy_wc_officers").insert(officerRows);
      if (!error) officersCount = officerRows.length;
      else console.error("[extract-wc-policy] officers insert error:", error.message);
    }

    const stateRows = shapeStateRows(rawExtraction).map((r) => ({ ...r, policy_id }));
    if (stateRows.length > 0) {
      await supabase.from("policy_wc_states").delete().eq("policy_id", policy_id);
      const { error } = await supabase.from("policy_wc_states").insert(stateRows);
      if (!error) statesCount = stateRows.length;
      else console.error("[extract-wc-policy] states insert error:", error.message);
    }

    // DEFECT FIX: experience mods now DELETE-then-INSERT like the other child
    // tables (was a bare insert that duplicated rows on every re-run).
    const experienceModRows = shapeExperienceModRows(rawExtraction).map((r) => ({ ...r, policy_id }));
    if (experienceModRows.length > 0) {
      await supabase.from("policy_wc_experience_mods").delete().eq("policy_id", policy_id);
      const { error } = await supabase.from("policy_wc_experience_mods").insert(experienceModRows);
      if (!error) experienceModsCount = experienceModRows.length;
      else console.error("[extract-wc-policy] experience mods insert error:", error.message);
    }

    // Waiver of subrogation (blanket + named/scheduled) -> policy_wc_subrogation_waivers.
    // WC has no Additional Insured column; SUBR WVD is the only holder flag. Rows are
    // written endorsement_status='requested' (never a fabricated 'endorsed'). The table's
    // agency_workspace_id is derived server-side by a BEFORE INSERT trigger.
    const waiverRows = shapeSubrogationWaiverRows(rawExtraction).map((r) => ({ ...r, policy_id }));
    if (waiverRows.length > 0) {
      await supabase.from("policy_wc_subrogation_waivers").delete().eq("policy_id", policy_id);
      const { error } = await supabase.from("policy_wc_subrogation_waivers").insert(waiverRows);
      if (!error) subrogationWaiversCount = waiverRows.length;
      else console.error("[extract-wc-policy] subrogation waivers insert error:", error.message);
    }

    // Update job as completed
    if (jobId) {
      const totalTime = Date.now() - jobStartTime;
      await supabase
        .from("policy_wc_extraction_jobs")
        .update({
          status: "completed",
          extraction_completed_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          llm_tokens_input: response.usage?.input_tokens,
          llm_tokens_output: response.usage?.output_tokens,
          llm_latency_ms: llmTime,
          classifications_extracted: classificationsCount,
          officers_extracted: officersCount,
          states_extracted: statesCount,
          overall_confidence: wcDetails.extraction_confidence,
        })
        .eq("id", jobId);
    }

    console.log(`[extract-wc-policy] Successfully extracted WC details for policy ${policy_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        policy_id,
        job_id: jobId,
        extraction_method: evidenceCatalog ? "azure_di_claude" : "ocr_text_claude",
        evidence_entries: evidenceCatalog?.stats.totalEntries || 0,
        wc_details: wcDetails,
        classifications_count: classificationsCount,
        officers_count: officersCount,
        states_count: statesCount,
        experience_mods_count: experienceModsCount,
        subrogation_waivers_count: subrogationWaiversCount,
        processing_time_ms: Date.now() - jobStartTime,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("[extract-wc-policy] Error:", error);

    // Update job as failed
    if (jobId) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await supabase
        .from("policy_wc_extraction_jobs")
        .update({
          status: "failed",
          error_message: error.message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
