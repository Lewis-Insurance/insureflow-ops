import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const webhookSecret = Deno.env.get('TWILIO_SMS_WEBHOOK_SECRET');
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify Twilio signature if secret configured
    if (webhookSecret) {
      const twilioSignature = req.headers.get('x-twilio-signature');
      // Add signature validation logic here
    }

    const formData = await req.formData();
    const from = formData.get('From') as string;
    const to = formData.get('To') as string;
    const body = formData.get('Body') as string;
    const messageSid = formData.get('MessageSid') as string;

    console.log('Inbound SMS from:', from);

    // Check allowlist
    const { data: allowed } = await supabase
      .from('inbound_allowlist')
      .select('*')
      .eq('channel', 'sms')
      .eq('value', from)
      .single();

    if (!allowed) {
      console.log('SMS not in allowlist:', from);
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
