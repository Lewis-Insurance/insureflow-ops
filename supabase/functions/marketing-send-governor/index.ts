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
import {
  RADAR_SOURCE_TYPE,
  type RadarComplianceReceipt,
  normalizePhone,
  validateRadarComplianceReceipt,
} from '../_shared/radarCompliance.ts';

interface QueueItem {
  id: string;
  org_id: string;
  agency_workspace_id: string | null;
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
  compliance_check_id: string | null;
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
  max_emails_per_minute_per_sender: number;
  max_sms_per_minute_per_sender: number;
  max_emails_per_day_per_org: number;
  max_sms_per_day_per_org: number;
  batch_size: number;
  claim_timeout_seconds: number;
  circuit_breaker_threshold: number;
}

const DEFAULT_CONFIG: GovernorConfig = {
  max_emails_per_minute_per_sender: 30,
  max_sms_per_minute_per_sender: 10,
  max_emails_per_day_per_org: 5000,
  max_sms_per_day_per_org: 1000,
  batch_size: 50,
  claim_timeout_seconds: 300,
  circuit_breaker_threshold: 10,
};

// Generate unique processor ID
const PROCESSOR_ID = `governor-${crypto.randomUUID().slice(0, 8)}`;

function constantTimeEqual(provided: string, expected: string): boolean {
  const maxLength = Math.max(provided.length, expected.length);
  let difference = provided.length ^ expected.length;
  for (let index = 0; index < maxLength; index++) {
    difference |= (provided.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }
  return difference === 0;
}

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
    if (!cronSecret || !constantTimeEqual(cronSecret, expectedSecret)) {
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
      return jsonResponse({ success: true, paused: true, message: 'Marketing sends paused' }, 200, corsHeaders);
    }

    // 3. Check external service health
    const servicesHealthy = await checkServiceHealth(supabase);
    if (!servicesHealthy) {
      console.log('🔴 External services unhealthy, skipping batch');
      return jsonResponse({ success: false, error: 'External services unhealthy' }, 200, corsHeaders);
    }

    // 4. Reclaim orphaned claims (from crashed processors)
    await reclaimOrphanedClaims(supabase, config.claim_timeout_seconds);

    // 5. Claim batch of queue items
    const claimedItems = await claimQueueItems(supabase, config.batch_size);
    if (claimedItems.length === 0) {
      console.log('📭 No items to process');
      return jsonResponse({ success: true, message: 'No items to process', stats }, 200, corsHeaders);
    }

    console.log(`📬 Claimed ${claimedItems.length} items for processing`);

    // 6. Get payloads for claimed items
    const payloads = await getPayloads(supabase, claimedItems.map(i => i.id));

    // 7. Process each item
    for (const item of claimedItems) {
      try {
        stats.processed++;
        if (item.status !== 'claimed') {
          console.log(`🛡️ Queue claim was suppressed by provenance guard for ${item.id}`);
          stats.suppressed++;
          continue;
        }
        const payload = payloads.find(p => p.queue_id === item.id);

        if (!payload) {
          console.error(`❌ No payload found for queue item ${item.id}`);
          await markFailed(supabase, item.id, 'No payload found');
          stats.failed++;
          continue;
        }

        // Radar pre-leads are deny-by-default. Keep this immediately before the
        // mutable suppression/cap checks and provider boundary; legacy marketing
        // sources retain their existing contract.
        if (item.source_type === RADAR_SOURCE_TYPE) {
          const guardFailure = await checkRadarGuard(supabase, item);
          if (guardFailure) {
            console.log(`🛡️ Radar Guard blocked item ${item.id}: ${guardFailure}`);
            await markSuppressed(supabase, item.id, guardFailure);
            stats.suppressed++;
            continue;
          }
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
          const canSend = await checkFrequencyCap(supabase, item.org_id, item.to_contact_id, item.channel);
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

        if (item.source_type === RADAR_SOURCE_TYPE) {
          const reservationFailure = await reserveRadarAttempt(supabase, item);
          if (reservationFailure) {
            await markSuppressed(supabase, item.id, reservationFailure);
            stats.suppressed++;
            continue;
          }
        }

        // Move out of the reclaimable `claimed` state before crossing the
        // provider boundary. A crash from here requires manual reconciliation,
        // never an automatic duplicate send.
        const dispatching = await markProviderDispatching(supabase, item.id);
        if (!dispatching) {
          await markFailed(supabase, item.id, 'Unable to establish provider dispatch state', false);
          stats.failed++;
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
          try {
            const evidenceId = await createEvidence(supabase, item, payload, result.messageId);
            await markSent(supabase, item.id, result.messageId, evidenceId);
            if (item.to_contact_id) {
              await updateFrequencyTracking(supabase, item.org_id, item.to_contact_id, item.channel);
            }
            stats.sent++;
            console.log(`✅ Sent ${item.channel} to ${item.to_email || item.to_phone}`);
          } catch (persistenceError) {
            console.error(`Provider accepted ${item.id}, but evidence persistence failed`, persistenceError);
            await markDeliveryUnknown(supabase, item.id, result.messageId);
            stats.failed++;
          }
        } else {
          // Handle failure
          if (item.attempts + 1 >= item.max_attempts) {
            await markFailed(supabase, item.id, result.error || 'Unknown error', item.source_type !== RADAR_SOURCE_TYPE);
          } else {
            await markForRetry(supabase, item.id, result.error || 'Unknown error', item.source_type !== RADAR_SOURCE_TYPE);
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
    }, 200, corsHeaders);

  } catch (error) {
    console.error('❌ Fatal governor error:', error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500,
      corsHeaders,
    );
  }
});

// Helper functions

function jsonResponse(data: object, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function loadGovernorConfig(supabase: SupabaseClient): Promise<GovernorConfig> {
  const { data } = await supabase
    .from('marketing_governor_config')
    .select('*')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (data) {
    return {
      max_emails_per_minute_per_sender: data.max_emails_per_minute_per_sender ?? DEFAULT_CONFIG.max_emails_per_minute_per_sender,
      max_sms_per_minute_per_sender: data.max_sms_per_minute_per_sender ?? DEFAULT_CONFIG.max_sms_per_minute_per_sender,
      max_emails_per_day_per_org: data.max_emails_per_day_per_org ?? DEFAULT_CONFIG.max_emails_per_day_per_org,
      max_sms_per_day_per_org: data.max_sms_per_day_per_org ?? DEFAULT_CONFIG.max_sms_per_day_per_org,
      batch_size: data.batch_size ?? DEFAULT_CONFIG.batch_size,
      claim_timeout_seconds: data.claim_timeout_seconds ?? DEFAULT_CONFIG.claim_timeout_seconds,
      circuit_breaker_threshold: data.circuit_breaker_threshold ?? DEFAULT_CONFIG.circuit_breaker_threshold,
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
    .select('service_name, is_healthy')
    .in('service_name', ['postmark', 'sendgrid', 'twilio']);

  // Return true if at least one email and one SMS service is healthy
  const hasHealthyEmail = data?.some(s =>
    (s.service_name === 'postmark' || s.service_name === 'sendgrid') && s.is_healthy
  ) ?? true;

  return hasHealthyEmail;
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
    throw new Error(`Atomic marketing queue claim failed: ${error.message}`);
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
  channel: string
): Promise<boolean> {
  const { data } = await supabase.rpc('check_frequency_cap', {
    p_org_id: orgId,
    p_contact_id: contactId,
    p_channel: channel,
  });

  return data ?? true;
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

async function checkRadarGuard(supabase: SupabaseClient, item: QueueItem): Promise<string | null> {
  if (!item.compliance_check_id) return 'radar_guard_missing';

  const { data: receipt, error: receiptError } = await supabase
    .from('compliance_checks')
    .select('*')
    .eq('id', item.compliance_check_id)
    .maybeSingle();
  if (receiptError) return 'radar_guard_lookup_failed';

  const { data: config, error: configError } = await supabase
    .from('radar_config')
    .select('sms_enabled')
    .eq('agency_workspace_id', item.agency_workspace_id)
    .maybeSingle();
  if (configError) return 'radar_config_lookup_failed';

  const receiptFailure = validateRadarComplianceReceipt(
    item,
    receipt as RadarComplianceReceipt | null,
    config?.sms_enabled === true,
  );
  if (receiptFailure) return receiptFailure;

  // Recheck opt-out at the provider boundary. A receipt may remain fresh for
  // seven days, but an intervening opt-out must suppress every channel.
  const { data: legacyMaps, error: legacyMapError } = await supabase
    .from('agency_workspace_legacy_org_map').select('legacy_org_id')
    .eq('agency_workspace_id', receipt.agency_workspace_id);
  const legacyOrgIds = (legacyMaps || []).map((row) => row.legacy_org_id);
  if (legacyMapError || !legacyOrgIds.length) return 'radar_consent_namespace_missing';
  const consentResults = await Promise.all(['all', 'email', 'sms', 'mail', 'phone'].map((channel) => {
    let query = supabase.from('consent_ledger').select('action')
      .in('org_id', legacyOrgIds).eq('channel', channel)
      .order('recorded_at', { ascending: false }).limit(1);
    if (item.to_contact_id) query = query.eq('contact_id', item.to_contact_id);
    else if (channel === 'email') query = query.eq('email', receipt.destination);
    else query = query.eq('phone', receipt.dnc_phone);
    return query.maybeSingle();
  }));
  if (!item.to_contact_id && item.channel === 'email') {
    consentResults.push(await supabase.from('consent_ledger').select('action')
      .in('org_id', legacyOrgIds).eq('channel', 'all').eq('email', receipt.destination)
      .order('recorded_at', { ascending: false }).limit(1).maybeSingle());
  }
  if (consentResults.some(({ error }) => !!error)) return 'radar_opt_out_lookup_failed';
  if (consentResults.some(({ data }) => data?.action === 'opt_out')) return 'radar_all_channel_opt_out';

  return null;
}

async function reserveRadarAttempt(supabase: SupabaseClient, item: QueueItem): Promise<string | null> {
  const { data: receipt, error: receiptError } = await supabase.from('compliance_checks')
    .select('dnc_phone').eq('id', item.compliance_check_id).single();
  if (receiptError || !receipt?.dnc_phone) return 'radar_attempt_phone_missing';
  const normalizedPhone = normalizePhone(receipt.dnc_phone);
  const { data, error } = await supabase.rpc('reserve_radar_send_attempt', {
    p_queue_id: item.id,
    p_compliance_check_id: item.compliance_check_id,
    p_normalized_phone: normalizedPhone,
  });
  if (error) return 'radar_attempt_reservation_failed';
  return data?.allowed === true ? null : `radar_${data?.reason || 'attempt_reservation_failed'}`;
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
      if (!result.MessageID) return { success: false, error: 'Postmark response missing message id' };
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

    if (!response.ok || result.error_code || !result.sid) {
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
  const { data: compliance, error: complianceError } = item.compliance_check_id ? await supabase
    .from('compliance_checks')
    .select('license_number')
    .eq('id', item.compliance_check_id)
    .maybeSingle() : { data: null, error: null };
  if (item.source_type === RADAR_SOURCE_TYPE && (complianceError || !compliance?.license_number)) {
    throw new Error('Radar compliance evidence is unavailable');
  }
  const { data: senderProfile } = await supabase
    .from('profiles')
    .select('email, display_name')
    .eq('id', item.from_user_id)
    .maybeSingle();

  const { data: contactData } = item.to_contact_id ? await supabase
    .from('accounts')
    .select('name')
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
      to_name: contactData?.name || null,
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
      compliance_check_id: item.compliance_check_id,
      license_number: compliance?.license_number || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to create evidence:', error);
    throw error;
  }

  // Create initial event
  const { error: eventError } = await supabase.from('communication_events').insert({
    org_id: item.org_id,
    evidence_id: evidence.id,
    event_type: 'sent',
    event_data: { provider_message_id: providerMessageId },
  });
  if (eventError) throw eventError;

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
  const { data, error } = await supabase
    .from('marketing_send_queue')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      provider_message_id: providerMessageId,
      communication_evidence_id: evidenceId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', queueId)
    .eq('status', 'processing')
    .select('id')
    .maybeSingle();
  if (error || !data) throw error || new Error('Queue item left provider dispatch state');
}

async function markFailed(supabase: SupabaseClient, queueId: string, error: string, incrementAttempt = true) {
  const { data: current } = await supabase.from('marketing_send_queue')
    .select('attempts').eq('id', queueId).maybeSingle();
  await supabase
    .from('marketing_send_queue')
    .update({
      status: 'failed',
      last_error: error,
      last_attempt_at: new Date().toISOString(),
      attempts: (current?.attempts || 0) + (incrementAttempt ? 1 : 0),
      updated_at: new Date().toISOString(),
    })
    .eq('id', queueId);
}

async function markForRetry(supabase: SupabaseClient, queueId: string, error: string, incrementAttempt = true) {
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
      .update({ attempts: (data.attempts || 0) + (incrementAttempt ? 1 : 0) })
      .eq('id', queueId);
  }
}

async function markProviderDispatching(supabase: SupabaseClient, queueId: string): Promise<boolean> {
  const { data, error } = await supabase.from('marketing_send_queue')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', queueId)
    .eq('status', 'claimed')
    .select('id')
    .maybeSingle();
  return !error && !!data;
}

async function markDeliveryUnknown(supabase: SupabaseClient, queueId: string, providerMessageId?: string) {
  const { error } = await supabase.from('marketing_send_queue').update({
    status: 'delivery_unknown',
    provider_message_id: providerMessageId,
    last_error: 'Provider accepted message; delivery evidence persistence is incomplete. Manual reconciliation required.',
    updated_at: new Date().toISOString(),
  }).eq('id', queueId).eq('status', 'processing');
  if (error) console.error('Unable to stamp delivery-unknown state; row remains non-reclaimable processing', error);
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
