import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth } from '../_shared/auth.ts';
import { modelBoundaryFetch } from '../_shared/modelBoundaryFetch.ts';

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
    const { 
      document_url, 
      document_id, 
      file_name,
      account_id,
      user_id
    } = await req.json();

    documentId = document_id;

    console.log('========================================');
    console.log('AZURE DOCUMENT ANALYSIS - START');
    console.log('========================================');
    console.log('File:', file_name);
    console.log('Document ID:', document_id);
    console.log('Document URL:', document_url);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase credentials not configured');

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // SECURITY: Require authentication
    const authResult = await requireAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) {
      return authResult; // Return 401 if auth failed
    }
    const authenticatedUser = authResult;

    const normalizedAccountId = account_id && String(account_id).trim() !== '' ? account_id : null;
    const { data: analysisRecord, error: insertError } = await supabase
      .from('document_analysis')
      .insert({
        document_id,
        file_name,
        account_id: normalizedAccountId,
        created_by: user_id,
        processing_status: 'processing'
      })
      .select()
      .single();

    if (insertError) throw insertError;

    console.log('[Document Analysis] Record created:', analysisRecord.id);

    const AZURE_ENDPOINT = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT');
    const AZURE_API_KEY = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY');
    const AZURE_OPENAI_ENDPOINT = Deno.env.get('AZURE_OPENAI_ENDPOINT');
    const AZURE_OPENAI_KEY = Deno.env.get('AZURE_OPENAI_KEY');
    const AZURE_OPENAI_DEPLOYMENT = Deno.env.get('AZURE_OPENAI_DEPLOYMENT_NAME');

    console.log('Azure Endpoint:', AZURE_ENDPOINT);
    console.log('Has Azure Key:', !!AZURE_API_KEY);
    console.log('Has OpenAI Endpoint:', !!AZURE_OPENAI_ENDPOINT);

    if (!AZURE_ENDPOINT || !AZURE_API_KEY)
      throw new Error('Azure Document Intelligence credentials not configured');

    const cleanEndpoint = AZURE_ENDPOINT.endsWith('/') ? AZURE_ENDPOINT.slice(0, -1) : AZURE_ENDPOINT;

    console.log('[Azure OCR] Creating signed URL for document...');
    const urlParts = document_url.split('/documents/');
    if (urlParts.length !== 2) throw new Error('Invalid document URL format');

    const storagePath = urlParts[1];
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('documents')
      .createSignedUrl(storagePath, 3600);

    if (signedUrlError) throw new Error(`Failed to create signed URL: ${signedUrlError.message}`);

    console.log('[Azure OCR] Signed URL created successfully');

    console.log('----------------------------------------');
    console.log('STEP 1: Starting Azure OCR (Multi-Version Test)');
    console.log('----------------------------------------');

    // Try both API paths and versions
    const apiConfigs = [
      { path: 'formrecognizer', model: 'prebuilt-layout', versions: ['2023-07-31', '2022-08-31'] },
      { path: 'documentintelligence', model: 'prebuilt-read', versions: ['2024-02-29-preview', '2023-10-31-preview'] }
    ];

    let ocrResult = null;
    let workingConfig = null;

    for (const config of apiConfigs) {
      for (const version of config.versions) {
        const analyzeUrl = `${cleanEndpoint}/${config.path}/documentModels/${config.model}:analyze?api-version=${version}`;
        
        console.log(`\nTrying ${config.path}/${config.model} with API version: ${version}`);
        console.log(`Full URL: ${analyzeUrl}`);

        try {
          const analyzeResponse = await modelBoundaryFetch(analyzeUrl, {
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

          console.log(`Response status: ${analyzeResponse.status}`);

          if (!analyzeResponse.ok) {
            const errorText = await analyzeResponse.text();
            console.log(`❌ Failed: ${errorText}`);
            continue;
          }

          const operationLocation = analyzeResponse.headers.get('Operation-Location');
          if (!operationLocation) {
            console.log('❌ No Operation-Location header');
            continue;
          }

          console.log(`✅ SUCCESS with ${config.path}/${config.model} version ${version}`);
          console.log('Operation Location:', operationLocation);

          // Poll for results
          console.log('----------------------------------------');
          console.log('STEP 2: Polling for OCR completion');
          console.log('----------------------------------------');

          let attempts = 0;
          const maxAttempts = 60;

          while (attempts < maxAttempts) {
            await sleep(2000);
            attempts++;

            const resultResponse = await modelBoundaryFetch(operationLocation, {
              headers: { 'Ocp-Apim-Subscription-Key': AZURE_API_KEY }
            });

            const result = await resultResponse.json();
            console.log(`Poll attempt ${attempts}/${maxAttempts}, status: ${result.status}`);

            if (result.status === 'succeeded') {
              ocrResult = result;
              workingConfig = { ...config, version };
              console.log('✅ OCR Complete!');
              break;
            } else if (result.status === 'failed') {
              throw new Error('Azure OCR failed: ' + JSON.stringify(result.error || result));
            }
          }

          if (ocrResult) break;
        } catch (error: any) {
          console.log(`❌ Error: ${(error instanceof Error ? error.message : String(error))}`);
        }
      }
      if (ocrResult) break;
    }

    if (!ocrResult) throw new Error('All Azure OCR API versions failed');

    if (!workingConfig) throw new Error('No working configuration found');
    console.log(`Using config: ${workingConfig.path}/${workingConfig.model} v${workingConfig.version}`);

    // Extract text from all pages
    console.log('----------------------------------------');
    console.log('STEP 3: Extracting text from all pages');
    console.log('----------------------------------------');

    const allPages = ocrResult.analyzeResult.pages || [];
    const totalPages = allPages.length;
    console.log(`Document has ${totalPages} pages`);

    if (totalPages === 0) throw new Error('Azure OCR returned 0 pages');

    let fullText = '';
    for (let i = 0; i < allPages.length; i++) {
      const page = allPages[i];
      if (page.lines) {
        const pageText = page.lines.map((line: any) => line.content || '').join('\n');
        fullText += pageText + '\n\n--- PAGE BREAK ---\n\n';
        
        if (i === 0 || i === totalPages - 1 || i % 10 === 0) {
          console.log(`Page ${i + 1} preview: ${pageText.substring(0, 100)}...`);
        }
      }
    }

    const charCount = fullText.length;
    console.log(`✅ Extracted ${charCount} characters from ${totalPages} pages`);

    if (charCount === 0) throw new Error('No text extracted from document');

    await supabase
      .from('document_analysis')
      .update({
        ocr_text: fullText,
        raw_ocr_text: fullText, // Also store in raw_ocr_text if exists
        pages_analyzed: `1-${totalPages}`,
        processing_status: 'ocr_complete'
      })
      .eq('id', analysisRecord.id);

    console.log('[Document Analysis] OCR saved to database');

    // AI Analysis
    if (AZURE_OPENAI_ENDPOINT && AZURE_OPENAI_KEY && AZURE_OPENAI_DEPLOYMENT) {
      console.log('----------------------------------------');
      console.log('STEP 4: AI Analysis with Azure OpenAI');
      console.log('----------------------------------------');

      const prompt = `Analyze this ${totalPages}-page insurance document. Extract ALL information as JSON.

DOCUMENT TEXT (ALL ${totalPages} PAGES):
${fullText.substring(0, 100000)}

Return ONLY valid JSON:
{
  "policy_number": "",
  "insured_name": "",
  "insured_address": "",
  "insured_city": "",
  "insured_state": "",
  "insured_zip": "",
  "insured_phone": "",
  "insured_email": "",
  "carrier": "",
  "line_of_business": "",
  "document_type": "auto_policy|home_policy|commercial_policy|application",
  "effective_date": "YYYY-MM-DD",
  "expiration_date": "YYYY-MM-DD",
  "policy_term_months": 6,
  "coverages": [{"name": "", "limit": "", "deductible": "", "premium": ""}],
  "vehicles": [{"year": "", "make": "", "model": "", "vin": ""}],
  "drivers": [{"name": "", "dob": "", "license_number": ""}],
  "property": {"address": "", "type": ""},
  "premium": {"total": "", "frequency": ""},
  "key_details": []
}

IMPORTANT INSTRUCTIONS:
- "insured_phone" must be the CUSTOMER's personal phone number, NOT the insurance agency or producer phone
- Agency/Producer phone numbers are typically at the top of the document near the agency name, logo, or "Agency" label
- Customer phone is usually in the "Named Insured", "Applicant", or "Insured Information" section
- If you cannot clearly distinguish between agency and customer phone, leave "insured_phone" EMPTY
- Similarly for email: only use customer email, not agency email addresses
- Phone numbers may be formatted as (XXX) XXX-XXXX, XXX-XXX-XXXX, or XXX.XXX.XXXX
- Look for the insured's mailing address in the Named Insured or Applicant section, not the agency address`;

      const aiResponse = await modelBoundaryFetch(
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
      
      let analysisResult;
      try {
        const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
        analysisResult = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(aiContent);
      } catch {
        console.error('Failed to parse AI response:', aiContent);
        throw new Error('AI returned invalid JSON');
      }

      console.log('✅ Analysis complete');

      await supabase
        .from('document_analysis')
        .update({
          processing_status: 'completed',
          analysis_result: analysisResult,
          processed_at: new Date().toISOString()
        })
        .eq('id', analysisRecord.id);

      console.log('========================================');
      console.log('SUCCESS');
      console.log('========================================');

      return new Response(
        JSON.stringify({
          success: true,
          analysis_id: analysisRecord.id,
          total_pages: totalPages,
          pages_analyzed: `1-${totalPages}`,
          confidence_score: 85, // Default confidence for successful analysis
          analysis: analysisResult,
          data: analysisResult, // Alias for compatibility
          extracted_data: analysisResult // Another alias for compatibility
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    } else {
      // No AI analysis, just return OCR with raw text for manual parsing
      await supabase
        .from('document_analysis')
        .update({
          processing_status: 'completed',
          processed_at: new Date().toISOString()
        })
        .eq('id', analysisRecord.id);

      // Return basic structure with raw text for client-side parsing
      const basicAnalysis = {
        raw_text: fullText.substring(0, 50000), // Limit size for response
        document_type: 'unknown',
        insured_name: '',
        policy_number: ''
      };

      return new Response(
        JSON.stringify({
          success: true,
          analysis_id: analysisRecord.id,
          total_pages: totalPages,
          pages_analyzed: `1-${totalPages}`,
          confidence_score: 50, // Lower confidence without AI
          analysis: basicAnalysis,
          data: basicAnalysis,
          extracted_data: basicAnalysis,
          raw_text: fullText.substring(0, 50000)
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

  } catch (error: any) {
    console.error('========================================');
    console.error('[Document Analysis] FULL ERROR:');
    console.error('Error message:', (error instanceof Error ? error.message : String(error)));
    console.error('Error stack:', error?.stack);
    console.error('Error details:', JSON.stringify(error, null, 2));
    console.error('========================================');
    
    if (documentId) {
      try {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );
        await supabase
          .from('document_analysis')
          .update({ processing_status: 'failed', error_message: (error instanceof Error ? error.message : String(error)) })
          .eq('document_id', documentId);
      } catch (updateError) {
        console.error('[Status Update Error]:', updateError);
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: (error instanceof Error ? error.message : String(error)) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
