import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { document_url, document_id, file_name } = await req.json();
    
    console.log('=== AZURE ANALYSIS START ===');
    console.log('File:', file_name);
    console.log('Document ID:', document_id);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const AZURE_ENDPOINT = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT');
    const AZURE_API_KEY = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY');
    const AZURE_OPENAI_ENDPOINT = Deno.env.get('AZURE_OPENAI_ENDPOINT');
    const AZURE_OPENAI_KEY = Deno.env.get('AZURE_OPENAI_KEY');
    const AZURE_OPENAI_DEPLOYMENT = Deno.env.get('AZURE_OPENAI_DEPLOYMENT_NAME');

    if (!AZURE_ENDPOINT || !AZURE_API_KEY) {
      throw new Error('Azure credentials missing');
    }

    await supabase
      .from('document_analysis')
      .update({ processing_status: 'processing' })
      .eq('document_id', document_id);

    // STEP 1: Start async OCR
    console.log('[OCR] Starting async analysis...');
    
    const startResponse = await fetch(
      `${AZURE_ENDPOINT}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=2023-07-31`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Ocp-Apim-Subscription-Key': AZURE_API_KEY,
        },
        body: JSON.stringify({ urlSource: document_url })
      }
    );

    if (!startResponse.ok) {
      const errorText = await startResponse.text();
      throw new Error(`Start failed: ${startResponse.status} - ${errorText}`);
    }

    const operationLocation = startResponse.headers.get('Operation-Location');
    if (!operationLocation) {
      throw new Error('No Operation-Location header');
    }

    console.log('[OCR] Job started, polling...');

    // STEP 2: Poll for completion
    let result: any = null;
    let attempts = 0;

    while (attempts < 60 && !result) {
      attempts++;
      await sleep(5000);
      
      console.log(`[OCR] Poll ${attempts}/60...`);

      const pollResponse = await fetch(operationLocation, {
        headers: { 'Ocp-Apim-Subscription-Key': AZURE_API_KEY }
      });

      if (!pollResponse.ok) {
        const err = await pollResponse.text();
        throw new Error(`Poll failed: ${pollResponse.status} - ${err}`);
      }

      const pollData = await pollResponse.json();
      
      if (pollData.status === 'succeeded') {
        result = pollData.analyzeResult;
        console.log('[OCR] ✅ Complete!');
        break;
      } else if (pollData.status === 'failed') {
        throw new Error(`OCR failed: ${JSON.stringify(pollData.error)}`);
      }
    }

    if (!result) {
      throw new Error('OCR timeout');
    }

    // STEP 3: Extract all text
    console.log('[Text] Extracting from all pages...');
    
    let fullText = '';
    const pageCount = result.pages?.length || 0;

    if (result.pages) {
      for (const page of result.pages) {
        if (page.lines) {
          fullText += page.lines.map((line: any) => line.content).join('\n');
          fullText += '\n\n--- PAGE BREAK ---\n\n';
        }
      }
    }

    console.log(`[Text] ✅ ${fullText.length} chars from ${pageCount} pages`);

    if (fullText.length === 0) {
      throw new Error('No text extracted');
    }

    // STEP 4: AI Analysis
    console.log('[AI] Analyzing document...');

    if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_KEY || !AZURE_OPENAI_DEPLOYMENT) {
      throw new Error('Azure OpenAI not configured');
    }

    const prompt = `Analyze this ${pageCount}-page insurance document. Extract ALL information as JSON.

DOCUMENT (ALL ${pageCount} PAGES):
${fullText.substring(0, 100000)}

Return JSON with:
{
  "policy_number": "",
  "insured_name": "",
  "carrier": "",
  "document_type": "auto_policy|home_policy|commercial_policy",
  "effective_date": "YYYY-MM-DD",
  "expiration_date": "YYYY-MM-DD",
  "coverages": [
    {"name": "", "limit": "", "deductible": "", "premium": ""}
  ],
  "vehicles": [
    {"year": "", "make": "", "model": "", "vin": ""}
  ],
  "property": {"address": "", "type": ""},
  "premium": {"total": "", "frequency": ""},
  "key_details": []
}

Search ALL pages for coverages: BI, PD, PIP, UM/UIM, COMP, COLL, Medical, Rental, Roadside.`;

    const aiResponse = await fetch(
      `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2024-02-15-preview`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': AZURE_OPENAI_KEY,
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'Extract insurance data as JSON.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.1,
          max_tokens: 4000
        })
      }
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      throw new Error(`AI failed: ${aiResponse.status} - ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices[0].message.content;
    
    let analysisResult: any;
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      analysisResult = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(aiContent);
    } catch {
      throw new Error('AI returned invalid JSON');
    }

    console.log('[AI] ✅ Analysis complete');

    // STEP 5: Save
    await supabase
      .from('document_analysis')
      .update({
        processing_status: 'completed',
        ocr_text: fullText,
        analysis_result: analysisResult,
        page_count: pageCount,
        processed_at: new Date().toISOString()
      })
      .eq('document_id', document_id);

    console.log('=== SUCCESS ===');

    return new Response(
      JSON.stringify({
        success: true,
        document_id,
        page_count: pageCount,
        text_length: fullText.length,
        analysis: analysisResult
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('ERROR:', error.message);
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
