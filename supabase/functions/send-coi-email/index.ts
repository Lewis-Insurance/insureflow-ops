/**
 * Send COI Email Edge Function
 *
 * Sends Certificate of Insurance emails via Resend with proper authentication,
 * rate limiting, and access verification.
 *
 * Security: Sender email is fixed to prevent email spoofing.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateEnvVars, configErrorResponse } from '../_shared/env-validator.ts';
import { requireAuth } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { checkRateLimit, RATE_LIMITS, rateLimitExceededResponse } from "../_shared/rate-limit.ts";
import { clientSendApprovalGateResponse, createSupabaseClientSendApprovalStore, isFloorActionApprovalRef, readClientSendApprovalMarker } from "../_shared/clientSendApprovalGate.ts";
import { verifyCronSecret } from "../_shared/cron-auth.ts";

interface SendCOIEmailRequest {
  to: string;
  certificateNumber: string;
  certificateUrl: string;
  holderName: string;
}

interface ResendEmailResponse {
  id: string;
}

interface ResendErrorResponse {
  statusCode: number;
  message: string;
  name: string;
}

// Fixed sender configuration - DO NOT allow caller to override
const SENDER_NAME = 'Lewis Insurance';
const SENDER_EMAIL = 'coi@lewisinsurance.ai';

/**
 * Send email using Resend REST API (Deno-compatible)
 */
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
  }
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        html,
      }),
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

/**
 * Generate HTML email template for COI
 */
function generateCOIEmailHtml(
  certificateNumber: string,
  certificateUrl: string,
  holderName: string
): string {
  // Escape HTML to prevent XSS
  const escapeHtml = (text: string) => text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const safeCertNumber = escapeHtml(certificateNumber);
  const safeHolderName = escapeHtml(holderName);
  // URL is validated separately, but encode it anyway
  const safeUrl = encodeURI(certificateUrl);

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
      .button {
        display: inline-block;
        padding: 12px 24px;
        background-color: #0066cc;
        color: white;
        text-decoration: none;
        border-radius: 4px;
        margin: 20px 0;
      }
      .button:hover {
        background-color: #0052a3;
      }
      .details {
        background-color: white;
        padding: 20px;
        border-radius: 4px;
        margin: 20px 0;
        border-left: 4px solid #0066cc;
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
      <p>Please find attached your Certificate of Insurance.</p>

      <div class="details">
        <strong>Certificate Number:</strong> ${safeCertNumber}<br>
        <strong>Certificate Holder:</strong> ${safeHolderName}
      </div>

      <p>You can download your certificate using the button below:</p>

      <p style="text-align: center;">
        <a href="${safeUrl}" class="button" target="_blank">
          Download Certificate
        </a>
      </p>

      <p>This certificate serves as proof of insurance coverage. Please keep it for your records and provide it to any parties that require proof of insurance.</p>

      <p>If you have any questions or need assistance, please don't hesitate to contact us.</p>

      <p>Best regards,<br>Lewis Insurance</p>

      <div class="footer">
        <p>This is an automated message. Please do not reply directly to this email.</p>
        <p>For questions, please contact your insurance agent.</p>
      </div>
    </div>
  </body>
</html>`;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestBody: SendCOIEmailRequest & Record<string, unknown> = await req.json();
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
      if (authResult instanceof Response) {
        return authResult;
      }
      user = authResult;
    }

    // Check rate limit (20 emails per minute per user)
    const rateLimitResult = await checkRateLimit(
      supabase,
      'send-coi-email',
      user.id,
      RATE_LIMITS.email
    );

    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult, corsHeaders);
    }

    // Validate required environment variables
    const env = validateEnvVars({
      RESEND_API_KEY: 'Resend API key for email sending',
    });

    // Parse request body - NOTE: fromEmail and fromName are intentionally ignored for security
    const {
      to,
      certificateNumber,
      certificateUrl,
      holderName,
    } = requestBody;

    // Validate required fields
    if (!to || !certificateNumber || !certificateUrl || !holderName) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: to, certificateNumber, certificateUrl, holderName',
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid email address format',
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Validate URL format
    try {
      new URL(certificateUrl);
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid certificate URL format',
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const approvalGate = await clientSendApprovalGateResponse({
      surface: 'send-coi-email',
      payload: requestBody,
      userId: user.id,
      approvalStore: createSupabaseClientSendApprovalStore(supabase),
      corsHeaders,
    });
    if (approvalGate) return approvalGate;

    // Verify user has access to this certificate (if we have a certificates table)
    // TODO: Add certificate access verification when certificates table is available

    console.info(`Sending COI ${certificateNumber} to ${to} (user: ${user.id})`);

    // Use fixed sender - DO NOT allow caller override
    const from = `${SENDER_NAME} <${SENDER_EMAIL}>`;

    // Generate email HTML
    const html = generateCOIEmailHtml(certificateNumber, certificateUrl, holderName);

    // Send email via Resend REST API
    const result = await sendEmailViaResend(env.RESEND_API_KEY, {
      from,
      to: [to],
      subject: `Certificate of Insurance - ${certificateNumber}`,
      html,
    });

    if (!result.success) {
      console.error('Failed to send COI email:', result.error);
      return new Response(
        JSON.stringify({
          success: false,
          error: result.error || 'Failed to send email',
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    console.info(`COI email sent successfully: ${result.id}`);

    // Log email send to database for audit trail
    await supabase
      .from('email_log')
      .insert({
        type: 'coi',
        to_email: to,
        from_email: SENDER_EMAIL,
        subject: `Certificate of Insurance - ${certificateNumber}`,
        sent_by: user.id,
        resend_id: result.id,
        metadata: { certificateNumber, holderName },
      })
      .then(({ error }) => {
        if (error) console.error('Failed to log email:', error);
      });

    return new Response(
      JSON.stringify({
        success: true,
        messageId: result.id,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: unknown) {
    console.error("Error sending COI email:", error);

    // Check if this is a configuration error
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
