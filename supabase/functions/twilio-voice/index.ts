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
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    const formData = await req.formData();
    
    const from = formData.get('From') as string;
    const to = formData.get('To') as string;
    const callSid = formData.get('CallSid') as string;
    const callStatus = formData.get('CallStatus') as string;

    console.log('Inbound call from:', from, 'Status:', callStatus);

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
