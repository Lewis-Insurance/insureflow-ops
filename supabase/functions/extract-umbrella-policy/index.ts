/**
 * Commercial Umbrella / Excess Liability Extraction Edge Function
 *
 * Extracts Umbrella/Excess policy data using:
 * 1. Azure Document Intelligence for OCR with bounding boxes
 * 2. Evidence catalog for click-to-highlight traceability
 * 3. Claude tool-use (structured output) for evidence-backed field extraction
 *
 * House standard (mirrors extract-bap-policy / extract-cgl-policy):
 * - All shaping decisions live in the PURE, unit-tested ./shape.ts module.
 * - Claude returns a single tool_use block; its input is nullified for redaction
 *   tokens, then shaped onto the EXACT umbrella_details paths + flat-dotted
 *   umbrella_field_evidence keys that get_master_coi / coi_build_line read.
 * - NO premium is ever captured.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { anthropicBoundaryCreate } from '../_shared/modelBoundaryFetch.ts';
import { nullifyRedactedTokens } from '../_shared/floorSafety.ts';
import { cleanCarrierName, resolveCarrier } from '../_shared/carrierResolve.ts';
import { requireAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import {
  UMBRELLA_EXTRACTION_TOOL_NAME,
  UMBRELLA_EXTRACTION_TOOL_SCHEMA,
  shapeUmbrellaDetails,
  shapeUnderlyingRows,
  shapeRequirementsRow,
  shapeAdditionalInsuredRows,
  shapeEndorsementRows,
  type RawUmbrellaExtraction,
  type UmbrellaDetails,
} from './shape.ts';

// Supabase Edge Runtime global for background work that outlives the response.
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

// =============================================================================
// UMBRELLA FIELD PATTERNS FOR EVIDENCE MATCHING
// =============================================================================

const UMBRELLA_FIELD_PATTERNS: Record<string, RegExp[]> = {
  // Policy Info
  PolicyNumber: [/policy\s*(?:no|number|#)/i, /pol\s*(?:no|#)/i],
  NamedInsured: [/named\s*insured/i, /insured\s*name/i, /first\s*named/i],
  EffectiveDate: [/effective\s*date/i, /eff\s*date/i, /policy\s*period.*from/i],
  ExpirationDate: [/expiration\s*date/i, /exp\s*date/i, /policy\s*period.*to/i],
  CarrierName: [/carrier/i, /insurance\s*company/i, /insurer/i, /underwriter/i],

  // Policy Type
  UmbrellaExcess: [/umbrella/i, /excess/i, /excess\s*liability/i],
  FollowForm: [/follow\s*form/i, /follows\s*form/i],
  StandAlone: [/stand.?alone/i, /independent/i],
  Occurrence: [/occurrence/i, /claims.?made/i],

  // Limits
  PerOccurrence: [/per\s*occurrence/i, /each\s*occurrence/i, /occurrence\s*limit/i],
  Aggregate: [/aggregate/i, /annual\s*aggregate/i, /policy\s*aggregate/i],
  DefenseCosts: [/defense/i, /legal\s*defense/i, /supplementary/i],
  Territory: [/territory/i, /worldwide/i, /u\.?s\.?\s*(?:and\s*)?canada/i],

  // Retention
  Retention: [/retention/i, /s\.?i\.?r\.?/i, /self.?insured/i, /retained\s*limit/i, /deductible/i],

  // Underlying
  UnderlyingSchedule: [/underlying/i, /schedule.*insurance/i, /required\s*(?:underlying|primary)/i],
  GeneralLiability: [/general\s*liability/i, /cgl/i, /gl/i],
  CommercialAuto: [/commercial\s*auto/i, /auto\s*liability/i, /business\s*auto/i],
  EmployersLiability: [/employer.?s?\s*liability/i, /e\.?l\.?/i],
  WorkersComp: [/workers?.?\s*comp/i, /w\.?c\.?/i],

  // Minimum Requirements
  MinimumLimits: [/minimum/i, /required\s*limits/i, /minimum\s*underlying/i],

  // Drop-down
  DropDown: [/drop.?down/i, /drops\s*down/i, /broadened/i],

  // Additional Insureds
  AdditionalInsured: [/additional\s*insured/i, /add'?l\s*ins/i],
  Blanket: [/blanket/i, /automatic/i],
  WaiverOfSubrogation: [/waiver\s*of\s*subrogation/i, /subrogation\s*waived/i],

  // Endorsements
  EndorsementForm: [/form\s*(?:no|number|#)/i, /endorsement/i],
  Exclusion: [/exclusion/i, /excluded/i, /except/i],
  Limitation: [/limitation/i, /limited/i, /restricted/i],
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
// UMBRELLA EXTRACTION SYSTEM PROMPT (tool-use, house standard)
// =============================================================================

const UMBRELLA_EXTRACTION_SYSTEM_PROMPT = `You are an expert Commercial Umbrella and Excess Liability insurance document analyst.

You MUST return your extraction by calling the ${UMBRELLA_EXTRACTION_TOOL_NAME} tool. Do not answer in prose.

## CRITICAL RULES
1. ONLY extract values that appear in the evidence catalog provided. Cite the evidence IDs (E####) that support each value in that field's evidence_ids array.
2. NEVER guess or infer. If a value is not in the evidence, return null for that field.
3. NEVER fabricate an evidence ID — only use IDs that appear in the catalog.

## Policy type (this drives the ACORD 25 umbrella row)
- policy_type: "umbrella" (broadens coverage and may drop down) or "excess" (follows form of the underlying only).
- coi_summary.occurrence_or_claims_made: whether the umbrella/excess is written on an OCCURRENCE or CLAIMS-MADE basis.
- coi_summary.ded_or_retention_kind: the KIND of self-retained amount only — "deductible" (DED) or "retention" (RETENTION / SIR / self-insured retention). Put the dollar figure in retention.amount, not here.

## Limits and retention
- limits.per_occurrence: the headline each-occurrence limit ($1M, $2M, $5M, $10M common). limits.aggregate: the annual/policy aggregate.
- retention.amount: the Self-Insured Retention / retained-limit / deductible dollar amount.

## Underlying schedule (CRITICAL)
- Extract ALL scheduled underlying policies into underlying_policies: type, carrier, policy number, dates, limits.
- underlying_requirements: the minimum underlying limits the umbrella requires, if a schedule of required primary insurance is present.

## Insurer NAIC
- carrier_naic is the 5-digit INSURER (company) NAIC code. It is NOT an industry NAICS or SIC classification code. If the policy does not clearly show the insurer's NAIC number, return null — a name-to-NAIC lookup happens later.

## Premium
- Do NOT extract premium, fees, taxes, or any dollar amount that is not a coverage limit, retention, or deductible. Premium is never captured.

## Additional Insured / Waiver of Subrogation (evidence only)
- Capture BLANKET endorsements as EVIDENCE in additional_insured_evidence / waiver_of_subrogation_evidence:
  { present, basis: "blanket" | "scheduled", form_numbers: [...], source_span }.
- Name specifically-listed additional insureds in additional_insureds (ai_type "scheduled"; use "follow_underlying" only when the policy states AI status follows the underlying).
- Do NOT assert a confirmed "Y" for any specific certificate holder. You are recording what the policy shows, not certifying an endorsement.

## Dates
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

  try {
    // Initialize clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
      return new Response(
        JSON.stringify({ success: false, error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!azureEndpoint || !azureKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Azure Document Intelligence not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create extraction job
    const { data: job, error: jobError } = await supabase
      .from('policy_umbrella_extraction_jobs')
      .insert({
        policy_id,
        document_id,
        status: 'pending',
        llm_model: 'claude-sonnet-5',
      })
      .select()
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ success: false, error: `Failed to create extraction job: ${jobError?.message || 'unknown error'}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const jobId = job.id;
    const startedAt = Date.now();

    // ---------------------------------------------------------------------
    // Background extraction. OCR + Claude (Sonnet 5) can take 35-64s, which
    // exceeds the synchronous request/gateway ceiling. Run it in the
    // background via EdgeRuntime.waitUntil and let the client poll the job
    // row. The job MUST always land on 'completed' or 'failed' - never stuck.
    // ---------------------------------------------------------------------
    const runExtraction = async () => {
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
      .from('policy_umbrella_extraction_jobs')
      .update({
        status: 'ocr_processing',
        ocr_started_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    // Call Azure Document Intelligence
    console.log('[extract-umbrella-policy] Calling Azure Document Intelligence...');
    const azureResult = await callAzureDocumentIntelligence(
      signedUrlData.signedUrl,
      azureEndpoint,
      azureKey
    );

    // Update job with OCR completion
    await supabase
      .from('policy_umbrella_extraction_jobs')
      .update({
        ocr_completed_at: new Date().toISOString(),
        azure_operation_id: azureResult.operationId,
      })
      .eq('id', job.id);

    // Build evidence catalog
    console.log('[extract-umbrella-policy] Building evidence catalog...');
    const evidenceCatalog = buildEvidenceCatalog(azureResult);

    // Update job status to extracting
    await supabase
      .from('policy_umbrella_extraction_jobs')
      .update({
        status: 'extracting',
        extraction_started_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    // Store evidence catalog
    await supabase.from('policy_umbrella_evidence_catalog').upsert({
      policy_id,
      document_id,
      evidence_entries: evidenceCatalog.entries,
      evidence_by_field: evidenceCatalog.byField,
      total_entries: evidenceCatalog.stats.totalEntries,
      azure_avg_confidence: evidenceCatalog.stats.avgConfidence,
      azure_page_count: evidenceCatalog.stats.pageCount,
    });

    // Get existing policy data for context
    const { data: policyData } = await supabase
      .from('policies')
      .select('carrier, policy_number, client:clients(company_name)')
      .eq('id', policy_id)
      .single();

    // Build LLM prompt
    const userPrompt = buildUmbrellaUserPrompt(evidenceCatalog, document_type, policyData);

    // Call Claude for extraction (tool-use / structured output). `tools` +
    // `tool_choice` pass through the boundary wrapper unchanged, so redactPII
    // still redacts the evidence catalog before it leaves the process.
    console.log('[extract-umbrella-policy] Calling Claude (tool-use)...');
    const extractionStart = Date.now();

    const response = await anthropicBoundaryCreate(anthropicApiKey, {
      model: 'claude-sonnet-5',
      max_tokens: 16384, // Umbrella can have many underlying policies
      system: UMBRELLA_EXTRACTION_SYSTEM_PROMPT,
      tools: [
        {
          name: UMBRELLA_EXTRACTION_TOOL_NAME,
          description:
            'Emit the structured Commercial Umbrella / Excess extraction. Every value must be backed by evidence IDs from the catalog; return null for anything not present.',
          input_schema: UMBRELLA_EXTRACTION_TOOL_SCHEMA,
        },
      ],
      tool_choice: { type: 'tool', name: UMBRELLA_EXTRACTION_TOOL_NAME },
      messages: [{ role: 'user', content: userPrompt }],
    }, 110000);

    const extractionLatency = Date.now() - extractionStart;
    console.log(`[extract-umbrella-policy] Claude completed in ${extractionLatency}ms`);

    // Read the tool_use block from the response content (order-independent).
    const contentBlocks = (response.content ?? []) as Array<Record<string, any>>;
    const toolBlock = contentBlocks.find(
      (b) => b?.type === 'tool_use' && b?.name === UMBRELLA_EXTRACTION_TOOL_NAME,
    );
    if (!toolBlock || !toolBlock.input || typeof toolBlock.input !== 'object') {
      throw new Error('Claude did not return the expected tool_use extraction block');
    }

    // Keep the redaction guard: a model shown redacted text echoes tokens like
    // "[REDACTED_DOB]" into structured output; nullify pure-token strings.
    const rawExtraction = nullifyRedactedTokens(toolBlock.input) as RawUmbrellaExtraction;

    // Shape into the EXACT umbrella_details paths + flat-dotted
    // umbrella_field_evidence that get_master_coi / coi_build_line read.
    const nowIso = new Date().toISOString();
    const { umbrellaDetails, fieldEvidence } = shapeUmbrellaDetails(rawExtraction, nowIso);

    // Resolve the extracted carrier to the agency's canonical carrier (clean
    // rating/parenthetical suffixes -> resolve_carrier). The COI reads the blob
    // identity.carrier_name / identity.carrier_naic, so patch the shaped blob
    // (NOT the policies scalar columns). Never fatal: on no-match we keep the
    // cleaned (or raw) name and any NAIC the model already extracted.
    const rawCarrierName = rawExtraction.identity?.carrier_name?.value;
    const carrierRes = await resolveCarrier(supabase, rawCarrierName);
    umbrellaDetails.identity.carrier_name =
      carrierRes?.carrier_name ?? cleanCarrierName(rawCarrierName) ?? rawCarrierName ?? null;
    umbrellaDetails.identity.carrier_naic =
      carrierRes?.naic ?? umbrellaDetails.identity.carrier_naic ?? null;
    (umbrellaDetails.identity as any).carrier_name_raw = rawCarrierName ?? null;
    (umbrellaDetails.identity as any).carrier_match = carrierRes?.match_type ?? 'unmatched';

    // Update policy with umbrella details (like extract-cgl-policy L438-446).
    await supabase
      .from('policies')
      .update({
        umbrella_details: umbrellaDetails,
        umbrella_field_evidence: fieldEvidence,
        extraction_source: 'azure_di_claude',
        extraction_confidence: umbrellaDetails.extraction_confidence,
        extracted_from_document_id: document_id,
      })
      .eq('id', policy_id);

    // ---- Child tables: DELETE-then-INSERT, only when rows were produced. ----

    let underlyingExtracted = 0;
    const underlyingRows = shapeUnderlyingRows(rawExtraction).map((r) => ({ ...r, policy_id }));
    if (underlyingRows.length > 0) {
      await supabase.from('policy_umbrella_underlying').delete().eq('policy_id', policy_id);
      const { error } = await supabase.from('policy_umbrella_underlying').insert(underlyingRows);
      if (!error) underlyingExtracted = underlyingRows.length;
      else console.error('[extract-umbrella-policy] underlying insert error:', error.message);
    }

    // Requirements: single row per policy (UNIQUE(policy_id) -> upsert).
    const requirementsRow = shapeRequirementsRow(rawExtraction);
    if (requirementsRow) {
      const { error } = await supabase
        .from('policy_umbrella_requirements')
        .upsert({ ...requirementsRow, policy_id }, { onConflict: 'policy_id' });
      if (error) console.error('[extract-umbrella-policy] requirements upsert error:', error.message);
    }

    let additionalInsuredsExtracted = 0;
    const aiRows = shapeAdditionalInsuredRows(rawExtraction).map((r) => ({ ...r, policy_id }));
    if (aiRows.length > 0) {
      await supabase.from('policy_umbrella_additional_insureds').delete().eq('policy_id', policy_id);
      const { error } = await supabase.from('policy_umbrella_additional_insureds').insert(aiRows);
      if (!error) additionalInsuredsExtracted = aiRows.length;
      else console.error('[extract-umbrella-policy] additional_insureds insert error:', error.message);
    }

    let endorsementsExtracted = 0;
    const endorsementRows = shapeEndorsementRows(rawExtraction).map((r) => ({ ...r, policy_id }));
    if (endorsementRows.length > 0) {
      await supabase.from('policy_umbrella_endorsements').delete().eq('policy_id', policy_id);
      const { error } = await supabase.from('policy_umbrella_endorsements').insert(endorsementRows);
      if (!error) endorsementsExtracted = endorsementRows.length;
      else console.error('[extract-umbrella-policy] endorsements insert error:', error.message);
    }

    // Compliance analysis over the shaped rows.
    const complianceIssues = runComplianceAnalysis(umbrellaDetails, requirementsRow, underlyingRows);

    // Update job as completed
    const usage = (response as any).usage;
    await supabase
      .from('policy_umbrella_extraction_jobs')
      .update({
        status: 'completed',
        extraction_completed_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        llm_tokens_input: usage?.input_tokens,
        llm_tokens_output: usage?.output_tokens,
        llm_latency_ms: extractionLatency,
        underlying_policies_extracted: underlyingExtracted,
        additional_insureds_extracted: additionalInsuredsExtracted,
        endorsements_extracted: endorsementsExtracted,
        compliance_issues_count: complianceIssues.length,
        overall_confidence: umbrellaDetails.extraction_confidence,
      })
      .eq('id', job.id);

    };

    // Kick off the extraction in the background and GUARANTEE the job records
    // a terminal state even if runExtraction throws (so it is never stuck).
    EdgeRuntime.waitUntil(
      runExtraction().catch(async (error) => {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[extract-umbrella-policy] Error (background):', error);
        try {
          await supabase
            .from('policy_umbrella_extraction_jobs')
            .update({
              status: 'failed',
              error_message: `${msg} | ${Date.now() - startedAt}ms`.slice(0, 500),
              completed_at: new Date().toISOString(),
            })
            .eq('id', jobId);
        } catch (_e) {
          // best effort - the failure update must not throw
        }
      })
    );

    // Respond immediately; the client polls the job row for the outcome.
    return new Response(
      JSON.stringify({ success: true, job_id: jobId, status: 'processing' }),
      { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    // Synchronous-phase failure (before the job was created / before we
    // responded 202). No job row owns a terminal state here.
    console.error('[extract-umbrella-policy] Error (sync phase):', error);
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

      for (const cell of table.cells || []) {
        if (cell.rowIndex === 0) {
          headers[cell.columnIndex] = cell.content || '';
        }
      }

      for (const cell of table.cells || []) {
        if (cell.rowIndex === 0) continue;
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

  for (const [field, patterns] of Object.entries(UMBRELLA_FIELD_PATTERNS)) {
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

function buildUmbrellaUserPrompt(
  evidenceCatalog: EvidenceCatalog,
  documentType: string,
  policyData: any
): string {
  const lines: string[] = [];
  lines.push(`## Document Type: ${documentType.toUpperCase()}`);
  lines.push('');

  if (policyData) {
    lines.push('## Existing Policy Context');
    lines.push(`Carrier: ${policyData.carrier || 'Unknown'}`);
    lines.push(`Policy Number: ${policyData.policy_number || 'Unknown'}`);
    lines.push(`Named Insured: ${policyData.client?.company_name || 'Unknown'}`);
    lines.push('');
  }

  lines.push('## Evidence Catalog');
  lines.push(`Total entries: ${evidenceCatalog.stats.totalEntries}`);
  lines.push(`Avg confidence: ${(evidenceCatalog.stats.avgConfidence * 100).toFixed(1)}%`);
  lines.push('');

  const byPage: Record<number, EvidenceEntry[]> = {};
  for (const e of Object.values(evidenceCatalog.entries)) {
    if (!byPage[e.pageNumber]) byPage[e.pageNumber] = [];
    byPage[e.pageNumber].push(e);
  }

  for (const pageNum of Object.keys(byPage).map(Number).sort((a, b) => a - b)) {
    lines.push(`### Page ${pageNum}`);
    for (const e of byPage[pageNum]) {
      const label = e.label ? `[${e.label}]` : '';
      const conf = `(${(e.confidence * 100).toFixed(0)}%)`;
      const tags = e.tags.length ? ` {${e.tags.join(', ')}}` : '';
      const val = e.value.length > 120 ? e.value.substring(0, 120) + '...' : e.value;
      lines.push(`- **${e.evidenceId}** ${label}: "${val}" ${conf}${tags}`);
    }
    lines.push('');
  }

  lines.push('## Extraction Task');
  lines.push(
    `Extract the Commercial Umbrella / Excess policy details and return them by calling the ${UMBRELLA_EXTRACTION_TOOL_NAME} tool.`,
  );
  lines.push('Cite evidence IDs for every value; return null for anything not present in the catalog.');
  lines.push('Do not extract premium. Capture blanket AI / waiver of subrogation as evidence only.');

  return lines.join('\n');
}

// =============================================================================
// COMPLIANCE ANALYSIS (over the shaped rows)
// =============================================================================

function runComplianceAnalysis(
  umbrellaDetails: UmbrellaDetails,
  requirementsRow: Record<string, unknown> | null,
  underlyingRows: Array<Record<string, unknown>>
): { type: string; severity: string; message: string }[] {
  const issues: { type: string; severity: string; message: string }[] = [];

  if (!requirementsRow || underlyingRows.length === 0) {
    return issues;
  }

  // Required underlying lines must be scheduled.
  if (requirementsRow.gl_each_occurrence != null &&
      !underlyingRows.some((u) => u.underlying_type === 'general_liability')) {
    issues.push({
      type: 'missing_underlying',
      severity: 'high',
      message: 'Required General Liability underlying not scheduled',
    });
  }

  if (requirementsRow.auto_liability != null &&
      !underlyingRows.some((u) => u.underlying_type === 'commercial_auto')) {
    issues.push({
      type: 'missing_underlying',
      severity: 'high',
      message: 'Required Commercial Auto underlying not scheduled',
    });
  }

  // Underlying must not expire before the umbrella.
  const umbrellaExp = umbrellaDetails.dates.expiration_date
    ? new Date(umbrellaDetails.dates.expiration_date)
    : null;
  if (umbrellaExp && !Number.isNaN(umbrellaExp.getTime())) {
    for (const u of underlyingRows) {
      const exp = u.expiration_date ? new Date(String(u.expiration_date)) : null;
      if (exp && !Number.isNaN(exp.getTime()) && exp < umbrellaExp) {
        issues.push({
          type: 'term_mismatch',
          severity: 'high',
          message: `${u.underlying_type || 'Underlying'} expires before umbrella`,
        });
      }
    }
  }

  return issues;
}
