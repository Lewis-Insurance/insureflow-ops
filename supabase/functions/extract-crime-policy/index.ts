/**
 * Commercial Crime / Fidelity Policy Extraction Edge Function
 *
 * Uses Azure Document Intelligence for OCR and builds evidence catalogs
 * for click-to-highlight support.
 *
 * Handles: Employee Dishonesty, Forgery, Computer Fraud, Funds Transfer Fraud,
 * Money & Securities, Social Engineering, ERISA Fidelity
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { anthropicBoundaryCreate } from '../_shared/modelBoundaryFetch.ts';
import { requireAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

// =============================================================================
// CRIME EXTRACTION SYSTEM PROMPT
// =============================================================================

const CRIME_EXTRACTION_SYSTEM_PROMPT = `You are an expert Commercial Crime and Fidelity Bond document analyst.

## CRITICAL RULES
1. **ONLY extract values that exist in the evidence catalog provided**
2. **NEVER guess or infer values** - if evidence is not found, return NOT_FOUND
3. **ALWAYS cite evidence IDs** for every extracted value
4. **NEVER fabricate evidence IDs** - only use IDs from the catalog

## Commercial Crime Fields to Extract

### Policy Identity
- carrier_name, policy_number, status
- named_insured (name, address, business_type)
- producer, agency

### Policy Type and Form
- policy_type: crime_policy, fidelity_bond, erisa_bond, financial_institution_bond
- form_type: discovery_form, loss_sustained_form, hybrid

### Dates
- effective_date, expiration_date (YYYY-MM-DD format)

### Overall Limits
- policy_aggregate: If there's an overall policy aggregate

### Insuring Agreements (Coverages)
For each coverage, extract: included (boolean), limit, deductible, special conditions

1. **Coverage A - Employee Dishonesty / Fidelity**
   - coverage_form: blanket, scheduled, name_schedule, position_schedule
   - If scheduled: List of employees with names/positions and individual limits
   - includes_leased_employees, includes_volunteers, includes_directors
   - erisa_plan_covered
   - prior_dishonesty_date

2. **Coverage B - Forgery or Alteration**
   - outgoing_checks, incoming_checks covered
   - third_party_forgery

3. **Coverage C - Inside Premises**
   - theft_included, theft_limit
   - robbery_safe_burglary_included, robbery_limit
   - money_limit, securities_limit

4. **Coverage D - Outside Premises**
   - money_limit, securities_limit
   - messenger_includes_armored_car

5. **Coverage E - Computer Fraud**
   - direct_loss_only (important - excludes consequential)
   - virus_coverage

6. **Coverage F - Funds Transfer Fraud**
   - wire_transfer, ach_transfer covered
   - callback_verification_required
   - dual_authorization_required

7. **Social Engineering Fraud** (Coverage G or endorsement)
   - Often VERY LOW SUBLIMIT - FLAG THIS
   - impersonation_of_vendor, impersonation_of_executive
   - verification_procedures_required
   - discovery_period_days

8. **Client Property Coverage**
   - client_money, client_securities covered

9. **ERISA Fidelity**
   - plans_covered: List of plan names
   - bond_amount vs plan_assets
   - meets_dol_requirements: true if bond >= 10% of assets (min $1K, max $500K)

### Policy Conditions
- discovery_period_after_policy_days
- loss_sustained_retroactive_date (for loss sustained forms)
- territory: usa, usa_and_canada, worldwide
- acquisition_automatic_days
- joint_insured_provision
- other_insurance: primary, excess, contributory

### Scheduled Employees (if scheduled form)
For each: name, position, individual_limit

### ERISA Plans (if applicable)
For each: plan_name, plan_number, plan_assets, bond_amount, meets_dol_requirements

### High-Impact Items (FLAG THESE)
- Social engineering sublimit (often $25K-$100K vs $500K+ main limit)
- Computer fraud direct loss only requirement
- No funds transfer fraud coverage
- ERISA bond below DOL requirements
- Short discovery period

### Endorsements
- endorsement_number, endorsement_name, form_number
- endorsement_type: coverage_extension, coverage_restriction, exclusion
- high_impact: true for significant exclusions

### Premium
- total_annual_premium
- coverage_premiums: Array of {coverage, premium}
- minimum_premium

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
  "coverages": {
    "employee_dishonesty": {...},
    "forgery_alteration": {...},
    ...
  },
  "scheduled_employees": [...],
  "erisa_plans": [...],
  "conditions": {...},
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
  byCrimeField: Record<string, string[]>;
  stats: { totalEntries: number; avgConfidence: number; pageCount: number; };
}

// =============================================================================
// CRIME FIELD PATTERNS
// =============================================================================

const CRIME_FIELD_PATTERNS: Record<string, RegExp[]> = {
  EmployeeDishonesty: [/employee.*dishonest/i, /fidelity/i, /theft.*employee/i],
  Forgery: [/forgery/i, /alteration/i, /forged/i],
  InsidePremises: [/inside.*premises/i, /theft.*money/i, /robbery/i, /safe.*burglar/i],
  OutsidePremises: [/outside.*premises/i, /messenger/i, /transit/i],
  ComputerFraud: [/computer.*fraud/i, /electronic.*fund/i],
  FundsTransfer: [/funds.*transfer/i, /wire.*fraud/i, /ach/i],
  SocialEngineering: [/social.*engineer/i, /impersonat/i, /fraudulent.*instruct/i],
  ClientProperty: [/client.*property/i, /customer.*property/i],
  ERISA: [/erisa/i, /pension/i, /401.*k/i, /benefit.*plan/i, /fiduciary/i],
  DiscoveryPeriod: [/discovery/i, /discover.*loss/i],
  Deductible: [/deductible/i, /retention/i],
  Limit: [/limit/i, /amount/i, /coverage/i],
  Schedule: [/schedule/i, /named.*employee/i, /position/i],
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
    throw new Error(`Azure DI failed: ${await analyzeResponse.text()}`);
  }

  const operationLocation = analyzeResponse.headers.get("Operation-Location");
  if (!operationLocation) throw new Error("No operation location");

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
    for (const [field, patterns] of Object.entries(CRIME_FIELD_PATTERNS)) {
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

  const byCrimeField: Record<string, string[]> = {};
  for (const [id, e] of Object.entries(entries)) {
    for (const tag of e.tags) {
      if (!byCrimeField[tag]) byCrimeField[tag] = [];
      byCrimeField[tag].push(id);
    }
  }

  const entryList = Object.values(entries);
  return {
    entries, byCrimeField,
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
// ERISA DOL COMPLIANCE CHECK
// =============================================================================

function checkERISADOLCompliance(planAssets: number, bondAmount: number): boolean {
  const requiredBond = Math.max(1000, Math.min(planAssets * 0.10, 500000));
  return bondAmount >= requiredBond;
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

    console.log(`[extract-crime] Starting for policy ${policy_id}`);

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("*, file_path, ocr_text")
      .eq("id", document_id)
      .single();

    if (docError) throw docError;

    let catalog: EvidenceCatalog | null = null;

    if (use_azure_di && azureEndpoint && azureKey && doc.file_path) {
      console.log("[extract-crime] Using Azure DI");
      const { data: signedUrl } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.file_path, 3600);

      if (!signedUrl?.signedUrl) throw new Error("Failed to get signed URL");

      const azureResult = await callAzureDocumentIntelligence(signedUrl.signedUrl, azureEndpoint, azureKey);
      catalog = buildEvidenceCatalog(azureResult);
      console.log(`[extract-crime] Evidence: ${catalog.stats.totalEntries} entries`);
    }

    let userPrompt = `## Document Type: ${document_type.toUpperCase()}\n\n`;
    if (catalog) {
      userPrompt += formatEvidenceForPrompt(catalog);
    } else if (doc.ocr_text) {
      userPrompt += `## Document Content\n\`\`\`\n${doc.ocr_text}\n\`\`\`\n`;
    } else {
      throw new Error("No document content");
    }

    userPrompt += `\n## Task\nExtract ALL Commercial Crime policy details.\n`;
    userPrompt += `Focus on: Policy type/form, each insuring agreement (A-G), limits, deductibles, scheduled employees, ERISA plans.\n`;
    userPrompt += `FLAG: Low social engineering sublimits, missing computer/funds transfer fraud, ERISA below DOL requirements.\n`;

    console.log("[extract-crime] Calling Claude...");

    const response = await anthropicBoundaryCreate(anthropicKey, {
      model: "claude-sonnet-5",
      max_tokens: 8000,
      system: CRIME_EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const responseText = response.content[0].type === "text" ? response.content[0].text : "";
    let crimeDetails: any;

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) crimeDetails = JSON.parse(jsonMatch[0]);
      else throw new Error("No JSON");
    } catch {
      throw new Error("Failed to parse extraction response");
    }

    crimeDetails.extraction_source = "azure_di_claude";
    crimeDetails.extracted_at = new Date().toISOString();

    // Check ERISA DOL compliance if applicable
    if (crimeDetails.erisa_plans) {
      for (const plan of crimeDetails.erisa_plans) {
        if (plan.plan_assets && plan.bond_amount) {
          plan.meets_dol_requirements = checkERISADOLCompliance(plan.plan_assets, plan.bond_amount);
        }
      }
    }

    // Determine policy type and form from extracted data
    const policyType = crimeDetails.fields?.policy_type?.value || 'crime_policy';
    const formType = crimeDetails.fields?.form_type?.value || 'discovery_form';

    // Store main record
    const { error: upsertError } = await supabase
      .from("commercial_crime_details")
      .upsert({
        policy_id,
        policy_type: policyType,
        form_type: formType,
        policy_aggregate: crimeDetails.fields?.policy_aggregate?.value,
        extracted_data: crimeDetails,
        field_status: crimeDetails.fields ? Object.fromEntries(
          Object.entries(crimeDetails.fields as Record<string, any>).map(([k, v]: [string, any]) => [k, v.status])
        ) : {},
        field_confidence: crimeDetails.fields ? Object.fromEntries(
          Object.entries(crimeDetails.fields as Record<string, any>).map(([k, v]: [string, any]) => [k, v.confidence])
        ) : {},
        evidence_references: crimeDetails.fields ? Object.fromEntries(
          Object.entries(crimeDetails.fields as Record<string, any>).map(([k, v]: [string, any]) => [k, v.evidence_ids || []])
        ) : {},
      }, { onConflict: "policy_id" });

    if (upsertError) throw upsertError;

    // Store coverages
    const { data: detailsRow } = await supabase
      .from("commercial_crime_details")
      .select("id")
      .eq("policy_id", policy_id)
      .single();

    if (detailsRow && crimeDetails.coverages) {
      // Clear existing coverages
      await supabase
        .from("crime_coverages")
        .delete()
        .eq("crime_details_id", detailsRow.id);

      const coverageRows = [];
      const covs = crimeDetails.coverages;

      if (covs.employee_dishonesty) {
        coverageRows.push({
          crime_details_id: detailsRow.id,
          coverage_type: "employee_dishonesty",
          included: covs.employee_dishonesty.included,
          coverage_limit: covs.employee_dishonesty.limit,
          deductible: covs.employee_dishonesty.deductible,
          coverage_form: covs.employee_dishonesty.coverage_form,
          includes_leased_employees: covs.employee_dishonesty.includes_leased_employees,
          includes_volunteers: covs.employee_dishonesty.includes_volunteers,
          includes_directors: covs.employee_dishonesty.includes_directors,
          erisa_plan_covered: covs.employee_dishonesty.erisa_plan_covered,
        });
      }

      if (covs.forgery_alteration) {
        coverageRows.push({
          crime_details_id: detailsRow.id,
          coverage_type: "forgery_alteration",
          included: covs.forgery_alteration.included,
          coverage_limit: covs.forgery_alteration.limit,
          deductible: covs.forgery_alteration.deductible,
        });
      }

      if (covs.computer_fraud) {
        coverageRows.push({
          crime_details_id: detailsRow.id,
          coverage_type: "computer_fraud",
          included: covs.computer_fraud.included,
          coverage_limit: covs.computer_fraud.limit,
          deductible: covs.computer_fraud.deductible,
          direct_loss_only: covs.computer_fraud.direct_loss_only,
          virus_coverage: covs.computer_fraud.virus_coverage,
        });
      }

      if (covs.funds_transfer_fraud) {
        coverageRows.push({
          crime_details_id: detailsRow.id,
          coverage_type: "funds_transfer_fraud",
          included: covs.funds_transfer_fraud.included,
          coverage_limit: covs.funds_transfer_fraud.limit,
          deductible: covs.funds_transfer_fraud.deductible,
          wire_transfer_covered: covs.funds_transfer_fraud.wire_transfer,
          ach_transfer_covered: covs.funds_transfer_fraud.ach_transfer,
          callback_verification_required: covs.funds_transfer_fraud.callback_verification_required,
        });
      }

      if (covs.social_engineering) {
        coverageRows.push({
          crime_details_id: detailsRow.id,
          coverage_type: "social_engineering",
          included: covs.social_engineering.included,
          coverage_limit: covs.social_engineering.limit,
          deductible: covs.social_engineering.deductible,
          callback_verification_required: covs.social_engineering.verification_procedures_required,
          discovery_period_days: covs.social_engineering.discovery_period_days,
        });
      }

      if (coverageRows.length > 0) {
        await supabase.from("crime_coverages").insert(coverageRows);
      }
    }

    // Store ERISA plans
    if (detailsRow && crimeDetails.erisa_plans?.length > 0) {
      await supabase
        .from("crime_erisa_plans")
        .delete()
        .eq("crime_details_id", detailsRow.id);

      const planRows = crimeDetails.erisa_plans.map((plan: any) => ({
        crime_details_id: detailsRow.id,
        plan_name: plan.plan_name,
        plan_number: plan.plan_number,
        plan_assets: plan.plan_assets,
        required_bond_amount: plan.plan_assets ? Math.max(1000, Math.min(plan.plan_assets * 0.10, 500000)) : null,
        actual_bond_amount: plan.bond_amount,
        meets_dol_requirements: plan.meets_dol_requirements,
      }));

      await supabase.from("crime_erisa_plans").insert(planRows);
    }

    console.log(`[extract-crime] Success for policy ${policy_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        policy_id,
        extraction_method: catalog ? "azure_di_claude" : "ocr_text_claude",
        evidence_entries: catalog?.stats.totalEntries || 0,
        coverages_count: Object.keys(crimeDetails.coverages || {}).length,
        erisa_plans_count: crimeDetails.erisa_plans?.length || 0,
        high_impact_flags: crimeDetails.high_impact_flags || [],
        processing_time_ms: Date.now() - startTime,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("[extract-crime] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
