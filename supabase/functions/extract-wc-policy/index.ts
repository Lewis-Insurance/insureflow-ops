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
import { requireAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

// =============================================================================
// WC EXTRACTION SYSTEM PROMPT - Evidence-Based
// =============================================================================

const WC_EXTRACTION_SYSTEM_PROMPT = `You are an expert Workers' Compensation insurance document analyst.

## CRITICAL RULES
1. **ONLY extract values that exist in the evidence catalog provided**
2. **NEVER guess or infer values** - if evidence is not found, return NOT_FOUND
3. **ALWAYS cite evidence IDs** for every extracted value
4. **NEVER fabricate evidence IDs** - only use IDs from the catalog

## Workers' Compensation Fields to Extract

### Policy Identity
- carrier_name, carrier_naic (5-digit), policy_number, status
- named_insured, dba, fein (XX-XXXXXXX format)
- mailing_address (street, city, state, zip)
- producer, agency

### Dates
- effective_date, expiration_date, issue_date (YYYY-MM-DD format)
- policy_term

### Coverage
- policy_type (standard, assigned_risk, peo, ghost)
- item_3a_states (states of operation)
- item_3c_states (other states)
- employers_liability: each_accident, disease_each_employee, disease_policy_limit
- deductible (type, amount)

### Experience Rating (CRITICAL)
- experience_mod: Format as decimal (0.850 for 15% credit, 1.150 for 15% debit)
- experience_mod_effective_date
- rating_bureau (NCCI, WCIRB, etc.)
- schedule_rating_percent, merit_rating_percent
- premium_discount

### Classifications (Extract ALL rows)
For each: state, class_code (4 digits), description, estimated_payroll, rate, premium, is_governing_class

### Premium
- estimated_annual_premium, wc_premium_subtotal
- expense_constant, state_assessments, terrorism_charge
- deposit_premium, payment_plan

### Officer/Owner Elections (VERY IMPORTANT)
For each: name, title, ownership_percent, included (true/false), annual_remuneration, duties

## Output Format
Return JSON with this structure:
{
  "fields": {
    "field_name": {
      "value": "extracted value",
      "evidence_ids": ["E0001", "E0002"],
      "confidence": 0.95,
      "status": "AUTO_APPLIED|NEEDS_REVIEW|LOW_CONFIDENCE|NOT_FOUND",
      "reasoning": "why this value was selected"
    }
  },
  "classifications": [...],
  "officers": [...],
  "covered_states": [...],
  "experience_rating": {...},
  "extraction_confidence": 0.0-1.0
}

## Confidence Guidelines
- 0.95+: Strong evidence, clear value, format-valid → AUTO_APPLIED
- 0.80-0.94: Good evidence, minor uncertainty → NEEDS_REVIEW
- 0.70-0.79: Plausible but uncertain → NEEDS_VERIFICATION
- <0.70: Weak evidence → LOW_CONFIDENCE
- No evidence found → NOT_FOUND (value should be null)`;

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
        azure_model_id: "prebuilt-document",
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

    userPrompt += `\n## Extraction Task\nExtract ALL Workers' Compensation policy details from the evidence above.\n`;
    userPrompt += `CRITICAL: Only use values from the evidence catalog. Cite evidence IDs for every field.\n`;
    userPrompt += `Return a complete JSON object with all WC fields, classifications, officers, and experience rating.`;

    console.log(`[extract-wc-policy] Calling Claude for extraction...`);

    const llmStartTime = Date.now();
    const response = await anthropicBoundaryCreate(anthropicApiKey, {
      model: "claude-sonnet-5",
      max_tokens: 8000,
      system: WC_EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const llmTime = Date.now() - llmStartTime;
    console.log(`[extract-wc-policy] Claude completed in ${llmTime}ms`);

    // Parse response
    const responseText = response.content[0].type === "text" ? response.content[0].text : "";
    let wcDetails: any;

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        wcDetails = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("[extract-wc-policy] Failed to parse response:", parseError);
      throw new Error("Failed to parse extraction response");
    }

    // Add metadata
    wcDetails.extraction_source = "azure_di_claude";
    wcDetails.extracted_at = new Date().toISOString();
    wcDetails.evidence_catalog_id = policy_id;

    // Build field-level evidence mapping
    const fieldEvidence: Record<string, string[]> = {};
    if (wcDetails.fields) {
      for (const [fieldName, fieldData] of Object.entries(wcDetails.fields as Record<string, any>)) {
        if (fieldData?.evidence_ids) {
          fieldEvidence[fieldName] = fieldData.evidence_ids;
        }
      }
    }

    // Update policy with WC details
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

    // Count extracted items
    let classificationsCount = 0;
    let officersCount = 0;
    let statesCount = 0;

    // Insert classifications with evidence
    if (wcDetails.classifications && wcDetails.classifications.length > 0) {
      await supabase
        .from("policy_wc_classifications")
        .delete()
        .eq("policy_id", policy_id);

      const rows = wcDetails.classifications.map((c: any) => ({
        policy_id,
        state: c.state,
        class_code: c.class_code,
        description: c.description,
        exposure_basis: c.exposure_basis || "payroll",
        estimated_payroll: c.estimated_payroll,
        rate: c.rate,
        premium: c.premium,
        is_governing_class: c.is_governing_class || false,
        is_standard_exception: c.is_standard_exception || false,
        evidence_ids: c.evidence_ids || [],
        extraction_confidence: c.confidence,
        extraction_status: c.status || "AUTO_APPLIED",
      }));

      const { error: classError } = await supabase
        .from("policy_wc_classifications")
        .insert(rows);

      if (!classError) {
        classificationsCount = rows.length;
      }
    }

    // Insert officers with evidence
    if (wcDetails.officers && wcDetails.officers.length > 0) {
      await supabase
        .from("policy_wc_officers")
        .delete()
        .eq("policy_id", policy_id);

      const rows = wcDetails.officers.map((o: any) => ({
        policy_id,
        name: o.name,
        title: o.title,
        ownership_percent: o.ownership_percent,
        is_included: o.included,
        annual_remuneration: o.annual_remuneration,
        duties: o.duties,
        officer_type: o.type || "officer",
        evidence_ids: o.evidence_ids || [],
        extraction_confidence: o.confidence,
        extraction_status: o.status || "AUTO_APPLIED",
      }));

      const { error: officerError } = await supabase
        .from("policy_wc_officers")
        .insert(rows);

      if (!officerError) {
        officersCount = rows.length;
      }
    }

    // Insert covered states
    if (wcDetails.covered_states && wcDetails.covered_states.length > 0) {
      await supabase
        .from("policy_wc_states")
        .delete()
        .eq("policy_id", policy_id);

      const rows = wcDetails.covered_states.map((s: any) => ({
        policy_id,
        state: s.state,
        coverage_type: s.type || "item_3a",
        is_monopolistic: s.is_monopolistic || false,
        evidence_ids: s.evidence_ids || [],
        extraction_confidence: s.confidence,
        extraction_status: s.status || "AUTO_APPLIED",
      }));

      const { error: stateError } = await supabase
        .from("policy_wc_states")
        .insert(rows);

      if (!stateError) {
        statesCount = rows.length;
      }
    }

    // Insert experience mod
    if (wcDetails.experience_rating?.experience_mod) {
      const er = wcDetails.experience_rating;
      await supabase.from("policy_wc_experience_mods").insert({
        policy_id,
        experience_mod: er.experience_mod,
        effective_date: er.experience_mod_effective_date,
        rating_bureau: er.rating_bureau || "NCCI",
        schedule_rating_percent: er.schedule_rating_percent,
        schedule_rating_type: er.schedule_rating_type,
        evidence_ids: er.evidence_ids || [],
        extraction_confidence: er.confidence,
        extraction_status: er.status || "AUTO_APPLIED",
      });
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
