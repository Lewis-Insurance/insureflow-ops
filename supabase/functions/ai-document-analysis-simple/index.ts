/**
 * AI Document Analysis Simple - Edge Function
 * Uses Azure Document Intelligence for OCR + Azure OpenAI for analysis
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let documentId: string | null = null;

  try {
    const { document_id, file_name, account_id, user_id } = await req.json();
    documentId = document_id;

    console.log('========================================');
    console.log('DOCUMENT ANALYSIS (AZURE) - START');
    console.log('========================================');
    console.log('File:', file_name);
    console.log('Document ID:', document_id);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // SECURITY: Require authentication
    const authResult = await requireAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) {
      return authResult;
    }

    // Azure credentials
    const AZURE_ENDPOINT = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT');
    const AZURE_API_KEY = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY');
    const AZURE_OPENAI_ENDPOINT = Deno.env.get('AZURE_OPENAI_ENDPOINT');
    const AZURE_OPENAI_KEY = Deno.env.get('AZURE_OPENAI_KEY');
    const AZURE_OPENAI_DEPLOYMENT = Deno.env.get('AZURE_OPENAI_DEPLOYMENT_NAME') || 'gpt-4o';

    if (!AZURE_ENDPOINT || !AZURE_API_KEY) {
      throw new Error('Azure Document Intelligence credentials not configured');
    }

    // Update status to processing
    await supabase
      .from('document_analysis')
      .upsert({
        document_id,
        file_name,
        account_id: account_id || null,
        processing_status: 'processing',
        created_by: user_id
      }, { onConflict: 'document_id' });

    // STEP 1: Get document URL
    console.log('----------------------------------------');
    console.log('STEP 1: Getting document from storage');
    console.log('----------------------------------------');

    const { data: docData, error: docError } = await supabase
      .from('documents')
      .select('storage_path, storage_bucket')
      .eq('id', document_id)
      .maybeSingle();

    if (docError || !docData) {
      throw new Error(`Could not find document: ${docError?.message || 'Not found'}`);
    }

    const bucketName = docData.storage_bucket || 'documents';

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(docData.storage_path, 3600);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      throw new Error(`Failed to create signed URL: ${signedUrlError?.message}`);
    }

    console.log('✅ Signed URL created');

    // STEP 2: Azure Document Intelligence OCR
    console.log('----------------------------------------');
    console.log('STEP 2: Azure Document Intelligence OCR');
    console.log('----------------------------------------');

    const cleanEndpoint = AZURE_ENDPOINT.endsWith('/') ? AZURE_ENDPOINT.slice(0, -1) : AZURE_ENDPOINT;

    // Try multiple API configurations
    const apiConfigs = [
      { path: 'formrecognizer', model: 'prebuilt-layout', versions: ['2023-07-31', '2022-08-31'] },
      { path: 'documentintelligence', model: 'prebuilt-read', versions: ['2024-02-29-preview', '2023-10-31-preview'] }
    ];

    let ocrResult = null;
    let workingConfig = null;

    for (const config of apiConfigs) {
      if (ocrResult) break;
      for (const version of config.versions) {
        const analyzeUrl = `${cleanEndpoint}/${config.path}/documentModels/${config.model}:analyze?api-version=${version}`;

        console.log(`Trying ${config.path}/${config.model} v${version}...`);

        try {
          const analyzeResponse = await fetch(analyzeUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Ocp-Apim-Subscription-Key': AZURE_API_KEY,
            },
            body: JSON.stringify({
              urlSource: signedUrlData.signedUrl,
              pages: ["1-"]
            })
          });

          if (!analyzeResponse.ok) continue;

          const operationLocation = analyzeResponse.headers.get('Operation-Location');
          if (!operationLocation) continue;

          console.log(`✅ Success, polling for results...`);

          // Poll for results
          let attempts = 0;
          const maxAttempts = 60;

          while (attempts < maxAttempts) {
            await sleep(2000);
            attempts++;

            const resultResponse = await fetch(operationLocation, {
              headers: { 'Ocp-Apim-Subscription-Key': AZURE_API_KEY }
            });

            const result = await resultResponse.json();

            if (result.status === 'succeeded') {
              ocrResult = result;
              workingConfig = { ...config, version };
              console.log('✅ OCR Complete!');
              break;
            } else if (result.status === 'failed') {
              console.error('OCR failed:', result.error);
              break;
            }
          }

          if (ocrResult) break;
        } catch (error: any) {
          console.log(`Error: ${error.message}`);
        }
      }
    }

    if (!ocrResult) {
      throw new Error('Azure OCR failed - could not extract text from document');
    }

    // Extract text from all pages
    const allPages = ocrResult.analyzeResult?.pages || [];
    const totalPages = allPages.length;
    console.log(`Document has ${totalPages} pages`);

    let fullText = '';
    for (const page of allPages) {
      if (page.lines) {
        const pageText = page.lines.map((line: any) => line.content || '').join('\n');
        fullText += pageText + '\n\n--- PAGE BREAK ---\n\n';
      }
    }

    const charCount = fullText.length;
    console.log(`✅ Extracted ${charCount} characters from ${totalPages} pages`);

    if (charCount === 0) {
      throw new Error('No text could be extracted from document');
    }

    // Update with OCR results
    await supabase
      .from('document_analysis')
      .update({
        ocr_text: fullText,
        ocr_char_count: charCount,
        total_pages: totalPages,
        pages_analyzed: `1-${totalPages}`,
        processing_status: 'ocr_complete'
      })
      .eq('document_id', document_id);

    // STEP 3: AI Analysis with Azure OpenAI
    let analysisResult: any = {};

    if (AZURE_OPENAI_ENDPOINT && AZURE_OPENAI_KEY) {
      console.log('----------------------------------------');
      console.log('STEP 3: AI Analysis with Azure OpenAI');
      console.log('----------------------------------------');

      const analysisPrompt = `Analyze this ${totalPages}-page insurance document and extract ALL relevant information as JSON.

DOCUMENT TEXT (ALL ${totalPages} PAGES):
${fullText.substring(0, 100000)}

Return ONLY valid JSON:
{
  "policy_number": "",
  "insured_name": "",
  "carrier": "",
  "document_type": "auto_policy|home_policy|commercial_policy|life_policy|umbrella_policy",
  "effective_date": "YYYY-MM-DD or null",
  "expiration_date": "YYYY-MM-DD or null",
  "coverages": [{"name": "", "limit": "", "deductible": "", "premium": ""}],
  "vehicles": [{"year": "", "make": "", "model": "", "vin": ""}],
  "property": {"type": "", "address": ""},
  "premium": {"total": "", "frequency": ""},
  "key_details": []
}`;

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
              { role: 'system', content: 'Extract insurance data as JSON. Be thorough and accurate.' },
              { role: 'user', content: analysisPrompt }
            ],
            temperature: 0.1,
            max_tokens: 4000
          })
        }
      );

      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        const aiContent = aiData.choices?.[0]?.message?.content || '';

        try {
          const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
          analysisResult = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(aiContent);
          console.log('✅ AI Analysis complete');
        } catch (parseError) {
          console.error('Failed to parse AI response');
          analysisResult = { raw_response: aiContent };
        }
      } else {
        console.error('Azure OpenAI failed, returning OCR only');
      }
    }

    // STEP 4: Save final results
    console.log('----------------------------------------');
    console.log('STEP 4: Saving results');
    console.log('----------------------------------------');

    await supabase
      .from('document_analysis')
      .update({
        processing_status: 'completed',
        analysis_result: analysisResult,
        processed_at: new Date().toISOString()
      })
      .eq('document_id', document_id);

    console.log('========================================');
    console.log('SUCCESS - Analysis Complete');
    console.log('========================================');

    return new Response(
      JSON.stringify({
        success: true,
        document_id,
        page_count: totalPages,
        text_length: charCount,
        ocr_text: fullText,
        analysis: analysisResult
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('========================================');
    console.error('ERROR:', (error instanceof Error ? error.message : String(error)));
    console.error('========================================');

    // Update status to failed
    if (documentId) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      await supabase
        .from('document_analysis')
        .update({
          processing_status: 'failed',
          error_message: (error instanceof Error ? error.message : String(error))
        })
        .eq('document_id', documentId);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: (error instanceof Error ? error.message : String(error))
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
