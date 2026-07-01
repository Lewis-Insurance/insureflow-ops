import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { createErrorResponse, ValidationError } from '../_shared/error-handler.ts';
import { createLogger } from '../_shared/logger.ts';
import {
  createInternalRecipientGuard,
  parseInternalSendAllowlist,
} from '../_shared/floor/internalSendAllowlist.ts';
import { releaseHeldClientSend, type StageClientSendDeps } from '../_shared/floor/stageClientSend.ts';
import type { FloorClientSendApproval } from '../_shared/floor/types.ts';

const logger = createLogger('floor-release-held-sends');

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
    send_payload: row.send_payload as FloorClientSendApproval['send_payload'],
    created_at: row.created_at as string,
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
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new ValidationError('Server configuration error');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const nowIso = new Date().toISOString();
    const { data: heldRows, error: heldError } = await supabase
      .from('floor_client_send_approvals')
      .select('*')
      .eq('status', 'held')
      .lte('hold_until', nowIso)
      .order('hold_until', { ascending: true })
      .limit(25);

    if (heldError) throw new ValidationError(heldError.message);

    const allowlist = parseInternalSendAllowlist(Deno.env.get('FLOOR_INTERNAL_SEND_ALLOWLIST'));
    const guard = createInternalRecipientGuard(allowlist);
    const approvals = (heldRows ?? []).map((row) => mapApprovalRow(row as Record<string, unknown>));

    const results: Array<Record<string, unknown>> = [];

    for (const seed of approvals) {
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
        assertRecipientOnFile: async () => {},
        assertCertificateAccess: async () => {},
        assertExternalRecipientAllowed: guard,
        invokeSendCOIEmail: async (payload) => {
          const { data, error } = await supabase.functions.invoke('send-coi-email', { body: payload });
          if (error) {
            logger.error('send-coi-email invoke failed', { error: error.message, approvalId: seed.id });
            return { success: false };
          }
          const body = data as Record<string, unknown> | null;
          return {
            success: body?.success === true,
            messageId: typeof body?.messageId === 'string' ? body.messageId : undefined,
          };
        },
        logEmail: async () => {},
      };

      try {
        const released = await releaseHeldClientSend(seed.id, deps);
        results.push({ approval_id: seed.id, ...released });
      } catch (error) {
        logger.error('releaseHeldClientSend failed', {
          approvalId: seed.id,
          message: error instanceof Error ? error.message : String(error),
        });
        results.push({
          approval_id: seed.id,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('Held send release pass complete', { count: results.length });

    return new Response(
      JSON.stringify({ ok: true, processed: results.length, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return createErrorResponse(error, corsHeaders);
  }
});
