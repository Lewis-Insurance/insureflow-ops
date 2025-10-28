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
    const { document_url, document_id, file_name, account_id, user_id } = await req.json();
    
    console.log('========================================');
    console.log('AZURE DOCUMENT ANALYSIS - START');
    console.log('========================================');
    console.log('File:', file_name);
    console.log('Document ID:', document_id);
    console.log('Document URL:', document_url);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const AZURE_ENDPOINT = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT');
    const AZURE_API_KEY = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY');
    const AZURE_OPENAI_ENDPOINT = Deno.env.get('AZURE_OPENAI_ENDPOINT');
    const AZURE_OPENAI_KEY = Deno.env.get('AZURE_OPENAI_KEY');
    const AZURE_OPENAI_DEPLOYMENT = Deno.env.get('AZURE_OPENAI_DEPLOYMENT_NAME');

    console.log('Azure Endpoint:', AZURE_ENDPOINT);
    console.log('Has Azure Key:', !!AZURE_API_KEY);
    console.log('Has OpenAI Endpoint:', !!AZURE_OPENAI_ENDPOINT);

    if (!AZURE_ENDPOINT || !AZURE_API_KEY) {
      throw new Error('Azure Document Intelligence credentials missing');
    }

    // Update status to processing
    await supabase
      .from('document_analysis')
      .update({ processing_status: 'processing' })
      .eq('document_id', document_id);

    console.log('----------------------------------------');
    console.log('STEP 1: Starting Azure OCR (Multi-Version Test)');
    console.log('----------------------------------------');

    // Try multiple API versions
    const apiVersions = [
      '2023-07-31',
      '2024-02-29-preview',
      '2023-10-31-preview',
      '2024-07-31-preview'
    ];

    let startResponse: Response | null = null;
    let workingVersion: string | null = null;

    for (const version of apiVersions) {
      const fullUrl = `${AZURE_ENDPOINT}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=${version}`;
      
      console.log(`\nTrying API version: ${version}`);
      console.log(`Full URL: ${fullUrl}`);

      try {
        startResponse = await fetch(fullUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Ocp-Apim-Subscription-Key': AZURE_API_KEY,
          },
          body: JSON.stringify({ urlSource: document_url })
        });

        const responseText = await startResponse.text();
        console.log(`Response status: ${startResponse.status}`);
        console.log(`Response body: ${responseText}`);

        if (startResponse.ok) {
          workingVersion = version;
          console.log(`✅ SUCCESS with version ${version}`);
          
          // Check for operation location in headers
          const operationLocation = startResponse.headers.get('Operation-Location');
          if (operationLocation) {
            console.log(`Operation Location: ${operationLocation}`);
            
            // Now poll for results
            console.log('----------------------------------------');
            console.log('STEP 2: Polling for OCR completion');
            console.log('----------------------------------------');

            let result: any = null;
            let attempts = 0;

            while (attempts < 60 && !result) {
              attempts++;
              await sleep(5000);
              
              console.log(`Poll attempt ${attempts}/60...`);

              const pollResponse = await fetch(operationLocation, {
                headers: { 'Ocp-Apim-Subscription-Key': AZURE_API_KEY }
              });

              if (!pollResponse.ok) {
                throw new Error(`Poll failed: ${pollResponse.status}`);
              }

              const pollData = await pollResponse.json();
              console.log(`Status: ${pollData.status}`);
              
              if (pollData.status === 'succeeded') {
                result = pollData.analyzeResult;
                console.log('✅ OCR Complete!');
                break;
              } else if (pollData.status === 'failed') {
                throw new Error(`OCR failed: ${JSON.stringify(pollData.error)}`);
              }
            }

            if (!result) {
              throw new Error('OCR timeout after 5 minutes');
            }

            // Extract text from all pages
            console.log('----------------------------------------');
            console.log('STEP 3: Extracting text from all pages');
            console.log('----------------------------------------');
            
            let fullText = '';
            const pageCount = result.pages?.length || 0;

            console.log(`Total pages in result: ${pageCount}`);

            if (result.pages) {
              for (let i = 0; i < result.pages.length; i++) {
                const page = result.pages[i];
                if (page.lines) {
                  const pageText = page.lines.map((line: any) => line.content).join('\n');
                  fullText += pageText + '\n\n--- PAGE BREAK ---\n\n';
                  
                  if (i === 0 || i === pageCount - 1 || i % 10 === 0) {
                    console.log(`Page ${i + 1}: ${pageText.substring(0, 100)}...`);
                  }
                }
              }
            }

            console.log(`✅ Extracted ${fullText.length} characters from ${pageCount} pages`);

            if (fullText.length === 0) {
              throw new Error('No text extracted from document');
            }

            // AI Analysis
            console.log('----------------------------------------');
            console.log('STEP 4: AI Analysis with Azure OpenAI');
            console.log('----------------------------------------');

            if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_KEY || !AZURE_OPENAI_DEPLOYMENT) {
              throw new Error('Azure OpenAI not configured');
            }

            const prompt = `Analyze this ${pageCount}-page insurance document. Extract ALL information as JSON.

IMPORTANT: Search through ALL ${pageCount} pages. Coverage details are often on later pages.

DOCUMENT TEXT (ALL PAGES):
${fullText.substring(0, 100000)}

Return ONLY valid JSON:
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
  "vehicles": [{"year": "", "make": "", "model": "", "vin": ""}],
  "property": {"address": "", "type": ""},
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
              console.error('Failed to parse AI response:', aiContent);
              throw new Error('AI returned invalid JSON');
            }

            console.log('✅ Analysis complete');

            // Save results
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

            console.log('========================================');
            console.log('SUCCESS - Analysis Complete');
            console.log('========================================');

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
          } else {
            console.log('❌ No Operation-Location header found');
          }
        } else {
          console.log(`❌ Version ${version} failed: ${startResponse.status}`);
        }
      } catch (error: any) {
        console.log(`❌ Version ${version} error: ${error.message}`);
      }
    }

    throw new Error('All API versions failed. Check your Azure endpoint configuration.');

  } catch (error: any) {
    console.error('========================================');
    console.error('ERROR:', error.message);
    console.error('========================================');
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
