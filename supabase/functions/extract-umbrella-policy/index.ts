/**
 * Commercial Umbrella / Excess Liability Extraction Edge Function
 *
 * Extracts Umbrella/Excess policy data using:
 * 1. Azure Document Intelligence for OCR with bounding boxes
 * 2. Evidence catalog for click-to-highlight traceability
 * 3. Claude for intelligent field extraction with evidence IDs
 *
 * Umbrella extraction focuses on:
 * - Limits (per occurrence, aggregate, defense)
 * - Retention/SIR
 * - Underlying policy schedule (critical)
 * - Drop-down coverage
 * - High-impact endorsements/exclusions
 * - Compliance analysis
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { anthropicBoundaryCreate } from '../_shared/modelBoundaryFetch.ts';
import { requireAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

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

  // Limits
  PerOccurrence: [/per\s*occurrence/i, /each\s*occurrence/i, /occurrence\s*limit/i],
  Aggregate: [/aggregate/i, /annual\s*aggregate/i, /policy\s*aggregate/i],
  DefenseCosts: [/defense/i, /legal\s*defense/i, /supplementary/i],
  Territory: [/territory/i, /worldwide/i, /u\.?s\.?\s*(?:and\s*)?canada/i],

  // Retention
  Retention: [/retention/i, /s\.?i\.?r\.?/i, /self.?insured/i, /retained\s*limit/i],

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

  // Endorsements
  EndorsementForm: [/form\s*(?:no|number|#)/i, /endorsement/i],
  Exclusion: [/exclusion/i, /excluded/i, /except/i],
  Limitation: [/limitation/i, /limited/i, /restricted/i],

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
      .from('policy_umbrella_extraction_jobs')
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
      .from('policy_umbrella_extraction_jobs')
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
      .from('policy_umbrella_extraction_jobs')
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
      .from('policy_umbrella_extraction_jobs')
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
    console.log('Calling Claude for Umbrella extraction...');
    const extractionStart = Date.now();

    const systemPrompt = getUmbrellaSystemPrompt();
    const userPrompt = buildUmbrellaUserPrompt(evidenceCatalog, document_type, policyData);

    const response = await anthropicBoundaryCreate(anthropicApiKey, {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 10000, // Umbrella can have many underlying policies
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const extractionLatency = Date.now() - extractionStart;

    // Parse response
    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/) || [null, responseText];
    const extractedData = JSON.parse(jsonMatch[1] || responseText);

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

    // Process and store underlying requirements
    if (extractedData.underlying_requirements) {
      await supabase.from('policy_umbrella_requirements').upsert({
        policy_id,
        gl_each_occurrence: extractedData.underlying_requirements.gl_each_occurrence?.value,
        gl_general_aggregate: extractedData.underlying_requirements.gl_general_aggregate?.value,
        auto_liability: extractedData.underlying_requirements.auto_liability?.value,
        el_per_accident: extractedData.underlying_requirements.el_per_accident?.value,
        el_disease_policy: extractedData.underlying_requirements.el_disease_policy?.value,
        el_disease_employee: extractedData.underlying_requirements.el_disease_employee?.value,
        evidence_ids: collectEvidenceIds(extractedData.underlying_requirements),
        extraction_confidence: calculateAvgConfidence(extractedData.underlying_requirements),
        extraction_status: determineStatus(extractedData.underlying_requirements),
      });
    }

    // Process and store underlying policies
    let underlyingExtracted = 0;
    if (extractedData.underlying_policies && Array.isArray(extractedData.underlying_policies)) {
      // Delete existing underlying for this policy
      await supabase.from('policy_umbrella_underlying').delete().eq('policy_id', policy_id);

      for (const underlying of extractedData.underlying_policies) {
        const underlyingData = {
          policy_id,
          underlying_type: underlying.type?.value || 'other',
          carrier: underlying.carrier?.value || 'Unknown',
          underlying_policy_number: underlying.policy_number?.value,
          effective_date: underlying.effective_date?.value,
          expiration_date: underlying.expiration_date?.value,
          each_occurrence: underlying.limits?.each_occurrence?.value,
          general_aggregate: underlying.limits?.general_aggregate?.value,
          auto_csl: underlying.limits?.auto_csl?.value,
          auto_bi_per_person: underlying.limits?.auto_bi_per_person?.value,
          auto_bi_per_accident: underlying.limits?.auto_bi_per_accident?.value,
          auto_pd: underlying.limits?.auto_pd?.value,
          el_per_accident: underlying.limits?.el_per_accident?.value,
          el_disease_policy: underlying.limits?.el_disease_policy?.value,
          el_disease_employee: underlying.limits?.el_disease_employee?.value,
          evidence_ids: collectEvidenceIds(underlying),
          extraction_confidence: calculateAvgConfidence(underlying),
          extraction_status: determineStatus(underlying),
        };

        await supabase.from('policy_umbrella_underlying').insert(underlyingData);
        underlyingExtracted++;
      }
    }

    // Process and store additional insureds
    let additionalInsuredsExtracted = 0;
    if (extractedData.additional_insureds && Array.isArray(extractedData.additional_insureds)) {
      // Delete existing AIs for this policy
      await supabase.from('policy_umbrella_additional_insureds').delete().eq('policy_id', policy_id);

      for (const ai of extractedData.additional_insureds) {
        const aiData = {
          policy_id,
          name: ai.name?.value || 'Unknown',
          street: ai.address?.street?.value,
          city: ai.address?.city?.value,
          state: ai.address?.state?.value,
          zip: ai.address?.zip?.value,
          ai_type: ai.ai_type?.value || 'blanket',
          primary_noncontributory: ai.primary_noncontributory?.value || false,
          waiver_of_subrogation: ai.waiver_of_subrogation?.value || false,
          project_name: ai.project_name?.value,
          evidence_ids: collectEvidenceIds(ai),
          extraction_confidence: calculateAvgConfidence(ai),
          extraction_status: determineStatus(ai),
        };

        await supabase.from('policy_umbrella_additional_insureds').insert(aiData);
        additionalInsuredsExtracted++;
      }
    }

    // Process and store endorsements
    let endorsementsExtracted = 0;
    if (extractedData.endorsements && Array.isArray(extractedData.endorsements)) {
      // Delete existing endorsements for this policy
      await supabase.from('policy_umbrella_endorsements').delete().eq('policy_id', policy_id);

      for (const end of extractedData.endorsements) {
        const endData = {
          policy_id,
          form_number: end.form_number?.value || 'Unknown',
          title: end.title?.value || 'Endorsement',
          edition_date: end.edition_date?.value,
          effective_date: end.effective_date?.value,
          category: end.category?.value,
          is_limitation: end.is_limitation?.value || false,
          is_enhancement: end.is_enhancement?.value || false,
          impact_description: end.impact_description?.value,
          evidence_ids: collectEvidenceIds(end),
          extraction_confidence: calculateAvgConfidence(end),
          extraction_status: determineStatus(end),
        };

        await supabase.from('policy_umbrella_endorsements').insert(endData);
        endorsementsExtracted++;
      }
    }

    // Build umbrella details object
    const umbrellaDetails = {
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
        producer: extractedData.identity?.producer?.value,
      },
      dates: {
        effective_date: extractedData.dates?.effective_date?.value,
        expiration_date: extractedData.dates?.expiration_date?.value,
        issue_date: extractedData.dates?.issue_date?.value,
      },
      policy_type: extractedData.policy_type?.value || 'umbrella',
      form_basis: extractedData.form_basis?.value || 'follow_form',
      limits: {
        per_occurrence: extractedData.limits?.per_occurrence?.value,
        aggregate: extractedData.limits?.aggregate?.value,
        products_completed_ops_aggregate: extractedData.limits?.products_completed_ops_aggregate?.value,
        defense_costs: extractedData.limits?.defense_costs?.value || 'outside_limits',
        territory: extractedData.limits?.territory?.value,
      },
      retention: extractedData.retention?.amount?.value
        ? {
            amount: extractedData.retention.amount.value,
            applicability: extractedData.retention.applicability?.value,
            notes: extractedData.retention.notes?.value,
          }
        : undefined,
      drop_down: extractedData.drop_down?.is_available?.value != null
        ? {
            is_available: extractedData.drop_down.is_available.value,
            conditions: extractedData.drop_down.conditions?.value,
            exclusions: extractedData.drop_down.exclusions?.value,
            who_is_insured: extractedData.drop_down.who_is_insured?.value,
          }
        : undefined,
      premium: {
        total_premium: extractedData.premium?.total_premium?.value,
        base_premium: extractedData.premium?.base_premium?.value,
        policy_fee: extractedData.premium?.policy_fee?.value,
        terrorism_premium: extractedData.premium?.terrorism_premium?.value,
        terrorism_rejected: extractedData.premium?.terrorism_rejected?.value,
      },
      extraction_source: 'azure_di_claude',
      extraction_confidence: calculateOverallConfidence(extractedData),
      extracted_at: new Date().toISOString(),
    };

    // Build field evidence mapping
    const fieldEvidence = buildFieldEvidenceMapping(extractedData);

    // Update policy with umbrella details
    await supabase
      .from('policies')
      .update({
        umbrella_details: umbrellaDetails,
        umbrella_field_evidence: fieldEvidence,
        extraction_source: 'azure_di_claude',
        extraction_confidence: umbrellaDetails.extraction_confidence,
      })
      .eq('id', policy_id);

    // Calculate stats
    const stats = calculateExtractionStats(extractedData);

    // Run compliance analysis
    const complianceIssues = runComplianceAnalysis(
      umbrellaDetails,
      extractedData.underlying_requirements,
      extractedData.underlying_policies || []
    );

    // Update job as completed
    await supabase
      .from('policy_umbrella_extraction_jobs')
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
        underlying_policies_extracted: underlyingExtracted,
        additional_insureds_extracted: additionalInsuredsExtracted,
        endorsements_extracted: endorsementsExtracted,
        compliance_issues_count: complianceIssues.length,
        overall_confidence: umbrellaDetails.extraction_confidence,
      })
      .eq('id', job.id);

    return new Response(
      JSON.stringify({
        success: true,
        job_id: job.id,
        underlying_count: underlyingExtracted,
        additional_insureds_count: additionalInsuredsExtracted,
        endorsements_count: endorsementsExtracted,
        compliance_issues_count: complianceIssues.length,
        confidence: umbrellaDetails.extraction_confidence,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Umbrella extraction error:', error);

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
  const analyzeUrl = `${azureEndpoint}/documentintelligence/documentModels/prebuilt-document:analyze?api-version=2024-02-29-preview`;

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
// PROMPT BUILDERS
// =============================================================================

function getUmbrellaSystemPrompt(): string {
  return `You are an expert Commercial Umbrella and Excess Liability policy data extractor for insurance professionals.

## YOUR ROLE
Extract structured umbrella/excess policy data from quotes, binders, policies, and endorsements.
Every extracted value MUST cite its source evidence ID(s) from the OCR catalog.

## CRITICAL RULES

### 1. EVIDENCE-BASED EXTRACTION ONLY
- ONLY extract values that appear in the evidence catalog
- NEVER guess, infer, or use industry defaults
- If a field is not in the evidence, return status: "NOT_FOUND"
- Each field MUST include evidence_ids array linking to source

### 2. CONFIDENCE SCORING
- 0.95-1.00: Exact match with clear label
- 0.85-0.94: Strong match from context
- 0.70-0.84: Reasonable inference
- Below 0.70: Mark as NEEDS_REVIEW

### 3. UMBRELLA-SPECIFIC KNOWLEDGE

POLICY TYPES:
- Umbrella: Provides broader coverage + may drop down
- Excess: Follows form of underlying only

LIMITS:
- Per Occurrence: Headline limit ($1M, $2M, $5M, $10M common)
- Aggregate: May equal or exceed occurrence
- Defense: Usually outside limits

RETENTION/SIR:
- Amount insured pays when underlying doesn't respond
- Look for "Self-Insured Retention" or "Retained Limit"

UNDERLYING SCHEDULE (CRITICAL):
Extract ALL scheduled underlying policies:
- Type: GL, Auto, EL, WC, etc.
- Carrier
- Policy Number
- Effective/Expiration Dates
- Limits

COMMON MINIMUM REQUIREMENTS:
- GL: Usually $1M/$2M
- Auto: Usually $1M CSL
- EL: Usually $500K or $1M each

### 4. LIMIT NORMALIZATION
- "$1,000,000" → 1000000
- "$1M" → 1000000
- "$500K" → 500000

## OUTPUT FORMAT
Return valid JSON matching the schema.`;
}

function buildUmbrellaUserPrompt(
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

Extract Commercial Umbrella/Excess policy data. For each field include:
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
    "producer": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "dates": {
    "effective_date": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
    "expiration_date": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
    "issue_date": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "policy_type": { "value": "umbrella", "evidence_ids": [], "confidence": 0, "status": "" },
  "form_basis": { "value": "follow_form", "evidence_ids": [], "confidence": 0, "status": "" },
  "limits": {
    "per_occurrence": { "value": 0, "evidence_ids": [], "confidence": 0, "status": "" },
    "aggregate": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "defense_costs": { "value": "outside_limits", "evidence_ids": [], "confidence": 0, "status": "" },
    "territory": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "retention": {
    "amount": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "applicability": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "underlying_requirements": {
    "gl_each_occurrence": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "gl_general_aggregate": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "auto_liability": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "el_per_accident": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "underlying_policies": [],
  "drop_down": {
    "is_available": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "conditions": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "additional_insureds": [],
  "endorsements": [],
  "premium": {
    "total_premium": { "value": 0, "evidence_ids": [], "confidence": 0, "status": "" },
    "policy_fee": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "terrorism_premium": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  }
}
\`\`\`

## EXTRACTION PRIORITY

1. **Limits**: Per occurrence (headline), aggregate, defense costs
2. **Retention/SIR**: Amount and applicability
3. **Underlying Schedule**: CRITICAL - extract ALL scheduled policies
4. **Requirements**: Look for minimum underlying limits
5. **Endorsements**: Flag all exclusions/limitations

REMEMBER: NO GUESSING. Only extract what's in the evidence.`;
}

// =============================================================================
// COMPLIANCE ANALYSIS
// =============================================================================

function runComplianceAnalysis(
  umbrellaDetails: any,
  requirements: any,
  underlyingPolicies: any[]
): { type: string; severity: string; message: string }[] {
  const issues: { type: string; severity: string; message: string }[] = [];

  if (!requirements || !underlyingPolicies.length) {
    return issues;
  }

  const umbrellaEff = new Date(umbrellaDetails.dates?.effective_date);
  const umbrellaExp = new Date(umbrellaDetails.dates?.expiration_date);

  // Check for required underlying policies
  if (requirements.gl_each_occurrence?.value) {
    const glPolicy = underlyingPolicies.find(
      (p: any) => p.type?.value === 'general_liability'
    );
    if (!glPolicy) {
      issues.push({
        type: 'missing_underlying',
        severity: 'high',
        message: 'Required General Liability underlying not scheduled',
      });
    }
  }

  if (requirements.auto_liability?.value) {
    const autoPolicy = underlyingPolicies.find(
      (p: any) => p.type?.value === 'commercial_auto'
    );
    if (!autoPolicy) {
      issues.push({
        type: 'missing_underlying',
        severity: 'high',
        message: 'Required Commercial Auto underlying not scheduled',
      });
    }
  }

  // Check term alignment
  for (const underlying of underlyingPolicies) {
    if (underlying.expiration_date?.value) {
      const underlyingExp = new Date(underlying.expiration_date.value);
      if (underlyingExp < umbrellaExp) {
        issues.push({
          type: 'term_mismatch',
          severity: 'high',
          message: `${underlying.type?.value || 'Underlying'} expires before umbrella`,
        });
      }
    }
  }

  return issues;
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
