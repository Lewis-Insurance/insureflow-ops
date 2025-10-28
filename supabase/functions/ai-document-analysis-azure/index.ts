import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Keywords for smart page detection
const IMPORTANT_KEYWORDS = [
  'DECLARATIONS', 'DECLARATION', 'DEC PAGE',
  'COVERAGE', 'COVERAGES', 'LIMITS', 'PREMIUM', 'DEDUCTIBLE',
  'SCHEDULE', 'POLICY SCHEDULE', 'SUMMARY',
  'INSURED', 'VEHICLE', 'PROPERTY', 'LIABILITY'
];

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
      user_id,
      focus_region = 'smart',
      page_range = null
    } = await req.json();
    
    documentId = document_id;

    console.log('[Azure Document Analysis] Starting:', file_name);
    console.log('[Focus Region]:', focus_region);

    // Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Create initial record
    const normalizedAccountId = account_id && String(account_id).trim() !== '' ? account_id : null;
    const { data: analysisRecord, error: insertError } = await supabase
      .from('document_analysis')
      .insert({
        document_id,
        file_name,
        account_id: normalizedAccountId,
        created_by: user_id,
        processing_status: 'pending'
      })
      .select()
      .single();

    if (insertError) {
      console.error('[Document Analysis] Insert error:', insertError);
      throw insertError;
    }

    // Get Azure credentials
    const AZURE_ENDPOINT = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT');
    const AZURE_API_KEY = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY');
    
    if (!AZURE_ENDPOINT || !AZURE_API_KEY) {
      throw new Error('Azure Document Intelligence credentials not configured. Set AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_KEY');
    }

    // Remove trailing slash if present
    const cleanEndpoint = AZURE_ENDPOINT.endsWith('/') ? AZURE_ENDPOINT.slice(0, -1) : AZURE_ENDPOINT;

    // Step 1: Get storage path
    console.log('[Azure OCR] Preparing document from storage...');
    
    const urlParts = document_url.split('/documents/');
    if (urlParts.length !== 2) {
      throw new Error('Invalid document URL format');
    }
    
    const storagePath = urlParts[1];

    // Helper function for retry with exponential backoff
    async function retryWithBackoff<T>(
      fn: () => Promise<T>,
      maxRetries: number = 3,
      baseDelay: number = 1000
    ): Promise<T> {
      let lastError: Error | null = null;
      
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          return await fn();
        } catch (error) {
          lastError = error as Error;
          
          if (attempt < maxRetries - 1) {
            const delay = baseDelay * Math.pow(2, attempt);
            console.log(`[Retry] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      throw lastError || new Error('Retry failed');
    }

    // Helper function to process a single page range with OCR
    async function processPageRange(
      signedUrl: string,
      pageRange: string,
      totalPages: number
    ): Promise<any> {
      console.log(`[Azure OCR] Processing pages ${pageRange} of ${totalPages}...`);
      
      const analyzeUrl = `${cleanEndpoint}/formrecognizer/documentModels/prebuilt-layout:analyze?api-version=2023-07-31&pages=${pageRange}`;
      
      return retryWithBackoff(async () => {
        const analyzeResponse = await fetch(analyzeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Ocp-Apim-Subscription-Key': AZURE_API_KEY,
          },
          body: JSON.stringify({
            urlSource: signedUrl
          })
        });

        if (!analyzeResponse.ok) {
          const errorText = await analyzeResponse.text();
          console.error('[Azure OCR Error]:', errorText);
          throw new Error(`Azure OCR failed: ${analyzeResponse.status} - ${errorText}`);
        }

        const operationLocation = analyzeResponse.headers.get('Operation-Location');
        if (!operationLocation) {
          throw new Error('No operation location returned from Azure');
        }

        // Poll for results
        let attempts = 0;
        const maxAttempts = 60;

        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const resultResponse = await fetch(operationLocation, {
            headers: {
              'Ocp-Apim-Subscription-Key': AZURE_API_KEY,
            }
          });

          if (!resultResponse.ok) {
            console.error('[Azure Poll Error]:', await resultResponse.text());
            throw new Error(`Azure polling failed: ${resultResponse.status}`);
          }

          const result = await resultResponse.json();
          
          if (result.status === 'succeeded') {
            console.log(`[Azure OCR] Pages ${pageRange} completed successfully`);
            return result;
          } else if (result.status === 'failed') {
            throw new Error('Azure OCR failed: ' + JSON.stringify(result.error || result));
          }
          
          attempts++;
          
          if (attempts % 5 === 0) {
            console.log(`[Azure OCR] Polling pages ${pageRange}: attempt ${attempts}/${maxAttempts}, status: ${result.status}`);
          }
        }

        throw new Error(`Azure OCR timed out for pages ${pageRange} after 2 minutes`);
      });
    }

    // Step 2: Get initial document info to determine page count
    console.log('[Azure OCR] Starting Document Intelligence with API version 2023-07-31...');

    // Get a signed URL that Azure can access directly
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('documents')
      .createSignedUrl(storagePath, 7200); // 2 hour expiry for large documents

    if (signedUrlError) {
      console.error('[Signed URL Error]:', signedUrlError);
      throw new Error(`Failed to create signed URL: ${signedUrlError.message}`);
    }

    console.log('[Azure OCR] Processing document with chunked approach for large files...');
    
    // First, do a full document analysis to get the total page count
    // We'll use the first chunk result to determine total pages
    console.log('[Azure OCR] Getting total page count...');
    
    const analyzeUrl = `${cleanEndpoint}/formrecognizer/documentModels/prebuilt-layout:analyze?api-version=2023-07-31`;
    
    const initialAnalyze = await fetch(analyzeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': AZURE_API_KEY,
      },
      body: JSON.stringify({
        urlSource: signedUrlData.signedUrl
      })
    });

    if (!initialAnalyze.ok) {
      const errorText = await initialAnalyze.text();
      console.error('[Azure OCR Error]:', errorText);
      throw new Error(`Azure OCR failed: ${initialAnalyze.status} - ${errorText}`);
    }

    const operationLocation = initialAnalyze.headers.get('Operation-Location');
    if (!operationLocation) {
      throw new Error('No operation location returned from Azure');
    }

    // Poll for initial results to get page count
    let totalPages = 0;
    let attempts = 0;
    const maxAttempts = 60;
    let initialOcrResult = null;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const resultResponse = await fetch(operationLocation, {
        headers: {
          'Ocp-Apim-Subscription-Key': AZURE_API_KEY,
        }
      });

      if (!resultResponse.ok) {
        console.error('[Azure Poll Error]:', await resultResponse.text());
        throw new Error(`Azure polling failed: ${resultResponse.status}`);
      }

      const result = await resultResponse.json();
      
      if (result.status === 'succeeded') {
        totalPages = result.analyzeResult?.pages?.length || 0;
        initialOcrResult = result;
        console.log(`[Azure OCR] Document has ${totalPages} total pages`);
        break;
      } else if (result.status === 'failed') {
        throw new Error('Azure OCR failed: ' + JSON.stringify(result.error || result));
      }
      
      attempts++;
      
      if (attempts % 5 === 0) {
        console.log(`[Azure OCR] Initial analysis: attempt ${attempts}/${maxAttempts}, status: ${result.status}`);
      }
    }

    if (totalPages === 0 || !initialOcrResult) {
      throw new Error('Failed to determine document page count');
    }

    // For large documents (>30 pages), process in chunks
    let ocrResult;
    let allPages;
    
    if (totalPages > 30) {
      console.log(`[Azure OCR] Large document detected (${totalPages} pages), processing in chunks...`);

      // Process in chunks of 20 pages
      const CHUNK_SIZE = 20;
      const chunks: string[] = [];
      
      for (let startPage = 1; startPage <= totalPages; startPage += CHUNK_SIZE) {
        const endPage = Math.min(startPage + CHUNK_SIZE - 1, totalPages);
        chunks.push(`${startPage}-${endPage}`);
      }
      
      console.log(`[Azure OCR] Will process ${chunks.length} chunks: ${chunks.join(', ')}`);

      // Process all chunks in parallel (with concurrency limit)
      const CONCURRENCY_LIMIT = 3; // Process 3 chunks at a time
      const allResults: any[] = [];
      
      for (let i = 0; i < chunks.length; i += CONCURRENCY_LIMIT) {
        const chunkBatch = chunks.slice(i, i + CONCURRENCY_LIMIT);
        console.log(`[Azure OCR] Processing batch: ${chunkBatch.join(', ')}`);
        
        const batchResults = await Promise.all(
          chunkBatch.map(chunk => processPageRange(signedUrlData.signedUrl, chunk, totalPages))
        );
        
        allResults.push(...batchResults);
        
        // Small delay between batches to avoid rate limiting
        if (i + CONCURRENCY_LIMIT < chunks.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // Combine all pages from all results
      console.log('[Azure OCR] Combining results from all chunks...');
      allPages = allResults.flatMap(result => result.analyzeResult?.pages || []);
      
      ocrResult = {
        analyzeResult: {
          pages: allPages,
          ...allResults[0]?.analyzeResult // Keep other metadata from first result
        }
      };
      
      console.log(`[Azure OCR] Successfully combined ${allPages.length} pages from ${allResults.length} chunks`);
    } else {
      // Document already processed, use the result from initial analysis
      console.log('[Azure OCR] Document is small enough, using single-pass result');
      allPages = initialOcrResult.analyzeResult?.pages || [];
      ocrResult = { analyzeResult: { pages: allPages, ...initialOcrResult.analyzeResult } };
    }

    // Step 3: INTELLIGENT PAGE SELECTION
    const totalPages = allPages.length;
    console.log(`[Page Selection] Document has ${totalPages} pages, focus: ${focus_region}`);

    let selectedPages: any[] = [];
    let pageRangeUsed = '';

    switch (focus_region) {
      case 'front':
        selectedPages = allPages.slice(0, Math.min(10, totalPages));
        pageRangeUsed = `1-${Math.min(10, totalPages)}`;
        break;
        
      case 'middle':
        const middlePoint = Math.floor(totalPages / 2);
        const middleStart = Math.max(0, middlePoint - 5);
        const middleEnd = Math.min(middlePoint + 5, totalPages);
        selectedPages = allPages.slice(middleStart, middleEnd);
        pageRangeUsed = `${middleStart + 1}-${middleEnd}`;
        break;
        
      case 'end':
        const endStart = Math.max(0, totalPages - 10);
        selectedPages = allPages.slice(endStart);
        pageRangeUsed = `${endStart + 1}-${totalPages}`;
        break;
        
      case 'first_third':
        const firstThirdEnd = Math.floor(totalPages / 3);
        const firstThirdLimit = Math.min(firstThirdEnd, 20);
        selectedPages = allPages.slice(0, firstThirdLimit);
        pageRangeUsed = `1-${firstThirdLimit}`;
        break;
        
      case 'middle_third':
        const thirdSize = Math.floor(totalPages / 3);
        const middleThirdStart = thirdSize;
        const middleThirdEnd = Math.min(thirdSize * 2, thirdSize + 20);
        selectedPages = allPages.slice(middleThirdStart, middleThirdEnd);
        pageRangeUsed = `${middleThirdStart + 1}-${middleThirdEnd}`;
        break;
        
      case 'last_third':
        const lastThirdStart = Math.floor((totalPages / 3) * 2);
        const lastThirdActualStart = Math.max(lastThirdStart, totalPages - 20);
        selectedPages = allPages.slice(lastThirdActualStart);
        pageRangeUsed = `${lastThirdActualStart + 1}-${totalPages}`;
        break;
        
      case 'custom':
        if (page_range) {
          try {
            const [start, end] = page_range.split('-').map((n: string) => parseInt(n.trim()));
            if (start >= 1 && end <= totalPages && start <= end) {
              selectedPages = allPages.slice(start - 1, end);
              pageRangeUsed = `${start}-${end}`;
            } else {
              throw new Error('Invalid range');
            }
          } catch (e) {
            console.log('[Page Selection] Invalid custom range, using smart');
            focus_region = 'smart';
          }
        } else {
          focus_region = 'smart';
        }
        break;
        
      case 'smart':
      default:
        if (totalPages <= 10) {
          selectedPages = allPages;
          pageRangeUsed = `1-${totalPages}`;
        } else {
          const scanPages = allPages.slice(0, Math.min(20, totalPages));
          const importantPageIndices: number[] = [];
          
          scanPages.forEach((page: any, index: number) => {
            const pageText = (page.lines || [])
              .map((line: any) => line.content || '')
              .join(' ')
              .toUpperCase();
            
            const hasKeyword = IMPORTANT_KEYWORDS.some(keyword => 
              pageText.includes(keyword)
            );
            
            if (hasKeyword) {
              importantPageIndices.push(index);
            }
          });

          if (importantPageIndices.length > 0) {
            const selectedIndices = importantPageIndices.slice(0, 10);
            selectedPages = selectedIndices.map(index => allPages[index]);
            pageRangeUsed = selectedIndices.map(i => i + 1).join(', ');
          } else {
            selectedPages = allPages.slice(0, 10);
            pageRangeUsed = '1-10';
          }
        }
        break;
    }

    // Extract text from selected pages
    const selectedPageText = selectedPages
      .map((page: any) => 
        (page.lines || []).map((line: any) => line.content || '').join('\n')
      )
      .join('\n\n');

    const charCount = selectedPageText.length;
    console.log(`[Page Selection] Selected ${selectedPages.length} pages (${pageRangeUsed}), ${charCount} characters`);

    await supabase
      .from('document_analysis')
      .update({ 
        ocr_text: selectedPageText,
        ocr_char_count: charCount,
        total_pages: totalPages,
        pages_analyzed: pageRangeUsed,
        processing_status: 'ocr_complete'
      })
      .eq('id', analysisRecord.id);

    // Step 4: AI Analysis with Azure OpenAI
    console.log('[Azure OpenAI] Starting structured data extraction...');
    
    const AZURE_OPENAI_ENDPOINT = Deno.env.get('AZURE_OPENAI_ENDPOINT');
    const AZURE_OPENAI_KEY = Deno.env.get('AZURE_OPENAI_KEY');
    const AZURE_OPENAI_DEPLOYMENT = Deno.env.get('AZURE_OPENAI_DEPLOYMENT_NAME');
    
    if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_KEY || !AZURE_OPENAI_DEPLOYMENT) {
      throw new Error('Azure OpenAI credentials not configured');
    }

    const cleanOpenAIEndpoint = AZURE_OPENAI_ENDPOINT.endsWith('/') ? AZURE_OPENAI_ENDPOINT.slice(0, -1) : AZURE_OPENAI_ENDPOINT;

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
              content: `You are an expert at extracting structured data from insurance documents. Extract ALL coverage information, premium amounts, vehicle/property details, and policy information. Return ONLY valid JSON with no additional text.`
            },
            {
              role: 'user',
              content: `Extract ALL insurance information from this document:\n\n${selectedPageText.slice(0, 50000)}`
            }
          ],
          max_tokens: 2000,
          temperature: 0.1,
          response_format: { type: "json_object" }
        })
      }
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[Azure OpenAI Error]:', errorText);
      throw new Error(`Azure OpenAI failed: ${aiResponse.status} - ${errorText}`);
    }

    const aiResult = await aiResponse.json();
    const aiContent = aiResult.choices?.[0]?.message?.content || '{}';
    
    let structuredData;
    try {
      structuredData = JSON.parse(aiContent);
    } catch (e) {
      console.error('[AI Parse Error]:', e);
      structuredData = { error: 'Failed to parse AI response', raw: aiContent };
    }

    console.log('[AI Extraction] Complete');

    // Save results
    await supabase
      .from('document_analysis')
      .update({ 
        structured_data: structuredData,
        processing_status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', analysisRecord.id);

    return new Response(
      JSON.stringify({
        success: true,
        analysis_id: analysisRecord.id,
        ocr_text: selectedPageText,
        structured_data: structuredData,
        total_pages: totalPages,
        pages_analyzed: pageRangeUsed,
        focus_region: focus_region
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('[Document Analysis] Error:', error);
    
    if (documentId) {
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
          .eq('document_id', documentId);
      } catch (updateError) {
        console.error('[Status Update Error]:', updateError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
