/**
 * Weekly CEO Digest Edge Function
 *
 * Generates and sends a weekly performance summary email to executives.
 *
 * Features:
 * - Computes deterministic metrics from database via RPC
 * - AI-powered summarization (OpenAI or Anthropic)
 * - Markdown-to-HTML email rendering
 * - Idempotency: prevents duplicate sends for same week
 * - Observability: logs each run with facts, AI output, email result
 *
 * Authentication: Requires X-Cron-Secret header
 *
 * Query Parameters:
 * - agency_workspace_id: UUID (required) - which agency to generate digest for
 * - force: boolean (optional) - force re-send even if already sent
 * - test: boolean (optional) - test mode, don't actually send email
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { createLogger } from '../_shared/logger.ts';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { modelBoundaryFetch } from '../_shared/modelBoundaryFetch.ts';
import {
  AppError,
  ValidationError,
  ExternalServiceError,
  createErrorResponse,
} from '../_shared/error-handler.ts';

// ============================================================================
// TYPES
// ============================================================================

interface DigestSettings {
  id: string;
  agency_workspace_id: string;
  enabled: boolean;
  timezone: string;
  send_day_of_week: number;
  send_time_local: string;
  recipients: string[];
  include_pii: boolean;
  thresholds: Record<string, number>;
  is_ceo_master: boolean; // When true, aggregates ALL agency workspaces
}

interface AgencyBreakdown {
  agency_workspace_id: string;
  agency_name: string;
  leads_new: number;
  quotes_created: number;
  policies_bound: number;
  premium_written: number;
  tasks_overdue: number;
}

interface FactsPacket {
  meta: {
    period_start: string;
    period_end: string;
    timezone: string;
    week_label: string;
    generated_at: string;
    agency_workspace_id?: string;
    scope?: 'single_agency' | 'all_agencies';
    agency_count?: number;
  };
  kpis: Record<string, number>;
  deltas_vs_previous_week: Record<string, {
    current: number;
    previous: number;
    change: number;
    change_pct: number | null;
  }>;
  funnel: Record<string, Record<string, number>>;
  lists: Record<string, Array<Record<string, unknown>>>;
  service_ops: Record<string, unknown>;
  integration_health: Record<string, unknown>;
  alerts: Array<{
    severity: 'critical' | 'warning' | 'info';
    category: string;
    title: string;
    message: string;
    evidence: Record<string, unknown>;
  }>;
  by_agency?: AgencyBreakdown[]; // Per-agency breakdown for CEO view
  missing_data: string[];
}

interface AIOutput {
  subject: string;
  preview: string;
  markdown: string;
  critical_alerts: Array<{
    title: string;
    description: string;
    action: string;
  }>;
  ceo_actions: Array<{
    priority: number;
    action: string;
    rationale: string;
    deep_link?: string;
  }>;
}

interface DigestRun {
  id: string;
  agency_workspace_id: string;
  period_start: string;
  period_end: string;
  timezone: string;
  week_label: string;
  recipients: string[];
  facts: FactsPacket | null;
  ai_output: AIOutput | null;
  ai_provider: string | null;
  ai_model: string | null;
  ai_tokens_used: number | null;
  status: 'created' | 'computing' | 'generating' | 'sending' | 'sent' | 'skipped' | 'failed';
  idempotency_key: string;
  email_provider: string | null;
  email_result: Record<string, unknown> | null;
  emails_sent: number;
  error: string | null;
  error_code: string | null;
  triggered_by: string;
}

// ============================================================================
// AI SYSTEM PROMPT
// ============================================================================

const AI_SYSTEM_PROMPT = `You are a business analyst creating a weekly executive digest for an insurance agency CEO.

CRITICAL RULES:
1. You MUST only use the facts provided in the JSON input. NEVER invent, estimate, or hallucinate any numbers.
2. Your output MUST be valid JSON matching the exact schema specified.
3. Keep content concise and action-oriented - CEOs have limited time.
4. Prioritize critical issues and actionable insights.
5. Use professional, direct language without fluff or filler.
6. For PII protection: never include full names, addresses, SSNs, dates of birth, or other sensitive data.

OUTPUT SCHEMA (strict JSON):
{
  "subject": "string - email subject line (max 60 chars)",
  "preview": "string - email preview text (max 100 chars)",
  "markdown": "string - full digest content in markdown format",
  "critical_alerts": [
    {
      "title": "string - alert headline",
      "description": "string - what happened and why it matters",
      "action": "string - specific recommended action"
    }
  ],
  "ceo_actions": [
    {
      "priority": number - 1 is highest priority,
      "action": "string - specific action to take",
      "rationale": "string - why this matters based on the data",
      "deep_link": "string - optional relative URL to app page"
    }
  ]
}

MARKDOWN STRUCTURE:
Use these sections in the markdown:
1. **Weekly Snapshot** - High-level KPIs in a summary
2. **Performance vs Last Week** - Key deltas with context
3. **Pipeline Health** - Funnel metrics and bottlenecks
4. **Top Opportunities** - High-value items to focus on
5. **Operations Status** - Task backlog and overdue items
6. **Integration Health** - System/integration status (if data available)
7. **Alerts Requiring Attention** - Critical/warning items

FORMATTING:
- Use bullet points for lists
- Bold key numbers and metrics
- Keep each section to 2-4 bullet points max
- Include relative deep links where helpful (e.g., /quotes/123)

Provide 3-7 concrete, prioritized actions in ceo_actions based on the data.`;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const logger = createLogger('weekly-ceo-digest');

/**
 * Calculate the previous full week's date range in the given timezone
 */
function getLastWeekRange(timezone: string): { start: Date; end: Date; weekLabel: string } {
  // Get current date in timezone
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const year = parseInt(parts.find(p => p.type === 'year')?.value || '2024');
  const month = parseInt(parts.find(p => p.type === 'month')?.value || '1') - 1;
  const day = parseInt(parts.find(p => p.type === 'day')?.value || '1');

  // Create date object for today in timezone
  const today = new Date(year, month, day);
  const dayOfWeek = today.getDay(); // 0 = Sunday

  // Calculate last Monday (start of previous week)
  const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const lastMonday = new Date(today);
  lastMonday.setDate(today.getDate() - daysToLastMonday - 7);
  lastMonday.setHours(0, 0, 0, 0);

  // Calculate last Sunday (end of previous week)
  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6);
  lastSunday.setHours(23, 59, 59, 999);

  // Generate week label
  const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short' });
  const weekLabel = `Week of ${monthFormatter.format(lastMonday)} ${lastMonday.getDate()}-${lastSunday.getDate()}, ${lastMonday.getFullYear()}`;

  return { start: lastMonday, end: lastSunday, weekLabel };
}

/**
 * Generate idempotency key from week start and recipients
 */
function generateIdempotencyKey(periodStart: Date, recipients: string[]): string {
  const weekKey = periodStart.toISOString().split('T')[0];
  const recipientHash = recipients.sort().join(',');
  // Simple hash
  let hash = 0;
  for (let i = 0; i < recipientHash.length; i++) {
    const char = recipientHash.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `${weekKey}_${Math.abs(hash).toString(16)}`;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call AI provider to generate summary with retry logic
 */
async function generateAISummary(
  facts: FactsPacket,
  provider: string,
  logger: ReturnType<typeof createLogger>
): Promise<{ output: AIOutput; model: string; tokens: number }> {
  const userPrompt = `Generate a weekly CEO digest based on these facts:

${JSON.stringify(facts, null, 2)}

Remember: Output ONLY valid JSON matching the schema. Do not include any text outside the JSON.`;

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (provider === 'anthropic') {
        const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
        if (!apiKey) throw new AppError('ANTHROPIC_API_KEY not configured', 500);

        const response = await modelBoundaryFetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-5',
            max_tokens: 4096,
            system: AI_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userPrompt }],
          }),
        });

        // Handle rate limiting with retry
        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * 1000;
          logger.warn(`Rate limited by Anthropic, retrying in ${waitTime}ms (attempt ${attempt}/${maxRetries})`);

          if (attempt < maxRetries) {
            await sleep(waitTime);
            continue;
          }
          throw new ExternalServiceError('Anthropic', `Rate limit exceeded after ${maxRetries} attempts`);
        }

        if (!response.ok) {
          const errorText = await response.text();
          logger.error('Anthropic API error', new Error(errorText));
          throw new ExternalServiceError('Anthropic', `API error: ${response.status}`);
        }

        const data = await response.json();
        const content = (data.content?.find((b: { type?: string }) => b?.type === 'text')?.text ?? '');

        // Parse JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new ValidationError('AI did not return valid JSON');
        }

        const output = JSON.parse(jsonMatch[0]) as AIOutput;
        const tokens = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);

        return { output, model: 'claude-sonnet-5', tokens };
      } else {
        // Default to OpenAI
        const apiKey = Deno.env.get('OPENAI_API_KEY');
        if (!apiKey) throw new AppError('OPENAI_API_KEY not configured', 500);

        const response = await modelBoundaryFetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: AI_SYSTEM_PROMPT },
              { role: 'user', content: userPrompt },
            ],
            response_format: { type: 'json_object' },
            max_tokens: 4096,
          }),
        });

        // Handle rate limiting with retry
        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * 1000;
          logger.warn(`Rate limited by OpenAI, retrying in ${waitTime}ms (attempt ${attempt}/${maxRetries})`);

          if (attempt < maxRetries) {
            await sleep(waitTime);
            continue;
          }
          throw new ExternalServiceError('OpenAI', `Rate limit exceeded after ${maxRetries} attempts`);
        }

        if (!response.ok) {
          const errorText = await response.text();
          logger.error('OpenAI API error', new Error(errorText));
          throw new ExternalServiceError('OpenAI', `API error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content || '';
        const output = JSON.parse(content) as AIOutput;
        const tokens = data.usage?.total_tokens || 0;

        return { output, model: 'gpt-4o', tokens };
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // If it's not a rate limit error, throw immediately
      if (!(error instanceof ExternalServiceError) || !error.message.includes('Rate limit')) {
        throw error;
      }

      // If we've exhausted retries, throw the last error
      if (attempt === maxRetries) {
        throw lastError;
      }
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError || new AppError('Failed to generate AI summary', 500);
}

/**
 * Convert markdown to HTML for email
 */
function markdownToHtml(markdown: string): string {
  let html = markdown;

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Lists
  html = html.replace(/^\s*-\s+(.*)$/gim, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)(\s*)(?=<li>)/g, '$1\n');
  html = html.replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>');
  html = html.replace(/<\/ul>\s*<ul>/g, '');

  // Links - convert relative to absolute
  const baseUrl = Deno.env.get('APP_URL') || 'https://lewisinsurance.ai';
  html = html.replace(/\[([^\]]+)\]\(\/([^)]+)\)/g, `<a href="${baseUrl}/$2">$1</a>`);
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');

  // Paragraphs
  html = html.replace(/\n\n/g, '</p><p>');
  html = `<p>${html}</p>`;
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>(<h[123]>)/g, '$1');
  html = html.replace(/(<\/h[123]>)<\/p>/g, '$1');
  html = html.replace(/<p>(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)<\/p>/g, '$1');

  return html;
}

/**
 * Generate email HTML template
 */
function generateEmailHtml(
  aiOutput: AIOutput,
  facts: FactsPacket,
  runId: string
): string {
  const baseUrl = Deno.env.get('APP_URL') || 'https://lewisinsurance.ai';
  const markdownHtml = markdownToHtml(aiOutput.markdown);
  const isCeoMaster = facts.meta.scope === 'all_agencies';

  // Generate actions list
  const actionsHtml = aiOutput.ceo_actions
    .sort((a, b) => a.priority - b.priority)
    .map(action => {
      const link = action.deep_link
        ? `<a href="${baseUrl}${action.deep_link}" style="color: #2563eb;">View</a>`
        : '';
      return `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
            <strong>${action.action}</strong>
            <br><span style="color: #6b7280; font-size: 14px;">${action.rationale}</span>
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">
            ${link}
          </td>
        </tr>
      `;
    })
    .join('');

  // Generate alerts section if any critical alerts
  const criticalAlerts = aiOutput.critical_alerts.filter(a => a);
  const alertsHtml = criticalAlerts.length > 0
    ? `
      <div style="background-color: #fef2f2; border: 1px solid #fca5a5; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <h3 style="color: #dc2626; margin: 0 0 12px 0;">Alerts Requiring Attention</h3>
        ${criticalAlerts.map(alert => `
          <div style="margin-bottom: 12px;">
            <strong style="color: #991b1b;">${alert.title}</strong>
            <p style="margin: 4px 0; color: #7f1d1d;">${alert.description}</p>
            <p style="margin: 4px 0; color: #166534; font-weight: 500;">Action: ${alert.action}</p>
          </div>
        `).join('')}
      </div>
    `
    : '';

  // Generate per-agency breakdown for CEO mode
  const agencyBreakdownHtml = isCeoMaster && facts.by_agency && facts.by_agency.length > 0
    ? `
      <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <h3 style="color: #0369a1; margin: 0 0 16px 0;">📊 Performance by Agency</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <thead>
            <tr style="background-color: #e0f2fe;">
              <th style="padding: 10px; text-align: left; border-bottom: 2px solid #7dd3fc;">Agency</th>
              <th style="padding: 10px; text-align: right; border-bottom: 2px solid #7dd3fc;">Leads</th>
              <th style="padding: 10px; text-align: right; border-bottom: 2px solid #7dd3fc;">Quotes</th>
              <th style="padding: 10px; text-align: right; border-bottom: 2px solid #7dd3fc;">Bound</th>
              <th style="padding: 10px; text-align: right; border-bottom: 2px solid #7dd3fc;">Premium</th>
              <th style="padding: 10px; text-align: right; border-bottom: 2px solid #7dd3fc;">Overdue</th>
            </tr>
          </thead>
          <tbody>
            ${facts.by_agency.map((agency: AgencyBreakdown) => `
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e0f2fe;">
                  <strong>${agency.agency_name}</strong>
                </td>
                <td style="padding: 10px; text-align: right; border-bottom: 1px solid #e0f2fe;">
                  ${agency.leads_new}
                </td>
                <td style="padding: 10px; text-align: right; border-bottom: 1px solid #e0f2fe;">
                  ${agency.quotes_created}
                </td>
                <td style="padding: 10px; text-align: right; border-bottom: 1px solid #e0f2fe;">
                  ${agency.policies_bound}
                </td>
                <td style="padding: 10px; text-align: right; border-bottom: 1px solid #e0f2fe;">
                  $${Number(agency.premium_written).toLocaleString()}
                </td>
                <td style="padding: 10px; text-align: right; border-bottom: 1px solid #e0f2fe; ${agency.tasks_overdue > 0 ? 'color: #dc2626; font-weight: bold;' : ''}">
                  ${agency.tasks_overdue}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `
    : '';

  // Header subtitle based on mode
  const headerSubtitle = isCeoMaster
    ? `${facts.meta.week_label} • All Agencies (${facts.meta.agency_count || 0})`
    : facts.meta.week_label;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${aiOutput.subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 680px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); border-radius: 12px 12px 0 0; padding: 24px; color: white;">
    <h1 style="margin: 0; font-size: 24px;">${isCeoMaster ? '🏢 Executive CEO Digest' : 'Weekly CEO Digest'}</h1>
    <p style="margin: 8px 0 0 0; opacity: 0.9;">${headerSubtitle}</p>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
    ${alertsHtml}

    <div style="margin-bottom: 24px;">
      ${markdownHtml}
    </div>

    ${agencyBreakdownHtml}

    <div style="background-color: #f9fafb; border-radius: 8px; padding: 20px; margin-top: 24px;">
      <h3 style="margin: 0 0 16px 0; color: #1f2937;">Recommended Actions</h3>
      <table style="width: 100%; border-collapse: collapse;">
        ${actionsHtml}
      </table>
    </div>

    <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 14px;">
      <p>
        <a href="${baseUrl}/admin/digest-history" style="color: #2563eb;">View Digest History</a>
        &nbsp;|&nbsp;
        <a href="${baseUrl}/admin/digest-settings" style="color: #2563eb;">Manage Settings</a>
      </p>
      <p style="margin-top: 12px; font-size: 12px;">
        Generated by InsureFlow AI at ${new Date().toLocaleString('en-US', { timeZone: facts.meta.timezone })}
        <br>Run ID: ${runId}
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Send email via configured provider (SendGrid, Resend, or Postmark)
 */
async function sendEmail(
  to: string[],
  subject: string,
  html: string,
  previewText: string,
  logger: ReturnType<typeof createLogger>
): Promise<{ success: boolean; result: Record<string, unknown>; provider: string }> {
  // Check for provider configuration - prioritize EMAIL_PROVIDER for consistency
  const provider = Deno.env.get('EMAIL_PROVIDER') || 'sendgrid';
  const apiKey = Deno.env.get('EMAIL_PROVIDER_API_KEY') || Deno.env.get('SENDGRID_API_KEY') || Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('OUTBOUND_FROM') || Deno.env.get('FROM_EMAIL') || 'digest@lewisinsurance.ai';

  if (!apiKey) {
    throw new AppError('Email API key not configured (EMAIL_PROVIDER_API_KEY or SENDGRID_API_KEY)', 500);
  }

  logger.info('Sending email', { provider, recipientCount: to.length, subject });

  let response: Response;

  if (provider === 'sendgrid') {
    // SendGrid API
    response = await modelBoundaryFetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{
          to: to.map(email => ({ email })),
        }],
        from: { email: fromEmail, name: 'InsureFlow' },
        subject,
        content: [
          { type: 'text/plain', value: previewText },
          { type: 'text/html', value: html },
        ],
      }),
    });

    // SendGrid returns 202 for success with empty body
    if (response.status === 202) {
      logger.info('SendGrid accepted email for delivery');
      return {
        success: true,
        result: { status: 202, message: 'Email accepted for delivery' },
        provider: 'sendgrid',
      };
    }

    const result = await response.json().catch(() => ({ error: 'Failed to parse response' }));
    if (!response.ok) {
      logger.error('SendGrid API error', new Error(JSON.stringify(result)));
      return { success: false, result, provider: 'sendgrid' };
    }
    return { success: true, result, provider: 'sendgrid' };

  } else if (provider === 'resend') {
    // Resend API
    response = await modelBoundaryFetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to,
        subject,
        html,
        text: previewText,
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      logger.error('Resend API error', new Error(JSON.stringify(result)));
      return { success: false, result, provider: 'resend' };
    }
    return { success: true, result, provider: 'resend' };

  } else if (provider === 'postmark') {
    // Postmark API - send to each recipient
    const results: Record<string, unknown>[] = [];
    let allSuccess = true;

    for (const recipient of to) {
      response = await modelBoundaryFetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Postmark-Server-Token': apiKey,
        },
        body: JSON.stringify({
          From: fromEmail,
          To: recipient,
          Subject: subject,
          HtmlBody: html,
          TextBody: previewText,
          MessageStream: 'outbound',
        }),
      });

      const result = await response.json();
      results.push(result);
      if (!response.ok) {
        logger.error('Postmark API error', new Error(JSON.stringify(result)));
        allSuccess = false;
      }
    }

    return {
      success: allSuccess,
      result: { messages: results },
      provider: 'postmark',
    };

  } else {
    throw new AppError(`Unknown email provider: ${provider}`, 500);
  }
}

/**
 * Validate AI output schema
 */
function validateAIOutput(output: unknown): output is AIOutput {
  if (!output || typeof output !== 'object') return false;

  const o = output as Record<string, unknown>;

  if (typeof o.subject !== 'string') return false;
  if (typeof o.preview !== 'string') return false;
  if (typeof o.markdown !== 'string') return false;
  if (!Array.isArray(o.critical_alerts)) return false;
  if (!Array.isArray(o.ceo_actions)) return false;

  // Validate critical_alerts
  for (const alert of o.critical_alerts) {
    if (!alert || typeof alert !== 'object') return false;
    const a = alert as Record<string, unknown>;
    if (typeof a.title !== 'string') return false;
    if (typeof a.description !== 'string') return false;
    if (typeof a.action !== 'string') return false;
  }

  // Validate ceo_actions
  for (const action of o.ceo_actions) {
    if (!action || typeof action !== 'object') return false;
    const a = action as Record<string, unknown>;
    if (typeof a.priority !== 'number') return false;
    if (typeof a.action !== 'string') return false;
    if (typeof a.rationale !== 'string') return false;
  }

  return true;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  logger.setContext({ requestId });

  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  try {
    // Verify cron secret
    const cronError = verifyCronSecret(req);
    if (cronError) return cronError;

    logger.info('Weekly CEO digest request received');

    // Parse query parameters
    const url = new URL(req.url);
    const agencyWorkspaceId = url.searchParams.get('agency_workspace_id');
    const force = url.searchParams.get('force') === 'true';
    const testMode = url.searchParams.get('test') === 'true';

    if (!agencyWorkspaceId) {
      throw new ValidationError('agency_workspace_id is required');
    }

    // Create Supabase admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new AppError('Supabase configuration missing', 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Get or create digest settings
    const { data: settings, error: settingsError } = await supabase
      .rpc('get_or_create_ceo_digest_settings', { p_agency_workspace_id: agencyWorkspaceId });

    if (settingsError) {
      logger.error('Failed to get digest settings', new Error(settingsError.message));
      throw new AppError('Failed to get digest settings', 500);
    }

    const digestSettings = settings as DigestSettings;

    // Check if digest is enabled
    if (!digestSettings.enabled && !force) {
      logger.info('Digest is disabled for this agency', { agencyWorkspaceId });
      return new Response(
        JSON.stringify({
          success: true,
          status: 'skipped',
          reason: 'Digest disabled for this agency',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check recipients
    if (!digestSettings.recipients || digestSettings.recipients.length === 0) {
      logger.warn('No recipients configured', { agencyWorkspaceId });
      return new Response(
        JSON.stringify({
          success: true,
          status: 'skipped',
          reason: 'No recipients configured',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate week range
    const { start: periodStart, end: periodEnd, weekLabel } = getLastWeekRange(digestSettings.timezone);

    // Generate idempotency key
    const idempotencyKey = generateIdempotencyKey(periodStart, digestSettings.recipients);

    // Check for existing run (idempotency)
    const { data: existingRun } = await supabase
      .from('ceo_digest_runs')
      .select('id, status')
      .eq('agency_workspace_id', agencyWorkspaceId)
      .eq('idempotency_key', idempotencyKey)
      .eq('status', 'sent')
      .single();

    if (existingRun && !force) {
      logger.info('Digest already sent for this period', { runId: existingRun.id });
      return new Response(
        JSON.stringify({
          success: true,
          status: 'skipped',
          reason: 'Already sent for this period',
          existing_run_id: existingRun.id,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create digest run record
    const { data: run, error: runError } = await supabase
      .from('ceo_digest_runs')
      .insert({
        agency_workspace_id: agencyWorkspaceId,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        timezone: digestSettings.timezone,
        week_label: weekLabel,
        recipients: digestSettings.recipients,
        status: 'created',
        idempotency_key: force ? `${idempotencyKey}_force_${Date.now()}` : idempotencyKey,
        triggered_by: force ? 'force' : testMode ? 'test' : 'cron',
      })
      .select()
      .single();

    if (runError || !run) {
      // Check if it's a duplicate key error
      if (runError?.code === '23505') {
        logger.info('Duplicate run detected', { idempotencyKey });
        return new Response(
          JSON.stringify({
            success: true,
            status: 'skipped',
            reason: 'Duplicate run in progress',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new AppError(`Failed to create run: ${runError?.message}`, 500);
    }

    const runId = run.id;
    logger.setContext({ requestId, runId });
    logger.info('Created digest run', { runId });

    try {
      // Update status to computing
      await supabase
        .from('ceo_digest_runs')
        .update({ status: 'computing' })
        .eq('id', runId);

      // Compute facts via RPC - use all-agencies RPC if CEO master mode
      const isCeoMaster = digestSettings.is_ceo_master === true;
      logger.info('Computing digest facts', { isCeoMaster, agencyWorkspaceId });

      let facts: FactsPacket;
      let factsError: { message: string } | null = null;

      if (isCeoMaster) {
        // CEO Master mode: Aggregate ALL agency workspaces
        const result = await supabase.rpc('get_ceo_digest_facts_all_agencies', {
          p_period_start: periodStart.toISOString(),
          p_period_end: periodEnd.toISOString(),
          p_timezone: digestSettings.timezone,
          p_include_pii: digestSettings.include_pii,
          p_thresholds: digestSettings.thresholds,
        });
        facts = result.data as FactsPacket;
        factsError = result.error;
      } else {
        // Single agency mode
        const result = await supabase.rpc('get_weekly_ceo_digest_facts', {
          p_agency_workspace_id: agencyWorkspaceId,
          p_period_start: periodStart.toISOString(),
          p_period_end: periodEnd.toISOString(),
          p_timezone: digestSettings.timezone,
          p_include_pii: digestSettings.include_pii,
          p_thresholds: digestSettings.thresholds,
        });
        facts = result.data as FactsPacket;
        factsError = result.error;
      }

      if (factsError) {
        throw new AppError(`Failed to compute facts: ${factsError.message}`, 500);
      }

      const factsPacket = facts as FactsPacket;
      logger.info('Facts computed successfully', {
        alertCount: factsPacket.alerts?.length || 0,
        missingData: factsPacket.missing_data,
      });

      // Update run with facts
      await supabase
        .from('ceo_digest_runs')
        .update({
          facts: factsPacket,
          status: 'generating',
        })
        .eq('id', runId);

      // Generate AI summary
      logger.info('Generating AI summary');
      const aiProvider = Deno.env.get('AI_PROVIDER') || 'openai';
      const { output: aiOutput, model, tokens } = await generateAISummary(factsPacket, aiProvider, logger);

      // Validate AI output
      if (!validateAIOutput(aiOutput)) {
        throw new ValidationError('AI output did not match expected schema');
      }

      logger.info('AI summary generated', {
        model,
        tokens,
        actionsCount: aiOutput.ceo_actions.length,
      });

      // Update run with AI output
      await supabase
        .from('ceo_digest_runs')
        .update({
          ai_output: aiOutput,
          ai_provider: aiProvider,
          ai_model: model,
          ai_tokens_used: tokens,
          status: 'sending',
        })
        .eq('id', runId);

      // Generate email HTML
      const emailHtml = generateEmailHtml(aiOutput, factsPacket, runId);

      // Send email (unless test mode)
      let emailResult: { success: boolean; result: Record<string, unknown>; provider: string };
      let emailsSent = 0;

      if (testMode) {
        logger.info('Test mode - skipping email send');
        emailResult = { success: true, result: { test_mode: true }, provider: 'test' };
        emailsSent = 0;
      } else {
        emailResult = await sendEmail(
          digestSettings.recipients,
          aiOutput.subject,
          emailHtml,
          aiOutput.preview,
          logger
        );
        emailsSent = emailResult.success ? digestSettings.recipients.length : 0;
      }

      // Update final status
      const finalStatus = emailResult.success ? 'sent' : 'failed';
      await supabase
        .from('ceo_digest_runs')
        .update({
          status: finalStatus,
          email_provider: emailResult.provider,
          email_result: emailResult.result,
          emails_sent: emailsSent,
          completed_at: new Date().toISOString(),
          error: emailResult.success ? null : JSON.stringify(emailResult.result),
        })
        .eq('id', runId);

      logger.info('Digest run completed', {
        status: finalStatus,
        emailsSent,
        duration_ms: Date.now() - startTime,
      });

      return new Response(
        JSON.stringify({
          success: true,
          run_id: runId,
          status: finalStatus,
          period: {
            start: periodStart.toISOString(),
            end: periodEnd.toISOString(),
            week_label: weekLabel,
          },
          recipients_count: digestSettings.recipients.length,
          emails_sent: emailsSent,
          alerts_count: factsPacket.alerts?.length || 0,
          actions_count: aiOutput.ceo_actions.length,
          ai_provider: aiProvider,
          ai_model: model,
          test_mode: testMode,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      // Update run with error
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = error instanceof AppError ? error.code : 'UNKNOWN';

      await supabase
        .from('ceo_digest_runs')
        .update({
          status: 'failed',
          error: errorMessage,
          error_code: errorCode,
          completed_at: new Date().toISOString(),
        })
        .eq('id', runId);

      throw error;
    }
  } catch (error) {
    logger.error(
      'Digest generation failed',
      error instanceof Error ? error : new Error(String(error))
    );

    return createErrorResponse(
      error instanceof Error ? error : new Error(String(error)),
      requestId
    );
  }
});
