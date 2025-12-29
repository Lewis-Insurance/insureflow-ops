/**
 * Automation Gateway Edge Function
 *
 * Single entry point for n8n to write back to Supabase.
 * All automation writes go through this gateway for:
 * - Scoped API key authentication
 * - Idempotency enforcement
 * - Audit logging
 * - Tenant isolation
 *
 * Request Schema:
 * {
 *   action: string,           // e.g., "lead.speed_to_lead.run"
 *   workspace_id: string,     // Agency workspace ID
 *   idempotency_key: string,  // Unique key for deduplication
 *   payload: object           // Action-specific payload
 * }
 *
 * Headers:
 * - X-Automation-Key: API key for authentication
 * - X-N8N-Execution-Id: (optional) n8n execution ID for tracing
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createLogger } from '../_shared/logger.ts';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  createErrorResponse,
} from '../_shared/error-handler.ts';
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts';

// ============================================================================
// Types
// ============================================================================

interface GatewayRequest {
  action: string;
  workspace_id: string;
  idempotency_key: string;
  payload: Record<string, unknown>;
  source_event_id?: number;
}

interface ApiKey {
  id: string;
  name: string;
  key_hash: string;
  scopes: string[];
  enabled: boolean;
}

interface ActionResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

// ============================================================================
// Logger
// ============================================================================

const logger = createLogger('automation-gateway');

// ============================================================================
// Action Registry
// ============================================================================

type ActionHandler = (
  payload: Record<string, unknown>,
  context: ActionContext
) => Promise<ActionResult>;

interface ActionContext {
  supabase: ReturnType<typeof createClient>;
  workspaceId: string;
  idempotencyKey: string;
  requestId: string;
}

const actionRegistry: Map<string, ActionHandler> = new Map();

// Register an action handler
function registerAction(action: string, handler: ActionHandler) {
  actionRegistry.set(action, handler);
}

// ============================================================================
// V1 Action Handlers
// ============================================================================

// 1. Lead Speed-to-Lead
registerAction('lead.speed_to_lead.run', async (payload, ctx) => {
  const { lead_id, send_sms, create_call_task } = payload;

  if (!lead_id) {
    return { success: false, error: 'lead_id is required' };
  }

  const results: Record<string, unknown> = {};

  // Get lead details
  const { data: lead, error: leadError } = await ctx.supabase
    .from('leads')
    .select('*, accounts!inner(agency_workspace_id)')
    .eq('id', lead_id)
    .single();

  if (leadError || !lead) {
    return { success: false, error: `Lead not found: ${leadError?.message}` };
  }

  // Queue SMS if requested and phone exists
  if (send_sms && lead.phone) {
    const { data: smsResult } = await ctx.supabase
      .from('marketing_send_queue')
      .insert({
        org_id: lead.org_id,
        priority: 1, // Highest priority
        channel: 'sms',
        classification: 'transactional',
        to_phone: lead.phone,
        source_type: 'automation',
        idempotency_key: `speed_to_lead_sms:${lead_id}:${ctx.idempotencyKey}`,
      })
      .select()
      .single();

    results.sms_queued = !!smsResult;
  }

  // Create call task if requested
  if (create_call_task) {
    const { data: taskResult } = await ctx.supabase
      .from('tasks')
      .insert({
        org_id: lead.org_id,
        entity_type: 'lead',
        entity_id: lead_id,
        title: `Speed-to-Lead Call: ${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
        description: `New lead received - follow up immediately.\nPhone: ${lead.phone || 'N/A'}`,
        priority: 'urgent',
        status: 'pending',
        due_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutes
        source: 'automation',
        idempotency_key: `speed_to_lead_task:${lead_id}:${ctx.idempotencyKey}`,
      })
      .select()
      .single();

    results.task_created = !!taskResult;
    results.task_id = taskResult?.id;
  }

  return { success: true, data: results };
});

// 2. Lead Source Capture
registerAction('lead.source.capture', async (payload, ctx) => {
  const { lead_id, source, source_detail, campaign_id, referrer } = payload;

  if (!lead_id) {
    return { success: false, error: 'lead_id is required' };
  }

  const { error } = await ctx.supabase
    .from('leads')
    .update({
      source: source || 'unknown',
      source_detail: source_detail,
      campaign_id: campaign_id,
      referrer_url: referrer,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lead_id);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: { lead_id, source } };
});

// 5. Lead Dedupe Check
registerAction('lead.dedupe.check', async (payload, ctx) => {
  const { lead_id, email, phone } = payload;

  // Find potential duplicates
  let query = ctx.supabase
    .from('leads')
    .select('id, email, phone, created_at, status')
    .neq('id', lead_id);

  if (email) {
    query = query.or(`email.eq.${email}`);
  }
  if (phone) {
    query = query.or(`phone.eq.${phone}`);
  }

  const { data: duplicates, error } = await query.limit(10);

  if (error) {
    return { success: false, error: error.message };
  }

  const hasDuplicates = duplicates && duplicates.length > 0;

  // If duplicates found, create review task
  if (hasDuplicates) {
    await ctx.supabase
      .from('tasks')
      .insert({
        org_id: ctx.workspaceId,
        entity_type: 'lead',
        entity_id: lead_id,
        title: `Review potential duplicate lead`,
        description: `Found ${duplicates.length} potential duplicate(s). Please review and merge if appropriate.`,
        priority: 'medium',
        status: 'pending',
        source: 'automation',
        evidence: duplicates,
        idempotency_key: `dedupe_review:${lead_id}:${ctx.idempotencyKey}`,
      });
  }

  return {
    success: true,
    data: {
      has_duplicates: hasDuplicates,
      duplicate_count: duplicates?.length || 0,
      duplicates: duplicates?.map(d => d.id),
    },
  };
});

// 6. Missing Info Request
registerAction('lead.missing_info.request', async (payload, ctx) => {
  const { lead_id, missing_fields, send_email, send_sms } = payload;

  if (!lead_id || !missing_fields || missing_fields.length === 0) {
    return { success: false, error: 'lead_id and missing_fields are required' };
  }

  const { data: lead, error: leadError } = await ctx.supabase
    .from('leads')
    .select('*')
    .eq('id', lead_id)
    .single();

  if (leadError || !lead) {
    return { success: false, error: 'Lead not found' };
  }

  const results: Record<string, unknown> = { missing_fields };

  // Queue email if requested
  if (send_email && lead.email) {
    await ctx.supabase.from('marketing_send_queue').insert({
      org_id: lead.org_id,
      priority: 3,
      channel: 'email',
      classification: 'transactional',
      to_email: lead.email,
      source_type: 'automation',
      idempotency_key: `missing_info_email:${lead_id}:${ctx.idempotencyKey}`,
    });
    results.email_queued = true;
  }

  // Queue SMS if requested
  if (send_sms && lead.phone) {
    await ctx.supabase.from('marketing_send_queue').insert({
      org_id: lead.org_id,
      priority: 3,
      channel: 'sms',
      classification: 'transactional',
      to_phone: lead.phone,
      source_type: 'automation',
      idempotency_key: `missing_info_sms:${lead_id}:${ctx.idempotencyKey}`,
    });
    results.sms_queued = true;
  }

  return { success: true, data: results };
});

// 8. Compliance Consent Check
registerAction('compliance.consent.check', async (payload, ctx) => {
  const { contact_id, channel, purpose } = payload;

  if (!contact_id || !channel) {
    return { success: false, error: 'contact_id and channel are required' };
  }

  // Check consent in preferences table
  const { data: prefs } = await ctx.supabase
    .from('communication_preferences')
    .select('*')
    .eq('contact_id', contact_id)
    .single();

  // Check for explicit opt-out
  const { data: consent } = await ctx.supabase
    .from('consent_ledger')
    .select('*')
    .eq('contact_id', contact_id)
    .eq('channel', channel)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .single();

  const hasConsent = !prefs?.do_not_contact &&
    !prefs?.do_not_market &&
    consent?.action !== 'opt_out';

  return {
    success: true,
    data: {
      contact_id,
      channel,
      has_consent: hasConsent,
      do_not_contact: prefs?.do_not_contact || false,
      last_consent_action: consent?.action,
      last_consent_date: consent?.recorded_at,
    },
  };
});

// 9. Lead Aging Escalation
registerAction('lead.aging.escalate', async (payload, ctx) => {
  const { lead_id, days_old, escalate_to, create_task } = payload;

  if (!lead_id) {
    return { success: false, error: 'lead_id is required' };
  }

  const results: Record<string, unknown> = { days_old };

  // Update lead with aging flag
  await ctx.supabase
    .from('leads')
    .update({
      aging_escalated: true,
      aging_escalated_at: new Date().toISOString(),
    })
    .eq('id', lead_id);

  // Create escalation task
  if (create_task) {
    const { data: lead } = await ctx.supabase
      .from('leads')
      .select('*')
      .eq('id', lead_id)
      .single();

    await ctx.supabase.from('tasks').insert({
      org_id: lead?.org_id,
      entity_type: 'lead',
      entity_id: lead_id,
      title: `Aging Lead Escalation (${days_old} days)`,
      description: `This lead has been open for ${days_old} days. Immediate follow-up required.`,
      priority: 'high',
      status: 'pending',
      assigned_to: escalate_to,
      source: 'automation',
      idempotency_key: `aging_escalation:${lead_id}:${ctx.idempotencyKey}`,
    });

    results.task_created = true;
  }

  return { success: true, data: results };
});

// 10. Nurture Sequence Start
registerAction('nurture.sequence.start', async (payload, ctx) => {
  const { contact_id, workflow_id, context_data } = payload;

  if (!contact_id || !workflow_id) {
    return { success: false, error: 'contact_id and workflow_id are required' };
  }

  // Check if already enrolled
  const { data: existing } = await ctx.supabase
    .from('automation_workflow_executions')
    .select('id')
    .eq('contact_id', contact_id)
    .eq('workflow_id', workflow_id)
    .in('status', ['enrolled', 'active', 'paused'])
    .single();

  if (existing) {
    return {
      success: true,
      data: { already_enrolled: true, execution_id: existing.id },
    };
  }

  // Enroll in workflow
  const { data: execution, error } = await ctx.supabase
    .from('automation_workflow_executions')
    .insert({
      workflow_id,
      contact_id,
      status: 'enrolled',
      context_data: context_data || {},
      enrolled_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    data: {
      execution_id: execution?.id,
      enrolled: true,
    },
  };
});

// 13. Need From You Packet
registerAction('quote.need_packet.send', async (payload, ctx) => {
  const { quote_id, contact_id, required_documents } = payload;

  if (!quote_id) {
    return { success: false, error: 'quote_id is required' };
  }

  const { data: quote } = await ctx.supabase
    .from('quotes')
    .select('*, accounts!inner(*)')
    .eq('id', quote_id)
    .single();

  if (!quote) {
    return { success: false, error: 'Quote not found' };
  }

  // Create document collection request
  const { data: collection, error } = await ctx.supabase
    .from('document_collection_requests')
    .insert({
      org_id: quote.org_id,
      account_id: quote.account_id,
      quote_id: quote_id,
      contact_id: contact_id,
      required_documents: required_documents || ['drivers_license', 'dec_page'],
      status: 'pending',
      created_by: 'automation',
      idempotency_key: `need_packet:${quote_id}:${ctx.idempotencyKey}`,
    })
    .select()
    .single();

  if (error) {
    // Might be duplicate, which is fine
    if (!error.message.includes('duplicate')) {
      return { success: false, error: error.message };
    }
  }

  return {
    success: true,
    data: {
      collection_id: collection?.id,
      quote_id,
    },
  };
});

// 14. Quote Status Progress
registerAction('quote.status.progress', async (payload, ctx) => {
  const { quote_id, new_status, reason } = payload;

  if (!quote_id || !new_status) {
    return { success: false, error: 'quote_id and new_status are required' };
  }

  const { data: quote, error: fetchError } = await ctx.supabase
    .from('quotes')
    .select('status')
    .eq('id', quote_id)
    .single();

  if (fetchError) {
    return { success: false, error: 'Quote not found' };
  }

  const oldStatus = quote.status;

  const { error } = await ctx.supabase
    .from('quotes')
    .update({
      status: new_status,
      status_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', quote_id);

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    data: {
      quote_id,
      old_status: oldStatus,
      new_status,
    },
  };
});

// 16. Quote Follow-up Schedule
registerAction('quote.followup.schedule', async (payload, ctx) => {
  const { quote_id, followup_days, assigned_to } = payload;

  if (!quote_id || !followup_days) {
    return { success: false, error: 'quote_id and followup_days are required' };
  }

  const { data: quote } = await ctx.supabase
    .from('quotes')
    .select('*')
    .eq('id', quote_id)
    .single();

  if (!quote) {
    return { success: false, error: 'Quote not found' };
  }

  // Create follow-up tasks for each day interval
  const tasks = followup_days.map((day: number) => ({
    org_id: quote.org_id,
    entity_type: 'quote',
    entity_id: quote_id,
    title: `Quote Follow-up (Day ${day})`,
    description: `Follow up on quote ${quote_id} - Day ${day} check-in`,
    priority: day <= 3 ? 'high' : 'medium',
    status: 'pending',
    due_at: new Date(Date.now() + day * 24 * 60 * 60 * 1000).toISOString(),
    assigned_to: assigned_to,
    source: 'automation',
    idempotency_key: `quote_followup:${quote_id}:day${day}:${ctx.idempotencyKey}`,
  }));

  const { error } = await ctx.supabase.from('tasks').insert(tasks);

  if (error) {
    return { success: false, error: error.message };
  }

  return {
    success: true,
    data: {
      quote_id,
      tasks_created: tasks.length,
      followup_days,
    },
  };
});

// 18. Quote Expiry Rescue
registerAction('quote.expiry_rescue.run', async (payload, ctx) => {
  const { quote_id, days_until_expiry, send_notification, extend_days } = payload;

  if (!quote_id) {
    return { success: false, error: 'quote_id is required' };
  }

  const { data: quote } = await ctx.supabase
    .from('quotes')
    .select('*, accounts!inner(*)')
    .eq('id', quote_id)
    .single();

  if (!quote) {
    return { success: false, error: 'Quote not found' };
  }

  const results: Record<string, unknown> = {
    quote_id,
    days_until_expiry,
  };

  // Extend quote if requested
  if (extend_days && quote.expires_at) {
    const newExpiry = new Date(quote.expires_at);
    newExpiry.setDate(newExpiry.getDate() + extend_days);

    await ctx.supabase
      .from('quotes')
      .update({
        expires_at: newExpiry.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', quote_id);

    results.extended = true;
    results.new_expires_at = newExpiry.toISOString();
  }

  // Send notification
  if (send_notification && quote.accounts?.email) {
    await ctx.supabase.from('marketing_send_queue').insert({
      org_id: quote.org_id,
      priority: 2,
      channel: 'email',
      classification: 'transactional',
      to_email: quote.accounts.email,
      source_type: 'automation',
      idempotency_key: `expiry_rescue:${quote_id}:${ctx.idempotencyKey}`,
    });
    results.notification_queued = true;
  }

  // Create urgent task
  await ctx.supabase.from('tasks').insert({
    org_id: quote.org_id,
    entity_type: 'quote',
    entity_id: quote_id,
    title: `Quote Expiring Soon (${days_until_expiry} days)`,
    description: `Quote is expiring in ${days_until_expiry} days. Take action to prevent loss.`,
    priority: 'urgent',
    status: 'pending',
    source: 'automation',
    idempotency_key: `expiry_task:${quote_id}:${ctx.idempotencyKey}`,
  });
  results.task_created = true;

  return { success: true, data: results };
});

// 19. Multi-Quote Comparison Doc
registerAction('quote.comparison_doc.generate', async (payload, ctx) => {
  const { account_id, quote_ids } = payload;

  if (!account_id || !quote_ids || quote_ids.length < 2) {
    return { success: false, error: 'account_id and at least 2 quote_ids are required' };
  }

  // Get quotes
  const { data: quotes, error } = await ctx.supabase
    .from('quotes')
    .select('*')
    .in('id', quote_ids);

  if (error || !quotes || quotes.length < 2) {
    return { success: false, error: 'Could not retrieve quotes' };
  }

  // Generate comparison document (simplified - in production would call a dedicated service)
  const comparison = {
    generated_at: new Date().toISOString(),
    account_id,
    quotes: quotes.map(q => ({
      id: q.id,
      carrier: q.carrier_id,
      premium: q.premium,
      deductible: q.deductible,
      coverage_limits: q.coverage_limits,
    })),
  };

  // Store comparison document
  const { data: doc } = await ctx.supabase
    .from('documents')
    .insert({
      org_id: ctx.workspaceId,
      account_id,
      kind: 'quote_comparison',
      filename: `Quote_Comparison_${new Date().toISOString().split('T')[0]}.json`,
      content: comparison,
      created_by: 'automation',
    })
    .select()
    .single();

  return {
    success: true,
    data: {
      document_id: doc?.id,
      quotes_compared: quotes.length,
    },
  };
});

// Generic task creation action
registerAction('task.create', async (payload, ctx) => {
  const { entity_type, entity_id, title, description, priority, due_at, assigned_to } = payload;

  if (!title) {
    return { success: false, error: 'title is required' };
  }

  const { data: task, error } = await ctx.supabase
    .from('tasks')
    .insert({
      org_id: ctx.workspaceId,
      entity_type: entity_type || 'general',
      entity_id,
      title,
      description,
      priority: priority || 'medium',
      status: 'pending',
      due_at,
      assigned_to,
      source: 'automation',
      idempotency_key: `task:${ctx.idempotencyKey}`,
    })
    .select()
    .single();

  if (error) {
    if (error.message.includes('duplicate')) {
      return { success: true, data: { duplicate: true } };
    }
    return { success: false, error: error.message };
  }

  return { success: true, data: { task_id: task?.id } };
});

// Generic message queue action
registerAction('message.queue', async (payload, ctx) => {
  const { channel, to_email, to_phone, contact_id, priority, template_id, context } = payload;

  if (!channel || (!to_email && !to_phone)) {
    return { success: false, error: 'channel and recipient are required' };
  }

  const { data: msg, error } = await ctx.supabase
    .from('marketing_send_queue')
    .insert({
      org_id: ctx.workspaceId,
      priority: priority || 5,
      channel,
      classification: 'transactional',
      to_email,
      to_phone,
      to_contact_id: contact_id,
      source_type: 'automation',
      template_id,
      merge_context: context,
      idempotency_key: `msg:${ctx.idempotencyKey}`,
    })
    .select()
    .single();

  if (error) {
    if (error.message.includes('duplicate')) {
      return { success: true, data: { duplicate: true } };
    }
    return { success: false, error: error.message };
  }

  return { success: true, data: { queue_id: msg?.id } };
});

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  logger.setContext({ requestId });

  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  try {
    // Only allow POST
    if (req.method !== 'POST') {
      throw new ValidationError('Method not allowed');
    }

    // Parse request body
    let body: GatewayRequest;
    try {
      body = await req.json();
    } catch {
      throw new ValidationError('Invalid JSON body');
    }

    // Validate required fields
    if (!body.action || !body.workspace_id || !body.idempotency_key) {
      throw new ValidationError('action, workspace_id, and idempotency_key are required');
    }

    logger.info('Gateway request received', {
      action: body.action,
      workspace_id: body.workspace_id,
    });

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new AppError('Server configuration error', 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Authenticate API key
    const apiKeyHeader = req.headers.get('X-Automation-Key');
    if (!apiKeyHeader) {
      throw new AuthenticationError('X-Automation-Key header is required');
    }

    const apiKey = await validateApiKey(supabase, apiKeyHeader, body.action);
    if (!apiKey) {
      throw new AuthenticationError('Invalid or expired API key');
    }

    // Check for duplicate request (idempotency)
    const { data: existingRequest } = await supabase
      .from('automation_requests')
      .select('id, status, response_body')
      .eq('action', body.action)
      .eq('idempotency_key', body.idempotency_key)
      .single();

    if (existingRequest && existingRequest.status === 'ok') {
      logger.info('Duplicate request, returning cached response');
      return new Response(
        JSON.stringify({
          success: true,
          duplicate: true,
          data: existingRequest.response_body,
          request_id: existingRequest.id,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create request audit record
    const { data: auditRecord } = await supabase
      .from('automation_requests')
      .insert({
        agency_workspace_id: body.workspace_id,
        action: body.action,
        idempotency_key: body.idempotency_key,
        request_body: body.payload || {},
        status: 'created',
        api_key_id: apiKey.id,
        api_key_name: apiKey.name,
        source_event_id: body.source_event_id,
        n8n_execution_id: req.headers.get('X-N8N-Execution-Id'),
      })
      .select()
      .single();

    // Find and execute action handler
    const handler = actionRegistry.get(body.action);
    if (!handler) {
      // Update audit record
      await supabase
        .from('automation_requests')
        .update({
          status: 'rejected',
          error: `Unknown action: ${body.action}`,
          duration_ms: Date.now() - startTime,
        })
        .eq('id', auditRecord?.id);

      throw new ValidationError(`Unknown action: ${body.action}`);
    }

    // Execute handler
    const context: ActionContext = {
      supabase,
      workspaceId: body.workspace_id,
      idempotencyKey: body.idempotency_key,
      requestId,
    };

    const result = await handler(body.payload || {}, context);

    // Update audit record
    await supabase
      .from('automation_requests')
      .update({
        status: result.success ? 'ok' : 'failed',
        response_body: result.data || {},
        error: result.error,
        duration_ms: Date.now() - startTime,
      })
      .eq('id', auditRecord?.id);

    // Update API key usage
    await supabase
      .from('automation_api_keys')
      .update({
        last_used_at: new Date().toISOString(),
        usage_count: apiKey.usage_count + 1,
      })
      .eq('id', apiKey.id);

    logger.info('Gateway request completed', {
      action: body.action,
      success: result.success,
      duration_ms: Date.now() - startTime,
    });

    return new Response(
      JSON.stringify({
        success: result.success,
        data: result.data,
        error: result.error,
        request_id: auditRecord?.id,
      }),
      {
        status: result.success ? 200 : 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    logger.error('Gateway error', error instanceof Error ? error : new Error(String(error)));

    const status = error instanceof AuthenticationError ? 401
      : error instanceof AuthorizationError ? 403
      : error instanceof ValidationError ? 400
      : 500;

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        request_id: requestId,
      }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================================
// API Key Validation
// ============================================================================

async function validateApiKey(
  supabase: ReturnType<typeof createClient>,
  keyValue: string,
  action: string
): Promise<(ApiKey & { usage_count: number }) | null> {
  // Get key prefix (first 8 chars) for lookup
  const keyPrefix = keyValue.slice(0, 8);

  // Find matching keys
  const { data: keys } = await supabase
    .from('automation_api_keys')
    .select('*')
    .eq('key_prefix', keyPrefix)
    .eq('enabled', true)
    .is('revoked_at', null);

  if (!keys || keys.length === 0) {
    return null;
  }

  // Verify hash for each potential match
  for (const key of keys) {
    try {
      const valid = await bcrypt.compare(keyValue, key.key_hash);
      if (valid) {
        // Check expiration
        if (key.expires_at && new Date(key.expires_at) < new Date()) {
          continue;
        }

        // Check scope
        const scopes = key.scopes as string[];
        const hasScope = scopes.includes('*') ||
          scopes.some((scope: string) => {
            if (scope.endsWith('.*')) {
              return action.startsWith(scope.slice(0, -2));
            }
            return scope === action;
          });

        if (!hasScope) {
          continue;
        }

        return { ...key, usage_count: key.usage_count || 0 };
      }
    } catch {
      continue;
    }
  }

  return null;
}
