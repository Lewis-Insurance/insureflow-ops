import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

function xml(strings: TemplateStringsArray, ...values: any[]) {
  // Tiny helper to keep XML readable
  let out = '';
  strings.forEach((s, i) => (out += s + (values[i] ?? '')));
  return out.trim();
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse webhook params (support POST form and GET query)
    let data: Record<string, string> = {};
    try {
      const formData = await req.formData();
      for (const [k, v] of formData.entries()) data[k] = v.toString();
    } catch (_) {
      // ignore
    }
    if (Object.keys(data).length === 0) {
      const url = new URL(req.url);
      url.searchParams.forEach((v, k) => (data[k] = v));
    }

    const CallSid = data['CallSid'] || '';
    const From = data['From'] || '';
    const To = data['To'] || '';
    const CallStatus = data['CallStatus'] || '';

    // Load telephony settings (first row)
    const { data: settings, error: settingsError } = await supabase
      .from('telephony_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (settingsError) console.error('Settings error:', settingsError);

    const twilioNumber: string | undefined = settings?.twilio_phone_number || undefined;
    const forwardNumber: string | undefined = settings?.forward_number || undefined;

    // Determine direction: if call is to our Twilio number → inbound
    const direction = twilioNumber && To && To.replace(/\s/g, '') === twilioNumber.replace(/\s/g, '')
      ? 'inbound'
      : 'outbound';

    // Try to find linked contact/account
    let accountId: string | null = null;
    let contactId: string | null = null;

    if (From && From !== To) {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, account_id')
        .eq('phone', From)
        .limit(1);

      if (contacts && contacts.length > 0) {
        contactId = contacts[0].id;
        accountId = contacts[0].account_id;
      } else {
        const { data: accounts } = await supabase
          .from('accounts')
          .select('id')
          .eq('phone', From)
          .limit(1);
        if (accounts && accounts.length > 0) {
          accountId = accounts[0].id;
        }
      }
    }

    // Insert or update call session without relying on a unique index
    if (CallSid) {
      // Does a row already exist for this CallSid?
      const { data: existing, error: findErr } = await supabase
        .from('call_sessions')
        .select('id')
        .eq('twilio_call_sid', CallSid)
        .limit(1);

      if (findErr) console.error('Find call error:', findErr);

      const callPayload = {
        twilio_call_sid: CallSid,
        from_number: From,
        to_number: To,
        started_at: new Date().toISOString(),
        account_id: accountId,
        contact_id: contactId,
        disposition: CallStatus || null,
        metadata: { direction, webhook_received_at: new Date().toISOString() },
      } as const;

      if (existing && existing.length > 0) {
        const { error: updErr } = await supabase
          .from('call_sessions')
          .update(callPayload)
          .eq('twilio_call_sid', CallSid);
        if (updErr) console.error('Update call error:', updErr);
      } else {
        const { error: insErr } = await supabase
          .from('call_sessions')
          .insert(callPayload);
        if (insErr) console.error('Insert call error:', insErr);
      }
    }

    // Build TwiML safely: never dial our own Twilio number
    let twiml: string;
    if (direction === 'inbound') {
      if (forwardNumber && (!twilioNumber || forwardNumber.replace(/\s/g, '') !== twilioNumber.replace(/\s/g, ''))) {
        // Forward to configured destination (not the same as our Twilio DID)
        twiml = xml`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hello! Thank you for calling. Please hold while we connect you.</Say>
  <Dial callerId="${twilioNumber ?? ''}" timeout="30" record="record-from-answer">
    <Number>${forwardNumber}</Number>
  </Dial>
  <Say voice="alice">Sorry, no one is available to take your call right now. Please leave a message after the beep.</Say>
  <Record timeout="30" maxLength="300" action="${supabaseUrl}/functions/v1/twilio-recording-webhook" />
  <Say voice="alice">Thank you. Goodbye!</Say>
</Response>`;
      } else {
        // No forward configured → go straight to voicemail
        twiml = xml`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hello! Please leave a message after the beep.</Say>
  <Record timeout="30" maxLength="300" action="${supabaseUrl}/functions/v1/twilio-recording-webhook" />
  <Say voice="alice">Thank you. Goodbye!</Say>
</Response>`;
      }
    } else {
      // Outbound status callbacks (optional)
      twiml = xml`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <!-- Outbound call webhook received -->
</Response>`;
    }

    return new Response(twiml, {
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
    });
  } catch (err) {
    console.error('Twilio voice webhook error:', err);
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say voice="alice">We are experiencing technical difficulties. Please try again later.</Say>\n</Response>`;
    return new Response(errorTwiml, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/xml' } });
  }
});
