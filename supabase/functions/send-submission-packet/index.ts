// send-submission-packet: the ONE universal send for a GL submission packet
// (Commercial Lines SOW v3, Phase 1b).
//
// Emails the generated ACORD 125 + 126 packet (with its cover page) to the
// wholesaler as a PDF ATTACHMENT pulled from the private submission-packets
// bucket. Clones the send-coi-email conventions: Fence approval consumption
// via the shared server-verified gate, attachment loaded ONLY from the storage
// bucket (NO signed-URL fallback - a missing object is a hard 502), the Resend
// REST helper shape, and append-only event logging. Auth is the
// generate-submission-packet stack: requireAuth + caller-scoped is_staff() +
// is_agency_member(account.agency_workspace_id).
//
// Request shape: { submission_id, to, cc?, note?, client_send_approval }
//   - cc is an optional comma-separated string; every address is validated.
//   - client_send_approval is the one-time server-minted Fence marker; the
//     approval was minted over the canonical payload
//     { submission_id, to, cc, note } (the request body minus the marker),
//     so the consume-side hash matches only the exact approved send.
//
// Side effects on success: submission_events 'packet_sent' row, then the
// write-result status advance packet_ready/signing -> submitted (zero rows is
// fine: an already-submitted/quoted file never regresses).
//
// verify_jwt = true is set at deploy via config.toml; the function still calls
// requireAuth itself for the user object.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { createLogger } from '../_shared/logger.ts';
import { validateEnvVars, configErrorResponse } from '../_shared/env-validator.ts';
import { checkRateLimit, RATE_LIMITS, rateLimitExceededResponse } from '../_shared/rate-limit.ts';
import {
  clientSendApprovalGateResponse,
  createSupabaseClientSendApprovalStore,
} from '../_shared/clientSendApprovalGate.ts';

const logger = createLogger('send-submission-packet');

const PACKET_BUCKET = 'submission-packets';

/** Closed submission statuses: no sends off a settled file. */
const CLOSED_STATUSES = ['bound', 'lost', 'abandoned'];

// Fixed sender identity - never caller-overridable (the send-coi-email
// posture). FROM_EMAIL overrides the address; the fallback is the exemplar's
// fixed sender.
const SENDER_NAME = 'Lewis Insurance';
const DEFAULT_SENDER_EMAIL = 'coi@lewisinsurance.ai';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SendSubmissionPacketRequest {
  submission_id: string;
  to: string;
  /** Optional comma-separated addresses. */
  cc?: string;
  note?: string;
}

/** Structured error carrying the HTTP status (generate-submission-packet taxonomy). */
interface StructuredError {
  status: number;
  code: string;
  message: string;
}

function isStructuredError(e: unknown): e is StructuredError {
  return typeof e === 'object' && e !== null && 'status' in e && 'message' in e;
}

function fail(status: number, code: string, message: string): StructuredError {
  return { status, code, message };
}

interface ResendAttachment {
  filename: string;
  content: string; // base64
}

interface ResendEmailResponse {
  id: string;
}

interface ResendErrorResponse {
  statusCode: number;
  message: string;
  name: string;
}

/**
 * Base64-encode raw bytes without exhausting the call stack on large buffers.
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/**
 * Send an email with a single PDF attachment via the Resend REST API
 * (Deno-compatible; the send-coi-email helper shape, text body instead of html).
 */
async function sendEmailViaResend(
  apiKey: string,
  {
    from,
    to,
    cc,
    subject,
    text,
    attachments,
  }: {
    from: string;
    to: string[];
    cc?: string[];
    subject: string;
    text: string;
    attachments: ResendAttachment[];
  },
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const payload: Record<string, unknown> = {
      from,
      to,
      subject,
      text,
      attachments,
    };
    if (cc && cc.length > 0) {
      payload.cc = cc;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData: ResendErrorResponse = await response.json().catch(() => ({
        statusCode: response.status,
        message: `HTTP ${response.status}: ${response.statusText}`,
        name: 'resend_error',
      }));
      logger.error('Resend API error', undefined, { error: errorData.message });
      return {
        success: false,
        error: errorData.message || `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data: ResendEmailResponse = await response.json();
    return { success: true, id: data.id };
  } catch (error) {
    logger.error('Failed to send email via Resend', error instanceof Error ? error : undefined);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Plain-text body: a fixed professional paragraph, the optional staff note,
 * and the producer signature block from the PRODUCER_* envs. PII policy: the
 * insured business name only - all substantive risk data rides in the PDF.
 */
function buildEmailText({
  insuredName,
  note,
  producerName,
  producerPhone,
  producerEmail,
}: {
  insuredName: string;
  note?: string;
  producerName: string;
  producerPhone: string;
  producerEmail: string;
}): string {
  const paragraphs = [
    `Please find attached the commercial insurance submission for ${insuredName}.`,
    'The packet contains the ACORD 125 Commercial Insurance Application and the ACORD 126 ' +
      'Commercial General Liability Section. Please review and reply with any questions or ' +
      'with anything further you need to provide terms.',
  ];
  if (note && note.trim()) {
    paragraphs.push(note.trim());
  }
  const signature = ['Regards,', '', producerName, producerPhone, producerEmail]
    .filter((line, i) => i < 3 || line.trim().length > 0)
    .join('\n');
  return [...paragraphs, signature].join('\n\n');
}

/** 'YYYY-MM-DD' -> 'MMDDYYYY' for the attachment filename ('' when not ISO). */
function isoToMmDdYyyyCompact(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[2]}${m[3]}${m[1]}` : '';
}

// ---------------------------------------------------------------------------
// The handler
// ---------------------------------------------------------------------------

async function handle(req: Request): Promise<Response> {
  const preflight = handleCors(req);
  if (preflight) {
    return preflight;
  }
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));
  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  // Service-role client for authoritative reads, the storage download, the
  // approval consume, and all writes.
  const admin = createClient(supabaseUrl, serviceKey);

  // --- Step 1: auth (generate-submission-packet pattern) ---------------------
  const authResult = await requireAuth(req, admin, corsHeaders);
  if (authResult instanceof Response) {
    return authResult;
  }
  const user = authResult;

  // JWT-scoped client so is_staff() / is_agency_member() see the caller.
  const caller: SupabaseClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });

  // Rate limit (20 emails/min/user, the send-coi-email posture).
  const rateLimitResult = await checkRateLimit(
    admin,
    'send-submission-packet',
    user.id,
    RATE_LIMITS.email,
  );
  if (!rateLimitResult.allowed) {
    return rateLimitExceededResponse(rateLimitResult, corsHeaders);
  }

  let body: SendSubmissionPacketRequest & Record<string, unknown>;
  try {
    body = (await req.json()) as SendSubmissionPacketRequest & Record<string, unknown>;
  } catch {
    return json(400, { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } });
  }

  try {
    const env = validateEnvVars({
      RESEND_API_KEY: 'Resend API key for email sending',
    });

    // --- Step 2: pure input validation (before the one-time approval burn) ----
    // The Fence approval is consume-once; every check without a side effect
    // runs first so a validation miss never eats an approval (the send-sms
    // gate-ordering precedent).
    if (typeof body.submission_id !== 'string' || body.submission_id.length === 0) {
      throw fail(422, 'VALIDATION_ERROR', 'submission_id is required');
    }
    const to = typeof body.to === 'string' ? body.to.trim() : '';
    if (!emailRegex.test(to)) {
      throw fail(422, 'VALIDATION_ERROR', 'Invalid or missing recipient email address');
    }
    // cc: optional comma-separated string, each address validated.
    let ccList: string[] = [];
    if (body.cc !== undefined && body.cc !== null && body.cc !== '') {
      if (typeof body.cc !== 'string') {
        throw fail(422, 'VALIDATION_ERROR', 'cc must be a comma-separated string');
      }
      ccList = body.cc.split(',').map((addr) => addr.trim()).filter((addr) => addr.length > 0);
      const invalidCc = ccList.filter((addr) => !emailRegex.test(addr));
      if (invalidCc.length > 0) {
        throw fail(422, 'VALIDATION_ERROR', `Invalid cc email address: ${invalidCc.join(', ')}`);
      }
    }
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : undefined;

    const { data: isStaff, error: staffErr } = await caller.rpc('is_staff');
    if (staffErr || isStaff !== true) {
      throw fail(403, 'FORBIDDEN', 'Staff access required');
    }

    // --- Step 3: load submission; refuse closed files --------------------------
    const { data: submission, error: subErr } = await admin
      .from('commercial_submissions')
      .select('id, account_id, status, target_lines, effective_date, wholesaler_name')
      .eq('id', body.submission_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (subErr) {
      throw fail(500, 'INTERNAL_ERROR', `submission lookup failed: ${subErr.message}`);
    }
    if (!submission) {
      throw fail(404, 'NOT_FOUND', 'submission not found');
    }
    if (CLOSED_STATUSES.includes(submission.status)) {
      throw fail(422, 'CLOSED', `submission is ${submission.status}; nothing further to send`);
    }

    const { data: account, error: acctErr } = await admin
      .from('accounts')
      .select('id, name, agency_workspace_id, merged_into_id')
      .eq('id', submission.account_id)
      .maybeSingle();
    if (acctErr) {
      throw fail(500, 'INTERNAL_ERROR', `account lookup failed: ${acctErr.message}`);
    }
    if (!account) {
      throw fail(404, 'NOT_FOUND', 'account not found');
    }
    if (account.merged_into_id) {
      throw fail(422, 'ACCOUNT_MERGED', 'account has been merged; use the surviving account');
    }

    // Workspace membership (against the account's workspace).
    const { data: isMember, error: memberErr } = await caller.rpc('is_agency_member', {
      p_agency_id: account.agency_workspace_id,
    });
    if (memberErr || isMember !== true) {
      throw fail(403, 'FORBIDDEN', 'not a member of the account workspace');
    }

    // Server-derived insured name (never trusted from the caller): the same
    // resolution the packet printed with (legal name, else account name).
    const { data: profile, error: profErr } = await admin
      .from('commercial_profiles')
      .select('legal_name')
      .eq('account_id', submission.account_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (profErr) {
      throw fail(500, 'INTERNAL_ERROR', `profile lookup failed: ${profErr.message}`);
    }
    const insuredName =
      (profile?.legal_name ?? '').trim() || (account.name ?? '').trim() || 'the insured';

    // --- Step 4: the LATEST generated packet is the thing that gets sent -------
    const { data: packetEvent, error: eventLookupErr } = await admin
      .from('submission_events')
      .select('id, metadata, created_at')
      .eq('submission_id', submission.id)
      .eq('action', 'packet_generated')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (eventLookupErr) {
      throw fail(500, 'INTERNAL_ERROR', `packet event lookup failed: ${eventLookupErr.message}`);
    }
    const storagePath = (packetEvent?.metadata as { storage_path?: unknown } | null)
      ?.storage_path;
    if (!packetEvent || typeof storagePath !== 'string' || storagePath.length === 0) {
      throw fail(422, 'NO_PACKET', 'Generate the packet first');
    }

    // --- Step 5: consume the Fence approval ------------------------------------
    // Server-verified client-send approval gate (the repo-wide Fence safety
    // layer): a direct client-effect send must carry a valid one-time,
    // server-minted approval reference bound to this exact payload
    // ({ submission_id, to, cc, note } - the body minus the marker). Returns a
    // 4xx response when the send is not approved; nothing is sent or logged in
    // that case. Status codes mirror send-coi-email because it IS the same gate.
    const approvalGate = await clientSendApprovalGateResponse({
      surface: 'send-submission-packet',
      payload: body,
      userId: user.id,
      approvalStore: createSupabaseClientSendApprovalStore(admin),
      corsHeaders,
    });
    if (approvalGate) return approvalGate;

    // --- Step 6: attachment ONLY from the submission-packets bucket ------------
    // No signed-URL fallback: a missing or unreadable object is a hard 502.
    const { data: fileBlob, error: downloadError } = await admin.storage
      .from(PACKET_BUCKET)
      .download(storagePath);
    if (downloadError || !fileBlob) {
      logger.error('failed to download submission packet', undefined, {
        storage_path: storagePath,
        error: downloadError?.message,
      });
      throw fail(502, 'DOWNLOAD_FAILED', 'Failed to retrieve the submission packet');
    }
    const pdfBytes = new Uint8Array(await fileBlob.arrayBuffer());

    // --- Step 6b: closed-race re-check, LAST thing before the email ------------
    // The email is the one un-compensatable action here: a submission
    // bound/lost by a colleague between load and this point must not reach
    // the wholesaler (review fix - the generate fn's closed-race lesson,
    // applied at the tightest point a non-transactional action allows).
    const { data: statusNow } = await admin
      .from('commercial_submissions')
      .select('status')
      .eq('id', body.submission_id)
      .maybeSingle();
    if (statusNow && CLOSED_STATUSES.includes(statusNow.status)) {
      throw fail(422, 'CLOSED', `submission was closed (${statusNow.status}) before the send completed; nothing was emailed`);
    }

    // --- Step 7: Resend send ----------------------------------------------------
    const senderEmail = Deno.env.get('FROM_EMAIL') || DEFAULT_SENDER_EMAIL;
    const from = `${SENDER_NAME} <${senderEmail}>`;
    const subject = `Commercial Submission - ${insuredName} - General Liability`;
    const text = buildEmailText({
      insuredName,
      note,
      producerName: Deno.env.get('PRODUCER_NAME') ?? 'Lewis Insurance Associates',
      producerPhone: Deno.env.get('PRODUCER_PHONE') ?? '',
      producerEmail: Deno.env.get('PRODUCER_EMAIL') ?? '',
    });

    // ET business day, the generate-submission-packet clock (en-CA -> YYYY-MM-DD).
    const todayIso = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    // Path separators would break the filename; everything else prints as-is.
    const safeInsured = insuredName.replace(/[\\/]/g, '-');
    const attachmentFilename = `GL Submission - ${safeInsured} - ${isoToMmDdYyyyCompact(todayIso)}.pdf`;

    logger.info('sending submission packet', {
      submission_id: submission.id,
      to,
      cc_count: ccList.length,
      storage_path: storagePath,
      user_id: user.id,
    });

    const result = await sendEmailViaResend(env.RESEND_API_KEY, {
      from,
      to: [to],
      cc: ccList.length > 0 ? ccList : undefined,
      subject,
      text,
      attachments: [{ filename: attachmentFilename, content: bytesToBase64(pdfBytes) }],
    });
    if (!result.success) {
      // Nothing is logged or advanced on a send failure.
      throw fail(502, 'SEND_FAILED', result.error || 'Failed to send email');
    }

    // --- Step 8: audit event (append-only). The email is out; a logging miss ---
    // is surfaced but never claims the send failed.
    const { error: eventErr } = await admin.from('submission_events').insert({
      submission_id: submission.id,
      action: 'packet_sent',
      actor_id: user.id,
      metadata: {
        to,
        cc: ccList,
        note: note || null,
        resend_id: result.id,
        storage_path: storagePath,
      },
    });
    if (eventErr) {
      logger.error('failed to log packet_sent event', undefined, {
        submission_id: submission.id,
        error: eventErr.message,
      });
    }

    // --- Step 9: advance the status from the WRITE result ----------------------
    // Every PRE-submitted status -> submitted, one conditional write. draft
    // and intake are included (review fix): a packet whose generate-side
    // freeze/advance failed can still be sent, and a sent submission is by
    // definition submitted - it must not linger in draft. Zero rows is fine
    // (already submitted, quoted, proposed, or beyond) - the .in() list is
    // exactly the pre-submitted set, so a later status never regresses; the
    // pre-email closed re-check already excluded bound/lost/abandoned.
    // Warn-only on failure: the send happened and is event-logged.
    const { error: advanceErr } = await admin
      .from('commercial_submissions')
      .update({ status: 'submitted' })
      .eq('id', submission.id)
      .in('status', ['draft', 'intake', 'packet_ready', 'signing'])
      .select('id');
    if (advanceErr) {
      logger.warn('status advance to submitted failed', {
        submission_id: submission.id,
        error: advanceErr.message,
      });
    }

    return json(200, { success: true, resend_id: result.id, to });
  } catch (error) {
    if (isStructuredError(error)) {
      return json(error.status, { error: { code: error.code, message: error.message } });
    }
    if (error instanceof Error && error.message.includes('Missing required environment')) {
      return configErrorResponse(error, corsHeaders);
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('send-submission-packet failed', error instanceof Error ? error : new Error(message));
    return json(500, { error: { code: 'INTERNAL_ERROR', message } });
  }
}

Deno.serve(handle);
