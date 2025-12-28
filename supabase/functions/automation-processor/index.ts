/**
 * AUTOMATION PROCESSOR
 *
 * Core engine for the Marketing Automation system.
 * Runs on a schedule (every 5 minutes) to:
 * 1. Find contacts/leads matching workflow triggers
 * 2. Create executions for new matches
 * 3. Execute scheduled stages
 * 4. Handle retries and failures
 * 5. Update engagement metrics
 *
 * Actions supported:
 * - process_triggers: Find and enroll new contacts in workflows (SCHEDULED)
 * - execute_stages: Execute scheduled stage actions (SCHEDULED)
 * - check_goals: Check if any executions have achieved their goals (SCHEDULED)
 * - cleanup: Archive old executions, update stats (SCHEDULED)
 * - process_event: Handle incoming events (opens, clicks, replies) (INTERNAL)
 * - enroll_contact: Manually enroll a contact (USER)
 * - stop_execution: Stop a running workflow (USER)
 *
 * SECURITY:
 * - SCHEDULED actions require X-Cron-Secret header (verified against CRON_SECRET env var)
 * - USER actions require JWT auth and agency membership verification
 * - INTERNAL actions (process_event) are called by tracking pixels/webhooks
 *
 * The cron secret prevents public access to scheduled actions even with the anon key.
 * Secret is stored in Supabase Vault and injected by pg_cron via X-Cron-Secret header.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createLogger } from '../_shared/logger.ts';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { ValidationError, AuthenticationError, AuthorizationError, createErrorResponse } from '../_shared/error-handler.ts';
import { requireAgencyAuth, verifyAgencyMembership, AgencyAuthenticatedUser } from '../_shared/agency-auth.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';

const logger = createLogger('automation-processor');

interface WorkflowTriggerMatch {
  workflow_id: string;
  contact_id?: string;
  account_id?: string;
  lead_id?: string;
  context_data: Record<string, unknown>;
}

interface StageExecution {
  id: string;
  execution_id: string;
  stage_id: string;
  scheduled_at: string;
  stage: {
    id: string;
    workflow_id: string;
    stage_number: number;
    name: string;
    action_type: string;
    action_config: Record<string, unknown>;
    stop_on_reply: boolean;
    stop_on_click: boolean;
    stop_on_unsubscribe: boolean;
    stop_on_goal: boolean;
  };
  execution: {
    id: string;
    workflow_id: string;
    contact_id?: string;
    account_id?: string;
    lead_id?: string;
    context_data: Record<string, unknown>;
    agency_workspace_id: string;
    contact?: Record<string, unknown>;
    account?: Record<string, unknown>;
  };
}

// Actions that require user authentication and agency membership
const USER_ACTIONS = ['enroll_contact', 'stop_execution'];

// Actions that run on schedule (service role only, no user auth)
const SCHEDULED_ACTIONS = ['process_triggers', 'execute_stages', 'check_goals', 'cleanup'];

// Internal actions (tracking events, etc.)
const INTERNAL_ACTIONS = ['process_event'];

// Feature flags for stage action types
// Actions that are not yet implemented or require additional integrations
const FEATURE_FLAGS: Record<string, boolean> = {
  // Fully supported actions
  email: true,
  sms: true,
  task: true,
  internal_notification: true,
  tag_add: true,
  tag_remove: true,
  field_update: true,
  webhook: true,
  wait_for_event: true,
  pipeline_move: true,

  // NOT YET IMPLEMENTED - require third-party integrations
  postcard: false,   // Requires Lob.com or similar direct mail API
  voicemail: false,  // Requires Twilio Voicemail Drop or similar
  ringless_voicemail: false,  // Same as voicemail
  direct_mail: false,  // Same as postcard
};

/**
 * Check if an action type is supported/enabled
 */
function isActionEnabled(actionType: string): boolean {
  // If not in the feature flags, default to false (conservative)
  return FEATURE_FLAGS[actionType] ?? false;
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return handleCors(req);
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { action, ...params } = await req.json();

    logger.info('Processing automation action', { action });

    let result;
    let user: AgencyAuthenticatedUser | null = null;

    // Verify authentication based on action type
    if (SCHEDULED_ACTIONS.includes(action)) {
      // Scheduled actions require cron secret (prevents public access)
      const cronError = verifyCronSecret(req);
      if (cronError) {
        logger.warn('Cron secret verification failed for scheduled action', { action });
        return cronError;
      }
      logger.info('Cron secret verified for scheduled action', { action });
    } else if (USER_ACTIONS.includes(action)) {
      // User actions require JWT auth and agency membership
      const authResult = await requireAgencyAuth(req, supabase, corsHeaders);

      // If authResult is a Response, return it (auth failed)
      if (authResult instanceof Response) {
        return authResult;
      }

      user = authResult;
      logger.info('User authenticated for action', { userId: user.id, action });
    }
    // INTERNAL_ACTIONS (process_event) - no auth required, typically called internally

    switch (action) {
      // SCHEDULED ACTIONS (require cron secret - called by pg_cron)
      case 'process_triggers':
        result = await processTriggers(supabase);
        break;

      case 'execute_stages':
        result = await executeScheduledStages(supabase);
        break;

      case 'check_goals':
        result = await checkGoals(supabase);
        break;

      case 'cleanup':
        result = await cleanupOldExecutions(supabase);
        break;

      // INTERNAL ACTIONS (tracking pixels, webhooks)
      case 'process_event':
        result = await processEvent(supabase, params);
        break;

      // USER ACTIONS (require auth + agency membership)
      case 'enroll_contact':
        result = await enrollContactSecure(supabase, params, user!);
        break;

      case 'stop_execution':
        result = await stopExecutionSecure(supabase, params, user!);
        break;

      default:
        throw new ValidationError(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Automation processor error', { error: error.message });
    return createErrorResponse(error, corsHeaders);
  }
});

// ============================================================================
// TRIGGER PROCESSING
// ============================================================================

async function processTriggers(supabase: SupabaseClient) {
  logger.info('Processing workflow triggers');

  // Get all active workflows
  const { data: workflows, error: workflowError } = await supabase
    .from('automation_workflows')
    .select('*')
    .eq('status', 'active');

  if (workflowError) throw workflowError;

  let totalTriggered = 0;
  const results: Record<string, number> = {};

  for (const workflow of workflows || []) {
    try {
      const matches = await findTriggerMatches(supabase, workflow);
      let workflowTriggered = 0;

      for (const match of matches) {
        const enrolled = await tryEnrollInWorkflow(supabase, workflow, match);
        if (enrolled) {
          workflowTriggered++;
          totalTriggered++;
        }
      }

      results[workflow.name] = workflowTriggered;
    } catch (err) {
      logger.error('Error processing workflow triggers', {
        workflowId: workflow.id,
        error: err.message,
      });
    }
  }

  logger.info('Trigger processing complete', { totalTriggered, results });
  return { triggered: totalTriggered, byWorkflow: results };
}

async function findTriggerMatches(
  supabase: SupabaseClient,
  workflow: Record<string, unknown>
): Promise<WorkflowTriggerMatch[]> {
  const matches: WorkflowTriggerMatch[] = [];
  const config = workflow.trigger_config as Record<string, unknown>;
  const triggerType = workflow.trigger_type as string;
  const workflowType = workflow.workflow_type as string;

  switch (triggerType) {
    case 'date_based':
      return await findDateBasedMatches(supabase, workflow, config, workflowType);

    case 'event_based':
      // Event-based triggers are handled by process_event action
      return [];

    case 'segment_entry':
      return await findSegmentMatches(supabase, workflow, config);

    case 'pipeline_stage':
      // Pipeline triggers are handled by pipeline webhooks
      return [];

    case 'manual':
      // Manual triggers are handled by enroll_contact action
      return [];
  }

  return matches;
}

async function findDateBasedMatches(
  supabase: SupabaseClient,
  workflow: Record<string, unknown>,
  config: Record<string, unknown>,
  workflowType: string
): Promise<WorkflowTriggerMatch[]> {
  const matches: WorkflowTriggerMatch[] = [];
  const field = config.field as string;
  const offsetDays = (config.offset_days as number) || 0;
  const sourceTable = (config.source_table as string) || 'contacts';
  const agencyId = workflow.agency_workspace_id as string;

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + offsetDays);

  // Handle birthday triggers (match month and day)
  if (workflowType === 'birthday' && field === 'date_of_birth') {
    const month = targetDate.getMonth() + 1;
    const day = targetDate.getDate();

    const { data: contacts } = await supabase
      .from('contacts')
      .select(`
        id,
        account_id,
        first_name,
        last_name,
        email,
        phone,
        date_of_birth,
        account:accounts!inner(
          id,
          agency_workspace_id,
          assigned_to
        )
      `)
      .not('date_of_birth', 'is', null)
      .eq('account.agency_workspace_id', agencyId);

    for (const contact of contacts || []) {
      const dob = new Date(contact.date_of_birth);
      if (dob.getMonth() + 1 === month && dob.getDate() === day) {
        matches.push({
          workflow_id: workflow.id as string,
          contact_id: contact.id,
          account_id: contact.account_id,
          context_data: { contact, account: contact.account },
        });
      }
    }
  }

  // Handle policy renewal triggers
  if (workflowType === 'policy_renewal' && field === 'expiration_date') {
    const dateStr = targetDate.toISOString().split('T')[0];

    const { data: policies } = await supabase
      .from('policies')
      .select(`
        *,
        account:accounts!inner(
          *,
          agency_workspace_id,
          contacts(*)
        )
      `)
      .eq('expiration_date', dateStr)
      .eq('status', 'active')
      .eq('account.agency_workspace_id', agencyId);

    for (const policy of policies || []) {
      const contact = policy.account?.contacts?.[0];
      if (contact) {
        matches.push({
          workflow_id: workflow.id as string,
          contact_id: contact.id,
          account_id: policy.account_id,
          context_data: {
            policy,
            contact,
            account: policy.account,
          },
        });
      }
    }
  }

  // Handle turning 65 (Medicare eligibility)
  if (workflowType === 'turning_65' && field === 'date_of_birth') {
    const targetBirthYear = targetDate.getFullYear() - 65;
    const offsetMonths = (config.offset_months as number) || -3;

    const eligibilityDate = new Date(targetDate);
    eligibilityDate.setMonth(eligibilityDate.getMonth() - offsetMonths);

    const { data: contacts } = await supabase
      .from('contacts')
      .select(`
        id,
        account_id,
        first_name,
        last_name,
        email,
        phone,
        date_of_birth,
        account:accounts!inner(
          id,
          agency_workspace_id,
          assigned_to
        )
      `)
      .not('date_of_birth', 'is', null)
      .eq('account.agency_workspace_id', agencyId);

    for (const contact of contacts || []) {
      const dob = new Date(contact.date_of_birth);
      const turnsAge = new Date(dob);
      turnsAge.setFullYear(dob.getFullYear() + 65);

      // Check if they turn 65 within the offset window
      const daysDiff = Math.floor(
        (turnsAge.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysDiff === Math.abs(offsetMonths) * 30) {
        matches.push({
          workflow_id: workflow.id as string,
          contact_id: contact.id,
          account_id: contact.account_id,
          context_data: { contact, account: contact.account },
        });
      }
    }
  }

  // Apply filters
  const filterConfig = workflow.filter_config as Record<string, unknown>;
  return matches.filter((match) => matchesFilters(match, filterConfig));
}

async function findSegmentMatches(
  supabase: SupabaseClient,
  workflow: Record<string, unknown>,
  config: Record<string, unknown>
): Promise<WorkflowTriggerMatch[]> {
  const matches: WorkflowTriggerMatch[] = [];
  const criteria = config.segment_criteria as Record<string, unknown>;
  const agencyId = workflow.agency_workspace_id as string;

  // Example: Cross-sell (has auto, no home)
  if (criteria?.has_auto === true && criteria?.has_home === false) {
    const { data: accounts } = await supabase
      .from('accounts')
      .select(`
        id,
        name,
        agency_workspace_id,
        contacts(*),
        policies(policy_type, status)
      `)
      .eq('agency_workspace_id', agencyId);

    for (const account of accounts || []) {
      const policies = account.policies || [];
      const hasAuto = policies.some(
        (p: Record<string, unknown>) =>
          p.policy_type === 'auto' && p.status === 'active'
      );
      const hasHome = policies.some(
        (p: Record<string, unknown>) =>
          (p.policy_type === 'home' || p.policy_type === 'homeowners') &&
          p.status === 'active'
      );

      if (hasAuto && !hasHome) {
        const contact = account.contacts?.[0];
        if (contact) {
          matches.push({
            workflow_id: workflow.id as string,
            contact_id: contact.id,
            account_id: account.id,
            context_data: { contact, account },
          });
        }
      }
    }
  }

  return matches;
}

function matchesFilters(
  match: WorkflowTriggerMatch,
  filters: Record<string, unknown>
): boolean {
  if (!filters || Object.keys(filters).length === 0) return true;

  const context = match.context_data;

  // Policy type filter
  if (filters.policy_types && Array.isArray(filters.policy_types)) {
    const policyType = (context.policy as Record<string, unknown>)?.policy_type;
    if (policyType && !filters.policy_types.includes(policyType)) {
      return false;
    }
  }

  // Carrier filter
  if (filters.carriers && Array.isArray(filters.carriers)) {
    const carrier = (context.policy as Record<string, unknown>)?.carrier_name;
    if (carrier && !filters.carriers.includes(carrier)) {
      return false;
    }
  }

  // Tag filter (include)
  if (filters.tags && Array.isArray(filters.tags)) {
    const contactTags =
      ((context.contact as Record<string, unknown>)?.tags as string[]) || [];
    if (!filters.tags.some((t: string) => contactTags.includes(t))) {
      return false;
    }
  }

  // Tag filter (exclude)
  if (filters.exclude_tags && Array.isArray(filters.exclude_tags)) {
    const contactTags =
      ((context.contact as Record<string, unknown>)?.tags as string[]) || [];
    if (filters.exclude_tags.some((t: string) => contactTags.includes(t))) {
      return false;
    }
  }

  // Lead score filter
  if (typeof filters.lead_score_min === 'number') {
    const leadScore = (context.lead as Record<string, unknown>)?.lead_score as number;
    if (leadScore !== undefined && leadScore < filters.lead_score_min) {
      return false;
    }
  }

  return true;
}

async function tryEnrollInWorkflow(
  supabase: SupabaseClient,
  workflow: Record<string, unknown>,
  match: WorkflowTriggerMatch
): Promise<boolean> {
  // Check if already enrolled and not completed/stopped
  const { data: existing } = await supabase
    .from('automation_workflow_executions')
    .select('id, status')
    .eq('workflow_id', workflow.id)
    .eq(match.contact_id ? 'contact_id' : match.lead_id ? 'lead_id' : 'account_id',
        match.contact_id || match.lead_id || match.account_id)
    .in('status', ['pending', 'running', 'paused'])
    .single();

  if (existing) {
    logger.debug('Contact already enrolled in workflow', {
      workflowId: workflow.id,
      contactId: match.contact_id,
    });
    return false;
  }

  // Check cooldown period
  const cooldownDays = (workflow.cooldown_days as number) || 90;
  const cooldownDate = new Date();
  cooldownDate.setDate(cooldownDate.getDate() - cooldownDays);

  const { data: recent } = await supabase
    .from('automation_workflow_executions')
    .select('id')
    .eq('workflow_id', workflow.id)
    .eq(match.contact_id ? 'contact_id' : match.lead_id ? 'lead_id' : 'account_id',
        match.contact_id || match.lead_id || match.account_id)
    .gte('completed_at', cooldownDate.toISOString())
    .limit(1);

  if (recent && recent.length > 0) {
    logger.debug('Contact in cooldown period', {
      workflowId: workflow.id,
      contactId: match.contact_id,
    });
    return false;
  }

  // Check communication preferences (opt-out)
  if (match.contact_id) {
    const { data: prefs } = await supabase
      .from('communication_preferences')
      .select('marketing_opt_in, email_opt_in')
      .eq('contact_id', match.contact_id)
      .single();

    if (prefs && (!prefs.marketing_opt_in || !prefs.email_opt_in)) {
      logger.debug('Contact opted out of marketing', {
        contactId: match.contact_id,
      });
      return false;
    }
  }

  // Create execution
  const { data: execution, error } = await supabase
    .from('automation_workflow_executions')
    .insert({
      workflow_id: workflow.id,
      agency_workspace_id: workflow.agency_workspace_id,
      contact_id: match.contact_id,
      account_id: match.account_id,
      lead_id: match.lead_id,
      context_data: match.context_data,
      status: 'running',
      current_stage: 1,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    logger.error('Failed to create execution', { error: error.message });
    return false;
  }

  // Update workflow stats
  await supabase
    .from('automation_workflows')
    .update({ total_enrolled: (workflow.total_enrolled as number || 0) + 1 })
    .eq('id', workflow.id);

  // Schedule first stage
  await scheduleNextStage(supabase, execution, 1);

  logger.info('Enrolled contact in workflow', {
    workflowId: workflow.id,
    executionId: execution.id,
    contactId: match.contact_id,
  });

  return true;
}

// ============================================================================
// STAGE EXECUTION
// ============================================================================

async function executeScheduledStages(supabase: SupabaseClient) {
  logger.info('Executing scheduled stages');

  const now = new Date().toISOString();

  // Get stages ready to execute
  const { data: pendingStages, error } = await supabase
    .from('automation_stage_executions')
    .select(`
      *,
      stage:automation_workflow_stages(*),
      execution:automation_workflow_executions(
        *,
        contact:contacts(*),
        account:accounts(*)
      )
    `)
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .limit(100);

  if (error) throw error;

  let executed = 0;
  let failed = 0;

  for (const stageExec of (pendingStages || []) as StageExecution[]) {
    try {
      await executeStage(supabase, stageExec);
      executed++;
    } catch (err) {
      failed++;
      logger.error('Stage execution failed', {
        stageExecId: stageExec.id,
        error: err.message,
      });

      // Update stage execution with error
      await supabase
        .from('automation_stage_executions')
        .update({
          status: 'failed',
          error_message: err.message,
          executed_at: new Date().toISOString(),
          retry_count: (stageExec as Record<string, unknown>).retry_count as number + 1,
        })
        .eq('id', stageExec.id);
    }
  }

  logger.info('Stage execution complete', { executed, failed });
  return { executed, failed };
}

async function executeStage(supabase: SupabaseClient, stageExec: StageExecution) {
  const { stage, execution } = stageExec;
  const contact = execution.contact;
  const account = execution.account;
  const contextData = execution.context_data;

  // Check stop conditions before executing
  if (await shouldStopExecution(supabase, execution, stage)) {
    await supabase
      .from('automation_stage_executions')
      .update({ status: 'skipped', executed_at: new Date().toISOString() })
      .eq('id', stageExec.id);
    return;
  }

  // Check stage conditions
  if (stage.action_config && !await checkStageConditions(supabase, stageExec)) {
    await supabase
      .from('automation_stage_executions')
      .update({ status: 'skipped', executed_at: new Date().toISOString() })
      .eq('id', stageExec.id);

    // Still schedule next stage
    await scheduleNextStage(supabase, execution, stage.stage_number + 1);
    return;
  }

  // Check if action type is enabled via feature flags
  if (!isActionEnabled(stage.action_type)) {
    logger.warn('Action type not enabled', {
      actionType: stage.action_type,
      stageId: stage.id,
      executionId: execution.id,
    });

    // Mark as skipped with reason
    await supabase
      .from('automation_stage_executions')
      .update({
        status: 'skipped',
        executed_at: new Date().toISOString(),
        error_message: `Action type '${stage.action_type}' is not yet implemented`,
      })
      .eq('id', stageExec.id);

    // Still schedule next stage
    await scheduleNextStage(supabase, execution, stage.stage_number + 1);
    return;
  }

  // Execute based on action type
  let deliveryId: string | undefined;

  switch (stage.action_type) {
    case 'email':
      deliveryId = await sendEmail(supabase, stage.action_config, contact, contextData, execution);
      break;

    case 'sms':
      deliveryId = await sendSMS(supabase, stage.action_config, contact, contextData);
      break;

    case 'task':
      await createTask(supabase, stage.action_config, contact, contextData, execution);
      break;

    case 'internal_notification':
      await sendNotification(supabase, stage.action_config, contact, contextData, execution);
      break;

    case 'pipeline_move':
      await movePipelineCard(supabase, stage.action_config, execution);
      break;

    case 'tag_add':
      await addTags(supabase, stage.action_config, contact);
      break;

    case 'tag_remove':
      await removeTags(supabase, stage.action_config, contact);
      break;

    case 'field_update':
      await updateField(supabase, stage.action_config, contact, execution);
      break;

    case 'webhook':
      await callWebhook(stage.action_config, contact, contextData);
      break;

    case 'wait_for_event':
      // Mark as waiting instead of sent
      await supabase
        .from('automation_stage_executions')
        .update({ status: 'waiting', executed_at: new Date().toISOString() })
        .eq('id', stageExec.id);
      return;

    // Future: Add handlers for postcard, voicemail, etc. when integrations are ready
    // case 'postcard':
    //   deliveryId = await sendPostcard(supabase, stage.action_config, contact, contextData);
    //   break;
    // case 'voicemail':
    // case 'ringless_voicemail':
    //   deliveryId = await dropVoicemail(supabase, stage.action_config, contact, contextData);
    //   break;

    default:
      logger.warn('Unknown action type', { actionType: stage.action_type });
  }

  // Update stage execution
  await supabase
    .from('automation_stage_executions')
    .update({
      status: 'sent',
      executed_at: new Date().toISOString(),
      delivery_id: deliveryId,
    })
    .eq('id', stageExec.id);

  // Update execution engagement metrics
  if (stage.action_type === 'email') {
    await supabase
      .from('automation_workflow_executions')
      .update({ emails_sent: execution.emails_sent + 1 })
      .eq('id', execution.id);
  } else if (stage.action_type === 'sms') {
    await supabase
      .from('automation_workflow_executions')
      .update({ sms_sent: execution.sms_sent + 1 })
      .eq('id', execution.id);
  }

  // Schedule next stage
  await scheduleNextStage(supabase, execution, stage.stage_number + 1);
}

async function shouldStopExecution(
  supabase: SupabaseClient,
  execution: Record<string, unknown>,
  stage: Record<string, unknown>
): Promise<boolean> {
  // Check unsubscribe
  if (stage.stop_on_unsubscribe) {
    const { data: prefs } = await supabase
      .from('communication_preferences')
      .select('email_opt_in, sms_opt_in')
      .eq('contact_id', execution.contact_id)
      .single();

    if (prefs && (!prefs.email_opt_in || !prefs.sms_opt_in)) {
      await stopWorkflowExecution(supabase, execution.id as string, 'unsubscribed');
      return true;
    }
  }

  // Check goal achieved
  if (stage.stop_on_goal) {
    const { data: workflow } = await supabase
      .from('automation_workflows')
      .select('goal_config')
      .eq('id', execution.workflow_id)
      .single();

    if (workflow?.goal_config?.event) {
      // Check if goal event occurred
      // This would need to be implemented based on your event tracking
    }
  }

  return false;
}

async function checkStageConditions(
  supabase: SupabaseClient,
  stageExec: StageExecution
): Promise<boolean> {
  const conditions = stageExec.stage.action_config?.conditions as Array<Record<string, unknown>> | undefined;
  if (!conditions || conditions.length === 0) return true;

  for (const condition of conditions) {
    const { field, operator, value } = condition;

    // Check engagement conditions
    if (field === 'email_opened') {
      const { count } = await supabase
        .from('automation_stage_executions')
        .select('id', { count: 'exact' })
        .eq('execution_id', stageExec.execution_id)
        .not('opened_at', 'is', null);

      const opened = (count || 0) > 0;
      if (operator === 'equals' && opened !== value) return false;
      if (operator === 'not_equals' && opened === value) return false;
    }

    if (field === 'email_clicked') {
      const { count } = await supabase
        .from('automation_stage_executions')
        .select('id', { count: 'exact' })
        .eq('execution_id', stageExec.execution_id)
        .not('clicked_at', 'is', null);

      const clicked = (count || 0) > 0;
      if (operator === 'equals' && clicked !== value) return false;
    }
  }

  return true;
}

async function scheduleNextStage(
  supabase: SupabaseClient,
  execution: Record<string, unknown>,
  stageNumber: number
) {
  // Get the next stage
  const { data: stage } = await supabase
    .from('automation_workflow_stages')
    .select('*')
    .eq('workflow_id', execution.workflow_id)
    .eq('stage_number', stageNumber)
    .single();

  if (!stage) {
    // No more stages, complete the workflow
    await supabase
      .from('automation_workflow_executions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', execution.id);

    // Update workflow stats
    await supabase.rpc('increment_workflow_completed', {
      workflow_id: execution.workflow_id,
    }).catch(() => {
      // RPC might not exist yet, update directly
      supabase
        .from('automation_workflows')
        .update({
          total_completed: (execution as Record<string, unknown>).total_completed as number + 1,
        })
        .eq('id', execution.workflow_id);
    });

    return;
  }

  // Calculate scheduled time
  let scheduledAt = new Date();

  switch (stage.delay_type) {
    case 'immediate':
      break;
    case 'minutes':
      scheduledAt.setMinutes(scheduledAt.getMinutes() + stage.delay_value);
      break;
    case 'hours':
      scheduledAt.setHours(scheduledAt.getHours() + stage.delay_value);
      break;
    case 'days':
      scheduledAt.setDate(scheduledAt.getDate() + stage.delay_value);
      break;
    case 'weeks':
      scheduledAt.setDate(scheduledAt.getDate() + stage.delay_value * 7);
      break;
    case 'specific_date':
      scheduledAt = new Date(stage.specific_date);
      break;
  }

  // Apply send time if not immediate
  if (stage.delay_type !== 'immediate' && stage.send_time) {
    const [hours, minutes] = stage.send_time.split(':');
    scheduledAt.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  }

  // Get workflow for send window validation
  const { data: workflow } = await supabase
    .from('automation_workflows')
    .select('send_window_start, send_window_end, send_days, timezone')
    .eq('id', execution.workflow_id)
    .single();

  if (workflow) {
    scheduledAt = adjustForSendWindow(scheduledAt, workflow);
  }

  // Create stage execution record
  await supabase.from('automation_stage_executions').insert({
    execution_id: execution.id,
    stage_id: stage.id,
    status: 'scheduled',
    scheduled_at: scheduledAt.toISOString(),
  });

  // Update execution current stage
  await supabase
    .from('automation_workflow_executions')
    .update({ current_stage: stageNumber })
    .eq('id', execution.id);
}

function adjustForSendWindow(
  date: Date,
  workflow: Record<string, unknown>
): Date {
  const sendDays = (workflow.send_days as string[]) || ['mon', 'tue', 'wed', 'thu', 'fri'];
  const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

  // Check if current day is valid
  let adjustedDate = new Date(date);
  let attempts = 0;

  while (!sendDays.includes(dayNames[adjustedDate.getDay()]) && attempts < 7) {
    adjustedDate.setDate(adjustedDate.getDate() + 1);
    attempts++;
  }

  // Check send window
  if (workflow.send_window_start && workflow.send_window_end) {
    const [startHour, startMin] = (workflow.send_window_start as string).split(':').map(Number);
    const [endHour, endMin] = (workflow.send_window_end as string).split(':').map(Number);

    const currentHour = adjustedDate.getHours();
    const currentMin = adjustedDate.getMinutes();

    if (currentHour < startHour || (currentHour === startHour && currentMin < startMin)) {
      // Before window, set to start
      adjustedDate.setHours(startHour, startMin, 0, 0);
    } else if (currentHour > endHour || (currentHour === endHour && currentMin > endMin)) {
      // After window, move to next valid day
      adjustedDate.setDate(adjustedDate.getDate() + 1);
      adjustedDate.setHours(startHour, startMin, 0, 0);

      // Re-check day validity
      while (!sendDays.includes(dayNames[adjustedDate.getDay()])) {
        adjustedDate.setDate(adjustedDate.getDate() + 1);
      }
    }
  }

  return adjustedDate;
}

// ============================================================================
// ACTION IMPLEMENTATIONS
// ============================================================================

async function sendEmail(
  supabase: SupabaseClient,
  config: Record<string, unknown>,
  contact: Record<string, unknown> | undefined,
  context: Record<string, unknown>,
  execution: Record<string, unknown>
): Promise<string | undefined> {
  if (!contact?.email) {
    logger.warn('Contact has no email', { contactId: contact?.id });
    return undefined;
  }

  // CONSENT CHECK: Verify contact has opted in to email communications
  if (contact?.id) {
    const { data: prefs } = await supabase
      .from('communication_preferences')
      .select('email_opt_in, marketing_opt_in')
      .eq('contact_id', contact.id)
      .single();

    if (prefs) {
      if (prefs.email_opt_in === false) {
        logger.info('Contact opted out of email, skipping', { contactId: contact.id });
        return undefined;
      }
      if (prefs.marketing_opt_in === false) {
        logger.info('Contact opted out of marketing, skipping', { contactId: contact.id });
        return undefined;
      }
    }
  }

  // Fetch template if specified
  let subject = config.subject as string;
  let bodyHtml = config.body_html as string;

  if (config.template_id) {
    const { data: template } = await supabase
      .from('email_templates')
      .select('*')
      .eq('id', config.template_id)
      .single();

    if (template) {
      subject = config.subject || template.subject;
      bodyHtml = template.body_html;

      // Update template usage
      await supabase
        .from('email_templates')
        .update({
          times_used: template.times_used + 1,
          total_sent: template.total_sent + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq('id', template.id);
    }
  }

  // Get agency info for merge tags
  const { data: agency } = await supabase
    .from('agency_workspaces')
    .select('*')
    .eq('id', execution.agency_workspace_id)
    .single();

  // Get agent info
  let agent = null;
  const assignedTo = (context.account as Record<string, unknown>)?.assigned_to;
  if (assignedTo) {
    const { data: agentData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', assignedTo)
      .single();
    agent = agentData;
  }

  // Merge variables
  subject = mergeVariables(subject, contact, context, agency, agent);
  bodyHtml = mergeVariables(bodyHtml, contact, context, agency, agent);

  // Add tracking pixel and unsubscribe link
  const trackingPixel = `<img src="${Deno.env.get('SUPABASE_URL')}/functions/v1/automation-processor?action=track&type=open&exec_id=${execution.id}" width="1" height="1" />`;
  bodyHtml = bodyHtml.replace('</body>', `${trackingPixel}</body>`);

  // Send via email-send function
  const { data: result, error } = await supabase.functions.invoke('email-send', {
    body: {
      to: contact.email,
      subject,
      html: bodyHtml,
      from_name: config.from_name || agency?.name || 'Your Insurance Team',
      reply_to: config.reply_to || agency?.email,
      metadata: {
        execution_id: execution.id,
        workflow_id: execution.workflow_id,
      },
    },
  });

  if (error) {
    logger.error('Email send failed', { error: error.message });
    throw error;
  }

  return result?.message_id;
}

async function sendSMS(
  supabase: SupabaseClient,
  config: Record<string, unknown>,
  contact: Record<string, unknown> | undefined,
  context: Record<string, unknown>
): Promise<string | undefined> {
  if (!contact?.phone) {
    logger.warn('Contact has no phone', { contactId: contact?.id });
    return undefined;
  }

  // CONSENT CHECK: Verify contact has opted in to SMS communications
  // SMS consent is legally required (TCPA compliance)
  if (contact?.id) {
    const { data: prefs } = await supabase
      .from('communication_preferences')
      .select('sms_opt_in, marketing_opt_in')
      .eq('contact_id', contact.id)
      .single();

    if (prefs) {
      if (prefs.sms_opt_in === false) {
        logger.info('Contact opted out of SMS, skipping', { contactId: contact.id });
        return undefined;
      }
      if (prefs.marketing_opt_in === false) {
        logger.info('Contact opted out of marketing, skipping', { contactId: contact.id });
        return undefined;
      }
    } else {
      // No preferences record = no explicit consent
      // For TCPA compliance, we require explicit opt-in for SMS
      logger.warn('No SMS consent record found, skipping SMS', { contactId: contact.id });
      return undefined;
    }
  } else {
    logger.warn('Cannot verify SMS consent without contact ID', {});
    return undefined;
  }

  let message = config.message as string;

  // Fetch template if specified
  if (config.template_id) {
    const { data: template } = await supabase
      .from('sms_templates')
      .select('*')
      .eq('id', config.template_id)
      .single();

    if (template) {
      message = template.message;

      await supabase
        .from('sms_templates')
        .update({
          times_used: template.times_used + 1,
          total_sent: template.total_sent + 1,
        })
        .eq('id', template.id);
    }
  }

  message = mergeVariables(message, contact, context, null, null);

  const { data: result, error } = await supabase.functions.invoke('twilio-sms', {
    body: {
      to: contact.phone,
      message,
    },
  });

  if (error) {
    logger.error('SMS send failed', { error: error.message });
    throw error;
  }

  return result?.sid;
}

async function createTask(
  supabase: SupabaseClient,
  config: Record<string, unknown>,
  contact: Record<string, unknown> | undefined,
  context: Record<string, unknown>,
  execution: Record<string, unknown>
) {
  let assigneeId: string | undefined;

  switch (config.assignee_type) {
    case 'owner':
      assigneeId = (context.account as Record<string, unknown>)?.assigned_to as string;
      break;
    case 'specific':
      assigneeId = config.assignee_id as string;
      break;
    case 'round_robin':
      // TODO: Implement round-robin assignment
      break;
  }

  const dueDays = (config.due_days as number) || 3;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + dueDays);

  const title = mergeVariables(config.title as string, contact, context, null, null);
  const description = config.description
    ? mergeVariables(config.description as string, contact, context, null, null)
    : undefined;

  await supabase.from('tasks').insert({
    title,
    description,
    priority: config.priority || 'medium',
    assigned_to: assigneeId,
    related_to_type: contact ? 'contact' : 'account',
    related_to_id: contact?.id || execution.account_id,
    due_date: dueDate.toISOString(),
    org_id: execution.agency_workspace_id, // Legacy support
    metadata: {
      automation_execution_id: execution.id,
      automation_workflow_id: execution.workflow_id,
    },
  });
}

async function sendNotification(
  supabase: SupabaseClient,
  config: Record<string, unknown>,
  contact: Record<string, unknown> | undefined,
  context: Record<string, unknown>,
  execution: Record<string, unknown>
) {
  const recipientId = config.recipient_id as string ||
    (context.account as Record<string, unknown>)?.assigned_to as string;

  if (!recipientId) return;

  const title = mergeVariables(config.title as string, contact, context, null, null);
  const message = mergeVariables(config.message as string, contact, context, null, null);

  await supabase.from('notifications').insert({
    user_id: recipientId,
    type: 'automation',
    title,
    message,
    metadata: {
      execution_id: execution.id,
      contact_id: contact?.id,
    },
  });
}

async function movePipelineCard(
  supabase: SupabaseClient,
  config: Record<string, unknown>,
  execution: Record<string, unknown>
) {
  // Find the pipeline card for this contact/lead
  const { data: card } = await supabase
    .from('pipeline_cards')
    .select('id')
    .eq('pipeline_id', config.pipeline_id)
    .or(`contact_id.eq.${execution.contact_id},lead_id.eq.${execution.lead_id}`)
    .single();

  if (card) {
    await supabase
      .from('pipeline_cards')
      .update({ stage_id: config.stage_id })
      .eq('id', card.id);
  }
}

async function addTags(
  supabase: SupabaseClient,
  config: Record<string, unknown>,
  contact: Record<string, unknown> | undefined
) {
  if (!contact?.id) return;

  const newTags = config.tags as string[];
  const currentTags = (contact.tags as string[]) || [];
  const mergedTags = [...new Set([...currentTags, ...newTags])];

  await supabase
    .from('contacts')
    .update({ tags: mergedTags })
    .eq('id', contact.id);
}

async function removeTags(
  supabase: SupabaseClient,
  config: Record<string, unknown>,
  contact: Record<string, unknown> | undefined
) {
  if (!contact?.id) return;

  const tagsToRemove = config.tags as string[];
  const currentTags = (contact.tags as string[]) || [];
  const filteredTags = currentTags.filter((t) => !tagsToRemove.includes(t));

  await supabase
    .from('contacts')
    .update({ tags: filteredTags })
    .eq('id', contact.id);
}

async function updateField(
  supabase: SupabaseClient,
  config: Record<string, unknown>,
  contact: Record<string, unknown> | undefined,
  execution: Record<string, unknown>
) {
  const table = config.table as string;
  const field = config.field as string;
  const value = config.value;

  let recordId: string | undefined;

  switch (table) {
    case 'contacts':
      recordId = contact?.id as string;
      break;
    case 'accounts':
      recordId = execution.account_id as string;
      break;
    case 'leads':
      recordId = execution.lead_id as string;
      break;
  }

  if (recordId) {
    await supabase
      .from(table)
      .update({ [field]: value })
      .eq('id', recordId);
  }
}

async function callWebhook(
  config: Record<string, unknown>,
  contact: Record<string, unknown> | undefined,
  context: Record<string, unknown>
) {
  const url = config.url as string;
  const method = (config.method as string) || 'POST';
  const headers = (config.headers as Record<string, string>) || {};

  let body = config.body_template as string;
  if (body) {
    body = mergeVariables(body, contact, context, null, null);
  }

  await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? body : JSON.stringify({ contact, context }),
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function mergeVariables(
  text: string,
  contact: Record<string, unknown> | undefined | null,
  context: Record<string, unknown>,
  agency: Record<string, unknown> | null,
  agent: Record<string, unknown> | null
): string {
  if (!text) return text;

  const policy = context.policy as Record<string, unknown> | undefined;
  const account = context.account as Record<string, unknown> | undefined;

  return text
    // Contact fields
    .replace(/\{\{first_name\}\}/g, (contact?.first_name as string) || 'Valued Customer')
    .replace(/\{\{last_name\}\}/g, (contact?.last_name as string) || '')
    .replace(/\{\{full_name\}\}/g,
      `${(contact?.first_name as string) || ''} ${(contact?.last_name as string) || ''}`.trim() || 'Valued Customer'
    )
    .replace(/\{\{email\}\}/g, (contact?.email as string) || '')
    .replace(/\{\{phone\}\}/g, (contact?.phone as string) || '')
    .replace(/\{\{address\}\}/g, (contact?.address as string) || '')
    .replace(/\{\{city\}\}/g, (contact?.city as string) || '')
    .replace(/\{\{state\}\}/g, (contact?.state as string) || '')
    .replace(/\{\{zip\}\}/g, (contact?.zip as string) || '')

    // Agent fields
    .replace(/\{\{agent_name\}\}/g, (agent?.full_name as string) || 'Your Agent')
    .replace(/\{\{agent_phone\}\}/g, (agent?.phone as string) || '')
    .replace(/\{\{agent_email\}\}/g, (agent?.email as string) || '')

    // Agency fields
    .replace(/\{\{agency_name\}\}/g, (agency?.name as string) || 'Our Agency')
    .replace(/\{\{agency_phone\}\}/g, (agency?.phone as string) || '')
    .replace(/\{\{agency_email\}\}/g, (agency?.email as string) || '')
    .replace(/\{\{agency_address\}\}/g, (agency?.address as string) || '')
    .replace(/\{\{agency_website\}\}/g, (agency?.website as string) || '')

    // Policy fields
    .replace(/\{\{policy_type\}\}/g, (policy?.policy_type as string) || 'your policy')
    .replace(/\{\{policy_number\}\}/g, (policy?.policy_number as string) || '')
    .replace(/\{\{carrier_name\}\}/g, (policy?.carrier_name as string) || '')
    .replace(/\{\{effective_date\}\}/g, formatDate(policy?.effective_date as string))
    .replace(/\{\{expiration_date\}\}/g, formatDate(policy?.expiration_date as string))
    .replace(/\{\{premium\}\}/g, formatCurrency(policy?.premium as number))

    // System fields
    .replace(/\{\{today\}\}/g, new Date().toLocaleDateString())
    .replace(/\{\{current_year\}\}/g, new Date().getFullYear().toString());
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatCurrency(amount: number | undefined): string {
  if (amount === undefined || amount === null) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

// ============================================================================
// ADDITIONAL ACTIONS
// ============================================================================

async function enrollContact(
  supabase: SupabaseClient,
  params: Record<string, unknown>
) {
  const { workflow_id, contact_id, lead_id, account_id, context_data } = params;

  const { data: workflow } = await supabase
    .from('automation_workflows')
    .select('*')
    .eq('id', workflow_id)
    .single();

  if (!workflow) throw new ValidationError('Workflow not found');
  if (workflow.status !== 'active') throw new ValidationError('Workflow is not active');

  const match: WorkflowTriggerMatch = {
    workflow_id: workflow_id as string,
    contact_id: contact_id as string,
    lead_id: lead_id as string,
    account_id: account_id as string,
    context_data: (context_data as Record<string, unknown>) || {},
  };

  const enrolled = await tryEnrollInWorkflow(supabase, workflow, match);

  return { enrolled };
}

/**
 * Secure version of enrollContact that verifies agency membership
 */
async function enrollContactSecure(
  supabase: SupabaseClient,
  params: Record<string, unknown>,
  user: AgencyAuthenticatedUser
) {
  const { workflow_id, contact_id, lead_id, account_id, context_data } = params;

  // Get workflow and verify agency membership
  const { data: workflow } = await supabase
    .from('automation_workflows')
    .select('*, agency_workspace_id')
    .eq('id', workflow_id)
    .single();

  if (!workflow) throw new ValidationError('Workflow not found');

  // Verify user has access to this agency
  if (!verifyAgencyMembership(user, workflow.agency_workspace_id)) {
    throw new AuthorizationError('You do not have access to this workflow');
  }

  if (workflow.status !== 'active') throw new ValidationError('Workflow is not active');

  const match: WorkflowTriggerMatch = {
    workflow_id: workflow_id as string,
    contact_id: contact_id as string,
    lead_id: lead_id as string,
    account_id: account_id as string,
    context_data: (context_data as Record<string, unknown>) || {},
  };

  const enrolled = await tryEnrollInWorkflow(supabase, workflow, match);

  logger.info('User enrolled contact in workflow', {
    userId: user.id,
    workflowId: workflow_id,
    contactId: contact_id,
    enrolled,
  });

  return { enrolled };
}

async function stopExecution(
  supabase: SupabaseClient,
  params: Record<string, unknown>
) {
  const { execution_id, reason } = params;

  await stopWorkflowExecution(supabase, execution_id as string, reason as string);

  return { stopped: true };
}

/**
 * Secure version of stopExecution that verifies agency membership
 */
async function stopExecutionSecure(
  supabase: SupabaseClient,
  params: Record<string, unknown>,
  user: AgencyAuthenticatedUser
) {
  const { execution_id, reason } = params;

  // Get execution and verify agency membership
  const { data: execution } = await supabase
    .from('automation_workflow_executions')
    .select('id, agency_workspace_id, workflow_id')
    .eq('id', execution_id)
    .single();

  if (!execution) throw new ValidationError('Execution not found');

  // Verify user has access to this agency
  if (!verifyAgencyMembership(user, execution.agency_workspace_id)) {
    throw new AuthorizationError('You do not have access to this execution');
  }

  await stopWorkflowExecution(supabase, execution_id as string, reason as string);

  logger.info('User stopped workflow execution', {
    userId: user.id,
    executionId: execution_id,
    reason,
  });

  return { stopped: true };
}

async function stopWorkflowExecution(
  supabase: SupabaseClient,
  executionId: string,
  reason: string
) {
  // Update execution
  await supabase
    .from('automation_workflow_executions')
    .update({
      status: 'stopped',
      stopped_at: new Date().toISOString(),
      stop_reason: reason,
    })
    .eq('id', executionId);

  // Cancel pending stage executions
  await supabase
    .from('automation_stage_executions')
    .update({ status: 'cancelled' })
    .eq('execution_id', executionId)
    .in('status', ['pending', 'scheduled']);
}

async function checkGoals(supabase: SupabaseClient) {
  // Get running executions with goal configs
  const { data: executions } = await supabase
    .from('automation_workflow_executions')
    .select(`
      id,
      workflow_id,
      contact_id,
      account_id,
      lead_id,
      workflow:automation_workflows(goal_config)
    `)
    .eq('status', 'running');

  let converted = 0;

  for (const execution of executions || []) {
    const goalConfig = (execution.workflow as Record<string, unknown>)?.goal_config as Record<string, unknown>;
    if (!goalConfig?.event) continue;

    let goalAchieved = false;

    // Check different goal types
    switch (goalConfig.event) {
      case 'policy_created':
      case 'policy_renewed':
        const { data: policies } = await supabase
          .from('policies')
          .select('id')
          .eq('account_id', execution.account_id)
          .gte('created_at', execution.enrolled_at)
          .limit(1);
        goalAchieved = (policies?.length || 0) > 0;
        break;

      case 'lead_converted':
        const { data: lead } = await supabase
          .from('leads')
          .select('status')
          .eq('id', execution.lead_id)
          .single();
        goalAchieved = lead?.status === 'won';
        break;
    }

    if (goalAchieved) {
      await supabase
        .from('automation_workflow_executions')
        .update({
          status: 'converted',
          converted_at: new Date().toISOString(),
        })
        .eq('id', execution.id);

      // Update workflow stats
      await supabase
        .from('automation_workflows')
        .update({
          total_converted: supabase.sql`total_converted + 1`,
        })
        .eq('id', execution.workflow_id);

      converted++;
    }
  }

  return { converted };
}

async function processEvent(
  supabase: SupabaseClient,
  params: Record<string, unknown>
) {
  const { type, execution_id, stage_execution_id, metadata } = params;

  switch (type) {
    case 'open':
      await supabase
        .from('automation_stage_executions')
        .update({
          status: 'opened',
          opened_at: new Date().toISOString(),
        })
        .eq('id', stage_execution_id);

      await supabase
        .from('automation_workflow_executions')
        .update({
          emails_opened: supabase.sql`emails_opened + 1`,
        })
        .eq('id', execution_id);
      break;

    case 'click':
      await supabase
        .from('automation_stage_executions')
        .update({
          status: 'clicked',
          clicked_at: new Date().toISOString(),
          clicked_links: supabase.sql`clicked_links || ${JSON.stringify([metadata])}::jsonb`,
        })
        .eq('id', stage_execution_id);

      await supabase
        .from('automation_workflow_executions')
        .update({
          emails_clicked: supabase.sql`emails_clicked + 1`,
        })
        .eq('id', execution_id);
      break;

    case 'reply':
      await supabase
        .from('automation_stage_executions')
        .update({
          status: 'replied',
          replied_at: new Date().toISOString(),
        })
        .eq('id', stage_execution_id);

      // Check stop_on_reply
      const { data: stageExec } = await supabase
        .from('automation_stage_executions')
        .select('stage:automation_workflow_stages(stop_on_reply)')
        .eq('id', stage_execution_id)
        .single();

      if ((stageExec?.stage as Record<string, unknown>)?.stop_on_reply) {
        await stopWorkflowExecution(supabase, execution_id as string, 'replied');
      }
      break;

    case 'bounce':
      await supabase
        .from('automation_stage_executions')
        .update({
          status: 'bounced',
          bounced_at: new Date().toISOString(),
          bounce_type: (metadata as Record<string, unknown>)?.bounce_type,
        })
        .eq('id', stage_execution_id);
      break;

    case 'unsubscribe':
      await stopWorkflowExecution(supabase, execution_id as string, 'unsubscribed');
      break;
  }

  return { processed: true };
}

async function cleanupOldExecutions(supabase: SupabaseClient) {
  // Archive executions older than 90 days
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);

  const { count } = await supabase
    .from('automation_workflow_executions')
    .update({ status: 'archived' })
    .in('status', ['completed', 'converted', 'stopped'])
    .lt('updated_at', cutoffDate.toISOString())
    .select('id', { count: 'exact' });

  return { archived: count || 0 };
}
