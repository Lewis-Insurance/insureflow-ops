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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Claim jobs to process
    const { data: jobs, error: claimError } = await supabaseClient.rpc('claim_jobs_for_worker', {
      p_batch_size: 5
    });

    if (claimError) {
      console.error('Error claiming jobs:', claimError);
      return new Response(
        JSON.stringify({ error: claimError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No jobs to process', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${jobs.length} jobs`);

    // Process each job
    const results = await Promise.allSettled(
      jobs.map((job: any) => processJob(supabaseClient, job))
    );

    const processed = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    return new Response(
      JSON.stringify({ processed, failed, total: jobs.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('worker-comparison error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function processJob(supabase: any, job: any) {
  const jobId = job.id;
  
  try {
    // Log start event
    await logEvent(supabase, jobId, 'processing_started', 'Starting document extraction and comparison');

    const { option1_paths, option2_paths } = job.input_data;

    // Step 1: Extract option 1
    await logEvent(supabase, jobId, 'extracting_option1', 'Extracting data from option 1 documents');
    const option1Data = await analyzeDocuments(supabase, option1_paths);

    // Step 2: Extract option 2
    await logEvent(supabase, jobId, 'extracting_option2', 'Extracting data from option 2 documents');
    const option2Data = await analyzeDocuments(supabase, option2_paths);

    // Step 3: Compare options
    await logEvent(supabase, jobId, 'comparing', 'Comparing insurance options');
    const comparisonResult = await compareOptions(supabase, option1Data, option2Data);

    // Step 4: Save comparison session
    await logEvent(supabase, jobId, 'saving_results', 'Saving comparison results');
    const { data: session, error: sessionError } = await supabase
      .from('comparison_sessions')
      .insert({
        account_id: job.account_id,
        created_by: job.created_by,
        option1_data: option1Data,
        option2_data: option2Data,
        comparison_results: comparisonResult,
        status: 'completed',
      })
      .select()
      .single();

    if (sessionError) throw sessionError;

    // Update job as succeeded
    await supabase
      .from('jobs')
      .update({
        status: 'succeeded',
        completed_at: new Date().toISOString(),
        result_session_id: session.id,
        result_data: {
          summary: comparisonResult.recommendation,
          premium_difference: comparisonResult.differences?.premiumDifference,
        },
      })
      .eq('id', jobId);

    await logEvent(supabase, jobId, 'completed', 'Comparison completed successfully', {
      session_id: session.id,
    });

    console.log(`Job ${jobId} completed successfully`);
  } catch (error) {
    console.error(`Job ${jobId} failed:`, error);
    
    const errorMessage = (error as Error).message;
    
    // Update job as failed
    await supabase
      .from('jobs')
      .update({
        status: job.attempts >= job.max_attempts ? 'failed' : 'queued',
        error_message: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    await logEvent(supabase, jobId, 'error', `Error: ${errorMessage}`, { error: errorMessage });
    
    throw error;
  }
}

async function analyzeDocuments(supabase: any, documentPaths: string[]) {
  const { data, error } = await supabase.functions.invoke('ai-document-analysis', {
    body: {
      action: 'analyze',
      type: 'insurance_extraction',
      analysisType: 'policy',
      documentPaths,
    },
  });

  if (error) throw new Error(`Document analysis failed: ${error.message}`);
  return data?.extracted || data;
}

async function compareOptions(supabase: any, option1: any, option2: any) {
  const { data, error } = await supabase.functions.invoke('compare-insurance-options', {
    body: { option1, option2 },
  });

  if (error) throw new Error(`Comparison failed: ${error.message}`);
  return data;
}

async function logEvent(supabase: any, jobId: string, eventType: string, message: string, details?: any) {
  await supabase.from('job_events').insert({
    job_id: jobId,
    event_type: eventType,
    message,
    details: details || null,
  });
}