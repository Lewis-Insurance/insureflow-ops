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
    const provider = Deno.env.get('EMAIL_PROVIDER') || 'postmark';
    const apiKey = Deno.env.get('EMAIL_PROVIDER_API_KEY')!;
    const fromEmail = Deno.env.get('OUTBOUND_FROM')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { ticketId, to, subject, body, inReplyTo } = await req.json();

    let response;
    
    if (provider === 'postmark') {
      response = await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Postmark-Server-Token': apiKey,
        },
        body: JSON.stringify({
          From: fromEmail,
          To: to,
          Subject: subject,
          HtmlBody: body,
          InReplyTo: inReplyTo,
          MessageStream: 'outbound',
        }),
      });
    } else if (provider === 'sendgrid') {
      response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: fromEmail },
          subject,
          content: [{ type: 'text/html', value: body }],
        }),
      });
    }

    const result = await response!.json();
    const messageId = provider === 'postmark' ? result.MessageID : result.id;

    // Log message in database
    if (ticketId) {
      await supabase.from('ticket_messages').insert({
        ticket_id: ticketId,
        author_type: 'agent',
        message_type: 'email',
        content: body,
        external_recipients: [to],
        email_message_id: messageId,
        email_in_reply_to: inReplyTo,
        is_internal: false,
      });
    }

    return new Response(
      JSON.stringify({ success: true, messageId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error sending email:', error);
    return new Response(
      JSON.stringify({ error: (error instanceof Error ? error.message : String(error)) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
