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

  try {
    const { document_url, document_id, file_name, account_id, user_id } = await req.json();
    
    console.log('[Azure Analysis] Starting:', file_name);

    // Initialize Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get Azure credentials
    const AZURE_DOC_ENDPOINT = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT')?.replace(/\/$/, '');
    const AZURE_DOC_KEY = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY');
    const AZURE_OPENAI_ENDPOINT = Deno.env.get('AZURE_OPENAI_ENDPOINT')?.replace(/\/$/, '');
    const AZURE_OPENAI_KEY = Deno.env.get('AZURE_OPENAI_KEY');
    const AZURE_DEPLOYMENT = Deno.env.get('AZURE_OPENAI_DEPLOYMENT_NAME');

    if (!AZURE_DOC_ENDPOINT || !AZURE_DOC_KEY || !AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_KEY || !AZURE_DEPLOYMENT) {
      throw new Error('Azure credentials not configured');
    }

    // Create analysis record
    const normalizedAccountId = account_id && String(account_id).trim() !== '' ? account_id : null;
    const { data: analysisRecord, error: insertError } = await supabase
      .from('document_analysis')
      .insert({
        document_id,
        file_name,
        account_id: normalizedAccountId,
        created_by: user_id,
        processing_status: 'processing',
        ocr_text: '',
        analysis_result: {}
      })
      .select()
      .single();

    if (insertError) throw insertError;

    console.log('[Azure OCR] Starting Document Intelligence...');

    // Step 1: Start Azure Document Intelligence analysis
    const analyzeResponse = await fetch(
      `${AZURE_DOC_ENDPOINT}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=2024-02-29-preview`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Ocp-Apim-Subscription-Key': AZURE_DOC_KEY,
        },
        body: JSON.stringify({ urlSource: document_url }),
      }
    );

    if (!analyzeResponse.ok) {
      const errorText = await analyzeResponse.text();
      throw new Error(`Azure Document Intelligence failed: ${analyzeResponse.status} - ${errorText}`);
    }

    const operationLocation = analyzeResponse.headers.get('operation-location');
    if (!operationLocation) {
      throw new Error('No operation-location header returned');
    }

    console.log('[Azure OCR] Waiting for results...');

    // Step 2: Poll for results
    let ocrResult;
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds max

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const resultResponse = await fetch(operationLocation, {
        headers: { 'Ocp-Apim-Subscription-Key': AZURE_DOC_KEY },
      });

      if (!resultResponse.ok) {
        throw new Error(`Failed to get OCR results: ${resultResponse.status}`);
      }

      const result = await resultResponse.json();
      
      if (result.status === 'succeeded') {
        ocrResult = result;
        break;
      } else if (result.status === 'failed') {
        throw new Error('Azure Document Intelligence failed to process document');
      }
      
      attempts++;
    }

    if (!ocrResult) {
      throw new Error('OCR processing timed out');
    }

    // Extract text from OCR result
    const ocrText = ocrResult.analyzeResult?.content || '';
    console.log(`[Azure OCR] Extracted ${ocrText.length} characters`);

    // Update with OCR text
    await supabase
      .from('document_analysis')
      .update({ ocr_text: ocrText })
      .eq('id', analysisRecord.id);

    // Step 3: Analyze with Azure OpenAI
    console.log('[Azure OpenAI] Analyzing document...');

    const analysisPrompt = `You are an insurance document analyst. Analyze this insurance document and extract key information.

Document text:
${ocrText.substring(0, 50000)}

Extract the following in JSON format:
{
  "document_type": "auto_policy|home_policy|commercial_policy|quote|dec_page|other",
  "carrier": "insurance company name",
  "policy_number": "policy number if found",
  "insured_name": "name of insured",
  "effective_date": "YYYY-MM-DD",
  "expiration_date": "YYYY-MM-DD",
  "premium": {
    "total": number,
    "frequency": "annual|semi-annual|quarterly|monthly"
  },
  "coverages": [
    {
      "type": "coverage type",
      "limit": "limit amount",
      "deductible": "deductible amount"
    }
  ],
  "vehicles": [
    {
      "year": "year",
      "make": "make",
      "model": "model",
      "vin": "VIN"
    }
  ],
  "key_details": ["list", "of", "important", "details"]
}

Respond ONLY with valid JSON. If information is not found, use null.`;

    const openaiResponse = await fetch(
      `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_DEPLOYMENT}/chat/completions?api-version=2024-02-15-preview`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': AZURE_OPENAI_KEY,
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'You are an expert insurance document analyst. Always respond with valid JSON only.' },
            { role: 'user', content: analysisPrompt }
          ],
          temperature: 0.1,
          max_tokens: 2000,
        }),
      }
    );

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      throw new Error(`Azure OpenAI failed: ${openaiResponse.status} - ${errorText}`);
    }

    const openaiResult = await openaiResponse.json();
    const analysisText = openaiResult.choices[0]?.message?.content || '{}';
    
    // Parse JSON response
    let analysisResult;
    try {
      // Remove markdown code blocks if present
      const cleanedText = analysisText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      analysisResult = JSON.parse(cleanedText);
    } catch (e) {
      console.error('[Azure OpenAI] Failed to parse JSON:', e);
      analysisResult = { error: 'Failed to parse AI response', raw: analysisText };
    }

    console.log('[Azure Analysis] Complete!');

    // Final update
    await supabase
      .from('document_analysis')
      .update({
        processing_status: 'completed',
        analysis_result: analysisResult,
        completed_at: new Date().toISOString()
      })
      .eq('id', analysisRecord.id);

    return new Response(
      JSON.stringify({
        success: true,
        analysis_id: analysisRecord.id,
        ocr_length: ocrText.length,
        analysis: analysisResult
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[Azure Analysis] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
