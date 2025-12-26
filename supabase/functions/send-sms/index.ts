/**
 * Send SMS Edge Function
 *
 * Sends SMS messages via Twilio with proper authentication,
 * rate limiting, and account access verification.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth, verifyResourceAccess } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { checkRateLimit, RATE_LIMITS, rateLimitExceededResponse } from "../_shared/rate-limit.ts";

interface SendSMSRequest {
  to_number: string;
  body: string;
  account_id?: string;
  contact_id?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  try {
    // Create Supabase client with service role for auth verification
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Require authentication
    const authResult = await requireAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) {
      return authResult; // Returns 401 if auth failed
    }
    const user = authResult;

    // Check rate limit (10 SMS per minute per user)
    const rateLimitResult = await checkRateLimit(
      supabase,
      'send-sms',
      user.id,
      RATE_LIMITS.sms
    );

    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult, corsHeaders);
    }

    // Get request body
    const { to_number, body, account_id, contact_id }: SendSMSRequest = await req.json();

    // Validate required fields
    if (!to_number || !body) {
      return new Response(
        JSON.stringify({ success: false, error: "to_number and body are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate body length (Twilio limit is 1600 characters)
    if (body.length > 1600) {
      return new Response(
        JSON.stringify({ success: false, error: "Message body exceeds 1600 character limit" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If account_id is provided, verify user has access to it
    if (account_id) {
      const hasAccess = await verifyResourceAccess(supabase, user.id, 'account', account_id);
      if (!hasAccess) {
        return new Response(
          JSON.stringify({ success: false, error: "Access denied to this account" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get Twilio credentials from environment
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioPhone = Deno.env.get("TWILIO_PHONE_NUMBER");

    if (!accountSid || !authToken || !twilioPhone) {
      console.error("Twilio credentials not configured");
      return new Response(
        JSON.stringify({ success: false, error: "SMS service not configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format phone numbers
    let formattedTo = to_number.replace(/\D/g, "");
    if (!formattedTo.startsWith("1") && formattedTo.length === 10) {
      formattedTo = "1" + formattedTo;
    }
    formattedTo = "+" + formattedTo;

    let formattedFrom = twilioPhone.replace(/\D/g, "");
    if (!formattedFrom.startsWith("1")) {
      formattedFrom = "1" + formattedFrom;
    }
    formattedFrom = "+" + formattedFrom;

    // Validate phone number format
    if (!/^\+1\d{10}$/.test(formattedTo)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid phone number format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.info(`Sending SMS from ${formattedFrom} to ${formattedTo} (user: ${user.id})`);

    // Send SMS via Twilio API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

    const twilioResponse = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Authorization": "Basic " + btoa(`${accountSid}:${authToken}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: formattedTo,
        From: formattedFrom,
        Body: body,
      }),
    });

    const twilioData = await twilioResponse.json();

    if (!twilioResponse.ok) {
      console.error("Twilio error:", twilioData);
      return new Response(
        JSON.stringify({
          success: false,
          error: twilioData.message || "Failed to send SMS",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Store message in database
    const { data: dbMessage, error: dbError } = await supabase
      .from("sms_messages")
      .insert({
        twilio_message_sid: twilioData.sid,
        direction: "outbound",
        from_number: formattedFrom,
        to_number: formattedTo,
        body: body,
        status: twilioData.status || "sent",
        account_id: account_id || null,
        contact_id: contact_id || null,
        sent_by: user.id,
      })
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      // Don't fail the request, SMS was still sent
    }

    return new Response(
      JSON.stringify({
        success: true,
        message_sid: twilioData.sid,
        status: twilioData.status,
        db_record: dbMessage,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error sending SMS:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        headers: { ...getCorsHeaders(req.headers.get('origin')), "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
