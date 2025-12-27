// ============================================================================
// PORTAL GET POLICY DETAILS - Edge Function
// ============================================================================
// Returns detailed information for a specific policy including:
// - Full policy details
// - Coverage information
// - Vehicles (for auto policies)
// - Property info (for home policies)
// - Related documents
// - Claims history
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

interface PolicyDetailsResponse {
  policy: {
    id: string;
    policy_number: string | null;
    policy_type: string;
    status: string;
    effective_date: string | null;
    expiration_date: string | null;
    premium: number | null;
    carrier_name: string | null;
    account_id: string;
  };
  coverages: Array<{
    coverage_type: string;
    limit: number | null;
    deductible: number | null;
    description: string | null;
  }>;
  vehicles: Array<{
    id: string;
    year: number | null;
    make: string | null;
    model: string | null;
    vin: string | null;
  }>;
  property: {
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    dwelling_coverage: number | null;
  } | null;
  documents: Array<{
    id: string;
    document_name: string;
    document_type: string;
    created_at: string;
  }>;
  claims: Array<{
    id: string;
    claim_number: string | null;
    claim_date: string | null;
    claim_type: string | null;
    status: string;
    description: string | null;
  }>;
  id_card: {
    id: string;
    card_data: Record<string, unknown>;
  } | null;
}

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  try {
    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get policy_id from request body
    const { policy_id } = await req.json();
    if (!policy_id) {
      return new Response(
        JSON.stringify({ error: 'policy_id is required' }),
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

    // Get portal user's account_id
    const { data: portalUser, error: userError } = await supabase
      .from('client_portal_users')
      .select('account_id')
      .eq('auth_user_id', user.id)
      .eq('portal_status', 'active')
      .single();

    if (userError || !portalUser) {
      return new Response(
        JSON.stringify({ error: 'Portal user not found or inactive' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get policy and verify it belongs to user's account
    const { data: policy, error: policyError } = await supabase
      .from('policies')
      .select(`
        id,
        policy_number,
        policy_type,
        status,
        effective_date,
        expiration_date,
        premium,
        carrier_name,
        account_id
      `)
      .eq('id', policy_id)
      .eq('account_id', portalUser.account_id)
      .single();

    if (policyError || !policy) {
      return new Response(
        JSON.stringify({ error: 'Policy not found or access denied' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch additional data in parallel
    const [coveragesResult, vehiclesResult, documentsResult, claimsResult, idCardResult] = await Promise.all([
      // Get policy coverages
      supabase
        .from('policy_coverages')
        .select(`
          coverage_type,
          limit_amount,
          deductible_amount,
          description
        `)
        .eq('policy_id', policy_id)
        .order('coverage_type'),

      // Get vehicles if auto policy
      policy.policy_type?.toLowerCase().includes('auto')
        ? supabase
            .from('policy_vehicles')
            .select(`
              id,
              year,
              make,
              model,
              vin
            `)
            .eq('policy_id', policy_id)
        : Promise.resolve({ data: [], error: null }),

      // Get related documents
      supabase
        .from('portal_documents')
        .select(`
          id,
          document_name,
          document_type,
          created_at
        `)
        .eq('policy_id', policy_id)
        .eq('is_client_visible', true)
        .eq('verified_for_client_view', true)
        .order('created_at', { ascending: false }),

      // Get claims history
      supabase
        .from('claims')
        .select(`
          id,
          claim_number,
          claim_date,
          claim_type,
          status,
          description
        `)
        .eq('policy_id', policy_id)
        .order('claim_date', { ascending: false })
        .limit(10),

      // Get active ID card
      supabase
        .from('portal_id_cards')
        .select(`
          id,
          card_data
        `)
        .eq('policy_id', policy_id)
        .eq('is_active', true)
        .single()
    ]);

    // Build response
    const response: PolicyDetailsResponse = {
      policy: {
        id: policy.id,
        policy_number: policy.policy_number,
        policy_type: policy.policy_type,
        status: policy.status,
        effective_date: policy.effective_date,
        expiration_date: policy.expiration_date,
        premium: policy.premium,
        carrier_name: policy.carrier_name,
        account_id: policy.account_id
      },
      coverages: (coveragesResult.data || []).map(c => ({
        coverage_type: c.coverage_type,
        limit: c.limit_amount,
        deductible: c.deductible_amount,
        description: c.description
      })),
      vehicles: vehiclesResult.data || [],
      property: null, // Would be populated for home policies
      documents: documentsResult.data || [],
      claims: claimsResult.data || [],
      id_card: idCardResult.data || null
    };

    // Log activity
    await supabase.rpc('log_my_portal_activity', {
      p_activity_type: 'view_policy_details',
      p_activity_data: { policy_id }
    }).catch(err => {
      console.warn('Activity logging failed:', err);
    });

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Portal policy details error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
