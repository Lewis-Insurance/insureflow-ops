// ============================================================================
// POSTMARK WEBHOOK HANDLER  (PLAN-INT-B §4.7)
// ============================================================================
// Receives Postmark delivery-event POSTs (Bounce, SpamComplaint, Open, Click,
// Delivery) and closes the compliance / reputation loop:
//   - records an immutable communication_events row for every event
//   - rolls up daily sender_health_metrics counters + bounce/complaint rates
//   - honors opt-outs: hard bounce  -> email_marketing = false + consent_ledger
//                       spam complaint -> do_not_market = true + consent_ledger
//   - auto-pauses sending globally when bounce/complaint rate exceeds the
//     governor thresholds (sender_pause_state scope_type='global')
//
// Security: Postmark cannot send a Supabase JWT, so verify_jwt = false (see
// supabase/config.toml). Auth is enforced inside the function via an embedded
// secret (HTTP Basic and/or a token query-param/header). Mirrors canopy-webhook:
// if NO secret is configured we WARN and proceed (for initial setup) rather than
// crash; if a secret IS configured we reject mismatches with 401.
//
// We always return 200 quickly on success because Postmark retries non-2xx.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";

const logger = createLogger('postmark-webhook');

// ----------------------------------------------------------------------------
// Types (Postmark sends one event object per POST)
// https://postmarkapp.com/developer/webhooks/webhooks-overview
// ----------------------------------------------------------------------------
interface PostmarkEvent {
  RecordType?: string;          // 'Bounce' | 'SpamComplaint' | 'Open' | 'Click' | 'Delivery'
  MessageID?: string;           // Postmark server message id == our provider_message_id
  Recipient?: string;           // present on Bounce/SpamComplaint/Delivery
  Email?: string;               // present on Bounce/SpamComplaint
  Type?: string;                // bounce type, e.g. 'HardBounce', 'SpamComplaint', 'SoftBounce'
  TypeCode?: number;            // numeric bounce type code
  BouncedAt?: string;           // ISO ts on Bounce
  DeliveredAt?: string;         // ISO ts on Delivery
  ReceivedAt?: string;          // ISO ts on Open/Click
  Metadata?: Record<string, unknown>;
  [key: string]: unknown;       // pass-through; we store the raw payload
}

// Mapped internal event_type values. MUST be in the communication_events
// event_type CHECK set: queued|processing|sent|delivered|opened|clicked|
// replied|bounced|complained|unsubscribed|failed|cancelled|suppressed
type InternalEventType =
  | 'bounced'
  | 'complained'
  | 'opened'
  | 'clicked'
  | 'delivered';

// ----------------------------------------------------------------------------
// Constant-time string comparison (avoid timing oracle on the token).
// ----------------------------------------------------------------------------
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ----------------------------------------------------------------------------
// AUTH: returns true if the request is authorized, false otherwise.
// `configured` indicates whether ANY secret was set (if none, caller proceeds
// with a warning, mirroring canopy-webhook).
// ----------------------------------------------------------------------------
function authorizeRequest(req: Request): { authorized: boolean; configured: boolean } {
  const basicUser = Deno.env.get('POSTMARK_WEBHOOK_USER');
  const basicPass = Deno.env.get('POSTMARK_WEBHOOK_PASS');
  const tokenSecret = Deno.env.get('POSTMARK_WEBHOOK_SECRET');

  const hasBasic = Boolean(basicUser && basicPass);
  const hasToken = Boolean(tokenSecret);
  const configured = hasBasic || hasToken;

  if (!configured) {
    // No secret configured at all -> proceed (initial setup / testing).
    return { authorized: false, configured: false };
  }

  // (a) HTTP Basic auth — Postmark "Webhook" supports embedding basic-auth creds.
  if (hasBasic) {
    const authHeader = req.headers.get('authorization') || '';
    if (authHeader.toLowerCase().startsWith('basic ')) {
      try {
        const decoded = atob(authHeader.slice(6).trim());
        const idx = decoded.indexOf(':');
        const user = idx >= 0 ? decoded.slice(0, idx) : decoded;
        const pass = idx >= 0 ? decoded.slice(idx + 1) : '';
        if (timingSafeEqual(user, basicUser!) && timingSafeEqual(pass, basicPass!)) {
          return { authorized: true, configured: true };
        }
      } catch {
        // malformed base64 -> not authorized via basic
      }
    }
  }

  // (b) token via ?token= query param OR x-postmark-token header.
  if (hasToken) {
    const url = new URL(req.url);
    const queryToken = url.searchParams.get('token') || '';
    const headerToken = req.headers.get('x-postmark-token') || '';
    if (
      (queryToken && timingSafeEqual(queryToken, tokenSecret!)) ||
      (headerToken && timingSafeEqual(headerToken, tokenSecret!))
    ) {
      return { authorized: true, configured: true };
    }
  }

  return { authorized: false, configured: true };
}

// ----------------------------------------------------------------------------
// Map a Postmark RecordType to our internal communication_events.event_type.
// Returns null for record types we don't ingest (e.g. SubscriptionChange).
// ----------------------------------------------------------------------------
function mapRecordType(recordType: string | undefined): InternalEventType | null {
  switch ((recordType || '').toLowerCase()) {
    case 'bounce':
      return 'bounced';
    case 'spamcomplaint':
      return 'complained';
    case 'open':
      return 'opened';
    case 'click':
      return 'clicked';
    case 'delivery':
      return 'delivered';
    default:
      return null;
  }
}

// Hard-bounce detection. Postmark `Type` values that are permanent failures.
// HardBounce is the primary one; the others are treated as permanent/suppress.
function isHardBounce(evt: PostmarkEvent): boolean {
  const t = (evt.Type || '').toLowerCase();
  // Postmark hard/permanent bounce types. SoftBounce / Transient are NOT hard.
  // (Postmark Type strings: 'HardBounce', 'BadEmailAddress',
  //  'ManuallyDeactivated', 'SpamNotification', 'Unsubscribe', ...)
  return (
    t === 'hardbounce' ||
    t === 'bademailaddress' ||
    t === 'manuallydeactivated' ||
    t === 'unsubscribe' ||         // list-unsubscribe surfaced via bounce stream
    t === 'spamnotification'
  );
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, x-postmark-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    logger.error('Missing Supabase configuration');
    return new Response('Server configuration error', { status: 500, headers: CORS_HEADERS });
  }

  // --- AUTH --------------------------------------------------------------
  const { authorized, configured } = authorizeRequest(req);
  if (configured && !authorized) {
    logger.warn('Postmark webhook auth failed - rejecting request');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
  if (!configured) {
    logger.warn(
      'No Postmark webhook secret configured (POSTMARK_WEBHOOK_USER/PASS or POSTMARK_WEBHOOK_SECRET) - ' +
      'signature verification disabled. Configure a secret for production!'
    );
  }

  // --- PARSE -------------------------------------------------------------
  let evt: PostmarkEvent;
  try {
    const rawBody = await req.text();
    logger.info('Received Postmark webhook', { bodyLength: rawBody.length });
    evt = JSON.parse(rawBody) as PostmarkEvent;
  } catch (err) {
    // Bad JSON: respond 200 so Postmark does NOT retry an unparseable body forever.
    logger.error('Failed to parse Postmark payload', err instanceof Error ? err : undefined);
    return new Response(JSON.stringify({ success: false, error: 'invalid_json' }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const internalEventType = mapRecordType(evt.RecordType);
  if (!internalEventType) {
    logger.warn('Unhandled Postmark RecordType - acknowledging without processing', {
      recordType: evt.RecordType,
    });
    return new Response(JSON.stringify({ success: true, skipped: true }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const messageId = evt.MessageID || null;
  const recipientEmail = evt.Email || evt.Recipient || null;

  // Each step is isolated so one failure never blocks the others (or the 200).
  try {
    // --------------------------------------------------------------------
    // 1. Resolve our internal record: org_id + evidence_id + recipient.
    //    Primary key = communication_evidence.provider_message_id.
    //    Fallback   = marketing_send_queue.provider_message_id.
    // --------------------------------------------------------------------
    let orgId: string | null = null;
    let evidenceId: string | null = null;
    let resolvedEmail: string | null = recipientEmail;

    if (messageId) {
      const { data: evidence, error: evErr } = await supabase
        .from('communication_evidence')
        .select('id, org_id, to_email')
        .eq('provider_message_id', messageId)
        .limit(1)
        .maybeSingle();

      if (evErr) {
        logger.error('communication_evidence lookup failed', undefined, { error: evErr.message });
      } else if (evidence) {
        evidenceId = evidence.id as string;
        orgId = evidence.org_id as string;
        resolvedEmail = resolvedEmail || (evidence.to_email as string | null);
      }

      // Fallback to the send queue to recover org/recipient when no evidence row.
      if (!orgId) {
        const { data: queued, error: qErr } = await supabase
          .from('marketing_send_queue')
          .select('org_id, to_email, communication_evidence_id')
          .eq('provider_message_id', messageId)
          .limit(1)
          .maybeSingle();

        if (qErr) {
          logger.error('marketing_send_queue lookup failed', undefined, { error: qErr.message });
        } else if (queued) {
          orgId = (queued.org_id as string) ?? orgId;
          resolvedEmail = resolvedEmail || (queued.to_email as string | null);
          // communication_events.evidence_id is NOT NULL, so only set if present.
          evidenceId = evidenceId || (queued.communication_evidence_id as string | null);
        }
      }
    }

    logger.info('Resolved Postmark event', {
      recordType: evt.RecordType,
      internalEventType,
      messageId,
      orgId,
      evidenceId,
      hasRecipient: Boolean(resolvedEmail),
    });

    // --------------------------------------------------------------------
    // 2. ALWAYS record a communication_events row when we can.
    //    NOTE: communication_events requires NON-NULL org_id AND evidence_id
    //    (evidence_id is a NOT NULL FK -> communication_evidence). If we could
    //    not resolve an evidence row we cannot insert here without violating
    //    the constraint, so we log and skip. (See TODO(verify) in summary.)
    //    source must be one of: system|provider_webhook|user_action|
    //    inbound_parse -> we use 'provider_webhook' (NOT 'postmark', which
    //    would violate the CHECK) and tag the provider inside event_data.
    // --------------------------------------------------------------------
    if (orgId && evidenceId) {
      const { error: insErr } = await supabase.from('communication_events').insert({
        org_id: orgId,
        evidence_id: evidenceId,
        event_type: internalEventType,
        event_data: { provider: 'postmark', payload: evt as unknown },
        occurred_at: eventTimestamp(evt),
        source: 'provider_webhook',
      });
      if (insErr) {
        logger.error('Failed to insert communication_events', undefined, { error: insErr.message });
      }
    } else {
      logger.warn('Skipping communication_events insert (missing org_id and/or evidence_id)', {
        messageId,
        orgId,
        evidenceId,
      });
    }

    // --------------------------------------------------------------------
    // 3. Roll up daily sender_health_metrics counters for the org.
    //    sender_health_metrics.scope_type CHECK allows only ('user','org'),
    //    so an org-wide rollup uses scope_type='org', scope_id=org_id.
    //    UNIQUE(org_id, scope_type, scope_id, metric_date) drives the upsert.
    // --------------------------------------------------------------------
    if (orgId) {
      await rollupHealthMetrics(supabase, orgId, evt, internalEventType);
    } else {
      logger.warn('Skipping sender_health_metrics rollup (no org_id resolved)', { messageId });
    }

    // --------------------------------------------------------------------
    // 4. Suppression / consent on hard bounce and spam complaint.
    // --------------------------------------------------------------------
    if (internalEventType === 'bounced' && isHardBounce(evt)) {
      await suppressOnHardBounce(supabase, orgId, resolvedEmail, evt);
    } else if (internalEventType === 'complained') {
      await suppressOnComplaint(supabase, orgId, resolvedEmail, evt);
    }

    // --------------------------------------------------------------------
    // 5. Auto-pause if rates exceed governor thresholds.
    // --------------------------------------------------------------------
    if (orgId && (internalEventType === 'bounced' || internalEventType === 'complained')) {
      await maybeAutoPause(supabase, orgId);
    }
  } catch (err) {
    // Catch-all: never bubble to a non-2xx (Postmark would retry indefinitely).
    logger.error('Postmark webhook processing error', err instanceof Error ? err : undefined);
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});

// ----------------------------------------------------------------------------
// Best-effort event timestamp from the Postmark payload, defaulting to now().
// ----------------------------------------------------------------------------
function eventTimestamp(evt: PostmarkEvent): string {
  const raw =
    evt.BouncedAt || evt.DeliveredAt || evt.ReceivedAt || (evt['ChangedAt'] as string | undefined);
  if (raw) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

// ----------------------------------------------------------------------------
// Increment the relevant daily counter for the org and recompute cheap rates.
// Read-modify-write (no atomic SQL increment helper exists for this table); the
// UNIQUE constraint guarantees a single row per (org, scope, date).
// ----------------------------------------------------------------------------
async function rollupHealthMetrics(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  evt: PostmarkEvent,
  internalEventType: InternalEventType,
): Promise<void> {
  const metricDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const scopeType = 'org';
  const scopeId = orgId;

  try {
    const { data: existing, error: selErr } = await supabase
      .from('sender_health_metrics')
      .select(
        'id, emails_delivered, bounces_hard, bounces_soft, complaints, opens, clicks, emails_sent',
      )
      .eq('org_id', orgId)
      .eq('scope_type', scopeType)
      .eq('scope_id', scopeId)
      .eq('metric_date', metricDate)
      .maybeSingle();

    if (selErr) {
      logger.error('sender_health_metrics select failed', undefined, { error: selErr.message });
      return;
    }

    const cur = {
      emails_delivered: existing?.emails_delivered ?? 0,
      bounces_hard: existing?.bounces_hard ?? 0,
      bounces_soft: existing?.bounces_soft ?? 0,
      complaints: existing?.complaints ?? 0,
      opens: existing?.opens ?? 0,
      clicks: existing?.clicks ?? 0,
      emails_sent: existing?.emails_sent ?? 0,
    };

    // Apply the increment for this event.
    switch (internalEventType) {
      case 'delivered':
        cur.emails_delivered += 1;
        break;
      case 'bounced':
        if (isHardBounce(evt)) cur.bounces_hard += 1;
        else cur.bounces_soft += 1;
        break;
      case 'complained':
        cur.complaints += 1;
        break;
      case 'opened':
        cur.opens += 1;
        break;
      case 'clicked':
        cur.clicks += 1;
        break;
    }

    // Cheap rate recompute. Use a denominator of attempted sends; Postmark does
    // not give us the daily "sent" count here, so approximate attempts as
    // delivered + hard + soft bounces. (See TODO(verify) in summary.)
    const attempted = cur.emails_delivered + cur.bounces_hard + cur.bounces_soft;
    const bounceRate = attempted > 0 ? (cur.bounces_hard + cur.bounces_soft) / attempted : 0;
    const complaintRate =
      cur.emails_delivered > 0 ? cur.complaints / cur.emails_delivered : 0;

    const row = {
      org_id: orgId,
      scope_type: scopeType,
      scope_id: scopeId,
      metric_date: metricDate,
      emails_delivered: cur.emails_delivered,
      bounces_hard: cur.bounces_hard,
      bounces_soft: cur.bounces_soft,
      complaints: cur.complaints,
      opens: cur.opens,
      clicks: cur.clicks,
      emails_sent: cur.emails_sent,
      // DECIMAL(5,4) columns -> clamp/round to 4 dp.
      bounce_rate: Number(bounceRate.toFixed(4)),
      complaint_rate: Number(complaintRate.toFixed(4)),
      updated_at: new Date().toISOString(),
    };

    const { error: upErr } = await supabase
      .from('sender_health_metrics')
      .upsert(row, { onConflict: 'org_id,scope_type,scope_id,metric_date' });

    if (upErr) {
      logger.error('sender_health_metrics upsert failed', undefined, { error: upErr.message });
    }
  } catch (err) {
    logger.error('rollupHealthMetrics error', err instanceof Error ? err : undefined);
  }
}

// ----------------------------------------------------------------------------
// Hard bounce -> stop marketing to this address + immutable consent record.
//   communication_preferences.email_marketing = false (matched by email)
//   consent_ledger: channel='email', action='opt_out', source='system'
// (consent_ledger CHECK constraints do NOT allow 'bounce_suppress' for action
//  nor 'postmark' for source, so we use 'opt_out'/'system' and carry the real
//  provenance in source_details. See TODO(verify) in summary.)
// ----------------------------------------------------------------------------
async function suppressOnHardBounce(
  supabase: ReturnType<typeof createClient>,
  orgId: string | null,
  email: string | null,
  evt: PostmarkEvent,
): Promise<void> {
  if (!email) {
    logger.warn('Hard bounce with no recipient email - cannot suppress', { orgId });
    return;
  }
  await setPreferenceFlag(supabase, orgId, email, { email_marketing: false }, 'hard_bounce');
  await writeConsentRow(supabase, orgId, email, {
    action: 'opt_out',
    purpose: 'marketing',
    reason: 'hard_bounce',
    evt,
  });
  logger.info('Suppressed email_marketing on hard bounce', { orgId, hasEmail: true });
}

// ----------------------------------------------------------------------------
// Spam complaint -> do_not_market = true + immutable consent record.
// ----------------------------------------------------------------------------
async function suppressOnComplaint(
  supabase: ReturnType<typeof createClient>,
  orgId: string | null,
  email: string | null,
  evt: PostmarkEvent,
): Promise<void> {
  if (!email) {
    logger.warn('Spam complaint with no recipient email - cannot suppress', { orgId });
    return;
  }
  await setPreferenceFlag(supabase, orgId, email, { do_not_market: true }, 'spam_complaint');
  await writeConsentRow(supabase, orgId, email, {
    action: 'opt_out',
    purpose: 'marketing',
    reason: 'spam_complaint',
    evt,
  });
  logger.info('Set do_not_market on spam complaint', { orgId, hasEmail: true });
}

// ----------------------------------------------------------------------------
// Update communication_preferences for the matched email.
// NOTE: there is NO unique constraint on communication_preferences(email)
// (only a non-unique index), so we cannot rely on onConflict:'email'. We do a
// manual select -> update-or-insert. We scope the lookup by org_id when known
// to avoid cross-tenant writes; if org_id is unknown we match by email only.
// See TODO(verify) in summary.
// ----------------------------------------------------------------------------
async function setPreferenceFlag(
  supabase: ReturnType<typeof createClient>,
  orgId: string | null,
  email: string,
  patch: Record<string, boolean>,
  reasonSource: string,
): Promise<void> {
  try {
    let query = supabase
      .from('communication_preferences')
      .select('id')
      .eq('email', email)
      .limit(1);
    if (orgId) query = query.eq('org_id', orgId);

    const { data: existing, error: selErr } = await query.maybeSingle();
    if (selErr) {
      logger.error('communication_preferences select failed', undefined, { error: selErr.message });
      return;
    }

    const nowIso = new Date().toISOString();

    if (existing) {
      const { error: upErr } = await supabase
        .from('communication_preferences')
        .update({
          ...patch,
          last_updated_at: nowIso,
          last_updated_source: 'system',
        })
        .eq('id', existing.id);
      if (upErr) {
        logger.error('communication_preferences update failed', undefined, { error: upErr.message });
      }
      return;
    }

    // No existing row. We can only insert if we have an org_id (NOT NULL).
    if (!orgId) {
      logger.warn('No communication_preferences row and no org_id - cannot create suppression', {
        reasonSource,
      });
      return;
    }

    const { error: insErr } = await supabase.from('communication_preferences').insert({
      org_id: orgId,
      email,
      ...patch,
      last_updated_at: nowIso,
      last_updated_source: 'system',
    });
    if (insErr) {
      logger.error('communication_preferences insert failed', undefined, { error: insErr.message });
    }
  } catch (err) {
    logger.error('setPreferenceFlag error', err instanceof Error ? err : undefined);
  }
}

// ----------------------------------------------------------------------------
// Insert an immutable consent_ledger row. org_id is NOT NULL, so we skip if we
// could not resolve an org (and log it) rather than violating the constraint.
// ----------------------------------------------------------------------------
async function writeConsentRow(
  supabase: ReturnType<typeof createClient>,
  orgId: string | null,
  email: string,
  opts: { action: string; purpose: string; reason: string; evt: PostmarkEvent },
): Promise<void> {
  if (!orgId) {
    logger.warn('Cannot write consent_ledger without org_id', { reason: opts.reason });
    return;
  }
  try {
    const { error } = await supabase.from('consent_ledger').insert({
      org_id: orgId,
      email,
      channel: 'email',
      action: opts.action,        // 'opt_out' (CHECK-allowed)
      purpose: opts.purpose,      // 'marketing'
      source: 'system',           // CHECK-allowed; real provenance in source_details
      source_details: {
        provider: 'postmark',
        reason: opts.reason,                       // 'hard_bounce' | 'spam_complaint'
        record_type: opts.evt.RecordType ?? null,
        bounce_type: opts.evt.Type ?? null,
        message_id: opts.evt.MessageID ?? null,
      },
      recorded_at: new Date().toISOString(),
    });
    if (error) {
      logger.error('consent_ledger insert failed', undefined, { error: error.message });
    }
  } catch (err) {
    logger.error('writeConsentRow error', err instanceof Error ? err : undefined);
  }
}

// ----------------------------------------------------------------------------
// Auto-pause: read today's org metrics + governor thresholds; if bounce or
// complaint rate is exceeded, flip the GLOBAL pause state on.
// sender_pause_state global row is keyed by scope_type='global' (single row,
// per checkGlobalPause in marketing-send-governor). We UPDATE that existing row
// rather than upsert with a possibly-wrong org_id (UNIQUE is on
// org_id,scope_type,scope_id and the row was seeded with a specific org_id).
// ----------------------------------------------------------------------------
async function maybeAutoPause(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
): Promise<void> {
  try {
    const metricDate = new Date().toISOString().slice(0, 10);

    const { data: metrics } = await supabase
      .from('sender_health_metrics')
      .select('bounce_rate, complaint_rate')
      .eq('org_id', orgId)
      .eq('scope_type', 'org')
      .eq('scope_id', orgId)
      .eq('metric_date', metricDate)
      .maybeSingle();

    if (!metrics) return;

    // Governor thresholds (single config row; fall back to plan defaults).
    const { data: config } = await supabase
      .from('marketing_governor_config')
      .select('pause_on_bounce_rate, pause_on_complaint_rate')
      .limit(1)
      .maybeSingle();

    const bounceThreshold = config?.pause_on_bounce_rate ?? 0.05;
    const complaintThreshold = config?.pause_on_complaint_rate ?? 0.001;

    const bounceRate = metrics.bounce_rate ?? 0;
    const complaintRate = metrics.complaint_rate ?? 0;

    const bounceExceeded = bounceRate > bounceThreshold;
    const complaintExceeded = complaintRate > complaintThreshold;

    if (!bounceExceeded && !complaintExceeded) return;

    const reason = `auto: bounce/complaint threshold (bounce=${bounceRate} > ${bounceThreshold ? bounceThreshold : 'n/a'}, ` +
      `complaint=${complaintRate} > ${complaintThreshold ? complaintThreshold : 'n/a'})`;

    // Only flip if not already paused, to avoid clobbering an existing reason.
    const { data: pauseRow } = await supabase
      .from('sender_pause_state')
      .select('id, is_paused')
      .eq('scope_type', 'global')
      .limit(1)
      .maybeSingle();

    if (!pauseRow) {
      logger.warn('No global sender_pause_state row found - cannot auto-pause', { orgId });
      return;
    }
    if (pauseRow.is_paused) {
      logger.info('Global send already paused - auto-pause threshold re-confirmed', {
        orgId,
        bounceRate,
        complaintRate,
      });
      return;
    }

    const { error } = await supabase
      .from('sender_pause_state')
      .update({
        is_paused: true,
        marketing_paused: true,
        paused_reason: reason,
        paused_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', pauseRow.id);

    if (error) {
      logger.error('Failed to flip global sender_pause_state', undefined, { error: error.message });
    } else {
      logger.warn('AUTO-PAUSE engaged (global) due to bounce/complaint threshold', {
        orgId,
        bounceRate,
        bounceThreshold,
        complaintRate,
        complaintThreshold,
      });
    }
  } catch (err) {
    logger.error('maybeAutoPause error', err instanceof Error ? err : undefined);
  }
}
