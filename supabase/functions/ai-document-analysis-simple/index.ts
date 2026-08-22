/**
 * AI Document Analysis Simple - Edge Function
 * Uses Azure Document Intelligence for OCR + Azure OpenAI for analysis
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth } from '../_shared/auth.ts';
import { runPhase0DocumentExtract } from '../_shared/phase0Extract.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const authResult = await requireAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) {
      return authResult;
    }

    const result = await runPhase0DocumentExtract(supabase, {
      documentId: document_id,
      fileName: file_name,
      accountId: account_id || null,
      createdBy: user_id,
    });

    console.log('========================================');
    console.log('SUCCESS - Analysis Complete');
    console.log('========================================');

    return new Response(
      JSON.stringify({
        success: true,
        analysis_id: result.analysisId,
        document_id,
        page_count: result.pageCount,
        text_length: result.textLength,
        total_chars: result.textLength,
        chunk_count: result.chunkCount,
        chunks_analyzed: result.chunksAnalyzed,
        chunks_failed: result.chunksFailed,
        partial_extraction: result.partialExtraction,
        ocr_text: result.ocrText,
        analysis: result.analysisResult,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('========================================');
    console.error('ERROR:', (error instanceof Error ? error.message : String(error)));
    console.error('========================================');

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
