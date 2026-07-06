/**
 * Cyber Liability Policy Extraction Edge Function
 *
 * Uses Azure Document Intelligence for OCR and builds evidence catalogs
 * for click-to-highlight support.
 *
 * Handles: First-party (breach response, BI, extortion) and Third-party
 * (network security, privacy, media liability) coverages.
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { anthropicBoundaryCreate } from '../_shared/modelBoundaryFetch.ts';
import { requireAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

// =============================================================================
// CYBER EXTRACTION SYSTEM PROMPT
// =============================================================================

const CYBER_EXTRACTION_SYSTEM_PROMPT = `You are an expert Cyber Liability insurance document analyst.

## CRITICAL RULES
1. **ONLY extract values that exist in the evidence catalog provided**
2. **NEVER guess or infer values** - if evidence is not found, return NOT_FOUND
3. **ALWAYS cite evidence IDs** for every extracted value
4. **NEVER fabricate evidence IDs** - only use IDs from the catalog

## Cyber Liability Fields to Extract

### Policy Identity
- carrier_name, policy_number, status
- named_insured (name, address, website, industry)
- policy_form: claims_made or occurrence (MOST are claims-made)
- carrier_type: admitted, non_admitted, surplus_lines

### Dates
- effective_date, expiration_date (YYYY-MM-DD format)
- retroactive_date (CRITICAL for claims-made)

### Limits Structure
- policy_aggregate: Overall policy aggregate
- per_occurrence_limit or per_claim_limit
- defense_costs_position: inside_limits or outside_limits

### Deductibles
- per_claim_deductible: Standard deductible
- Coverage-specific deductibles if different
- bi_waiting_period_hours: Hours before BI coverage triggers

### First-Party Coverages
For each, extract: included (boolean), limit, sublimit, deductible

1. **Data Breach Response**
   - forensic_investigation_limit
   - notification_costs_limit, per_person_cap
   - credit_monitoring_limit, duration_months
   - breach_coach_required, panel_firms

2. **Cyber Extortion**
   - ransom_payment_included, ransom_payment_limit
   - cryptocurrency_allowed
   - waiting_period_hours

3. **Business Interruption**
   - waiting_period_hours (CRITICAL)
   - restoration_period_days
   - daily_limit vs actual_loss basis
   - system_failure_included (non-malicious outages)
   - contingent_bi_included (third-party vendor)

4. **Data Restoration**
   - data_recreation, software_restoration
   - bricking_coverage (hardware destruction)

5. **Social Engineering** (Often low sublimit - FLAG)
   - funds_transfer_fraud, invoice_manipulation
   - callback_verification_required
   - discovery_period_days

### Third-Party Coverages
For each: included, limit, deductible, defense_costs position

1. **Network Security Liability**
   - unauthorized_access, denial_of_service, malware_transmission

2. **Privacy Liability**
   - regulatory_defense_included, regulatory_defense_limit
   - regulatory_fines_included, where_insurable
   - pci_dss_fines_included

3. **Media Liability**
   - defamation, copyright_infringement
   - digital_only or all_media

4. **Technology E&O** (if included)
   - professional_services_covered

### Claims-Made Provisions (CRITICAL)
- retroactive_date: Extract exact date or note "full prior acts"
- full_prior_acts: true if no retro date limitation
- erp_available: Extended reporting period (tail)
- basic_erp_days: Usually 30-60 days automatic
- supplemental_erp_options: Array of {duration_months, premium_percent, deadline_days}
- continuity_date, pending_prior_date

### Incident Response Panel
- breach_coach_required
- breach_coach_firms, forensic_vendors, legal_firms
- pre_approval_required, pre_approval_threshold
- claims_hotline, incident_hotline

### High-Impact Items (FLAG THESE)
- Social engineering sublimit (often very low)
- System failure exclusion
- War/nation-state exclusion
- Infrastructure failure exclusion
- Failure to maintain security
- Short retroactive date (within 2 years)

### Premium
- total_annual_premium
- first_party_premium, third_party_premium (if broken out)
- minimum_earned_premium

## Output Format
{
  "fields": {
    "field_name": {
      "value": "extracted value",
      "evidence_ids": ["E0001"],
      "confidence": 0.95,
      "status": "AUTO_APPLIED|NEEDS_REVIEW|LOW_CONFIDENCE|NOT_FOUND"
    }
  },
  "first_party": {...},
  "third_party": {...},
  "claims_made": {...},
  "incident_response": {...},
  "endorsements": [...],
  "high_impact_flags": [...],
  "extraction_confidence": 0.0-1.0
}`;

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
  sourceType: string;
  label: string | null;
  value: string;
  normalizedValue: string;
  confidence: number;
  pageNumber: number;
  boundingBox: any | null;
  tableContext?: any;
  tags: string[];
}

interface EvidenceCatalog {
  entries: Record<string, EvidenceEntry>;
  byCyberField: Record<string, string[]>;
  stats: { totalEntries: number; avgConfidence: number; pageCount: number; };
}

// =============================================================================
// CYBER FIELD PATTERNS
// =============================================================================

const CYBER_FIELD_PATTERNS: Record<string, RegExp[]> = {
  PolicyAggregate: [/aggregate/i, /policy.*limit/i],
  PerClaimLimit: [/per.*claim/i, /each.*claim/i],
  RetroactiveDate: [/retro/i, /prior.*acts/i],
  WaitingPeriod: [/waiting.*period/i, /hours/i],
  BreachResponse: [/breach.*response/i, /data.*breach/i, /incident.*response/i],
  Extortion: [/extortion/i, /ransom/i, /cyber.*attack/i],
  BusinessInterruption: [/business.*interrupt/i, /income.*loss/i, /bi\b/i],
  SocialEngineering: [/social.*engineer/i, /funds.*transfer/i, /impersonation/i],
  NetworkSecurity: [/network.*security/i, /security.*liability/i],
  Privacy: [/privacy/i, /data.*protection/i, /pii/i, /phi/i],
  MediaLiability: [/media/i, /defamation/i, /copyright/i],
  RegulatoryFines: [/regulatory/i, /fines/i, /penalties/i, /pci/i],
  ERP: [/extended.*report/i, /erp/i, /tail/i],
  Deductible: [/deductible/i, /retention/i, /sir/i],
};

// =============================================================================
// AZURE DOCUMENT INTELLIGENCE & EVIDENCE BUILDER
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
    throw new Error(`Azure DI failed: ${await analyzeResponse.text()}`);
  }

  const operationLocation = analyzeResponse.headers.get("Operation-Location");
  if (!operationLocation) throw new Error("No operation location from Azure DI");

  let result = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
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
  }

  if (!result) throw new Error("Azure DI timed out");
  return result;
}

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
    for (const [field, patterns] of Object.entries(CYBER_FIELD_PATTERNS)) {
      for (const p of patterns) {
        if (p.test(label) || p.test(value)) { tags.push(field); break; }
      }
    }
    return tags;
  };

  for (const kv of azureResult.keyValuePairs || []) {
    const key = kv.key?.content?.trim();
    const value = kv.value?.content?.trim();
    if (!value) continue;
    const pageNum = kv.value?.boundingRegions?.[0]?.pageNumber || 1;
    const id = generateId();
    entries[id] = {
      evidenceId: id, sourceType: "key_value", label: key || null,
      value, normalizedValue: value, confidence: kv.confidence || 0.8,
      pageNumber: pageNum,
      boundingBox: polygonToBbox(kv.value?.boundingRegions?.[0]?.polygon, pageNum),
      tags: inferTags(key || "", value),
    };
  }

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
        evidenceId: id, sourceType: "table_cell", label: header || null,
        value: cell.content.trim(), normalizedValue: cell.content.trim(),
        confidence: cell.confidence || 0.85, pageNumber: pageNum,
        boundingBox: polygonToBbox(cell.boundingRegions?.[0]?.polygon, pageNum),
        tableContext: { tableIndex: ti, rowIndex: cell.rowIndex, columnIndex: cell.columnIndex, columnHeader: header },
        tags: inferTags(header, cell.content),
      };
    }
  }

  const byCyberField: Record<string, string[]> = {};
  for (const [id, e] of Object.entries(entries)) {
    for (const tag of e.tags) {
      if (!byCyberField[tag]) byCyberField[tag] = [];
      byCyberField[tag].push(id);
    }
  }

  const entryList = Object.values(entries);
  return {
    entries, byCyberField,
    stats: {
      totalEntries: entryList.length,
      avgConfidence: entryList.length ? entryList.reduce((s, e) => s + e.confidence, 0) / entryList.length : 0,
      pageCount: new Set(entryList.map(e => e.pageNumber)).size,
    },
  };
}

function formatEvidenceForPrompt(catalog: EvidenceCatalog): string {
  const lines: string[] = [`## Evidence Catalog`, `Total: ${catalog.stats.totalEntries}, Avg conf: ${(catalog.stats.avgConfidence * 100).toFixed(1)}%`, ""];
  const byPage: Record<number, EvidenceEntry[]> = {};
  for (const e of Object.values(catalog.entries)) {
    if (!byPage[e.pageNumber]) byPage[e.pageNumber] = [];
    byPage[e.pageNumber].push(e);
  }
  for (const pn of Object.keys(byPage).map(Number).sort((a, b) => a - b)) {
    lines.push(`### Page ${pn}`);
    for (const e of byPage[pn]) {
      const lbl = e.label ? `[${e.label}]` : "";
      const tags = e.tags.length ? ` {${e.tags.join(", ")}}` : "";
      const val = e.value.length > 100 ? e.value.substring(0, 100) + "..." : e.value;
      lines.push(`- **${e.evidenceId}** ${lbl}: "${val}" (${(e.confidence * 100).toFixed(0)}%)${tags}`);
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

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    const azureEndpoint = Deno.env.get("AZURE_DI_ENDPOINT");
    const azureKey = Deno.env.get("AZURE_DI_KEY");

    if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Require authentication
    const authResult = await requireAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) {
      return authResult;
    }


    const body: RequestBody = await req.json();
    const { document_id, policy_id, document_type = "policy", use_azure_di = true } = body;

    if (!policy_id || !document_id) throw new Error("policy_id and document_id required");

    console.log(`[extract-cyber] Starting for policy ${policy_id}`);

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("*, file_path, ocr_text")
      .eq("id", document_id)
      .single();

    if (docError) throw docError;

    let catalog: EvidenceCatalog | null = null;

    if (use_azure_di && azureEndpoint && azureKey && doc.file_path) {
      console.log("[extract-cyber] Using Azure DI");
      const { data: signedUrl } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.file_path, 3600);

      if (!signedUrl?.signedUrl) throw new Error("Failed to get signed URL");

      const azureResult = await callAzureDocumentIntelligence(signedUrl.signedUrl, azureEndpoint, azureKey);
      catalog = buildEvidenceCatalog(azureResult);
      console.log(`[extract-cyber] Evidence: ${catalog.stats.totalEntries} entries`);
    }

    let userPrompt = `## Document Type: ${document_type.toUpperCase()}\n\n`;
    if (catalog) {
      userPrompt += formatEvidenceForPrompt(catalog);
    } else if (doc.ocr_text) {
      userPrompt += `## Document Content\n\`\`\`\n${doc.ocr_text}\n\`\`\`\n`;
    } else {
      throw new Error("No document content");
    }

    userPrompt += `\n## Task\nExtract ALL Cyber Liability policy details.\n`;
    userPrompt += `Focus on: Limits, deductibles, first-party coverages, third-party coverages, claims-made provisions, incident response panel.\n`;
    userPrompt += `FLAG: Low social engineering sublimits, missing system failure coverage, short retro dates.\n`;

    console.log("[extract-cyber] Calling Claude...");

    const response = await anthropicBoundaryCreate(anthropicKey, {
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      system: CYBER_EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const responseText = response.content[0].type === "text" ? response.content[0].text : "";
    let cyberDetails: any;

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) cyberDetails = JSON.parse(jsonMatch[0]);
      else throw new Error("No JSON");
    } catch {
      throw new Error("Failed to parse extraction response");
    }

    cyberDetails.extraction_source = "azure_di_claude";
    cyberDetails.extracted_at = new Date().toISOString();

    // Store main record
    const { error: upsertError } = await supabase
      .from("cyber_liability_details")
      .upsert({
        policy_id,
        extracted_data: cyberDetails,
        field_status: cyberDetails.fields ? Object.fromEntries(
          Object.entries(cyberDetails.fields as Record<string, any>).map(([k, v]: [string, any]) => [k, v.status])
        ) : {},
        field_confidence: cyberDetails.fields ? Object.fromEntries(
          Object.entries(cyberDetails.fields as Record<string, any>).map(([k, v]: [string, any]) => [k, v.confidence])
        ) : {},
        evidence_references: cyberDetails.fields ? Object.fromEntries(
          Object.entries(cyberDetails.fields as Record<string, any>).map(([k, v]: [string, any]) => [k, v.evidence_ids || []])
        ) : {},
      }, { onConflict: "policy_id" });

    if (upsertError) throw upsertError;

    // Store child records
    const { data: detailsRow } = await supabase
      .from("cyber_liability_details")
      .select("id")
      .eq("policy_id", policy_id)
      .single();

    if (detailsRow && cyberDetails.first_party) {
      const fp = cyberDetails.first_party;
      await supabase.from("cyber_first_party_coverages").upsert({
        cyber_details_id: detailsRow.id,
        breach_response_included: fp.data_breach_response?.included,
        breach_response_limit: fp.data_breach_response?.limit,
        forensic_investigation_limit: fp.data_breach_response?.forensic_investigation?.limit,
        notification_costs_limit: fp.data_breach_response?.notification_costs?.limit,
        credit_monitoring_limit: fp.data_breach_response?.credit_monitoring?.limit,
        credit_monitoring_months: fp.data_breach_response?.credit_monitoring?.duration_months,
        breach_coach_required: fp.data_breach_response?.breach_coach?.required,
        extortion_included: fp.cyber_extortion?.included,
        extortion_limit: fp.cyber_extortion?.limit,
        ransom_payment_included: fp.cyber_extortion?.ransom_payment?.included,
        ransom_payment_limit: fp.cyber_extortion?.ransom_payment?.limit,
        bi_included: fp.business_interruption?.included,
        bi_limit: fp.business_interruption?.limit,
        bi_waiting_hours: fp.business_interruption?.waiting_period_hours,
        system_failure_included: fp.business_interruption?.system_failure?.included,
        contingent_bi_included: fp.business_interruption?.contingent_bi?.included,
        data_restoration_included: fp.data_restoration?.included,
        data_restoration_limit: fp.data_restoration?.limit,
        social_engineering_included: fp.social_engineering?.included,
        social_engineering_limit: fp.social_engineering?.limit,
      }, { onConflict: "cyber_details_id" });
    }

    if (detailsRow && cyberDetails.third_party) {
      const tp = cyberDetails.third_party;
      await supabase.from("cyber_third_party_coverages").upsert({
        cyber_details_id: detailsRow.id,
        network_security_included: tp.network_security_liability?.included,
        network_security_limit: tp.network_security_liability?.limit,
        network_security_defense_costs: tp.network_security_liability?.defense_costs,
        privacy_liability_included: tp.privacy_liability?.included,
        privacy_liability_limit: tp.privacy_liability?.limit,
        regulatory_defense_included: tp.privacy_liability?.regulatory_defense?.included,
        regulatory_fines_included: tp.privacy_liability?.regulatory_fines?.included,
        pci_dss_fines_included: tp.privacy_liability?.pci_dss_fines?.included,
        media_liability_included: tp.media_liability?.included,
        media_liability_limit: tp.media_liability?.limit,
        tech_eo_included: tp.technology_eo?.included,
        tech_eo_limit: tp.technology_eo?.limit,
      }, { onConflict: "cyber_details_id" });
    }

    if (detailsRow && cyberDetails.claims_made) {
      const cm = cyberDetails.claims_made;
      await supabase.from("cyber_claims_made_provisions").upsert({
        cyber_details_id: detailsRow.id,
        retroactive_date: cm.retroactive_date,
        full_prior_acts: cm.full_prior_acts,
        erp_available: cm.erp_available,
        basic_erp_days: cm.basic_erp_days,
        supplemental_erp_options: cm.supplemental_erp_options,
      }, { onConflict: "cyber_details_id" });
    }

    console.log(`[extract-cyber] Success for policy ${policy_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        policy_id,
        extraction_method: catalog ? "azure_di_claude" : "ocr_text_claude",
        evidence_entries: catalog?.stats.totalEntries || 0,
        high_impact_flags: cyberDetails.high_impact_flags || [],
        processing_time_ms: Date.now() - startTime,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("[extract-cyber] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
