import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { modelBoundaryFetch } from '../_shared/modelBoundaryFetch.ts';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ACORD field mapping prompt for Claude
const ACORD_MAPPING_PROMPT = `You are an expert insurance document analyzer. Given extracted key-value pairs and text from an insurance document, map the data to ACORD form fields.

ACORD FIELD REFERENCE (Common fields across ACORD 125, 126, 127, 130, 140):
- NamedInsured: The insured's name/business name
- MailingAddress, City, State, ZipCode: Address components
- Phone, Email, Fax: Contact info
- FEIN: Federal Employer ID Number
- SICCode, NAICSCode: Business classification codes
- BusinessDescription: Nature of business
- YearsInBusiness: How long operating
- EntityType: LLC, Corp, Partnership, Sole Prop, etc.
- PolicyNumber: Policy number
- EffectiveDate, ExpirationDate: Policy dates (format: MM/DD/YYYY)
- Carrier, CarrierNAIC: Insurance company info
- ProducerName, ProducerCode: Agent/producer info

COVERAGE LIMITS (format as dollar amounts):
- GeneralAggregate, EachOccurrence, ProductsCompletedOps
- PersonalAdvInjury, DamageToRentedPremises, MedicalExpense
- CombinedSingleLimit, BodilyInjuryPerPerson, BodilyInjuryPerAccident
- PropertyDamage, UninsuredMotorist, UnderinsuredMotorist
- Comprehensive, Collision: Auto physical damage
- WCStatutoryLimits, EmployersLiabilityEachAccident

PREMIUM FIELDS:
- TotalPremium, GLPremium, AutoPremium, WCPremium, PropertyPremium

Return ONLY a JSON object with this structure:
{
  "mapped_fields": {
    "FieldName": "extracted value"
  },
  "unmapped_data": ["list of extracted values that couldn't be mapped"],
  "confidence_scores": {
    "FieldName": 0.95
  },
  "suggestions": ["any recommendations for the user"],
  "document_type": "dec_page|prior_policy|application|loss_run|other"
}`;

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  let extractionId: string | null = null;

  try {
    // Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase credentials not configured');
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
      target_form_number // e.g., "125" - helps Claude map to right fields
    } = await req.json();

    console.log('========================================');
    console.log('ACORD DOCUMENT EXTRACTOR - START');
    console.log('========================================');
    console.log('Document:', document_name);
    console.log('Account ID:', account_id);
    console.log('ACORD Form ID:', acord_form_id);
    console.log('Target Form:', target_form_number);

    // Get user ID from authenticated user
    const userId = authResult.id;

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

    // ========================================
    // STEP 1: Azure Document Intelligence
    // ========================================
    console.log('----------------------------------------');
    console.log('STEP 1: Azure Document Intelligence');
    console.log('----------------------------------------');

    const AZURE_ENDPOINT = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT');
    const AZURE_API_KEY = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY');

    if (!AZURE_ENDPOINT || !AZURE_API_KEY) {
      throw new Error('Azure Document Intelligence credentials not configured');
    }

    const cleanEndpoint = AZURE_ENDPOINT.endsWith('/') ? AZURE_ENDPOINT.slice(0, -1) : AZURE_ENDPOINT;

    // Create signed URL if it's a Supabase storage URL
    let documentAccessUrl = document_url;
    if (document_url.includes('supabase') && document_url.includes('/storage/')) {
      const urlParts = document_url.split('/documents/');
      if (urlParts.length === 2) {
        const storagePath = urlParts[1];
        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from('documents')
          .createSignedUrl(storagePath, 3600);
        if (!signedUrlError && signedUrlData) {
          documentAccessUrl = signedUrlData.signedUrl;
        }
      }
    }

    // Use prebuilt-document model for key-value extraction
    const analyzeUrl = `${cleanEndpoint}/formrecognizer/documentModels/prebuilt-document:analyze?api-version=2023-07-31`;

    console.log('Calling Azure DI prebuilt-document model...');
    const analyzeResponse = await modelBoundaryFetch(analyzeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': AZURE_API_KEY,
      },
      body: JSON.stringify({ urlSource: documentAccessUrl })
    });

    if (!analyzeResponse.ok) {
      const errorText = await analyzeResponse.text();
      throw new Error(`Azure DI request failed: ${analyzeResponse.status} - ${errorText}`);
    }

    const operationLocation = analyzeResponse.headers.get('Operation-Location');
    if (!operationLocation) throw new Error('No Operation-Location header from Azure');

    // Poll for results
    let azureResult = null;
    let attempts = 0;
    const maxAttempts = 60;

    while (attempts < maxAttempts) {
      await sleep(2000);
      attempts++;

      const resultResponse = await modelBoundaryFetch(operationLocation, {
        headers: { 'Ocp-Apim-Subscription-Key': AZURE_API_KEY }
      });

      const result = await resultResponse.json();
      console.log(`Poll ${attempts}/${maxAttempts}: ${result.status}`);

      if (result.status === 'succeeded') {
        azureResult = result;
        break;
      } else if (result.status === 'failed') {
        throw new Error('Azure DI analysis failed: ' + JSON.stringify(result.error));
      }
    }

    if (!azureResult) throw new Error('Azure DI timed out');

    // Extract key-value pairs
    const keyValuePairs: Record<string, string> = {};
    const tables: any[] = [];
    let fullText = '';

    const analyzeResultData = azureResult.analyzeResult;

    // Get key-value pairs
    if (analyzeResultData.keyValuePairs) {
      for (const kv of analyzeResultData.keyValuePairs) {
        const key = kv.key?.content?.trim();
        const value = kv.value?.content?.trim();
        if (key && value) {
          keyValuePairs[key] = value;
        }
      }
    }

    // Get tables
    if (analyzeResultData.tables) {
      for (const table of analyzeResultData.tables) {
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

        tables.push(tableData);
      }
    }

    // Get full text
    if (analyzeResultData.content) {
      fullText = analyzeResultData.content;
    } else if (analyzeResultData.pages) {
      for (const page of analyzeResultData.pages) {
        if (page.lines) {
          fullText += page.lines.map((l: any) => l.content).join('\n') + '\n\n';
        }
      }
    }

    const pageCount = analyzeResultData.pages?.length || 1;
    console.log(`Extracted ${Object.keys(keyValuePairs).length} key-value pairs`);
    console.log(`Extracted ${tables.length} tables`);
    console.log(`Text length: ${fullText.length} chars`);

    // Update extraction with Azure results
    await supabase
      .from('document_extractions')
      .update({
        page_count: pageCount,
        azure_key_value_pairs: keyValuePairs,
        azure_tables: tables,
        azure_text_content: fullText.substring(0, 100000), // Limit storage
        azure_confidence_score: analyzeResultData.confidence || null,
        status: 'extracted'
      })
      .eq('id', extractionId);

    // ========================================
    // STEP 2: Claude Field Mapping
    // ========================================
    console.log('----------------------------------------');
    console.log('STEP 2: Claude Field Mapping');
    console.log('----------------------------------------');

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

    if (!ANTHROPIC_API_KEY) {
      console.log('No Anthropic API key - skipping Claude mapping');

      // Return Azure results only
      return new Response(
        JSON.stringify({
          success: true,
          extraction_id: extractionId,
          extracted_fields: keyValuePairs,
          tables,
          page_count: pageCount,
          needs_manual_mapping: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build context for Claude
    const extractionContext = `
EXTRACTED KEY-VALUE PAIRS:
${JSON.stringify(keyValuePairs, null, 2)}

EXTRACTED TABLES:
${tables.map((t, i) => `Table ${i + 1}:\n${t.map((row: string[]) => row.join(' | ')).join('\n')}`).join('\n\n')}

DOCUMENT TEXT (first 20000 chars):
${fullText.substring(0, 20000)}

TARGET ACORD FORM: ${target_form_number || 'Any (125, 126, 127, 130, 140)'}
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

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.error('Claude API error:', errorText);
      throw new Error(`Claude API failed: ${claudeResponse.status}`);
    }

    const claudeData = await claudeResponse.json();
    const claudeContent = ((claudeData.content ?? []).filter((b: { type?: string; text?: string }) => b?.type === 'text').map((b: { text?: string }) => b.text ?? '').join('\n'));

    // Parse Claude's JSON response
    let mappingResult;
    try {
      const jsonMatch = claudeContent.match(/\{[\s\S]*\}/);
      mappingResult = jsonMatch ? JSON.parse(jsonMatch[0]) : { mapped_fields: {}, unmapped_data: [], confidence_scores: {}, suggestions: [] };
    } catch (parseError) {
      console.error('Failed to parse Claude response:', claudeContent);
      mappingResult = { mapped_fields: keyValuePairs, unmapped_data: [], confidence_scores: {}, suggestions: ['Claude response parsing failed - using raw extracted values'] };
    }

    console.log(`Claude mapped ${Object.keys(mappingResult.mapped_fields || {}).length} fields`);

    // Update extraction with Claude results
    await supabase
      .from('document_extractions')
      .update({
        claude_mapped_fields: mappingResult.mapped_fields || {},
        claude_unmapped_fields: mappingResult.unmapped_data || [],
        claude_suggestions: mappingResult.suggestions || [],
        claude_confidence_scores: mappingResult.confidence_scores || {},
        extracted_fields: mappingResult.mapped_fields || {},
        document_type: mappingResult.document_type || 'other',
        status: 'mapped',
        extraction_completed_at: new Date().toISOString()
      })
      .eq('id', extractionId);

    console.log('========================================');
    console.log('EXTRACTION COMPLETE');
    console.log('========================================');

    return new Response(
      JSON.stringify({
        success: true,
        extraction_id: extractionId,
        extracted_fields: mappingResult.mapped_fields || {},
        unmapped_data: mappingResult.unmapped_data || [],
        confidence_scores: mappingResult.confidence_scores || {},
        suggestions: mappingResult.suggestions || [],
        document_type: mappingResult.document_type || 'other',
        tables,
        page_count: pageCount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('========================================');
    console.error('EXTRACTION FAILED:', error.message);
    console.error('========================================');

    // Update extraction status to failed
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
