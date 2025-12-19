// ============================================================================
// GET ID CARD IMAGE - Edge Function
// ============================================================================
// ID card access with RPC-based action tracking
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = Deno.env.get('PORTAL_ALLOWED_ORIGINS')?.split(',') || ['https://portal.lewisinsurance.com'];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

serve(async (req) => {
  const origin = req.headers.get('Origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

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

    // Use anon key + JWT for RLS
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    const { cardId, action = 'view' } = await req.json();

    if (!cardId) {
      return new Response(
        JSON.stringify({ error: 'cardId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use RPC for access check + increment
    const { data: cardInfo, error: rpcError } = await supabaseUser.rpc(
      'increment_id_card_action',
      { p_card_id: cardId, p_action: action }
    );

    if (rpcError) {
      console.error('RPC error:', rpcError);

      if (rpcError.message.includes('not found') || rpcError.message.includes('access denied')) {
        return new Response(
          JSON.stringify({ error: 'ID card not found or access denied' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (rpcError.message.includes('Permission denied')) {
        return new Response(
          JSON.stringify({ error: 'Permission denied' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw rpcError;
    }

    // Determine which path to use based on action
    const filePath = action === 'download'
      ? cardInfo.card_pdf_path
      : cardInfo.card_image_path;

    if (!filePath) {
      return new Response(
        JSON.stringify({ error: 'ID card image not generated yet' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate signed URL (15 minutes for viewing)
    const { data: signedUrl, error: urlError } = await supabaseService.storage
      .from('portal-documents')
      .createSignedUrl(filePath, 900);

    if (urlError) {
      console.error('Storage error:', urlError);
      throw new Error('Failed to generate URL');
    }

    return new Response(
      JSON.stringify({
        url: signedUrl.signedUrl,
        cardData: cardInfo.card_data,
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
