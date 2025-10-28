import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from 'https://deno.land/std@0.168.0/encoding/base64.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const AZURE_DOC_ENDPOINT = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT')?.replace(/\/$/, '');
    const AZURE_DOC_KEY = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY');
    const AZURE_OPENAI_ENDPOINT = Deno.env.get('AZURE_OPENAI_ENDPOINT')?.replace(/\/$/, '');
    const AZURE_OPENAI_KEY = Deno.env.get('AZURE_OPENAI_KEY');
    const AZURE_DEPLOYMENT = Deno.env.get('AZURE_OPENAI_DEPLOYMENT_NAME');

    if (!AZURE_DOC_ENDPOINT || !AZURE_DOC_KEY || !AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_KEY || !AZURE_DEPLOYMENT) {
      throw new Error('Azure credentials not configured');
    }

    // Generate a proper UUID for the document analysis record
    const documentAnalysisId = crypto.randomUUID();
    
    // Create analysis record
    const normalizedAccountId = account_id && String(account_id).trim() !== '' ? account_id : null;
    const { data: analysisRecord, error: insertError } = await supabase
      .from('document_analysis')
      .insert({
        id: documentAnalysisId,
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

    console.log('[Download] Fetching document from storage...');

    // Parse storage path
    const urlParts = document_url.split('/storage/v1/object/');
    if (urlParts.length !== 2) {
      throw new Error('Invalid document URL format');
    }

    const pathParts = urlParts[1].split('/');
    const bucketName = pathParts[1];
    const filePath = pathParts.slice(2).join('/');

    console.log(`[Download] Bucket: ${bucketName}, Path: ${filePath}`);

    // Download from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from(bucketName)
      .download(filePath);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download: ${downloadError?.message || 'Unknown error'}`);
    }

    // Convert to base64 using Deno's standard library (safe for large files)
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    console.log(`[Download] Downloaded ${arrayBuffer.byteLength} bytes, encoding...`);

    const base64Document = base64Encode(uint8Array);

    console.log(`[Download] Encoded successfully (${base64Document.length} chars)`);

    // Determine content type
    const contentType = file_name.toLowerCase().endsWith('.pdf') 
      ? 'application/pdf' 
      : 'image/jpeg';

    console.log('[Azure OCR] Sending to Document Intelligence...');

    // Start Azure Document Intelligence with base64 content
    const analyzeResponse = await fetch(
      `${AZURE_DOC_ENDPOINT}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=2024-02-29-preview`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Ocp-Apim-Subscription-Key': AZURE_DOC_KEY,
        },
        body: JSON.stringify({
          base64Source: base64Document
        }),
      }
    );

    if (!analyzeResponse.ok) {
      const errorText = await analyzeResponse.text();
      console.error('[Azure OCR] Error:', errorText);
      throw new Error(`Azure Document Intelligence failed: ${analyzeResponse.status} - ${errorText}`);
    }

    const operationLocation = analyzeResponse.headers.get('operation-location');
    if (!operationLocation) throw new Error('No operation-location header');

    console.log('[Azure OCR] Polling for results...');

    // Poll for results
    let ocrResult;
    let attempts = 0;
    const maxAttempts = 30;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Check every 2 seconds
      
      const resultResponse = await fetch(operationLocation, {
        headers: { 'Ocp-Apim-Subscription-Key': AZURE_DOC_KEY },
      });

      if (!resultResponse.ok) {
        throw new Error(`Failed to get OCR results: ${resultResponse.status}`);
      }

      const result = await resultResponse.json();
      console.log(`[Azure OCR] Status: ${result.status} (attempt ${attempts + 1}/${maxAttempts})`);
      
      if (result.status === 'succeeded') {
        ocrResult = result;
        console.log(`[Azure OCR] Success!`);
        break;
      } else if (result.status === 'failed') {
        throw new Error(`Azure Document Intelligence failed: ${JSON.stringify(result.error || {})}`);
      }
      
      attempts++;
    }

    if (!ocrResult) {
      throw new Error('OCR timeout - processing took too long');
    }

    // Extract text
    const ocrText = ocrResult.analyzeResult?.content || '';
    console.log(`[Azure OCR] Extracted ${ocrText.length} characters`);

    if (ocrText.length === 0) {
      throw new Error('No text extracted from document - may be an image without text');
    }

    await supabase
      .from('document_analysis')
      .update({ ocr_text: ocrText })
      .eq('id', analysisRecord.id);

    // AI Analysis
    console.log('[Azure OpenAI] Analyzing document...');

    const analysisPrompt = `Analyze this insurance document and extract key information.

Document Text:
${ocrText.substring(0, 40000)}

Extract and return ONLY valid JSON with this structure:
{
  "document_type": "auto_policy|home_policy|commercial_policy|quote|dec_page|certificate|other",
  "carrier": "insurance company name",
  "policy_number": "policy or quote number",
  "insured_name": "name of insured party",
  "effective_date": "YYYY-MM-DD or null",
  "expiration_date": "YYYY-MM-DD or null",
  "premium": {
    "total": number or null,
    "frequency": "annual|semi-annual|quarterly|monthly|null"
  },
  "coverages": [
    {"type": "coverage name", "limit": "limit", "deductible": "deductible"}
  ],
  "vehicles": [
    {"year": "year", "make": "make", "model": "model", "vin": "VIN"}
  ],
  "property": {
    "address": "property address",
    "type": "property type"
  },
  "key_details": ["important", "information", "list"]
}

Use null for missing values. Respond with ONLY the JSON, no explanation.`;

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
            { role: 'system', content: 'You are an expert insurance document analyst. Always respond with valid JSON only, no markdown.' },
            { role: 'user', content: analysisPrompt }
          ],
          temperature: 0.1,
          max_tokens: 2500,
          response_format: { type: 'json_object' }
        }),
      }
    );

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('[Azure OpenAI] Error:', errorText);
      throw new Error(`Azure OpenAI failed: ${openaiResponse.status} - ${errorText}`);
    }

    const openaiResult = await openaiResponse.json();
    const analysisText = openaiResult.choices[0]?.message?.content || '{}';
    
    let analysisResult;
    try {
      const cleanedText = analysisText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      analysisResult = JSON.parse(cleanedText);
      console.log('[Azure OpenAI] Successfully parsed analysis');
    } catch (e) {
      console.error('[Parse Error]:', e);
      analysisResult = { 
        error: 'Failed to parse AI response', 
        raw: analysisText.substring(0, 1000),
        document_type: 'unknown',
        extracted_text_length: ocrText.length
      };
    }

    console.log('[Azure Analysis] Complete!');

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
        analysis_id: documentAnalysisId,
        ocr_length: ocrText.length,
        analysis: analysisResult
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[Azure Analysis] Error:', error.message);
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
