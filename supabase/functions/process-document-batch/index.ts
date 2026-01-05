import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { requireAuth } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
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

    const { batchId, maxConcurrent = 3 } = await req.json();
    console.log('Starting batch processing:', { batchId, maxConcurrent });

    // Get queued items for this batch
    const { data: queueItems, error: queueError } = await supabase
      .from('document_processing_queue')
      .select('*')
      .eq('batch_id', batchId)
      .eq('status', 'queued')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(maxConcurrent);

    if (queueError) throw queueError;

    if (!queueItems || queueItems.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No items to process', batchId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${queueItems.length} documents from batch ${batchId}`);

    // Process documents in background
    const processDocuments = async () => {
      for (const item of queueItems) {
        try {
          // Mark as processing
          await supabase
            .from('document_processing_queue')
            .update({ 
              status: 'processing', 
              started_at: new Date().toISOString(),
              attempts: item.attempts + 1 
            })
            .eq('id', item.id);

          console.log(`Processing document: ${item.file_name}`);

          // Check if file needs OCR
          const needsOCR = item.file_name.match(/\.(jpg|jpeg|png|pdf)$/i);
          let ocrResult = null;

          if (needsOCR && item.storage_path && OPENAI_API_KEY) {
            try {
              // Download file from storage
              const { data: fileData, error: downloadError } = await supabase.storage
                .from('documents')
                .download(item.storage_path);

              if (downloadError) throw downloadError;

              // Convert to base64
              const arrayBuffer = await fileData.arrayBuffer();
              const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
              const dataUrl = `data:${fileData.type};base64,${base64}`;

              // Run OCR via AI
              const ocrResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${OPENAI_API_KEY}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: 'gpt-5-mini',
                  messages: [
                    { 
                      role: 'system', 
                      content: `Extract all text and data from this insurance document. Return JSON with: extracted_text, document_type, key_fields (policy_number, insured_name, dates, amounts), confidence (0-100), language.`
                    },
                    {
                      role: 'user',
                      content: [
                        { type: 'text', text: 'Extract all information from this document.' },
                        { type: 'image_url', image_url: { url: dataUrl } }
                      ]
                    }
                  ],
                }),
              });

              if (ocrResponse.ok) {
                const ocrData = await ocrResponse.json();
                const aiResponse = ocrData.choices[0].message.content;
                
                try {
                  ocrResult = JSON.parse(aiResponse);
                } catch {
                  ocrResult = { extracted_text: aiResponse, confidence: 85 };
                }
              }
            } catch (ocrError) {
              console.error('OCR failed:', ocrError);
              ocrResult = { error: 'OCR processing failed', confidence: 0 };
            }
          }

          // Create document record
          const docCategory = ocrResult?.document_type || 
                             (item.file_name.includes('policy') ? 'policy' : 
                              item.file_name.includes('claim') ? 'claim' : 'other');

          const { error: docError } = await supabase
            .from('documents')
            .insert({
              account_id: item.account_id,
              filename: item.file_name,
              name: item.file_name,
              kind: 'document',
              category: docCategory,
              storage_path: item.storage_path,
              storage_bucket: 'documents',
              file_missing: false,
              mime_type: item.metadata?.mime_type || 'application/octet-stream',
              size_bytes: item.file_size,
            });

          if (docError) throw docError;

          // Mark as completed
          await supabase
            .from('document_processing_queue')
            .update({ 
              status: 'completed',
              completed_at: new Date().toISOString(),
              ocr_result: ocrResult
            })
            .eq('id', item.id);

          console.log(`Completed: ${item.file_name}`);

        } catch (error) {
          console.error(`Failed to process ${item.file_name}:`, error);
          
          // Check if we should retry
          const shouldRetry = item.attempts < item.max_attempts;
          
          await supabase
            .from('document_processing_queue')
            .update({ 
              status: shouldRetry ? 'queued' : 'failed',
              error_message: error instanceof Error ? (error instanceof Error ? error.message : String(error)) : 'Unknown error',
              completed_at: shouldRetry ? null : new Date().toISOString()
            })
            .eq('id', item.id);
        }
      }

      // Check if there are more items to process
      const { data: remainingItems } = await supabase
        .from('document_processing_queue')
        .select('id')
        .eq('batch_id', batchId)
        .eq('status', 'queued')
        .limit(1);

      if (remainingItems && remainingItems.length > 0) {
        console.log('More items to process, continuing...');
        // Recursively process next batch
        await processDocuments();
      } else {
        console.log(`Batch ${batchId} processing complete`);
      }
    };

    // Start background processing
    // @ts-ignore - EdgeRuntime is a Deno Edge Runtime global
    EdgeRuntime.waitUntil(processDocuments());

    // Return immediate response
    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Batch processing started',
        batchId,
        itemsStarted: queueItems.length
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: unknown) {
    console.error('Error in process-document-batch:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? (error instanceof Error ? error.message : String(error)) : 'Unknown error occurred' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
