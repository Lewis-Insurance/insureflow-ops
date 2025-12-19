// ============================================================================
// INSUREFLOW CLIENT PORTAL - CORRECTED EDGE FUNCTIONS
// ============================================================================
// Fixes:
// 1. Use anon key + JWT for RLS reads, service key only for storage
// 2. Use RPC for atomic increments instead of fake .sql syntax
// 3. Proper error handling and CORS
// ============================================================================

// ----------------------------------------------------------------------------
// supabase/functions/get-document-url/index.ts
// ----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Use environment variable for allowed origins (or default to portal domain)
const ALLOWED_ORIGINS = Deno.env.get('PORTAL_ALLOWED_ORIGINS')?.split(',') || ['https://portal.lewisinsurance.com'];

function getCorsHeaders(origin: string | null): Record<string, string> {
  // Check if origin is allowed
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

    // CRITICAL FIX: Use anon key + JWT for RLS-enforced operations
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

    // CRITICAL FIX: Use RPC for access check + atomic increment
    // This function checks permissions and increments download count atomically
    const { data: docInfo, error: rpcError } = await supabaseUser.rpc(
      'increment_document_download',
      { p_document_id: documentId }
    );

    if (rpcError) {
      console.error('RPC error:', rpcError);
      
      // Map error messages to appropriate status codes
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


// ----------------------------------------------------------------------------
// supabase/functions/get-id-card-image/index.ts
// ----------------------------------------------------------------------------

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


// ----------------------------------------------------------------------------
// supabase/functions/generate-apple-pass/index.ts
// ----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// Note: You'll need passkit-generator or similar for actual pass generation

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


// ----------------------------------------------------------------------------
// supabase/functions/check-portal-access/index.ts
// Pre-login check for invite-required flow
// ----------------------------------------------------------------------------

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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // This endpoint is called BEFORE authentication, so use service role
    // but only for the check_portal_invitation function
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { email } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if email has valid invitation
    const { data, error } = await supabase.rpc('check_portal_invitation', {
      p_email: email
    });

    if (error) {
      console.error('RPC error:', error);
      throw error;
    }

    return new Response(
      JSON.stringify(data),
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
