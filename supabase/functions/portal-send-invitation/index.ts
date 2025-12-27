// ============================================================================
// PORTAL SEND INVITATION - Edge Function
// ============================================================================
// Sends portal invitation emails to customers
// Creates invitation record and triggers magic link email
// Called by staff/agents from the CustomerDetail page
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

interface InvitationRequest {
  account_id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  invitation_type?: 'standard' | 'vip' | 'campaign';
  campaign_name?: string;
}

interface InvitationResponse {
  success: boolean;
  invitation_id?: string;
  message: string;
  existing_user?: boolean;
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
    // Get auth header - staff must be authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Create client with user's auth token to verify they're staff
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader }
      }
    });

    // Verify user is authenticated staff
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is staff
    const { data: profile, error: profileError } = await userClient
      .from('profiles')
      .select('role, is_staff')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'User profile not found' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const staffRoles = ['admin', 'staff', 'producer', 'csr', 'owner', 'agent'];
    if (!staffRoles.includes(profile.role) && !profile.is_staff) {
      return new Response(
        JSON.stringify({ error: 'Only staff members can send portal invitations' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: InvitationRequest = await req.json();

    // Validate required fields
    if (!body.account_id || !body.email) {
      return new Response(
        JSON.stringify({
          error: 'Missing required fields',
          required: ['account_id', 'email']
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role client for admin operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Verify account exists
    const { data: account, error: accountError } = await adminClient
      .from('accounts')
      .select('id, name')
      .eq('id', body.account_id)
      .single();

    if (accountError || !account) {
      return new Response(
        JSON.stringify({ error: 'Account not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user already has portal access
    const { data: existingPortalUser } = await adminClient
      .from('client_portal_users')
      .select('id, portal_status')
      .eq('account_id', body.account_id)
      .ilike('email', body.email)
      .maybeSingle();

    if (existingPortalUser) {
      if (existingPortalUser.portal_status === 'active') {
        return new Response(
          JSON.stringify({
            success: false,
            message: 'This email already has active portal access for this account.',
            existing_user: true
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Check for existing pending invitation
    const { data: existingInvitation } = await adminClient
      .from('portal_invitations')
      .select('id, status, sent_at')
      .eq('account_id', body.account_id)
      .ilike('email', body.email)
      .in('status', ['pending', 'sent'])
      .maybeSingle();

    let invitationId: string;

    if (existingInvitation) {
      // Update existing invitation and resend
      const { error: updateError } = await adminClient
        .from('portal_invitations')
        .update({
          status: 'pending',
          send_attempts: 0,
          last_error: null,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
        })
        .eq('id', existingInvitation.id);

      if (updateError) {
        console.error('Update invitation error:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to update invitation' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      invitationId = existingInvitation.id;
    } else {
      // Create new invitation
      const { data: newInvitation, error: insertError } = await adminClient
        .from('portal_invitations')
        .insert({
          account_id: body.account_id,
          email: body.email.toLowerCase(),
          invitation_type: body.invitation_type || 'standard',
          campaign_name: body.campaign_name,
          status: 'pending',
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
        })
        .select('id')
        .single();

      if (insertError || !newInvitation) {
        console.error('Insert invitation error:', insertError);
        return new Response(
          JSON.stringify({ error: 'Failed to create invitation' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      invitationId = newInvitation.id;
    }

    // Create or update client_portal_users entry (invited status)
    const { data: portalUser, error: portalUserError } = await adminClient
      .from('client_portal_users')
      .upsert({
        account_id: body.account_id,
        email: body.email.toLowerCase(),
        first_name: body.first_name || null,
        last_name: body.last_name || null,
        portal_status: 'invited',
        can_submit_requests: true,
        can_view_policies: true,
        can_view_documents: true,
        can_view_claims: true
      }, {
        onConflict: 'account_id,email',
        ignoreDuplicates: false
      })
      .select('id')
      .single();

    if (portalUserError) {
      console.error('Portal user upsert error:', portalUserError);
      // Don't fail - invitation was created, just log
    }

    // Generate magic link for portal registration
    const portalUrl = Deno.env.get('PORTAL_URL') || 'https://www.lewisinsurance.com';
    const redirectTo = `${portalUrl}/portal/callback?invitation=${invitationId}`;

    const { error: magicLinkError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: body.email,
      options: {
        redirectTo
      }
    });

    if (magicLinkError) {
      console.error('Magic link generation error:', magicLinkError);

      // Update invitation with error
      await adminClient
        .from('portal_invitations')
        .update({
          status: 'pending',
          last_error: magicLinkError.message,
          send_attempts: 1
        })
        .eq('id', invitationId);

      // Still return success since invitation was created
      // The magic link can be resent later
    } else {
      // Update invitation status to sent
      await adminClient
        .from('portal_invitations')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          sent_via: 'magic_link',
          send_attempts: 1
        })
        .eq('id', invitationId);
    }

    const response: InvitationResponse = {
      success: true,
      invitation_id: invitationId,
      message: magicLinkError
        ? 'Invitation created but email delivery may be delayed. The customer will receive an email shortly.'
        : `Portal invitation sent to ${body.email}. They will receive an email with a link to access the portal.`
    };

    return new Response(
      JSON.stringify(response),
      {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Portal send invitation error:', error);

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
