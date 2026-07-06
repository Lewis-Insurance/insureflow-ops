/**
 * Professional Liability / Errors & Omissions (E&O) Policy Extraction Edge Function
 *
 * Extracts E&O policy data using:
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
import { anthropicBoundaryCreate } from '../_shared/modelBoundaryFetch.ts';
import { requireAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

// =============================================================================
// E&O FIELD PATTERNS FOR EVIDENCE MATCHING
// =============================================================================

const EO_FIELD_PATTERNS: Record<string, RegExp[]> = {
  // Policy Identity
  PolicyNumber: [/policy\s*(?:no|number|#)/i, /pol\s*(?:no|#)/i],
  NamedInsured: [/named\s*insured/i, /insured\s*name/i, /first\s*named/i],
  EffectiveDate: [/effective\s*date/i, /eff\s*date/i, /policy\s*period.*from/i],
  ExpirationDate: [/expiration\s*date/i, /exp\s*date/i, /policy\s*period.*to/i],
  CarrierName: [/carrier/i, /insurance\s*company/i, /insurer/i, /underwriter/i],

  // Claims-Made Critical Fields
  RetroactiveDate: [/retroactive\s*date/i, /retro\s*date/i, /prior\s*acts/i, /retro/i],
  FullPriorActs: [/full\s*prior\s*acts/i, /unlimited\s*prior/i, /no\s*retro/i],
  ContinuityDate: [/continuity\s*date/i, /original\s*policy\s*date/i],
  PendingPriorDate: [/pending.*prior/i, /p&p\s*date/i],

  // Extended Reporting Period (ERP / Tail)
  ERPAvailable: [/extended\s*reporting/i, /erp/i, /tail\s*coverage/i, /extended\s*period/i],
  BasicERPDays: [/basic\s*erp/i, /automatic\s*erp/i, /erp\s*days/i],
  SupplementalERP: [/supplemental\s*erp/i, /optional\s*erp/i, /extended\s*erp/i],
  ERPPremium: [/erp\s*premium/i, /tail\s*premium/i],

  // Limits
  PerClaimLimit: [/per\s*claim/i, /each\s*claim/i, /per\s*occurrence/i, /each\s*occurrence/i],
  AggregateLimit: [/aggregate/i, /policy\s*aggregate/i, /total\s*aggregate/i],
  DefenseCosts: [/defense\s*costs/i, /defense\s*expenses/i, /defense/i],

  // Deductible
  Deductible: [/deductible/i, /ded/i],
  SIR: [/self.insured\s*retention/i, /s\.?i\.?r\.?/i],
  DeductibleDefense: [/deductible.*defense/i, /ded.*defense/i],

  // Professional Type
  ProfessionalType: [/professional\s*type/i, /type\s*of\s*professional/i, /coverage\s*type/i],

  // Premium
  TotalPremium: [/total\s*premium/i, /annual\s*premium/i, /policy\s*premium/i],
  Premium: [/premium/i],
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
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    if (!azureEndpoint || !azureKey) {
      throw new Error('Azure Document Intelligence not configured');
    }


    // Create extraction job
    const { data: job, error: jobError } = await supabase
      .from('policy_eo_extraction_jobs')
      .insert({
        policy_id,
        document_id,
        status: 'pending',
      })
      .select()
      .single();

    if (jobError) throw jobError;

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
      .from('policy_eo_extraction_jobs')
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
      .from('policy_eo_extraction_jobs')
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
      .from('policy_eo_extraction_jobs')
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
    console.log('Calling Claude for E&O extraction...');
    const extractionStart = Date.now();

    const systemPrompt = getEOSystemPrompt();
    const userPrompt = buildEOUserPrompt(evidenceCatalog, document_type, policyData);

    const response = await anthropicBoundaryCreate(anthropicApiKey, {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const extractionLatency = Date.now() - extractionStart;

    // Parse response
    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/) || [null, responseText];
    const extractedData = JSON.parse(jsonMatch[1] || responseText);

    // Store evidence catalog
    await supabase.from('policy_eo_evidence_catalog').upsert({
      policy_id,
      document_id,
      evidence_entries: evidenceCatalog.entries,
      evidence_by_field: evidenceCatalog.byField,
      total_entries: evidenceCatalog.stats.totalEntries,
      azure_avg_confidence: evidenceCatalog.stats.avgConfidence,
      azure_page_count: evidenceCatalog.stats.pageCount,
    });

    // Process and store E&O details
    const eoDetails = {
      policy_id,
      carrier_name: extractedData.identity?.carrier_name?.value,
      carrier_naic: extractedData.identity?.carrier_naic?.value,
      policy_number: extractedData.identity?.policy_number?.value,
      transaction_type: extractedData.identity?.transaction_type?.value,
      named_insured: extractedData.identity?.named_insured?.value || 'Unknown',
      dba: extractedData.identity?.dba?.value,
      fein: extractedData.identity?.fein?.value,
      mailing_address_street: extractedData.identity?.mailing_address?.street?.value,
      mailing_address_city: extractedData.identity?.mailing_address?.city?.value,
      mailing_address_state: extractedData.identity?.mailing_address?.state?.value,
      mailing_address_zip: extractedData.identity?.mailing_address?.zip?.value,
      effective_date: extractedData.dates?.effective_date?.value,
      expiration_date: extractedData.dates?.expiration_date?.value,
      issue_date: extractedData.dates?.issue_date?.value,
      professional_type: extractedData.professional_details?.professional_type?.value,
      covered_services: extractedData.professional_details?.covered_services?.value || [],
      policy_form: extractedData.policy_form?.form?.value || 'claims_made',
      retroactive_date: extractedData.policy_form?.retroactive_date?.value,
      full_prior_acts: extractedData.policy_form?.full_prior_acts?.value || false,
      continuity_date: extractedData.policy_form?.continuity_date?.value,
      pending_prior_date: extractedData.policy_form?.pending_prior_date?.value,
      erp_available: extractedData.erp?.erp_available?.value || false,
      basic_erp_days: extractedData.erp?.basic_erp_days?.value,
      supplemental_erp_available: extractedData.erp?.supplemental_erp_available?.value || false,
      supplemental_erp_options: extractedData.erp?.supplemental_erp_options?.value || [],
      erp_purchased: extractedData.erp?.erp_purchased?.value || false,
      erp_purchased_duration_months: extractedData.erp?.erp_purchased_duration_months?.value,
      erp_purchased_premium: extractedData.erp?.erp_purchased_premium?.value,
      per_claim_limit: extractedData.limits?.per_claim_limit?.value,
      aggregate_limit: extractedData.limits?.aggregate_limit?.value,
      defense_costs: extractedData.limits?.defense_costs?.value,
      deductible_type: extractedData.deductible?.deductible_type?.value,
      deductible_per_claim: extractedData.deductible?.deductible_per_claim?.value,
      deductible_aggregate: extractedData.deductible?.deductible_aggregate?.value,
      deductible_applies_to_defense: extractedData.deductible?.deductible_applies_to_defense?.value || false,
      years_experience: extractedData.underwriting?.years_experience?.value,
      professionals_count: extractedData.underwriting?.professionals_count?.value,
      gross_revenue: extractedData.underwriting?.gross_revenue?.value,
      prior_claims_last_5_years: extractedData.underwriting?.prior_claims_last_5_years?.value,
      total_premium: extractedData.premium?.total_premium?.value,
      minimum_premium: extractedData.premium?.minimum_premium?.value,
      policy_fee: extractedData.premium?.policy_fee?.value,
      state_taxes: extractedData.premium?.state_taxes?.value,
      evidence_ids: collectEvidenceIds(extractedData),
      extraction_confidence: calculateAvgConfidence(extractedData),
      extraction_status: determineStatus(extractedData),
    };

    await supabase.from('policy_eo_details').upsert(eoDetails, {
      onConflict: 'policy_id',
    });

    // Process and store exclusions
    let exclusionsExtracted = 0;
    if (extractedData.exclusions && Array.isArray(extractedData.exclusions)) {
      await supabase.from('policy_eo_exclusions').delete().eq('policy_id', policy_id);

      for (const excl of extractedData.exclusions) {
        const exclusionData = {
          policy_id,
          exclusion_type: excl.exclusion_type?.value || 'Other',
          description: excl.description?.value || '',
          form_number: excl.form_number?.value,
          edition_date: excl.edition_date?.value,
          is_standard_exclusion: false,
          is_high_impact: excl.is_high_impact?.value || false,
          evidence_ids: collectEvidenceIds(excl),
          extraction_confidence: calculateAvgConfidence(excl),
          extraction_status: determineStatus(excl),
        };

        await supabase.from('policy_eo_exclusions').insert(exclusionData);
        exclusionsExtracted++;
      }
    }

    // Process and store endorsements
    let endorsementsExtracted = 0;
    if (extractedData.endorsements && Array.isArray(extractedData.endorsements)) {
      await supabase.from('policy_eo_endorsements').delete().eq('policy_id', policy_id);

      for (const end of extractedData.endorsements) {
        const endorsementData = {
          policy_id,
          form_number: end.form_number?.value,
          title: end.title?.value || 'Unknown',
          edition_date: end.edition_date?.value,
          effective_date: end.effective_date?.value,
          description: end.description?.value,
          category: end.category?.value,
          is_limitation: end.is_limitation?.value || false,
          is_enhancement: end.is_enhancement?.value || false,
          evidence_ids: collectEvidenceIds(end),
          extraction_confidence: calculateAvgConfidence(end),
          extraction_status: determineStatus(end),
        };

        await supabase.from('policy_eo_endorsements').insert(endorsementData);
        endorsementsExtracted++;
      }
    }

    // Calculate stats
    const stats = calculateExtractionStats(extractedData);

    // Update job as completed
    await supabase
      .from('policy_eo_extraction_jobs')
      .update({
        status: 'completed',
        extraction_completed_at: new Date().toISOString(),
        llm_tokens_input: response.usage?.input_tokens,
        llm_tokens_output: response.usage?.output_tokens,
        llm_latency_ms: extractionLatency,
        fields_extracted: stats.fieldsExtracted,
        fields_auto_applied: stats.fieldsAutoApplied,
        fields_needs_review: stats.fieldsNeedsReview,
        fields_not_found: stats.fieldsNotFound,
        fields_conflict: stats.fieldsConflict,
        overall_confidence: eoDetails.extraction_confidence,
      })
      .eq('id', job.id);

    return new Response(
      JSON.stringify({
        success: true,
        job_id: job.id,
        exclusions_count: exclusionsExtracted,
        endorsements_count: endorsementsExtracted,
        confidence: eoDetails.extraction_confidence,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('E&O extraction error:', error);

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
      const rows = table.rows || [];

      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        const cells = row.cells || [];

        for (let colIndex = 0; colIndex < cells.length; colIndex++) {
          const cell = cells[colIndex];
          const content = cell.content?.trim() || '';
          if (!content) continue;

          const evidenceId = `E${String(entryIndex++).padStart(4, '0')}`;
          const confidence = cell.confidence || 0.75;

          totalConfidence += confidence;
          confidenceCount++;

          const boundingBox = extractBoundingBox(
            cell.boundingRegions?.[0],
            azureResult.pages
          );

          const entry: EvidenceEntry = {
            evidenceId,
            sourceType: 'table_cell',
            label: null,
            value: content,
            normalizedValue: normalizeValue(content),
            confidence,
            pageNumber: cell.boundingRegions?.[0]?.pageNumber || 1,
            boundingBox,
            tableContext: {
              tableIndex,
              rowIndex,
              columnIndex: colIndex,
              columnHeader: cells[0]?.content,
              rowHeader: rows[0]?.cells?.[colIndex]?.content,
            },
            tags: matchFieldPatterns(content, content),
          };

          entries[evidenceId] = entry;

          for (const tag of entry.tags) {
            if (!byField[tag]) byField[tag] = [];
            byField[tag].push(evidenceId);
          }
        }
      }
    }
  }

  return {
    entries,
    byField,
    stats: {
      totalEntries: entryIndex,
      avgConfidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
      pageCount,
    },
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function extractBoundingBox(boundingRegion: any, pages: any[]): EvidenceEntry['boundingBox'] | null {
  if (!boundingRegion || !pages) return null;

  const page = pages[boundingRegion.pageNumber - 1];
  if (!page) return null;

  const polygon = boundingRegion.polygon || [];
  if (polygon.length < 4) return null;

  const xCoords = polygon.filter((_: any, i: number) => i % 2 === 0);
  const yCoords = polygon.filter((_: any, i: number) => i % 2 === 1);

  const x = Math.min(...xCoords);
  const y = Math.min(...yCoords);
  const width = Math.max(...xCoords) - x;
  const height = Math.max(...yCoords) - y;

  return {
    x,
    y,
    width,
    height,
    pageWidth: page.width || 612,
    pageHeight: page.height || 792,
  };
}

function normalizeValue(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\$([\d,]+)/g, (_, num) => num.replace(/,/g, ''))
    .replace(/(\d+)\s*M\b/gi, (_, num) => String(parseInt(num) * 1000000))
    .replace(/(\d+)\s*K\b/gi, (_, num) => String(parseInt(num) * 1000));
}

function matchFieldPatterns(label: string, value: string): string[] {
  const tags: string[] = [];

  for (const [field, patterns] of Object.entries(EO_FIELD_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(label) || pattern.test(value)) {
        tags.push(field);
        break;
      }
    }
  }

  return [...new Set(tags)];
}

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

    if (o.value !== undefined && o.value !== null && o.value !== '') {
      fieldsExtracted++;
      const status = o.status || '';
      if (status === 'AUTO_APPLIED') fieldsAutoApplied++;
      else if (status === 'NEEDS_REVIEW' || status === 'NEEDS_VERIFICATION') fieldsNeedsReview++;
      else if (status === 'NOT_FOUND') fieldsNotFound++;
      else if (status === 'CONFLICT') fieldsConflict++;
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

// =============================================================================
// PROMPT BUILDERS
// =============================================================================

function getEOSystemPrompt(): string {
  return `You are an expert Professional Liability / Errors & Omissions (E&O) policy data extractor.

## CRITICAL RULES
1. ONLY extract values that exist in the evidence catalog provided
2. NEVER guess or infer values - if evidence is not found, return NOT_FOUND
3. ALWAYS cite evidence IDs for every extracted value
4. NEVER fabricate evidence IDs - only use IDs from the catalog

## E&O-SPECIFIC KNOWLEDGE

POLICY FORM:
- E&O policies are ALMOST ALWAYS claims-made (99%+)
- If form is not specified, assume claims-made

CLAIMS-MADE CRITICAL FIELDS:
- Retroactive Date: Date before which acts are NOT covered (CRITICAL)
- Full Prior Acts: If retroactive date is unlimited/unrestricted
- Continuity Date: Date when policy was first written
- Pending & Prior Date: Date for reporting prior claims

EXTENDED REPORTING PERIOD (ERP / TAIL):
- Basic ERP: Usually 30-60 days automatic after expiration
- Supplemental ERP: Optional, can be 1-5 years typically
- ERP Premium: Usually 100-300% of annual premium
- ERP Deadline: Usually 30-60 days after expiration to purchase
- CRITICAL: If ERP is not available, this is a major limitation

LIMITS:
- Per Claim / Per Occurrence: Maximum per individual claim
- Aggregate: Maximum for all claims during policy period
- Defense Costs: Inside limits (reduces coverage) vs Outside limits (supplementary)

DEDUCTIBLE:
- Deductible: Insured pays, insurer handles defense
- SIR (Self-Insured Retention): Insured handles defense up to SIR amount
- May apply to defense costs (reduces coverage value)

## OUTPUT FORMAT
Return valid JSON matching the schema provided.
Never include explanatory text outside the JSON structure.`;
}

function buildEOUserPrompt(
  evidenceCatalog: EvidenceCatalog,
  documentType: string,
  policyData: any
): string {
  const catalogJson = JSON.stringify(evidenceCatalog, null, 2);

  return `## DOCUMENT TYPE
${documentType.toUpperCase()}

${policyData ? `## EXISTING POLICY DATA (for reference)
Carrier: ${policyData.carrier || 'Unknown'}
Policy Number: ${policyData.policy_number || 'Unknown'}
Named Insured: ${policyData.client?.company_name || 'Unknown'}
` : ''}

## EVIDENCE CATALOG
\`\`\`json
${catalogJson}
\`\`\`

## EXTRACTION SCHEMA

Extract Professional Liability / E&O policy data. For each field include:
- value: The extracted value (normalized)
- evidence_ids: Array of evidence IDs
- confidence: Score 0.0-1.0
- status: "AUTO_APPLIED" | "NEEDS_REVIEW" | "NEEDS_VERIFICATION" | "LOW_CONFIDENCE" | "NOT_FOUND" | "CONFLICT"

\`\`\`json
{
  "identity": {
    "carrier_name": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
    "carrier_naic": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "policy_number": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
    "transaction_type": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
    "named_insured": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
    "dba": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "fein": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "mailing_address": {
      "street": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "city": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "state": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "zip": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" }
    }
  },
  "dates": {
    "effective_date": { "value": "YYYY-MM-DD", "evidence_ids": [], "confidence": 0, "status": "" },
    "expiration_date": { "value": "YYYY-MM-DD", "evidence_ids": [], "confidence": 0, "status": "" },
    "issue_date": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "professional_details": {
    "professional_type": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
    "covered_services": { "value": [], "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "policy_form": {
    "form": { "value": "claims_made", "evidence_ids": [], "confidence": 0, "status": "" },
    "retroactive_date": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "full_prior_acts": { "value": false, "evidence_ids": [], "confidence": 0, "status": "" },
    "continuity_date": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "pending_prior_date": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "erp": {
    "erp_available": { "value": false, "evidence_ids": [], "confidence": 0, "status": "" },
    "basic_erp_days": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "supplemental_erp_available": { "value": false, "evidence_ids": [], "confidence": 0, "status": "" },
    "supplemental_erp_options": { "value": [], "evidence_ids": [], "confidence": 0, "status": "" },
    "erp_purchased": { "value": false, "evidence_ids": [], "confidence": 0, "status": "" },
    "erp_purchased_duration_months": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "erp_purchased_premium": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "limits": {
    "per_claim_limit": { "value": 0, "evidence_ids": [], "confidence": 0, "status": "" },
    "aggregate_limit": { "value": 0, "evidence_ids": [], "confidence": 0, "status": "" },
    "defense_costs": { "value": "outside_limits", "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "deductible": {
    "deductible_type": { "value": "deductible", "evidence_ids": [], "confidence": 0, "status": "" },
    "deductible_per_claim": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "deductible_aggregate": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "deductible_applies_to_defense": { "value": false, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "underwriting": {
    "years_experience": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "professionals_count": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "gross_revenue": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "prior_claims_last_5_years": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "exclusions": [],
  "endorsements": [],
  "premium": {
    "total_premium": { "value": 0, "evidence_ids": [], "confidence": 0, "status": "" },
    "minimum_premium": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "policy_fee": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "state_taxes": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  }
}
\`\`\`

REMEMBER: NO GUESSING. Only extract what's in the evidence.`;
}

