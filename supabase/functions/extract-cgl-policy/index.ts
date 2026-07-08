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
import { requireAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

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

  let supabase: ReturnType<typeof createClient> | null = null;
  let jobId: string | null = null;
  const startedAt = Date.now();

  try {
    // Initialize clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    supabase = createClient(supabaseUrl, supabaseServiceKey);

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
      .from('policy_cgl_extraction_jobs')
      .insert({
        policy_id,
        document_id,
        status: 'pending',
        llm_model: 'claude-haiku-4-5-20251001',
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
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const extractionLatency = Date.now() - extractionStart;

    // Parse response
    const responseText = anthropicResponseText(response);
    const jsonMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/) || [null, responseText];
    const extractedData = nullifyRedactedTokens(JSON.parse(jsonMatch[1] || responseText));

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
          location_number: loc.location_number?.value || 1,
          street: loc.street?.value,
          city: loc.city?.value,
          state: loc.state?.value,
          zip: loc.zip?.value,
          description: loc.description?.value,
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
          class_code: cls.class_code?.value,
          description: cls.description?.value || 'Unknown',
          exposure_basis: cls.exposure_basis?.value,
          exposure_amount: cls.exposure_amount?.value,
          rate: cls.rate?.value,
          // premium intentionally NOT captured (agency rule: premium never captured, any line, any doc)
          is_products_completed_ops: cls.is_products_completed_ops?.value || false,
          location_number: cls.location_number?.value,
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
          name: ai.name?.value || 'Unknown',
          street: ai.address?.street?.value,
          city: ai.address?.city?.value,
          state: ai.address?.state?.value,
          zip: ai.address?.zip?.value,
          ai_type: ai.ai_type?.value || 'other',
          primary_noncontributory: ai.primary_noncontributory?.value || false,
          waiver_of_subrogation: ai.waiver_of_subrogation?.value || false,
          per_project: ai.per_project?.value || false,
          project_name: ai.project_name?.value,
          endorsement_form: ai.endorsement_form?.value,
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
          form_number: end.form_number?.value || 'Unknown',
          edition_date: end.edition_date?.value,
          description: end.description?.value || 'Endorsement',
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

    return new Response(
      JSON.stringify({
        success: true,
        job_id: job.id,
        locations_count: locationsExtracted,
        classifications_count: classificationsExtracted,
        additional_insureds_count: additionalInsuredsExtracted,
        endorsements_count: endorsementsExtracted,
        confidence: cglDetails.extraction_confidence,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('CGL extraction error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';

    // Record the failure on the job so it is never stuck at "extracting" and
    // the actual error is visible for diagnosis.
    if (supabase && jobId) {
      try {
        await supabase
          .from('policy_cgl_extraction_jobs')
          .update({ status: 'failed', error_message: `${msg} | ${Date.now() - startedAt}ms`.slice(0, 500) })
          .eq('id', jobId);
      } catch (_e) {
        // best effort - do not mask the original error
      }
    }

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
- If a field is not in the evidence, return status: "NOT_FOUND"
- Each field MUST include evidence_ids array linking to source

### 2. CONFIDENCE SCORING
Rate your confidence for each extracted field:
- 0.95-1.00: Exact match with clear label
- 0.85-0.94: Strong match from context
- 0.70-0.84: Reasonable inference from nearby values
- Below 0.70: Mark as NEEDS_REVIEW

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

Extract CGL policy data. For each field include:
- value: The extracted value (normalized)
- evidence_ids: Array of evidence IDs
- confidence: Score 0.0-1.0
- status: "AUTO_APPLIED" | "NEEDS_REVIEW" | "LOW_CONFIDENCE" | "NOT_FOUND" | "CONFLICT"

\`\`\`json
{
  "identity": {
    "carrier_name": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
    "carrier_naic": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "policy_number": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
    "transaction_type": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
    "named_insured": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
    "dba": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "mailing_address": {
      "street": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "city": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "state": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "zip": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" }
    },
    "fein": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "dates": {
    "effective_date": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
    "expiration_date": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
    "issue_date": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "coverage_options": {
    "policy_form": { "value": "occurrence", "evidence_ids": [], "confidence": 0, "status": "" },
    "defense_costs": { "value": "outside_limits", "evidence_ids": [], "confidence": 0, "status": "" },
    "claims_made_details": {
      "retroactive_date": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "erp_available": { "value": false, "evidence_ids": [], "confidence": 0, "status": "" }
    }
  },
  "limits": {
    "each_occurrence": { "value": 0, "evidence_ids": [], "confidence": 0, "status": "" },
    "damage_to_rented_premises": { "value": 0, "evidence_ids": [], "confidence": 0, "status": "" },
    "medical_expense": { "value": 0, "evidence_ids": [], "confidence": 0, "status": "" },
    "personal_advertising_injury": { "value": 0, "evidence_ids": [], "confidence": 0, "status": "" },
    "general_aggregate": { "value": 0, "evidence_ids": [], "confidence": 0, "status": "" },
    "products_completed_ops_aggregate": { "value": 0, "evidence_ids": [], "confidence": 0, "status": "" },
    "aggregate_applies_per": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "deductible": {
    "type": { "value": "none", "evidence_ids": [], "confidence": 0, "status": "" },
    "per_occurrence": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "property_damage": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "locations": [],
  "classifications": [],
  "additional_insureds": [],
  "endorsements": []
}
\`\`\`

REMEMBER: NO GUESSING. Only extract what's in the evidence.`;
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
  return confidences.length > 0
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : 0;
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
  return confidences.length > 0
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : 0;
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
  let fieldsNeedsReview = 0;
  let fieldsNotFound = 0;
  let fieldsConflict = 0;

  function traverse(o: any) {
    if (!o || typeof o !== 'object') return;

    if (typeof o.status === 'string') {
      fieldsExtracted++;
      switch (o.status) {
        case 'AUTO_APPLIED':
          fieldsAutoApplied++;
          break;
        case 'NEEDS_REVIEW':
        case 'LOW_CONFIDENCE':
          fieldsNeedsReview++;
          break;
        case 'NOT_FOUND':
          fieldsNotFound++;
          break;
        case 'CONFLICT':
          fieldsConflict++;
          break;
      }
    }

    for (const key of Object.keys(o)) {
      if (typeof o[key] === 'object') {
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
