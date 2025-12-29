/**
 * Dispatch Outbox Edge Function
 *
 * Reads pending events from automation_event_outbox and delivers them to n8n.
 * Implements exponential backoff retry with dead-letter handling.
 *
 * Authentication: Requires X-Cron-Secret header (for scheduled invocation)
 *
 * Environment Variables:
 * - N8N_EVENT_WEBHOOK_URL: Full n8n webhook URL for event ingress
 * - N8N_WEBHOOK_SECRET: Shared secret for webhook authentication
 * - DISPATCH_BATCH_SIZE: Number of events to process per invocation (default: 50)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { createLogger } from '../_shared/logger.ts';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

// ============================================================================
// Types
// ============================================================================

interface OutboxEvent {
  id: number;
  created_at: string;
  agency_workspace_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
  status: string;
  attempt_count: number;
}

interface DispatchResult {
  event_id: number;
  success: boolean;
  http_status?: number;
  error?: string;
}

interface DispatchStats {
  total: number;
  delivered: number;
  failed: number;
  duration_ms: number;
}

// ============================================================================
// Logger
// ============================================================================

const logger = createLogger('dispatch-outbox');

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
    // Verify cron secret
    const cronError = verifyCronSecret(req);
    if (cronError) return cronError;

    logger.info('Starting outbox dispatch');

    // Get configuration from environment
    const n8nWebhookUrl = Deno.env.get('N8N_EVENT_WEBHOOK_URL');
    const n8nWebhookSecret = Deno.env.get('N8N_WEBHOOK_SECRET');
    const batchSize = parseInt(Deno.env.get('DISPATCH_BATCH_SIZE') || '50', 10);

    if (!n8nWebhookUrl) {
      logger.warn('N8N_EVENT_WEBHOOK_URL not configured, skipping dispatch');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Dispatch skipped - n8n webhook not configured',
          stats: { total: 0, delivered: 0, failed: 0 }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase configuration missing');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Check if automations are enabled (kill switch)
    const { data: enabled } = await supabase.rpc('is_automation_enabled');
    if (!enabled) {
      logger.warn('Automation platform is disabled (kill switch)');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Dispatch skipped - automation platform disabled',
          stats: { total: 0, delivered: 0, failed: 0 }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get pending events
    const { data: events, error: fetchError } = await supabase
      .rpc('get_pending_outbox_events', { p_batch_size: batchSize });

    if (fetchError) {
      logger.error('Failed to fetch pending events', new Error(fetchError.message));
      throw new Error(`Failed to fetch events: ${fetchError.message}`);
    }

    if (!events || events.length === 0) {
      logger.info('No pending events to dispatch');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No pending events',
          stats: { total: 0, delivered: 0, failed: 0, duration_ms: Date.now() - startTime }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info(`Processing ${events.length} events`);

    // Dispatch each event
    const results: DispatchResult[] = [];

    for (const event of events as OutboxEvent[]) {
      const result = await dispatchEvent(event, n8nWebhookUrl, n8nWebhookSecret, supabase);
      results.push(result);
    }

    // Calculate stats
    const stats: DispatchStats = {
      total: results.length,
      delivered: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      duration_ms: Date.now() - startTime,
    };

    logger.info('Dispatch complete', stats);

    return new Response(
      JSON.stringify({
        success: true,
        stats,
        results: results.map(r => ({
          event_id: r.event_id,
          success: r.success,
          error: r.error
        }))
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    logger.error('Dispatch failed', error instanceof Error ? error : new Error(String(error)));

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================================
// Dispatch Single Event
// ============================================================================

async function dispatchEvent(
  event: OutboxEvent,
  webhookUrl: string,
  webhookSecret: string | undefined,
  supabase: ReturnType<typeof createClient>
): Promise<DispatchResult> {
  const eventLogger = logger.child({ event_id: event.id, event_type: event.event_type });

  try {
    // Build webhook payload
    const payload = {
      outbox_id: event.id,
      workspace_id: event.agency_workspace_id,
      event_type: event.event_type,
      entity_type: event.entity_type,
      entity_id: event.entity_id,
      payload: event.payload,
      idempotency_key: event.idempotency_key,
      created_at: event.created_at,
      attempt: event.attempt_count + 1,
    };

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (webhookSecret) {
      headers['x-insureflow-webhook-secret'] = webhookSecret;
    }

    eventLogger.info('Dispatching event');

    // Make HTTP request with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        // Mark as delivered
        await supabase.rpc('mark_event_delivered', {
          p_event_id: event.id,
          p_http_status: response.status,
        });

        eventLogger.info('Event delivered', { http_status: response.status });

        return {
          event_id: event.id,
          success: true,
          http_status: response.status,
        };
      } else {
        // Non-2xx response
        const errorBody = await response.text().catch(() => 'Unable to read response');

        await supabase.rpc('mark_event_failed', {
          p_event_id: event.id,
          p_error: `HTTP ${response.status}: ${errorBody.slice(0, 500)}`,
          p_http_status: response.status,
        });

        eventLogger.warn('Event delivery failed', {
          http_status: response.status,
          error: errorBody.slice(0, 200),
        });

        return {
          event_id: event.id,
          success: false,
          http_status: response.status,
          error: `HTTP ${response.status}`,
        };
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);

      const errorMessage = fetchError instanceof Error ? fetchError.message : 'Network error';

      await supabase.rpc('mark_event_failed', {
        p_event_id: event.id,
        p_error: errorMessage,
        p_http_status: null,
      });

      eventLogger.error('Event dispatch error', new Error(errorMessage));

      return {
        event_id: event.id,
        success: false,
        error: errorMessage,
      };
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    eventLogger.error('Unexpected dispatch error', new Error(errorMessage));

    return {
      event_id: event.id,
      success: false,
      error: errorMessage,
    };
  }
}
