/**
 * Send Certificate Email Edge Function (send-coi-email v2)
 *
 * Single owner: docs/COI Module/coi-module/04-issuance-and-snapshots.md Section 8 (R10).
 *
 * Emails an issued ACORD 25 certificate as a PDF ATTACHMENT pulled from the private
 * coi-certificates bucket. There is NO signed-URL fallback: if the download, the
 * sha256 verification, or the attachment fails, the request fails hard (502) and the
 * certificate is never stamped.
 *
 * Request shape: { certificate_id, to, cc?, note? }
 *
 * Security:
 * - requireAuth + is_staff() + is_agency_member(cert.agency_workspace_id).
 * - Fixed sender coi@lewisinsurance.ai (never caller-overridable).
 * - Rate limited to 20 sends/min/user.
 * - Holder name, insured business name, and certificate number are server-derived from
 *   the certificate row/snapshot, never trusted from the caller.
 * - PII policy: the body carries ONLY the holder name, insured business name, certificate
 *   number, an optional staff note, and agency contact info. No coverage limits, policy
 *   numbers, premiums, addresses, or dates. All substantive content is in the attached PDF.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateEnvVars, configErrorResponse } from '../_shared/env-validator.ts';
import { requireAuth } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { checkRateLimit, RATE_LIMITS, rateLimitExceededResponse } from "../_shared/rate-limit.ts";
import {
  clientSendApprovalGateResponse,
  createSupabaseClientSendApprovalStore,
  isFloorActionApprovalRef,
  readClientSendApprovalMarker,
} from "../_shared/clientSendApprovalGate.ts";
import { verifyCronSecret } from "../_shared/cron-auth.ts";

interface SendCertificateEmailRequest {
  certificate_id: string;
  to: string;
  cc?: string[];
  note?: string;
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

// Fixed sender configuration - DO NOT allow caller to override.
const SENDER_NAME = 'Lewis Insurance';
const SENDER_EMAIL = 'coi@lewisinsurance.ai';

// Agency contact shown in the email footer (public, non-PII).
const AGENCY_CONTACT_NAME = 'Lewis Insurance';
const AGENCY_CONTACT_EMAIL = 'coi@lewisinsurance.ai';

/**
 * Escape HTML to prevent XSS in caller/server-derived strings inserted into the body.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
 * Lowercase hex sha256 of raw bytes.
 */
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Send an email with a single PDF attachment via the Resend REST API (Deno-compatible).
 */
async function sendEmailViaResend(
  apiKey: string,
  {
    from,
    to,
    cc,
    subject,
    html,
    attachments,
  }: {
    from: string;
    to: string[];
    cc?: string[];
    subject: string;
    html: string;
    attachments: ResendAttachment[];
  }
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const payload: Record<string, unknown> = {
      from,
      to,
      subject,
      html,
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
      console.error('Resend API error:', errorData);
      return {
        success: false,
        error: errorData.message || `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data: ResendEmailResponse = await response.json();
    return { success: true, id: data.id };
  } catch (error) {
    console.error('Failed to send email via Resend:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Generate the HTML body. PII policy (Section 8): holder name, insured business name,
 * certificate number, optional staff note, and agency contact only. No limits, policy
 * numbers, premiums, addresses, or dates.
 */
function generateCertificateEmailHtml({
  holderName,
  insuredName,
  certificateNumber,
  note,
}: {
  holderName: string;
  insuredName: string;
  certificateNumber: string;
  note?: string;
}): string {
  const safeHolderName = escapeHtml(holderName);
  const safeInsuredName = escapeHtml(insuredName);
  const safeCertNumber = escapeHtml(certificateNumber);
  const safeNote = note ? escapeHtml(note) : '';

  const noteBlock = safeNote
    ? `
      <div class="note">
        ${safeNote.replace(/\n/g, '<br>')}
      </div>`
    : '';

  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
        line-height: 1.6;
        color: #333;
        max-width: 600px;
        margin: 0 auto;
        padding: 20px;
      }
      .header {
        background-color: #0066cc;
        color: white;
        padding: 30px;
        text-align: center;
        border-radius: 8px 8px 0 0;
      }
      .content {
        background-color: #f9f9f9;
        padding: 30px;
        border-radius: 0 0 8px 8px;
      }
      .details {
        background-color: white;
        padding: 20px;
        border-radius: 4px;
        margin: 20px 0;
        border-left: 4px solid #0066cc;
      }
      .note {
        background-color: white;
        padding: 16px 20px;
        border-radius: 4px;
        margin: 20px 0;
        border-left: 4px solid #999;
        white-space: pre-wrap;
      }
      .footer {
        text-align: center;
        color: #666;
        font-size: 12px;
        margin-top: 30px;
        padding-top: 20px;
        border-top: 1px solid #eee;
      }
    </style>
  </head>
  <body>
    <div class="header">
      <h1>Certificate of Insurance</h1>
    </div>
    <div class="content">
      <p>Dear ${safeHolderName},</p>
      <p>Please find attached the Certificate of Insurance for ${safeInsuredName}.</p>

      <div class="details">
        <strong>Certificate Number:</strong> ${safeCertNumber}<br>
        <strong>Named Insured:</strong> ${safeInsuredName}<br>
        <strong>Certificate Holder:</strong> ${safeHolderName}
      </div>
      ${noteBlock}
      <p>The attached PDF is the official certificate. Please keep it for your records.</p>

      <p>If you have any questions, please contact us.</p>

      <p>Best regards,<br>${escapeHtml(AGENCY_CONTACT_NAME)}</p>

      <div class="footer">
        <p>${escapeHtml(AGENCY_CONTACT_NAME)} - ${escapeHtml(AGENCY_CONTACT_EMAIL)}</p>
        <p>This is an automated message. For questions, please contact your insurance agent.</p>
      </div>
    </div>
  </body>
</html>`;
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  corsHeaders: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface CertificateSnapshot {
  holder?: { name?: string | null } | null;
  insured?: { name?: string | null } | null;
  [key: string]: unknown;
}

interface CertificateRow {
  id: string;
  agency_workspace_id: string | null;
  certificate_number: string;
  status: string;
  storage_bucket: string;
  storage_path: string;
  pdf_sha256: string;
  superseded_by_id: string | null;
  snapshot: CertificateSnapshot | null;
}

const handler = async (req: Request): Promise<Response> => {
  // CORS preflight.
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Service-role client: certificate reads, storage download, and the post-send stamp.
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse the request body once, up front: it is needed to read a Floor
    // service-release marker before the auth decision.
    const body = (await req.json()) as SendCertificateEmailRequest & Record<string, unknown>;

    // Auth: either the Floor service-release path (cron secret + a floor approval
    // marker minted server-side) or an interactive staff caller via requireAuth.
    const floorReleaseMarker = readClientSendApprovalMarker(body);
    const isFloorServiceRelease =
      verifyCronSecret(req) === null
      && Boolean(req.headers.get('X-Cron-Secret'))
      && Boolean(floorReleaseMarker)
      && isFloorActionApprovalRef(floorReleaseMarker!.approval_ref);

    let user: { id: string; email?: string };
    if (isFloorServiceRelease) {
      user = { id: floorReleaseMarker!.approved_by_human_id };
    } else {
      const authResult = await requireAuth(req, supabase, corsHeaders);
      if (authResult instanceof Response) {
        return authResult;
      }
      user = authResult;
    }

    // Rate limit (20 emails/min/user, unchanged, Section 8 step 7).
    const rateLimitResult = await checkRateLimit(
      supabase,
      'send-coi-email',
      user.id,
      RATE_LIMITS.email
    );
    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult, corsHeaders);
    }

    // Validate required environment variables.
    const env = validateEnvVars({
      RESEND_API_KEY: 'Resend API key for email sending',
    });

    const certificateId = body?.certificate_id;
    const to = body?.to;
    const cc = Array.isArray(body?.cc) ? body.cc : undefined;
    const note = typeof body?.note === 'string' ? body.note : undefined;

    if (!certificateId || typeof certificateId !== 'string') {
      return jsonResponse(
        { success: false, error: 'Missing required field: certificate_id' },
        400,
        corsHeaders
      );
    }
    if (!to || typeof to !== 'string' || !emailRegex.test(to)) {
      return jsonResponse(
        { success: false, error: 'Invalid or missing recipient email address' },
        400,
        corsHeaders
      );
    }
    if (cc) {
      const invalidCc = cc.filter((addr) => typeof addr !== 'string' || !emailRegex.test(addr));
      if (invalidCc.length > 0) {
        return jsonResponse(
          { success: false, error: 'Invalid cc email address format' },
          400,
          corsHeaders
        );
      }
    }

    // Section 8 step 1: staff check via a JWT-scoped client (respects the caller's identity).
    const authHeader = req.headers.get('Authorization') ?? '';
    const callerClient = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: isStaff, error: isStaffError } = await callerClient.rpc('is_staff');
    if (isStaffError) {
      console.error('is_staff check failed:', isStaffError);
      return jsonResponse(
        { success: false, error: 'Authorization check failed' },
        403,
        corsHeaders
      );
    }
    if (isStaff !== true) {
      return jsonResponse(
        { success: false, error: 'Forbidden: staff access required' },
        403,
        corsHeaders
      );
    }

    // Section 8 step 1: load the certificate row (service role). 404 if not found.
    const { data: certData, error: certError } = await supabase
      .from('certificates')
      .select(
        'id, agency_workspace_id, certificate_number, status, storage_bucket, storage_path, pdf_sha256, superseded_by_id, snapshot'
      )
      .eq('id', certificateId)
      .maybeSingle();

    if (certError) {
      console.error('Failed to load certificate:', certError);
      return jsonResponse(
        { success: false, error: 'Failed to load certificate' },
        500,
        corsHeaders
      );
    }
    if (!certData) {
      return jsonResponse(
        { success: false, error: 'Certificate not found' },
        404,
        corsHeaders
      );
    }
    const cert = certData as CertificateRow;

    // Section 8 step 1: workspace membership check for the caller.
    const { data: isMember, error: isMemberError } = await callerClient.rpc(
      'is_agency_member',
      { p_agency_id: cert.agency_workspace_id }
    );
    if (isMemberError) {
      console.error('is_agency_member check failed:', isMemberError);
      return jsonResponse(
        { success: false, error: 'Authorization check failed' },
        403,
        corsHeaders
      );
    }
    if (isMember !== true) {
      return jsonResponse(
        { success: false, error: 'Forbidden: not a member of this workspace' },
        403,
        corsHeaders
      );
    }

    // Section 8 step 2: status guard. Only issued/sent are emailable.
    if (cert.status === 'voided') {
      return jsonResponse(
        { success: false, error: 'This certificate has been voided and cannot be emailed' },
        409,
        corsHeaders
      );
    }
    if (cert.status === 'superseded') {
      const { data: successor } = await supabase
        .from('certificates')
        .select('certificate_number')
        .eq('id', cert.superseded_by_id)
        .maybeSingle();
      const successorNumber = successor?.certificate_number ?? 'a newer certificate';
      return jsonResponse(
        {
          success: false,
          error: `This certificate has been superseded by ${successorNumber} and cannot be emailed. Send the current certificate instead.`,
        },
        409,
        corsHeaders
      );
    }
    if (cert.status !== 'issued' && cert.status !== 'sent') {
      return jsonResponse(
        { success: false, error: `Certificates with status '${cert.status}' cannot be emailed` },
        409,
        corsHeaders
      );
    }

    // Server-verified client-send approval gate (repo-wide Fence safety layer, orthogonal
    // to doc 04 Section 8): a direct client-effect send must carry a valid one-time,
    // server-minted approval reference, or be a Floor service release. Returns a 4xx
    // response when the send is not approved; nothing is sent or stamped in that case.
    const approvalGate = await clientSendApprovalGateResponse({
      surface: 'send-coi-email',
      payload: body,
      userId: user.id,
      approvalStore: createSupabaseClientSendApprovalStore(supabase),
      corsHeaders,
    });
    if (approvalGate) return approvalGate;

    // Section 8 step 4: server-derived content. Never trust caller-supplied names.
    const holderName = cert.snapshot?.holder?.name?.trim() || 'Certificate Holder';
    const insuredName = cert.snapshot?.insured?.name?.trim() || 'the named insured';
    const certificateNumber = cert.certificate_number;

    // Section 8 step 3: attachment ONLY from the coi-certificates bucket. No signed-URL fallback.
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from(cert.storage_bucket)
      .download(cert.storage_path);

    if (downloadError || !fileBlob) {
      console.error('Failed to download certificate PDF:', downloadError);
      return jsonResponse(
        { success: false, error: 'Failed to retrieve certificate document' },
        502,
        corsHeaders
      );
    }

    const pdfBytes = new Uint8Array(await fileBlob.arrayBuffer());

    // Section 8 step 3: verify the downloaded bytes hash to the frozen pdf_sha256.
    const computedSha = await sha256Hex(pdfBytes);
    if (computedSha !== cert.pdf_sha256) {
      console.error(
        `Certificate PDF integrity check failed for ${certificateNumber}: expected ${cert.pdf_sha256}, got ${computedSha}`
      );
      return jsonResponse(
        { success: false, error: 'Certificate document integrity check failed' },
        502,
        corsHeaders
      );
    }

    const attachmentContent = bytesToBase64(pdfBytes);
    const attachmentFilename = `ACORD 25 - ${holderName} - ${certificateNumber}.pdf`;

    // Section 8: fixed sender, PII-safe subject and body.
    const from = `${SENDER_NAME} <${SENDER_EMAIL}>`;
    const subject = `Certificate of Insurance ${certificateNumber} - ${insuredName}`;
    const html = generateCertificateEmailHtml({
      holderName,
      insuredName,
      certificateNumber,
      note,
    });

    console.info(
      `Sending certificate ${certificateNumber} to ${to}${cc && cc.length > 0 ? ` (cc: ${cc.join(', ')})` : ''} (user: ${user.id})`
    );

    const result = await sendEmailViaResend(env.RESEND_API_KEY, {
      from,
      to: [to],
      cc,
      subject,
      html,
      attachments: [{ filename: attachmentFilename, content: attachmentContent }],
    });

    if (!result.success) {
      console.error('Failed to send certificate email:', result.error);
      // Nothing is stamped on a send failure.
      return jsonResponse(
        { success: false, error: result.error || 'Failed to send email' },
        502,
        corsHeaders
      );
    }

    console.info(`Certificate email sent successfully: ${result.id}`);

    // Section 8 step 5: stamp delivery via service role. Passes the freeze trigger
    // (sent_to / sent_at / issued -> sent transition are on the allowed list).
    const { error: updateError } = await supabase
      .from('certificates')
      .update({
        sent_to: to,
        sent_at: new Date().toISOString(),
        status: cert.status === 'issued' ? 'sent' : cert.status,
      })
      .eq('id', cert.id);

    if (updateError) {
      // The email was delivered; surface the stamp failure but do not claim failure of the send.
      console.error('Failed to stamp certificate after send:', updateError);
    }

    // Section 8 steps 5-6: replace the (non-existent) email_log insert with a
    // certificate_events 'emailed' row.
    const { error: eventError } = await supabase
      .from('certificate_events')
      .insert({
        certificate_id: cert.id,
        action: 'emailed',
        actor_id: user.id,
        metadata: {
          to,
          cc: cc ?? [],
          resend_id: result.id,
        },
      });

    if (eventError) {
      console.error('Failed to log emailed event:', eventError);
    }

    return jsonResponse(
      {
        success: true,
        messageId: result.id,
        certificate_number: certificateNumber,
        status: cert.status === 'issued' ? 'sent' : cert.status,
      },
      200,
      corsHeaders
    );
  } catch (error: unknown) {
    console.error("Error sending certificate email:", error);

    if (error instanceof Error && error.message.includes('Missing required environment')) {
      return configErrorResponse(error, getCorsHeaders(req.headers.get('origin')));
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req.headers.get('origin')) },
      }
    );
  }
};

serve(handler);
