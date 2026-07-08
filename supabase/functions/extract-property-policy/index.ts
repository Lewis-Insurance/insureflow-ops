/**
 * Commercial Property Policy Extraction Edge Function
 *
 * Extracts Commercial Property policy data using:
 * 1. Azure Document Intelligence for OCR with bounding boxes
 * 2. Evidence catalog for click-to-highlight traceability
 * 3. Claude TOOL-USE (structured output) for field extraction with evidence IDs
 *
 * COI CONTRACT (why this was reworked): Property is NOT a named ACORD 25 section
 * — it prints in the generic "OTHER" row, which coi_build_line builds ONLY from
 * property_details.coi_summary.{label, limit_amount, limit_description}
 * (migration 20260702172000, property cells L951-960). All shaping that lands
 * the model output on those exact paths lives in the pure, unit-tested
 * ./shape.ts module (the BAP template). This file is the Deno wiring only.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { anthropicBoundaryCreate } from '../_shared/modelBoundaryFetch.ts';
import { nullifyRedactedTokens } from '../_shared/floorSafety.ts';
import { requireAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import {
  PROPERTY_EXTRACTION_TOOL_NAME,
  PROPERTY_EXTRACTION_TOOL_SCHEMA,
  shapePropertyDetails,
  shapeLocationRows,
  shapeBuildingRows,
  shapeBuildingCoverageRows,
  shapeDeductibleRows,
  shapeInterestRows,
  shapeEndorsementRows,
  type RawPropertyExtraction,
} from './shape.ts';

// =============================================================================
// PROPERTY FIELD PATTERNS FOR EVIDENCE MATCHING
// =============================================================================

const PROPERTY_FIELD_PATTERNS: Record<string, RegExp[]> = {
  // Policy Info
  PolicyNumber: [/policy\s*(?:no|number|#)/i, /pol\s*(?:no|#)/i],
  NamedInsured: [/named\s*insured/i, /insured\s*name/i, /first\s*named/i],
  EffectiveDate: [/effective\s*date/i, /eff\s*date/i, /policy\s*period.*from/i],
  ExpirationDate: [/expiration\s*date/i, /exp\s*date/i, /policy\s*period.*to/i],
  CarrierName: [/carrier/i, /insurance\s*company/i, /insurer/i, /underwriter/i],

  // Form Type
  FormType: [/special\s*form/i, /broad\s*form/i, /basic\s*form/i, /cp\s*10\s*(?:30|20|10)/i],
  Valuation: [/valuation/i, /replacement\s*cost/i, /actual\s*cash\s*value/i, /acv/i, /rcv/i],
  Coinsurance: [/coinsurance/i, /coins?/i, /80%/i, /90%/i, /100%/i],

  // Locations/Buildings
  Location: [/location/i, /loc\s*(?:no|#)/i, /premises/i, /address/i],
  Building: [/building/i, /bldg/i, /structure/i],
  Construction: [/construction/i, /const\s*type/i, /frame/i, /masonry/i, /non.?combustible/i, /fire\s*resistive/i],
  YearBuilt: [/year\s*built/i, /built/i, /age/i],
  SquareFootage: [/sq\s*ft/i, /square\s*foot/i, /area/i],
  Stories: [/stories/i, /floors/i, /number\s*of\s*stories/i],
  RoofType: [/roof\s*type/i, /roof\s*material/i, /roofing/i],
  Sprinklers: [/sprinkler/i, /fire\s*protection/i],

  // Coverages
  BuildingLimit: [/building\s*(?:limit|value|coverage)/i, /bldg\s*limit/i],
  BPPLimit: [/bpp/i, /business\s*personal\s*property/i, /contents/i],
  TIBLimit: [/tenant\s*improvement/i, /t\.?i\.?b\.?/i, /betterment/i],
  StockLimit: [/stock/i, /inventory/i, /merchandise/i],
  TotalInsuredValue: [/total\s*insured\s*value/i, /tiv/i, /total\s*values/i],
  BlanketLimit: [/blanket/i, /blanket\s*limit/i],

  // Business Income
  BusinessIncome: [/business\s*income/i, /b\.?i\.?/i, /loss\s*of\s*(?:income|earnings)/i],
  ExtraExpense: [/extra\s*expense/i, /e\.?e\.?/i],
  WaitingPeriod: [/waiting\s*period/i, /72\s*hours/i],
  ActualLossSustained: [/actual\s*loss\s*sustained/i, /als/i],

  // Ordinance or Law
  OrdinanceOrLaw: [/ordinance.*law/i, /o&l/i, /o\.?&\.?l\.?/i, /building\s*code/i],
  CoverageA: [/coverage\s*a/i, /undamaged\s*portion/i],
  CoverageB: [/coverage\s*b/i, /demolition/i],
  CoverageC: [/coverage\s*c/i, /increased\s*cost/i],

  // Deductibles
  AOPDeductible: [/aop/i, /all\s*other\s*perils/i, /per\s*occurrence\s*deductible/i],
  WindHailDeductible: [/wind.?hail/i, /windstorm/i, /wind\s*deductible/i],
  NamedStormDeductible: [/named\s*storm/i, /hurricane/i, /tropical/i],
  FloodDeductible: [/flood/i, /flood\s*deductible/i],
  EarthquakeDeductible: [/earthquake/i, /seismic/i, /eq\s*deductible/i],
  Deductible: [/deductible/i, /ded/i],

  // Interests
  Mortgagee: [/mortgagee/i, /mortgage/i, /lender/i],
  LossPayee: [/loss\s*payee/i, /payee/i],
  LoanNumber: [/loan\s*(?:no|number|#)/i, /account/i],

  // Endorsements
  EndorsementForm: [/cp\s*\d{2}\s*\d{2}/i, /form\s*(?:no|number|#)/i, /endorsement/i],
  ProtectiveSafeguards: [/protective\s*safeguard/i, /p\.?s\.?g\.?/i, /alarm/i, /security/i],
  VacancyClause: [/vacancy/i, /vacant/i, /unoccupied/i],
};

// =============================================================================
// TYPES
// =============================================================================

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
  byField: Record<string, string[]>;
  stats: {
    totalEntries: number;
    avgConfidence: number;
    pageCount: number;
  };
}

// =============================================================================
// PROPERTY EXTRACTION SYSTEM PROMPT
// =============================================================================

const PROPERTY_EXTRACTION_SYSTEM_PROMPT = `You are an expert Commercial Property policy data extractor for insurance professionals.

You MUST return your extraction by calling the ${PROPERTY_EXTRACTION_TOOL_NAME} tool. Do not answer in prose.

## CRITICAL RULES
1. ONLY extract values that appear in the evidence catalog provided. Cite the evidence IDs (E####) that support each value in that field's evidence_ids array.
2. NEVER guess, infer, or use industry defaults. If a value is not in the evidence, return null for that field.
3. NEVER fabricate an evidence ID — only use IDs that appear in the catalog.

## coi_summary (this is the ONLY thing Property prints on a certificate — get it right)
On an ACORD 25, Property has no dedicated section; it prints in the generic OTHER row. Read these three straight off the declarations / coverage summary:
- coi_summary.label: a short coverage label, e.g. "Building & Personal Property", "Blanket Building & BPP", "Special Form Property".
- coi_summary.limit_amount: the SINGLE headline limit that best represents the coverage — the blanket limit if written blanket, else the Total Insured Value, else the Building + BPP total.
- coi_summary.limit_description: short free text describing the limit, e.g. "Blanket Bldg & BPP, Special Form, RC".
Also fill valuation_summary (TIV, blanket flag/limit, building/BPP totals) so the limit can be corroborated.

## Insurer NAIC
- carrier_naic is the 5-digit INSURER (company) NAIC code. It is NOT an industry NAICS or SIC classification code. If the policy does not clearly show the insurer's NAIC number, return null — a name-to-NAIC lookup happens later.

## Premium
- Do NOT extract premium, fees, taxes, or any dollar amount that is not a coverage limit or deductible. Premium is never captured.

## Additional Insured / Waiver of Subrogation (evidence only)
- Capture blanket endorsements as EVIDENCE in additional_insured_evidence / waiver_of_subrogation_evidence:
  { present, basis: "blanket" | "scheduled", form_numbers: [...], source_span }.
- Name specifically-listed mortgagees / loss payees / additional insureds in interests.
- Do NOT assert a confirmed "Y" for any specific certificate holder. You are recording what the policy shows, not certifying an endorsement.

## Property specifics
- Locations/Buildings: read the Schedule of Locations/Buildings tables. Only include a deductible row when its AMOUNT is known.
- construction_type: normalize to one of frame, joisted_masonry, noncombustible, masonry_noncombustible, modified_fire_resistive, fire_resistive.
- Dates as YYYY-MM-DD. Regulated PII may already be redacted — leave those null when so.`;

// =============================================================================
// MAIN HANDLER
// =============================================================================

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  let jobId: string | null = null;
  let supabaseForCatch: ReturnType<typeof createClient> | null = null;

  try {
    // Initialize clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    supabaseForCatch = supabase;

    // Require authentication
    const authResult = await requireAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) {
      return authResult;
    }

    const { document_id, policy_id, document_type = 'policy' } = await req.json();

    if (!document_id || !policy_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing document_id or policy_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    const azureEndpoint = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT');
    const azureKey = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY');

    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    if (!azureEndpoint || !azureKey) {
      throw new Error('Azure Document Intelligence not configured');
    }

    // Create extraction job
    const { data: job, error: jobError } = await supabase
      .from('policy_property_extraction_jobs')
      .insert({
        policy_id,
        document_id,
        status: 'pending',
        llm_model: 'claude-sonnet-4-20250514',
      })
      .select()
      .single();

    if (jobError) throw jobError;
    jobId = job.id;

    // Get document URL
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('storage_path, file_name')
      .eq('id', document_id)
      .single();

    if (docError || !document) {
      throw new Error('Document not found');
    }

    const { data: signedUrlData } = await supabase.storage
      .from('documents')
      .createSignedUrl(document.storage_path, 3600);

    if (!signedUrlData?.signedUrl) {
      throw new Error('Failed to get document URL');
    }

    // Update job status to OCR processing
    await supabase
      .from('policy_property_extraction_jobs')
      .update({
        status: 'ocr_processing',
        ocr_started_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    // Call Azure Document Intelligence
    console.log('[extract-property-policy] Calling Azure Document Intelligence...');
    const azureResult = await callAzureDocumentIntelligence(
      signedUrlData.signedUrl,
      azureEndpoint,
      azureKey
    );

    // Update job with OCR completion
    await supabase
      .from('policy_property_extraction_jobs')
      .update({
        ocr_completed_at: new Date().toISOString(),
        azure_operation_id: azureResult.operationId,
      })
      .eq('id', job.id);

    // Build evidence catalog
    console.log('[extract-property-policy] Building evidence catalog...');
    const evidenceCatalog = buildEvidenceCatalog(azureResult);

    // Update job status to extracting
    await supabase
      .from('policy_property_extraction_jobs')
      .update({
        status: 'extracting',
        extraction_started_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    // Store evidence catalog
    await supabase.from('policy_property_evidence_catalog').upsert({
      policy_id,
      document_id,
      evidence_entries: evidenceCatalog.entries,
      evidence_by_field: evidenceCatalog.byField,
      total_entries: evidenceCatalog.stats.totalEntries,
      azure_avg_confidence: evidenceCatalog.stats.avgConfidence,
      azure_page_count: evidenceCatalog.stats.pageCount,
    });

    // Call Claude (tool-use / structured output) for extraction
    console.log('[extract-property-policy] Calling Claude for Property extraction...');
    const extractionStart = Date.now();

    const userPrompt = buildPropertyUserPrompt(evidenceCatalog, document_type);

    // `tools` + `tool_choice` pass through the boundary wrapper unchanged, so
    // redactPII still redacts the user prompt (evidence catalog) before it
    // leaves the process (the wrapper JSON-round-trips + recursively redacts
    // the whole body; the schema strings carry no PII).
    const response = await anthropicBoundaryCreate(anthropicApiKey, {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 12000, // Property can have many buildings/locations
      system: PROPERTY_EXTRACTION_SYSTEM_PROMPT,
      tools: [
        {
          name: PROPERTY_EXTRACTION_TOOL_NAME,
          description: 'Emit the structured Commercial Property extraction. Every value must be backed by evidence IDs from the catalog; return null for anything not present. coi_summary is required — it is the only thing Property contributes to a certificate.',
          input_schema: PROPERTY_EXTRACTION_TOOL_SCHEMA,
        },
      ],
      tool_choice: { type: 'tool', name: PROPERTY_EXTRACTION_TOOL_NAME },
      messages: [{ role: 'user', content: userPrompt }],
    });

    const extractionLatency = Date.now() - extractionStart;

    // Read the tool_use block from the response content (order-independent).
    const contentBlocks = (response.content ?? []) as Array<Record<string, any>>;
    const toolBlock = contentBlocks.find(
      (b) => b?.type === 'tool_use' && b?.name === PROPERTY_EXTRACTION_TOOL_NAME,
    );
    if (!toolBlock || !toolBlock.input || typeof toolBlock.input !== 'object') {
      throw new Error('Claude did not return the expected tool_use extraction block');
    }

    // Keep the redaction guard: a model shown redacted text can echo tokens like
    // "[REDACTED_DOB]" into structured output; nullify pure-token strings.
    const rawExtraction = nullifyRedactedTokens(toolBlock.input) as RawPropertyExtraction;

    // Shape into the EXACT property_details paths + flat-dotted
    // property_field_evidence that coi_build_line reads (coi_summary.*).
    const nowIso = new Date().toISOString();
    const { propertyDetails, fieldEvidence } = shapePropertyDetails(rawExtraction, nowIso);

    // Update policy with property details + evidence.
    await supabase
      .from('policies')
      .update({
        property_details: propertyDetails,
        property_field_evidence: fieldEvidence,
        extraction_source: 'azure_di_claude',
        extraction_confidence: propertyDetails.extraction_confidence,
        extracted_from_document_id: document_id,
      })
      .eq('id', policy_id);

    // Child tables: DELETE-then-INSERT, only when the extraction produced rows.
    let locationsExtracted = 0;
    let buildingsExtracted = 0;
    let buildingCoveragesExtracted = 0;
    let deductiblesExtracted = 0;
    let interestsExtracted = 0;
    let endorsementsExtracted = 0;

    const locationRows = shapeLocationRows(rawExtraction).map((r) => ({ ...r, policy_id }));
    if (locationRows.length > 0) {
      await supabase.from('policy_property_locations').delete().eq('policy_id', policy_id);
      const { error } = await supabase.from('policy_property_locations').insert(locationRows);
      if (!error) locationsExtracted = locationRows.length;
      else console.error('[extract-property-policy] locations insert error:', error.message);
    }

    const buildingRows = shapeBuildingRows(rawExtraction).map((r) => ({ ...r, policy_id }));
    if (buildingRows.length > 0) {
      await supabase.from('policy_property_buildings').delete().eq('policy_id', policy_id);
      const { error } = await supabase.from('policy_property_buildings').insert(buildingRows);
      if (!error) buildingsExtracted = buildingRows.length;
      else console.error('[extract-property-policy] buildings insert error:', error.message);
    }

    // building_coverages keys on (policy_id, location_number, building_number)
    // — no building_id FK column exists, so we DELETE-then-INSERT independently.
    const coverageRows = shapeBuildingCoverageRows(rawExtraction).map((r) => ({ ...r, policy_id }));
    if (coverageRows.length > 0) {
      await supabase.from('policy_property_building_coverages').delete().eq('policy_id', policy_id);
      const { error } = await supabase.from('policy_property_building_coverages').insert(coverageRows);
      if (!error) buildingCoveragesExtracted = coverageRows.length;
      else console.error('[extract-property-policy] building_coverages insert error:', error.message);
    }

    const deductibleRows = shapeDeductibleRows(rawExtraction).map((r) => ({ ...r, policy_id }));
    if (deductibleRows.length > 0) {
      await supabase.from('policy_property_deductibles').delete().eq('policy_id', policy_id);
      const { error } = await supabase.from('policy_property_deductibles').insert(deductibleRows);
      if (!error) deductiblesExtracted = deductibleRows.length;
      else console.error('[extract-property-policy] deductibles insert error:', error.message);
    }

    const interestRows = shapeInterestRows(rawExtraction).map((r) => ({ ...r, policy_id }));
    if (interestRows.length > 0) {
      await supabase.from('policy_property_interests').delete().eq('policy_id', policy_id);
      const { error } = await supabase.from('policy_property_interests').insert(interestRows);
      if (!error) interestsExtracted = interestRows.length;
      else console.error('[extract-property-policy] interests insert error:', error.message);
    }

    const endorsementRows = shapeEndorsementRows(rawExtraction).map((r) => ({ ...r, policy_id }));
    if (endorsementRows.length > 0) {
      await supabase.from('policy_property_endorsements').delete().eq('policy_id', policy_id);
      const { error } = await supabase.from('policy_property_endorsements').insert(endorsementRows);
      if (!error) endorsementsExtracted = endorsementRows.length;
      else console.error('[extract-property-policy] endorsements insert error:', error.message);
    }

    // Update job as completed
    await supabase
      .from('policy_property_extraction_jobs')
      .update({
        status: 'completed',
        extraction_completed_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        llm_tokens_input: (response as any).usage?.input_tokens,
        llm_tokens_output: (response as any).usage?.output_tokens,
        llm_latency_ms: extractionLatency,
        locations_extracted: locationsExtracted,
        buildings_extracted: buildingsExtracted,
        deductibles_extracted: deductiblesExtracted,
        endorsements_extracted: endorsementsExtracted,
        overall_confidence: propertyDetails.extraction_confidence,
      })
      .eq('id', job.id);

    console.log(`[extract-property-policy] Success for policy ${policy_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        job_id: job.id,
        coi_summary: propertyDetails.coi_summary,
        locations_count: locationsExtracted,
        buildings_count: buildingsExtracted,
        building_coverages_count: buildingCoveragesExtracted,
        deductibles_count: deductiblesExtracted,
        interests_count: interestsExtracted,
        endorsements_count: endorsementsExtracted,
        confidence: propertyDetails.extraction_confidence,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[extract-property-policy] Error:', error);

    if (jobId && supabaseForCatch) {
      await supabaseForCatch
        .from('policy_property_extraction_jobs')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

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
  const startResponse = await fetch(analyzeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Key': azureKey,
    },
    body: JSON.stringify({ urlSource: documentUrl }),
  });

  if (!startResponse.ok) {
    throw new Error(`Azure DI start failed: ${startResponse.status}`);
  }

  const operationLocation = startResponse.headers.get('Operation-Location');
  if (!operationLocation) {
    throw new Error('No operation location returned from Azure');
  }

  const operationId = operationLocation.split('/').pop()?.split('?')[0];

  // Poll for results
  let result = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const statusResponse = await fetch(operationLocation, {
      headers: { 'Ocp-Apim-Subscription-Key': azureKey },
    });

    if (!statusResponse.ok) {
      throw new Error(`Azure DI status check failed: ${statusResponse.status}`);
    }

    const status = await statusResponse.json();

    if (status.status === 'succeeded') {
      result = status.analyzeResult;
      break;
    } else if (status.status === 'failed') {
      throw new Error('Azure Document Intelligence analysis failed');
    }
  }

  if (!result) {
    throw new Error('Azure Document Intelligence timed out');
  }

  return { ...result, operationId };
}

// =============================================================================
// EVIDENCE CATALOG BUILDER
// =============================================================================

function buildEvidenceCatalog(azureResult: any): EvidenceCatalog {
  const entries: Record<string, EvidenceEntry> = {};
  const byField: Record<string, string[]> = {};
  let entryIndex = 0;
  let totalConfidence = 0;
  let confidenceCount = 0;

  const pageCount = azureResult.pages?.length || 0;

  // Process key-value pairs
  if (azureResult.keyValuePairs) {
    for (const kvp of azureResult.keyValuePairs) {
      const key = kvp.key?.content || '';
      const value = kvp.value?.content || '';
      if (!value) continue;

      const evidenceId = `E${String(entryIndex++).padStart(4, '0')}`;
      const confidence = kvp.confidence || 0.8;

      totalConfidence += confidence;
      confidenceCount++;

      const boundingBox = extractBoundingBox(
        kvp.value?.boundingRegions?.[0],
        azureResult.pages
      );

      const entry: EvidenceEntry = {
        evidenceId,
        sourceType: 'key_value',
        label: key,
        value,
        normalizedValue: normalizeValue(value),
        confidence,
        pageNumber: kvp.value?.boundingRegions?.[0]?.pageNumber || 1,
        boundingBox,
        tags: matchFieldPatterns(key, value),
      };

      entries[evidenceId] = entry;

      // Index by matched fields
      for (const tag of entry.tags) {
        if (!byField[tag]) byField[tag] = [];
        byField[tag].push(evidenceId);
      }
    }
  }

  // Process tables
  if (azureResult.tables) {
    for (let tableIndex = 0; tableIndex < azureResult.tables.length; tableIndex++) {
      const table = azureResult.tables[tableIndex];
      const headers: string[] = [];

      // Get headers from first row
      for (const cell of table.cells || []) {
        if (cell.rowIndex === 0) {
          headers[cell.columnIndex] = cell.content || '';
        }
      }

      // Process data cells
      for (const cell of table.cells || []) {
        if (cell.rowIndex === 0) continue; // Skip header row
        if (!cell.content) continue;

        const evidenceId = `E${String(entryIndex++).padStart(4, '0')}`;
        const confidence = cell.confidence || 0.8;

        totalConfidence += confidence;
        confidenceCount++;

        const boundingBox = extractBoundingBox(
          cell.boundingRegions?.[0],
          azureResult.pages
        );

        const columnHeader = headers[cell.columnIndex] || '';
        const rowHeader = getRowHeader(table.cells, cell.rowIndex);

        const entry: EvidenceEntry = {
          evidenceId,
          sourceType: 'table_cell',
          label: columnHeader,
          value: cell.content,
          normalizedValue: normalizeValue(cell.content),
          confidence,
          pageNumber: cell.boundingRegions?.[0]?.pageNumber || 1,
          boundingBox,
          tableContext: {
            tableIndex,
            rowIndex: cell.rowIndex,
            columnIndex: cell.columnIndex,
            columnHeader,
            rowHeader,
          },
          tags: matchFieldPatterns(columnHeader, cell.content),
        };

        entries[evidenceId] = entry;

        for (const tag of entry.tags) {
          if (!byField[tag]) byField[tag] = [];
          byField[tag].push(evidenceId);
        }
      }
    }
  }

  return {
    entries,
    byField,
    stats: {
      totalEntries: Object.keys(entries).length,
      avgConfidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
      pageCount,
    },
  };
}

function extractBoundingBox(
  region: any,
  pages: any[]
): EvidenceEntry['boundingBox'] {
  if (!region || !region.polygon || region.polygon.length < 8) return null;

  const pageNumber = region.pageNumber || 1;
  const page = pages?.[pageNumber - 1];
  const pageWidth = page?.width || 8.5;
  const pageHeight = page?.height || 11;

  const polygon = region.polygon;
  const x = Math.min(polygon[0], polygon[6]);
  const y = Math.min(polygon[1], polygon[3]);
  const width = Math.max(polygon[2], polygon[4]) - x;
  const height = Math.max(polygon[5], polygon[7]) - y;

  return { x, y, width, height, pageWidth, pageHeight };
}

function getRowHeader(cells: any[], rowIndex: number): string {
  const firstCell = cells?.find(
    (c: any) => c.rowIndex === rowIndex && c.columnIndex === 0
  );
  return firstCell?.content || '';
}

function normalizeValue(value: string): string {
  return value
    .replace(/[\$,]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function matchFieldPatterns(label: string, value: string): string[] {
  const tags: string[] = [];
  const combined = `${label} ${value}`.toLowerCase();

  for (const [field, patterns] of Object.entries(PROPERTY_FIELD_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(combined)) {
        tags.push(field);
        break;
      }
    }
  }

  return tags;
}

// =============================================================================
// PROMPT BUILDER
// =============================================================================

function buildPropertyUserPrompt(
  evidenceCatalog: EvidenceCatalog,
  documentType: string
): string {
  const catalogJson = JSON.stringify(evidenceCatalog.entries, null, 2);

  return `## DOCUMENT TYPE
${documentType.toUpperCase()}

## EVIDENCE CATALOG
\`\`\`json
${catalogJson}
\`\`\`

## EXTRACTION TASK
Extract the Commercial Property policy details and return them by calling the ${PROPERTY_EXTRACTION_TOOL_NAME} tool.
Cite evidence IDs for every value; return null for anything not present in the catalog.
FILL coi_summary (label, limit_amount, limit_description) — it is the only thing Property prints on a certificate.
Do not extract premium. Capture blanket AI / waiver of subrogation as evidence only.`;
}
