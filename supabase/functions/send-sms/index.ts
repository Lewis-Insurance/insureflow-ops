import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get Twilio credentials from environment
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioPhone = Deno.env.get("TWILIO_PHONE_NUMBER");

    if (!accountSid || !authToken || !twilioPhone) {
      throw new Error("Twilio credentials not configured");
    }

    // Get request body
    const { to_number, body, account_id, contact_id } = await req.json();

    if (!to_number || !body) {
      throw new Error("to_number and body are required");
    }

    // Format phone number (ensure it has +1 prefix)
    let formattedTo = to_number.replace(/\D/g, "");
    if (!formattedTo.startsWith("1")) {
      formattedTo = "1" + formattedTo;
    }
    formattedTo = "+" + formattedTo;

    // Format from number
    let formattedFrom = twilioPhone.replace(/\D/g, "");
    if (!formattedFrom.startsWith("1")) {
      formattedFrom = "1" + formattedFrom;
    }
    formattedFrom = "+" + formattedFrom;

    console.log(`Sending SMS from ${formattedFrom} to ${formattedTo}`);

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
      throw new Error(twilioData.message || "Failed to send SMS");
    }

    console.log("Twilio response:", twilioData);

    // Store message in database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});

