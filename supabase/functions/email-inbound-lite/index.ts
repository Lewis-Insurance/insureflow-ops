// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildStubInternalPackage } from '../_shared/floor/floorAction.ts';
import { buildIdCardIntakePackage } from '../_shared/floor/buildIdCardIntakePackage.ts';
import { resolveCoiIntakePackage } from '../_shared/floor/plays/coiIssueInbound.ts';
import { ID_CARD_PLAY_ID } from '../_shared/floor/plays/idCardIssueInbound.ts';
import {
  createSupabaseBuildIdCardIntakePackageDb,
} from '../_shared/floor/supabaseIdCardAssetDb.ts';
import {
  buildEmailIdempotencyKey,
  classifyInboundAttachments,
  evaluateFloorEmailIntake,
  isFloorEmailIntakeEnabled,
  playMetadataForAction,
  senderEmailFromInbound,
} from '../_shared/floor/emailInbound.ts';
import type { InboundMessage, ResolveResult } from '../_shared/floor/types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-parse-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PARSE_SECRET = Deno.env.get('INBOUND_PARSE_SECRET');

const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

async function putAndSign(path: string, bytes: Uint8Array, type: string) {
  const { error: upErr } = await sb.storage.from('ticket-attachments').upload(path, bytes, { contentType: type, upsert: true });
  if (upErr) throw upErr;
  const { data: signed } = await sb.storage.from('ticket-attachments').createSignedUrl(path, 60 * 60);
  return signed?.signedUrl || '';
}

async function jsonOrForm(req: Request) {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) return await req.json();
  if (ct.includes('application/x-www-form-urlencoded')) {
    const form = await req.formData();
    const obj: Record<string, any> = {};
    form.forEach((v, k) => (obj[k] = v));
    return obj;
  }
  try { return await req.json(); } catch { return {}; }
}

async function ensureProfileByEmail(email: string) {
  const lower = email.toLowerCase();

  const { data: existingProfile } = await sb
    .from('profiles')
    .select('id')
    .ilike('email', lower)
    .maybeSingle();
  if (existingProfile?.id) return existingProfile.id;

  const { data: accountMatch } = await sb
    .from('accounts')
    .select('id')
    .ilike('email', lower)
    .is('deleted_at', null)
    .maybeSingle();

  const { data: insuredMatch } = await sb
    .from('insured_emails')
    .select('account_id')
    .ilike('email', lower)
    .maybeSingle();

  if (accountMatch?.id || insuredMatch?.account_id) {
    const { data: prof, error } = await sb
      .from('profiles')
      .insert({ email: lower, role: 'customer', full_name: lower.split('@')[0] })
      .select('id')
      .single();
    if (error && String(error.message || '').includes('duplicate')) {
      const { data: retry } = await sb.from('profiles').select('id').ilike('email', lower).maybeSingle();
      return retry?.id ?? null;
    }
    return prof?.id ?? null;
  }

  const { data: prof, error } = await sb
    .from('profiles')
    .insert({ email: lower, role: 'customer', full_name: lower.split('@')[0] })
    .select('id')
    .single();
  if (error && String(error.message || '').includes('duplicate')) {
    const { data: retry } = await sb.from('profiles').select('id').ilike('email', lower).maybeSingle();
    return retry?.id ?? null;
  }
  return prof?.id ?? null;
}

async function allowedSender(email: string) {
  const lower = email.toLowerCase();
  const domain = lower.split('@')[1] || '';
  const { data: exact } = await sb.from('inbound_allowlist').select('id').eq('channel','email').eq('value', lower).maybeSingle();
  if (exact) return true;
  const { data: dom } = await sb.from('inbound_allowlist').select('id').eq('channel','email').eq('value', domain).maybeSingle();
  return !!dom;
}

async function resolveAgencyWorkspaceId(senderEmail: string): Promise<string | null> {
  const fromEnv = Deno.env.get('FLOOR_INBOUND_AGENCY_WORKSPACE_ID')?.trim();
  if (fromEnv) return fromEnv;

  const lower = senderEmail.toLowerCase();
  const { data: accountRow } = await sb
    .from('accounts')
    .select('agency_workspace_id')
    .ilike('email', lower)
    .is('deleted_at', null)
    .not('agency_workspace_id', 'is', null)
    .limit(1)
    .maybeSingle();
  if (accountRow?.agency_workspace_id) return accountRow.agency_workspace_id;

  const { data: insuredRow } = await sb
    .from('insured_emails')
    .select('account_id, accounts!inner(agency_workspace_id)')
    .ilike('email', lower)
    .limit(1)
    .maybeSingle();

  const workspaceId = (insuredRow as { accounts?: { agency_workspace_id?: string } } | null)?.accounts?.agency_workspace_id;
  return workspaceId ?? null;
}

async function resolveAccountViaRpc(agencyWorkspaceId: string, senderEmail: string): Promise<ResolveResult> {
  const { data, error } = await sb.rpc('resolve_account', {
    p_agency_workspace_id: agencyWorkspaceId,
    p_email: senderEmail,
    p_phone: null,
    p_name: null,
  });

  if (error) {
    console.error('resolve_account RPC failed', error);
    return { candidates: [], top: null };
  }

  const payload = (data ?? { candidates: [], top: null }) as ResolveResult;
  return {
    candidates: Array.isArray(payload.candidates) ? payload.candidates : [],
    top: payload.top ?? null,
  };
}

function routerAttachmentMetadata(
  bodyAttachments: any[],
  storedAttachments: Array<{ name?: string; type?: string }>,
): InboundMessage['attachments'] {
  const fromBody = Array.isArray(bodyAttachments)
    ? bodyAttachments.map((attachment) => ({
        contentType: String(attachment.type ?? attachment.contentType ?? 'application/octet-stream'),
        filename: String(attachment.name ?? attachment.filename ?? 'attachment'),
      }))
    : [];

  const fromStored = storedAttachments.map((attachment) => ({
    contentType: String(attachment.type ?? 'application/octet-stream'),
    filename: String(attachment.name ?? 'attachment'),
  }));

  return [...fromBody, ...fromStored];
}

async function createFloorWorkRequest(params: {
  agencyWorkspaceId: string;
  action: string;
  senderIdentity: string;
  messageId: string;
  subject: string;
  from: string;
  to: string;
  resolveResult: ResolveResult;
  workRequestStatus: string;
  attachmentMetadata: InboundMessage['attachments'];
}) {
  const { play_id, play_version } = playMetadataForAction(params.action);
  const idempotencyKey = buildEmailIdempotencyKey(params.messageId);
  const clientRef = params.resolveResult.top?.account_id ?? null;
  const clientOpaqueRef = clientRef ? `account:${clientRef.replace(/-/g, '')}` : null;
  const allowlistRaw = Deno.env.get('FLOOR_INTERNAL_SEND_ALLOWLIST');
  const modesRaw = Deno.env.get('FLOOR_PLAY_ALLOWLIST_MODES');
  let tier3Package =
    params.action === 'coi.issue'
    && clientRef
    && clientOpaqueRef
    && params.workRequestStatus === 'awaiting_approval'
      ? resolveCoiIntakePackage({
          playId: play_id,
          playVersion: play_version,
          clientAccountId: clientRef,
          clientOpaqueRef,
          senderIdentity: params.senderIdentity,
          allowlistRaw,
          authorizedRep: Deno.env.get('FLOOR_AUTHORIZED_REP') ?? undefined,
        })
      : null;

  let idCardFailureSummary: string | null = null;
  if (
    params.action === ID_CARD_PLAY_ID
    && clientRef
    && params.workRequestStatus === 'awaiting_approval'
  ) {
    const built = await buildIdCardIntakePackage(
      {
        agencyWorkspaceId: params.agencyWorkspaceId,
        accountId: clientRef,
        allowlistRaw,
        modesRaw,
        playId: play_id,
        playVersion: play_version,
      },
      createSupabaseBuildIdCardIntakePackageDb(sb),
    );

    if (built.ok && built.tier3) {
      tier3Package = { tier3: true, row: built.package };
    } else if (!built.ok) {
      idCardFailureSummary = built.message;
    } else {
      idCardFailureSummary = 'FLOOR_INTERNAL_SEND_ALLOWLIST or client email required for Tier-3 ID card package.';
    }
  }

  const requestBody = {
    messageId: params.messageId || null,
    subject: params.subject,
    from: params.from,
    to: params.to,
    attachment_count: params.attachmentMetadata?.length ?? 0,
    candidates: params.resolveResult.candidates,
    phase: tier3Package ? 2 : 1,
    tier3_internal_test: Boolean(tier3Package),
    internal_only: !tier3Package,
  };

  const { data: existing, error: existingError } = await sb
    .from('automation_work_requests')
    .select('id, decision_package_id, status')
    .eq('action', params.action)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing?.id) {
    return {
      workRequestId: existing.id,
      idempotent: true,
      status: existing.status,
      decisionPackageId: existing.decision_package_id,
    };
  }

  const intakeAt = new Date().toISOString();

  const { data: workRequest, error: workRequestError } = await sb
    .from('automation_work_requests')
    .insert({
      agency_workspace_id: params.agencyWorkspaceId,
      action: params.action,
      play_id,
      play_version,
      source: 'email',
      sender_identity: params.senderIdentity,
      client_ref: clientRef,
      resolution_confidence: params.resolveResult.top?.confidence ?? null,
      status: params.workRequestStatus,
      idempotency_key: idempotencyKey,
      intake_at: intakeAt,
      request_body: requestBody,
    })
    .select('id')
    .single();

  if (workRequestError) {
    if (workRequestError.code === '23505') {
      const { data: raced } = await sb
        .from('automation_work_requests')
        .select('id, decision_package_id, status')
        .eq('action', params.action)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (raced?.id) {
        return {
          workRequestId: raced.id,
          idempotent: true,
          status: raced.status,
          decisionPackageId: raced.decision_package_id,
        };
      }
    }
    throw workRequestError;
  }

  await sb.from('automation_work_request_events').insert({
    work_request_id: workRequest.id,
    from_state: null,
    to_state: params.workRequestStatus,
    reason: 'email_intake_created',
  });

  let decisionPackageId: string | null = null;

  if (clientRef && clientOpaqueRef && params.workRequestStatus === 'awaiting_approval') {
    const packageRow = tier3Package?.row ?? buildStubInternalPackage({
      playId: play_id,
      playVersion: play_version,
      clientRef: clientOpaqueRef,
      headline: params.action === ID_CARD_PLAY_ID ? 'ID card intake — internal triage' : 'COI intake — internal triage',
      summary: params.action === ID_CARD_PLAY_ID
        ? (idCardFailureSummary ?? `Inbound ID card request from ${params.senderIdentity}. Internal review only — no client send attempted.`)
        : `Inbound COI request from ${params.senderIdentity}. Internal review only — no client send attempted.`,
    });

    const { data: decisionPackage, error: packageError } = await sb
      .from('decision_packages')
      .insert({
        work_request_id: workRequest.id,
        play_id: packageRow.play_id,
        play_version: packageRow.play_version,
        headline: packageRow.headline,
        summary: packageRow.summary,
        risk: packageRow.risk,
        client_ref: clientRef,
        document_ref: packageRow.document_ref,
        fields: packageRow.fields,
        diff: packageRow.diff,
        send_spec: packageRow.send_spec,
      })
      .select('id')
      .single();

    if (packageError) throw packageError;

    decisionPackageId = decisionPackage.id;
    const packageAt = new Date().toISOString();
    await sb
      .from('automation_work_requests')
      .update({
        decision_package_id: decisionPackageId,
        status: 'awaiting_approval',
        first_package_at: packageAt,
      })
      .eq('id', workRequest.id);

    await sb.from('automation_work_request_events').insert({
      work_request_id: workRequest.id,
      from_state: params.workRequestStatus,
      to_state: 'awaiting_approval',
      reason: 'internal_decision_package_created',
    });
  }

  return {
    workRequestId: workRequest.id,
    idempotent: false,
    status: decisionPackageId ? 'awaiting_approval' : params.workRequestStatus,
    decisionPackageId,
    tier3: Boolean(tier3Package),
  };
}

async function processHelpdeskTicket(params: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  messageId: string;
  inReplyTo: string;
  body: Record<string, any>;
  req: Request;
}) {
  const { from, to, subject, text, html, messageId, inReplyTo, body, req } = params;

  if (messageId) {
    const { data: dup } = await sb.from('ticket_messages').select('id').eq('email_message_id', messageId).limit(1);
    if (dup && dup.length) {
      return new Response(JSON.stringify({ success: true, ticketId: null, duplicate: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  let ticketId: string | null = null;
  if (inReplyTo) {
    const { data: parent } = await sb.from('ticket_messages').select('ticket_id').eq('email_message_id', inReplyTo).maybeSingle();
    ticketId = parent?.ticket_id ?? null;
  }

  const requesterId = await ensureProfileByEmail(from);

  if (!ticketId) {
    const { data: recent } = await sb.rpc('find_recent_ticket_by_sender', { p_sender: from });
    ticketId = recent?.id ?? null;
  }

  if (!ticketId) {
    const { data: t, error: terr } = await sb.from('tickets').insert({
      title: subject || `Email from ${from}`,
      status: 'open',
      priority: 'normal',
      channel: 'email',
      requester_id: requesterId,
    }).select('id').single();
    if (terr) throw terr;
    ticketId = t?.id ?? null;
  }

  const content = html?.trim() || text?.trim() || '(no content)';
  const recipients = to ? [to] : [];

  let attachments: any[] = [];
  if (Array.isArray(body.attachments)) {
    for (const a of body.attachments) {
      const b64 = String(a.contentBase64 || '');
      if (!b64) continue;
      try {
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const key = `email/${crypto.randomUUID()}-${a.name || 'file'}`;
        const url = await putAndSign(key, bytes, a.type || 'application/octet-stream');
        attachments.push({ name: a.name, type: a.type, size: bytes.byteLength, url, expiresIn: 3600 });
      } catch (e) {
        console.error('Failed to process attachment:', e);
      }
    }
  }

  const ct = req.headers.get('content-type') || '';
  if (ct.includes('multipart/form-data')) {
    const form = await req.formData();
    const files = [...form.entries()].filter(([k,v]) => v instanceof File) as [string, File][];
    for (const [name, file] of files) {
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        const key = `email/${crypto.randomUUID()}-${file.name || name}`;
        const url = await putAndSign(key, buf, file.type || 'application/octet-stream');
        attachments.push({ name: file.name || name, type: file.type, size: buf.byteLength, url, expiresIn: 3600 });
      } catch (e) {
        console.error('Failed to process attachment:', e);
      }
    }
  }

  const { error: merr } = await sb.from('ticket_messages').insert({
    ticket_id: ticketId,
    author_id: requesterId,
    author_type: 'customer',
    message_type: 'email',
    content,
    is_internal: false,
    email_message_id: messageId || null,
    email_in_reply_to: inReplyTo || null,
    external_sender: from,
    external_recipients: recipients,
    attachments,
  });
  if (merr) throw merr;

  return new Response(JSON.stringify({ success: true, ticketId }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const provided = req.headers.get('x-parse-secret') || req.headers.get('authorization')?.replace('Bearer ','');
    if (PARSE_SECRET && provided !== PARSE_SECRET) return new Response('Unauthorized', { status: 401, headers: corsHeaders });

    const body = await jsonOrForm(req);
    const from = String(body.from || '').trim();
    const to = String(body.to || '').trim();
    const subject = String(body.subject || 'Email inquiry');
    const text = typeof body.text === 'string' ? body.text : '';
    const html = typeof body.html === 'string' ? body.html : '';
    const messageId = String(body.messageId || body['Message-Id'] || '');
    const inReplyTo = String(body.inReplyTo || body['In-Reply-To'] || '');

    if (!from) return new Response('Bad Request', { status: 400, headers: corsHeaders });

    if (!(await allowedSender(from))) {
      console.log('Inbound not allowed:', from);
      return new Response('Not allowed', { status: 403, headers: corsHeaders });
    }

    const attachmentMetadata = routerAttachmentMetadata(body.attachments ?? [], []);

    if (isFloorEmailIntakeEnabled(Deno.env.toObject())) {
      const senderEmail = senderEmailFromInbound(body);
      const agencyWorkspaceId = await resolveAgencyWorkspaceId(senderEmail);

      if (agencyWorkspaceId) {
        const resolveResult = await resolveAccountViaRpc(agencyWorkspaceId, senderEmail);
        const floorDecision = await evaluateFloorEmailIntake({
          body,
          attachments: attachmentMetadata,
          resolveResult,
          routerDeps: {
            allowedSender,
            classifyDocument: classifyInboundAttachments,
          },
        });

        if (floorDecision.handled && floorDecision.action && floorDecision.workRequestStatus) {
          const floorResult = await createFloorWorkRequest({
            agencyWorkspaceId,
            action: floorDecision.action,
            senderIdentity: floorDecision.senderIdentity ?? senderEmail,
            messageId,
            subject,
            from,
            to,
            resolveResult,
            workRequestStatus: floorDecision.workRequestStatus,
            attachmentMetadata,
          });

          return new Response(JSON.stringify({
            success: true,
            floor: true,
            workRequestId: floorResult.workRequestId,
            idempotent: floorResult.idempotent,
            status: floorResult.status,
            decisionPackageId: floorResult.decisionPackageId,
            tier3: floorResult.tier3 ?? false,
            route: floorDecision.route,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }
    }

    return await processHelpdeskTicket({
      from,
      to,
      subject,
      text,
      html,
      messageId,
      inReplyTo,
      body,
      req,
    });
  } catch (e) {
    console.error('email-inbound-lite error', e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
