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
    const parseSecret = Deno.env.get('INBOUND_PARSE_SECRET');
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify webhook secret if configured
    const providedSecret = req.headers.get('x-parse-secret');
    if (parseSecret && providedSecret !== parseSecret) {
      return new Response('Unauthorized', { status: 401 });
    }

    const payload = await req.json();
    const { from, to, subject, text, html, messageId, inReplyTo } = payload;

    console.log('Inbound email from:', from);

    // Check allowlist
    const { data: allowedDomain } = await supabase
      .from('inbound_allowlist')
      .select('*')
      .eq('channel', 'email')
      .or(`value.eq.${from},value.eq.${from.split('@')[1]}`)
      .single();

    if (!allowedDomain) {
      console.log('Email not in allowlist:', from);
      return new Response('Not allowed', { status: 403 });
    }

    // Find or create ticket
    let ticketId: string;
    
    if (inReplyTo) {
      // Try to find existing ticket by email thread
      const { data: existingMsg } = await supabase
        .from('ticket_messages')
        .select('ticket_id')
        .eq('email_message_id', inReplyTo)
        .single();
      
      if (existingMsg) {
        ticketId = existingMsg.ticket_id;
      }
    }

    if (!ticketId!) {
      // Find recent open ticket from this sender
      const { data: recentTicket } = await supabase.rpc(
        'find_recent_ticket_by_sender',
        { p_sender: from }
      );

      if (recentTicket) {
        ticketId = recentTicket.id;
      } else {
        // Create new ticket
        const { data: newTicket, error } = await supabase
          .from('tickets')
          .insert({
            title: subject || 'Email inquiry',
            channel: 'email',
            status: 'open',
            priority: 'normal',
          })
          .select()
          .single();

        if (error) throw error;
        ticketId = newTicket.id;
      }
    }

    // Insert message
    const { error: msgError } = await supabase
      .from('ticket_messages')
      .insert({
        ticket_id: ticketId,
        author_type: 'customer',
        message_type: 'email',
        content: text || html,
        external_sender: from,
        external_recipients: [to],
        email_message_id: messageId,
        email_in_reply_to: inReplyTo,
        is_internal: false,
      });

    if (msgError) throw msgError;

    return new Response(
      JSON.stringify({ success: true, ticketId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error processing inbound email:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
