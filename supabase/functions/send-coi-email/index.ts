import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { validateEnvVars, configErrorResponse } from '../_shared/env-validator.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendCOIEmailRequest {
  to: string;
  certificateNumber: string;
  certificateUrl: string;
  holderName: string;
  fromName?: string;
  fromEmail?: string;
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
      <p>Dear ${holderName},</p>
      <p>Please find attached your Certificate of Insurance.</p>

      <div class="details">
        <strong>Certificate Number:</strong> ${certificateNumber}<br>
        <strong>Certificate Holder:</strong> ${holderName}
      </div>

      <p>You can download your certificate using the button below:</p>

      <p style="text-align: center;">
        <a href="${certificateUrl}" class="button" target="_blank">
          Download Certificate
        </a>
      </p>

      <p>This certificate serves as proof of insurance coverage. Please keep it for your records and provide it to any parties that require proof of insurance.</p>

      <p>If you have any questions or need assistance, please don't hesitate to contact us.</p>

      <p>Best regards,<br>Your Insurance Agency</p>

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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate required environment variables
    const env = validateEnvVars({
      RESEND_API_KEY: 'Resend API key for email sending',
    });

    // Parse request body
    const {
      to,
      certificateNumber,
      certificateUrl,
      holderName,
      fromName = 'Insurance Agency',
      fromEmail,
    }: SendCOIEmailRequest = await req.json();

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

    console.log(`Sending COI ${certificateNumber} to ${to}`);

    // Determine sender email
    // Note: For production, you should use a verified domain in Resend
    const senderEmail = fromEmail || 'onboarding@resend.dev';
    const from = `${fromName} <${senderEmail}>`;

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

    console.log(`COI email sent successfully: ${result.id}`);

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
      return configErrorResponse(error, corsHeaders);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
