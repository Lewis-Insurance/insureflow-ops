// ============================================================================
// GET DOCUMENT URL - Edge Function
// ============================================================================
// Secure document download with RPC-based access check
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use anon key + JWT for RLS-enforced operations
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Service client only for storage operations
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    const { documentId } = await req.json();

    if (!documentId) {
      return new Response(
        JSON.stringify({ error: 'documentId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use RPC for access check + atomic increment
    const { data: docInfo, error: rpcError } = await supabaseUser.rpc(
      'increment_document_download',
      { p_document_id: documentId }
    );

    if (rpcError) {
      console.error('RPC error:', rpcError);

      if (rpcError.message.includes('not found') || rpcError.message.includes('access denied')) {
        return new Response(
          JSON.stringify({ error: 'Document not found or access denied' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (rpcError.message.includes('Permission denied')) {
        return new Response(
          JSON.stringify({ error: 'Permission denied' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (rpcError.message.includes('Not authenticated')) {
        return new Response(
          JSON.stringify({ error: 'Not authenticated' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw rpcError;
    }

    // Generate signed URL using service client (5 minutes)
    const { data: signedUrl, error: urlError } = await supabaseService.storage
      .from('portal-documents')
      .createSignedUrl(docInfo.file_path, 300);

    if (urlError) {
      console.error('Storage error:', urlError);
      throw new Error('Failed to generate download URL');
    }

    return new Response(
      JSON.stringify({
        url: signedUrl.signedUrl,
        filename: docInfo.document_name,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
