// get-submission-packet-link: staff-only read of the latest generated GL
// submission packet (Commercial Lines SOW v3, Phase 1b).
//
// Finds the newest packet_generated event for the submission and returns a
// fresh one-hour signed URL for its object in the private submission-packets
// bucket. Auth is the generate-submission-packet stack (requireAuth +
// caller-scoped is_staff() + is_agency_member(account.agency_workspace_id));
// no Fence approval - this is a staff read of their own workspace's artifact,
// not a client-facing send.
//
// Request shape: { submission_id }
// Response: { success, signed_url, storage_path } - 422 NO_PACKET when the
// submission has never generated one.
//
// verify_jwt = true is set at deploy via config.toml; the function still calls
// requireAuth itself for the user object.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { createLogger } from '../_shared/logger.ts';

const logger = createLogger('get-submission-packet-link');

const PACKET_BUCKET = 'submission-packets';

interface GetPacketLinkRequest {
  submission_id: string;
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

  // Service-role client for authoritative reads and the signed URL.
  const admin = createClient(supabaseUrl, serviceKey);

  const authResult = await requireAuth(req, admin, corsHeaders);
  if (authResult instanceof Response) {
    return authResult;
  }

  // JWT-scoped client so is_staff() / is_agency_member() see the caller.
  const caller: SupabaseClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });

  let body: GetPacketLinkRequest;
  try {
    body = (await req.json()) as GetPacketLinkRequest;
  } catch {
    return json(400, { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } });
  }

  try {
    if (typeof body.submission_id !== 'string' || body.submission_id.length === 0) {
      throw fail(422, 'VALIDATION_ERROR', 'submission_id is required');
    }

    const { data: isStaff, error: staffErr } = await caller.rpc('is_staff');
    if (staffErr || isStaff !== true) {
      throw fail(403, 'FORBIDDEN', 'Staff access required');
    }

    const { data: submission, error: subErr } = await admin
      .from('commercial_submissions')
      .select('id, account_id')
      .eq('id', body.submission_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (subErr) {
      throw fail(500, 'INTERNAL_ERROR', `submission lookup failed: ${subErr.message}`);
    }
    if (!submission) {
      throw fail(404, 'NOT_FOUND', 'submission not found');
    }

    const { data: account, error: acctErr } = await admin
      .from('accounts')
      .select('id, agency_workspace_id')
      .eq('id', submission.account_id)
      .maybeSingle();
    if (acctErr) {
      throw fail(500, 'INTERNAL_ERROR', `account lookup failed: ${acctErr.message}`);
    }
    if (!account) {
      throw fail(404, 'NOT_FOUND', 'account not found');
    }

    // Workspace membership (against the account's workspace).
    const { data: isMember, error: memberErr } = await caller.rpc('is_agency_member', {
      p_agency_id: account.agency_workspace_id,
    });
    if (memberErr || isMember !== true) {
      throw fail(403, 'FORBIDDEN', 'not a member of the account workspace');
    }

    // The LATEST generated packet is the one the link serves.
    const { data: packetEvent, error: eventErr } = await admin
      .from('submission_events')
      .select('id, metadata, created_at')
      .eq('submission_id', submission.id)
      .eq('action', 'packet_generated')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (eventErr) {
      throw fail(500, 'INTERNAL_ERROR', `packet event lookup failed: ${eventErr.message}`);
    }
    const storagePath = (packetEvent?.metadata as { storage_path?: unknown } | null)
      ?.storage_path;
    if (!packetEvent || typeof storagePath !== 'string' || storagePath.length === 0) {
      throw fail(422, 'NO_PACKET', 'Generate the packet first');
    }

    const { data: signed, error: signErr } = await admin.storage
      .from(PACKET_BUCKET)
      .createSignedUrl(storagePath, 3600);
    if (signErr || !signed?.signedUrl) {
      logger.error('signed URL generation failed', undefined, {
        storage_path: storagePath,
        error: signErr?.message,
      });
      throw fail(502, 'SIGN_FAILED', 'Could not create a link for the packet');
    }

    return json(200, { success: true, signed_url: signed.signedUrl, storage_path: storagePath });
  } catch (error) {
    if (isStructuredError(error)) {
      return json(error.status, { error: { code: error.code, message: error.message } });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('get-submission-packet-link failed', error instanceof Error ? error : new Error(message));
    return json(500, { error: { code: 'INTERNAL_ERROR', message } });
  }
}

Deno.serve(handle);
