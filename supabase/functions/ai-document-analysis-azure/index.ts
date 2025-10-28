import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper: Wait/sleep function
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { document_url, document_id, file_name, account_id, user_id } = await req.json();
    
    console.log('=== STARTING AZURE ANALYSIS (ASYNC MODE) ===');
    console.log('File:', file_name);

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
      throw new Error('Azure Document Intelligence not configured');
    }

    // Remove trailing slash
    const cleanEndpoint = AZURE_ENDPOINT.endsWith('/') ? AZURE_ENDPOINT.slice(0, -1) : AZURE_ENDPOINT;

    // Update status
    await supabase
      .from('document_analysis')
      .update({ processing_status: 'processing' })
      .eq('document_id', document_id);

    // ===== STEP 1: START ASYNC OCR (ALL PAGES) =====
    console.log('STEP 1: Starting ASYNC Azure OCR for all pages...');
    
    const startAnalyzeResponse = await fetch(
      `${cleanEndpoint}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=2023-07-31`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Ocp-Apim-Subscription-Key': AZURE_API_KEY,
        },
        body: JSON.stringify({
          urlSource: document_url
          // No page limit - process ALL pages
        })
      }
    );

    if (!startAnalyzeResponse.ok) {
      const errorText = await startAnalyzeResponse.text();
      throw new Error(`Azure start analyze failed: ${startAnalyzeResponse.status} - ${errorText}`);
    }

    // Get the operation location to poll for results
    const operationLocation = startAnalyzeResponse.headers.get('Operation-Location');
    if (!operationLocation) {
      throw new Error('No Operation-Location header returned from Azure');
    }

    console.log('✅ OCR job started. Polling for results...');
    console.log('Operation URL:', operationLocation);

    // ===== STEP 2: POLL FOR RESULTS (up to 5 minutes) =====
    let ocrResult = null;
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes (5 second intervals)

    while (attempts < maxAttempts) {
      attempts++;
      await sleep(5000); // Wait 5 seconds between polls

      console.log(`Polling attempt ${attempts}/${maxAttempts}...`);

      const pollResponse = await fetch(operationLocation, {
        method: 'GET',
        headers: {
          'Ocp-Apim-Subscription-Key': AZURE_API_KEY,
        }
      });

      if (!pollResponse.ok) {
        const errorText = await pollResponse.text();
        throw new Error(`Polling failed: ${pollResponse.status} - ${errorText}`);
      }

      const pollData = await pollResponse.json();
      console.log('Status:', pollData.status);

      if (pollData.status === 'succeeded') {
        ocrResult = pollData.analyzeResult;
        console.log('✅ OCR completed successfully!');
        break;
      } else if (pollData.status === 'failed') {
        throw new Error(`Azure OCR failed: ${JSON.stringify(pollData.error)}`);
      }
      
      // Status is still "running" - continue polling
    }

    if (!ocrResult) {
      throw new Error('OCR timed out after 5 minutes');
    }

    // ===== STEP 3: EXTRACT TEXT FROM ALL PAGES =====
    console.log('STEP 3: Extracting text from all pages...');
    
    let fullText = '';
    let pageCount = 0;

    if (ocrResult.pages) {
      pageCount = ocrResult.pages.length;
      console.log(`Processing ${pageCount} pages...`);

      for (const page of ocrResult.pages) {
        if (page.lines) {
          const pageText = page.lines.map((line: any) => line.content).join('\n');
          fullText += pageText + '\n\n--- PAGE BREAK ---\n\n';
        }
      }
    }

    console.log(`✅ Extracted ${fullText.length} characters from ${pageCount} pages`);

    if (fullText.length === 0) {
      throw new Error('No text extracted from document');
    }

    // ===== STEP 4: AI ANALYSIS =====
    console.log('STEP 4: Analyzing with Azure OpenAI...');

    if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_KEY || !AZURE_OPENAI_DEPLOYMENT) {
      throw new Error('Azure OpenAI not configured');
    }

    const cleanOpenAIEndpoint = AZURE_OPENAI_ENDPOINT.endsWith('/') ? AZURE_OPENAI_ENDPOINT.slice(0, -1) : AZURE_OPENAI_ENDPOINT;

    const analysisPrompt = `You are an expert insurance document analyzer. This is a ${pageCount}-page insurance policy document.

IMPORTANT: Search through ALL ${pageCount} pages for coverage information. Coverage details are often on pages 60+.

FULL DOCUMENT TEXT (ALL ${pageCount} PAGES):
${fullText.slice(0, 100000)}

Extract ALL information in JSON format:
{
  "policy_number": "string",
  "insured_name": "string",
  "carrier": "string",
  "document_type": "auto_policy|home_policy|commercial_policy",
  "effective_date": "YYYY-MM-DD",
  "expiration_date": "YYYY-MM-DD",
  "coverages": [
    {
      "name": "Coverage name",
      "limit": "Amount",
      "deductible": "Amount",
      "premium": "Amount"
    }
  ],
  "vehicles": [
    {
      "year": "string",
      "make": "string",
      "model": "string",
      "vin": "string"
    }
  ],
  "property": {
    "address": "string",
    "type": "string"
  },
  "premium": {
    "total": "string",
    "frequency": "monthly|annual|semi-annual"
  },
  "key_details": ["array of important facts"]
}

Search the ENTIRE document for:
- Bodily Injury (BI)
- Property Damage (PD)
- Personal Injury Protection (PIP)
- Uninsured/Underinsured Motorist (UM/UIM)
- Comprehensive (COMP)
- Collision (COLL)
- Medical Payments
- Rental coverage
- Roadside assistance
- ANY amendments or endorsements

Return ONLY valid JSON.`;

    const aiResponse = await fetch(
      `${cleanOpenAIEndpoint}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2024-02-15-preview`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': AZURE_OPENAI_KEY,
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: 'You are an expert insurance document analyzer. Extract data as valid JSON.'
            },
            {
              role: 'user',
              content: analysisPrompt
            }
          ],
          temperature: 0.1,
          max_tokens: 4000
        })
      }
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      throw new Error(`Azure OpenAI failed: ${aiResponse.status} - ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices[0].message.content;
    
    // Parse JSON response
    let analysisResult;
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0]);
      } else {
        analysisResult = JSON.parse(aiContent);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiContent);
      throw new Error('AI returned invalid JSON');
    }

    console.log('✅ Analysis complete:', JSON.stringify(analysisResult, null, 2));

    // ===== STEP 5: SAVE RESULTS =====
    const { error: updateError } = await supabase
      .from('document_analysis')
      .update({
        processing_status: 'completed',
        ocr_text: fullText,
        structured_data: analysisResult,
        total_pages: pageCount,
        pages_analyzed: `1-${pageCount}`,
        ocr_char_count: fullText.length,
        completed_at: new Date().toISOString()
      })
      .eq('document_id', document_id);

    if (updateError) {
      console.error('Failed to save results:', updateError);
      throw updateError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        analysis_id: document_id,
        ocr_text: fullText,
        structured_data: analysisResult,
        total_pages: pageCount,
        pages_analyzed: `1-${pageCount}`,
        focus_region: 'all'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('ERROR:', error.message);
    
    // Update document status to failed
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      
      await supabase
        .from('document_analysis')
        .update({ 
          processing_status: 'failed',
          error_message: error.message
        })
        .eq('document_id', document_id);
    } catch (updateError) {
      console.error('Failed to update status:', updateError);
    }
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        details: error.toString()
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
