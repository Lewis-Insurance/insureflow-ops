// ============================================================================
// CANOPY INITIATE PULL
// ============================================================================
// Initiates a new Canopy Connect pull session and returns the SDK config
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

interface InitiateRequest {
  lead_id?: string;
  account_id?: string;
  mode?: 'create_lead' | 'attach_account';
}

interface CanopyCreatePullResponse {
  pull_id: string;
  link_token: string;
  expires_at: string;
}

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const canopyClientId = Deno.env.get('CANOPY_CLIENT_ID');
  const canopyClientSecret = Deno.env.get('CANOPY_CLIENT_SECRET');
  const canopyApiUrl = Deno.env.get('CANOPY_API_BASE_URL') || 'https://api.canopyconnect.com/v1';

  // Validate configuration
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    console.error('Missing Supabase configuration');
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (!canopyClientId || !canopyClientSecret) {
    console.error('Missing Canopy API credentials');
    return new Response(JSON.stringify({ error: 'Canopy API not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // Verify user authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create user client to verify auth
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify user is staff
    const { data: profile } = await supabaseUser.from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'staff', 'producer', 'csr', 'owner'].includes(profile.role)) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Parse request body
    const body: InitiateRequest = await req.json();

    // Validate that either lead_id or account_id is provided (or neither for new)
    if (body.lead_id && body.account_id) {
      return new Response(JSON.stringify({
        error: 'Cannot specify both lead_id and account_id'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create Canopy pull session via their API
    const canopyResponse = await fetch(`${canopyApiUrl}/pulls`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${btoa(`${canopyClientId}:${canopyClientSecret}`)}`,
      },
      body: JSON.stringify({
        // Canopy API configuration
        redirect_uri: `${origin || 'https://lewisinsurance.ai'}/canopy-callback`,
        webhook_url: `${supabaseUrl}/functions/v1/canopy-webhook`,
        // Optional: pre-configure which data to pull
        products: ['auto', 'home', 'renters', 'umbrella'],
        // Optional: metadata to pass through
        metadata: {
          lead_id: body.lead_id,
          account_id: body.account_id,
          initiated_by: user.id,
        }
      })
    });

    if (!canopyResponse.ok) {
      const errorText = await canopyResponse.text();
      console.error('Canopy API error:', errorText);
      return new Response(JSON.stringify({
        error: 'Failed to create Canopy pull session',
        details: canopyResponse.status
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const canopyData: CanopyCreatePullResponse = await canopyResponse.json();

    // Store pull record in database (using service role for insert)
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    const { data: pullRecord, error: insertError } = await supabaseService
      .from('canopy_pulls')
      .insert({
        canopy_pull_id: canopyData.pull_id,
        lead_id: body.lead_id || null,
        account_id: body.account_id || null,
        status: 'pending',
        initiated_by: user.id,
        metadata: {
          mode: body.mode || (body.account_id ? 'attach_account' : 'create_lead'),
          link_token_expires: canopyData.expires_at,
        }
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to store pull record:', insertError);
      return new Response(JSON.stringify({
        error: 'Failed to create pull record',
        details: insertError.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Return SDK initialization data
    return new Response(JSON.stringify({
      success: true,
      pull_id: pullRecord.id,
      canopy_pull_id: canopyData.pull_id,
      link_token: canopyData.link_token,
      expires_at: canopyData.expires_at,
      client_id: canopyClientId,
      environment: Deno.env.get('ENVIRONMENT') === 'production' ? 'production' : 'sandbox'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Canopy initiate error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
