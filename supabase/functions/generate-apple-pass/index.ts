// ============================================================================
// GENERATE APPLE PASS - Edge Function
// ============================================================================
// Apple Wallet pass generation for ID cards
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

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    const { cardId } = await req.json();

    if (!cardId) {
      return new Response(
        JSON.stringify({ error: 'cardId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use RPC for access check + increment wallet count
    const { data: cardInfo, error: rpcError } = await supabaseUser.rpc(
      'increment_id_card_action',
      { p_card_id: cardId, p_action: 'wallet_add' }
    );

    if (rpcError) {
      console.error('RPC error:', rpcError);

      if (rpcError.message.includes('Permission denied')) {
        return new Response(
          JSON.stringify({ error: 'Permission denied: cannot add to wallet' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw rpcError;
    }

    // Check if pass already exists
    if (cardInfo.apple_wallet_pass_path) {
      // Return existing pass URL
      const { data: signedUrl } = await supabaseService.storage
        .from('portal-documents')
        .createSignedUrl(cardInfo.apple_wallet_pass_path, 900);

      return new Response(
        JSON.stringify({ passUrl: signedUrl?.signedUrl }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // TODO: Generate new Apple Wallet pass using passkit-generator
    // This is a placeholder - actual implementation requires:
    // 1. Apple Developer certificates
    // 2. Pass template
    // 3. passkit-generator library

    const passData = cardInfo.card_data;

    // Placeholder: In real implementation, generate .pkpass file
    // const pass = await generateApplePass(passData);
    // const passPath = `wallet-passes/${cardId}/pass.pkpass`;
    // await supabaseService.storage.from('portal-documents').upload(passPath, pass);

    // For now, return error indicating pass generation not implemented
    return new Response(
      JSON.stringify({
        error: 'Apple Wallet pass generation not yet implemented',
        cardData: passData
      }),
      { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
