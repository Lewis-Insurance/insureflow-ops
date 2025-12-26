import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}${params[key]}`)
    .join('');

  const dataToSign = url + sortedParams;
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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');

    // SECURITY: Validate Twilio signature
    if (!twilioAuthToken) {
      console.error('TWILIO_AUTH_TOKEN not configured - rejecting request');
      return new Response('Server configuration error', { status: 500 });
    }

    const twilioSignature = req.headers.get('x-twilio-signature');
    if (!twilioSignature) {
      console.error('Missing Twilio signature - rejecting request');
      return new Response('Unauthorized', { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const formData = await req.formData();

    // Collect params for signature validation
    const webhookData: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      webhookData[key] = value.toString();
    }

    const isValid = await validateTwilioSignature(
      twilioAuthToken,
      twilioSignature,
      req.url,
      webhookData
    );

    if (!isValid) {
      console.error('Invalid Twilio signature - rejecting request');
      return new Response('Unauthorized', { status: 401 });
    }
    
    const from = webhookData['From'] || '';
    const to = webhookData['To'] || '';
    const callSid = webhookData['CallSid'] || '';
    const callStatus = webhookData['CallStatus'] || '';

    // Check allowlist
    const { data: allowed } = await supabase
      .from('inbound_allowlist')
      .select('*')
      .eq('channel', 'voice')
      .eq('value', from)
      .single();

    if (!allowed) {
      console.log('Call not in allowlist:', from);
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>This number is not authorized.</Say><Hangup/></Response>',
        { headers: { 'Content-Type': 'text/xml' } }
      );
    }

    // Create or update call session
    if (callStatus === 'ringing' || callStatus === 'in-progress') {
      const { data: recentTicket } = await supabase.rpc(
        'find_recent_ticket_by_sender',
        { p_sender: from }
      );

      let ticketId: string;
      
      if (recentTicket) {
        ticketId = recentTicket.id;
      } else {
        const { data: newTicket, error } = await supabase
          .from('tickets')
          .insert({
            title: `Call from ${from}`,
            channel: 'phone',
            status: 'open',
            priority: 'normal',
          })
          .select()
          .single();

        if (error) throw error;
        ticketId = newTicket.id;
      }

      // Create call session
      await supabase.from('call_sessions').insert({
        twilio_call_sid: callSid,
        from_number: from,
        to_number: to,
        started_at: new Date().toISOString(),
      });

      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Please hold while we connect you.</Say><Dial timeout="30">agent</Dial></Response>',
        { headers: { 'Content-Type': 'text/xml' } }
      );
    }

    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { headers: { 'Content-Type': 'text/xml' } }
    );
  } catch (error: any) {
    console.error('Error processing call:', error);
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say>An error occurred.</Say><Hangup/></Response>',
      { status: 500, headers: { 'Content-Type': 'text/xml' } }
    );
  }
});
