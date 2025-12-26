import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";
import { encode as encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-twilio-signature",
};

// Twilio signature validation helper
async function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>
): Promise<boolean> {
  // Sort params alphabetically and concatenate
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}${params[key]}`)
    .join('');

  const dataToSign = url + sortedParams;

  // Create HMAC-SHA1
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(dataToSign)
  );

  const expectedSignature = encodeBase64(new Uint8Array(signatureBytes));
  return signature === expectedSignature;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Received Twilio SMS webhook");

    // SECURITY: Validate Twilio signature
    const twilioSignature = req.headers.get('x-twilio-signature');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');

    if (!twilioAuthToken) {
      console.error('TWILIO_AUTH_TOKEN not configured - rejecting request');
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { "Content-Type": "text/xml" },
        status: 500,
      });
    }

    if (!twilioSignature) {
      console.error('Missing Twilio signature - rejecting request');
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { "Content-Type": "text/xml" },
        status: 401,
      });
    }

    // Parse form data from Twilio (they send x-www-form-urlencoded)
    const formData = await req.formData();

    // Build params object for validation
    const webhookData: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      webhookData[key] = value.toString();
    }

    // Validate Twilio signature
    const webhookUrl = req.url;
    const isValid = await validateTwilioSignature(
      twilioAuthToken,
      twilioSignature,
      webhookUrl,
      webhookData
    );

    if (!isValid) {
      console.error('Invalid Twilio signature - rejecting request');
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { "Content-Type": "text/xml" },
        status: 401,
      });
    }

    const messageSid = formData.get("MessageSid") as string;
    const from = formData.get("From") as string;
    const to = formData.get("To") as string;
    const body = formData.get("Body") as string;
    const status = formData.get("SmsStatus") as string || "received";
    const numMedia = parseInt(formData.get("NumMedia") as string || "0");

    console.log(`SMS from ${from} to ${to}: ${body?.substring(0, 50)}...`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Try to find existing contact by phone number
    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id, account_id")
      .or(`phone.eq.${from},mobile_phone.eq.${from}`)
      .limit(1)
      .single();

    // Store the inbound message
    const { data: message, error: insertError } = await supabase
      .from("sms_messages")
      .insert({
        twilio_message_sid: messageSid,
        direction: "inbound",
        from_number: from,
        to_number: to,
        body: body,
        status: status,
        account_id: existingContact?.account_id || null,
        contact_id: existingContact?.id || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error storing message:", insertError);
    } else {
      console.log("Stored message:", message?.id);
    }

    // Check for opt-out keywords
    const upperBody = (body || "").toUpperCase().trim();
    const optOutKeywords = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"];
    const optInKeywords = ["START", "UNSTOP", "SUBSCRIBE"];

    if (optOutKeywords.includes(upperBody)) {
      console.log(`Opt-out received from ${from}`);
      
      // Update consent record if contact exists
      if (existingContact?.id) {
        await supabase
          .from("consents")
          .update({ revoked_at: new Date().toISOString() })
          .eq("contact_id", existingContact.id)
          .eq("type", "sms")
          .is("revoked_at", null);
      }
    }

    if (optInKeywords.includes(upperBody)) {
      console.log(`Opt-in received from ${from}`);
      
      // Create new consent record if contact exists
      if (existingContact?.id) {
        await supabase
          .from("consents")
          .insert({
            contact_id: existingContact.id,
            type: "sms",
            method: "text_keyword",
            proof_ref: messageSid,
          });
      }
    }

    // Handle media attachments if any
    if (numMedia > 0) {
      const mediaUrls: string[] = [];
      for (let i = 0; i < numMedia; i++) {
        const mediaUrl = formData.get(`MediaUrl${i}`) as string;
        if (mediaUrl) {
          mediaUrls.push(mediaUrl);
        }
      }
      
      if (mediaUrls.length > 0 && message?.id) {
        // Store media URLs in message metadata or separate table
        await supabase
          .from("sms_messages")
          .update({ 
            // You could add a metadata column for this
            // metadata: { media_urls: mediaUrls }
          })
          .eq("id", message.id);
      }
    }

    // Return TwiML response (empty is fine for just receiving)
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>`;

    return new Response(twiml, {
      headers: { 
        "Content-Type": "text/xml",
      },
      status: 200,
    });

  } catch (error) {
    console.error("Webhook error:", error);
    
    // Still return 200 to prevent Twilio retries
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>`;

    return new Response(twiml, {
      headers: { "Content-Type": "text/xml" },
      status: 200,
    });
  }
});


