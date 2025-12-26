/**
 * Commercial Property Policy Extraction Edge Function
 *
 * Extracts Commercial Property policy data using:
 * 1. Azure Document Intelligence for OCR with bounding boxes
 * 2. Evidence catalog for click-to-highlight traceability
 * 3. Claude for intelligent field extraction with evidence IDs
 *
 * Property is complex due to:
 * - Multiple locations and buildings
 * - Various coverage types (Building, BPP, BI, O&L)
 * - Layered deductibles (AOP, Wind/Hail, Named Storm, Flood, Earthquake)
 * - Blanket vs scheduled coverage structures
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.24.3';
import { requireAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

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

  // Premium
  TotalPremium: [/total\s*premium/i, /annual\s*premium/i, /policy\s*premium/i],
  BuildingPremium: [/building\s*premium/i, /bldg\s*prem/i],
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

    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    // Create extraction job
    const { data: job, error: jobError } = await supabase
      .from('policy_property_extraction_jobs')
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
      .from('policy_property_extraction_jobs')
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
      .from('policy_property_extraction_jobs')
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
      .from('policy_property_extraction_jobs')
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
    console.log('Calling Claude for Property extraction...');
    const extractionStart = Date.now();

    const systemPrompt = getPropertySystemPrompt();
    const userPrompt = buildPropertyUserPrompt(evidenceCatalog, document_type, policyData);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 12000, // Property can have many buildings/locations
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const extractionLatency = Date.now() - extractionStart;

    // Parse response
    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/) || [null, responseText];
    const extractedData = JSON.parse(jsonMatch[1] || responseText);

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

    // Process and store locations
    let locationsExtracted = 0;
    if (extractedData.locations && Array.isArray(extractedData.locations)) {
      for (const loc of extractedData.locations) {
        const locationData = {
          policy_id,
          location_number: loc.location_number?.value || locationsExtracted + 1,
          street: loc.street?.value,
          city: loc.city?.value,
          state: loc.state?.value,
          zip: loc.zip?.value,
          county: loc.county?.value,
          territory: loc.territory?.value,
          protection_class: loc.protection_class?.value,
          occupancy: loc.occupancy?.value,
          evidence_ids: collectEvidenceIds(loc),
          extraction_confidence: calculateAvgConfidence(loc),
          extraction_status: determineStatus(loc),
        };

        await supabase.from('policy_property_locations').upsert(locationData, {
          onConflict: 'policy_id,location_number',
        });
        locationsExtracted++;
      }
    }

    // Process and store buildings
    let buildingsExtracted = 0;
    if (extractedData.buildings && Array.isArray(extractedData.buildings)) {
      // Delete existing buildings for this policy
      await supabase.from('policy_property_buildings').delete().eq('policy_id', policy_id);

      for (const bldg of extractedData.buildings) {
        const buildingData = {
          policy_id,
          building_number: bldg.building_number?.value || buildingsExtracted + 1,
          location_number: bldg.location_number?.value || 1,
          description: bldg.description?.value,
          construction_type: bldg.construction_type?.value,
          construction_class: mapConstructionClass(bldg.construction_type?.value),
          occupancy: bldg.occupancy?.value,
          year_built: bldg.year_built?.value,
          square_footage: bldg.square_footage?.value,
          stories: bldg.stories?.value,
          roof_type: bldg.roof_type?.value,
          roof_age: bldg.roof_age?.value,
          has_sprinklers: bldg.has_sprinklers?.value,
          valuation_basis: bldg.valuation_basis?.value || 'replacement_cost',
          coinsurance_percent: bldg.coinsurance_percent?.value,
          evidence_ids: collectEvidenceIds(bldg),
          extraction_confidence: calculateAvgConfidence(bldg),
          extraction_status: determineStatus(bldg),
        };

        const { data: insertedBuilding } = await supabase
          .from('policy_property_buildings')
          .insert(buildingData)
          .select()
          .single();

        buildingsExtracted++;

        // Store building coverages
        if (extractedData.building_coverages && Array.isArray(extractedData.building_coverages)) {
          const coverage = extractedData.building_coverages.find(
            (c: any) =>
              c.building_number?.value === bldg.building_number?.value &&
              c.location_number?.value === bldg.location_number?.value
          );

          if (coverage && insertedBuilding) {
            await supabase.from('policy_property_building_coverages').insert({
              policy_id,
              building_id: insertedBuilding.id,
              building_limit: coverage.building_limit?.value,
              bpp_limit: coverage.bpp_limit?.value,
              tenant_improvements_limit: coverage.tenant_improvements_limit?.value,
              stock_limit: coverage.stock_limit?.value,
              evidence_ids: collectEvidenceIds(coverage),
              extraction_confidence: calculateAvgConfidence(coverage),
              extraction_status: determineStatus(coverage),
            });
          }
        }
      }
    }

    // Process and store deductibles
    let deductiblesExtracted = 0;
    if (extractedData.deductibles && Array.isArray(extractedData.deductibles)) {
      // Delete existing deductibles for this policy
      await supabase.from('policy_property_deductibles').delete().eq('policy_id', policy_id);

      for (const ded of extractedData.deductibles) {
        const dedData = {
          policy_id,
          name: ded.name?.value || 'Deductible',
          peril: ded.peril?.value || 'aop',
          amount: ded.amount?.value,
          deductible_type: ded.deductible_type?.value || 'flat',
          percentage: ded.percentage?.value,
          applies_to: ded.applies_to?.value || 'per_occurrence',
          state_conditions: ded.state_conditions?.value,
          evidence_ids: collectEvidenceIds(ded),
          extraction_confidence: calculateAvgConfidence(ded),
          extraction_status: determineStatus(ded),
        };

        await supabase.from('policy_property_deductibles').insert(dedData);
        deductiblesExtracted++;
      }
    }

    // Process and store interests (mortgagees/loss payees)
    let interestsExtracted = 0;
    if (extractedData.interests && Array.isArray(extractedData.interests)) {
      // Delete existing interests for this policy
      await supabase.from('policy_property_interests').delete().eq('policy_id', policy_id);

      for (const interest of extractedData.interests) {
        const interestData = {
          policy_id,
          interest_type: interest.interest_type?.value || 'mortgagee',
          name: interest.name?.value || 'Unknown',
          street: interest.address?.street?.value,
          city: interest.address?.city?.value,
          state: interest.address?.state?.value,
          zip: interest.address?.zip?.value,
          loan_number: interest.loan_number?.value,
          location_number: interest.location_number?.value,
          building_number: interest.building_number?.value,
          evidence_ids: collectEvidenceIds(interest),
          extraction_confidence: calculateAvgConfidence(interest),
          extraction_status: determineStatus(interest),
        };

        await supabase.from('policy_property_interests').insert(interestData);
        interestsExtracted++;
      }
    }

    // Process and store endorsements
    let endorsementsExtracted = 0;
    if (extractedData.endorsements && Array.isArray(extractedData.endorsements)) {
      // Delete existing endorsements for this policy
      await supabase.from('policy_property_endorsements').delete().eq('policy_id', policy_id);

      for (const end of extractedData.endorsements) {
        const endData = {
          policy_id,
          form_number: end.form_number?.value || 'Unknown',
          title: end.title?.value || 'Endorsement',
          edition_date: end.edition_date?.value,
          category: end.category?.value,
          is_limitation: end.is_limitation?.value || false,
          evidence_ids: collectEvidenceIds(end),
          extraction_confidence: calculateAvgConfidence(end),
          extraction_status: determineStatus(end),
        };

        await supabase.from('policy_property_endorsements').insert(endData);
        endorsementsExtracted++;
      }
    }

    // Build property details object
    const propertyDetails = {
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
      },
      dates: {
        effective_date: extractedData.dates?.effective_date?.value,
        expiration_date: extractedData.dates?.expiration_date?.value,
        issue_date: extractedData.dates?.issue_date?.value,
      },
      form_details: {
        form_type: extractedData.form_details?.form_type?.value || 'special',
        is_iso_form: extractedData.form_details?.is_iso_form?.value ?? true,
        form_number: extractedData.form_details?.form_number?.value,
      },
      valuation_summary: {
        total_insured_value: extractedData.valuation_summary?.total_insured_value?.value,
        total_building_value: extractedData.valuation_summary?.total_building_value?.value,
        total_bpp_value: extractedData.valuation_summary?.total_bpp_value?.value,
        is_blanket: extractedData.valuation_summary?.is_blanket?.value ?? false,
        blanket_limit: extractedData.valuation_summary?.blanket_limit?.value,
        coinsurance_percent: extractedData.valuation_summary?.coinsurance_percent?.value,
        is_agreed_value: extractedData.valuation_summary?.is_agreed_value?.value ?? false,
        margin_clause_percent: extractedData.valuation_summary?.margin_clause_percent?.value,
      },
      business_income: extractedData.business_income?.is_included?.value
        ? {
            is_included: true,
            limit_type: extractedData.business_income?.limit_type?.value || 'specific_limit',
            limit: extractedData.business_income?.limit?.value,
            waiting_period_hours: extractedData.business_income?.waiting_period_hours?.value,
            extra_expense_included: extractedData.business_income?.extra_expense_included?.value,
          }
        : undefined,
      ordinance_or_law: extractedData.ordinance_or_law?.is_included?.value
        ? {
            is_included: true,
            coverage_a_limit: extractedData.ordinance_or_law?.coverage_a_limit?.value,
            coverage_b_limit: extractedData.ordinance_or_law?.coverage_b_limit?.value,
            coverage_c_limit: extractedData.ordinance_or_law?.coverage_c_limit?.value,
            combined_limit: extractedData.ordinance_or_law?.combined_limit?.value,
          }
        : undefined,
      premium: {
        total_premium: extractedData.premium?.total_premium?.value,
        building_premium: extractedData.premium?.building_premium?.value,
        bpp_premium: extractedData.premium?.bpp_premium?.value,
        business_income_premium: extractedData.premium?.business_income_premium?.value,
        policy_fee: extractedData.premium?.policy_fee?.value,
        terrorism_premium: extractedData.premium?.terrorism_premium?.value,
      },
      extraction_source: 'azure_di_claude',
      extraction_confidence: calculateOverallConfidence(extractedData),
      extracted_at: new Date().toISOString(),
    };

    // Build field evidence mapping
    const fieldEvidence = buildFieldEvidenceMapping(extractedData);

    // Update policy with property details
    await supabase
      .from('policies')
      .update({
        property_details: propertyDetails,
        property_field_evidence: fieldEvidence,
        extraction_source: 'azure_di_claude',
        extraction_confidence: propertyDetails.extraction_confidence,
      })
      .eq('id', policy_id);

    // Calculate stats
    const stats = calculateExtractionStats(extractedData);

    // Update job as completed
    await supabase
      .from('policy_property_extraction_jobs')
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
        buildings_extracted: buildingsExtracted,
        deductibles_extracted: deductiblesExtracted,
        interests_extracted: interestsExtracted,
        endorsements_extracted: endorsementsExtracted,
        overall_confidence: propertyDetails.extraction_confidence,
      })
      .eq('id', job.id);

    return new Response(
      JSON.stringify({
        success: true,
        job_id: job.id,
        locations_count: locationsExtracted,
        buildings_count: buildingsExtracted,
        deductibles_count: deductiblesExtracted,
        interests_count: interestsExtracted,
        endorsements_count: endorsementsExtracted,
        confidence: propertyDetails.extraction_confidence,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Property extraction error:', error);

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
// CONSTRUCTION CLASS MAPPING
// =============================================================================

function mapConstructionClass(constructionType: string | null): number | null {
  if (!constructionType) return null;

  const type = constructionType.toLowerCase();

  if (type.includes('frame') || type.includes('wood')) return 1;
  if (type.includes('joisted') || (type.includes('masonry') && type.includes('joist'))) return 2;
  if (type.includes('non.?combustible') || type.includes('nc')) return 3;
  if (type.includes('masonry') && type.includes('non.?combustible')) return 4;
  if (type.includes('modified') || type.includes('mfr')) return 5;
  if (type.includes('fire') && type.includes('resistive')) return 6;

  return null;
}

// =============================================================================
// PROMPT BUILDERS
// =============================================================================

function getPropertySystemPrompt(): string {
  return `You are an expert Commercial Property policy data extractor for insurance professionals.

## YOUR ROLE
Extract structured property policy data from quotes, binders, policies, and endorsements.
Every extracted value MUST cite its source evidence ID(s) from the OCR catalog.

## CRITICAL RULES

### 1. EVIDENCE-BASED EXTRACTION ONLY
- ONLY extract values that appear in the evidence catalog
- NEVER guess, infer, or use industry defaults
- If a field is not in the evidence, return status: "NOT_FOUND"
- Each field MUST include evidence_ids array linking to source

### 2. CONFIDENCE SCORING
- 0.95-1.00: Exact match with clear label
- 0.85-0.94: Strong match from context/table
- 0.70-0.84: Reasonable inference
- Below 0.70: Mark as NEEDS_REVIEW

### 3. PROPERTY-SPECIFIC KNOWLEDGE

POLICY FORMS:
- Special Form (CP 10 30): Covers all risks except specifically excluded
- Broad Form (CP 10 20): Covers named perils
- Basic Form (CP 10 10): Limited named perils

VALUATION BASIS:
- Replacement Cost (RCV): Cost to replace with like kind/quality
- Actual Cash Value (ACV): RCV minus depreciation
- Functional Replacement (FRV): Cost to replace with functional equivalent
- Stated Amount: Maximum payable regardless of actual value
- Agreed Value: Suspends coinsurance; pays stated amount

CONSTRUCTION CLASSES (ISO):
- Class 1: Frame
- Class 2: Joisted Masonry
- Class 3: Non-Combustible
- Class 4: Masonry Non-Combustible
- Class 5: Modified Fire Resistive
- Class 6: Fire Resistive

COVERED PROPERTY CATEGORIES:
- Building: The structure itself
- BPP (Business Personal Property): Contents, furniture, equipment
- TIB (Tenant Improvements & Betterments): Lessee improvements
- Stock: Inventory/merchandise

BUSINESS INCOME:
- ALS (Actual Loss Sustained): No dollar limit, pays actual loss
- Specific Limit: Capped dollar amount
- Period of Restoration: Time to repair/rebuild
- Waiting Period: Usually 72 hours

DEDUCTIBLE TYPES:
- AOP (All Other Perils): Standard per-occurrence
- Wind/Hail: Often % of TIV or building value
- Named Storm/Hurricane: Higher %, coastal areas
- Flood: If included, usually high deductible
- Earthquake: Usually % of building value

### 4. LIMIT NORMALIZATION
- "$1,000,000" → 1000000
- "$1M" → 1000000
- "Included" or "See Schedule" → null, note in comments
- "Blanket" → note blanket structure

### 5. DEDUCTIBLE PARSING
- "$5,000 AOP" → type: flat, amount: 5000
- "2% of TIV" → type: percentage_tiv, percentage: 2
- "5% per building" → type: percentage_building, percentage: 5

## OUTPUT FORMAT
Return valid JSON matching the schema provided.
Never include explanatory text outside the JSON structure.`;
}

function buildPropertyUserPrompt(
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

Extract Commercial Property policy data. For each field include:
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
    }
  },
  "dates": {
    "effective_date": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
    "expiration_date": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
    "issue_date": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "form_details": {
    "form_type": { "value": "special", "evidence_ids": [], "confidence": 0, "status": "" },
    "is_iso_form": { "value": true, "evidence_ids": [], "confidence": 0, "status": "" },
    "form_number": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "valuation_summary": {
    "total_insured_value": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "total_building_value": { "value": 0, "evidence_ids": [], "confidence": 0, "status": "" },
    "total_bpp_value": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "is_blanket": { "value": false, "evidence_ids": [], "confidence": 0, "status": "" },
    "blanket_limit": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "coinsurance_percent": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "is_agreed_value": { "value": false, "evidence_ids": [], "confidence": 0, "status": "" },
    "margin_clause_percent": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "locations": [
    {
      "location_number": { "value": 1, "evidence_ids": [], "confidence": 0, "status": "" },
      "street": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "city": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "state": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "zip": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "territory": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "county": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "protection_class": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "occupancy": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
    }
  ],
  "buildings": [
    {
      "building_number": { "value": 1, "evidence_ids": [], "confidence": 0, "status": "" },
      "location_number": { "value": 1, "evidence_ids": [], "confidence": 0, "status": "" },
      "description": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "construction_type": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "occupancy": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "year_built": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "square_footage": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "stories": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "roof_type": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "roof_age": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "has_sprinklers": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "valuation_basis": { "value": "replacement_cost", "evidence_ids": [], "confidence": 0, "status": "" },
      "coinsurance_percent": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
    }
  ],
  "building_coverages": [
    {
      "building_number": { "value": 1, "evidence_ids": [], "confidence": 0, "status": "" },
      "location_number": { "value": 1, "evidence_ids": [], "confidence": 0, "status": "" },
      "building_limit": { "value": 0, "evidence_ids": [], "confidence": 0, "status": "" },
      "bpp_limit": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "tenant_improvements_limit": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "stock_limit": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
    }
  ],
  "business_income": {
    "is_included": { "value": false, "evidence_ids": [], "confidence": 0, "status": "" },
    "limit_type": { "value": "specific_limit", "evidence_ids": [], "confidence": 0, "status": "" },
    "limit": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "waiting_period_hours": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "extra_expense_included": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "ordinance_or_law": {
    "is_included": { "value": false, "evidence_ids": [], "confidence": 0, "status": "" },
    "coverage_a_limit": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "coverage_b_limit": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "coverage_c_limit": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "combined_limit": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  },
  "deductibles": [
    {
      "name": { "value": "All Other Perils", "evidence_ids": [], "confidence": 0, "status": "" },
      "peril": { "value": "aop", "evidence_ids": [], "confidence": 0, "status": "" },
      "amount": { "value": 0, "evidence_ids": [], "confidence": 0, "status": "" },
      "deductible_type": { "value": "flat", "evidence_ids": [], "confidence": 0, "status": "" },
      "percentage": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "applies_to": { "value": "per_occurrence", "evidence_ids": [], "confidence": 0, "status": "" }
    }
  ],
  "interests": [
    {
      "interest_type": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "name": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "address": {
        "street": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
        "city": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
        "state": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
        "zip": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
      },
      "loan_number": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "location_number": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "building_number": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
    }
  ],
  "endorsements": [
    {
      "form_number": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "title": { "value": "", "evidence_ids": [], "confidence": 0, "status": "" },
      "edition_date": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "category": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
      "is_limitation": { "value": false, "evidence_ids": [], "confidence": 0, "status": "" }
    }
  ],
  "premium": {
    "total_premium": { "value": 0, "evidence_ids": [], "confidence": 0, "status": "" },
    "building_premium": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "bpp_premium": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "business_income_premium": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "policy_fee": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" },
    "terrorism_premium": { "value": null, "evidence_ids": [], "confidence": 0, "status": "" }
  }
}
\`\`\`

## EXTRACTION INSTRUCTIONS

1. **Locations/Buildings**: Look for Schedule of Locations/Buildings tables
2. **Limits**: Extract from coverage summary or schedule pages
3. **Deductibles**: CRITICAL - Extract ALL deductible types (AOP, Wind/Hail, Named Storm, Flood, etc.)
4. **BI/O&L**: Look for Business Income and Ordinance or Law sections
5. **Interests**: Check mortgagee/loss payee schedules
6. **Endorsements**: List all forms, flag high-impact categories

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
