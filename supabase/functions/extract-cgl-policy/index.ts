/**
 * CGL Policy Extraction Edge Function
 *
 * Extracts Commercial General Liability policy data using:
 * 1. Azure Document Intelligence for OCR with bounding boxes
 * 2. Evidence catalog for click-to-highlight traceability
 * 3. Claude for intelligent field extraction with evidence IDs
 *
 * Flow:
 * 1. Create extraction job record
 * 2. Get document URL from storage
 * 3. Call Azure Document Intelligence
 * 4. Build evidence catalog with stable IDs
 * 5. Send evidence + prompts to Claude
 * 6. Parse structured response
 * 7. Store results with evidence linkage
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { anthropicBoundaryCreate, anthropicResponseText } from '../_shared/modelBoundaryFetch.ts';
import { nullifyRedactedTokens } from '../_shared/floorSafety.ts';
import { cleanCarrierName, resolveCarrier } from '../_shared/carrierResolve.ts';
import { requireAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

// Supabase Edge Runtime global for background work that outlives the response.
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

// =============================================================================
// CGL FIELD PATTERNS FOR EVIDENCE MATCHING
// =============================================================================

const CGL_FIELD_PATTERNS: Record<string, RegExp[]> = {
  // Limits
  EachOccurrence: [/each\s*occurrence/i, /per\s*occurrence/i, /occurrence\s*limit/i],
  GeneralAggregate: [/general\s*aggregate/i, /policy\s*aggregate/i],
  ProductsCompletedOps: [/products?.completed/i, /prod.comp/i, /p&co/i, /products?.operations/i],
  PersonalAdvertising: [/personal.*advertising/i, /personal.*adv.*injury/i, /p&ai/i],
  DamageToRented: [/damage.*rented/i, /fire\s*damage/i, /rented\s*premises/i, /fire\s*legal/i],
  MedicalExpense: [/medical\s*expense/i, /med\s*exp/i, /medical\s*payments/i],

  // Policy Info
  PolicyNumber: [/policy\s*(?:no|number|#)/i, /pol\s*(?:no|#)/i],
  NamedInsured: [/named\s*insured/i, /insured\s*name/i, /first\s*named/i],
  EffectiveDate: [/effective\s*date/i, /eff\s*date/i, /policy\s*period.*from/i],
  ExpirationDate: [/expiration\s*date/i, /exp\s*date/i, /policy\s*period.*to/i],
  CarrierName: [/carrier/i, /insurance\s*company/i, /insurer/i, /underwriter/i],

  // Coverage Options
  OccurrenceForm: [/occurrence\s*form/i, /occurrence\s*basis/i],
  ClaimsMade: [/claims.made/i, /claims\s*made/i],
  RetroactiveDate: [/retroactive\s*date/i, /retro\s*date/i, /prior\s*acts/i],

  // Classifications
  ClassCode: [/class\s*code/i, /classification\s*code/i, /iso\s*class/i],
  Exposure: [/exposure/i, /sales/i, /payroll/i, /gross\s*receipts/i, /sq\s*ft/i],
  Rate: [/rate/i, /per\s*\$?1,?000/i],

  // Additional Insureds
  AdditionalInsured: [/additional\s*insured/i, /add'?l\s*ins/i, /a\.?i\.?/i],
  PrimaryNoncontributory: [/primary.*non.?contributory/i, /primary\s*and\s*non/i],
  WaiverSubrogation: [/waiver.*subrogation/i, /waiver.*transfer.*rights/i],

  // Endorsements
  EndorsementForm: [/cg\s*\d{2}\s*\d{2}/i, /form\s*(?:no|number|#)/i],

  // Deductible
  Deductible: [/deductible/i, /ded/i],
  SIR: [/self.insured\s*retention/i, /s\.?i\.?r\.?/i],
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
      .from('policy_cgl_extraction_jobs')
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
      .from('policy_cgl_extraction_jobs')
      .update({
        status: 'ocr_processing',
        ocr_started_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    // Call Azure Document Intelligence
    console.log('Calling Azure Document Intelligence...');
    const azureResult = await callAzureDocumentIntelligence(
      signedUrlData.signedUrl,
      azureEndpoint,
      azureKey
    );

    // Update job with OCR completion
    await supabase
      .from('policy_cgl_extraction_jobs')
      .update({
        ocr_completed_at: new Date().toISOString(),
        azure_operation_id: azureResult.operationId,
      })
      .eq('id', job.id);

    // Build evidence catalog
    console.log('Building evidence catalog...');
    const evidenceCatalog = buildEvidenceCatalog(azureResult);

    // Update job status to extracting
    await supabase
      .from('policy_cgl_extraction_jobs')
      .update({
        status: 'extracting',
        extraction_started_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    // Get existing policy data for context
    const { data: policyData } = await supabase
      .from('policies')
      .select('carrier, policy_number, client:clients(company_name)')
      .eq('id', policy_id)
      .single();

    // Call Claude for extraction
    console.log('Calling Claude for CGL extraction...');
    const extractionStart = Date.now();

    const systemPrompt = getCGLSystemPrompt();
    const userPrompt = buildCGLUserPrompt(evidenceCatalog, document_type, policyData);

    const response = await anthropicBoundaryCreate(anthropicApiKey, {
      model: 'claude-sonnet-5',
      max_tokens: 16384,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }, 110000);

    const extractionLatency = Date.now() - extractionStart;

    // Parse response - Claude usually wraps the JSON in a ```json ... ``` fence.
    // Strip it robustly, tolerating a missing closing fence (truncated response).
    const responseText = anthropicResponseText(response);
    const jsonText = responseText.trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const extractedData = nullifyRedactedTokens(JSON.parse(jsonText));

    // Store evidence catalog
    await supabase.from('policy_cgl_evidence_catalog').upsert({
      policy_id,
      document_id,
      evidence_entries: evidenceCatalog.entries,
      evidence_by_field: evidenceCatalog.byField,
      total_entries: evidenceCatalog.stats.totalEntries,
      azure_avg_confidence: evidenceCatalog.stats.avgConfidence,
      azure_page_count: evidenceCatalog.stats.pageCount,
    });

    // Process and store locations
    let locationsExtracted = 0;
    if (extractedData.locations && Array.isArray(extractedData.locations)) {
      for (const loc of extractedData.locations) {
        const locationData = {
          policy_id,
          location_number: loc.location_number || 1,
          street: loc.street,
          city: loc.city,
          state: loc.state,
          zip: loc.zip,
          description: loc.description,
          evidence_ids: collectEvidenceIds(loc),
          extraction_confidence: calculateAvgConfidence(loc),
          extraction_status: determineStatus(loc),
        };

        await supabase.from('policy_cgl_locations').upsert(locationData, {
          onConflict: 'policy_id,location_number',
        });
        locationsExtracted++;
      }
    }

    // Process and store classifications
    let classificationsExtracted = 0;
    if (extractedData.classifications && Array.isArray(extractedData.classifications)) {
      // Delete existing classifications for this policy
      await supabase.from('policy_cgl_classifications').delete().eq('policy_id', policy_id);

      for (const cls of extractedData.classifications) {
        const classData = {
          policy_id,
          class_code: cls.class_code,
          description: cls.description || 'Unknown',
          exposure_basis: cls.exposure_basis,
          exposure_amount: cls.exposure_amount,
          rate: cls.rate,
          // premium intentionally NOT captured (agency rule: premium never captured, any line, any doc)
          is_products_completed_ops: cls.is_products_completed_ops || false,
          location_number: cls.location_number,
          evidence_ids: collectEvidenceIds(cls),
          extraction_confidence: calculateAvgConfidence(cls),
          extraction_status: determineStatus(cls),
        };

        await supabase.from('policy_cgl_classifications').insert(classData);
        classificationsExtracted++;
      }
    }

    // Process and store additional insureds
    let additionalInsuredsExtracted = 0;
    if (extractedData.additional_insureds && Array.isArray(extractedData.additional_insureds)) {
      // Delete existing AIs for this policy
      await supabase.from('policy_cgl_additional_insureds').delete().eq('policy_id', policy_id);

      for (const ai of extractedData.additional_insureds) {
        const aiData = {
          policy_id,
          name: ai.name || 'Unknown',
          street: ai.address?.street,
          city: ai.address?.city,
          state: ai.address?.state,
          zip: ai.address?.zip,
          ai_type: ai.ai_type || 'other',
          primary_noncontributory: ai.primary_noncontributory || false,
          waiver_of_subrogation: ai.waiver_of_subrogation || false,
          per_project: ai.per_project || false,
          project_name: ai.project_name,
          endorsement_form: ai.endorsement_form,
          evidence_ids: collectEvidenceIds(ai),
          extraction_confidence: calculateAvgConfidence(ai),
          extraction_status: determineStatus(ai),
        };

        await supabase.from('policy_cgl_additional_insureds').insert(aiData);
        additionalInsuredsExtracted++;
      }
    }

    // Process and store endorsements
    let endorsementsExtracted = 0;
    if (extractedData.endorsements && Array.isArray(extractedData.endorsements)) {
      // Delete existing endorsements for this policy
      await supabase.from('policy_cgl_endorsements').delete().eq('policy_id', policy_id);

      for (const end of extractedData.endorsements) {
        const endData = {
          policy_id,
          form_number: end.form_number || 'Unknown',
          edition_date: end.edition_date,
          description: end.description || 'Endorsement',
          evidence_ids: collectEvidenceIds(end),
          extraction_confidence: calculateAvgConfidence(end),
          extraction_status: determineStatus(end),
        };

        await supabase.from('policy_cgl_endorsements').insert(endData);
        endorsementsExtracted++;
      }
    }

    // Build CGL details object
    const cglDetails = {
      identity: {
        carrier_name: extractedData.identity?.carrier_name?.value,
        carrier_naic: extractedData.identity?.carrier_naic?.value,
        policy_number: extractedData.identity?.policy_number?.value,
        transaction_type: extractedData.identity?.transaction_type?.value,
        named_insured: extractedData.identity?.named_insured?.value,
        dba: extractedData.identity?.dba?.value,
        mailing_address: {
          street: extractedData.identity?.mailing_address?.street?.value,
          city: extractedData.identity?.mailing_address?.city?.value,
          state: extractedData.identity?.mailing_address?.state?.value,
          zip: extractedData.identity?.mailing_address?.zip?.value,
        },
        fein: extractedData.identity?.fein?.value,
      },
      dates: {
        effective_date: extractedData.dates?.effective_date?.value,
        expiration_date: extractedData.dates?.expiration_date?.value,
        issue_date: extractedData.dates?.issue_date?.value,
      },
      coverage_options: {
        policy_form: extractedData.coverage_options?.policy_form?.value || 'occurrence',
        defense_costs: extractedData.coverage_options?.defense_costs?.value || 'outside_limits',
        claims_made_details: extractedData.coverage_options?.claims_made_details
          ? {
              retroactive_date: extractedData.coverage_options.claims_made_details.retroactive_date?.value,
              erp_available: extractedData.coverage_options.claims_made_details.erp_available?.value,
            }
          : undefined,
      },
      limits: {
        each_occurrence: extractedData.limits?.each_occurrence?.value,
        damage_to_rented_premises: extractedData.limits?.damage_to_rented_premises?.value,
        medical_expense: extractedData.limits?.medical_expense?.value,
        personal_advertising_injury: extractedData.limits?.personal_advertising_injury?.value,
        general_aggregate: extractedData.limits?.general_aggregate?.value,
        products_completed_ops_aggregate: extractedData.limits?.products_completed_ops_aggregate?.value,
        aggregate_applies_per: extractedData.limits?.aggregate_applies_per?.value,
      },
      deductible: extractedData.deductible?.type?.value !== 'none'
        ? {
            type: extractedData.deductible?.type?.value,
            per_occurrence: extractedData.deductible?.per_occurrence?.value,
            property_damage: extractedData.deductible?.property_damage?.value,
          }
        : undefined,
      extraction_source: 'azure_di_claude',
      extraction_confidence: calculateOverallConfidence(extractedData),
      extracted_at: new Date().toISOString(),
    };

    // Resolve the extracted carrier name to the agency's canonical carrier
    // (clean rating/parenthetical suffixes -> resolve_carrier). Writing the
    // canonical name + NAIC into the blob identity is what makes the COI
    // correct (get_master_coi reads identity.carrier_name / identity.carrier_naic).
    // Never fatal: on no-match we keep the cleaned (or raw) name.
    const rawCarrierName = extractedData.identity?.carrier_name?.value;
    const carrierRes = await resolveCarrier(supabase, rawCarrierName);
    cglDetails.identity.carrier_name =
      carrierRes?.carrier_name ?? cleanCarrierName(rawCarrierName) ?? rawCarrierName ?? null;
    cglDetails.identity.carrier_naic =
      carrierRes?.naic ?? cglDetails.identity.carrier_naic ?? null;
    (cglDetails.identity as any).carrier_name_raw = rawCarrierName ?? null;
    (cglDetails.identity as any).carrier_match = carrierRes?.match_type ?? 'unmatched';

    // Build field evidence mapping
    const fieldEvidence = buildFieldEvidenceMapping(extractedData);

    // Update policy with CGL details
    await supabase
      .from('policies')
      .update({
        cgl_details: cglDetails,
        cgl_field_evidence: fieldEvidence,
        extraction_source: 'azure_di_claude',
        extraction_confidence: cglDetails.extraction_confidence,
      })
      .eq('id', policy_id);

    // Calculate stats
    const stats = calculateExtractionStats(extractedData);

    // Update job as completed
    await supabase
      .from('policy_cgl_extraction_jobs')
      .update({
        status: 'completed',
        extraction_completed_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        llm_tokens_input: response.usage?.input_tokens,
        llm_tokens_output: response.usage?.output_tokens,
        llm_latency_ms: extractionLatency,
        fields_extracted: stats.fieldsExtracted,
        fields_auto_applied: stats.fieldsAutoApplied,
        fields_needs_review: stats.fieldsNeedsReview,
        fields_not_found: stats.fieldsNotFound,
        fields_conflict: stats.fieldsConflict,
        locations_extracted: locationsExtracted,
        classifications_extracted: classificationsExtracted,
        additional_insureds_extracted: additionalInsuredsExtracted,
        endorsements_extracted: endorsementsExtracted,
        overall_confidence: cglDetails.extraction_confidence,
      })
      .eq('id', job.id);

    };

    // Kick off the extraction in the background and GUARANTEE the job records
    // a terminal state even if runExtraction throws (so it is never stuck).
    EdgeRuntime.waitUntil(
      runExtraction().catch(async (error) => {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('CGL extraction error (background):', error);
        try {
          await supabase
            .from('policy_cgl_extraction_jobs')
            .update({ status: 'failed', error_message: `${msg} | ${Date.now() - startedAt}ms`.slice(0, 500) })
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
    console.error('CGL extraction error (sync phase):', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: msg }),
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

  for (const [field, patterns] of Object.entries(CGL_FIELD_PATTERNS)) {
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
// PROMPT BUILDERS
// =============================================================================

function getCGLSystemPrompt(): string {
  return `You are an expert Commercial General Liability (CGL) policy data extractor for insurance professionals.

## YOUR ROLE
Extract structured policy data from CGL documents (quotes, binders, policies, endorsements).
Every extracted value MUST cite its source evidence ID(s) from the OCR catalog.

## CRITICAL RULES

### 1. EVIDENCE-BASED EXTRACTION ONLY
- ONLY extract values that appear in the evidence catalog
- NEVER guess, infer, or use industry defaults
- If a field is not in the evidence, set its value to null
- Each scalar field MUST include an evidence_ids array linking to source

### 2. COMPACT OUTPUT (IMPORTANT - keeps the response small)
- Do NOT emit "confidence" or "status" anywhere in the output.
- Scalar fields return ONLY { "value": ..., "evidence_ids": [...] }.
- Array items (locations, classifications, additional_insureds, endorsements)
  return FLAT objects with only their data fields - no value/evidence_ids wrappers.
- Keep every "description" SHORT (a few words), never full sentences.

### 3. CGL-SPECIFIC KNOWLEDGE

STANDARD LIMITS (ISO CG 00 01):
- Each Occurrence
- Damage to Rented Premises (Fire Damage)
- Medical Expense (per person)
- Personal & Advertising Injury
- General Aggregate
- Products/Completed Operations Aggregate

AGGREGATE APPLICABILITY:
- Per Policy (default)
- Per Project (CG 25 03)
- Per Location (CG 25 04)

COMMON AI ENDORSEMENTS:
- CG 20 10: Ongoing Operations
- CG 20 37: Completed Operations
- CG 24 04: Waiver of Subrogation
- CG 20 01: Primary and Noncontributory

### 4. LIMIT NORMALIZATION
- "$1,000,000" → 1000000
- "$1M" → 1000000
- "$500K" → 500000

## OUTPUT FORMAT
Return valid JSON matching the schema provided.
Never include explanatory text outside the JSON structure.`;
}

function buildCGLUserPrompt(
  evidenceCatalog: EvidenceCatalog,
  documentType: string,
  policyData: any
): string {
  const catalogJson = JSON.stringify(evidenceCatalog.entries, null, 2);

  return `## DOCUMENT TYPE
${documentType.toUpperCase()}

${policyData ? `## EXISTING POLICY DATA
Carrier: ${policyData.carrier || 'Unknown'}
Policy Number: ${policyData.policy_number || 'Unknown'}
Named Insured: ${policyData.client?.company_name || 'Unknown'}
` : ''}

## EVIDENCE CATALOG
\`\`\`json
${catalogJson}
\`\`\`

## EXTRACTION SCHEMA

Extract CGL policy data.

SCALAR fields (identity.*, dates.*, coverage_options.*, limits.*, deductible.*)
are returned as { "value": <normalized value>, "evidence_ids": [<ids>] } ONLY.
Do NOT add confidence or status.

ARRAY items (locations, classifications, additional_insureds, endorsements) are
FLAT objects with only the data fields shown under "ARRAY ITEM SHAPES" below - no
value/evidence_ids/confidence/status wrappers. Keep every "description" SHORT
(a few words). Return an empty array when none are present.

\`\`\`json
{
  "identity": {
    "carrier_name": { "value": "", "evidence_ids": [] },
    "carrier_naic": { "value": null, "evidence_ids": [] },
    "policy_number": { "value": "", "evidence_ids": [] },
    "transaction_type": { "value": "", "evidence_ids": [] },
    "named_insured": { "value": "", "evidence_ids": [] },
    "dba": { "value": null, "evidence_ids": [] },
    "mailing_address": {
      "street": { "value": "", "evidence_ids": [] },
      "city": { "value": "", "evidence_ids": [] },
      "state": { "value": "", "evidence_ids": [] },
      "zip": { "value": "", "evidence_ids": [] }
    },
    "fein": { "value": null, "evidence_ids": [] }
  },
  "dates": {
    "effective_date": { "value": "", "evidence_ids": [] },
    "expiration_date": { "value": "", "evidence_ids": [] },
    "issue_date": { "value": null, "evidence_ids": [] }
  },
  "coverage_options": {
    "policy_form": { "value": "occurrence", "evidence_ids": [] },
    "defense_costs": { "value": "outside_limits", "evidence_ids": [] },
    "claims_made_details": {
      "retroactive_date": { "value": null, "evidence_ids": [] },
      "erp_available": { "value": false, "evidence_ids": [] }
    }
  },
  "limits": {
    "each_occurrence": { "value": 0, "evidence_ids": [] },
    "damage_to_rented_premises": { "value": 0, "evidence_ids": [] },
    "medical_expense": { "value": 0, "evidence_ids": [] },
    "personal_advertising_injury": { "value": 0, "evidence_ids": [] },
    "general_aggregate": { "value": 0, "evidence_ids": [] },
    "products_completed_ops_aggregate": { "value": 0, "evidence_ids": [] },
    "aggregate_applies_per": { "value": null, "evidence_ids": [] }
  },
  "deductible": {
    "type": { "value": "none", "evidence_ids": [] },
    "per_occurrence": { "value": null, "evidence_ids": [] },
    "property_damage": { "value": null, "evidence_ids": [] }
  },
  "locations": [],
  "classifications": [],
  "additional_insureds": [],
  "endorsements": []
}
\`\`\`

## ARRAY ITEM SHAPES (flat objects - no value/evidence/confidence/status wrappers)

locations[] item:
{ "location_number": 1, "street": "", "city": "", "state": "", "zip": "", "description": "" }

classifications[] item:
{ "class_code": "", "description": "", "exposure_basis": "", "exposure_amount": null, "rate": null, "is_products_completed_ops": false, "location_number": null }

additional_insureds[] item:
{ "name": "", "address": { "street": "", "city": "", "state": "", "zip": "" }, "ai_type": "other", "primary_noncontributory": false, "waiver_of_subrogation": false, "per_project": false, "project_name": null, "endorsement_form": null }

endorsements[] item:
{ "form_number": "", "edition_date": null, "description": "" }

REMEMBER: NO GUESSING. Only extract what's in the evidence. No confidence or status. SHORT descriptions.`;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function collectEvidenceIds(obj: any): string[] {
  const ids: string[] = [];

  function traverse(o: any) {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o.evidence_ids)) {
      ids.push(...o.evidence_ids);
    }
    for (const key of Object.keys(o)) {
      if (typeof o[key] === 'object') {
        traverse(o[key]);
      }
    }
  }

  traverse(obj);
  return [...new Set(ids)];
}

function calculateAvgConfidence(obj: any): number {
  const confidences: number[] = [];

  function traverse(o: any) {
    if (!o || typeof o !== 'object') return;
    if (typeof o.confidence === 'number') {
      confidences.push(o.confidence);
    }
    for (const key of Object.keys(o)) {
      if (typeof o[key] === 'object') {
        traverse(o[key]);
      }
    }
  }

  traverse(obj);
  // Trimmed array items no longer carry per-field confidence; default to a
  // sensible high value instead of 0/NaN so extraction_confidence stays useful.
  return confidences.length > 0
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : 0.9;
}

function determineStatus(obj: any): string {
  const statuses: string[] = [];

  function traverse(o: any) {
    if (!o || typeof o !== 'object') return;
    if (typeof o.status === 'string') {
      statuses.push(o.status);
    }
    for (const key of Object.keys(o)) {
      if (typeof o[key] === 'object') {
        traverse(o[key]);
      }
    }
  }

  traverse(obj);

  // Trimmed array items no longer carry a status. Default to AUTO_APPLIED
  // (an empty array would otherwise make `.every()` below return NOT_FOUND).
  if (statuses.length === 0) return 'AUTO_APPLIED';
  if (statuses.includes('CONFLICT')) return 'CONFLICT';
  if (statuses.includes('LOW_CONFIDENCE')) return 'LOW_CONFIDENCE';
  if (statuses.includes('NEEDS_REVIEW')) return 'NEEDS_REVIEW';
  if (statuses.every((s) => s === 'NOT_FOUND')) return 'NOT_FOUND';
  return 'AUTO_APPLIED';
}

function calculateOverallConfidence(data: any): number {
  const confidences: number[] = [];

  function traverse(o: any) {
    if (!o || typeof o !== 'object') return;
    if (typeof o.confidence === 'number' && o.status !== 'NOT_FOUND') {
      confidences.push(o.confidence);
    }
    for (const key of Object.keys(o)) {
      if (typeof o[key] === 'object') {
        traverse(o[key]);
      }
    }
  }

  traverse(data);
  // Fields no longer emit confidence after the output trim; fall back to a
  // sensible default so the persisted extraction_confidence is not 0.
  return confidences.length > 0
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : 0.9;
}

function buildFieldEvidenceMapping(data: any): Record<string, string[]> {
  const mapping: Record<string, string[]> = {};

  function traverse(o: any, path: string) {
    if (!o || typeof o !== 'object') return;

    if (Array.isArray(o.evidence_ids) && o.evidence_ids.length > 0) {
      mapping[path] = o.evidence_ids;
    }

    for (const key of Object.keys(o)) {
      if (typeof o[key] === 'object' && !Array.isArray(o[key])) {
        traverse(o[key], path ? `${path}.${key}` : key);
      }
    }
  }

  traverse(data, '');
  return mapping;
}

function calculateExtractionStats(data: any): {
  fieldsExtracted: number;
  fieldsAutoApplied: number;
  fieldsNeedsReview: number;
  fieldsNotFound: number;
  fieldsConflict: number;
} {
  let fieldsExtracted = 0;
  let fieldsAutoApplied = 0;
  const fieldsNeedsReview = 0;
  let fieldsNotFound = 0;
  const fieldsConflict = 0;

  const isEmpty = (v: any) => v === null || v === undefined || v === '';

  function traverse(o: any) {
    if (!o || typeof o !== 'object') return;

    // After the output trim, scalar fields are leaves shaped { value, evidence_ids }
    // (status/confidence removed). Count those; found -> AUTO_APPLIED, else NOT_FOUND.
    // NEEDS_REVIEW/CONFLICT can no longer be derived without status, so they stay 0.
    if (Object.prototype.hasOwnProperty.call(o, 'value') && Array.isArray(o.evidence_ids)) {
      fieldsExtracted++;
      if (isEmpty(o.value)) {
        fieldsNotFound++;
      } else {
        fieldsAutoApplied++;
      }
      return; // leaf - nothing more to descend into
    }

    for (const key of Object.keys(o)) {
      if (o[key] && typeof o[key] === 'object') {
        traverse(o[key]);
      }
    }
  }

  traverse(data);

  return {
    fieldsExtracted,
    fieldsAutoApplied,
    fieldsNeedsReview,
    fieldsNotFound,
    fieldsConflict,
  };
}
