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

interface TwilioVoiceWebhook {
  CallSid: string;
  From: string;
  To: string;
  CallStatus: string;
  Direction: string;
  AccountSid?: string;
  CallerName?: string;
  CallerCity?: string;
  CallerState?: string;
  CallerZip?: string;
  CallerCountry?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Twilio voice webhook called:', req.method);

    // Parse form data from Twilio
    const formData = await req.formData();
    const webhookData: Partial<TwilioVoiceWebhook> = {};
    
    for (const [key, value] of formData.entries()) {
      webhookData[key as keyof TwilioVoiceWebhook] = value.toString();
    }

    console.log('Webhook data:', webhookData);

    const { CallSid, From, To, CallStatus, Direction } = webhookData;

    // Find or create contact/account based on phone number
    let accountId = null;
    let contactId = null;

    if (From && From !== To) {
      // First try to find existing contact
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, account_id')
        .eq('phone', From)
        .limit(1);

      if (contacts && contacts.length > 0) {
        contactId = contacts[0].id;
        accountId = contacts[0].account_id;
      } else {
        // Try to find account by phone
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

    // Create or update call session
    if (CallSid) {
      const callData = {
        twilio_call_sid: CallSid,
        from_number: From || '',
        to_number: To || '',
        started_at: new Date().toISOString(),
        account_id: accountId,
        contact_id: contactId,
        disposition: CallStatus,
        metadata: {
          direction: Direction,
          caller_name: webhookData.CallerName,
          caller_city: webhookData.CallerCity,
          caller_state: webhookData.CallerState,
          caller_country: webhookData.CallerCountry,
          webhook_received_at: new Date().toISOString()
        }
      };

      const { error: callError } = await supabase
        .from('call_sessions')
        .upsert(callData, { 
          onConflict: 'twilio_call_sid',
          ignoreDuplicates: false 
        });

      if (callError) {
        console.error('Error saving call session:', callError);
      } else {
        console.log('Call session saved successfully');
      }
    }

    // Generate TwiML response based on call direction and status
    let twimlResponse = '';

    if (Direction === 'inbound') {
      // Handle incoming call
      twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">Hello! Thank you for calling Lewis Insurance. Please hold while we connect you to an agent.</Say>
    <Dial timeout="30" record="record-from-ringing">
        <Number>+13864879494</Number>
    </Dial>
    <Say voice="alice">Sorry, no one is available to take your call right now. Please leave a message after the beep.</Say>
    <Record timeout="30" maxLength="300" action="${supabaseUrl}/functions/v1/twilio-recording-webhook" />
    <Say voice="alice">Thank you for your message. We will get back to you soon. Goodbye!</Say>
</Response>`;
    } else {
      // Handle outbound call status updates
      twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <!-- Outbound call status update received -->
</Response>`;
    }

    console.log('Sending TwiML response:', twimlResponse);

    return new Response(twimlResponse, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/xml',
      },
    });

  } catch (error) {
    console.error('Error in Twilio voice webhook:', error);
    
    // Return a basic TwiML response even on error
    const errorResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">We're sorry, but we're experiencing technical difficulties. Please try calling back later.</Say>
</Response>`;

    return new Response(errorResponse, {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/xml',
      },
    });
  }
});