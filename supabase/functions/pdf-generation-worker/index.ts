// ============================================
// PDF Generation Worker Edge Function
// Processes background PDF generation jobs
// ============================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1';

// ============================================
// TYPES
// ============================================

interface GenerationJob {
  id: string;
  form_ids: string[];
  job_type: 'generate' | 'regenerate' | 'package';
  status: string;
  current_form_id?: string;
  progress_percent: number;
  result_urls: string[];
  attempt_count: number;
  max_attempts: number;
}

interface AcordForm {
  id: string;
  template_id: string;
  field_values: Record<string, any>;
  account_id: string;
}

interface AcordTemplate {
  id: string;
  form_number: string;
  form_name: string;
  pdf_template_url: string;
  field_inventory: any[];
}

import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  try {
    // Require cron secret for scheduled/worker execution
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedSecret = Deno.env.get('CRON_SECRET');
    if (!expectedSecret) {
      console.error('CRON_SECRET not configured - rejecting request');
      return new Response(
        JSON.stringify({ error: 'Cron authentication not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!cronSecret || cronSecret !== expectedSecret) {
      console.error('Unauthorized: Invalid or missing CRON_SECRET');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request
    const { action, jobId, workerId } = await req.json();

    switch (action) {
      case 'process_job':
        return await processJob(supabase, jobId);

      case 'claim_next':
        return await claimNextJob(supabase, workerId);

      case 'process_queue':
        return await processQueue(supabase);

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('Worker error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// ============================================
// JOB PROCESSING
// ============================================

async function processJob(supabase: any, jobId: string): Promise<Response> {
  console.log(`Processing job: ${jobId}`);

  // Get job
  const { data: job, error: jobError } = await supabase
    .from('acord_generation_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (jobError || !job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  // Check if job is already complete or cancelled
  if (['complete', 'cancelled', 'failed'].includes(job.status)) {
    return new Response(
      JSON.stringify({ message: 'Job already completed or cancelled' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Update job to processing
  await supabase
    .from('acord_generation_jobs')
    .update({
      status: 'processing',
      started_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  const resultUrls: string[] = [...(job.result_urls || [])];
  const formIds: string[] = job.form_ids || [];
  let currentIndex = resultUrls.length;

  try {
    // Process each form
    for (let i = currentIndex; i < formIds.length; i++) {
      const formId = formIds[i];
      console.log(`Processing form ${i + 1}/${formIds.length}: ${formId}`);

      // Update progress
      await supabase
        .from('acord_generation_jobs')
        .update({
          current_form_id: formId,
          progress_percent: Math.round(((i + 0.5) / formIds.length) * 100),
        })
        .eq('id', jobId);

      // Generate PDF for this form
      const pdfUrl = await generateFormPdf(supabase, formId);

      if (pdfUrl) {
        resultUrls.push(pdfUrl);

        // Update form with PDF URL
        await supabase
          .from('acord_forms')
          .update({
            pdf_url: pdfUrl,
            pdf_generated_at: new Date().toISOString(),
          })
          .eq('id', formId);
      }

      // Update job with partial results
      await supabase
        .from('acord_generation_jobs')
        .update({
          result_urls: resultUrls,
          progress_percent: Math.round(((i + 1) / formIds.length) * 100),
        })
        .eq('id', jobId);
    }

    // Mark job as complete
    await supabase
      .from('acord_generation_jobs')
      .update({
        status: 'complete',
        progress_percent: 100,
        result_urls: resultUrls,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    console.log(`Job ${jobId} completed with ${resultUrls.length} PDFs`);

    return new Response(
      JSON.stringify({
        success: true,
        jobId,
        resultUrls,
        formsProcessed: formIds.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`Job ${jobId} failed:`, error);

    // Check if should retry
    const shouldRetry = job.attempt_count < job.max_attempts;

    await supabase
      .from('acord_generation_jobs')
      .update({
        status: shouldRetry ? 'queued' : 'failed',
        error_message: error.message,
        attempt_count: job.attempt_count + 1,
        next_attempt_at: shouldRetry
          ? new Date(Date.now() + 5000).toISOString()
          : null,
        completed_at: shouldRetry ? null : new Date().toISOString(),
      })
      .eq('id', jobId);

    throw error;
  }
}

// ============================================
// PDF GENERATION
// ============================================

async function generateFormPdf(supabase: any, formId: string): Promise<string | null> {
  // Get form with template
  const { data: form, error: formError } = await supabase
    .from('acord_forms')
    .select(`
      *,
      template:template_id(*)
    `)
    .eq('id', formId)
    .single();

  if (formError || !form) {
    console.error(`Form not found: ${formId}`);
    return null;
  }

  const template = form.template as AcordTemplate;
  const fieldValues = form.field_values || {};

  // Download template PDF
  const templateUrl = template.pdf_template_url;
  if (!templateUrl) {
    console.error(`No template URL for form: ${formId}`);
    return null;
  }

  try {
    // Fetch template PDF
    const templateResponse = await fetch(templateUrl);
    if (!templateResponse.ok) {
      throw new Error(`Failed to fetch template: ${templateResponse.status}`);
    }

    const templateBytes = await templateResponse.arrayBuffer();
    const pdfDoc = await PDFDocument.load(templateBytes);

    // Get form fields
    const pdfForm = pdfDoc.getForm();
    const fields = pdfForm.getFields();

    console.log(`Template has ${fields.length} fields`);

    // Fill fields
    let filledCount = 0;
    for (const field of fields) {
      const fieldName = field.getName();
      const value = fieldValues[fieldName];

      if (value === undefined || value === null) continue;

      try {
        const fieldType = field.constructor.name;

        switch (fieldType) {
          case 'PDFTextField':
            const textField = pdfForm.getTextField(fieldName);
            textField.setText(String(value));
            filledCount++;
            break;

          case 'PDFCheckBox':
            const checkBox = pdfForm.getCheckBox(fieldName);
            if (value === true || value === 'true' || value === '1' || value === 'Yes') {
              checkBox.check();
            } else {
              checkBox.uncheck();
            }
            filledCount++;
            break;

          case 'PDFDropdown':
            const dropdown = pdfForm.getDropdown(fieldName);
            dropdown.select(String(value));
            filledCount++;
            break;

          case 'PDFRadioGroup':
            const radioGroup = pdfForm.getRadioGroup(fieldName);
            radioGroup.select(String(value));
            filledCount++;
            break;
        }
      } catch (fieldError) {
        console.warn(`Failed to fill field ${fieldName}:`, fieldError);
      }
    }

    console.log(`Filled ${filledCount} fields`);

    // Flatten the form
    pdfForm.flatten();

    // Save the PDF
    const pdfBytes = await pdfDoc.save();

    // Upload to storage
    const fileName = `generated/${form.account_id}/${template.form_number}_${formId}_${Date.now()}.pdf`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('acord-forms')
      .upload(fileName, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('acord-forms')
      .getPublicUrl(fileName);

    console.log(`PDF generated and uploaded: ${urlData.publicUrl}`);

    return urlData.publicUrl;
  } catch (error) {
    console.error(`Failed to generate PDF for form ${formId}:`, error);
    return null;
  }
}

// ============================================
// QUEUE MANAGEMENT
// ============================================

async function claimNextJob(supabase: any, workerId: string): Promise<Response> {
  // Find next queued job
  const { data: job, error } = await supabase
    .from('acord_generation_jobs')
    .select('*')
    .eq('status', 'queued')
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (error || !job) {
    return new Response(
      JSON.stringify({ message: 'No jobs available' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Claim the job
  const { error: updateError } = await supabase
    .from('acord_generation_jobs')
    .update({
      status: 'processing',
      started_at: new Date().toISOString(),
    })
    .eq('id', job.id)
    .eq('status', 'queued');

  if (updateError) {
    return new Response(
      JSON.stringify({ message: 'Failed to claim job, may have been claimed by another worker' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ job }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function processQueue(supabase: any): Promise<Response> {
  // Get all queued jobs
  const { data: jobs, error } = await supabase
    .from('acord_generation_jobs')
    .select('id')
    .eq('status', 'queued')
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`)
    .order('created_at', { ascending: true })
    .limit(5);

  if (error || !jobs || jobs.length === 0) {
    return new Response(
      JSON.stringify({ message: 'No jobs in queue', processed: 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const results: { jobId: string; success: boolean; error?: string }[] = [];

  for (const job of jobs) {
    try {
      await processJob(supabase, job.id);
      results.push({ jobId: job.id, success: true });
    } catch (error) {
      results.push({ jobId: job.id, success: false, error: error.message });
    }
  }

  return new Response(
    JSON.stringify({
      processed: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
