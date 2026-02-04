/**
 * Marketing Automation Processor - Workflow Execution Engine for Levitate
 *
 * This function processes automation enrollments and executes steps:
 * - Evaluates step conditions
 * - Executes actions (send_email, send_sms, wait, branch, add_tag, etc.)
 * - Queues messages to marketing_send_queue
 * - Handles delays and scheduling
 * - Records execution history
 *
 * Designed to be called via cron job (e.g., every 1 minute)
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

interface AutomationRecipe {
  id: string;
  org_id: string;
  name: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  is_active: boolean;
}

interface AutomationStep {
  id: string;
  recipe_id: string;
  org_id: string;
  step_order: number;
  step_type: string;
  step_config: Record<string, unknown>;
  delay_amount: number | null;
  delay_unit: string | null;
  next_step_id: string | null;
  branch_yes_step_id: string | null;
  branch_no_step_id: string | null;
}

interface AutomationEnrollment {
  id: string;
  org_id: string;
  recipe_id: string;
  contact_id: string | null;
  account_id: string | null;
  policy_id: string | null;
  current_step_id: string | null;
  status: string;
  enrolled_at: string;
  context_data: Record<string, unknown>;
}

interface StepExecution {
  id: string;
  enrollment_id: string;
  step_id: string;
  status: string;
  scheduled_for: string;
  claimed_at: string | null;
  processor_id: string | null;
}

const PROCESSOR_ID = `automation-${crypto.randomUUID().slice(0, 8)}`;
const BATCH_SIZE = 100;
const CLAIM_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const startTime = Date.now();
  const stats = {
    executions_processed: 0,
    steps_completed: 0,
    messages_queued: 0,
    errors: 0,
    skipped: 0,
  };

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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    console.log(`🤖 [${PROCESSOR_ID}] Starting automation processor...`);

    // 1. Reclaim orphaned executions
    await reclaimOrphanedExecutions(supabase);

    // 2. Get pending step executions
    const executions = await claimPendingExecutions(supabase);

    if (executions.length === 0) {
      console.log('📭 No executions to process');
      return jsonResponse({ success: true, message: 'No executions to process', stats });
    }

    console.log(`📬 Claimed ${executions.length} executions for processing`);

    // 3. Process each execution
    for (const execution of executions) {
      try {
        stats.executions_processed++;
        const result = await processExecution(supabase, execution);

        if (result.completed) {
          stats.steps_completed++;
        }
        if (result.messagesQueued) {
          stats.messages_queued += result.messagesQueued;
        }
        if (result.skipped) {
          stats.skipped++;
        }
      } catch (error) {
        console.error(`❌ Error processing execution ${execution.id}:`, error);
        await markExecutionFailed(supabase, execution.id, error instanceof Error ? error.message : 'Unknown error');
        stats.errors++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`🎉 Automation processor complete in ${duration}ms:`, stats);

    return jsonResponse({
      success: true,
      processor_id: PROCESSOR_ID,
      duration_ms: duration,
      stats,
    });

  } catch (error) {
    console.error('❌ Fatal automation processor error:', error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function reclaimOrphanedExecutions(supabase: SupabaseClient) {
  const cutoff = new Date(Date.now() - CLAIM_TIMEOUT_MS).toISOString();

  const { data } = await supabase
    .from('marketing_automation_step_executions')
    .update({
      status: 'pending',
      processor_id: null,
      claimed_at: null,
    })
    .eq('status', 'processing')
    .lt('claimed_at', cutoff)
    .select('id');

  if (data && data.length > 0) {
    console.log(`♻️ Reclaimed ${data.length} orphaned executions`);
  }
}

async function claimPendingExecutions(supabase: SupabaseClient): Promise<StepExecution[]> {
  const now = new Date().toISOString();

  // Get pending executions that are due
  const { data: pending, error } = await supabase
    .from('marketing_automation_step_executions')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', now)
    .order('scheduled_for', { ascending: true })
    .limit(BATCH_SIZE);

  if (error || !pending || pending.length === 0) {
    return [];
  }

  // Claim them
  const ids = pending.map(e => e.id);
  await supabase
    .from('marketing_automation_step_executions')
    .update({
      status: 'processing',
      processor_id: PROCESSOR_ID,
      claimed_at: now,
    })
    .in('id', ids);

  return pending as StepExecution[];
}

async function processExecution(
  supabase: SupabaseClient,
  execution: StepExecution
): Promise<{ completed: boolean; messagesQueued: number; skipped: boolean }> {
  // Get enrollment
  const { data: enrollment } = await supabase
    .from('marketing_automation_enrollments')
    .select('*')
    .eq('id', execution.enrollment_id)
    .single();

  if (!enrollment) {
    throw new Error(`Enrollment ${execution.enrollment_id} not found`);
  }

  // Check if enrollment is still active
  if (enrollment.status !== 'active') {
    console.log(`⏭️ Enrollment ${enrollment.id} is ${enrollment.status}, skipping`);
    await markExecutionSkipped(supabase, execution.id, `Enrollment ${enrollment.status}`);
    return { completed: false, messagesQueued: 0, skipped: true };
  }

  // Get step
  const { data: step } = await supabase
    .from('marketing_automation_steps')
    .select('*')
    .eq('id', execution.step_id)
    .single();

  if (!step) {
    throw new Error(`Step ${execution.step_id} not found`);
  }

  // Get recipe
  const { data: recipe } = await supabase
    .from('marketing_automation_recipes')
    .select('*')
    .eq('id', enrollment.recipe_id)
    .single();

  if (!recipe || !recipe.is_active) {
    console.log(`⏭️ Recipe ${enrollment.recipe_id} is inactive, skipping`);
    await markExecutionSkipped(supabase, execution.id, 'Recipe inactive');
    return { completed: false, messagesQueued: 0, skipped: true };
  }

  // Execute the step
  const result = await executeStep(supabase, step, enrollment);

  // Mark execution complete
  await supabase
    .from('marketing_automation_step_executions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      result_data: result,
    })
    .eq('id', execution.id);

  // Record event
  await supabase.from('marketing_automation_events').insert({
    org_id: enrollment.org_id,
    recipe_id: enrollment.recipe_id,
    enrollment_id: enrollment.id,
    step_id: step.id,
    event_type: 'step_completed',
    event_data: result,
  });

  // Schedule next step
  await scheduleNextStep(supabase, enrollment, step, result);

  return {
    completed: true,
    messagesQueued: result.messagesQueued || 0,
    skipped: false,
  };
}

async function executeStep(
  supabase: SupabaseClient,
  step: AutomationStep,
  enrollment: AutomationEnrollment
): Promise<Record<string, unknown>> {
  const config = step.step_config || {};

  switch (step.step_type) {
    case 'send_email':
      return await executeSendEmail(supabase, step, enrollment);

    case 'send_sms':
      return await executeSendSms(supabase, step, enrollment);

    case 'wait':
      return { action: 'wait', waited: true };

    case 'branch':
      return await executeBranch(supabase, step, enrollment);

    case 'add_tag':
      return await executeAddTag(supabase, step, enrollment);

    case 'remove_tag':
      return await executeRemoveTag(supabase, step, enrollment);

    case 'update_field':
      return await executeUpdateField(supabase, step, enrollment);

    case 'create_task':
      return await executeCreateTask(supabase, step, enrollment);

    case 'send_notification':
      return await executeSendNotification(supabase, step, enrollment);

    case 'enroll_in_automation':
      return await executeEnrollInAutomation(supabase, step, enrollment);

    case 'exit':
      return await executeExit(supabase, enrollment);

    default:
      console.warn(`Unknown step type: ${step.step_type}`);
      return { action: 'unknown', step_type: step.step_type };
  }
}

async function executeSendEmail(
  supabase: SupabaseClient,
  step: AutomationStep,
  enrollment: AutomationEnrollment
): Promise<Record<string, unknown>> {
  const config = step.step_config as {
    template_id?: string;
    from_user_id?: string;
    subject?: string;
    body_html?: string;
  };

  // Get contact email
  const { data: contact } = await supabase
    .from('contacts')
    .select('email, first_name, last_name')
    .eq('id', enrollment.contact_id)
    .single();

  if (!contact?.email) {
    return { action: 'send_email', skipped: true, reason: 'No email address' };
  }

  // Get template if specified
  let subject = config.subject;
  let bodyHtml = config.body_html;
  let templateVersionId: string | null = null;

  if (config.template_id) {
    const { data: template } = await supabase
      .from('marketing_email_templates')
      .select('*, current_version:marketing_email_template_versions(*)')
      .eq('id', config.template_id)
      .single();

    if (template?.current_version) {
      subject = template.current_version.subject;
      bodyHtml = template.current_version.body_html;
      templateVersionId = template.current_version.id;
    }
  }

  // Apply merge fields
  const mergeContext = buildMergeContext(enrollment, contact);
  subject = applyMergeFields(subject || '', mergeContext);
  bodyHtml = applyMergeFields(bodyHtml || '', mergeContext);

  // Queue the email
  const idempotencyKey = `automation-${enrollment.id}-${step.id}-email`;

  const { data: queueItem, error } = await supabase
    .from('marketing_send_queue')
    .insert({
      org_id: enrollment.org_id,
      idempotency_key: idempotencyKey,
      priority: 5,
      scheduled_for: new Date().toISOString(),
      channel: 'email',
      classification: 'marketing',
      from_user_id: config.from_user_id || enrollment.context_data?.from_user_id,
      to_contact_id: enrollment.contact_id,
      to_account_id: enrollment.account_id,
      to_email: contact.email,
      source_type: 'automation',
      source_id: enrollment.recipe_id,
      automation_step_id: step.id,
      automation_enrollment_id: enrollment.id,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') { // Unique violation - idempotency
      return { action: 'send_email', skipped: true, reason: 'Already sent (idempotency)' };
    }
    throw error;
  }

  // Insert payload
  await supabase.from('marketing_send_queue_payloads').insert({
    queue_id: queueItem.id,
    org_id: enrollment.org_id,
    channel: 'email',
    email_subject: subject,
    email_body_html: bodyHtml,
    template_id: config.template_id,
    template_version_id: templateVersionId,
    merge_context: mergeContext,
  });

  return { action: 'send_email', queued: true, queue_id: queueItem.id, messagesQueued: 1 };
}

async function executeSendSms(
  supabase: SupabaseClient,
  step: AutomationStep,
  enrollment: AutomationEnrollment
): Promise<Record<string, unknown>> {
  const config = step.step_config as {
    template_id?: string;
    message?: string;
  };

  // Get contact phone
  const { data: contact } = await supabase
    .from('contacts')
    .select('phone, mobile_phone, first_name, last_name')
    .eq('id', enrollment.contact_id)
    .single();

  const phone = contact?.mobile_phone || contact?.phone;
  if (!phone) {
    return { action: 'send_sms', skipped: true, reason: 'No phone number' };
  }

  // Get template if specified
  let message = config.message;
  let templateVersionId: string | null = null;

  if (config.template_id) {
    const { data: template } = await supabase
      .from('marketing_sms_templates')
      .select('*, current_version:marketing_sms_template_versions(*)')
      .eq('id', config.template_id)
      .single();

    if (template?.current_version) {
      message = template.current_version.message_text;
      templateVersionId = template.current_version.id;
    }
  }

  // Apply merge fields
  const mergeContext = buildMergeContext(enrollment, contact);
  message = applyMergeFields(message || '', mergeContext);

  // Queue the SMS
  const idempotencyKey = `automation-${enrollment.id}-${step.id}-sms`;

  const { data: queueItem, error } = await supabase
    .from('marketing_send_queue')
    .insert({
      org_id: enrollment.org_id,
      idempotency_key: idempotencyKey,
      priority: 5,
      scheduled_for: new Date().toISOString(),
      channel: 'sms',
      classification: 'marketing',
      from_user_id: enrollment.context_data?.from_user_id,
      to_contact_id: enrollment.contact_id,
      to_account_id: enrollment.account_id,
      to_phone: phone,
      source_type: 'automation',
      source_id: enrollment.recipe_id,
      automation_step_id: step.id,
      automation_enrollment_id: enrollment.id,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { action: 'send_sms', skipped: true, reason: 'Already sent (idempotency)' };
    }
    throw error;
  }

  // Insert payload
  await supabase.from('marketing_send_queue_payloads').insert({
    queue_id: queueItem.id,
    org_id: enrollment.org_id,
    channel: 'sms',
    sms_message: message,
    template_id: config.template_id,
    template_version_id: templateVersionId,
    merge_context: mergeContext,
  });

  return { action: 'send_sms', queued: true, queue_id: queueItem.id, messagesQueued: 1 };
}

async function executeBranch(
  supabase: SupabaseClient,
  step: AutomationStep,
  enrollment: AutomationEnrollment
): Promise<Record<string, unknown>> {
  const config = step.step_config as {
    condition_type: string;
    condition_field?: string;
    condition_operator?: string;
    condition_value?: unknown;
  };

  // Evaluate condition
  const conditionMet = await evaluateCondition(supabase, config, enrollment);

  return {
    action: 'branch',
    condition_type: config.condition_type,
    condition_met: conditionMet,
    next_step: conditionMet ? step.branch_yes_step_id : step.branch_no_step_id,
  };
}

async function evaluateCondition(
  supabase: SupabaseClient,
  config: Record<string, unknown>,
  enrollment: AutomationEnrollment
): Promise<boolean> {
  const conditionType = config.condition_type as string;

  switch (conditionType) {
    case 'contact_field': {
      if (!enrollment.contact_id) return false;

      const { data: contact } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', enrollment.contact_id)
        .single();

      if (!contact) return false;

      const field = config.condition_field as string;
      const operator = config.condition_operator as string;
      const value = config.condition_value;
      const contactValue = contact[field];

      return compareValues(contactValue, operator, value);
    }

    case 'email_opened': {
      // Check if previous email was opened
      const { data: events } = await supabase
        .from('communication_events')
        .select('*')
        .eq('event_type', 'opened')
        .in('evidence_id',
          supabase
            .from('communication_evidence')
            .select('id')
            .eq('automation_enrollment_id', enrollment.id)
        )
        .limit(1);

      return events && events.length > 0;
    }

    case 'email_clicked': {
      const { data: events } = await supabase
        .from('communication_events')
        .select('*')
        .eq('event_type', 'clicked')
        .in('evidence_id',
          supabase
            .from('communication_evidence')
            .select('id')
            .eq('automation_enrollment_id', enrollment.id)
        )
        .limit(1);

      return events && events.length > 0;
    }

    case 'has_tag': {
      // Check if contact has tag (simplified - assumes tags are in contact record)
      const { data: contact } = await supabase
        .from('contacts')
        .select('tags')
        .eq('id', enrollment.contact_id)
        .single();

      const requiredTag = config.condition_value as string;
      return contact?.tags?.includes(requiredTag) ?? false;
    }

    default:
      console.warn(`Unknown condition type: ${conditionType}`);
      return false;
  }
}

function compareValues(actual: unknown, operator: string, expected: unknown): boolean {
  switch (operator) {
    case 'equals':
    case '=':
      return actual === expected;
    case 'not_equals':
    case '!=':
      return actual !== expected;
    case 'contains':
      return String(actual).toLowerCase().includes(String(expected).toLowerCase());
    case 'starts_with':
      return String(actual).toLowerCase().startsWith(String(expected).toLowerCase());
    case 'ends_with':
      return String(actual).toLowerCase().endsWith(String(expected).toLowerCase());
    case 'greater_than':
    case '>':
      return Number(actual) > Number(expected);
    case 'less_than':
    case '<':
      return Number(actual) < Number(expected);
    case 'is_empty':
      return actual === null || actual === undefined || actual === '';
    case 'is_not_empty':
      return actual !== null && actual !== undefined && actual !== '';
    default:
      return false;
  }
}

async function executeAddTag(
  supabase: SupabaseClient,
  step: AutomationStep,
  enrollment: AutomationEnrollment
): Promise<Record<string, unknown>> {
  const config = step.step_config as { tag: string };

  if (!enrollment.contact_id) {
    return { action: 'add_tag', skipped: true, reason: 'No contact' };
  }

  // Get current tags
  const { data: contact } = await supabase
    .from('contacts')
    .select('tags')
    .eq('id', enrollment.contact_id)
    .single();

  const currentTags = contact?.tags || [];
  if (!currentTags.includes(config.tag)) {
    await supabase
      .from('contacts')
      .update({ tags: [...currentTags, config.tag] })
      .eq('id', enrollment.contact_id);
  }

  return { action: 'add_tag', tag: config.tag };
}

async function executeRemoveTag(
  supabase: SupabaseClient,
  step: AutomationStep,
  enrollment: AutomationEnrollment
): Promise<Record<string, unknown>> {
  const config = step.step_config as { tag: string };

  if (!enrollment.contact_id) {
    return { action: 'remove_tag', skipped: true, reason: 'No contact' };
  }

  const { data: contact } = await supabase
    .from('contacts')
    .select('tags')
    .eq('id', enrollment.contact_id)
    .single();

  const currentTags = (contact?.tags || []).filter((t: string) => t !== config.tag);

  await supabase
    .from('contacts')
    .update({ tags: currentTags })
    .eq('id', enrollment.contact_id);

  return { action: 'remove_tag', tag: config.tag };
}

async function executeUpdateField(
  supabase: SupabaseClient,
  step: AutomationStep,
  enrollment: AutomationEnrollment
): Promise<Record<string, unknown>> {
  const config = step.step_config as { entity: string; field: string; value: unknown };

  const entityId = config.entity === 'contact' ? enrollment.contact_id :
                   config.entity === 'account' ? enrollment.account_id :
                   config.entity === 'policy' ? enrollment.policy_id : null;

  if (!entityId) {
    return { action: 'update_field', skipped: true, reason: `No ${config.entity}` };
  }

  const table = config.entity === 'contact' ? 'contacts' :
                config.entity === 'account' ? 'accounts' :
                config.entity === 'policy' ? 'policies' : null;

  if (table) {
    await supabase
      .from(table)
      .update({ [config.field]: config.value })
      .eq('id', entityId);
  }

  return { action: 'update_field', entity: config.entity, field: config.field, value: config.value };
}

async function executeCreateTask(
  supabase: SupabaseClient,
  step: AutomationStep,
  enrollment: AutomationEnrollment
): Promise<Record<string, unknown>> {
  const config = step.step_config as {
    title: string;
    description?: string;
    assigned_to?: string;
    due_days?: number;
    priority?: string;
  };

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + (config.due_days || 1));

  const { data: task, error } = await supabase
    .from('tasks')
    .insert({
      org_id: enrollment.org_id,
      title: config.title,
      description: config.description,
      assigned_to: config.assigned_to,
      due_date: dueDate.toISOString(),
      priority: config.priority || 'medium',
      status: 'pending',
      related_contact_id: enrollment.contact_id,
      related_account_id: enrollment.account_id,
      source: 'automation',
      source_id: enrollment.recipe_id,
    })
    .select('id')
    .single();

  if (error) throw error;

  return { action: 'create_task', task_id: task.id };
}

async function executeSendNotification(
  supabase: SupabaseClient,
  step: AutomationStep,
  enrollment: AutomationEnrollment
): Promise<Record<string, unknown>> {
  const config = step.step_config as {
    notify_user_id?: string;
    notify_role?: string;
    message: string;
    type?: string;
  };

  const notification = {
    org_id: enrollment.org_id,
    user_id: config.notify_user_id,
    message: applyMergeFields(config.message, { enrollment }),
    type: config.type || 'automation',
    related_id: enrollment.id,
    is_read: false,
    created_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('notifications').insert(notification);

  if (error) {
    console.warn('Failed to create notification:', error);
  }

  return { action: 'send_notification', user_id: config.notify_user_id };
}

async function executeEnrollInAutomation(
  supabase: SupabaseClient,
  step: AutomationStep,
  enrollment: AutomationEnrollment
): Promise<Record<string, unknown>> {
  const config = step.step_config as { target_recipe_id: string };

  // Check if already enrolled
  const { data: existing } = await supabase
    .from('marketing_automation_enrollments')
    .select('id')
    .eq('recipe_id', config.target_recipe_id)
    .eq('contact_id', enrollment.contact_id)
    .eq('status', 'active')
    .maybeSingle();

  if (existing) {
    return { action: 'enroll_in_automation', skipped: true, reason: 'Already enrolled' };
  }

  // Enroll in new automation
  const { error } = await supabase.rpc('enroll_in_automation', {
    p_recipe_id: config.target_recipe_id,
    p_contact_id: enrollment.contact_id,
    p_account_id: enrollment.account_id,
    p_context_data: enrollment.context_data,
    p_triggered_by: enrollment.id,
  });

  if (error) throw error;

  return { action: 'enroll_in_automation', target_recipe_id: config.target_recipe_id };
}

async function executeExit(
  supabase: SupabaseClient,
  enrollment: AutomationEnrollment
): Promise<Record<string, unknown>> {
  await supabase
    .from('marketing_automation_enrollments')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', enrollment.id);

  return { action: 'exit', completed: true };
}

async function scheduleNextStep(
  supabase: SupabaseClient,
  enrollment: AutomationEnrollment,
  currentStep: AutomationStep,
  result: Record<string, unknown>
) {
  let nextStepId: string | null = null;

  // Determine next step based on result
  if (currentStep.step_type === 'branch') {
    nextStepId = result.condition_met
      ? currentStep.branch_yes_step_id
      : currentStep.branch_no_step_id;
  } else if (currentStep.step_type === 'exit') {
    // No next step
    return;
  } else {
    nextStepId = currentStep.next_step_id;
  }

  if (!nextStepId) {
    // No more steps - complete enrollment
    await supabase
      .from('marketing_automation_enrollments')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', enrollment.id);
    return;
  }

  // Get next step to check for delay
  const { data: nextStep } = await supabase
    .from('marketing_automation_steps')
    .select('*')
    .eq('id', nextStepId)
    .single();

  if (!nextStep) {
    console.error(`Next step ${nextStepId} not found`);
    return;
  }

  // Calculate scheduled time
  let scheduledFor = new Date();

  if (nextStep.delay_amount && nextStep.delay_unit) {
    const delayMs = calculateDelayMs(nextStep.delay_amount, nextStep.delay_unit);
    scheduledFor = new Date(Date.now() + delayMs);
  }

  // Create execution record
  await supabase.from('marketing_automation_step_executions').insert({
    org_id: enrollment.org_id,
    enrollment_id: enrollment.id,
    step_id: nextStepId,
    status: 'pending',
    scheduled_for: scheduledFor.toISOString(),
  });

  // Update enrollment current step
  await supabase
    .from('marketing_automation_enrollments')
    .update({
      current_step_id: nextStepId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', enrollment.id);
}

function calculateDelayMs(amount: number, unit: string): number {
  switch (unit) {
    case 'minutes':
      return amount * 60 * 1000;
    case 'hours':
      return amount * 60 * 60 * 1000;
    case 'days':
      return amount * 24 * 60 * 60 * 1000;
    case 'weeks':
      return amount * 7 * 24 * 60 * 60 * 1000;
    default:
      return amount * 60 * 1000; // Default to minutes
  }
}

function buildMergeContext(
  enrollment: AutomationEnrollment,
  contact: Record<string, unknown> | null
): Record<string, unknown> {
  return {
    // Contact fields
    first_name: contact?.first_name || '',
    last_name: contact?.last_name || '',
    full_name: `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim(),
    email: contact?.email || '',
    phone: contact?.phone || contact?.mobile_phone || '',

    // Context from enrollment
    ...enrollment.context_data,

    // System fields
    current_date: new Date().toLocaleDateString(),
    current_year: new Date().getFullYear(),
  };
}

function applyMergeFields(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, field) => {
    return String(context[field] ?? match);
  });
}

async function markExecutionFailed(supabase: SupabaseClient, executionId: string, error: string) {
  await supabase
    .from('marketing_automation_step_executions')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: error,
    })
    .eq('id', executionId);
}

async function markExecutionSkipped(supabase: SupabaseClient, executionId: string, reason: string) {
  await supabase
    .from('marketing_automation_step_executions')
    .update({
      status: 'skipped',
      completed_at: new Date().toISOString(),
      result_data: { skipped: true, reason },
    })
    .eq('id', executionId);
}
