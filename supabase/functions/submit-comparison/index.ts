import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get the user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const {
      workspaceId,
      accountId,
      title,
      option1Paths,
      option2Paths,
      metadata = {}
    } = await req.json();

    if (!workspaceId || !option1Paths || !option2Paths) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: workspaceId, option1Paths, option2Paths' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create the job
    const { data: job, error: jobError } = await supabaseClient
      .from('jobs')
      .insert({
        workspace_id: workspaceId,
        account_id: accountId,
        job_type: 'comparison',
        status: 'queued',
        title: title || 'Insurance Quote Comparison',
        created_by: user.id,
        input_data: {
          option1_paths: option1Paths,
          option2_paths: option2Paths,
        },
        metadata,
      })
      .select()
      .single();

    if (jobError) {
      console.error('Error creating job:', jobError);
      return new Response(
        JSON.stringify({ error: jobError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log initial event
    await supabaseClient
      .from('job_events')
      .insert({
        job_id: job.id,
        event_type: 'queued',
        message: 'Job queued for processing',
      });

    // Fire-and-forget: nudge the worker to start processing
    try {
      // Do not await – start in background
      supabaseClient.functions
        .invoke('worker-comparison', { body: { source: 'submit-comparison', jobId: job.id } })
        .catch((e) => console.warn('worker-comparison invoke failed (non-blocking):', e?.message || e));
    } catch (e) {
      console.warn('worker-comparison kick-off error:', (e as Error).message);
    }

    return new Response(
      JSON.stringify({ job }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('submit-comparison error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});