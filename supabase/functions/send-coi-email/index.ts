import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// TEMPORARILY DISABLED: Resend npm package not compatible with Deno Edge Runtime
// TODO: Replace with Deno-compatible email service
// import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendCOIEmailRequest {
  to: string;
  certificateNumber: string;
  certificateUrl: string;
  holderName: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // TEMPORARILY DISABLED - Resend integration not Deno-compatible
  return new Response(
    JSON.stringify({
      success: false,
      error: "COI email sending temporarily disabled - awaiting Deno-compatible email solution"
    }),
    {
      status: 503,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    }
  );

  /* COMMENTED OUT UNTIL DENO-COMPATIBLE SOLUTION
  try {
    const { to, certificateNumber, certificateUrl, holderName }: SendCOIEmailRequest = await req.json();

    console.log(`Sending COI ${certificateNumber} to ${to}`);

    const emailResponse = await resend.emails.send({
      from: "Insurance Agency <onboarding@resend.dev>",
      to: [to],
      subject: `Certificate of Insurance ${certificateNumber}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
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
              .details {
                background-color: white;
                padding: 20px;
                border-radius: 4px;
                margin: 20px 0;
              }
              .footer {
                text-align: center;
                color: #666;
                font-size: 12px;
                margin-top: 30px;
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
              
              <a href="${certificateUrl}" class="button" target="_blank">
                Download Certificate
              </a>
              
              <p>This certificate serves as proof of insurance coverage. Please keep it for your records and provide it to any parties that require proof of insurance.</p>
              
              <p>If you have any questions or need assistance, please don't hesitate to contact us.</p>
              
              <p>Best regards,<br>Your Insurance Agency</p>
              
              <div class="footer">
                <p>This is an automated message. Please do not reply to this email.</p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: emailResponse.data?.id 
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error: any) {
    console.error("Error sending COI email:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        },
      }
    );
  }
  */ // End of commented section
};

serve(handler);
