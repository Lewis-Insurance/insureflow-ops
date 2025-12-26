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
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        status: 500,
        headers: { 'Content-Type': 'text/xml' }
      });
    }

    const twilioSignature = req.headers.get('x-twilio-signature');
    if (!twilioSignature) {
      console.error('Missing Twilio signature - rejecting request');
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        status: 401,
        headers: { 'Content-Type': 'text/xml' }
      });
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
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        status: 401,
        headers: { 'Content-Type': 'text/xml' }
      });
    }

    const from = webhookData['From'] || '';
    const to = webhookData['To'] || '';
    const body = webhookData['Body'] || '';
    const messageSid = webhookData['MessageSid'] || '';

    // Check allowlist
    const { data: allowed } = await supabase
      .from('inbound_allowlist')
      .select('*')
      .eq('channel', 'sms')
      .eq('value', from)
      .single();

    if (!allowed) {
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' }
      });
    }

    // Find or create ticket
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
          title: `SMS from ${from}`,
          channel: 'sms',
          status: 'open',
          priority: 'normal',
        })
        .select()
        .single();

      if (error) throw error;
      ticketId = newTicket.id;
    }

    // Insert message
    await supabase.from('ticket_messages').insert({
      ticket_id: ticketId,
      author_type: 'customer',
      message_type: 'comment',
      content: body,
      external_sender: from,
      external_recipients: [to],
      metadata: { messageSid },
      is_internal: false,
    });

    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' }
    });
  } catch (error: any) {
    console.error('Error processing SMS:', error);
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      status: 500,
      headers: { 'Content-Type': 'text/xml' }
    });
  }
});
