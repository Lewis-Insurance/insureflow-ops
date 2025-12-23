/**
 * Execute AI Module - Universal Edge Function (Azure Document Intelligence)
 * 
 * Uses Azure Document Intelligence for OCR/extraction,
 * then Azure OpenAI for analysis based on module configuration.
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { requireAuth } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface ExecuteRequest {
  module_slug: string;
  document_ids: string[];
  input_text?: string;
  additional_inputs?: Record<string, unknown>;
  link_to?: {
    type: 'account' | 'lead' | 'policy';
    id: string;
  };
}

/**
 * Extract text from a document using Azure Document Intelligence
 */
async function extractTextWithAzure(
  documentUrl: string,
  storagePath: string,
  supabase: any,
): Promise<string> {
  const AZURE_ENDPOINT = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT');
  const AZURE_API_KEY = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY');

  if (!AZURE_ENDPOINT || !AZURE_API_KEY) {
    console.warn('Azure Document Intelligence not configured, skipping OCR');
    return '';
  }

  const cleanEndpoint = AZURE_ENDPOINT.endsWith('/') ? AZURE_ENDPOINT.slice(0, -1) : AZURE_ENDPOINT;

  // Create signed URL for Azure to access the file
  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from('documents')
    .createSignedUrl(storagePath, 3600);

  if (signedUrlError) {
    console.error('Failed to create signed URL:', signedUrlError);
    return '';
  }

  console.log(`[Azure OCR] Processing: ${storagePath}`);

  // Try multiple API configurations
  const apiConfigs = [
    { path: 'formrecognizer', model: 'prebuilt-layout', versions: ['2023-07-31', '2022-08-31'] },
    { path: 'documentintelligence', model: 'prebuilt-read', versions: ['2024-02-29-preview', '2023-10-31-preview'] }
  ];

  for (const config of apiConfigs) {
    for (const version of config.versions) {
      const analyzeUrl = `${cleanEndpoint}/${config.path}/documentModels/${config.model}:analyze?api-version=${version}`;

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

        // Poll for results
        let attempts = 0;
        const maxAttempts = 30; // 60 seconds max

        while (attempts < maxAttempts) {
          await sleep(2000);
          attempts++;

          const resultResponse = await fetch(operationLocation, {
            headers: { 'Ocp-Apim-Subscription-Key': AZURE_API_KEY }
          });

          const result = await resultResponse.json();

          if (result.status === 'succeeded') {
            // Extract text from all pages
            const allPages = result.analyzeResult.pages || [];
            let fullText = '';

            for (const page of allPages) {
              if (page.lines) {
                const pageText = page.lines.map((line: any) => line.content || '').join('\n');
                fullText += pageText + '\n\n';
              }
            }

            console.log(`[Azure OCR] Extracted ${fullText.length} chars from ${allPages.length} pages`);
            return fullText;
          } else if (result.status === 'failed') {
            console.error('[Azure OCR] Failed:', result.error);
            break;
          }
        }
      } catch (error) {
        console.error(`[Azure OCR] Error with ${config.path}/${version}:`, error);
      }
    }
  }

  console.warn('[Azure OCR] All configurations failed');
  return '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let executionId: string | null = null;

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const AZURE_OPENAI_ENDPOINT = Deno.env.get('AZURE_OPENAI_ENDPOINT');
    const AZURE_OPENAI_KEY = Deno.env.get('AZURE_OPENAI_KEY');
    const AZURE_OPENAI_DEPLOYMENT = Deno.env.get('AZURE_OPENAI_DEPLOYMENT_NAME') || 'gpt-4o';

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Require authentication
    const authResult = await requireAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) {
      return authResult;
    }
    const user = authResult;

    const body: ExecuteRequest = await req.json();
    const { module_slug, document_ids, input_text, additional_inputs, link_to } = body;

    console.log('Execute AI Module:', { module_slug, document_ids: document_ids.length, link_to });

    // 1. Fetch module configuration
    const { data: module, error: moduleError } = await supabase
      .from('ai_modules')
      .select('*')
      .eq('slug', module_slug)
      .eq('is_active', true)
      .single();

    if (moduleError || !module) {
      throw new Error(`Module not found: ${module_slug}`);
    }

    // 2. Create execution record (pending)
    const { data: execution, error: execError } = await supabase
      .from('ai_module_executions')
      .insert({
        module_id: module.id,
        module_slug: module.slug,
        document_ids,
        input_text,
        input_config: additional_inputs,
        account_id: link_to?.type === 'account' ? link_to.id : null,
        lead_id: link_to?.type === 'lead' ? link_to.id : null,
        policy_id: link_to?.type === 'policy' ? link_to.id : null,
        status: 'processing',
        created_by: user.id,
      })
      .select()
      .single();

    if (execError) {
      console.error('Failed to create execution record:', execError);
      throw new Error('Failed to create execution record');
    }

    executionId = execution.id;

    // 3. Fetch documents and extract text using Azure Document Intelligence
    let documentContents: Array<{ filename: string; text: string }> = [];

    if (document_ids.length > 0) {
      const { data: documents, error: docsError } = await supabase
        .from('documents')
        .select('id, filename, extracted_text, storage_path')
        .in('id', document_ids);

      if (docsError) {
        throw new Error(`Failed to fetch documents: ${docsError.message}`);
      }

      for (const doc of documents || []) {
        let text = doc.extracted_text;

        // If no extracted text, use Azure Document Intelligence
        if (!text && doc.storage_path) {
          console.log(`[OCR] No cached text for ${doc.filename}, running Azure OCR...`);

          const documentUrl = `${SUPABASE_URL}/storage/v1/object/public/documents/${doc.storage_path}`;
          text = await extractTextWithAzure(documentUrl, doc.storage_path, supabase);

          // Cache the extracted text for future use
          if (text && text.length > 0) {
            await supabase
              .from('documents')
              .update({ extracted_text: text })
              .eq('id', doc.id);
            console.log(`[OCR] Cached ${text.length} chars for ${doc.filename}`);
          }
        }

        // Also check document_analyses and document_analysis tables as fallback
        if (!text) {
          const { data: analyses } = await supabase
            .from('document_analyses')
            .select('extracted_text')
            .eq('filename', doc.filename)
            .order('analyzed_at', { ascending: false })
            .limit(1)
            .single();

          text = analyses?.extracted_text;
        }

        if (!text) {
          const { data: analysis } = await supabase
            .from('document_analysis')
            .select('ocr_text')
            .eq('file_name', doc.filename)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          text = analysis?.ocr_text;
        }

        if (text) {
          documentContents.push({
            filename: doc.filename,
            text: text.substring(0, 80000), // Limit to ~80k chars per doc
          });
        } else {
          console.warn(`[OCR] No text extracted for ${doc.filename}`);
        }
      }
    }

    console.log(`Loaded ${documentContents.length} documents with text content`);

    // Check if we have any content to analyze
    if (documentContents.length === 0 && !input_text) {
      throw new Error('No document content could be extracted. Please ensure documents are readable PDF files.');
    }

    // 4. Build the prompt
    const systemPrompt = module.system_prompt;

    let userPrompt = '';

    // Add document contents
    if (documentContents.length > 0) {
      userPrompt += 'DOCUMENTS:\n\n';
      documentContents.forEach((doc, i) => {
        userPrompt += `--- Document ${i + 1}: ${doc.filename} ---\n${doc.text}\n\n`;
      });
    }

    // Add additional inputs
    if (additional_inputs && Object.keys(additional_inputs).length > 0) {
      userPrompt += '\nADDITIONAL INFORMATION:\n';
      for (const [key, value] of Object.entries(additional_inputs)) {
        userPrompt += `${key}: ${value}\n`;
      }
    }

    // Add user's text input
    if (input_text) {
      userPrompt += `\nUSER REQUEST:\n${input_text}\n`;
    }

    // Add output format instruction
    userPrompt += `\n\nPlease analyze the above and respond with valid JSON as specified in your instructions.`;

    console.log('Prompt length:', userPrompt.length, 'chars');

    // 5. Call Azure OpenAI API
    if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_KEY) {
      throw new Error('Azure OpenAI credentials not configured');
    }

    const aiUrl = `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2024-02-15-preview`;

    const aiResponse = await fetch(aiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': AZURE_OPENAI_KEY,
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 8000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      throw new Error(`Azure OpenAI error: ${aiResponse.status} - ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || '';
    const tokensUsed = aiData.usage?.total_tokens || 0;

    console.log('AI response received, tokens:', tokensUsed);

    // 6. Parse the AI response as JSON
    let result: Record<string, unknown>;
    let emailDraft: { subject?: string; body?: string } | null = null;
    let resultSummary: string = '';

    try {
      // Try to extract JSON from the response (handle markdown code blocks)
      let jsonStr = aiContent;
      const jsonMatch = aiContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      result = JSON.parse(jsonStr);

      // Extract email draft if present
      if (result.email_draft) {
        emailDraft = result.email_draft as { subject?: string; body?: string };
      }

      // Generate summary
      if (result.summary) {
        resultSummary = String(result.summary).substring(0, 200);
      } else if (result.recommendation) {
        resultSummary = String(result.recommendation).substring(0, 200);
      } else if (result.risk_rating) {
        resultSummary = `Risk Rating: ${result.risk_rating}`;
      }
    } catch (parseError) {
      console.warn('Failed to parse AI response as JSON, storing as markdown');
      result = {
        format: 'markdown',
        content: aiContent,
      };
      resultSummary = aiContent.substring(0, 200);
    }

    const processingTimeMs = Date.now() - startTime;

    // 7. Update execution record with results
    const { error: updateError } = await supabase
      .from('ai_module_executions')
      .update({
        status: 'completed',
        result,
        result_summary: resultSummary,
        email_draft_subject: emailDraft?.subject || null,
        email_draft_body: emailDraft?.body || null,
        processing_time_ms: processingTimeMs,
        tokens_used: tokensUsed,
        completed_at: new Date().toISOString(),
      })
      .eq('id', executionId);

    if (updateError) {
      console.error('Failed to update execution record:', updateError);
    }

    // 8. Update module usage stats
    await supabase
      .from('ai_modules')
      .update({
        usage_count: module.usage_count + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq('id', module.id);

    // 9. Return result
    return new Response(
      JSON.stringify({
        execution_id: executionId,
        status: 'completed',
        result,
        processing_time_ms: processingTimeMs,
        tokens_used: tokensUsed,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('Execute AI Module error:', error);

    // Update execution record with error if we have an ID
    if (executionId) {
      const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      await supabase
        .from('ai_module_executions')
        .update({
          status: 'failed',
          error_message: error.message,
          processing_time_ms: Date.now() - startTime,
          completed_at: new Date().toISOString(),
        })
        .eq('id', executionId);
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
