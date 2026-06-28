/**
 * Marketing Send Governor - Queue Processor for Levitate Marketing Engine
 *
 * This function processes the marketing_send_queue, applying:
 * - Rate limiting per sender/org
 * - Frequency caps per contact
 * - Preference validation (stale check)
 * - Provider integration (Postmark/SendGrid for email, Twilio for SMS)
 * - Evidence recording for compliance
 *
 * Designed to be called via cron job (e.g., every 1 minute)
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

interface QueueItem {
  id: string;
  org_id: string;
  channel: 'email' | 'sms';
  classification: string;
  from_user_id: string;
  to_contact_id: string | null;
  to_account_id: string | null;
  to_email: string | null;
  to_phone: string | null;
  household_id: string | null;
  household_dedupe_key: string | null;
  preferences_version_at_queue: number | null;
  source_type: string;
  source_id: string | null;
  automation_step_id: string | null;
  automation_enrollment_id: string | null;
  priority: number;
  scheduled_for: string;
  status: string;
  attempts: number;
  max_attempts: number;
}

interface QueuePayload {
  queue_id: string;
  channel: string;
  email_subject: string | null;
  email_body_html: string | null;
  email_body_text: string | null;
  sms_message: string | null;
  template_id: string | null;
  template_version_id: string | null;
  unsubscribe_url: string | null;
}

interface GovernorConfig {
  per_user_hourly_limit: number;
  per_user_daily_limit: number;
  marketing_per_contact_per_day: number;
  marketing_per_contact_per_week: number;
  marketing_per_household_per_day: number;
  business_hours_start: number;
  business_hours_end: number;
  business_days: number[];
  org_timezone: string;
  max_concurrent_sends: number;
  jitter_max_seconds: number;
  // Not DB-backed; sensible constants used by the processor
  batch_size: number;
  claim_timeout_seconds: number;
}

const DEFAULT_CONFIG: GovernorConfig = {
  per_user_hourly_limit: 100,
  per_user_daily_limit: 500,
  marketing_per_contact_per_day: 2,
  marketing_per_contact_per_week: 5,
  marketing_per_household_per_day: 2,
  business_hours_start: 9,
  business_hours_end: 17,
  business_days: [1, 2, 3, 4, 5],
  org_timezone: 'America/New_York',
  max_concurrent_sends: 10,
  jitter_max_seconds: 30,
  batch_size: 50,
  claim_timeout_seconds: 300,
};

// Generate unique processor ID
const PROCESSOR_ID = `governor-${crypto.randomUUID().slice(0, 8)}`;

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const startTime = Date.now();
  const stats = {
    processed: 0,
    sent: 0,
    failed: 0,
    suppressed: 0,
    rate_limited: 0,
    preference_stale: 0,
    deferred_quiet_hours: 0,
  };

  try {
    // Require cron secret for scheduled/worker execution
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedSecret = Deno.env.get('CRON_SECRET');
    if (!expectedSecret) {
      console.error('CRON_SECRET not configured - rejecting request');
      return new Response(
        JSON.stringify({ error: 'Cron authentication not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!cronSecret || cronSecret !== expectedSecret) {
      console.error('Unauthorized: Invalid or missing CRON_SECRET');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    console.log(`🚀 [${PROCESSOR_ID}] Starting marketing send governor...`);

    // 1. Load governor config
    const config = await loadGovernorConfig(supabase);

    // 2. Check for global pause
    const isPaused = await checkGlobalPause(supabase);
    if (isPaused) {
      console.log('⏸️ Marketing sends are globally paused');
      return jsonResponse({ success: true, paused: true, message: 'Marketing sends paused' });
    }

    // 3. Check external service health
    const servicesHealthy = await checkServiceHealth(supabase);
    if (!servicesHealthy) {
      console.log('🔴 External services unhealthy, skipping batch');
      return jsonResponse({ success: false, error: 'External services unhealthy' });
    }

    // 4. Reclaim orphaned claims (from crashed processors)
    await reclaimOrphanedClaims(supabase, config.claim_timeout_seconds);

    // 5. Claim batch of queue items
    const claimedItems = await claimQueueItems(supabase, config.batch_size);
    if (claimedItems.length === 0) {
      console.log('📭 No items to process');
      return jsonResponse({ success: true, message: 'No items to process', stats });
    }

    console.log(`📬 Claimed ${claimedItems.length} items for processing`);

    // 6. Get payloads for claimed items
    const payloads = await getPayloads(supabase, claimedItems.map(i => i.id));

    // 7. Process each item
    for (const item of claimedItems) {
      try {
        stats.processed++;
        const payload = payloads.find(p => p.queue_id === item.id);

        if (!payload) {
          console.error(`❌ No payload found for queue item ${item.id}`);
          await markFailed(supabase, item.id, 'No payload found');
          stats.failed++;
          continue;
        }

        // Check preference version (detect stale)
        if (item.to_contact_id && item.preferences_version_at_queue) {
          const currentVersion = await getPreferenceVersion(supabase, item.org_id, item.to_contact_id);
          if (currentVersion && currentVersion > item.preferences_version_at_queue) {
            console.log(`⚠️ Preference changed for contact ${item.to_contact_id}, skipping`);
            await markPreferenceStale(supabase, item.id);
            stats.preference_stale++;
            continue;
          }
        }

        // Check frequency caps
        if (item.to_contact_id) {
          const canSend = await checkFrequencyCap(
            supabase,
            item.org_id,
            item.to_contact_id,
            item.household_id,
            item.classification,
            item.channel
          );
          if (!canSend) {
            console.log(`🚫 Frequency cap reached for contact ${item.to_contact_id}`);
            await markRateLimited(supabase, item.id);
            stats.rate_limited++;
            continue;
          }
        }

        // Check household deduplication
        if (item.household_dedupe_key) {
          const isDupe = await checkHouseholdDedupe(supabase, item.household_dedupe_key, item.id);
          if (isDupe) {
            console.log(`🏠 Household dedupe triggered for ${item.household_dedupe_key}`);
            await markSuppressed(supabase, item.id, 'household_dedupe');
            stats.suppressed++;
            continue;
          }
        }

        // Check suppression rules
        const suppressed = await checkSuppressionRules(supabase, item);
        if (suppressed) {
          console.log(`🛑 Suppression rule triggered for item ${item.id}`);
          await markSuppressed(supabase, item.id, suppressed);
          stats.suppressed++;
          continue;
        }

        // Quiet-hours guard: defer if outside org/state allowed send window.
        const deferUntil = await checkQuietHours(supabase, item, config);
        if (deferUntil) {
          console.log(`🌙 Quiet hours for item ${item.id}, deferring until ${deferUntil.toISOString()}`);
          await markDeferredQuietHours(supabase, item.id, deferUntil);
          stats.deferred_quiet_hours++;
          continue;
        }

        // Send the message
        let result: { success: boolean; messageId?: string; error?: string };

        if (item.channel === 'email') {
          result = await sendEmail(item, payload);
        } else {
          result = await sendSms(item, payload);
        }

        if (result.success) {
          // Create evidence record
          const evidenceId = await createEvidence(supabase, item, payload, result.messageId);

          // Update queue item
          await markSent(supabase, item.id, result.messageId, evidenceId);

          // Update frequency tracking
          if (item.to_contact_id) {
            await updateFrequencyTracking(supabase, item.org_id, item.to_contact_id, item.channel);
          }

          stats.sent++;
          console.log(`✅ Sent ${item.channel} to ${item.to_email || item.to_phone}`);
        } else {
          // Handle failure
          if (item.attempts + 1 >= item.max_attempts) {
            await markFailed(supabase, item.id, result.error || 'Unknown error');
          } else {
            await markForRetry(supabase, item.id, result.error || 'Unknown error');
          }
          stats.failed++;
          console.log(`❌ Failed to send ${item.channel}: ${result.error}`);
        }
      } catch (error) {
        console.error(`❌ Error processing item ${item.id}:`, error);
        await markFailed(supabase, item.id, error instanceof Error ? error.message : 'Unknown error');
        stats.failed++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`🎉 Governor complete in ${duration}ms:`, stats);

    return jsonResponse({
      success: true,
      processor_id: PROCESSOR_ID,
      duration_ms: duration,
      stats,
    });

  } catch (error) {
    console.error('❌ Fatal governor error:', error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

// Helper functions

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function loadGovernorConfig(supabase: SupabaseClient): Promise<GovernorConfig> {
  // Single config row; no is_active column exists.
  const { data } = await supabase
    .from('marketing_governor_config')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (data) {
    return {
      per_user_hourly_limit: data.per_user_hourly_limit ?? DEFAULT_CONFIG.per_user_hourly_limit,
      per_user_daily_limit: data.per_user_daily_limit ?? DEFAULT_CONFIG.per_user_daily_limit,
      marketing_per_contact_per_day: data.marketing_per_contact_per_day ?? DEFAULT_CONFIG.marketing_per_contact_per_day,
      marketing_per_contact_per_week: data.marketing_per_contact_per_week ?? DEFAULT_CONFIG.marketing_per_contact_per_week,
      marketing_per_household_per_day: data.marketing_per_household_per_day ?? DEFAULT_CONFIG.marketing_per_household_per_day,
      business_hours_start: data.business_hours_start ?? DEFAULT_CONFIG.business_hours_start,
      business_hours_end: data.business_hours_end ?? DEFAULT_CONFIG.business_hours_end,
      business_days: data.business_days ?? DEFAULT_CONFIG.business_days,
      org_timezone: data.org_timezone ?? DEFAULT_CONFIG.org_timezone,
      max_concurrent_sends: data.max_concurrent_sends ?? DEFAULT_CONFIG.max_concurrent_sends,
      jitter_max_seconds: data.jitter_max_seconds ?? DEFAULT_CONFIG.jitter_max_seconds,
      // No DB columns for these; use sensible constants.
      batch_size: data.max_concurrent_sends ? Math.max(data.max_concurrent_sends, 50) : DEFAULT_CONFIG.batch_size,
      claim_timeout_seconds: DEFAULT_CONFIG.claim_timeout_seconds,
    };
  }
  return DEFAULT_CONFIG;
}

async function checkGlobalPause(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase
    .from('sender_pause_state')
    .select('is_paused')
    .eq('scope_type', 'global')
    .maybeSingle();

  return data?.is_paused ?? false;
}

async function checkServiceHealth(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase
    .from('external_service_health')
    .select('service_name, status, circuit_open')
    .eq('service_name', 'email_provider')
    .maybeSingle();

  // No row means we have no negative signal; treat as healthy.
  if (!data) return true;

  // Healthy = provider not reported down and circuit not open.
  return data.status !== 'down' && !data.circuit_open;
}

/**
 * Quiet-hours guard. Returns the next allowed Date if the message must be deferred,
 * or null if it may send now.
 *
 * Rules:
 * - Current hour in org_timezone must be within [business_hours_start, business_hours_end).
 * - If the recipient has a state, the hour must also be within the state's
 *   [earliest_hour, latest_hour) from state_communication_rules.
 */
async function checkQuietHours(
  supabase: SupabaseClient,
  item: QueueItem,
  config: GovernorConfig
): Promise<Date | null> {
  // Current hour in the org timezone.
  const now = new Date();
  const orgHour = getHourInTimeZone(now, config.org_timezone);

  let earliest = config.business_hours_start;
  let latest = config.business_hours_end;

  // Tighten the window using the recipient's state rule, if any.
  const state = await getRecipientState(supabase, item);
  if (state) {
    const { data: rule } = await supabase
      .from('state_communication_rules')
      .select('earliest_hour, latest_hour')
      .eq('state_code', state.toUpperCase())
      .eq('is_active', true)
      .maybeSingle();

    if (rule) {
      if (typeof rule.earliest_hour === 'number') earliest = Math.max(earliest, rule.earliest_hour);
      if (typeof rule.latest_hour === 'number') latest = Math.min(latest, rule.latest_hour);
    }
  }

  if (orgHour >= earliest && orgHour < latest) {
    return null; // within allowed window, ok to send now
  }

  // Outside the window: compute the next time the window opens.
  return nextAllowedTime(now, config.org_timezone, earliest);
}

/** Hour-of-day (0-23) for a Date as observed in the given IANA timezone. */
function getHourInTimeZone(date: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  });
  const parsed = parseInt(fmt.format(date), 10);
  // Intl may emit "24" for midnight in some runtimes; normalize to 0.
  return Number.isNaN(parsed) ? 0 : parsed % 24;
}

/**
 * Next moment at which the local hour in `timeZone` reaches `earliestHour`.
 * If we are already past the open hour today, roll to the next day.
 */
function nextAllowedTime(now: Date, timeZone: string, earliestHour: number): Date {
  const currentHour = getHourInTimeZone(now, timeZone);
  // Hours to advance until we hit the open hour (next occurrence).
  let hoursAhead = earliestHour - currentHour;
  if (hoursAhead <= 0) hoursAhead += 24;

  const target = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);
  // Snap to the top of the hour for tidiness.
  target.setMinutes(0, 0, 0);
  return target;
}

/** Best-effort lookup of the recipient's state for quiet-hours enforcement. */
async function getRecipientState(supabase: SupabaseClient, item: QueueItem): Promise<string | null> {
  // Audience is account-based (the `contacts` table was retired in Wave 5); read accounts.state
  // via the queue's to_account_id. Returns null -> only the org-level quiet-hours window applies.
  if (!item.to_account_id) return null;

  const { data } = await supabase
    .from('accounts')
    .select('state')
    .eq('id', item.to_account_id)
    .maybeSingle();

  return (data?.state as string | null) ?? null;
}

async function reclaimOrphanedClaims(supabase: SupabaseClient, timeoutSeconds: number) {
  const cutoff = new Date(Date.now() - timeoutSeconds * 1000).toISOString();

  const { data, error } = await supabase
    .from('marketing_send_queue')
    .update({
      status: 'pending',
      processor_id: null,
      claimed_at: null,
      claim_expires_at: null,
    })
    .eq('status', 'claimed')
    .lt('claim_expires_at', cutoff)
    .select('id');

  if (data && data.length > 0) {
    console.log(`♻️ Reclaimed ${data.length} orphaned items`);
  }
}

async function claimQueueItems(supabase: SupabaseClient, batchSize: number): Promise<QueueItem[]> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minute claim

  // Use RPC to atomically claim items
  const { data, error } = await supabase.rpc('claim_marketing_queue_items', {
    p_processor_id: PROCESSOR_ID,
    p_batch_size: batchSize,
    p_expires_at: expiresAt.toISOString(),
  });

  if (error) {
    // Fallback to direct query if RPC doesn't exist
    console.log('⚠️ RPC not found, using fallback claim method');

    const { data: items, error: selectError } = await supabase
      .from('marketing_send_queue')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', now.toISOString())
      .order('priority', { ascending: true })
      .order('scheduled_for', { ascending: true })
      .limit(batchSize);

    if (selectError || !items) return [];

    // Claim them
    const ids = items.map(i => i.id);
    await supabase
      .from('marketing_send_queue')
      .update({
        status: 'claimed',
        processor_id: PROCESSOR_ID,
        claimed_at: now.toISOString(),
        claim_expires_at: expiresAt.toISOString(),
      })
      .in('id', ids);

    return items as QueueItem[];
  }

  return data || [];
}

async function getPayloads(supabase: SupabaseClient, queueIds: string[]): Promise<QueuePayload[]> {
  const { data } = await supabase
    .from('marketing_send_queue_payloads')
    .select('*')
    .in('queue_id', queueIds);

  return data || [];
}

async function getPreferenceVersion(supabase: SupabaseClient, orgId: string, contactId: string): Promise<number | null> {
  const { data } = await supabase
    .from('communication_preferences')
    .select('version')
    .eq('org_id', orgId)
    .eq('contact_id', contactId)
    .maybeSingle();

  return data?.version ?? null;
}

async function checkFrequencyCap(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string,
  householdId: string | null,
  classification: string,
  channel: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_frequency_cap', {
    p_org_id: orgId,
    p_contact_id: contactId,
    p_household_id: householdId,
    p_classification: classification,
    p_channel: channel,
  });

  // RPC returns TABLE(allowed boolean, reason text, ...); supabase-js yields an array of rows.
  if (error) {
    // Fail closed: if we can't confirm the cap, do not send.
    console.error('check_frequency_cap error, failing closed:', error);
    return false;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row?.allowed ?? false;
}

async function checkHouseholdDedupe(supabase: SupabaseClient, dedupeKey: string, currentId: string): Promise<boolean> {
  const { data } = await supabase
    .from('marketing_send_queue')
    .select('id')
    .eq('household_dedupe_key', dedupeKey)
    .eq('status', 'sent')
    .neq('id', currentId)
    .limit(1);

  return data && data.length > 0;
}

async function checkSuppressionRules(supabase: SupabaseClient, item: QueueItem): Promise<string | null> {
  if (!item.to_contact_id) return null;

  const { data } = await supabase
    .from('communication_preferences')
    .select('*')
    .eq('org_id', item.org_id)
    .eq('contact_id', item.to_contact_id)
    .maybeSingle();

  if (!data) return null;

  // Check kill switches
  if (data.do_not_contact) return 'do_not_contact';
  if (data.deceased) return 'deceased';
  if (item.classification === 'marketing' && data.do_not_market) return 'do_not_market';

  // Check temporary suppression
  if (data.temporary_suppression_until && new Date(data.temporary_suppression_until) > new Date()) {
    return 'temporary_suppression';
  }

  // Check channel preferences
  if (item.channel === 'email') {
    if (item.classification === 'marketing' && !data.email_marketing) return 'email_marketing_optout';
    if (item.classification === 'transactional' && !data.email_transactional) return 'email_transactional_optout';
  } else if (item.channel === 'sms') {
    if (item.classification === 'marketing' && !data.sms_marketing) return 'sms_marketing_optout';
    if (item.classification === 'transactional' && !data.sms_transactional) return 'sms_transactional_optout';
  }

  return null;
}

async function sendEmail(item: QueueItem, payload: QueuePayload): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const provider = Deno.env.get('EMAIL_PROVIDER') || 'postmark';
  const apiKey = Deno.env.get('EMAIL_PROVIDER_API_KEY');
  const fromEmail = Deno.env.get('OUTBOUND_FROM');

  if (!apiKey || !fromEmail) {
    return { success: false, error: 'Email provider not configured' };
  }

  try {
    let response: Response;

    if (provider === 'postmark') {
      response = await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Postmark-Server-Token': apiKey,
        },
        body: JSON.stringify({
          From: fromEmail,
          To: item.to_email,
          Subject: payload.email_subject,
          HtmlBody: payload.email_body_html,
          TextBody: payload.email_body_text,
          MessageStream: item.classification === 'marketing' ? 'broadcast' : 'outbound',
          Headers: payload.unsubscribe_url ? [
            { Name: 'List-Unsubscribe', Value: `<${payload.unsubscribe_url}>` },
            { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' },
          ] : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.Message || 'Postmark error' };
      }

      const result = await response.json();
      return { success: true, messageId: result.MessageID };

    } else if (provider === 'sendgrid') {
      response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: item.to_email }] }],
          from: { email: fromEmail },
          subject: payload.email_subject,
          content: [
            { type: 'text/plain', value: payload.email_body_text || '' },
            { type: 'text/html', value: payload.email_body_html || '' },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `SendGrid error: ${errorText}` };
      }

      const messageId = response.headers.get('X-Message-Id');
      return { success: true, messageId: messageId || undefined };
    }

    return { success: false, error: 'Unknown email provider' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Email send failed' };
  }
}

async function sendSms(item: QueueItem, payload: QueuePayload): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

  if (!accountSid || !authToken || !fromPhone) {
    return { success: false, error: 'Twilio not configured' };
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: item.to_phone!,
          From: fromPhone,
          Body: payload.sms_message || '',
        }),
      }
    );

    const result = await response.json();

    if (result.error_code) {
      return { success: false, error: `Twilio error ${result.error_code}: ${result.error_message}` };
    }

    return { success: true, messageId: result.sid };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'SMS send failed' };
  }
}

async function createEvidence(
  supabase: SupabaseClient,
  item: QueueItem,
  payload: QueuePayload,
  providerMessageId?: string
): Promise<string> {
  const { data: senderProfile } = await supabase
    .from('profiles')
    .select('email, display_name')
    .eq('id', item.from_user_id)
    .maybeSingle();

  const { data: contactData } = item.to_contact_id ? await supabase
    .from('contacts')
    .select('first_name, last_name')
    .eq('id', item.to_contact_id)
    .maybeSingle() : { data: null };

  const { data: evidence, error } = await supabase
    .from('communication_evidence')
    .insert({
      org_id: item.org_id,
      message_type: item.channel,
      classification: item.classification,
      from_user_id: item.from_user_id,
      from_email: senderProfile?.email,
      from_display_name: senderProfile?.display_name,
      to_contact_id: item.to_contact_id,
      to_account_id: item.to_account_id,
      to_email: item.to_email,
      to_phone: item.to_phone,
      to_name: contactData ? `${contactData.first_name || ''} ${contactData.last_name || ''}`.trim() : null,
      subject: payload.email_subject,
      body_html: payload.email_body_html,
      body_text: payload.email_body_text || payload.sms_message,
      template_id: payload.template_id,
      template_version_id: payload.template_version_id,
      source_type: item.source_type,
      source_id: item.source_id,
      automation_step_id: item.automation_step_id,
      automation_enrollment_id: item.automation_enrollment_id,
      provider_message_id: providerMessageId,
      included_unsubscribe: !!payload.unsubscribe_url,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to create evidence:', error);
    throw error;
  }

  // Create initial event
  await supabase.from('communication_events').insert({
    org_id: item.org_id,
    evidence_id: evidence.id,
    event_type: 'sent',
    event_data: { provider_message_id: providerMessageId },
  });

  return evidence.id;
}

async function updateFrequencyTracking(supabase: SupabaseClient, orgId: string, contactId: string, channel: string) {
  const column = channel === 'email' ? 'emails_sent_today' : 'sms_sent_today';

  await supabase.rpc('increment_contact_frequency', {
    p_org_id: orgId,
    p_contact_id: contactId,
    p_channel: channel,
  }).catch(() => {
    // Fallback if RPC doesn't exist
    console.log('⚠️ Frequency tracking RPC not available');
  });
}

async function markSent(supabase: SupabaseClient, queueId: string, providerMessageId?: string, evidenceId?: string) {
  await supabase
    .from('marketing_send_queue')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      provider_message_id: providerMessageId,
      communication_evidence_id: evidenceId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', queueId);
}

async function markFailed(supabase: SupabaseClient, queueId: string, error: string) {
  // Read current attempts so we can increment numerically (no scalar increment RPC available).
  const { data: current } = await supabase
    .from('marketing_send_queue')
    .select('attempts')
    .eq('id', queueId)
    .single();

  await supabase
    .from('marketing_send_queue')
    .update({
      status: 'failed',
      last_error: error,
      last_attempt_at: new Date().toISOString(),
      attempts: (current?.attempts || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', queueId);
}

async function markForRetry(supabase: SupabaseClient, queueId: string, error: string) {
  const retryDelay = 5 * 60 * 1000; // 5 minutes
  const nextRetry = new Date(Date.now() + retryDelay);

  await supabase
    .from('marketing_send_queue')
    .update({
      status: 'pending',
      processor_id: null,
      claimed_at: null,
      claim_expires_at: null,
      last_error: error,
      last_attempt_at: new Date().toISOString(),
      next_retry_at: nextRetry.toISOString(),
      scheduled_for: nextRetry.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', queueId);

  // Increment attempts manually
  const { data } = await supabase
    .from('marketing_send_queue')
    .select('attempts')
    .eq('id', queueId)
    .single();

  if (data) {
    await supabase
      .from('marketing_send_queue')
      .update({ attempts: (data.attempts || 0) + 1 })
      .eq('id', queueId);
  }
}

async function markSuppressed(supabase: SupabaseClient, queueId: string, reason: string) {
  await supabase
    .from('marketing_send_queue')
    .update({
      status: 'suppressed',
      last_error: `Suppressed: ${reason}`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', queueId);
}

async function markRateLimited(supabase: SupabaseClient, queueId: string) {
  const retryDelay = 60 * 60 * 1000; // 1 hour
  const nextRetry = new Date(Date.now() + retryDelay);

  await supabase
    .from('marketing_send_queue')
    .update({
      status: 'rate_limited',
      processor_id: null,
      claimed_at: null,
      claim_expires_at: null,
      next_retry_at: nextRetry.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', queueId);
}

async function markDeferredQuietHours(supabase: SupabaseClient, queueId: string, nextAllowed: Date) {
  // Return the item to the queue; do NOT send. It will be re-claimed at/after nextAllowed.
  await supabase
    .from('marketing_send_queue')
    .update({
      status: 'pending',
      processor_id: null,
      claimed_at: null,
      claim_expires_at: null,
      next_retry_at: nextAllowed.toISOString(),
      scheduled_for: nextAllowed.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', queueId);
}

async function markPreferenceStale(supabase: SupabaseClient, queueId: string) {
  await supabase
    .from('marketing_send_queue')
    .update({
      status: 'preference_stale',
      last_error: 'Contact preferences changed after message was queued',
      updated_at: new Date().toISOString(),
    })
    .eq('id', queueId);
}
