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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Twilio recording webhook called');

    // Parse form data from Twilio
    const formData = await req.formData();
    const webhookData: Record<string, string> = {};
    
    for (const [key, value] of formData.entries()) {
      webhookData[key] = value.toString();
    }

    console.log('Recording webhook data:', webhookData);

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