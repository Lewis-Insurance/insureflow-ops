// ============================================================================
// CHECK PORTAL ACCESS - Edge Function
// ============================================================================
// Pre-login check for invite-required flow
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { checkRateLimit, addRateLimitHeaders } from '../_shared/rate-limit.ts';

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // This endpoint is called BEFORE authentication, so use service role
    // but only for the check_portal_invitation function
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const inviteRateLimit = { maxRequests: 5, windowSeconds: 60, keyType: 'ip' as const };

    const rateLimitResult = await checkRateLimit(
      supabase,
      'check-portal-access',
      clientIp,
      inviteRateLimit
    );

    if (!rateLimitResult.allowed) {
      const headers = addRateLimitHeaders(corsHeaders, rateLimitResult, inviteRateLimit);
      headers['Content-Type'] = 'application/json';
      headers['Retry-After'] = Math.ceil((rateLimitResult.resetAt.getTime() - Date.now()) / 1000).toString();

      return new Response(
        JSON.stringify({ allowed: false, reason: 'no_invitation' }),
        { status: 429, headers }
      );
    }

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

    // Normalize response to avoid leaking extra metadata
    const normalizedResponse = {
      allowed: Boolean(data?.allowed),
      reason: data?.reason || 'no_invitation',
    };

    return new Response(
      JSON.stringify(normalizedResponse),
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
