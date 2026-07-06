import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { modelBoundaryFetch } from '../_shared/modelBoundaryFetch.ts';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================
// AZURE MODEL CONFIGURATION
// ============================================

const AZURE_MODELS = {
  'prebuilt-document': {
    name: 'Document',
    description: 'General document with key-value pairs',
    priority: 1,
  },
  'prebuilt-invoice': {
    name: 'Invoice',
    description: 'Invoices and billing documents',
    priority: 2,
  },
  'prebuilt-layout': {
    name: 'Layout',
    description: 'Tables and structure extraction',
    priority: 3,
  },
  'prebuilt-read': {
    name: 'Read (OCR)',
    description: 'Pure OCR for text extraction',
    priority: 4,
  },
};

// ============================================
// ENHANCED CLAUDE MAPPING PROMPT
// ============================================

const ACORD_MAPPING_PROMPT = `You are an expert insurance document analyzer with deep knowledge of ACORD forms and carrier document formats.

## YOUR TASK
Analyze the extracted data from an insurance document and map it to ACORD form fields with HIGH PRECISION.

## ACORD FIELD REFERENCE

### Insured Information
- NamedInsured: Full legal name of the insured
- DBA: Doing Business As name
- MailingAddress, City, State, ZipCode: Address components
- Phone, Email, Fax: Contact information
- FEIN: Federal Employer ID (XX-XXXXXXX format)
- SICCode: 4-digit SIC classification
- NAICSCode: 6-digit NAICS classification
- BusinessDescription: Nature of operations
- YearsInBusiness: Number of years
- EntityType: Corporation, LLC, Partnership, Sole Proprietor, etc.

### Policy Information
- PolicyNumber: Full policy number
- EffectiveDate: Policy start date (MM/DD/YYYY)
- ExpirationDate: Policy end date (MM/DD/YYYY)
- Carrier: Insurance company name
- CarrierNAIC: Carrier NAIC code
- ProducerName: Agent/broker name
- ProducerCode: Agent code with carrier

### General Liability Limits (format as dollar amounts)
- GeneralAggregate: General aggregate limit
- EachOccurrence: Per occurrence limit
- ProductsCompletedOps: Products/completed operations aggregate
- PersonalAdvInjury: Personal & advertising injury
- DamageToRentedPremises: Fire damage legal liability
- MedicalExpense: Medical expense limit

### Auto Liability Limits
- CombinedSingleLimit: Combined single limit
- BodilyInjuryPerPerson: BI per person
- BodilyInjuryPerAccident: BI per accident
- PropertyDamage: Property damage limit
- UninsuredMotorist: UM coverage
- UnderinsuredMotorist: UIM coverage
- Comprehensive: Comp deductible
- Collision: Collision deductible

### Workers Compensation
- WCStatutoryLimits: Usually "X" for statutory
- EmployersLiabilityEachAccident: EL per accident
- EmployersLiabilityDiseasePolicy: EL disease policy limit
- EmployersLiabilityDiseaseEmployee: EL disease per employee

### Premium
- TotalPremium: Total policy premium
- GLPremium: GL premium
- AutoPremium: Auto premium
- WCPremium: WC premium
- PropertyPremium: Property premium

## ANALYSIS RULES
1. Be PRECISE - only map fields you are confident about (>80%)
2. Normalize dates to MM/DD/YYYY format
3. Format currency without $ symbol, with commas (e.g., "1,000,000")
4. Extract COMPLETE values - don't truncate policy numbers or addresses
5. If a value appears multiple times, use the most complete/clear instance
6. Note any values that seem incorrect or inconsistent

## RESPONSE FORMAT (JSON ONLY)
{
  "mapped_fields": {
    "FieldName": "extracted value"
  },
  "confidence_scores": {
    "FieldName": 0.95
  },
  "unmapped_data": [
    {"key": "Some Label", "value": "Some Value", "reason": "No matching ACORD field"}
  ],
  "document_type": "dec_page|prior_policy|application|loss_run|certificate|endorsement|other",
  "detected_carrier": "Carrier name if identified",
  "detected_lob": "GL|Auto|WC|Property|Package|Other",
  "suggestions": ["Any recommendations"],
  "warnings": ["Any data quality issues noticed"]
}`;

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  let extractionId: string | null = null;
  const startTime = Date.now();

  try {
    // Initialize Supabase for auth
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Require authentication
    const authResult = await requireAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) {
      return authResult;
    }

    const {
      document_url,
      document_name,
      account_id,
      acord_form_id,
      target_form_number,
      use_template_matching = true,
      use_ensemble = true,
      enable_learning = true,
    } = await req.json();

    console.log('========================================');
    console.log('ACORD DOCUMENT EXTRACTOR V2 - START');
    console.log('========================================');
    console.log('Document:', document_name);
    console.log('Template Matching:', use_template_matching);
    console.log('Ensemble:', use_ensemble);
    console.log('Learning:', enable_learning);

    // Get user ID from authenticated user
    const userId = authResult.id;

    // Get processing config
    const { data: config } = await supabase
      .from('extraction_processing_config')
      .select('*')
      .eq('is_default', true)
      .single();

    const processingConfig = config || {
      azure_models: ['prebuilt-document', 'prebuilt-invoice', 'prebuilt-layout'],
      auto_apply_threshold: 0.90,
      review_threshold: 0.70,
      enable_template_matching: true,
      enable_learning: true,
    };

    // Create extraction record
    const { data: extraction, error: insertError } = await supabase
      .from('document_extractions')
      .insert({
        document_url,
        document_name,
        account_id: account_id || null,
        acord_form_id: acord_form_id || null,
        status: 'processing',
        extraction_started_at: new Date().toISOString(),
        created_by: userId,
      })
      .select()
      .single();

    if (insertError) throw insertError;
    extractionId = extraction.id;
    console.log('Extraction ID:', extractionId);

    // Create signed URL if needed
    let documentAccessUrl = document_url;
    if (document_url.includes('supabase') && document_url.includes('/storage/')) {
      const urlParts = document_url.split('/documents/');
      if (urlParts.length === 2) {
        const storagePath = urlParts[1];
        const { data: signedUrlData } = await supabase.storage
          .from('documents')
          .createSignedUrl(storagePath, 3600);
        if (signedUrlData) {
          documentAccessUrl = signedUrlData.signedUrl;
        }
      }
    }

    // ========================================
    // STEP 1: TEMPLATE MATCHING
    // ========================================
    let matchedTemplate = null;
    let templateFields: Record<string, any> = {};

    if (use_template_matching && processingConfig.enable_template_matching) {
      console.log('----------------------------------------');
      console.log('STEP 1: Template Matching');
      console.log('----------------------------------------');

      const { data: templates } = await supabase
        .from('carrier_document_templates')
        .select(`
          *,
          template_field_zones(*)
        `)
        .eq('is_active', true);

      // TODO: Implement actual template matching using image comparison
      // For now, we'll proceed without template matching
      console.log(`Found ${templates?.length || 0} active templates`);
    }

    // ========================================
    // STEP 2: MULTI-MODEL AZURE EXTRACTION
    // ========================================
    console.log('----------------------------------------');
    console.log('STEP 2: Azure Multi-Model Extraction');
    console.log('----------------------------------------');

    const AZURE_ENDPOINT = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT');
    const AZURE_API_KEY = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY');

    if (!AZURE_ENDPOINT || !AZURE_API_KEY) {
      throw new Error('Azure Document Intelligence credentials not configured');
    }

    const cleanEndpoint = AZURE_ENDPOINT.endsWith('/') ? AZURE_ENDPOINT.slice(0, -1) : AZURE_ENDPOINT;

    // Run multiple models in parallel (ensemble approach)
    const modelsToUse = use_ensemble
      ? processingConfig.azure_models || ['prebuilt-document']
      : ['prebuilt-document'];

    console.log('Running models:', modelsToUse);

    const modelResults = await Promise.all(
      modelsToUse.map(async (model: string) => {
        try {
          return await runAzureModel(cleanEndpoint, AZURE_API_KEY, documentAccessUrl, model);
        } catch (error: any) {
          console.error(`Model ${model} failed:`, error.message);
          return null;
        }
      })
    );

    // Merge results from all models
    const mergedResult = mergeModelResults(modelResults.filter(Boolean));

    console.log(`Merged ${Object.keys(mergedResult.keyValuePairs).length} key-value pairs`);
    console.log(`Merged ${mergedResult.tables.length} tables`);

    // Update extraction with Azure results
    await supabase
      .from('document_extractions')
      .update({
        page_count: mergedResult.pageCount,
        azure_key_value_pairs: mergedResult.keyValuePairs,
        azure_tables: mergedResult.tables,
        azure_text_content: mergedResult.fullText.substring(0, 100000),
        azure_confidence_score: mergedResult.avgConfidence,
        status: 'extracted'
      })
      .eq('id', extractionId);

    // ========================================
    // STEP 3: APPLY LEARNED RULES
    // ========================================
    let learnedFields: Record<string, any> = {};

    if (enable_learning && processingConfig.enable_learning) {
      console.log('----------------------------------------');
      console.log('STEP 3: Apply Learned Rules');
      console.log('----------------------------------------');

      const { data: learnedRules } = await supabase
        .from('extraction_learned_rules')
        .select('*')
        .eq('is_active', true)
        .order('confidence_score', { ascending: false });

      if (learnedRules && learnedRules.length > 0) {
        console.log(`Applying ${learnedRules.length} learned rules`);

        for (const rule of learnedRules) {
          // Check if pattern matches in extracted text
          const pattern = rule.source_pattern.toLowerCase();
          const fullTextLower = mergedResult.fullText.toLowerCase();

          if (fullTextLower.includes(pattern)) {
            // Try to find the value near this pattern
            const patternIndex = fullTextLower.indexOf(pattern);
            const contextStart = Math.max(0, patternIndex - 50);
            const contextEnd = Math.min(fullTextLower.length, patternIndex + pattern.length + 200);
            const context = mergedResult.fullText.substring(contextStart, contextEnd);

            // Look for the value in key-value pairs
            for (const [key, value] of Object.entries(mergedResult.keyValuePairs)) {
              if (key.toLowerCase().includes(pattern) || context.includes(value as string)) {
                learnedFields[rule.target_field] = value;
                console.log(`Learned rule matched: ${rule.target_field} = ${value}`);
                break;
              }
            }
          }
        }
      }
    }

    // ========================================
    // STEP 4: CLAUDE FIELD MAPPING
    // ========================================
    console.log('----------------------------------------');
    console.log('STEP 4: Claude Field Mapping');
    console.log('----------------------------------------');

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    let mappingResult: any = { mapped_fields: {}, confidence_scores: {} };

    if (ANTHROPIC_API_KEY) {
      const extractionContext = `
EXTRACTED KEY-VALUE PAIRS:
${JSON.stringify(mergedResult.keyValuePairs, null, 2)}

EXTRACTED TABLES:
${mergedResult.tables.map((t: any, i: number) => `Table ${i + 1}:\n${t.map((row: string[]) => row.join(' | ')).join('\n')}`).join('\n\n')}

DOCUMENT TEXT (first 25000 chars):
${mergedResult.fullText.substring(0, 25000)}

TARGET ACORD FORM: ${target_form_number || 'Any'}
${matchedTemplate ? `MATCHED TEMPLATE: ${matchedTemplate.template_name} (${matchedTemplate.carrier_name})` : ''}
`;

      const claudeResponse = await modelBoundaryFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-5',
          max_tokens: 4096,
          messages: [
            {
              role: 'user',
              content: `${ACORD_MAPPING_PROMPT}\n\n${extractionContext}`
            }
          ]
        })
      });

      if (claudeResponse.ok) {
        const claudeData = await claudeResponse.json();
        const claudeContent = claudeData.content[0]?.text || '';

        try {
          const jsonMatch = claudeContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            mappingResult = JSON.parse(jsonMatch[0]);
          }
        } catch (parseError) {
          console.error('Failed to parse Claude response');
        }
      }
    }

    // ========================================
    // STEP 5: MERGE AND SCORE FIELDS
    // ========================================
    console.log('----------------------------------------');
    console.log('STEP 5: Merge and Score Fields');
    console.log('----------------------------------------');

    // Combine all sources: template fields, learned rules, Claude mapping
    const allFields = {
      ...templateFields,
      ...learnedFields,
      ...(mappingResult.mapped_fields || {}),
    };

    const allConfidences = {
      ...(mappingResult.confidence_scores || {}),
    };

    // Add default confidence for learned fields
    for (const field of Object.keys(learnedFields)) {
      if (!allConfidences[field]) {
        allConfidences[field] = 0.85; // Learned rules get 85% confidence
      }
    }

    // Add default confidence for template fields
    for (const field of Object.keys(templateFields)) {
      if (!allConfidences[field]) {
        allConfidences[field] = 0.95; // Template matches get 95% confidence
      }
    }

    // Categorize fields by confidence tier
    const autoApplyThreshold = processingConfig.auto_apply_threshold || 0.90;
    const reviewThreshold = processingConfig.review_threshold || 0.70;

    const autoAppliedFields: string[] = [];
    const needsReviewFields: string[] = [];
    const flaggedFields: string[] = [];

    for (const [field, confidence] of Object.entries(allConfidences)) {
      const conf = confidence as number;
      if (conf >= autoApplyThreshold) {
        autoAppliedFields.push(field);
      } else if (conf >= reviewThreshold) {
        needsReviewFields.push(field);
      } else {
        flaggedFields.push(field);
      }
    }

    // Determine overall confidence tier
    const avgConfidence = Object.values(allConfidences).length > 0
      ? (Object.values(allConfidences) as number[]).reduce((a, b) => a + b, 0) / Object.values(allConfidences).length
      : 0;

    let confidenceTier = 'low';
    if (avgConfidence >= autoApplyThreshold) {
      confidenceTier = 'high';
    } else if (avgConfidence >= reviewThreshold) {
      confidenceTier = 'medium';
    }

    // Calculate review priority (higher = more urgent)
    const reviewPriority = Math.round((1 - avgConfidence) * 100);

    // ========================================
    // STEP 6: UPDATE EXTRACTION RECORD
    // ========================================
    const processingTime = Date.now() - startTime;

    await supabase
      .from('document_extractions')
      .update({
        claude_mapped_fields: mappingResult.mapped_fields || {},
        claude_unmapped_fields: mappingResult.unmapped_data || [],
        claude_suggestions: mappingResult.suggestions || [],
        claude_confidence_scores: allConfidences,
        extracted_fields: allFields,
        document_type: mappingResult.document_type || 'other',
        status: 'mapped',
        confidence_tier: confidenceTier,
        review_status: confidenceTier === 'high' ? 'approved' : 'pending',
        review_priority: reviewPriority,
        auto_applied_fields: autoAppliedFields,
        needs_review_fields: needsReviewFields,
        flagged_fields: flaggedFields,
        matched_template_id: matchedTemplate?.id || null,
        template_match_confidence: matchedTemplate ? 0.95 : null,
        extraction_completed_at: new Date().toISOString()
      })
      .eq('id', extractionId);

    console.log('========================================');
    console.log('EXTRACTION COMPLETE');
    console.log(`Processing time: ${processingTime}ms`);
    console.log(`Confidence tier: ${confidenceTier}`);
    console.log(`Auto-apply: ${autoAppliedFields.length}, Review: ${needsReviewFields.length}, Flagged: ${flaggedFields.length}`);
    console.log('========================================');

    return new Response(
      JSON.stringify({
        success: true,
        extraction_id: extractionId,
        extracted_fields: allFields,
        confidence_scores: allConfidences,
        confidence_tier: confidenceTier,
        auto_applied_fields: autoAppliedFields,
        needs_review_fields: needsReviewFields,
        flagged_fields: flaggedFields,
        unmapped_data: mappingResult.unmapped_data || [],
        suggestions: mappingResult.suggestions || [],
        warnings: mappingResult.warnings || [],
        document_type: mappingResult.document_type || 'other',
        detected_carrier: mappingResult.detected_carrier,
        detected_lob: mappingResult.detected_lob,
        tables: mergedResult.tables,
        page_count: mergedResult.pageCount,
        processing_time_ms: processingTime,
        matched_template: matchedTemplate ? {
          id: matchedTemplate.id,
          name: matchedTemplate.template_name,
          carrier: matchedTemplate.carrier_name,
        } : null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('========================================');
    console.error('EXTRACTION FAILED:', error.message);
    console.error('========================================');

    if (extractionId) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      await supabase
        .from('document_extractions')
        .update({
          status: 'failed',
          error_message: error.message,
          extraction_completed_at: new Date().toISOString()
        })
        .eq('id', extractionId);
    }

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

// ============================================
// AZURE MODEL RUNNER
// ============================================

async function runAzureModel(
  endpoint: string,
  apiKey: string,
  documentUrl: string,
  model: string
) {
  console.log(`Running Azure model: ${model}`);

  const analyzeUrl = `${endpoint}/formrecognizer/documentModels/${model}:analyze?api-version=2023-07-31`;

  const analyzeResponse = await modelBoundaryFetch(analyzeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Key': apiKey,
    },
    body: JSON.stringify({ urlSource: documentUrl })
  });

  if (!analyzeResponse.ok) {
    throw new Error(`Azure ${model} request failed: ${analyzeResponse.status}`);
  }

  const operationLocation = analyzeResponse.headers.get('Operation-Location');
  if (!operationLocation) throw new Error('No Operation-Location header');

  // Poll for results
  let result = null;
  let attempts = 0;
  const maxAttempts = 60;

  while (attempts < maxAttempts) {
    await sleep(2000);
    attempts++;

    const resultResponse = await modelBoundaryFetch(operationLocation, {
      headers: { 'Ocp-Apim-Subscription-Key': apiKey }
    });

    const data = await resultResponse.json();

    if (data.status === 'succeeded') {
      result = data;
      break;
    } else if (data.status === 'failed') {
      throw new Error(`Azure ${model} failed: ${JSON.stringify(data.error)}`);
    }
  }

  if (!result) throw new Error(`Azure ${model} timed out`);

  return {
    model,
    analyzeResult: result.analyzeResult,
  };
}

// ============================================
// MERGE MODEL RESULTS
// ============================================

function mergeModelResults(results: any[]) {
  const keyValuePairs: Record<string, any> = {};
  const tables: any[] = [];
  let fullText = '';
  let pageCount = 1;
  let totalConfidence = 0;
  let confidenceCount = 0;

  for (const result of results) {
    if (!result?.analyzeResult) continue;

    const ar = result.analyzeResult;

    // Merge key-value pairs (prefer higher confidence)
    if (ar.keyValuePairs) {
      for (const kv of ar.keyValuePairs) {
        const key = kv.key?.content?.trim();
        const value = kv.value?.content?.trim();
        const confidence = kv.confidence || 0.5;

        if (key && value) {
          // Only overwrite if new confidence is higher
          if (!keyValuePairs[key] || confidence > (keyValuePairs[key]._confidence || 0)) {
            keyValuePairs[key] = value;
          }
          totalConfidence += confidence;
          confidenceCount++;
        }
      }
    }

    // Collect tables (deduplicate later if needed)
    if (ar.tables) {
      for (const table of ar.tables) {
        const tableData: string[][] = [];
        const rows: Record<number, Record<number, string>> = {};

        for (const cell of table.cells || []) {
          if (!rows[cell.rowIndex]) rows[cell.rowIndex] = {};
          rows[cell.rowIndex][cell.columnIndex] = cell.content || '';
        }

        for (const rowIdx of Object.keys(rows).map(Number).sort((a, b) => a - b)) {
          const row: string[] = [];
          for (const colIdx of Object.keys(rows[rowIdx]).map(Number).sort((a, b) => a - b)) {
            row.push(rows[rowIdx][colIdx]);
          }
          tableData.push(row);
        }

        // Only add if table has meaningful content
        if (tableData.length > 1 || (tableData.length === 1 && tableData[0].length > 1)) {
          tables.push(tableData);
        }
      }
    }

    // Get fullest text
    if (ar.content && ar.content.length > fullText.length) {
      fullText = ar.content;
    } else if (ar.pages && !fullText) {
      for (const page of ar.pages) {
        if (page.lines) {
          fullText += page.lines.map((l: any) => l.content).join('\n') + '\n\n';
        }
      }
    }

    // Get max page count
    if (ar.pages?.length > pageCount) {
      pageCount = ar.pages.length;
    }
  }

  return {
    keyValuePairs,
    tables,
    fullText,
    pageCount,
    avgConfidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
  };
}
