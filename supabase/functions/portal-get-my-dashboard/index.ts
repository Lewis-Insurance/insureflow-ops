// ============================================================================
// PORTAL GET MY DASHBOARD - Edge Function
// ============================================================================
// Returns all dashboard data for the authenticated portal user including:
// - User profile
// - Policies
// - Documents
// - ID cards
// - Pending service requests
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

interface DashboardResponse {
  user: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    account_name: string | null;
    account_id: string;
  };
  policies: Array<{
    id: string;
    policy_number: string | null;
    policy_type: string;
    status: string;
    effective_date: string | null;
    expiration_date: string | null;
    premium: number | null;
    carrier_name: string | null;
  }>;
  documents: Array<{
    id: string;
    document_name: string;
    document_type: string;
    created_at: string;
    policy_id: string | null;
  }>;
  id_cards: Array<{
    id: string;
    policy_id: string;
    card_data: Record<string, unknown>;
    is_active: boolean;
  }>;
  pending_requests: Array<{
    id: string;
    request_number: number;
    request_type: string;
    request_title: string;
    status: string;
    created_at: string;
  }>;
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

    // Get portal user profile with account info
    const { data: portalUser, error: userError } = await supabase
      .from('client_portal_users')
      .select(`
        id,
        email,
        first_name,
        last_name,
        account_id,
        portal_status,
        accounts!inner (
          id,
          name
        )
      `)
      .eq('auth_user_id', user.id)
      .eq('portal_status', 'active')
      .single();

    if (userError || !portalUser) {
      console.error('Portal user not found:', userError);
      return new Response(
        JSON.stringify({ error: 'Portal user not found or inactive' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accountId = portalUser.account_id;

    // Fetch all dashboard data in parallel
    const [policiesResult, documentsResult, idCardsResult, requestsResult] = await Promise.all([
      // Get policies for this account
      supabase
        .from('policies')
        .select(`
          id,
          policy_number,
          policy_type,
          status,
          effective_date,
          expiration_date,
          premium,
          carrier_name
        `)
        .eq('account_id', accountId)
        .in('status', ['active', 'pending', 'renewal'])
        .order('expiration_date', { ascending: true }),

      // Get visible documents for this account
      supabase
        .from('portal_documents')
        .select(`
          id,
          document_name,
          document_type,
          created_at,
          policy_id
        `)
        .eq('account_id', accountId)
        .eq('is_client_visible', true)
        .eq('verified_for_client_view', true)
        .order('created_at', { ascending: false })
        .limit(20),

      // Get active ID cards for this account
      supabase
        .from('portal_id_cards')
        .select(`
          id,
          policy_id,
          card_data,
          is_active
        `)
        .eq('account_id', accountId)
        .eq('is_active', true),

      // Get pending/in-progress service requests
      supabase
        .from('portal_service_requests')
        .select(`
          id,
          request_number,
          request_type,
          request_title,
          status,
          created_at
        `)
        .eq('account_id', accountId)
        .in('status', ['new', 'in_progress', 'pending_info'])
        .order('created_at', { ascending: false })
        .limit(10)
    ]);

    // Build response
    const dashboard: DashboardResponse = {
      user: {
        id: portalUser.id,
        email: portalUser.email,
        first_name: portalUser.first_name,
        last_name: portalUser.last_name,
        account_name: (portalUser.accounts as { name: string })?.name || null,
        account_id: accountId
      },
      policies: policiesResult.data || [],
      documents: documentsResult.data || [],
      id_cards: idCardsResult.data || [],
      pending_requests: requestsResult.data || []
    };

    // Log activity
    await supabase.rpc('log_my_portal_activity', {
      p_activity_type: 'view_dashboard',
      p_activity_data: {}
    }).catch(err => {
      // Don't fail the request if logging fails
      console.warn('Activity logging failed:', err);
    });

    return new Response(
      JSON.stringify(dashboard),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Portal dashboard error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
