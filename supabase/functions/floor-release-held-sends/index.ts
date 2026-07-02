import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { hashClientSendPayload } from '../_shared/clientSendApprovalGate.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { createErrorResponse, ValidationError } from '../_shared/error-handler.ts';
import { createLogger } from '../_shared/logger.ts';
import {
  readSendSurfaceFromStoredPayload,
  releaseHeldClientSend,
  stripFloorSendMetadata,
  type StageClientSendDeps,
  type StoredSendPayload,
} from '../_shared/floor/stageClientSend.ts';
import { createSupabasePolicyInForceGuard } from '../_shared/floor/supabasePolicyInForceGuard.ts';
import { createSupabaseFloorRecipientGuards } from '../_shared/floor/supabaseFloorRecipientGuards.ts';
import type { FloorClientSendApproval, Tier3EmailSurface } from '../_shared/floor/types.ts';

const logger = createLogger('floor-release-held-sends');

const STUCK_HOLD_GRACE_MS = 10 * 60 * 1000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

function isCockpitEnabled(): boolean {
  const value = Deno.env.get('FLOOR_COCKPIT_ENABLED') ?? '';
  return value === 'true' || value === '1';
}

function isClientSendEnabled(): boolean {
  const value = Deno.env.get('FLOOR_CLIENT_SEND_ENABLED') ?? '';
  return value === 'true' || value === '1';
}

function mapApprovalRow(row: Record<string, unknown>): FloorClientSendApproval {
  return {
    id: row.id as string,
    work_request_id: row.work_request_id as string,
    approver_id: row.approver_id as string,
    status: row.status as FloorClientSendApproval['status'],
    hold_until: (row.hold_until as string | null) ?? null,
    recipient: row.recipient as string,
    recipient_basis: row.recipient_basis as FloorClientSendApproval['recipient_basis'],
    send_payload: row.send_payload as StoredSendPayload,
    created_at: row.created_at as string,
  };
}

function tier3FunctionPath(surface: Tier3EmailSurface): string {
  return surface === 'send-id-card-email' ? 'send-id-card-email' : 'send-coi-email';
}

async function recordSystemFeedback(
  supabase: ReturnType<typeof createClient>,
  row: {
    work_request_id: string;
    play_id: string;
    play_version: string;
    verb: 'release' | 'send_success' | 'send_failure';
    actor_id: string;
  },
): Promise<void> {
  const { error } = await supabase.from('feedback_events').insert(row);
  if (error) {
    logger.warn('feedback_events insert failed', { verb: row.verb, message: error.message });
  }
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

    if (!isClientSendEnabled()) {
      return new Response(
        JSON.stringify({
          ok: true,
          skipped: true,
          reason: 'FLOOR_CLIENT_SEND_ENABLED is off; held sends were not released',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const cronSecret = Deno.env.get('CRON_SECRET');
    if (!supabaseUrl || !supabaseServiceKey || !anonKey) {
      throw new ValidationError('Server configuration error');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const now = new Date();
    const nowIso = now.toISOString();
    const stuckCutoffIso = new Date(now.getTime() - STUCK_HOLD_GRACE_MS).toISOString();

    const { data: stuckRows, error: stuckError } = await supabase
      .from('floor_client_send_approvals')
      .select('id, work_request_id, hold_until')
      .eq('status', 'held')
      .lt('hold_until', stuckCutoffIso)
      .limit(50);

    if (stuckError) throw new ValidationError(stuckError.message);

    const { data: heldRows, error: heldError } = await supabase
      .from('floor_client_send_approvals')
      .select('*, automation_work_requests!inner(id, status, play_id, play_version, agency_workspace_id)')
      .eq('status', 'held')
      .lte('hold_until', nowIso)
      .neq('automation_work_requests.status', 'killed')
      .order('hold_until', { ascending: true })
      .limit(25);

    if (heldError) throw new ValidationError(heldError.message);

    const policyInForceGuard = createSupabasePolicyInForceGuard(supabase);
    const recipientGuards = createSupabaseFloorRecipientGuards(supabase);
    const approvals = (heldRows ?? []).map((row) => {
      const mapped = mapApprovalRow(row as Record<string, unknown>);
      const wr = row.automation_work_requests as {
        status?: string;
        play_id?: string;
        play_version?: string;
        agency_workspace_id?: string;
      } | null;
      return {
        approval: mapped,
        workRequestStatus: wr?.status ?? null,
        playId: wr?.play_id ?? 'unknown',
        playVersion: wr?.play_version ?? '0.0.0',
        agencyWorkspaceId: wr?.agency_workspace_id ?? null,
      };
    });

    const results: Array<Record<string, unknown>> = [];

    for (const { approval: seed, playId, playVersion, agencyWorkspaceId } of approvals) {
      let current = seed;
      const deps: StageClientSendDeps = {
        now: () => new Date(),
        readApproval: async (approvalId) => {
          if (approvalId !== current.id) return null;
          const { data } = await supabase
            .from('floor_client_send_approvals')
            .select('*')
            .eq('id', approvalId)
            .maybeSingle();
          if (!data) return null;
          current = mapApprovalRow(data as Record<string, unknown>);
          return current;
        },
        updateApproval: async (approvalId, patch) => {
          const { data, error } = await supabase
            .from('floor_client_send_approvals')
            .update(patch)
            .eq('id', approvalId)
            .select('*')
            .single();
          if (error) throw new Error(error.message);
          current = mapApprovalRow(data as Record<string, unknown>);
          return current;
        },
        assertRecipientOnFile: recipientGuards.assertRecipientOnFile,
        assertCertificateAccess: async () => {},
        assertPolicyInForce: policyInForceGuard,
        assertExternalRecipientAllowed: recipientGuards.assertExternalRecipientAllowedForWorkRequest,
        assertWorkRequestNotKilled: async (workRequestId) => {
          const { data } = await supabase
            .from('automation_work_requests')
            .select('status')
            .eq('id', workRequestId)
            .maybeSingle();
          if (data?.status === 'killed') {
            await supabase
              .from('floor_client_send_approvals')
              .update({ status: 'killed' })
              .eq('id', seed.id)
              .in('status', ['approved', 'held']);
            throw new Error('work_request_killed');
          }
        },
        mintFloorFenceApproval: {
          hashPayload: (surface, payload) => hashClientSendPayload(surface, payload),
          insertClientSendApproval: async (row) => {
            const { error } = await supabase.from('client_send_approvals').insert(row);
            if (error) throw new Error(error.message);
          },
        },
        invokeTier3EmailSend: async (surface, payload) => {
          const body = stripFloorSendMetadata(payload);
          const requestPayload = payload.client_send_approval ? payload : body;

          const response = await fetch(`${supabaseUrl}/functions/v1/${tier3FunctionPath(surface)}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${anonKey}`,
              ...(cronSecret ? { 'X-Cron-Secret': cronSecret } : {}),
            },
            body: JSON.stringify(requestPayload),
          });
          const responseBody = await response.json().catch(() => ({})) as Record<string, unknown>;
          if (!response.ok) {
            logger.error(`${surface} failed`, {
              approvalId: seed.id,
              status: response.status,
              body: responseBody,
            });
            return { success: false };
          }
          return {
            success: responseBody.success === true,
            messageId: typeof responseBody.messageId === 'string'
              ? responseBody.messageId
              : typeof responseBody.id === 'string'
                ? responseBody.id
                : undefined,
          };
        },
        logEmail: async ({ workRequestId, messageId, success, surface }) => {
          const { error } = await supabase.from('email_log').insert({
            type: surface === 'send-id-card-email' ? 'id_card' : 'coi',
            to_email: current.recipient,
            subject: surface === 'send-id-card-email' ? 'Floor ID card release' : 'Floor COI release',
            sent_by: current.approver_id,
            agency_workspace_id: agencyWorkspaceId,
            resend_id: messageId ?? null,
            metadata: {
              work_request_id: workRequestId,
              surface,
              success,
            },
          });
          if (error) {
            throw new Error(`email_log insert failed: ${error.message}`);
          }
        },
      };

      try {
        const surface = readSendSurfaceFromStoredPayload(seed.send_payload as StoredSendPayload);
        await recordSystemFeedback(supabase, {
          work_request_id: seed.work_request_id,
          play_id: playId,
          play_version: playVersion,
          verb: 'release',
          actor_id: seed.approver_id,
        });

        const released = await releaseHeldClientSend(seed.id, deps);

        if (released.status === 'skipped_killed') {
          results.push({ approval_id: seed.id, surface, status: 'skipped_killed' });
          continue;
        }

        const sendVerb = released.status === 'sent' ? 'send_success' : 'send_failure';
        await recordSystemFeedback(supabase, {
          work_request_id: seed.work_request_id,
          play_id: playId,
          play_version: playVersion,
          verb: sendVerb,
          actor_id: seed.approver_id,
        });

        results.push({ approval_id: seed.id, surface, ...released });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === 'work_request_killed') {
          results.push({ approval_id: seed.id, status: 'skipped_killed', reason: 'work_request_killed' });
          continue;
        }
        logger.error('releaseHeldClientSend failed', { approvalId: seed.id, message });
        await recordSystemFeedback(supabase, {
          work_request_id: seed.work_request_id,
          play_id: playId,
          play_version: playVersion,
          verb: 'send_failure',
          actor_id: seed.approver_id,
        });
        results.push({ approval_id: seed.id, status: 'failed', error: message });
      }
    }

    const stuck = (stuckRows ?? []).map((row) => ({
      approval_id: row.id,
      work_request_id: row.work_request_id,
      hold_until: row.hold_until,
    }));

    if (stuck.length > 0) {
      logger.warn('Stuck held sends detected', { count: stuck.length, stuck });
    }

    logger.info('Held send release pass complete', { count: results.length, stuck_count: stuck.length });

    return new Response(
      JSON.stringify({
        ok: true,
        processed: results.length,
        stuck_count: stuck.length,
        stuck,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return createErrorResponse(error, corsHeaders);
  }
});
