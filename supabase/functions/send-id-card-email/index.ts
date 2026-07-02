/**
 * Send ID Card Email Edge Function
 *
 * Sends proof-of-insurance / ID card emails via Resend with Fence approval gate.
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

interface SendIdCardEmailRequest {
  to: string;
  policyNumber: string;
  idCardUrl: string;
  insuredName: string;
}

interface ResendEmailResponse {
  id: string;
}

interface ResendErrorResponse {
  statusCode: number;
  message: string;
  name: string;
}

const SENDER_NAME = 'Lewis Insurance';
const SENDER_EMAIL = 'documents@lewisinsurance.ai';

async function sendEmailViaResend(
  apiKey: string,
  {
    from,
    to,
    subject,
    html,
  }: {
    from: string;
    to: string[];
    subject: string;
    html: string;
  },
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });

    if (!response.ok) {
      const errorData: ResendErrorResponse = await response.json();
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

function generateIdCardEmailHtml(
  policyNumber: string,
  idCardUrl: string,
  insuredName: string,
): string {
  const escapeHtml = (text: string) => text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const safePolicyNumber = escapeHtml(policyNumber);
  const safeInsuredName = escapeHtml(insuredName);
  const safeUrl = encodeURI(idCardUrl);

  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background-color: #0066cc; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
      .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
      .button { display: inline-block; padding: 12px 24px; background-color: #0066cc; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
      .details { background-color: white; padding: 20px; border-radius: 4px; margin: 20px 0; border-left: 4px solid #0066cc; }
      .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
    </style>
  </head>
  <body>
    <div class="header"><h1>Insurance ID Card</h1></div>
    <div class="content">
      <p>Dear ${safeInsuredName},</p>
      <p>Your insurance ID card is ready.</p>
      <div class="details">
        <strong>Policy Number:</strong> ${safePolicyNumber}<br>
        <strong>Named Insured:</strong> ${safeInsuredName}
      </div>
      <p style="text-align: center;">
        <a href="${safeUrl}" class="button" target="_blank">View ID Card</a>
      </p>
      <p>Please keep this card accessible for proof of insurance. The download link expires shortly for your security.</p>
      <p>Best regards,<br>Lewis Insurance</p>
      <div class="footer">
        <p>This is an automated message. Please do not reply directly to this email.</p>
      </div>
    </div>
  </body>
</html>`;
}

const handler = async (req: Request): Promise<Response> => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestBody: SendIdCardEmailRequest & Record<string, unknown> = await req.json();
    const floorReleaseMarker = readClientSendApprovalMarker(requestBody);
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
      if (authResult instanceof Response) return authResult;
      user = authResult;
    }

    const rateLimitResult = await checkRateLimit(
      supabase,
      'send-id-card-email',
      user.id,
      RATE_LIMITS.email,
    );
    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult, corsHeaders);
    }

    const env = validateEnvVars({
      RESEND_API_KEY: 'Resend API key for email sending',
    });

    const { to, policyNumber, idCardUrl, insuredName } = requestBody;

    if (!to || !policyNumber || !idCardUrl || !insuredName) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: to, policyNumber, idCardUrl, insuredName',
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid email address format' }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    try {
      new URL(idCardUrl);
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid ID card URL format' }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const approvalGate = await clientSendApprovalGateResponse({
      surface: 'send-id-card-email',
      payload: requestBody,
      userId: user.id,
      approvalStore: createSupabaseClientSendApprovalStore(supabase),
      corsHeaders,
    });
    if (approvalGate) return approvalGate;

    console.info(`Sending ID card for policy ${policyNumber} to ${to} (user: ${user.id})`);

    const from = `${SENDER_NAME} <${SENDER_EMAIL}>`;
    const html = generateIdCardEmailHtml(policyNumber, idCardUrl, insuredName);
    const result = await sendEmailViaResend(env.RESEND_API_KEY, {
      from,
      to: [to],
      subject: `Insurance ID Card — Policy ${policyNumber}`,
      html,
    });

    if (!result.success) {
      return new Response(
        JSON.stringify({ success: false, error: result.error || 'Failed to send email' }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const { error: emailLogError } = await supabase
      .from('email_log')
      .insert({
        type: 'id_card',
        to_email: to,
        from_email: SENDER_EMAIL,
        subject: `Insurance ID Card — Policy ${policyNumber}`,
        sent_by: user.id,
        resend_id: result.id,
        metadata: { policyNumber, insuredName },
      });

    if (emailLogError) {
      console.error('Failed to log email:', emailLogError);
      return new Response(
        JSON.stringify({ success: false, error: 'email_log_insert_failed' }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, messageId: result.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error: unknown) {
    console.error("Error sending ID card email:", error);
    if (error instanceof Error && error.message.includes('Missing required environment')) {
      return configErrorResponse(error, getCorsHeaders(req.headers.get('origin')));
    }
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...getCorsHeaders(req.headers.get('origin')) } },
    );
  }
};

serve(handler);
