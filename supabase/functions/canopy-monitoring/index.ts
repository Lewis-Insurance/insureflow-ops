// ============================================================================
// CANOPY MONITORING API - 2-WAY SYNC (READ REFRESH)
// ============================================================================
// Triggers Canopy Monitoring API to refresh policy data automatically
// Handles: GET monitorable pulls, POST trigger refresh, schedule management
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import { ValidationError, createErrorResponse, getCorsHeaders, handleCors } from "../_shared/error-handler.ts";

const logger = createLogger('canopy-monitoring');

const CANOPY_API_BASE = 'https://app.usecanopy.com/api/v1.0.0';

// Minimum refresh interval (Canopy requirement: 30 days)
const MIN_REFRESH_DAYS = 30;

interface MonitoringRequest {
  action: 'list' | 'refresh' | 'check_due' | 'refresh_all_due';
  pull_id?: string;
  canopy_pull_id?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCors(req);
  }

  const corsHeaders = getCorsHeaders(req);
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const canopyClientId = Deno.env.get('CANOPY_CLIENT_ID');
  const canopyClientSecret = Deno.env.get('CANOPY_CLIENT_SECRET');
  const canopyTeamId = Deno.env.get('CANOPY_TEAM_ID');

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Validate Canopy credentials
    if (!canopyClientId || !canopyClientSecret || !canopyTeamId) {
      throw new ValidationError('Missing Canopy API credentials (CANOPY_CLIENT_ID, CANOPY_CLIENT_SECRET, CANOPY_TEAM_ID)');
    }

    // Parse request
    const body: MonitoringRequest = req.method === 'POST'
      ? await req.json()
      : { action: new URL(req.url).searchParams.get('action') as MonitoringRequest['action'] || 'list' };

    logger.info('Monitoring API request', { action: body.action, pullId: body.pull_id });

    switch (body.action) {
      case 'list':
        // List all pulls with monitoring status
        return await listMonitorablePulls(supabase, corsHeaders);

      case 'refresh':
        // Trigger refresh for a specific pull
        if (!body.pull_id && !body.canopy_pull_id) {
          throw new ValidationError('pull_id or canopy_pull_id required for refresh');
        }
        return await triggerRefresh(
          supabase,
          canopyClientId,
          canopyClientSecret,
          canopyTeamId,
          body.pull_id,
          body.canopy_pull_id,
          corsHeaders
        );

      case 'check_due':
        // Check which pulls are due for refresh
        return await checkDueForRefresh(supabase, corsHeaders);

      case 'refresh_all_due':
        // Refresh all pulls that are due
        return await refreshAllDue(
          supabase,
          canopyClientId,
          canopyClientSecret,
          canopyTeamId,
          corsHeaders
        );

      default:
        throw new ValidationError(`Unknown action: ${body.action}`);
    }

  } catch (error) {
    logger.error('Monitoring API error', { error: error instanceof Error ? error.message : String(error) });
    return createErrorResponse(error, corsHeaders);
  }
});

// ============================================================================
// LIST MONITORABLE PULLS
// ============================================================================

async function listMonitorablePulls(
  supabase: ReturnType<typeof createClient>,
  corsHeaders: Record<string, string>
) {
  // Get all completed pulls with monitoring info
  const { data: pulls, error } = await supabase
    .from('canopy_pulls')
    .select(`
      id,
      canopy_pull_id,
      status,
      lead_id,
      account_id,
      completed_at,
      policy_count,
      carrier_count,
      metadata,
      canopy_monitorings (
        id,
        status,
        last_refresh_at,
        next_refresh_due,
        refresh_count,
        reconnect_required_at
      )
    `)
    .in('status', ['complete', 'monitoring_active', 'monitoring_reconnect_needed'])
    .order('completed_at', { ascending: false });

  if (error) {
    logger.error('Failed to fetch pulls', { error: error.message });
    throw error;
  }

  // Enrich with monitoring status
  const enrichedPulls = pulls?.map(pull => {
    const monitoring = pull.canopy_monitorings?.[0];
    const nextDue = monitoring?.next_refresh_due
      ? new Date(monitoring.next_refresh_due)
      : pull.completed_at
        ? new Date(new Date(pull.completed_at).getTime() + MIN_REFRESH_DAYS * 24 * 60 * 60 * 1000)
        : null;

    const isDue = nextDue ? nextDue <= new Date() : false;

    return {
      ...pull,
      monitoring_status: monitoring?.status || 'not_enrolled',
      last_refresh: monitoring?.last_refresh_at,
      next_refresh_due: nextDue?.toISOString(),
      is_due_for_refresh: isDue,
      requires_reconnect: monitoring?.status === 'reconnect_needed',
      refresh_count: monitoring?.refresh_count || 0,
    };
  });

  logger.info('Listed monitorable pulls', { count: enrichedPulls?.length || 0 });

  return new Response(JSON.stringify({
    success: true,
    pulls: enrichedPulls,
    total: enrichedPulls?.length || 0,
    due_count: enrichedPulls?.filter(p => p.is_due_for_refresh).length || 0,
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// ============================================================================
// TRIGGER REFRESH FOR SINGLE PULL
// ============================================================================

async function triggerRefresh(
  supabase: ReturnType<typeof createClient>,
  clientId: string,
  clientSecret: string,
  teamId: string,
  pullId?: string,
  canopyPullId?: string,
  corsHeaders: Record<string, string> = {}
) {
  // Get the pull record
  let pull;
  if (pullId) {
    const { data, error } = await supabase
      .from('canopy_pulls')
      .select('id, canopy_pull_id, status')
      .eq('id', pullId)
      .single();

    if (error || !data) {
      throw new ValidationError(`Pull not found: ${pullId}`);
    }
    pull = data;
  } else if (canopyPullId) {
    const { data, error } = await supabase
      .from('canopy_pulls')
      .select('id, canopy_pull_id, status')
      .eq('canopy_pull_id', canopyPullId)
      .single();

    if (error || !data) {
      throw new ValidationError(`Pull not found: ${canopyPullId}`);
    }
    pull = data;
  }

  if (!pull) {
    throw new ValidationError('Pull not found');
  }

  logger.info('Triggering refresh for pull', { pullId: pull.id, canopyPullId: pull.canopy_pull_id });

  // Check if already being refreshed
  const { data: existingMonitoring } = await supabase
    .from('canopy_monitorings')
    .select('id, status')
    .eq('pull_id', pull.id)
    .single();

  if (existingMonitoring?.status === 'refreshing') {
    return new Response(JSON.stringify({
      success: false,
      message: 'Refresh already in progress',
      status: 'refreshing'
    }), {
      status: 409,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Call Canopy Monitoring API to trigger refresh
  // API endpoint: POST /teams/{teamId}/monitoring/pulls/{pullId}/refresh
  const refreshUrl = `${CANOPY_API_BASE}/teams/${teamId}/monitoring/pulls/${pull.canopy_pull_id}/refresh`;

  logger.info('Calling Canopy refresh API', { url: refreshUrl });

  const response = await fetch(refreshUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'x-canopy-client-id': clientId,
      'x-canopy-client-secret': clientSecret,
    },
  });

  const responseText = await response.text();
  let responseData;
  try {
    responseData = JSON.parse(responseText);
  } catch {
    responseData = { raw: responseText };
  }

  logger.info('Canopy refresh response', {
    status: response.status,
    data: JSON.stringify(responseData).substring(0, 500)
  });

  if (response.ok) {
    // Update monitoring record
    const now = new Date().toISOString();
    const nextDue = new Date(Date.now() + MIN_REFRESH_DAYS * 24 * 60 * 60 * 1000).toISOString();

    await supabase.from('canopy_monitorings').upsert({
      pull_id: pull.id,
      status: 'refreshing',
      last_refresh_at: now,
      next_refresh_due: nextDue,
      refresh_count: (existingMonitoring?.refresh_count || 0) + 1,
      updated_at: now,
    }, {
      onConflict: 'pull_id'
    });

    // Update pull status
    await supabase.from('canopy_pulls').update({
      status: 'monitoring_active',
      updated_at: now,
    }).eq('id', pull.id);

    return new Response(JSON.stringify({
      success: true,
      message: 'Refresh triggered successfully',
      pull_id: pull.id,
      canopy_pull_id: pull.canopy_pull_id,
      next_refresh_due: nextDue,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } else {
    // Handle error
    const errorMessage = responseData.error?.message || responseData.message || 'Unknown error';

    // Check if reconnect is required
    if (response.status === 401 || responseData.error?.code === 'RECONNECT_REQUIRED') {
      await supabase.from('canopy_monitorings').upsert({
        pull_id: pull.id,
        status: 'reconnect_needed',
        reconnect_required_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'pull_id'
      });

      await supabase.from('canopy_pulls').update({
        status: 'monitoring_reconnect_needed',
        updated_at: new Date().toISOString(),
      }).eq('id', pull.id);

      return new Response(JSON.stringify({
        success: false,
        error: 'Reconnect required - consumer must re-authenticate with carrier',
        status: 'reconnect_needed',
        pull_id: pull.id,
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    logger.error('Canopy refresh failed', { status: response.status, error: errorMessage });

    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
      canopy_response: responseData,
    }), {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// ============================================================================
// CHECK WHICH PULLS ARE DUE FOR REFRESH
// ============================================================================

async function checkDueForRefresh(
  supabase: ReturnType<typeof createClient>,
  corsHeaders: Record<string, string>
) {
  const now = new Date().toISOString();

  // Get pulls where:
  // 1. next_refresh_due has passed, OR
  // 2. No monitoring record but completed > 30 days ago
  const thirtyDaysAgo = new Date(Date.now() - MIN_REFRESH_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Pulls with monitoring records that are due
  const { data: dueWithMonitoring, error: error1 } = await supabase
    .from('canopy_monitorings')
    .select(`
      pull_id,
      status,
      last_refresh_at,
      next_refresh_due,
      canopy_pulls!inner (
        id,
        canopy_pull_id,
        lead_id,
        account_id,
        status
      )
    `)
    .lte('next_refresh_due', now)
    .neq('status', 'reconnect_needed')
    .neq('status', 'refreshing');

  // Completed pulls without monitoring records (older than 30 days)
  // Use RPC or subquery approach since .is() doesn't work for related tables
  const { data: dueWithoutMonitoring, error: error2 } = await supabase
    .rpc('get_pulls_without_monitoring', {
      p_completed_before: thirtyDaysAgo
    });

  if (error1 || error2) {
    logger.error('Failed to check due pulls', { error1: error1?.message, error2: error2?.message });
    throw error1 || error2;
  }

  const duePulls = [
    ...(dueWithMonitoring?.map(m => ({
      pull_id: m.pull_id,
      canopy_pull_id: m.canopy_pulls?.canopy_pull_id,
      lead_id: m.canopy_pulls?.lead_id,
      last_refresh: m.last_refresh_at,
      due_since: m.next_refresh_due,
    })) || []),
    ...(dueWithoutMonitoring?.map(p => ({
      pull_id: p.id,
      canopy_pull_id: p.canopy_pull_id,
      lead_id: p.lead_id,
      last_refresh: null,
      due_since: thirtyDaysAgo,
    })) || []),
  ];

  logger.info('Checked due pulls', { dueCount: duePulls.length });

  return new Response(JSON.stringify({
    success: true,
    due_pulls: duePulls,
    count: duePulls.length,
    checked_at: now,
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// ============================================================================
// REFRESH ALL DUE PULLS (BATCH OPERATION)
// ============================================================================

async function refreshAllDue(
  supabase: ReturnType<typeof createClient>,
  clientId: string,
  clientSecret: string,
  teamId: string,
  corsHeaders: Record<string, string>
) {
  // First check which are due
  const now = new Date();
  const thirtyDaysAgo = new Date(Date.now() - MIN_REFRESH_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Get due pulls
  const { data: dueMonitorings } = await supabase
    .from('canopy_monitorings')
    .select('pull_id, canopy_pulls!inner(canopy_pull_id)')
    .lte('next_refresh_due', now.toISOString())
    .neq('status', 'reconnect_needed')
    .neq('status', 'refreshing')
    .limit(10); // Limit batch size

  const { data: duePullsWithoutMonitoring } = await supabase
    .from('canopy_pulls')
    .select('id, canopy_pull_id')
    .eq('status', 'complete')
    .lte('completed_at', thirtyDaysAgo)
    .limit(10);

  const pullsToRefresh = [
    ...(dueMonitorings?.map(m => ({
      pull_id: m.pull_id,
      canopy_pull_id: m.canopy_pulls?.canopy_pull_id
    })) || []),
    ...(duePullsWithoutMonitoring?.map(p => ({
      pull_id: p.id,
      canopy_pull_id: p.canopy_pull_id
    })) || []),
  ].slice(0, 10); // Max 10 at a time

  logger.info('Starting batch refresh', { count: pullsToRefresh.length });

  const results = [];
  for (const pull of pullsToRefresh) {
    try {
      // Call refresh for each pull
      const refreshUrl = `${CANOPY_API_BASE}/teams/${teamId}/monitoring/pulls/${pull.canopy_pull_id}/refresh`;

      const response = await fetch(refreshUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'x-canopy-client-id': clientId,
          'x-canopy-client-secret': clientSecret,
        },
      });

      const success = response.ok;

      if (success) {
        const nextDue = new Date(Date.now() + MIN_REFRESH_DAYS * 24 * 60 * 60 * 1000).toISOString();

        await supabase.from('canopy_monitorings').upsert({
          pull_id: pull.pull_id,
          status: 'refreshing',
          last_refresh_at: now.toISOString(),
          next_refresh_due: nextDue,
          updated_at: now.toISOString(),
        }, {
          onConflict: 'pull_id'
        });
      }

      results.push({
        pull_id: pull.pull_id,
        canopy_pull_id: pull.canopy_pull_id,
        success,
        status: response.status,
      });

      // Rate limit - wait 1 second between requests
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      logger.error('Failed to refresh pull', {
        pullId: pull.pull_id,
        error: error instanceof Error ? error.message : String(error)
      });
      results.push({
        pull_id: pull.pull_id,
        canopy_pull_id: pull.canopy_pull_id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const successCount = results.filter(r => r.success).length;
  logger.info('Batch refresh completed', { total: results.length, success: successCount });

  return new Response(JSON.stringify({
    success: true,
    refreshed: successCount,
    total: results.length,
    results,
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
