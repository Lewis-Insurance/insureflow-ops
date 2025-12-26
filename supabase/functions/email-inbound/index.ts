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

    async function putAndSign(path: string, bytes: Uint8Array, type: string) {
      const { error: upErr } = await supabase.storage.from('ticket-attachments').upload(path, bytes, { contentType: type, upsert: true });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage.from('ticket-attachments').createSignedUrl(path, 60 * 60);
      return signed?.signedUrl || '';
    }

    // SECURITY: Verify webhook secret - fail closed if not configured
    const providedSecret = req.headers.get('x-parse-secret');
    if (!parseSecret) {
      console.error('INBOUND_PARSE_SECRET not configured - rejecting request');
      return new Response('Server configuration error', { status: 500 });
    }
    if (providedSecret !== parseSecret) {
      console.error('Invalid parse secret - rejecting request');
      return new Response('Unauthorized', { status: 401 });
    }

    const payload = await req.json();
    const { from, to, subject, text, html, messageId, inReplyTo } = payload;

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

    // Parse attachments
    let attachments: any[] = [];
    if (Array.isArray(payload.attachments)) {
      for (const a of payload.attachments) {
        const b64 = String(a.contentBase64 || '');
        if (!b64) continue;
        try {
          const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
          const key = `email/${crypto.randomUUID()}-${a.name || 'file'}`;
          const url = await putAndSign(key, bytes, a.type || 'application/octet-stream');
          attachments.push({ name: a.name, type: a.type, size: bytes.byteLength, url, expiresIn: 3600 });
        } catch (e) {
          console.error('Failed to process attachment:', e);
        }
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
        attachments,
      });

    if (msgError) throw msgError;

    return new Response(
      JSON.stringify({ success: true, ticketId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error processing inbound email:', error);
    return new Response(
      JSON.stringify({ error: (error instanceof Error ? error.message : String(error)) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
