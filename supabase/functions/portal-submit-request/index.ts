// ============================================================================
// PORTAL SUBMIT REQUEST - Edge Function
// ============================================================================
// Allows portal users to submit service requests with optional file attachments
// Wraps the create_my_service_request RPC function for external access
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

// Valid request types matching the database constraint
const VALID_REQUEST_TYPES = [
  'add_vehicle', 'remove_vehicle', 'replace_vehicle',
  'add_driver', 'remove_driver',
  'address_change', 'name_change',
  'coverage_question', 'coverage_change',
  'document_request', 'certificate_request',
  'cancel_policy', 'reinstate_policy',
  'billing_question', 'claims_question',
  'general_inquiry', 'other'
] as const;

type RequestType = typeof VALID_REQUEST_TYPES[number];

interface SubmitRequestBody {
  request_type: RequestType;
  request_title: string;
  request_data: Record<string, unknown>;
  policy_id?: string;
  attachment_paths?: string[];
}

interface SubmitRequestResponse {
  success: boolean;
  request_id: string;
  request_number?: number;
  message: string;
}

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: SubmitRequestBody = await req.json();

    // Validate required fields
    if (!body.request_type || !body.request_title || !body.request_data) {
      return new Response(
        JSON.stringify({
          error: 'Missing required fields',
          required: ['request_type', 'request_title', 'request_data']
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate request_type
    if (!VALID_REQUEST_TYPES.includes(body.request_type)) {
      return new Response(
        JSON.stringify({
          error: 'Invalid request_type',
          valid_types: VALID_REQUEST_TYPES
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate request_title length
    if (body.request_title.length < 3 || body.request_title.length > 200) {
      return new Response(
        JSON.stringify({ error: 'request_title must be between 3 and 200 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Create client with user's auth token
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader }
      }
    });

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build request data with attachments if provided
    const requestData = {
      ...body.request_data,
      ...(body.attachment_paths && { attachments: body.attachment_paths })
    };

    // Call the RPC function to create the service request
    const { data: requestId, error: rpcError } = await supabase.rpc('create_my_service_request', {
      p_request_type: body.request_type,
      p_request_title: body.request_title,
      p_request_data: requestData,
      p_policy_id: body.policy_id || null,
      p_prefilled_data: null
    });

    if (rpcError) {
      console.error('RPC error:', rpcError);

      // Handle specific errors
      if (rpcError.message.includes('Permission denied')) {
        return new Response(
          JSON.stringify({ error: 'Permission denied. Household members may not have request privileges.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (rpcError.message.includes('Policy does not belong')) {
        return new Response(
          JSON.stringify({ error: 'Invalid policy_id. Policy does not belong to your account.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (rpcError.message.includes('Not authenticated')) {
        return new Response(
          JSON.stringify({ error: 'Portal user not found or inactive' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Failed to create service request' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the request number for the response
    const { data: requestDetails } = await supabase
      .from('portal_service_requests')
      .select('request_number')
      .eq('id', requestId)
      .single();

    const response: SubmitRequestResponse = {
      success: true,
      request_id: requestId,
      request_number: requestDetails?.request_number,
      message: 'Service request submitted successfully. Our team will review it shortly.'
    };

    return new Response(
      JSON.stringify(response),
      {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Portal submit request error:', error);

    // Handle JSON parse errors
    if (error instanceof SyntaxError) {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
