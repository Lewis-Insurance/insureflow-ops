/**
 * Inland Marine Policy Extraction Edge Function
 *
 * Uses Azure Document Intelligence for OCR and builds evidence catalogs
 * for click-to-highlight support.
 *
 * Handles: Contractor's Equipment, Installation Floater, Motor Truck Cargo,
 * EDP, Valuable Papers, Signs, and other inland marine coverages.
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { anthropicBoundaryCreate } from '../_shared/modelBoundaryFetch.ts';
import { requireAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

// =============================================================================
// IM EXTRACTION SYSTEM PROMPT
// =============================================================================

const IM_EXTRACTION_SYSTEM_PROMPT = `You are an expert Commercial Inland Marine insurance document analyst.

## CRITICAL RULES
1. **ONLY extract values that exist in the evidence catalog provided**
2. **NEVER guess or infer values** - if evidence is not found, return NOT_FOUND
3. **ALWAYS cite evidence IDs** for every extracted value
4. **NEVER fabricate evidence IDs** - only use IDs from the catalog

## Inland Marine Fields to Extract

### Policy Identity
- carrier_name, policy_number, status
- named_insured (name, address, business_type)
- producer, agency

### Dates
- effective_date, expiration_date (YYYY-MM-DD format)

### Coverage Type
- subtypes: Array of IM subtypes (contractors_equipment, installation_floater, motor_truck_cargo, electronic_data_processing, valuable_papers, signs, accounts_receivable, fine_arts, musical_instruments, etc.)
- primary_subtype: Main coverage type
- valuation_basis: replacement_cost, actual_cash_value, agreed_value, stated_amount
- coverage_territory: continental_us, us_and_canada, worldwide, specified_radius
- radius_miles: If territory is radius-based

### Scheduled Items (CRITICAL - Extract ALL)
For each item on the schedule:
- item_id: Generate stable ID (ITEM-001, ITEM-002, etc.)
- description: Full description
- manufacturer, model, year
- serial_number or vin (CRITICAL for equipment identification)
- scheduled_value: Insured value
- valuation_basis: If different from policy default
- deductible: If item-specific
- primary_location: Where equipment is based
- loss_payee: Name, address, loan/lease number if applicable

### Blanket Coverages
For each blanket coverage:
- category: "Small Tools", "Rented Equipment", etc.
- blanket_limit
- per_item_limit: Maximum per item within blanket
- valuation_basis
- deductible

### Covered Locations
For each location:
- location_id, location_number
- name, address
- location_type: permanent, jobsite, storage, warehouse
- location_limit, deductible
- security_features: alarm, cameras, fenced, gps_tracking

### Deductibles
- standard_deductible
- theft_deductible (often higher)
- catastrophe_deductible, earthquake_deductible, flood_deductible
- named_storm_deductible (may be percentage)

### Coverage Extensions
- newly_acquired (limit, reporting_period_days)
- rental_reimbursement (daily_limit, max_days, waiting_period)
- extra_expense, debris_removal, pollutant_cleanup
- transit (limit, territory)
- leased_rented_equipment (limit, liability_included)
- employee_tools (per_employee_limit, aggregate)

### Additional Interests
For each loss payee/lienholder/lessor:
- interest_id, name, address
- interest_type: loss_payee, additional_insured, lienholder, lessor
- applies_to: all or specific item_ids
- loan_number, lease_number

### Endorsements (Flag High-Impact)
- endorsement_number, endorsement_name, form_number
- endorsement_type: coverage_extension, coverage_restriction, exclusion
- high_impact: true for theft limitations, mysterious disappearance exclusions

### Premium
- total_annual_premium
- scheduled_equipment_premium, blanket_coverage_premium, extensions_premium
- minimum_earned_premium, deposit_premium

## Output Format
Return JSON with this structure:
{
  "fields": {
    "field_name": {
      "value": "extracted value",
      "evidence_ids": ["E0001"],
      "confidence": 0.95,
      "status": "AUTO_APPLIED|NEEDS_REVIEW|LOW_CONFIDENCE|NOT_FOUND"
    }
  },
  "scheduled_items": [...],
  "blanket_coverages": [...],
  "covered_locations": [...],
  "additional_interests": [...],
  "endorsements": [...],
  "extraction_confidence": 0.0-1.0
}

## Confidence Guidelines
- 0.95+: Strong evidence, clear value → AUTO_APPLIED
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
  document_type?: string;
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
  };
  tags: string[];
}

interface EvidenceCatalog {
  entries: Record<string, EvidenceEntry>;
  byIMField: Record<string, string[]>;
  stats: {
    totalEntries: number;
    avgConfidence: number;
    pageCount: number;
  };
}

// =============================================================================
// IM FIELD PATTERNS
// =============================================================================

const IM_FIELD_PATTERNS: Record<string, RegExp[]> = {
  SerialNumber: [/serial/i, /s\/n/i, /ser\.?\s*#?/i],
  VIN: [/vin/i, /vehicle.*id/i],
  EquipmentDescription: [/description/i, /equipment/i, /property/i],
  ScheduledValue: [/value/i, /amount/i, /insured.*value/i],
  Deductible: [/deductible/i, /ded\.?/i],
  LossPayee: [/loss.*payee/i, /lienholder/i, /lessor/i],
  BlanketLimit: [/blanket/i, /aggregate/i],
  TheftDeductible: [/theft.*ded/i],
  RentalReimbursement: [/rental/i, /reimbursement/i],
  Territory: [/territory/i, /coverage.*area/i],
  LocationName: [/location/i, /site/i, /address/i],
  Premium: [/premium/i, /total.*due/i],
};

// =============================================================================
// AZURE DOCUMENT INTELLIGENCE
// =============================================================================

async function callAzureDocumentIntelligence(
  documentUrl: string,
  azureEndpoint: string,
  azureKey: string
): Promise<any> {
  const analyzeUrl = `${azureEndpoint}/documentintelligence/documentModels/prebuilt-document:analyze?api-version=2024-02-29-preview`;

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

  const operationLocation = analyzeResponse.headers.get("Operation-Location");
  if (!operationLocation) {
    throw new Error("No operation location returned from Azure DI");
  }

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
    for (const [fieldName, patterns] of Object.entries(IM_FIELD_PATTERNS)) {
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

  // Process tables (especially equipment schedules)
  for (let tableIdx = 0; tableIdx < (azureResult.tables || []).length; tableIdx++) {
    const table = azureResult.tables[tableIdx];
    const columnHeaders: Record<number, string> = {};

    for (const cell of table.cells) {
      if (cell.kind === "columnHeader") {
        columnHeaders[cell.columnIndex] = cell.content;
      }
    }

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
  const byIMField: Record<string, string[]> = {};
  for (const [id, entry] of Object.entries(entries)) {
    for (const tag of entry.tags) {
      if (!byIMField[tag]) byIMField[tag] = [];
      byIMField[tag].push(id);
    }
  }

  const entryList = Object.values(entries);
  const avgConfidence = entryList.length > 0
    ? entryList.reduce((sum, e) => sum + e.confidence, 0) / entryList.length
    : 0;

  const pages = new Set(entryList.map((e) => e.pageNumber));

  return {
    entries,
    byIMField,
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

    console.log(`[extract-im-policy] Starting extraction for policy ${policy_id}`);

    // Get document info
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("*, file_path, ocr_text")
      .eq("id", document_id)
      .single();

    if (docError) throw docError;

    let evidenceCatalog: EvidenceCatalog | null = null;

    // Use Azure Document Intelligence
    if (use_azure_di && azureEndpoint && azureKey && doc.file_path) {
      console.log("[extract-im-policy] Using Azure Document Intelligence for OCR");

      const { data: signedUrl, error: urlError } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.file_path, 3600);

      if (urlError || !signedUrl?.signedUrl) {
        throw new Error(`Failed to get signed URL: ${urlError?.message}`);
      }

      const azureResult = await callAzureDocumentIntelligence(signedUrl.signedUrl, azureEndpoint, azureKey);
      evidenceCatalog = buildEvidenceCatalog(azureResult);

      console.log(`[extract-im-policy] Evidence catalog: ${evidenceCatalog.stats.totalEntries} entries`);
    }

    // Build LLM prompt
    let userPrompt = `## Document Type: ${document_type.toUpperCase()}\n\n`;

    if (evidenceCatalog) {
      userPrompt += formatEvidenceForPrompt(evidenceCatalog);
    } else if (doc.ocr_text) {
      userPrompt += `## Document Content\n\`\`\`\n${doc.ocr_text}\n\`\`\`\n`;
    } else {
      throw new Error("No document content available for extraction");
    }

    userPrompt += `\n## Extraction Task\nExtract ALL Inland Marine policy details from the evidence above.\n`;
    userPrompt += `Focus on: Scheduled equipment (with serial numbers/VINs), blanket coverages, locations, deductibles, loss payees.\n`;
    userPrompt += `CRITICAL: Only use values from the evidence catalog. Cite evidence IDs for every field.`;

    console.log(`[extract-im-policy] Calling Claude for extraction...`);

    const llmStartTime = Date.now();
    const response = await anthropicBoundaryCreate(anthropicApiKey, {
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      system: IM_EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const llmTime = Date.now() - llmStartTime;
    console.log(`[extract-im-policy] Claude completed in ${llmTime}ms`);

    // Parse response
    const responseText = response.content[0].type === "text" ? response.content[0].text : "";
    let imDetails: any;

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        imDetails = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("[extract-im-policy] Failed to parse response:", parseError);
      throw new Error("Failed to parse extraction response");
    }

    // Add metadata
    imDetails.extraction_source = "azure_di_claude";
    imDetails.extracted_at = new Date().toISOString();

    // Store in database
    const { error: upsertError } = await supabase
      .from("inland_marine_details")
      .upsert({
        policy_id,
        extracted_data: imDetails,
        field_status: imDetails.fields ? Object.fromEntries(
          Object.entries(imDetails.fields as Record<string, any>).map(([k, v]: [string, any]) => [k, v.status])
        ) : {},
        field_confidence: imDetails.fields ? Object.fromEntries(
          Object.entries(imDetails.fields as Record<string, any>).map(([k, v]: [string, any]) => [k, v.confidence])
        ) : {},
        evidence_references: imDetails.fields ? Object.fromEntries(
          Object.entries(imDetails.fields as Record<string, any>).map(([k, v]: [string, any]) => [k, v.evidence_ids || []])
        ) : {},
      }, { onConflict: "policy_id" });

    if (upsertError) {
      console.error("[extract-im-policy] Failed to store details:", upsertError);
      throw upsertError;
    }

    // Store scheduled items
    if (imDetails.scheduled_items?.length > 0) {
      // Get the details ID
      const { data: detailsRow } = await supabase
        .from("inland_marine_details")
        .select("id")
        .eq("policy_id", policy_id)
        .single();

      if (detailsRow) {
        // Clear existing items
        await supabase
          .from("inland_marine_scheduled_items")
          .delete()
          .eq("inland_marine_details_id", detailsRow.id);

        // Insert new items
        const itemRows = imDetails.scheduled_items.map((item: any) => ({
          inland_marine_details_id: detailsRow.id,
          item_id: item.item_id || `ITEM-${Math.random().toString(36).substr(2, 9)}`,
          description: item.description,
          manufacturer: item.manufacturer,
          model: item.model,
          serial_number: item.serial_number,
          vin: item.vin,
          year: item.year,
          scheduled_value: item.scheduled_value,
          valuation_basis: item.valuation_basis || "replacement_cost",
          deductible: item.deductible,
          primary_location: item.primary_location,
          loss_payee: item.loss_payee || null,
          evidence_id: item.evidence_ids?.[0],
        }));

        await supabase
          .from("inland_marine_scheduled_items")
          .insert(itemRows);
      }
    }

    console.log(`[extract-im-policy] Successfully extracted IM details for policy ${policy_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        policy_id,
        extraction_method: evidenceCatalog ? "azure_di_claude" : "ocr_text_claude",
        evidence_entries: evidenceCatalog?.stats.totalEntries || 0,
        scheduled_items_count: imDetails.scheduled_items?.length || 0,
        blanket_coverages_count: imDetails.blanket_coverages?.length || 0,
        processing_time_ms: Date.now() - jobStartTime,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("[extract-im-policy] Error:", error);

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
