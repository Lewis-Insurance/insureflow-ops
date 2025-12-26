import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";
import { encode as encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-twilio-signature',
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

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Twilio recording webhook called');

    // SECURITY: Validate Twilio signature
    const twilioSignature = req.headers.get('x-twilio-signature');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');

    if (!twilioAuthToken) {
      console.error('TWILIO_AUTH_TOKEN not configured - rejecting request');
      return new Response('Server configuration error', { status: 500, headers: corsHeaders });
    }

    if (!twilioSignature) {
      console.error('Missing Twilio signature - rejecting request');
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    // Clone request to read body for validation
    const clonedReq = req.clone();

    // Parse form data from Twilio
    const formData = await req.formData();
    const webhookData: Record<string, string> = {};
    
    for (const [key, value] of formData.entries()) {
      webhookData[key] = value.toString();
    }

    // Validate Twilio signature
    const webhookUrl = req.url; // The full URL Twilio called
    const isValid = await validateTwilioSignature(
      twilioAuthToken,
      twilioSignature,
      webhookUrl,
      webhookData
    );

    if (!isValid) {
      console.error('Invalid Twilio signature - rejecting request');
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    console.log('Recording webhook data validated');

    const { CallSid, RecordingUrl, RecordingDuration } = webhookData;

    // Update call session with recording information
    if (CallSid && RecordingUrl) {
      const { error } = await supabase
        .from('call_sessions')
        .update({
          recording_url: RecordingUrl,
          duration_seconds: RecordingDuration ? parseInt(RecordingDuration) : null,
          ended_at: new Date().toISOString()
        })
        .eq('twilio_call_sid', CallSid);

      if (error) {
        console.error('Error updating call with recording:', error);
      } else {
        console.log('Call recording saved successfully');
      }
    }

    // Return simple TwiML response
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <!-- Recording webhook processed -->
</Response>`;

    return new Response(twimlResponse, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/xml',
      },
    });

  } catch (error) {
    console.error('Error in recording webhook:', error);
    
    return new Response('Error processing recording webhook', {
      status: 500,
      headers: corsHeaders,
    });
  }
});