import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  let documentId: string | null = null;

  try {
    const { 
      document_url, 
      document_id, 
      file_name,
      account_id,
      user_id 
    } = await req.json();
    documentId = document_id;

    console.log('[Document Analysis] Starting:', file_name);

    // Initialize Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Create initial record
    const normalizedAccountId = account_id && String(account_id).trim() !== '' ? account_id : null;
    const { data: analysisRecord, error: insertError } = await supabase
      .from('document_analysis')
      .insert({
        document_id,
        file_name,
        account_id: normalizedAccountId,
        created_by: user_id,
        processing_status: 'pending'
      })
      .select()
      .single();

    if (insertError) {
      console.error('[Document Analysis] Insert error:', insertError);
      throw insertError;
    }

    // Step 1: Extract text with Azure Document Intelligence
    console.log('[OCR] Starting Azure Document Intelligence...');
    
    const AZURE_DOC_INTEL_KEY = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY');
    const AZURE_DOC_INTEL_ENDPOINT = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT');
    
    if (!AZURE_DOC_INTEL_KEY || !AZURE_DOC_INTEL_ENDPOINT) {
      throw new Error('Azure Document Intelligence credentials not configured');
    }

    // Extract path from URL
    const urlPath = document_url.split('/storage/v1/object/public/')[1];
    if (!urlPath) {
      throw new Error('Invalid document URL format');
    }

    // Download document using Supabase client
    const { data: docData, error: downloadError } = await supabase.storage
      .from(urlPath.split('/')[0])
      .download(urlPath.split('/').slice(1).join('/'));

    if (downloadError || !docData) {
      console.error('[Download] Error:', downloadError);
      throw new Error(`Failed to download document: ${downloadError?.message || 'Unknown error'}`);
    }

    const docBuffer = await docData.arrayBuffer();
    
    // Call Azure Document Intelligence (v4 GA) with robust endpoint/model fallback
    const base = AZURE_DOC_INTEL_ENDPOINT.replace(/\/$/, '');
    const candidateEndpoints = [
      `${base}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=2024-07-31`,
      `${base}/documentintelligence/documentModels/prebuilt-document:analyze?api-version=2024-07-31`,
      `${base}/formrecognizer/documentModels/prebuilt-read:analyze?api-version=2024-07-31`,
      `${base}/formrecognizer/documentModels/prebuilt-document:analyze?api-version=2024-07-31`,
    ];

    let analyzeResponse: Response | null = null;
    let chosenEndpoint = '';
    for (const ep of candidateEndpoints) {
      console.log(`[OCR] Trying Azure endpoint: ${ep}`);
      const resp = await fetch(ep, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': AZURE_DOC_INTEL_KEY,
          'Content-Type': 'application/octet-stream',
          'Accept': 'application/json'
        },
        body: docBuffer
      });
      if (resp.ok && (resp.status === 200 || resp.status === 202)) {
        analyzeResponse = resp;
        chosenEndpoint = ep;
        break;
      } else {
        const errorPreview = await resp.text().catch(() => '');
        console.warn(`[OCR] Azure endpoint failed (${resp.status}): ${ep} - ${errorPreview?.slice(0, 400)}`);
      }
    }

    if (!analyzeResponse) {
      throw new Error('Azure Document Intelligence error: no valid endpoint responded (tried documentintelligence/formrecognizer with prebuilt-read/document)');
    }
    console.log(`[OCR] Using Azure endpoint: ${chosenEndpoint}`);

    // Get the operation location to poll for results
    const operationLocation = analyzeResponse.headers.get('Operation-Location') || analyzeResponse.headers.get('operation-location');
    if (!operationLocation) {
      throw new Error('No operation location returned from Azure');
    }

    console.log('[OCR] Polling for results...');
    
    // Poll for results
    let ocrText = '';
    let attempts = 0;
    const maxAttempts = 45; // up to ~45 seconds max wait
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      
      const resultResponse = await fetch(operationLocation, {
        headers: {
          'Ocp-Apim-Subscription-Key': AZURE_DOC_INTEL_KEY,
          'Accept': 'application/json'
        }
      });

      if (!resultResponse.ok) {
        throw new Error(`Failed to get results: ${resultResponse.status}`);
      }

      const result = await resultResponse.json();
      
      if (result.status === 'succeeded') {
        const analyze = result.analyzeResult || {};
        // Prefer the unified content field if available
        if (analyze.content && typeof analyze.content === 'string' && analyze.content.length > 0) {
          ocrText = analyze.content;
        } else {
          // Fallback to lines/paragraphs
          const pages = analyze.pages || [];
          const lines = pages.flatMap((page: any) => page.lines || []);
          ocrText = lines.map((line: any) => line.content).join('\n');
          if ((!ocrText || ocrText.length < 10) && Array.isArray(analyze.paragraphs)) {
            ocrText = analyze.paragraphs.map((p: any) => p.content).join('\n');
          }
        }
        console.log(`[OCR] Extracted ${ocrText?.length ?? 0} characters`);
        break;
      } else if (result.status === 'failed') {
        throw new Error('Azure Document Intelligence analysis failed');
      }
      
      attempts++;
    }

    if (!ocrText || ocrText.length < 50) {
      throw new Error('OCR extracted insufficient text from document');
    }

    // Step 2: Parse with Azure OpenAI
    console.log('[AI] Parsing with Azure OpenAI...');
    
    const AZURE_OPENAI_KEY = Deno.env.get('AZURE_OPENAI_KEY');
    const AZURE_OPENAI_ENDPOINT = Deno.env.get('AZURE_OPENAI_ENDPOINT');
    const AZURE_OPENAI_DEPLOYMENT = Deno.env.get('AZURE_OPENAI_DEPLOYMENT_NAME');
    
    if (!AZURE_OPENAI_KEY || !AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_DEPLOYMENT) {
      throw new Error('Azure OpenAI credentials not configured');
    }

    const openaiEndpoint = `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2024-08-01-preview`;

    const aiResponse = await fetch(openaiEndpoint, {
      method: 'POST',
      headers: {
        'api-key': AZURE_OPENAI_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: `You are an insurance document parser. Extract structured data from insurance policies and quotes.

Return ONLY valid JSON with this exact structure:
{
  "carrier_name": "string or null",
  "policy_number": "string or null",
  "policy_type": "auto|home|commercial|life|umbrella|other or null",
  "insured_name": "string or null",
  "effective_date": "YYYY-MM-DD or null",
  "expiration_date": "YYYY-MM-DD or null",
  "total_premium": number or null,
  "payment_frequency": "annual|semi-annual|quarterly|monthly or null",
  "coverages": [
    {
      "type": "string",
      "limit": "string",
      "deductible": "string or null",
      "premium": number or null
    }
  ],
  "insured_items": [
    {
      "type": "vehicle|property|business",
      "year": number or null,
      "make": "string or null",
      "model": "string or null",
      "vin": "string or null",
      "address": "string or null"
    }
  ],
  "confidence_score": number (0-100)
}`
          },
          {
            role: 'user',
            content: `Parse this insurance document and extract all information. Be thorough and accurate.

DOCUMENT TEXT:
${ocrText}

Return ONLY the JSON object, no other text.`
          }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2000,
        temperature: 0.1
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[Azure OpenAI] Error:', errorText);
      throw new Error(`Azure OpenAI API error: ${aiResponse.status} - ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const parsedData = JSON.parse(aiData.choices[0].message.content);

    console.log('[AI] Parsing complete:', parsedData.carrier_name || 'Unknown carrier');

    // Step 3: Update database with parsed data
    const { data: updatedRecord, error: updateError } = await supabase
      .from('document_analysis')
      .update({
        carrier_name: parsedData.carrier_name,
        policy_number: parsedData.policy_number,
        policy_type: parsedData.policy_type,
        insured_name: parsedData.insured_name,
        effective_date: parsedData.effective_date,
        expiration_date: parsedData.expiration_date,
        total_premium: parsedData.total_premium,
        payment_frequency: parsedData.payment_frequency,
        coverages: parsedData.coverages || [],
        insured_items: parsedData.insured_items || [],
        raw_ocr_text: ocrText,
        confidence_score: parsedData.confidence_score || 85,
        processing_status: 'complete',
        updated_at: new Date().toISOString()
      })
      .eq('id', analysisRecord.id)
      .select()
      .single();

    if (updateError) {
      console.error('[Database] Update error:', updateError);
      throw updateError;
    }

    console.log('[Document Analysis] Complete:', updatedRecord.id);

    return new Response(
      JSON.stringify({
        success: true,
        analysis_id: updatedRecord.id,
        data: updatedRecord
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('[Document Analysis] Error:', error);
    
    // Try to update record with error using the documentId captured earlier
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      
      if (documentId) {
        await supabase
          .from('document_analysis')
          .update({
            processing_status: 'error',
            error_message: error instanceof Error ? error.message : 'Unknown error',
            updated_at: new Date().toISOString()
          })
          .eq('document_id', documentId);
      }
    } catch (dbError) {
      console.error('[Database] Failed to log error:', dbError);
    }

    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
