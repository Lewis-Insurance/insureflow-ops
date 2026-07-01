import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { requireAgencyAuth, requireAgencyMembership } from '../_shared/agency-auth.ts';
import { createErrorResponse, ValidationError } from '../_shared/error-handler.ts';
import { maybeStageClientSendOnApprove } from '../_shared/floor/approveClientSendStaging.ts';
import { buildIdCardIntakePackage } from '../_shared/floor/buildIdCardIntakePackage.ts';
import {
  buildPackagePreview,
  buildStubInternalPackage,
  parseUuidFromOpaqueRef,
  validateFeedbackActor,
  validateFloorActionBody,
} from '../_shared/floor/floorAction.ts';
import { ID_CARD_PLAY_ID } from '../_shared/floor/plays/idCardIssueInbound.ts';
import {
  createSupabaseBuildIdCardIntakePackageDb,
  resolvePlay4OwnerId,
} from '../_shared/floor/supabaseIdCardAssetDb.ts';
import { createSupabasePolicyInForceGuard } from '../_shared/floor/supabasePolicyInForceGuard.ts';
import { createSupabaseFloorRecipientGuards } from '../_shared/floor/supabaseFloorRecipientGuards.ts';
import type { FloorClientSendApproval, SendSpec } from '../_shared/floor/types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function isCockpitEnabled(): boolean {
  const value = Deno.env.get('FLOOR_COCKPIT_ENABLED') ?? '';
  return value === 'true' || value === '1';
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== 'POST') {
      return jsonResponse({ error: 'method_not_allowed' }, 405);
    }

    if (!isCockpitEnabled()) {
      return jsonResponse({ error: 'floor_cockpit_disabled' }, 423);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new ValidationError('Server configuration error');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authResult = await requireAgencyAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) return authResult;
    const user = authResult;

    const body = await req.json();
    const parsed = validateFloorActionBody(body);
    if ('ok' in parsed && parsed.ok === false) {
      return jsonResponse({ error: parsed.error, message: parsed.message }, parsed.status);
    }

    const membershipError = requireAgencyMembership(user, parsed.agency_workspace_id, corsHeaders);
    if (membershipError) return membershipError;

    if (parsed.action === 'create_internal_package') {
      const clientAccountId = parseUuidFromOpaqueRef(parsed.clientRef);
      if (!clientAccountId) {
        return jsonResponse(
          {
            error: 'account_resolution_required',
            message:
              'Phase 0 requires clientRef as account:{32-hex-id} so the internal package can bind to an account row.',
          },
          422,
        );
      }

      const { data: account, error: accountError } = await supabase
        .from('accounts')
        .select('id, agency_workspace_id')
        .eq('id', clientAccountId)
        .eq('agency_workspace_id', parsed.agency_workspace_id)
        .is('deleted_at', null)
        .maybeSingle();

      if (accountError || !account) {
        return jsonResponse(
          {
            error: 'account_not_found',
            message: 'clientRef did not resolve to an account in this workspace.',
          },
          404,
        );
      }

      const policyIdFromRef = parsed.policyRef ? parseUuidFromOpaqueRef(parsed.policyRef) : null;

      let packageRow;
      let ownerId = user.id;
      let requestPhase = 0;

      if (parsed.play_id === ID_CARD_PLAY_ID) {
        ownerId = resolvePlay4OwnerId();
        const built = await buildIdCardIntakePackage(
          {
            agencyWorkspaceId: parsed.agency_workspace_id,
            accountId: clientAccountId,
            allowlistRaw: Deno.env.get('FLOOR_INTERNAL_SEND_ALLOWLIST'),
            modesRaw: Deno.env.get('FLOOR_PLAY_ALLOWLIST_MODES'),
            preferredPolicyId: policyIdFromRef,
            playId: parsed.play_id,
            playVersion: parsed.play_version,
          },
          createSupabaseBuildIdCardIntakePackageDb(supabase),
        );

        if (!built.ok) {
          return jsonResponse(
            { error: built.error, message: built.message },
            built.error === 'account_not_found' ? 404 : 422,
          );
        }

        if (!built.tier3) {
          return jsonResponse(
            {
              error: 'tier3_unavailable',
              message:
                'Tier-3 id.card.issue requires FLOOR_INTERNAL_SEND_ALLOWLIST (internal mode) or account email on file (client mode via FLOOR_PLAY_ALLOWLIST_MODES).',
            },
            422,
          );
        }

        packageRow = built.package;
        requestPhase = 3;
      } else {
        const stub = buildStubInternalPackage({
          playId: parsed.play_id,
          playVersion: parsed.play_version,
          clientRef: parsed.clientRef,
          headline: parsed.headline,
          summary: parsed.summary,
        });
        packageRow = {
          play_id: stub.play_id,
          play_version: stub.play_version,
          headline: stub.headline,
          summary: stub.summary,
          risk: stub.risk,
          client_ref: clientAccountId,
          document_ref: stub.document_ref,
          fields: stub.fields,
          diff: stub.diff,
          send_spec: stub.send_spec,
        };
      }

      const { data: workRequest, error: workRequestError } = await supabase
        .from('automation_work_requests')
        .insert({
          agency_workspace_id: parsed.agency_workspace_id,
          action: parsed.action,
          play_id: parsed.play_id,
          play_version: parsed.play_version,
          source: parsed.source ?? 'crm_button',
          client_ref: clientAccountId,
          owner_id: ownerId,
          status: 'awaiting_approval',
          idempotency_key: parsed.idempotency_key,
          request_body: {
            clientRef: parsed.clientRef,
            policyRef: parsed.policyRef ?? null,
            phase: requestPhase,
            internal_only: requestPhase !== 3,
          },
        })
        .select('id')
        .single();

      if (workRequestError) {
        if (workRequestError.code === '23505') {
          const { data: existing } = await supabase
            .from('automation_work_requests')
            .select('id, decision_package_id')
            .eq('action', parsed.action)
            .eq('idempotency_key', parsed.idempotency_key)
            .maybeSingle();

          if (existing?.decision_package_id) {
            const { data: existingPackage } = await supabase
              .from('decision_packages')
              .select('id, work_request_id, play_id, play_version, headline, summary, risk, client_ref')
              .eq('id', existing.decision_package_id)
              .maybeSingle();

            if (existingPackage) {
              return jsonResponse({
                ok: true,
                idempotent: true,
                workRequestRef: `work_request:${existingPackage.work_request_id.replace(/-/g, '')}`,
                preview: buildPackagePreview({
                  packageId: existingPackage.id,
                  workRequestId: existingPackage.work_request_id,
                  playId: existingPackage.play_id,
                  playVersion: existingPackage.play_version,
                  headline: existingPackage.headline,
                  summary: existingPackage.summary,
                  risk: existingPackage.risk,
                  clientRef: parsed.clientRef,
                }),
              });
            }
          }
        }

        throw new ValidationError(workRequestError.message);
      }

      const { data: decisionPackage, error: packageError } = await supabase
        .from('decision_packages')
        .insert({
          work_request_id: workRequest.id,
          play_id: packageRow.play_id,
          play_version: packageRow.play_version,
          headline: packageRow.headline,
          summary: packageRow.summary,
          risk: packageRow.risk,
          client_ref: clientAccountId,
          document_ref: packageRow.document_ref,
          fields: packageRow.fields,
          diff: packageRow.diff,
          send_spec: packageRow.send_spec,
        })
        .select('id, work_request_id, play_id, play_version, headline, summary, risk')
        .single();

      if (packageError) {
        throw new ValidationError(packageError.message);
      }

      await supabase
        .from('automation_work_requests')
        .update({ decision_package_id: decisionPackage.id, status: 'awaiting_approval' })
        .eq('id', workRequest.id);

      await supabase.from('automation_work_request_events').insert({
        work_request_id: workRequest.id,
        from_state: 'received',
        to_state: 'awaiting_approval',
        actor_id: user.id,
        reason: requestPhase === 3 ? 'phase3_id_card_package_created' : 'phase0_internal_package_created',
      });

      return jsonResponse({
        ok: true,
        workRequestRef: `work_request:${workRequest.id.replace(/-/g, '')}`,
        packageRef: `package:${decisionPackage.id.replace(/-/g, '')}`,
        preview: buildPackagePreview({
          packageId: decisionPackage.id,
          workRequestId: decisionPackage.work_request_id,
          playId: decisionPackage.play_id,
          playVersion: decisionPackage.play_version,
          headline: decisionPackage.headline,
          summary: decisionPackage.summary,
          risk: decisionPackage.risk,
          clientRef: parsed.clientRef,
        }),
      });
    }

    const actorError = validateFeedbackActor(parsed.actor_id, user.id);
    if (actorError) {
      return jsonResponse({ error: actorError.error, message: actorError.message }, actorError.status);
    }

    const workRequestId = parseUuidFromOpaqueRef(parsed.workRequestRef);
    const packageId = parseUuidFromOpaqueRef(parsed.packageRef);
    if (!workRequestId || !packageId) {
      return jsonResponse(
        {
          error: 'opaque_refs_required',
          message: 'workRequestRef and packageRef must encode UUIDs as work_request:{hex} / package:{hex}.',
        },
        400,
      );
    }

    const { data: workRequest, error: workRequestError } = await supabase
      .from('automation_work_requests')
      .select('id, agency_workspace_id, play_id, play_version, status')
      .eq('id', workRequestId)
      .eq('agency_workspace_id', parsed.agency_workspace_id)
      .maybeSingle();

    if (workRequestError || !workRequest) {
      return jsonResponse({ error: 'work_request_not_found', message: 'Work request not found in workspace.' }, 404);
    }

    const { data: decisionPackage, error: packageError } = await supabase
      .from('decision_packages')
      .select('id, work_request_id, play_id, play_version, headline, summary, risk, client_ref, send_spec')
      .eq('id', packageId)
      .eq('work_request_id', workRequestId)
      .maybeSingle();

    if (packageError || !decisionPackage) {
      return jsonResponse({ error: 'package_not_found', message: 'Decision package not found for work request.' }, 404);
    }

    const { data: feedbackEvent, error: feedbackError } = await supabase
      .from('feedback_events')
      .insert({
        work_request_id: workRequestId,
        play_id: workRequest.play_id ?? decisionPackage.play_id,
        play_version: workRequest.play_version ?? decisionPackage.play_version,
        verb: parsed.verb,
        actor_id: user.id,
        field_edits: parsed.field_edits ?? null,
        kill_reason: parsed.kill_reason ?? null,
      })
      .select('id, verb, created_at')
      .single();

    if (feedbackError) {
      throw new ValidationError(feedbackError.message);
    }

    const nextStatus = parsed.verb === 'kill' ? 'killed' : parsed.verb === 'approve' ? 'approved' : 'awaiting_approval';
    await supabase.from('automation_work_requests').update({ status: nextStatus }).eq('id', workRequestId);
    await supabase.from('automation_work_request_events').insert({
      work_request_id: workRequestId,
      from_state: workRequest.status,
      to_state: nextStatus,
      actor_id: user.id,
      reason: `feedback_${parsed.verb}`,
    });

    let sendStaging: Record<string, unknown> | null = null;
    if (parsed.verb === 'approve') {
      const recipientGuards = createSupabaseFloorRecipientGuards(supabase);
      try {
        const staged = await maybeStageClientSendOnApprove({
          workRequestId,
          approverId: user.id,
          sendSpec: decisionPackage.send_spec as SendSpec | null,
          db: {
            async findFloorSendApproval(workRequestId) {
              const { data } = await supabase
                .from('floor_client_send_approvals')
                .select('*')
                .eq('work_request_id', workRequestId)
                .maybeSingle();
              return data ? (data as FloorClientSendApproval) : null;
            },
            async insertFloorSendApproval(row) {
              const { data, error } = await supabase
                .from('floor_client_send_approvals')
                .insert(row)
                .select('*')
                .single();
              if (error) throw new ValidationError(error.message);
              return data as FloorClientSendApproval;
            },
            async updateFloorSendApproval(approvalId, patch) {
              const { data, error } = await supabase
                .from('floor_client_send_approvals')
                .update(patch)
                .eq('id', approvalId)
                .select('*')
                .single();
              if (error) throw new ValidationError(error.message);
              return data as FloorClientSendApproval;
            },
          },
          stageDeps: {
            now: () => new Date(),
            assertRecipientOnFile: recipientGuards.assertRecipientOnFile,
            assertPolicyInForce: createSupabasePolicyInForceGuard(supabase),
            assertExternalRecipientAllowed: recipientGuards.assertExternalRecipientAllowedForWorkRequest,
            invokeTier3EmailSend: async () => ({ success: false }),
            logEmail: async () => {},
          },
        });
        sendStaging = staged as Record<string, unknown>;
      } catch (stagingError) {
        return jsonResponse(
          {
            error: 'send_staging_failed',
            message: stagingError instanceof Error ? stagingError.message : String(stagingError),
          },
          422,
        );
      }
    }

    return jsonResponse({
      ok: true,
      feedbackEventId: feedbackEvent.id,
      verb: feedbackEvent.verb,
      workRequestRef: parsed.workRequestRef,
      packageRef: parsed.packageRef,
      sendStaging,
      preview: buildPackagePreview({
        packageId: decisionPackage.id,
        workRequestId: decisionPackage.work_request_id,
        playId: decisionPackage.play_id,
        playVersion: decisionPackage.play_version,
        headline: decisionPackage.headline,
        summary: decisionPackage.summary,
        risk: decisionPackage.risk,
        clientRef: `account:${decisionPackage.client_ref.replace(/-/g, '')}`,
      }),
    });
  } catch (error) {
    return createErrorResponse(error, corsHeaders);
  }
});
