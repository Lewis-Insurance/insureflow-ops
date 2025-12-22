/**
 * Document Q&A with Azure
 * 
 * Fast document question-answering using:
 * - Azure Document Intelligence for OCR (cached)
 * - Azure OpenAI for answering questions
 * 
 * Optimized for quick daily tasks, not full extraction.
 */

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
    const { 
      document_id,
      storage_path,
      storage_bucket = 'customer-docs', // Default to customer-docs bucket
      filename,
      question,
      context // Optional: account name, policy info, etc.
    } = await req.json();

    if (!question) {
      throw new Error('Question is required');
    }

    if (!document_id && !storage_path) {
      throw new Error('Either document_id or storage_path is required');
    }

    console.log('========================================');
    console.log('DOCUMENT Q&A - START');
    console.log('========================================');
    console.log('Question:', question);
    console.log('Document ID:', document_id);
    console.log('Storage bucket:', storage_bucket);

    // Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Azure credentials
    const AZURE_ENDPOINT = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT');
    const AZURE_API_KEY = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY');
    const AZURE_OPENAI_ENDPOINT = Deno.env.get('AZURE_OPENAI_ENDPOINT');
    const AZURE_OPENAI_KEY = Deno.env.get('AZURE_OPENAI_KEY');
    const AZURE_OPENAI_DEPLOYMENT = Deno.env.get('AZURE_OPENAI_DEPLOYMENT_NAME');

    if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_KEY || !AZURE_OPENAI_DEPLOYMENT) {
      throw new Error('Azure OpenAI credentials not configured');
    }

    let documentText = '';

    // Step 1: Check if we have cached OCR text
    if (document_id) {
      const { data: cachedAnalysis } = await supabase
        .from('document_analysis')
        .select('ocr_text, processing_status')
        .eq('document_id', document_id)
        .eq('processing_status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (cachedAnalysis?.ocr_text) {
        console.log('✅ Using cached OCR text');
        documentText = cachedAnalysis.ocr_text;
      }
    }

    // Step 2: If no cached text, run OCR
    if (!documentText && storage_path && AZURE_ENDPOINT && AZURE_API_KEY) {
      console.log('📄 Running OCR on document...');
      console.log('Storage path:', storage_path);

      // Clean up storage path - remove leading slashes and bucket prefix if present
      let cleanPath = storage_path;
      if (cleanPath.startsWith('/')) {
        cleanPath = cleanPath.substring(1);
      }
      // Remove bucket prefix if it exists (handle both 'documents/' and 'customer-docs/')
      const bucketPrefixes = ['documents/', 'customer-docs/'];
      for (const prefix of bucketPrefixes) {
        if (cleanPath.startsWith(prefix)) {
          cleanPath = cleanPath.substring(prefix.length);
          break;
        }
      }

      console.log('Clean path:', cleanPath);
      console.log('Using bucket:', storage_bucket);

      // Create signed URL from the correct bucket
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from(storage_bucket)
        .createSignedUrl(cleanPath, 3600);

      if (signedUrlError) {
        console.error('Signed URL error:', signedUrlError);
        console.log('Falling back to metadata-only analysis');
        // Fall back to answering without document content
        documentText = `[Document "${filename}" exists in the database but the file could not be accessed. Answering based on available context only.]`;
      } else if (signedUrlData?.signedUrl) {
        const cleanEndpoint = AZURE_ENDPOINT.endsWith('/') ? AZURE_ENDPOINT.slice(0, -1) : AZURE_ENDPOINT;

        // Try OCR with Azure Document Intelligence
        const analyzeUrl = `${cleanEndpoint}/formrecognizer/documentModels/prebuilt-read:analyze?api-version=2023-07-31`;

        const analyzeResponse = await fetch(analyzeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Ocp-Apim-Subscription-Key': AZURE_API_KEY,
          },
          body: JSON.stringify({
            urlSource: signedUrlData.signedUrl,
          })
        });

        if (!analyzeResponse.ok) {
          const errorText = await analyzeResponse.text();
          console.error('OCR failed:', errorText);
          // Fall back to answering without document content
          documentText = `[Document: ${filename || 'Unknown'}. OCR failed - answering based on context only.]`;
        } else {
          const operationLocation = analyzeResponse.headers.get('Operation-Location');
          
          if (operationLocation) {
            // Poll for results (max 60 seconds for larger documents)
            let attempts = 0;
            const maxAttempts = 30; // 30 attempts * 2 seconds = 60 seconds

            while (attempts < maxAttempts) {
              await sleep(2000);
              attempts++;

              const resultResponse = await fetch(operationLocation, {
                headers: { 'Ocp-Apim-Subscription-Key': AZURE_API_KEY }
              });

              const result = await resultResponse.json();

              if (result.status === 'succeeded') {
                // Extract text from ALL pages with page markers
                const pages = result.analyzeResult?.pages || [];
                console.log(`📄 Found ${pages.length} pages in document`);
                
                for (let i = 0; i < pages.length; i++) {
                  const page = pages[i];
                  documentText += `\n--- PAGE ${i + 1} ---\n`;
                  if (page.lines) {
                    documentText += page.lines.map((line: any) => line.content || '').join('\n') + '\n';
                  }
                }
                console.log(`✅ OCR complete: ${pages.length} pages, ${documentText.length} characters`);

                // Cache the OCR result
                if (document_id) {
                  await supabase
                    .from('document_analysis')
                    .upsert({
                      document_id,
                      file_name: filename,
                      ocr_text: documentText,
                      ocr_char_count: documentText.length,
                      total_pages: pages.length,
                      processing_status: 'completed',
                      processed_at: new Date().toISOString()
                    }, { onConflict: 'document_id' });
                }
                break;
              } else if (result.status === 'failed') {
                throw new Error('OCR failed: ' + JSON.stringify(result.error));
              }
            }
          }
        }
      }
    }

    // Step 3: Answer question using Azure OpenAI
    console.log('🤖 Asking Azure OpenAI...');

    const systemPrompt = `You are an expert insurance document analyst. Answer questions about insurance documents accurately and concisely.

If the document text is provided, base your answer on the actual content.
If document content is limited, provide a helpful response based on the document type and context.
Always be specific and cite relevant details from the document when possible.`;

    // Use up to 100k characters to ensure we get later pages
    const truncatedText = documentText.substring(0, 100000);
    const wasTruncated = documentText.length > 100000;

    const userPrompt = `${context ? `Context: ${context}\n\n` : ''}Document: ${filename || 'Unknown document'}

${truncatedText ? `Document Content (${wasTruncated ? 'truncated' : 'full'}):\n${truncatedText}` : '[No document content available]'}

Question: ${question}

Please provide a clear, accurate answer based on the document content above. Reference specific page numbers when citing information.`;

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
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3,
          max_tokens: 2000
        })
      }
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      throw new Error(`Azure OpenAI failed: ${aiResponse.status} - ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const answer = aiData.choices[0]?.message?.content || 'Unable to generate response';

    console.log('✅ Answer generated');
    console.log('========================================');

    return new Response(
      JSON.stringify({
        success: true,
        answer,
        cached_ocr: !!documentText && document_id,
        tokens_used: aiData.usage?.total_tokens || 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('Document Q&A Error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Unknown error occurred'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

