import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { createErrorResponse, ValidationError } from '../_shared/error-handler.ts';
import { createLogger } from '../_shared/logger.ts';
import { runInternalPlays, type PlayCardsDb } from '../_shared/floor/runInternalPlays.ts';
import { resolveGapRoundoutOwnerId, resolveNonpayWatchOwnerId, resolveOpenItemNudgeOwnerId } from '../_shared/floor/floorOwners.ts';
import { detectNonpayCancelCandidates } from '../_shared/floor/plays/nonpayCancelWatch.ts';
import type { PolicyInForceRow, SuspenseTaskRow } from '../_shared/floor/types.ts';

const logger = createLogger('floor-run-plays');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

function isCockpitEnabled(): boolean {
  const value = Deno.env.get('FLOOR_COCKPIT_ENABLED') ?? '';
  return value === 'true' || value === '1';
}

function resolveAgencyWorkspaceId(body: Record<string, unknown>): string | null {
  const fromBody = typeof body.agency_workspace_id === 'string' ? body.agency_workspace_id.trim() : '';
  if (fromBody) return fromBody;
  const fromEnv = Deno.env.get('FLOOR_INBOUND_AGENCY_WORKSPACE_ID')?.trim() ?? '';
  return fromEnv || null;
}

const ACCOUNT_OWNER_BATCH = 150;

async function loadOwnerByAccountId(
  supabase: ReturnType<typeof createClient>,
  accountIds: string[],
): Promise<Record<string, string | null>> {
  const ownerByAccountId: Record<string, string | null> = {};
  for (let offset = 0; offset < accountIds.length; offset += ACCOUNT_OWNER_BATCH) {
    const chunk = accountIds.slice(offset, offset + ACCOUNT_OWNER_BATCH);
    const { data: accountRows, error: accountError } = await supabase
      .from('accounts')
      .select('id, owner_agent_id')
      .in('id', chunk);
    if (accountError) throw new ValidationError(`accounts: ${accountError.message}`);
    for (const row of accountRows ?? []) {
      ownerByAccountId[row.id as string] = (row.owner_agent_id as string | null) ?? null;
    }
  }
  return ownerByAccountId;
}

function supabasePlayCardsDb(supabase: ReturnType<typeof createClient>): PlayCardsDb {
  return {
    async insertWorkRequest(row) {
      const { data, error } = await supabase.from('automation_work_requests').insert(row).select('id').single();
      if (error) return { error: error.message, code: error.code };
      return { id: data.id as string };
    },
    async findExistingWorkRequest(action, idempotencyKey) {
      const { data } = await supabase
        .from('automation_work_requests')
        .select('decision_package_id')
        .eq('action', action)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      return data ?? null;
    },
    async findPackageId(packageId) {
      const { data } = await supabase.from('decision_packages').select('id').eq('id', packageId).maybeSingle();
      return Boolean(data);
    },
    async insertDecisionPackage(row) {
      const { data, error } = await supabase
        .from('decision_packages')
        .insert(row)
        .select('id, work_request_id')
        .single();
      if (error) return { error: error.message };
      return { id: data.id as string, work_request_id: data.work_request_id as string };
    },
    async linkWorkRequestPackage(workRequestId, packageId) {
      await supabase
        .from('automation_work_requests')
        .update({ decision_package_id: packageId, status: 'awaiting_approval' })
        .eq('id', workRequestId);
    },
    async insertWorkRequestEvent(row) {
      await supabase.from('automation_work_request_events').insert(row);
    },
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cronError = verifyCronSecret(req);
    if (cronError) return cronError;

    if (!isCockpitEnabled()) {
      return new Response(JSON.stringify({ error: 'floor_cockpit_disabled' }), {
        status: 423,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new ValidationError('Server configuration error');
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const agencyWorkspaceId = resolveAgencyWorkspaceId(body as Record<string, unknown>);
    if (!agencyWorkspaceId) {
      return new Response(
        JSON.stringify({
          error: 'agency_workspace_required',
          message: 'Set agency_workspace_id in body or FLOOR_INBOUND_AGENCY_WORKSPACE_ID secret.',
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let play1Limit = typeof body.play1_limit === 'number' ? body.play1_limit : 10;
    let play3Limit = typeof body.play3_limit === 'number' ? body.play3_limit : 10;
    let play4Limit = typeof body.play4_limit === 'number' ? body.play4_limit : 5;
    let play5Limit = typeof body.play5_limit === 'number' ? body.play5_limit : 5;
    let play6Limit = typeof body.play6_limit === 'number' ? body.play6_limit : 5;
    const dryRun = body.dry_run === true;

    if (body.play4_only === true) {
      play1Limit = 0;
      play3Limit = 0;
      play5Limit = 0;
      play6Limit = 0;
    }

    if (body.play5_only === true) {
      play1Limit = 0;
      play3Limit = 0;
      play4Limit = 0;
      play6Limit = 0;
    }

    if (body.play6_only === true) {
      play1Limit = 0;
      play3Limit = 0;
      play4Limit = 0;
      play5Limit = 0;
    }

    const playIds = Array.isArray(body.play_ids)
      ? body.play_ids.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
      : body.play4_only === true
        ? ['coverage.gap.roundout']
        : body.play5_only === true
          ? ['open.item.nudge']
          : body.play6_only === true
            ? ['nonpay.cancel.watch']
            : undefined;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const needPolicies = play1Limit > 0 || play6Limit > 0;
    const needTasks = play3Limit > 0 || play5Limit > 0;
    const needQuotes = play5Limit > 0;
    const needGaps = play4Limit > 0;

    let policyRows: Record<string, unknown>[] | null = null;
    if (needPolicies) {
      const { data, error: policyError } = await supabase
        .from('policy_in_force_status')
        .select('policy_id, account_id, policy_number, in_force, premium, cgl_details, bap_details, evaluated_at')
        .eq('agency_workspace_id', agencyWorkspaceId);
      if (policyError) throw new ValidationError(`policy_in_force_status: ${policyError.message}`);
      policyRows = data;
    }

    let taskRows: Record<string, unknown>[] | null = null;
    if (needTasks) {
      const { data, error: taskError } = await supabase
        .from('tasks')
        .select('id, title, assignee_id, due_at, priority, status, account_id, accounts!inner(agency_workspace_id)')
        .eq('accounts.agency_workspace_id', agencyWorkspaceId)
        .is('deleted_at', null)
        .in('status', ['pending', 'in_progress']);
      if (taskError) throw new ValidationError(`tasks: ${taskError.message}`);
      taskRows = data;
    }

    let gapRows: Record<string, unknown>[] | null = null;
    if (needGaps) {
      const { data, error: gapError } = await supabase
        .from('coverage_gap_opportunities')
        .select('id, account_id, severity, recommended_next_step, rationale')
        .eq('agency_workspace_id', agencyWorkspaceId)
        .eq('status', 'new');
      if (gapError) throw new ValidationError(`coverage_gap_opportunities: ${gapError.message}`);
      gapRows = data;
    }

    let quoteRows: Record<string, unknown>[] | null = null;
    if (needQuotes) {
      const { data, error: quoteError } = await supabase
        .from('quotes')
        .select('id, account_id, status, line_of_business, premium, updated_at, accounts!inner(agency_workspace_id)')
        .eq('accounts.agency_workspace_id', agencyWorkspaceId)
        .eq('status', 'open');
      if (quoteError) throw new ValidationError(`quotes: ${quoteError.message}`);
      quoteRows = data;
    }

    const accountIds = [
      ...new Set(
        [
          ...(policyRows ?? []).map((row) => row.account_id as string | null),
          ...(taskRows ?? []).map((row) => row.account_id as string | null),
          ...(gapRows ?? []).map((row) => row.account_id as string | null),
          ...(quoteRows ?? []).map((row) => row.account_id as string | null),
        ].filter((id): id is string => Boolean(id)),
      ),
    ];

    const policies = (policyRows ?? []) as PolicyInForceRow[];

    let ownerAccountIds = accountIds;
    if (
      play6Limit > 0 &&
      play1Limit === 0 &&
      play3Limit === 0 &&
      play4Limit === 0 &&
      play5Limit === 0
    ) {
      ownerAccountIds = [
        ...new Set(
          detectNonpayCancelCandidates(policies)
            .map((row) => row.account_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
    }

    const ownerByAccountId = ownerAccountIds.length > 0 ? await loadOwnerByAccountId(supabase, ownerAccountIds) : {};
    const tasks: SuspenseTaskRow[] = (taskRows ?? []).map((row) => ({
      id: row.id as string,
      title: row.title as string,
      assignee_id: (row.assignee_id as string | null) ?? null,
      due_at: (row.due_at as string | null) ?? null,
      priority: (row.priority as string) ?? 'medium',
      status: (row.status as string) ?? 'pending',
      account_id: (row.account_id as string | null) ?? null,
      premium_hint: null,
    }));
    const coverageGapOpportunities = (gapRows ?? []).map((row) => ({
      id: row.id as string,
      account_id: row.account_id as string,
      severity: row.severity as 'low' | 'medium' | 'high',
      recommended_next_step: (row.recommended_next_step as string | null) ?? null,
      rationale: (row.rationale as { rule_key?: string; trigger_reason?: string }) ?? {},
    }));
    const openQuotes = (quoteRows ?? []).map((row) => ({
      id: row.id as string,
      account_id: (row.account_id as string | null) ?? null,
      status: row.status as string,
      line_of_business: (row.line_of_business as string | null) ?? null,
      premium: (row.premium as number | null) ?? null,
      updated_at: (row.updated_at as string | null) ?? null,
    }));

    const playInput = {
      agency_workspace_id: agencyWorkspaceId,
      policies,
      tasks,
      coverageGapOpportunities,
      openQuotes,
      play1Limit,
      play3Limit,
      play4Limit,
      play5Limit,
      play6Limit,
      gapRoundoutOwnerId: resolveGapRoundoutOwnerId(),
      openItemNudgeOwnerId: resolveOpenItemNudgeOwnerId(),
      nonpayWatchOwnerId: resolveNonpayWatchOwnerId(),
      ownerByAccountId,
      playIds,
    };

    if (dryRun) {
      const { planInternalPlays } = await import('../_shared/floor/runInternalPlays.ts');
      const planned = planInternalPlays(playInput);
      const gapPlans = planned.plans.filter((plan) => plan.play_id === 'coverage.gap.roundout');
      const nudgePlans = planned.plans.filter((plan) => plan.play_id === 'open.item.nudge');
      const nonpayPlans = planned.plans.filter((plan) => plan.play_id === 'nonpay.cancel.watch');
      return new Response(
        JSON.stringify({
          ok: true,
          dry_run: true,
          planned: planned.plans.length,
          play4_planned: gapPlans.length,
          play5_planned: nudgePlans.length,
          play6_planned: nonpayPlans.length,
          play1_summary: planned.play1_summary,
          play4_summary: planned.play4_summary,
          play5_summary: planned.play5_summary,
          play6_summary: planned.play6_summary,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const result = await runInternalPlays(supabasePlayCardsDb(supabase), playInput);

    logger.info('Floor plays completed', {
      agencyWorkspaceId,
      created: result.created,
      idempotent: result.idempotent,
      planned: result.planned,
    });

    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const response = createErrorResponse(err);
    const headers = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));
    return new Response(response.body, { status: response.status, headers });
  }
});
