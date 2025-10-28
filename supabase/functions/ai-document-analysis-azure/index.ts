import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    if (page_range) console.log('[Page Range]:', page_range);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase credentials not configured');

    const supabase = createClient(supabaseUrl, supabaseKey);

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

    if (insertError) throw insertError;

    console.log('[Document Analysis] Record created:', analysisRecord.id);

    const AZURE_ENDPOINT = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT');
    const AZURE_API_KEY = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY');
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

    // 👇 FIXED SECTION — added pages: ["1-"]
    console.log('[Azure OCR] Starting Document Intelligence with API version 2023-07-31...');
    const analyzeUrl = `${cleanEndpoint}/formrecognizer/documentModels/prebuilt-layout:analyze?api-version=2023-07-31`;

    const analyzeResponse = await fetch(analyzeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': AZURE_API_KEY,
      },
      body: JSON.stringify({
        urlSource: signedUrlData.signedUrl,
        pages: ["1-"] // <--- This ensures Azure processes ALL pages
      })
    });
    // 👆 END FIX

    if (!analyzeResponse.ok) {
      const errorText = await analyzeResponse.text();
      throw new Error(`Azure OCR failed: ${analyzeResponse.status} - ${errorText}`);
    }

    const operationLocation = analyzeResponse.headers.get('Operation-Location');
    if (!operationLocation) throw new Error('No operation location returned from Azure');

    console.log('[Azure OCR] Operation started, polling for results...');
    let ocrResult;
    let attempts = 0;
    const maxAttempts = 60;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const resultResponse = await fetch(operationLocation, {
        headers: { 'Ocp-Apim-Subscription-Key': AZURE_API_KEY }
      });
      const result = await resultResponse.json();
      if (result.status === 'succeeded') {
        ocrResult = result;
        console.log('[Azure OCR] Success!');
        break;
      } else if (result.status === 'failed') {
        throw new Error('Azure OCR failed: ' + JSON.stringify(result.error || result));
      }
      attempts++;
      console.log(`[Azure OCR] Polling attempt ${attempts}/${maxAttempts}, status: ${result.status}`);
    }

    if (!ocrResult) throw new Error('Azure OCR timed out after 2 minutes');

    const allPages = ocrResult.analyzeResult.pages || [];
    const totalPages = allPages.length;
    console.log(`[Page Selection] Document has ${totalPages} pages, focus: ${focus_region}`);

    if (totalPages === 0) throw new Error('Azure OCR returned 0 pages');

    // (everything below remains identical)
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
      default:
        selectedPages = allPages.slice(0, Math.min(10, totalPages));
        pageRangeUsed = `1-${Math.min(10, totalPages)}`;
    }

    const selectedPageText = selectedPages
      .map((page: any) => (page.lines || []).map((line: any) => line.content || '').join('\n'))
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

    console.log('[Document Analysis] OCR saved to database');

    return new Response(
      JSON.stringify({
        success: true,
        analysis_id: analysisRecord.id,
        total_pages: totalPages,
        pages_analyzed: pageRangeUsed
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
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
          .update({ processing_status: 'failed', error_message: error.message })
          .eq('document_id', documentId);
      } catch (updateError) {
        console.error('[Status Update Error]:', updateError);
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
