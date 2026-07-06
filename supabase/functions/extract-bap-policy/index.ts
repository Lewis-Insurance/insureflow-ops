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
import { anthropicBoundaryCreate, anthropicResponseText } from '../_shared/modelBoundaryFetch.ts';
import { requireAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

// =============================================================================
// BAP EXTRACTION SYSTEM PROMPT
// =============================================================================

const BAP_EXTRACTION_SYSTEM_PROMPT = `You are an expert Commercial Auto insurance document analyst.

## CRITICAL RULES
1. **ONLY extract values that exist in the evidence catalog provided**
2. **NEVER guess or infer values** - if evidence is not found, return NOT_FOUND
3. **ALWAYS cite evidence IDs** for every extracted value
4. **NEVER fabricate evidence IDs** - only use IDs from the catalog

## Commercial Auto Fields to Extract

### Policy Identity
- carrier_name, carrier_naic (5-digit), policy_number
- transaction_type (quote/bound/issued/renewal/endorsement/cancel)
- named_insured, dba, fein
- mailing_address (street, city, state, zip)
- primary_garaging_address

### Dates
- effective_date, expiration_date, issue_date (YYYY-MM-DD format)

### Coverage Structure (CRITICAL - capture symbols!)
For each coverage line:
- coverage_name
- symbols (1-9, 19) - ESSENTIAL
- limit (CSL or split: bi_per_person, bi_per_accident, pd)
- deductible

Symbol Reference:
- 1 = Any Auto, 2 = Owned Autos, 7 = Specifically Described, 8 = Hired, 9 = Non-Owned

### Vehicles (Extract ALL)
For each: unit_number, vin (17 chars), year, make, model, body_type, gvw, use_type, garaging_zip/state, comp_ded, coll_ded

### Drivers (Extract ALL)
For each: name, dob, license_number/state, relationship, driver_type (rated/excluded/occasional), mvr_status

### Additional Interests
For each: name, address, interest_type (additional_insured/loss_payee/lienholder/lessor), vehicle_vins

### Premium
- total_premium, liability_premium, physical_damage_premium, um_uim_premium, hired_non_owned_premium
- policy_fee, state_taxes, deposit_premium

## Output Format
{
  "fields": {
    "field_name": {
      "value": "...",
      "evidence_ids": ["E0001"],
      "confidence": 0.95,
      "status": "AUTO_APPLIED|NEEDS_REVIEW|LOW_CONFIDENCE|NOT_FOUND"
    }
  },
  "coverages": [...],
  "vehicles": [...],
  "drivers": [...],
  "additional_interests": [...],
  "premium": {...},
  "extraction_confidence": 0.0-1.0
}

## Confidence Guidelines
- 0.95+: AUTO_APPLIED
- 0.80-0.94: NEEDS_REVIEW
- 0.70-0.79: NEEDS_VERIFICATION
- <0.70: LOW_CONFIDENCE
- No evidence: NOT_FOUND`;

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
  TotalPremium: [/total\s*premium/i, /annual\s*premium/i],
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
      .insert({ policy_id, document_id, status: "pending", llm_model: "claude-sonnet-5" })
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
    userPrompt += `\n## Extraction Task\nExtract ALL Commercial Auto policy details.\nCite evidence IDs for every field.\n`;

    console.log(`[extract-bap-policy] Calling Claude...`);

    const llmStart = Date.now();
    const response = await anthropicBoundaryCreate(anthropicApiKey, {
      model: "claude-sonnet-5",
      max_tokens: 8000,
      system: BAP_EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });
    const llmTime = Date.now() - llmStart;

    console.log(`[extract-bap-policy] Claude completed in ${llmTime}ms`);

    // Parse response
    const responseText = anthropicResponseText(response);
    let bapDetails: any;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) bapDetails = JSON.parse(jsonMatch[0]);
      else throw new Error("No JSON found");
    } catch {
      throw new Error("Failed to parse extraction response");
    }

    bapDetails.extraction_source = "azure_di_claude";
    bapDetails.extracted_at = new Date().toISOString();

    // Build field evidence mapping
    const fieldEvidence: Record<string, string[]> = {};
    if (bapDetails.fields) {
      for (const [name, data] of Object.entries(bapDetails.fields as Record<string, any>)) {
        if (data?.evidence_ids) fieldEvidence[name] = data.evidence_ids;
      }
    }

    // Update policy
    await supabase.from("policies").update({
      bap_details: bapDetails,
      bap_field_evidence: fieldEvidence,
      extraction_source: "azure_di_claude",
      extraction_confidence: bapDetails.extraction_confidence,
      extracted_from_document_id: document_id,
    }).eq("id", policy_id);

    let vehiclesCount = 0, driversCount = 0, coveragesCount = 0, interestsCount = 0;

    // Insert vehicles
    if (bapDetails.vehicles?.length > 0) {
      await supabase.from("policy_bap_vehicles").delete().eq("policy_id", policy_id);
      const rows = bapDetails.vehicles.map((v: any) => ({
        policy_id,
        unit_number: v.unit_number,
        vin: v.vin,
        year: v.year,
        make: v.make,
        model: v.model,
        body_type: v.body_type,
        gvw: v.gvw,
        use_type: v.use_type,
        garaging_zip: v.garaging_zip,
        garaging_state: v.garaging_state,
        cost_new: v.cost_new,
        stated_amount: v.stated_amount,
        comprehensive_deductible: v.comprehensive_deductible || v.comp_deductible,
        collision_deductible: v.collision_deductible || v.coll_deductible,
        special_equipment_coverage: v.special_equipment_coverage,
        primary_driver_name: v.primary_driver_name,
        evidence_ids: v.evidence_ids || [],
        extraction_confidence: v.confidence,
        extraction_status: v.status || "AUTO_APPLIED",
      }));
      const { error } = await supabase.from("policy_bap_vehicles").insert(rows);
      if (!error) vehiclesCount = rows.length;
    }

    // Insert drivers
    if (bapDetails.drivers?.length > 0) {
      await supabase.from("policy_bap_drivers").delete().eq("policy_id", policy_id);
      const rows = bapDetails.drivers.map((d: any) => ({
        policy_id,
        name: d.name,
        date_of_birth: d.date_of_birth || d.dob,
        license_number: d.license_number,
        license_state: d.license_state,
        relationship: d.relationship,
        driver_type: d.driver_type,
        violations_points: d.violations_points,
        accidents_count: d.accidents_count,
        mvr_status: d.mvr_status,
        sr22_required: d.sr22_required,
        evidence_ids: d.evidence_ids || [],
        extraction_confidence: d.confidence,
        extraction_status: d.status || "AUTO_APPLIED",
      }));
      const { error } = await supabase.from("policy_bap_drivers").insert(rows);
      if (!error) driversCount = rows.length;
    }

    // Insert coverages
    if (bapDetails.coverages?.length > 0) {
      await supabase.from("policy_bap_coverages").delete().eq("policy_id", policy_id);
      const rows = bapDetails.coverages.map((c: any) => ({
        policy_id,
        coverage_name: c.coverage_name,
        coverage_type: c.coverage_type || "other",
        symbols: c.symbols || [],
        limit_amount: c.limit || c.limit_amount,
        limit_type: c.limit_type,
        bi_per_person: c.bi_per_person,
        bi_per_accident: c.bi_per_accident,
        pd_per_accident: c.pd_per_accident || c.property_damage,
        deductible: c.deductible,
        is_stacked: c.is_stacked,
        is_rejected: c.is_rejected,
        evidence_ids: c.evidence_ids || [],
        extraction_confidence: c.confidence,
        extraction_status: c.status || "AUTO_APPLIED",
      }));
      const { error } = await supabase.from("policy_bap_coverages").insert(rows);
      if (!error) coveragesCount = rows.length;
    }

    // Insert additional interests
    if (bapDetails.additional_interests?.length > 0) {
      await supabase.from("policy_bap_interests").delete().eq("policy_id", policy_id);
      const rows = bapDetails.additional_interests.map((i: any) => ({
        policy_id,
        name: i.name,
        address_street: i.address?.street,
        address_city: i.address?.city,
        address_state: i.address?.state,
        address_zip: i.address?.zip,
        interest_type: i.interest_type || "additional_interest",
        vehicle_vins: i.vehicle_vins || [],
        evidence_ids: i.evidence_ids || [],
        extraction_confidence: i.confidence,
        extraction_status: i.status || "AUTO_APPLIED",
      }));
      const { error } = await supabase.from("policy_bap_interests").insert(rows);
      if (!error) interestsCount = rows.length;
    }

    // Update job as completed
    if (jobId) {
      await supabase.from("policy_bap_extraction_jobs").update({
        status: "completed",
        extraction_completed_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        llm_tokens_input: response.usage?.input_tokens,
        llm_tokens_output: response.usage?.output_tokens,
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
