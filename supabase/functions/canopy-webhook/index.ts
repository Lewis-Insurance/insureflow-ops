// ============================================================================
// CANOPY WEBHOOK HANDLER
// ============================================================================
// Receives webhook events from Canopy Connect and processes insurance data
// Implements TRUE 2-way sync with Monitoring API refresh + Servicing API write
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";
import { createLogger } from "../_shared/logger.ts";
import { AuthenticationError, createErrorResponse } from "../_shared/error-handler.ts";

const logger = createLogger('canopy-webhook');

// Webhook event types from Canopy (they use UPPERCASE format)
type CanopyEventType =
  | 'pull.started'
  | 'pull.auth_status'
  | 'pull.policy_available'
  | 'pull.complete'
  | 'pull.error'
  | 'pull.documents_ready'
  // Canopy actual event names (uppercase)
  | 'AUTH_STATUS'
  | 'COMPLETE'
  | 'POLICY_AVAILABLE'
  | 'POLICY_STREAM'
  | 'DATA_UPDATED'
  | 'ERROR'
  | 'MONITORING_RECONNECT'
  | 'SERVICING_WAITING_FOR_CONSENT'
  | 'POLICIES_AVAILABLE';

interface CanopyWebhookPayload {
  event: CanopyEventType;
  pull_id: string;
  timestamp: string;
  data?: {
    carrier?: {
      name: string;
      code?: string;
      naic_code?: string;
    };
    policies?: CanopyPolicy[];
    error?: {
      code: string;
      message: string;
    };
    documents?: CanopyDocument[];
  };
}

interface CanopyPolicy {
  id: string;
  policy_number?: string;
  policy_type: string;
  carrier: {
    name: string;
    code?: string;
    naic_code?: string;
  };
  effective_date?: string;
  expiration_date?: string;
  premium?: {
    amount: number;
    frequency: string;
  };
  status?: string;
  deductible?: number;
  coverage_limits?: Record<string, unknown>;
  named_insureds?: Array<{ name: string }>;
  vehicles?: CanopyVehicle[];
  drivers?: CanopyDriver[];
  dwellings?: CanopyDwelling[];
  claims?: CanopyClaim[];
}

interface CanopyVehicle {
  vin?: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  body_type?: string;
  usage?: string;
  annual_mileage?: number;
  ownership?: string;
  garage_address?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  coverages?: {
    liability_bi?: number;
    liability_bi_total?: number;
    liability_pd?: number;
    collision_deductible?: number;
    comprehensive_deductible?: number;
    uninsured_motorist?: number;
    underinsured_motorist?: number;
    medical_payments?: number;
    rental_reimbursement?: number;
    towing_labor?: number;
  };
}

interface CanopyDriver {
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  suffix?: string;
  date_of_birth?: string;
  gender?: string;
  marital_status?: string;
  license_number?: string;
  license_state?: string;
  license_status?: string;
  license_issue_date?: string;
  license_expiration_date?: string;
  relation_to_insured?: string;
  is_primary?: boolean;
  is_excluded?: boolean;
  sr22_required?: boolean;
  occupation?: string;
  education_level?: string;
  years_licensed?: number;
  violations?: Array<{
    date?: string;
    type?: string;
    description?: string;
  }>;
  accidents?: Array<{
    date?: string;
    type?: string;
    at_fault?: boolean;
    description?: string;
  }>;
}

interface CanopyDwelling {
  address?: {
    street?: string;
    street2?: string;
    city?: string;
    state?: string;
    zip?: string;
    county?: string;
  };
  property_type?: string;
  occupancy_type?: string;
  year_built?: number;
  square_footage?: number;
  stories?: number;
  construction_type?: string;
  exterior_type?: string;
  roof_type?: string;
  roof_year?: number;
  foundation_type?: string;
  heating_type?: string;
  electrical_type?: string;
  plumbing_type?: string;
  coverages?: {
    dwelling?: number;
    other_structures?: number;
    personal_property?: number;
    loss_of_use?: number;
    liability?: number;
    medical_payments?: number;
    deductible?: number;
    wind_hail_deductible?: number;
    hurricane_deductible?: number;
    flood?: boolean;
    earthquake?: boolean;
  };
  features?: {
    swimming_pool?: boolean;
    trampoline?: boolean;
    dog_breed?: string;
    security_system?: boolean;
    fire_alarm?: boolean;
    sprinkler_system?: boolean;
    deadbolt_locks?: boolean;
    gated_community?: boolean;
  };
}

interface CanopyClaim {
  claim_number?: string;
  claim_date?: string;
  close_date?: string;
  claim_type?: string;
  claim_category?: string;
  status?: string;
  amount_paid?: number;
  amount_reserved?: number;
  deductible_applied?: number;
  description?: string;
  at_fault?: boolean;
  subrogation?: boolean;
  claimant_name?: string;
}

interface CanopyDocument {
  type: string;
  url: string;
  name?: string;
  mime_type?: string;
  size?: number;
}

// HMAC-SHA256 signature verification
// Canopy signature format: "t=timestamp,s=signature"
// Signed payload: "{timestamp}.{body}"
async function verifyCanopySignature(
  payload: string,
  signatureHeader: string,
  secret: string
): Promise<{ valid: boolean; timestamp?: number }> {
  // Parse the signature header: "t=1234567890,s=abc123..."
  const parts = signatureHeader.split(',');
  const timestampPart = parts.find(p => p.startsWith('t='));
  const signaturePart = parts.find(p => p.startsWith('s='));

  if (!timestampPart || !signaturePart) {
    logger.warn('Invalid signature header format');
    return { valid: false };
  }

  const timestamp = timestampPart.slice(2);
  const signature = signaturePart.slice(2);

  // Build signed payload: "{timestamp}.{body}"
  const signedPayload = `${timestamp}.${payload}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(signedPayload)
  );

  const expectedSignature = Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time comparison to prevent timing attacks
  if (signature.length !== expectedSignature.length) {
    return { valid: false };
  }

  let result = 0;
  for (let i = 0; i < signature.length; i++) {
    result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
  }

  return {
    valid: result === 0,
    timestamp: parseInt(timestamp, 10)
  };
}

serve(async (req) => {
  // Only accept POST requests for webhooks
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type, x-canopy-signature',
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const canopyWebhookSecret = Deno.env.get('CANOPY_WEBHOOK_SECRET');

  // Validate required configuration
  if (!supabaseUrl || !supabaseServiceKey) {
    logger.error('Missing Supabase configuration');
    return new Response('Server configuration error', { status: 500 });
  }

  try {
    // Read raw body
    const rawBody = await req.text();
    logger.info('Received webhook request', { bodyLength: rawBody.length });

    // Log all headers for debugging
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });
    logger.debug('Request headers', { headers });

    // Get signature from header - Canopy uses 'canopy-signature'
    const signatureHeader = req.headers.get('canopy-signature')
      || req.headers.get('x-canopy-signature');

    // SECURITY: Verify signature - REJECT if invalid when secret is configured
    let signatureValid = false;
    let signatureTimestamp: number | undefined;

    if (canopyWebhookSecret) {
      // Secret is configured - signature verification is REQUIRED
      if (!signatureHeader) {
        logger.error('Missing canopy-signature header - rejecting request');
        return new Response(JSON.stringify({ error: 'Missing signature header' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const verification = await verifyCanopySignature(rawBody, signatureHeader, canopyWebhookSecret);
      signatureValid = verification.valid;
      signatureTimestamp = verification.timestamp;

      if (!signatureValid) {
        logger.error('Signature verification failed - rejecting request', {
          receivedSignature: signatureHeader.substring(0, 20) + '...'
        });
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Check timestamp freshness (within 5 minutes to prevent replay attacks)
      const now = Math.floor(Date.now() / 1000);
      if (signatureTimestamp && Math.abs(now - signatureTimestamp) > 300) {
        logger.error('Signature timestamp too old - possible replay attack', {
          signatureTime: signatureTimestamp,
          currentTime: now,
          diffSeconds: Math.abs(now - signatureTimestamp)
        });
        return new Response(JSON.stringify({ error: 'Signature expired' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      logger.info('Signature verified successfully');
    } else {
      // No secret configured - warn but allow (for initial setup/testing)
      logger.warn('CANOPY_WEBHOOK_SECRET not configured - signature verification disabled. Configure secret for production!');
      signatureValid = true; // Mark as valid since we can't verify
    }

    // Parse payload
    const rawPayload = JSON.parse(rawBody);
    logger.debug('Raw payload received', { preview: JSON.stringify(rawPayload).substring(0, 500) });

    // Canopy uses different payload structures:
    // 1. { status: "SUCCESS", pull_id: "...", data: {...} } - completion events
    // 2. { event: "AUTH_STATUS", pull_id: "...", data: {...} } - some events use 'event'
    // 3. { data: { updates: [{type: "DRIVER_UPDATED", ...}] }, pull_id: "..." } - incremental updates

    // Normalize the event type from Canopy's various formats
    let eventType: string;
    if (rawPayload.event) {
      // Direct event field
      eventType = rawPayload.event;
    } else if (rawPayload.status) {
      // Status-based events (SUCCESS, ERROR, etc.)
      eventType = rawPayload.status;
    } else if (rawPayload.data?.updates?.length > 0) {
      // Incremental update events
      eventType = 'DATA_UPDATED';
    } else if (rawPayload.data?.policy_id) {
      // Policy stream event
      eventType = 'POLICY_STREAM';
    } else {
      eventType = 'UNKNOWN';
    }

    const payload = {
      ...rawPayload,
      event: eventType, // Normalize event field
    };

    logger.info('Processing event', { eventType, pullId: payload.pull_id });

    // Create Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Log webhook event for debugging
    const { error: logError } = await supabase.from('canopy_webhook_log').insert({
      event_type: eventType,
      pull_id: payload.pull_id,
      payload: rawPayload,
      headers: headers,
      signature: signatureHeader || 'none',
      signature_valid: signatureValid,
    });

    if (logError) {
      logger.error('Failed to log webhook', { error: logError.message });
    }

    // Route by event type (handle both Canopy formats)
    switch (eventType) {
      // Canopy UPPERCASE events (actual format they send)
      case 'AUTH_STATUS':
        await handleAuthStatus(supabase, payload);
        break;

      case 'POLICY_AVAILABLE':
      case 'POLICIES_AVAILABLE':
      case 'POLICY_STREAM':
      case 'DATA_UPDATED':
        await handlePolicyAvailable(supabase, payload);
        break;

      case 'COMPLETE':
      case 'SUCCESS':  // Canopy also sends "SUCCESS" status
        await handlePullComplete(supabase, payload);
        break;

      case 'ERROR':
      case 'FAILURE':  // Canopy also sends "FAILURE" status
        await handlePullError(supabase, payload);
        break;

      case 'MONITORING_RECONNECT':
        // Carrier connection needs to be re-established for monitoring
        await handleMonitoringReconnect(supabase, payload);
        break;

      case 'SERVICING_WAITING_FOR_CONSENT':
      case 'SERVICING_WAITING_FOR_CONSUMER_CONFIRMATION':
        // Carrier requires consumer confirmation for a servicing action
        await handleServicingWaiting(supabase, payload);
        break;

      // Legacy lowercase events (in case Canopy sends these too)
      case 'pull.started':
        await handlePullStarted(supabase, payload);
        break;

      case 'pull.auth_status':
        await handleAuthStatus(supabase, payload);
        break;

      case 'pull.policy_available':
        await handlePolicyAvailable(supabase, payload);
        break;

      case 'pull.complete':
        await handlePullComplete(supabase, payload);
        break;

      case 'pull.error':
        await handlePullError(supabase, payload);
        break;

      case 'pull.documents_ready':
        await handleDocumentsReady(supabase, payload);
        break;

      case 'UNKNOWN':
      default:
        logger.warn('Unknown/unhandled event type', { eventType });
        // Still try to process if there's policy data
        if (rawPayload.data?.policies || rawPayload.data?.updates) {
          logger.info('Found data in unknown event, processing...');
          await handlePolicyAvailable(supabase, payload);
        }
    }

    // Store snapshot for audit trail and change detection (after processing)
    if (payload.pull_id && rawPayload.data) {
      await storeSnapshot(supabase, payload.pull_id, eventType, rawPayload);
    }

    // Mark webhook as processed
    await supabase.from('canopy_webhook_log')
      .update({
        processed: true,
        processed_at: new Date().toISOString()
      })
      .eq('pull_id', payload.pull_id)
      .eq('event_type', payload.event)
      .order('received_at', { ascending: false })
      .limit(1);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    logger.error('Webhook processing failed', { error: error instanceof Error ? error.message : String(error) });

    // Try to log the error
    try {
      const supabase = createClient(supabaseUrl!, supabaseServiceKey!);
      await supabase.from('canopy_webhook_log').update({
        processing_error: error instanceof Error ? error.message : 'Unknown error'
      }).eq('id', 'last');
    } catch {
      // Ignore logging errors
    }

    return new Response(JSON.stringify({ error: 'Processing failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// ============================================================================
// SNAPSHOT STORAGE (for audit trail and change detection)
// ============================================================================

async function storeSnapshot(
  supabase: ReturnType<typeof createClient>,
  pullId: string,
  eventType: string,
  rawPayload: unknown
) {
  try {
    // Get the internal pull ID
    const { data: pull } = await supabase.from('canopy_pulls')
      .select('id')
      .eq('canopy_pull_id', pullId)
      .single();

    if (!pull) {
      logger.debug('No pull record found for snapshot', { pullId });
      return;
    }

    // Determine snapshot type based on event
    let snapshotType: 'initial' | 'refresh' | 'update' = 'update';
    if (eventType === 'COMPLETE' || eventType === 'SUCCESS') {
      // Check if this is the first complete event
      const { count } = await supabase.from('canopy_pull_snapshots')
        .select('*', { count: 'exact', head: true })
        .eq('pull_id', pull.id);

      snapshotType = (count || 0) === 0 ? 'initial' : 'refresh';
    } else if (eventType === 'DATA_UPDATED') {
      snapshotType = 'update';
    }

    // Store the snapshot
    await supabase.from('canopy_pull_snapshots').insert({
      pull_id: pull.id,
      snapshot_type: snapshotType,
      snapshot_data: rawPayload,
    });

    logger.debug('Stored snapshot', { pullId: pull.id, snapshotType });
  } catch (error) {
    logger.error('Failed to store snapshot', { error: error instanceof Error ? error.message : String(error) });
    // Don't throw - snapshot storage is non-critical
  }
}

// ============================================================================
// MONITORING RECONNECT HANDLER (2-way sync: read refresh)
// ============================================================================

async function handleMonitoringReconnect(
  supabase: ReturnType<typeof createClient>,
  payload: CanopyWebhookPayload
) {
  logger.info('Monitoring reconnect required', { pullId: payload.pull_id });

  // Get the pull record
  const { data: pull } = await supabase.from('canopy_pulls')
    .select('id, lead_id, account_id')
    .eq('canopy_pull_id', payload.pull_id)
    .single();

  if (!pull) {
    logger.warn('Pull not found for monitoring reconnect', { pullId: payload.pull_id });
    return;
  }

  // Create monitoring record with reconnect_needed status
  const { error } = await supabase.from('canopy_monitorings').upsert({
    pull_id: pull.id,
    status: 'reconnect_needed',
    reconnect_required_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, {
    onConflict: 'pull_id'
  });

  if (error) {
    logger.error('Failed to update monitoring status', { error: error.message });
    return;
  }

  // Update pull status
  await supabase.from('canopy_pulls').update({
    status: 'monitoring_reconnect_needed',
    updated_at: new Date().toISOString(),
  }).eq('id', pull.id);

  logger.info('Monitoring reconnect status recorded', { pullId: pull.id });
}

// ============================================================================
// SERVICING WAITING HANDLER (2-way sync: write confirmation)
// ============================================================================

async function handleServicingWaiting(
  supabase: ReturnType<typeof createClient>,
  payload: CanopyWebhookPayload
) {
  logger.info('Servicing action waiting for confirmation', { pullId: payload.pull_id, data: payload.data });

  // Get the pull record
  const { data: pull } = await supabase.from('canopy_pulls')
    .select('id')
    .eq('canopy_pull_id', payload.pull_id)
    .single();

  if (!pull) {
    logger.warn('Pull not found for servicing action', { pullId: payload.pull_id });
    return;
  }

  // Extract action details from payload
  const actionData = payload.data as any;

  // Find the pending servicing action and update it
  const { error } = await supabase.from('canopy_servicing_actions')
    .update({
      status: 'waiting_confirmation',
      confirmation_url: actionData?.confirmation_url,
      confirmation_deadline: actionData?.deadline,
      carrier_response: actionData,
      updated_at: new Date().toISOString(),
    })
    .eq('pull_id', pull.id)
    .eq('status', 'pending');

  if (error) {
    logger.error('Failed to update servicing action', { error: error.message });
    return;
  }

  logger.info('Servicing action updated to waiting_confirmation', { pullId: pull.id });
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

async function handlePullStarted(supabase: ReturnType<typeof createClient>, payload: CanopyWebhookPayload) {
  // Create or update pull record
  const { error } = await supabase.from('canopy_pulls')
    .upsert({
      canopy_pull_id: payload.pull_id,
      status: 'processing',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'canopy_pull_id'
    });

  if (error) {
    logger.error('Failed to create/update pull', { error: error.message });
  } else {
    logger.info('Created pull record', { pullId: payload.pull_id });
  }
}

async function handleAuthStatus(supabase: ReturnType<typeof createClient>, payload: CanopyWebhookPayload) {
  const { error } = await supabase.from('canopy_pulls')
    .upsert({
      canopy_pull_id: payload.pull_id,
      status: 'authenticated',
      metadata: payload.data?.carrier ? { authenticated_carrier: payload.data.carrier.name } : {},
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'canopy_pull_id'
    });

  if (error) {
    logger.error('Failed to update auth status', { error: error.message });
  } else {
    logger.info('Auth status updated', { pullId: payload.pull_id });
  }
}

async function handlePolicyAvailable(supabase: ReturnType<typeof createClient>, payload: CanopyWebhookPayload) {
  const policies = payload.data?.policies || [];

  // First ensure the pull record exists
  const { data: existingPull } = await supabase.from('canopy_pulls')
    .select('id')
    .eq('canopy_pull_id', payload.pull_id)
    .single();

  let pullId = existingPull?.id;

  if (!pullId) {
    // Create the pull record if it doesn't exist
    const { data: newPull, error: createError } = await supabase.from('canopy_pulls')
      .insert({
        canopy_pull_id: payload.pull_id,
        status: 'processing',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (createError) {
      logger.error('Failed to create pull record', { error: createError.message });
      return;
    }
    pullId = newPull?.id;
    logger.info('Created pull record for policies', { pullId: payload.pull_id });
  }

  for (const policy of policies) {
    const pull = { id: pullId };

    // Insert policy
    const { data: insertedPolicy, error: policyError } = await supabase.from('canopy_policies')
      .insert({
        pull_id: pull.id,
        canopy_policy_id: policy.id,
        carrier_name: policy.carrier.name,
        carrier_code: policy.carrier.code,
        carrier_naic_code: policy.carrier.naic_code,
        policy_number: policy.policy_number,
        policy_type: mapPolicyType(policy.policy_type),
        effective_date: policy.effective_date,
        expiration_date: policy.expiration_date,
        premium_amount: policy.premium?.amount,
        premium_frequency: policy.premium?.frequency,
        status: policy.status || 'active',
        deductible: policy.deductible,
        coverage_limits: policy.coverage_limits || {},
        named_insureds: policy.named_insureds || [],
        raw_data: policy
      })
      .select()
      .single();

    if (policyError) {
      logger.error('Failed to insert policy', { error: policyError.message });
      continue;
    }

    // Insert vehicles
    if (policy.vehicles?.length) {
      for (const vehicle of policy.vehicles) {
        await supabase.from('canopy_vehicles').insert({
          policy_id: insertedPolicy.id,
          vin: vehicle.vin,
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          trim: vehicle.trim,
          body_type: vehicle.body_type,
          usage_type: mapUsageType(vehicle.usage),
          annual_mileage: vehicle.annual_mileage,
          ownership: mapOwnership(vehicle.ownership),
          garage_address: vehicle.garage_address?.street,
          garage_city: vehicle.garage_address?.city,
          garage_state: vehicle.garage_address?.state,
          garage_zip: vehicle.garage_address?.zip,
          liability_bi: vehicle.coverages?.liability_bi,
          liability_bi_total: vehicle.coverages?.liability_bi_total,
          liability_pd: vehicle.coverages?.liability_pd,
          collision_deductible: vehicle.coverages?.collision_deductible,
          comprehensive_deductible: vehicle.coverages?.comprehensive_deductible,
          uninsured_motorist: vehicle.coverages?.uninsured_motorist,
          underinsured_motorist: vehicle.coverages?.underinsured_motorist,
          medical_payments: vehicle.coverages?.medical_payments,
          rental_reimbursement: vehicle.coverages?.rental_reimbursement,
          towing_labor: vehicle.coverages?.towing_labor,
          coverages: vehicle.coverages || {}
        });
      }
    }

    // Insert drivers
    if (policy.drivers?.length) {
      for (const driver of policy.drivers) {
        await supabase.from('canopy_drivers').insert({
          policy_id: insertedPolicy.id,
          first_name: driver.first_name,
          last_name: driver.last_name,
          middle_name: driver.middle_name,
          suffix: driver.suffix,
          date_of_birth: driver.date_of_birth,
          gender: mapGender(driver.gender),
          marital_status: mapMaritalStatus(driver.marital_status),
          license_number: driver.license_number,
          license_state: driver.license_state,
          license_status: mapLicenseStatus(driver.license_status),
          license_issue_date: driver.license_issue_date,
          license_expiration_date: driver.license_expiration_date,
          relation_to_insured: mapRelation(driver.relation_to_insured),
          is_primary: driver.is_primary || false,
          is_excluded: driver.is_excluded || false,
          sr22_required: driver.sr22_required || false,
          occupation: driver.occupation,
          education_level: driver.education_level,
          years_licensed: driver.years_licensed,
          violations: driver.violations || [],
          accidents: driver.accidents || []
        });
      }
    }

    // Insert dwellings
    if (policy.dwellings?.length) {
      for (const dwelling of policy.dwellings) {
        await supabase.from('canopy_dwellings').insert({
          policy_id: insertedPolicy.id,
          address_line1: dwelling.address?.street,
          address_line2: dwelling.address?.street2,
          city: dwelling.address?.city,
          state: dwelling.address?.state,
          zip: dwelling.address?.zip,
          county: dwelling.address?.county,
          property_type: mapPropertyType(dwelling.property_type),
          occupancy_type: mapOccupancyType(dwelling.occupancy_type),
          year_built: dwelling.year_built,
          square_footage: dwelling.square_footage,
          stories: dwelling.stories,
          construction_type: dwelling.construction_type,
          exterior_type: dwelling.exterior_type,
          roof_type: dwelling.roof_type,
          roof_year: dwelling.roof_year,
          foundation_type: dwelling.foundation_type,
          heating_type: dwelling.heating_type,
          electrical_type: dwelling.electrical_type,
          plumbing_type: dwelling.plumbing_type,
          dwelling_coverage: dwelling.coverages?.dwelling,
          other_structures: dwelling.coverages?.other_structures,
          personal_property: dwelling.coverages?.personal_property,
          loss_of_use: dwelling.coverages?.loss_of_use,
          liability_coverage: dwelling.coverages?.liability,
          medical_payments: dwelling.coverages?.medical_payments,
          deductible: dwelling.coverages?.deductible,
          wind_hail_deductible: dwelling.coverages?.wind_hail_deductible,
          hurricane_deductible: dwelling.coverages?.hurricane_deductible,
          flood_coverage: dwelling.coverages?.flood || false,
          earthquake_coverage: dwelling.coverages?.earthquake || false,
          swimming_pool: dwelling.features?.swimming_pool || false,
          trampoline: dwelling.features?.trampoline || false,
          dog_breed: dwelling.features?.dog_breed,
          security_system: dwelling.features?.security_system || false,
          fire_alarm: dwelling.features?.fire_alarm || false,
          sprinkler_system: dwelling.features?.sprinkler_system || false,
          deadbolt_locks: dwelling.features?.deadbolt_locks || false,
          gated_community: dwelling.features?.gated_community || false
        });
      }
    }

    // Insert claims
    if (policy.claims?.length) {
      for (const claim of policy.claims) {
        await supabase.from('canopy_claims').insert({
          policy_id: insertedPolicy.id,
          claim_number: claim.claim_number,
          claim_date: claim.claim_date,
          close_date: claim.close_date,
          claim_type: claim.claim_type,
          claim_category: claim.claim_category,
          status: mapClaimStatus(claim.status),
          amount_paid: claim.amount_paid,
          amount_reserved: claim.amount_reserved,
          deductible_applied: claim.deductible_applied,
          description: claim.description,
          at_fault: claim.at_fault,
          subrogation: claim.subrogation || false,
          claimant_name: claim.claimant_name,
          raw_data: claim
        });
      }
    }
  }

  // Update pull policy count
  const { count } = await supabase.from('canopy_policies')
    .select('*', { count: 'exact', head: true })
    .eq('pull_id', payload.pull_id);

  await supabase.from('canopy_pulls')
    .update({
      policy_count: count || 0,
      updated_at: new Date().toISOString()
    })
    .eq('canopy_pull_id', payload.pull_id);
}

async function handlePullComplete(supabase: ReturnType<typeof createClient>, payload: CanopyWebhookPayload) {
  // First check if the pull exists
  const { data: existingPull } = await supabase.from('canopy_pulls')
    .select('id, lead_id')
    .eq('canopy_pull_id', payload.pull_id)
    .single();

  let pull = existingPull;

  if (!pull) {
    // Create the pull record if it doesn't exist (shouldn't happen but be safe)
    const { data: newPull, error: createError } = await supabase.from('canopy_pulls')
      .insert({
        canopy_pull_id: payload.pull_id,
        status: 'processing', // Set to processing first, will update after fetching
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select('id, lead_id')
      .single();

    if (createError) {
      logger.error('Failed to create pull record on complete', { error: createError.message });
      return;
    }
    pull = newPull;
    logger.info('Created pull record on complete', { pullId: payload.pull_id });
  }

  if (!pull) {
    logger.error('No pull record available');
    return;
  }

  // =========================================================================
  // FETCH COMPLETE DATA FROM CANOPY API
  // =========================================================================
  // CRITICAL: Webhook only contains pull_id - we MUST fetch full data via API
  // API URL format: https://app.usecanopy.com/api/v1.0.0/teams/{teamId}/pulls/{pullId}
  // Auth: x-canopy-client-id and x-canopy-client-secret headers (NOT Basic auth!)
  // =========================================================================
  const canopyClientId = Deno.env.get('CANOPY_CLIENT_ID');
  const canopyClientSecret = Deno.env.get('CANOPY_CLIENT_SECRET');
  const canopyTeamId = Deno.env.get('CANOPY_TEAM_ID');
  const canopyApiBaseUrl = 'https://app.usecanopy.com/api/v1.0.0';

  if (canopyClientId && canopyClientSecret && canopyTeamId) {
    try {
      const apiUrl = `${canopyApiBaseUrl}/teams/${canopyTeamId}/pulls/${payload.pull_id}`;
      logger.info('Fetching complete data from Canopy API', { apiUrl });

      const apiResponse = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'x-canopy-client-id': canopyClientId,
          'x-canopy-client-secret': canopyClientSecret,
        },
      });

      if (apiResponse.ok) {
        const responseData = await apiResponse.json();
        logger.debug('API returned data', { preview: JSON.stringify(responseData).substring(0, 2000) });

        // Canopy API response structure: { success: true, pull: { ...pullData, policies: [...] } }
        const pullData = responseData.pull || responseData;
        let policies = pullData.policies || [];

        logger.info('Pull consumer info', {
          firstName: pullData.first_name,
          lastName: pullData.last_name,
          email: pullData.account_email || pullData.email
        });

        // If no policies in pull response, try fetching from the policies endpoint
        if (policies.length === 0) {
          logger.info('No policies in pull response, trying /policies endpoint...');
          try {
            const policiesUrl = `${canopyApiBaseUrl}/teams/${canopyTeamId}/pulls/${payload.pull_id}/policies`;
            logger.info('Fetching policies endpoint', { policiesUrl });

            const policiesResponse = await fetch(policiesUrl, {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
                'x-canopy-client-id': canopyClientId,
                'x-canopy-client-secret': canopyClientSecret,
              },
            });

            if (policiesResponse.ok) {
              const policiesData = await policiesResponse.json();
              logger.debug('Policies endpoint returned', { preview: JSON.stringify(policiesData).substring(0, 2000) });
              // Handle different response formats
              policies = policiesData.policies || policiesData.data || (Array.isArray(policiesData) ? policiesData : []);
            } else {
              logger.warn('Policies endpoint returned error status', { status: policiesResponse.status });
            }
          } catch (policiesError) {
            logger.error('Failed to fetch policies endpoint', { error: policiesError instanceof Error ? policiesError.message : String(policiesError) });
          }
        }

        logger.info('Total policies to process', { count: policies.length });

        // Process each policy from the API response
        for (const policy of policies) {
          logger.debug('Processing policy', { preview: JSON.stringify(policy).substring(0, 500) });
          await processCanopyPolicy(supabase, pull.id, policy);
        }

        // Also process top-level drivers from pull.drivers if they exist
        // These may be duplicates of vehicle drivers, but our upsert handles that
        const pullLevelDrivers = pullData.drivers || [];
        if (pullLevelDrivers.length > 0 && policies.length > 0) {
          logger.info('Processing pull-level drivers', { count: pullLevelDrivers.length });
          // Get the first policy ID to associate these drivers with
          const { data: firstPolicy } = await supabase
            .from('canopy_policies')
            .select('id')
            .eq('pull_id', pull.id)
            .limit(1)
            .single();

          if (firstPolicy) {
            for (const driver of pullLevelDrivers) {
              await upsertDriver(supabase, firstPolicy.id, driver);
            }
          }
        }

        // Check for documents in pull data or policies
        // Canopy may return documents as part of the pull response
        const pullDocuments = pullData.documents || [];
        if (pullDocuments.length > 0) {
          logger.info('Found documents in pull data', { count: pullDocuments.length });
          // Get first policy to associate documents with
          const { data: firstPolicy } = await supabase
            .from('canopy_policies')
            .select('id')
            .eq('pull_id', pull.id)
            .limit(1)
            .single();

          if (firstPolicy) {
            for (const doc of pullDocuments) {
              await supabase.from('canopy_documents').insert({
                policy_id: firstPolicy.id,
                document_type: mapDocumentType(doc.type || doc.document_type || 'other'),
                file_url: doc.url || doc.download_url,
                file_name: doc.name || doc.file_name || 'Document',
                mime_type: doc.mime_type || 'application/pdf',
                downloaded: false
              });
            }
          }
        }

        // Also check for ID cards in policies
        for (const policy of policies) {
          if (policy.id_cards?.length > 0 || policy.documents?.length > 0) {
            const policyDocs = [...(policy.id_cards || []), ...(policy.documents || [])];
            logger.info('Found documents in policy', { count: policyDocs.length, policyId: policy.policy_id || policy.id });

            // Get our policy ID
            const { data: ourPolicy } = await supabase
              .from('canopy_policies')
              .select('id')
              .eq('canopy_policy_id', policy.policy_id || policy.id)
              .single();

            if (ourPolicy) {
              for (const doc of policyDocs) {
                await supabase.from('canopy_documents').insert({
                  policy_id: ourPolicy.id,
                  document_type: mapDocumentType(doc.type || 'id_card'),
                  file_url: doc.url || doc.download_url || doc.pdf_url,
                  file_name: doc.name || doc.file_name || 'ID Card',
                  mime_type: doc.mime_type || 'application/pdf',
                  downloaded: false
                });
              }
            }
          }
        }

        // Update pull with counts and consumer info from API
        const policyCounts = await getPolicyCounts(supabase, pull.id);
        await supabase.from('canopy_pulls').update({
          policy_count: policyCounts.policies,
          carrier_count: policyCounts.carriers,
          // Store consumer info from the API response
          metadata: {
            consumer_first_name: pullData.first_name,
            consumer_last_name: pullData.last_name,
            consumer_email: pullData.account_email || pullData.email,
            consumer_phone: pullData.mobile_phone || pullData.home_phone || pullData.phone,
            insurance_provider: pullData.insurance_provider_name,
          }
        }).eq('id', pull.id);

        logger.info('Processed policies and stored in database', { policyCount: policyCounts.policies });

        // Store the consumer data for lead creation
        pull.consumer_data = {
          first_name: pullData.first_name,
          last_name: pullData.last_name,
          email: pullData.account_email || pullData.email,
          phone: pullData.mobile_phone || pullData.home_phone || pullData.phone,
        };
      } else {
        const errorText = await apiResponse.text();
        logger.error('API fetch failed', { status: apiResponse.status, error: errorText });
      }
    } catch (fetchError) {
      logger.error('Failed to fetch from API', { error: fetchError instanceof Error ? fetchError.message : String(fetchError) });
      // Continue with webhook data
    }
  } else {
    const missing = [];
    if (!canopyClientId) missing.push('CANOPY_CLIENT_ID');
    if (!canopyClientSecret) missing.push('CANOPY_CLIENT_SECRET');
    if (!canopyTeamId) missing.push('CANOPY_TEAM_ID');
    logger.warn('Missing API credentials - cannot fetch full data', { missing });
  }

  // Update status to complete
  await supabase.from('canopy_pulls')
    .update({
      status: 'complete',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', pull.id);

  let leadId = pull?.lead_id;

  // If no lead is linked, create one automatically from the Canopy data
  if (!leadId && pull?.id) {
    try {
      // Pass consumer data from API if available
      const consumerData = (pull as any).consumer_data;
      leadId = await createLeadFromCanopyPull(supabase, pull.id, consumerData);

      if (leadId) {
        // Link the new lead to the pull
        await supabase.from('canopy_pulls')
          .update({ lead_id: leadId })
          .eq('id', pull.id);

        logger.info('Created new lead from Canopy pull', { leadId, pullId: payload.pull_id });
      }
    } catch (createError) {
      logger.error('Failed to create lead from Canopy data', { error: createError instanceof Error ? createError.message : String(createError) });
    }
  }

  // If we have a lead (existing or newly created), update lead score
  if (leadId) {
    try {
      // Give Canopy-imported leads a high initial score (verified data)
      await supabase.from('leads')
        .update({
          lead_score: 75, // High score for verified Canopy data
          status: 'qualified',
          updated_at: new Date().toISOString()
        })
        .eq('id', leadId);
    } catch (scoreError) {
      logger.error('Failed to update lead score', { error: scoreError instanceof Error ? scoreError.message : String(scoreError) });
    }
  }

  logger.info('Pull completed successfully', { pullId: payload.pull_id });
}

// Process a complete policy from the Canopy API
// Canopy API returns a different structure than expected:
// - policy.policy_id instead of policy.id
// - policy.carrier_policy_number instead of policy.policy_number
// - policy.expiry_date instead of policy.expiration_date
// - policy.total_premium_cents (in cents!) instead of policy.premium.amount
// - policy.carrier_name instead of policy.carrier.name
// - Drivers are inside policy.vehicles[].drivers AND at pull level
async function processCanopyPolicy(supabase: ReturnType<typeof createClient>, pullId: string, policy: any) {
  // Get the policy ID (handle both formats)
  const canopyPolicyId = policy.policy_id || policy.id;

  if (!canopyPolicyId) {
    logger.error('Policy has no ID', { preview: JSON.stringify(policy).substring(0, 200) });
    return;
  }

  logger.info('Processing policy', { canopyPolicyId, policyType: policy.policy_type || policy.name });

  // Check if policy already exists (avoid duplicates)
  const { data: existingPolicy } = await supabase
    .from('canopy_policies')
    .select('id')
    .eq('canopy_policy_id', canopyPolicyId)
    .single();

  let policyDbId: string;

  // Convert premium from cents to dollars if needed
  let premiumAmount = policy.premium?.amount;
  if (!premiumAmount && policy.total_premium_cents) {
    premiumAmount = policy.total_premium_cents / 100;
  }

  // Get carrier info (handle both formats)
  const carrierName = policy.carrier?.name || policy.carrier_name || policy.carrier_friendly_name || 'Unknown';

  const policyData = {
    pull_id: pullId,
    canopy_policy_id: canopyPolicyId,
    carrier_name: carrierName,
    carrier_code: policy.carrier?.code,
    carrier_naic_code: policy.carrier?.naic_code,
    policy_number: policy.policy_number || policy.carrier_policy_number,
    policy_type: mapPolicyType(policy.policy_type),
    effective_date: policy.effective_date,
    expiration_date: policy.expiration_date || policy.expiry_date || policy.renewal_date,
    premium_amount: premiumAmount,
    premium_frequency: policy.premium?.frequency || policy.payment_frequency || 'semi-annual',
    status: mapPolicyStatus(policy.status),
    deductible: policy.deductible || (policy.deductible_cents ? policy.deductible_cents / 100 : null),
    coverage_limits: policy.coverage_limits || {},
    named_insureds: policy.named_insureds || [],
    raw_data: policy,
  };

  if (existingPolicy) {
    // Update existing policy
    await supabase.from('canopy_policies').update(policyData).eq('id', existingPolicy.id);
    policyDbId = existingPolicy.id;
    logger.debug('Updated existing policy', { policyDbId });
  } else {
    // Insert new policy
    const { data: newPolicy, error: policyError } = await supabase
      .from('canopy_policies')
      .insert(policyData)
      .select('id')
      .single();

    if (policyError) {
      logger.error('Failed to insert policy', { error: policyError.message });
      return;
    }
    policyDbId = newPolicy.id;
    logger.debug('Inserted new policy', { policyDbId });
  }

  // Process vehicles - Canopy structure has drivers INSIDE vehicles
  for (const vehicle of policy.vehicles || []) {
    await upsertVehicle(supabase, policyDbId, vehicle);

    // Process drivers that are attached to this vehicle
    for (const driver of vehicle.drivers || []) {
      await upsertDriver(supabase, policyDbId, driver);
    }
  }

  // Process drivers at policy level (if any)
  for (const driver of policy.drivers || []) {
    await upsertDriver(supabase, policyDbId, driver);
  }

  // Process dwellings
  for (const dwelling of policy.dwellings || []) {
    await upsertDwelling(supabase, policyDbId, dwelling);
  }

  // Process claims
  const claimsCount = policy.claims?.length || 0;
  logger.debug('Processing policy claims', { canopyPolicyId, claimsCount });
  if (claimsCount > 0) {
    logger.debug('Claims data', { preview: JSON.stringify(policy.claims).substring(0, 500) });
  }
  for (const claim of policy.claims || []) {
    await upsertClaim(supabase, policyDbId, claim);
  }

  // Log documents for this policy
  const idCardsCount = policy.id_cards?.length || 0;
  const docsCount = policy.documents?.length || 0;
  logger.debug('Policy documents', { canopyPolicyId, idCardsCount, docsCount });
  if (idCardsCount > 0) {
    logger.debug('ID cards', { preview: JSON.stringify(policy.id_cards).substring(0, 500) });
  }
  if (docsCount > 0) {
    logger.debug('Documents', { preview: JSON.stringify(policy.documents).substring(0, 500) });
  }

  // =========================================================================
  // COMMERCIAL LINES PROCESSING
  // =========================================================================
  const mappedPolicyType = mapPolicyType(policy.policy_type);
  if (isCommercialPolicy(mappedPolicyType)) {
    logger.info('Processing commercial policy', { canopyPolicyId, policyType: mappedPolicyType });

    // Commercial Auto - Fleet vehicles
    if (mappedPolicyType === 'commercial_auto') {
      for (const vehicle of policy.vehicles || policy.fleet_vehicles || []) {
        await upsertCommercialVehicle(supabase, policyDbId, vehicle);
      }
    }

    // General Liability / BOP - Business operations
    if (['general_liability', 'bop'].includes(mappedPolicyType)) {
      if (policy.business_info || policy.operations) {
        await upsertBusinessOperations(supabase, policyDbId, policy.business_info || policy.operations);
      }
    }

    // Commercial Property - Business locations
    if (['commercial_property', 'bop'].includes(mappedPolicyType)) {
      for (const location of policy.locations || policy.business_locations || []) {
        await upsertBusinessLocation(supabase, policyDbId, location);
      }
    }

    // Workers Comp - Payroll data
    if (mappedPolicyType === 'workers_comp') {
      for (const payrollClass of policy.payroll || policy.class_codes || []) {
        await upsertPayroll(supabase, policyDbId, payrollClass);
      }
    }

    // Named insureds / Additional insureds
    for (const insured of policy.additional_insureds || policy.named_insureds || []) {
      await upsertNamedInsured(supabase, policyDbId, insured);
    }
  }

  // Store structured coverages for all policy types
  if (policy.coverages && Array.isArray(policy.coverages)) {
    for (const coverage of policy.coverages) {
      await upsertPolicyCoverage(supabase, policyDbId, coverage);
    }
  }

  logger.info('Finished processing policy', { canopyPolicyId, isCommercial: isCommercialPolicy(mappedPolicyType) });
}

// Map Canopy policy status to our status
function mapPolicyStatus(status: string | undefined): string {
  if (!status) return 'active';
  const statusMap: Record<string, string> = {
    'ACTIVE': 'active',
    'CANCELLED': 'cancelled',
    'EXPIRED': 'expired',
    'PENDING': 'pending',
    'INACTIVE': 'inactive',
  };
  return statusMap[status.toUpperCase()] || status.toLowerCase();
}

// Upsert vehicle with deduplication
// Canopy vehicle structure:
// - vehicle.vehicle_id instead of just id
// - vehicle.type instead of body_type
// - vehicle.uses[] array instead of usage string
// - vehicle.ownership_type instead of ownership
// - vehicle.lien_holder, lien_holder_address
// - vehicle.coverages[] is an ARRAY of objects with name, premium_cents, limit fields
async function upsertVehicle(supabase: ReturnType<typeof createClient>, policyId: string, vehicle: any) {
  let existingId: string | null = null;

  if (vehicle.vin) {
    const { data: existing } = await supabase
      .from('canopy_vehicles')
      .select('id')
      .eq('policy_id', policyId)
      .eq('vin', vehicle.vin)
      .single();
    existingId = existing?.id;
  }

  // Parse coverages array into flat structure
  const coverages = vehicle.coverages || [];
  const coverageMap: Record<string, any> = {};
  for (const cov of coverages) {
    coverageMap[cov.name] = cov;
  }

  // Get garaging address
  const garageAddr = vehicle.garaging_address || vehicle.GaragingAddress;

  // Map uses array to usage type
  const uses = vehicle.uses || [];
  const usageType = uses.includes('COMMUTE') ? 'commute'
    : uses.includes('BUSINESS') ? 'business'
    : uses.includes('PLEASURE') || uses.includes('PERSONAL') ? 'pleasure'
    : 'other';

  const vehicleData = {
    policy_id: policyId,
    vin: vehicle.vin,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.series || vehicle.trim,
    body_type: vehicle.type || vehicle.body_type,
    usage_type: usageType,
    annual_mileage: vehicle.annual_mileage,
    ownership: mapOwnership(vehicle.ownership_type || vehicle.ownership),
    garage_address: garageAddr?.street || garageAddr?.full_address,
    garage_city: garageAddr?.city,
    garage_state: garageAddr?.state,
    garage_zip: garageAddr?.zip,
    // Parse coverages from array - amounts are in cents
    liability_bi: coverageMap['BODILY_INJURY_LIABILITY']?.per_person_limit_cents
      ? coverageMap['BODILY_INJURY_LIABILITY'].per_person_limit_cents / 100 : null,
    liability_bi_total: coverageMap['BODILY_INJURY_LIABILITY']?.per_incident_limit_cents
      ? coverageMap['BODILY_INJURY_LIABILITY'].per_incident_limit_cents / 100 : null,
    liability_pd: coverageMap['PROPERTY_DAMAGE_LIABILITY']?.per_incident_limit_cents
      ? coverageMap['PROPERTY_DAMAGE_LIABILITY'].per_incident_limit_cents / 100 : null,
    collision_deductible: coverageMap['COLLISION']?.deductible_cents
      ? coverageMap['COLLISION'].deductible_cents / 100 : null,
    comprehensive_deductible: coverageMap['COMPREHENSIVE']?.deductible_cents
      ? coverageMap['COMPREHENSIVE'].deductible_cents / 100 : null,
    uninsured_motorist: coverageMap['UNINSURED_MOTORISTS']?.per_person_limit_cents
      ? coverageMap['UNINSURED_MOTORISTS'].per_person_limit_cents / 100 : null,
    underinsured_motorist: coverageMap['UNDERINSURED_MOTORISTS']?.per_person_limit_cents
      ? coverageMap['UNDERINSURED_MOTORISTS'].per_person_limit_cents / 100 : null,
    medical_payments: coverageMap['MEDICAL_PAYMENTS']?.per_person_limit_cents
      ? coverageMap['MEDICAL_PAYMENTS'].per_person_limit_cents / 100 : null,
    rental_reimbursement: coverageMap['RENTAL_REIMBURSEMENT']?.per_day_limit_cents
      ? coverageMap['RENTAL_REIMBURSEMENT'].per_day_limit_cents / 100 : null,
    towing_labor: coverageMap['EMERGENCY_ROAD_SERVICE']?.per_incident_limit_cents
      ? coverageMap['EMERGENCY_ROAD_SERVICE'].per_incident_limit_cents / 100 : null,
    // Store full coverages array
    coverages: coverages,
  };

  if (existingId) {
    await supabase.from('canopy_vehicles').update(vehicleData).eq('id', existingId);
  } else {
    await supabase.from('canopy_vehicles').insert(vehicleData);
  }
}

// Upsert driver with deduplication
// Canopy driver structure:
// - driver_id (Canopy's ID)
// - drivers_license: { number, state, status, issue_date, expiration_date } (can be null)
// - date_of_birth_str: "MM/DD/YYYY" format instead of ISO date
// - is_excluded boolean
// - data_source: "CARRIER" | "CONSUMER"
async function upsertDriver(supabase: ReturnType<typeof createClient>, policyId: string, driver: any) {
  // Get driver ID from Canopy for deduplication
  const canopyDriverId = driver.driver_id;

  // Try to find existing driver by Canopy ID or license
  let existingId: string | null = null;

  // Get license info from nested object or flat fields
  const license = driver.drivers_license || driver.license;
  const licenseNumber = license?.number || driver.license_number;
  const licenseState = license?.state || driver.license_state;

  // First try by driver_id if available
  if (canopyDriverId) {
    // Check if we have a driver with matching first/last name for this policy
    const { data: existing } = await supabase
      .from('canopy_drivers')
      .select('id')
      .eq('policy_id', policyId)
      .eq('first_name', driver.first_name)
      .eq('last_name', driver.last_name)
      .single();
    existingId = existing?.id;
  }

  // Fallback: check by license
  if (!existingId && licenseNumber && licenseState) {
    const { data: existing } = await supabase
      .from('canopy_drivers')
      .select('id')
      .eq('policy_id', policyId)
      .eq('license_number', licenseNumber)
      .eq('license_state', licenseState)
      .single();
    existingId = existing?.id;
  }

  // Parse date_of_birth from string format (MM/DD/YYYY)
  let dateOfBirth = driver.date_of_birth;
  if (!dateOfBirth && driver.date_of_birth_str) {
    const parts = driver.date_of_birth_str.split('/');
    if (parts.length === 3) {
      // Convert MM/DD/YYYY to YYYY-MM-DD
      dateOfBirth = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    }
  }

  // Calculate years_licensed from age_licensed if available
  let yearsLicensed = driver.years_licensed;
  if (!yearsLicensed && driver.age_licensed && driver.age) {
    yearsLicensed = driver.age - driver.age_licensed;
  }

  const driverData = {
    policy_id: policyId,
    first_name: driver.first_name,
    last_name: driver.last_name,
    middle_name: driver.middle_name,
    suffix: driver.suffix,
    date_of_birth: dateOfBirth,
    gender: mapGender(driver.gender),
    marital_status: mapMaritalStatus(driver.marital_status),
    license_number: licenseNumber,
    license_state: licenseState,
    license_status: mapLicenseStatus(license?.status || driver.license_status),
    license_issue_date: license?.issue_date || driver.license_issue_date,
    license_expiration_date: license?.expiration_date || driver.license_expiration_date,
    relation_to_insured: mapRelation(driver.relation_to_insured),
    is_primary: driver.is_primary || false,
    is_excluded: driver.is_excluded || false,
    sr22_required: driver.sr22_required || false,
    occupation: driver.occupation,
    education_level: driver.education,
    years_licensed: yearsLicensed,
    violations: driver.violations || [],
    accidents: driver.accidents || [],
  };

  if (existingId) {
    await supabase.from('canopy_drivers').update(driverData).eq('id', existingId);
  } else {
    await supabase.from('canopy_drivers').insert(driverData);
  }
}

// Upsert dwelling with deduplication
async function upsertDwelling(supabase: ReturnType<typeof createClient>, policyId: string, dwelling: any) {
  let existingId: string | null = null;
  const street = dwelling.address?.street;
  const zip = dwelling.address?.zip;

  if (street && zip) {
    const { data: existing } = await supabase
      .from('canopy_dwellings')
      .select('id')
      .eq('policy_id', policyId)
      .eq('address_line1', street)
      .eq('zip', zip)
      .single();
    existingId = existing?.id;
  }

  const dwellingData = {
    policy_id: policyId,
    address_line1: street,
    address_line2: dwelling.address?.street2,
    city: dwelling.address?.city,
    state: dwelling.address?.state,
    zip: zip,
    county: dwelling.address?.county,
    property_type: mapPropertyType(dwelling.property_type),
    occupancy_type: mapOccupancyType(dwelling.occupancy_type),
    year_built: dwelling.year_built,
    square_footage: dwelling.square_footage,
    stories: dwelling.stories,
    construction_type: dwelling.construction_type,
    exterior_type: dwelling.exterior_type,
    roof_type: dwelling.roof_type,
    roof_year: dwelling.roof_year,
    foundation_type: dwelling.foundation_type,
    heating_type: dwelling.heating_type,
    electrical_type: dwelling.electrical_type,
    plumbing_type: dwelling.plumbing_type,
    dwelling_coverage: dwelling.coverages?.dwelling,
    other_structures: dwelling.coverages?.other_structures,
    personal_property: dwelling.coverages?.personal_property,
    loss_of_use: dwelling.coverages?.loss_of_use,
    liability_coverage: dwelling.coverages?.liability,
    medical_payments: dwelling.coverages?.medical_payments,
    deductible: dwelling.coverages?.deductible,
    wind_hail_deductible: dwelling.coverages?.wind_hail_deductible,
    hurricane_deductible: dwelling.coverages?.hurricane_deductible,
    flood_coverage: dwelling.coverages?.flood || false,
    earthquake_coverage: dwelling.coverages?.earthquake || false,
    swimming_pool: dwelling.features?.swimming_pool || false,
    trampoline: dwelling.features?.trampoline || false,
    dog_breed: dwelling.features?.dog_breed,
    security_system: dwelling.features?.security_system || false,
    fire_alarm: dwelling.features?.fire_alarm || false,
    sprinkler_system: dwelling.features?.sprinkler_system || false,
    deadbolt_locks: dwelling.features?.deadbolt_locks || false,
    gated_community: dwelling.features?.gated_community || false,
  };

  if (existingId) {
    await supabase.from('canopy_dwellings').update(dwellingData).eq('id', existingId);
  } else {
    await supabase.from('canopy_dwellings').insert(dwellingData);
  }
}

// Upsert claim with deduplication
async function upsertClaim(supabase: ReturnType<typeof createClient>, policyId: string, claim: any) {
  let existingId: string | null = null;

  if (claim.claim_number) {
    const { data: existing } = await supabase
      .from('canopy_claims')
      .select('id')
      .eq('policy_id', policyId)
      .eq('claim_number', claim.claim_number)
      .single();
    existingId = existing?.id;
  }

  const claimData = {
    policy_id: policyId,
    claim_number: claim.claim_number,
    claim_date: claim.claim_date,
    close_date: claim.close_date,
    claim_type: claim.claim_type,
    claim_category: claim.claim_category,
    status: mapClaimStatus(claim.status),
    amount_paid: claim.amount_paid,
    amount_reserved: claim.amount_reserved,
    deductible_applied: claim.deductible_applied,
    description: claim.description,
    at_fault: claim.at_fault,
    subrogation: claim.subrogation || false,
    claimant_name: claim.claimant_name,
  };

  if (existingId) {
    await supabase.from('canopy_claims').update(claimData).eq('id', existingId);
  } else {
    await supabase.from('canopy_claims').insert(claimData);
  }
}

// ============================================================================
// COMMERCIAL LINES UPSERT FUNCTIONS
// ============================================================================

// Upsert commercial vehicle (fleet vehicle for commercial auto - ACORD 127)
async function upsertCommercialVehicle(
  supabase: ReturnType<typeof createClient>,
  policyId: string,
  vehicle: any
) {
  let existingId: string | null = null;

  if (vehicle.vin) {
    const { data: existing } = await supabase
      .from('canopy_commercial_vehicles')
      .select('id')
      .eq('policy_id', policyId)
      .eq('vin', vehicle.vin)
      .single();
    existingId = existing?.id;
  }

  const vehicleData = {
    policy_id: policyId,
    unit_number: vehicle.unit_number,
    vin: vehicle.vin,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    vehicle_type: vehicle.type || vehicle.vehicle_type,
    gvw: vehicle.gvw || vehicle.gross_vehicle_weight,
    radius_of_operation: vehicle.radius,
    farthest_terminal: vehicle.farthest_terminal,
    vehicle_use: vehicle.use || vehicle.primary_use,
    fleet_size: vehicle.fleet_size,
    is_owned: vehicle.ownership === 'owned' || vehicle.is_owned,
    is_leased: vehicle.ownership === 'leased' || vehicle.is_leased,
    is_hired: vehicle.is_hired,
    is_non_owned: vehicle.is_non_owned,
    driver_id: vehicle.assigned_driver_id,
    liability_limit: vehicle.coverages?.liability,
    physical_damage: vehicle.coverages?.physical_damage,
    cargo_limit: vehicle.coverages?.cargo,
    hired_auto: vehicle.coverages?.hired_auto,
    non_owned_auto: vehicle.coverages?.non_owned_auto,
    raw_data: vehicle,
  };

  if (existingId) {
    await supabase.from('canopy_commercial_vehicles').update(vehicleData).eq('id', existingId);
  } else {
    await supabase.from('canopy_commercial_vehicles').insert(vehicleData);
  }
}

// Upsert business operations (GL/BOP - ACORD 125/126)
async function upsertBusinessOperations(
  supabase: ReturnType<typeof createClient>,
  policyId: string,
  operations: any
) {
  // Check if we already have operations for this policy
  const { data: existing } = await supabase
    .from('canopy_business_operations')
    .select('id')
    .eq('policy_id', policyId)
    .single();

  const operationsData = {
    policy_id: policyId,
    business_name: operations.business_name || operations.name,
    dba_name: operations.dba || operations.doing_business_as,
    entity_type: operations.entity_type || operations.legal_entity,
    fein: operations.fein || operations.tax_id,
    sic_code: operations.sic_code,
    naics_code: operations.naics_code,
    business_description: operations.description || operations.business_description,
    years_in_business: operations.years_in_business,
    years_current_ownership: operations.years_current_ownership,
    annual_revenue: operations.annual_revenue || operations.gross_receipts,
    employee_count: operations.employee_count || operations.full_time_employees,
    part_time_employees: operations.part_time_employees,
    subcontractors_used: operations.subcontractors_used,
    subcontractor_cost: operations.subcontractor_cost,
    products_completed_ops: operations.products_completed_ops,
    professional_services: operations.professional_services,
    has_liquor_exposure: operations.liquor_exposure || operations.serves_alcohol,
    raw_data: operations,
  };

  if (existing) {
    await supabase.from('canopy_business_operations').update(operationsData).eq('id', existing.id);
  } else {
    await supabase.from('canopy_business_operations').insert(operationsData);
  }
}

// Upsert business location (Commercial Property - ACORD 140)
async function upsertBusinessLocation(
  supabase: ReturnType<typeof createClient>,
  policyId: string,
  location: any
) {
  let existingId: string | null = null;
  const address = location.address || location;

  if (address.street && address.zip) {
    const { data: existing } = await supabase
      .from('canopy_business_locations')
      .select('id')
      .eq('policy_id', policyId)
      .eq('address_line1', address.street)
      .eq('zip', address.zip)
      .single();
    existingId = existing?.id;
  }

  const locationData = {
    policy_id: policyId,
    location_number: location.location_number || location.number,
    address_line1: address.street,
    address_line2: address.street2,
    city: address.city,
    state: address.state,
    zip: address.zip,
    county: address.county,
    is_owned: location.ownership === 'owned',
    is_leased: location.ownership === 'leased',
    building_description: location.building_description || location.description,
    construction_type: location.construction_type,
    year_built: location.year_built,
    square_footage: location.square_footage,
    stories: location.stories || location.number_of_stories,
    fire_protection_class: location.fire_class || location.protection_class,
    sprinklered: location.sprinkler || location.has_sprinkler,
    alarm_type: location.alarm_type,
    building_coverage: location.coverages?.building,
    bpp_coverage: location.coverages?.business_personal_property,
    business_income: location.coverages?.business_income,
    extra_expense: location.coverages?.extra_expense,
    tenant_improvements: location.coverages?.tenant_improvements,
    raw_data: location,
  };

  if (existingId) {
    await supabase.from('canopy_business_locations').update(locationData).eq('id', existingId);
  } else {
    await supabase.from('canopy_business_locations').insert(locationData);
  }
}

// Upsert payroll class (Workers Comp - ACORD 130)
async function upsertPayroll(
  supabase: ReturnType<typeof createClient>,
  policyId: string,
  payrollClass: any
) {
  let existingId: string | null = null;

  if (payrollClass.class_code && payrollClass.state) {
    const { data: existing } = await supabase
      .from('canopy_payroll')
      .select('id')
      .eq('policy_id', policyId)
      .eq('class_code', payrollClass.class_code)
      .eq('state', payrollClass.state)
      .single();
    existingId = existing?.id;
  }

  const payrollData = {
    policy_id: policyId,
    state: payrollClass.state,
    class_code: payrollClass.class_code,
    class_description: payrollClass.description || payrollClass.class_description,
    employee_count: payrollClass.employee_count || payrollClass.employees,
    annual_payroll: payrollClass.payroll || payrollClass.annual_payroll,
    rate: payrollClass.rate,
    estimated_premium: payrollClass.premium || payrollClass.estimated_premium,
    experience_mod: payrollClass.experience_mod || payrollClass.mod_factor,
    raw_data: payrollClass,
  };

  if (existingId) {
    await supabase.from('canopy_payroll').update(payrollData).eq('id', existingId);
  } else {
    await supabase.from('canopy_payroll').insert(payrollData);
  }
}

// Upsert named/additional insured
async function upsertNamedInsured(
  supabase: ReturnType<typeof createClient>,
  policyId: string,
  insured: any
) {
  let existingId: string | null = null;

  if (insured.name) {
    const { data: existing } = await supabase
      .from('canopy_named_insureds')
      .select('id')
      .eq('policy_id', policyId)
      .eq('name', insured.name)
      .single();
    existingId = existing?.id;
  }

  const insuredData = {
    policy_id: policyId,
    name: insured.name,
    insured_type: insured.type || (insured.is_additional ? 'additional' : 'named'),
    entity_type: insured.entity_type,
    address_line1: insured.address?.street,
    address_line2: insured.address?.street2,
    city: insured.address?.city,
    state: insured.address?.state,
    zip: insured.address?.zip,
    interest_type: insured.interest_type,
    is_mortgagee: insured.is_mortgagee || false,
    is_loss_payee: insured.is_loss_payee || false,
    is_additional_insured: insured.is_additional || insured.is_additional_insured || false,
    endorsement_number: insured.endorsement_number,
    raw_data: insured,
  };

  if (existingId) {
    await supabase.from('canopy_named_insureds').update(insuredData).eq('id', existingId);
  } else {
    await supabase.from('canopy_named_insureds').insert(insuredData);
  }
}

// Upsert structured coverage data
async function upsertPolicyCoverage(
  supabase: ReturnType<typeof createClient>,
  policyId: string,
  coverage: any
) {
  let existingId: string | null = null;

  if (coverage.name || coverage.coverage_code) {
    const { data: existing } = await supabase
      .from('canopy_policy_coverages')
      .select('id')
      .eq('policy_id', policyId)
      .eq('coverage_code', coverage.coverage_code || coverage.name)
      .single();
    existingId = existing?.id;
  }

  // Handle amounts in cents
  const limit = coverage.limit_cents ? coverage.limit_cents / 100 : coverage.limit;
  const perOccurrence = coverage.per_occurrence_cents
    ? coverage.per_occurrence_cents / 100
    : coverage.per_occurrence || coverage.per_incident_limit;
  const aggregate = coverage.aggregate_cents
    ? coverage.aggregate_cents / 100
    : coverage.aggregate || coverage.aggregate_limit;
  const deductible = coverage.deductible_cents
    ? coverage.deductible_cents / 100
    : coverage.deductible;
  const premium = coverage.premium_cents
    ? coverage.premium_cents / 100
    : coverage.premium;

  const coverageData = {
    policy_id: policyId,
    coverage_code: coverage.coverage_code || coverage.name,
    coverage_description: coverage.description || coverage.coverage_description,
    limit_amount: limit,
    per_occurrence: perOccurrence,
    aggregate: aggregate,
    deductible: deductible,
    premium: premium,
    effective_date: coverage.effective_date,
    expiration_date: coverage.expiration_date,
    raw_data: coverage,
  };

  if (existingId) {
    await supabase.from('canopy_policy_coverages').update(coverageData).eq('id', existingId);
  } else {
    await supabase.from('canopy_policy_coverages').insert(coverageData);
  }
}

// Get policy counts for the pull
async function getPolicyCounts(supabase: ReturnType<typeof createClient>, pullId: string) {
  const { data: policies } = await supabase
    .from('canopy_policies')
    .select('carrier_name')
    .eq('pull_id', pullId);

  return {
    policies: policies?.length || 0,
    carriers: [...new Set(policies?.map(p => p.carrier_name) || [])].length,
  };
}

// Consumer data from Canopy API
interface CanopyConsumerData {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
}

// Create a new lead from Canopy pull data
async function createLeadFromCanopyPull(
  supabase: ReturnType<typeof createClient>,
  pullId: string,
  consumerData?: CanopyConsumerData
): Promise<string | null> {
  logger.info('Creating lead from pull', { pullId, consumerData });

  // Try to get consumer info from metadata if not provided directly
  let firstName = consumerData?.first_name;
  let lastName = consumerData?.last_name;
  let email = consumerData?.email;
  let phone = consumerData?.phone;

  // If no consumer data passed, check the pull metadata
  if (!firstName || !lastName) {
    const { data: pullRecord } = await supabase.from('canopy_pulls')
      .select('metadata')
      .eq('id', pullId)
      .single();

    const metadata = pullRecord?.metadata as any;
    if (metadata) {
      firstName = firstName || metadata.consumer_first_name;
      lastName = lastName || metadata.consumer_last_name;
      email = email || metadata.consumer_email;
      phone = phone || metadata.consumer_phone;
    }
  }

  // Fallback: Get the primary driver from the policies
  if (!firstName || !lastName) {
    const { data: drivers } = await supabase.from('canopy_drivers')
      .select(`
        *,
        canopy_policies!inner (pull_id)
      `)
      .eq('canopy_policies.pull_id', pullId)
      .eq('is_primary', true)
      .limit(1);

    // If no primary driver, get the first driver
    let driver = drivers?.[0];
    if (!driver) {
      const { data: anyDriver } = await supabase.from('canopy_drivers')
        .select(`
          *,
          canopy_policies!inner (pull_id)
        `)
        .eq('canopy_policies.pull_id', pullId)
        .limit(1);
      driver = anyDriver?.[0];
    }

    if (driver) {
      firstName = firstName || driver.first_name;
      lastName = lastName || driver.last_name;
    }
  }

  // Get policy types for this pull
  const { data: policies } = await supabase.from('canopy_policies')
    .select('policy_type, carrier_name, premium_amount, expiration_date')
    .eq('pull_id', pullId);

  const insuranceTypes = [...new Set(policies?.map(p => p.policy_type) || [])];
  const carriers = [...new Set(policies?.map(p => p.carrier_name).filter(Boolean) || [])];
  const totalPremium = policies?.reduce((sum, p) => sum + (p.premium_amount || 0), 0) || 0;

  // Find the earliest expiration date
  const expirationDates = policies
    ?.map(p => p.expiration_date)
    .filter(Boolean)
    .sort();
  const nextExpiration = expirationDates?.[0];

  // If we still don't have insurance types, default to auto (since this is Canopy)
  const finalInsuranceTypes = insuranceTypes.length > 0 ? insuranceTypes : ['auto'];

  logger.info('Creating lead', { firstName, lastName, email, phone });
  logger.info('Insurance details', { insuranceTypes: finalInsuranceTypes, carriers });

  // Create the lead with all available consumer info
  const { data: newLead, error: leadError } = await supabase.from('leads')
    .insert({
      first_name: firstName || 'Unknown',
      last_name: lastName || 'Customer',
      email: email || null,
      phone: phone || null,
      insurance_types: finalInsuranceTypes,
      lead_score: 75, // High score for verified Canopy data
      status: 'qualified',
      source_details: { source: 'canopy_import', provider: 'canopy_connect' },
      // Store Canopy-specific info in notes field
      notes: `Imported from Canopy Connect. Carriers: ${carriers.join(', ') || 'N/A'}. Premium: $${totalPremium || 0}. Expiration: ${nextExpiration || 'N/A'}`
    })
    .select('id')
    .single();

  if (leadError) {
    logger.error('Failed to create lead', { error: leadError.message });
    return null;
  }

  // Copy driver info to lead_auto_drivers if we have a driver and auto insurance
  if (driver && insuranceTypes.includes('auto') && newLead?.id) {
    const { data: allDrivers } = await supabase.from('canopy_drivers')
      .select(`
        *,
        canopy_policies!inner (pull_id)
      `)
      .eq('canopy_policies.pull_id', pullId);

    for (const d of allDrivers || []) {
      await supabase.from('lead_auto_drivers').insert({
        lead_id: newLead.id,
        first_name: d.first_name,
        last_name: d.last_name,
        date_of_birth: d.date_of_birth,
        gender: d.gender,
        marital_status: d.marital_status,
        license_number: d.license_number,
        license_state: d.license_state,
        relation_to_insured: d.relation_to_insured,
        years_licensed: d.years_licensed,
        accidents_violations: {
          violations: d.violations || [],
          accidents: d.accidents || []
        }
      });
    }

    // Copy vehicle info to lead_auto_vehicles
    const { data: vehicles } = await supabase.from('canopy_vehicles')
      .select(`
        *,
        canopy_policies!inner (pull_id)
      `)
      .eq('canopy_policies.pull_id', pullId);

    for (const v of vehicles || []) {
      await supabase.from('lead_auto_vehicles').insert({
        lead_id: newLead.id,
        year: v.year,
        make: v.make,
        model: v.model,
        vin: v.vin,
        ownership: v.ownership,
        primary_use: v.usage_type,
        annual_mileage: v.annual_mileage,
        garage_address: [v.garage_address, v.garage_city, v.garage_state, v.garage_zip]
          .filter(Boolean)
          .join(', '),
        safety_features: v.coverages || {}
      });
    }
  }

  return newLead?.id || null;
}

async function handlePullError(supabase: ReturnType<typeof createClient>, payload: CanopyWebhookPayload) {
  const { error } = await supabase.from('canopy_pulls')
    .update({
      status: 'error',
      error_code: payload.data?.error?.code,
      error_message: payload.data?.error?.message,
      updated_at: new Date().toISOString()
    })
    .eq('canopy_pull_id', payload.pull_id);

  if (error) {
    logger.error('Failed to update error status', { error: error.message });
  }

  logger.error('Pull failed', { pullId: payload.pull_id, errorMessage: payload.data?.error?.message });
}

async function handleDocumentsReady(supabase: ReturnType<typeof createClient>, payload: CanopyWebhookPayload) {
  const documents = payload.data?.documents || [];

  // Get the pull record
  const { data: pull } = await supabase.from('canopy_pulls')
    .select('id')
    .eq('canopy_pull_id', payload.pull_id)
    .single();

  if (!pull) {
    logger.error('Pull not found for documents', { pullId: payload.pull_id });
    return;
  }

  // Get associated policies
  const { data: policies } = await supabase.from('canopy_policies')
    .select('id')
    .eq('pull_id', pull.id);

  if (!policies?.length) {
    logger.error('No policies found for documents');
    return;
  }

  // Insert documents (associate with first policy for now)
  const policyId = policies[0].id;

  for (const doc of documents) {
    await supabase.from('canopy_documents').insert({
      policy_id: policyId,
      document_type: mapDocumentType(doc.type),
      file_url: doc.url,
      file_name: doc.name,
      mime_type: doc.mime_type,
      file_size: doc.size,
      downloaded: false
    });
  }

  // Update pull metadata
  await supabase.from('canopy_pulls')
    .update({
      metadata: { documents_ready: true },
      updated_at: new Date().toISOString()
    })
    .eq('id', pull.id);
}

// ============================================================================
// MAPPING HELPERS
// ============================================================================

function mapPolicyType(type: string | undefined): string {
  const typeMap: Record<string, string> = {
    // Personal Lines
    'auto': 'auto',
    'automobile': 'auto',
    'car': 'auto',
    'personal_auto': 'auto',
    'home': 'home',
    'homeowners': 'home',
    'ho3': 'home',
    'renters': 'renters',
    'renter': 'renters',
    'condo': 'condo',
    'condominium': 'condo',
    'umbrella': 'umbrella',
    'personal_umbrella': 'umbrella',
    'life': 'life',
    'health': 'health',
    // Commercial Lines
    'commercial_auto': 'commercial_auto',
    'business_auto': 'commercial_auto',
    'fleet': 'commercial_auto',
    'commercial_vehicle': 'commercial_auto',
    'general_liability': 'general_liability',
    'gl': 'general_liability',
    'cgl': 'general_liability',
    'bop': 'bop',
    'business_owners': 'bop',
    'business_owners_policy': 'bop',
    'businessowners': 'bop',
    'workers_comp': 'workers_comp',
    'workers_compensation': 'workers_comp',
    'wc': 'workers_comp',
    'commercial_property': 'commercial_property',
    'commercial_prop': 'commercial_property',
    'property': 'commercial_property',
    'professional_liability': 'professional_liability',
    'e&o': 'professional_liability',
    'errors_omissions': 'professional_liability',
    'd&o': 'd_and_o',
    'directors_officers': 'd_and_o',
    'cyber': 'cyber',
    'cyber_liability': 'cyber',
    'epli': 'epli',
    'employment_practices': 'epli',
    'commercial_umbrella': 'commercial_umbrella',
    'excess_liability': 'commercial_umbrella',
  };
  return typeMap[type?.toLowerCase() || ''] || 'other';
}

// Check if policy type is commercial
function isCommercialPolicy(policyType: string): boolean {
  const commercialTypes = [
    'commercial_auto',
    'general_liability',
    'bop',
    'workers_comp',
    'commercial_property',
    'professional_liability',
    'd_and_o',
    'cyber',
    'epli',
    'commercial_umbrella',
  ];
  return commercialTypes.includes(policyType);
}

function mapUsageType(usage: string | undefined): string | null {
  if (!usage) return null;
  const usageMap: Record<string, string> = {
    'commute': 'commute',
    'work': 'commute',
    'pleasure': 'pleasure',
    'personal': 'pleasure',
    'business': 'business',
    'commercial': 'business',
    'farm': 'farm',
  };
  return usageMap[usage.toLowerCase()] || 'other';
}

function mapOwnership(ownership: string | undefined): string | null {
  if (!ownership) return null;
  const ownershipMap: Record<string, string> = {
    'owned': 'owned',
    'own': 'owned',
    'leased': 'leased',
    'lease': 'leased',
    'financed': 'financed',
    'finance': 'financed',
    'loan': 'financed',
  };
  return ownershipMap[ownership.toLowerCase()] || 'other';
}

function mapGender(gender: string | undefined): string | null {
  if (!gender) return null;
  const genderMap: Record<string, string> = {
    'm': 'male',
    'male': 'male',
    'f': 'female',
    'female': 'female',
  };
  return genderMap[gender.toLowerCase()] || 'unknown';
}

function mapMaritalStatus(status: string | undefined): string | null {
  if (!status) return null;
  const statusMap: Record<string, string> = {
    's': 'single',
    'single': 'single',
    'm': 'married',
    'married': 'married',
    'd': 'divorced',
    'divorced': 'divorced',
    'w': 'widowed',
    'widowed': 'widowed',
    'domestic_partner': 'domestic_partner',
    'separated': 'separated',
  };
  return statusMap[status.toLowerCase()] || 'unknown';
}

function mapLicenseStatus(status: string | undefined): string | null {
  if (!status) return null;
  const statusMap: Record<string, string> = {
    'valid': 'valid',
    'active': 'valid',
    'suspended': 'suspended',
    'revoked': 'revoked',
    'expired': 'expired',
    'permit': 'permit',
    'learner': 'permit',
  };
  return statusMap[status.toLowerCase()] || 'unknown';
}

function mapRelation(relation: string | undefined): string | null {
  if (!relation) return null;
  const relationMap: Record<string, string> = {
    'self': 'self',
    'insured': 'self',
    'named_insured': 'self',
    'spouse': 'spouse',
    'child': 'child',
    'son': 'child',
    'daughter': 'child',
    'parent': 'parent',
    'mother': 'parent',
    'father': 'parent',
    'other_relative': 'other_relative',
    'relative': 'other_relative',
    'employee': 'employee',
  };
  return relationMap[relation.toLowerCase()] || 'other';
}

function mapPropertyType(type: string | undefined): string | null {
  if (!type) return null;
  const typeMap: Record<string, string> = {
    'single_family': 'single_family',
    'single': 'single_family',
    'house': 'single_family',
    'condo': 'condo',
    'condominium': 'condo',
    'townhouse': 'townhouse',
    'townhome': 'townhouse',
    'mobile_home': 'mobile_home',
    'manufactured': 'mobile_home',
    'apartment': 'apartment',
    'multi_family': 'multi_family',
    'duplex': 'multi_family',
  };
  return typeMap[type.toLowerCase()] || 'other';
}

function mapOccupancyType(type: string | undefined): string | null {
  if (!type) return null;
  const typeMap: Record<string, string> = {
    'owner_occupied': 'owner_occupied',
    'owner': 'owner_occupied',
    'primary': 'owner_occupied',
    'tenant': 'tenant',
    'renter': 'tenant',
    'vacant': 'vacant',
    'seasonal': 'seasonal',
    'secondary': 'seasonal',
  };
  return typeMap[type.toLowerCase()] || 'other';
}

function mapClaimStatus(status: string | undefined): string | null {
  if (!status) return null;
  const statusMap: Record<string, string> = {
    'open': 'open',
    'active': 'open',
    'closed': 'closed',
    'settled': 'closed',
    'pending': 'pending',
    'denied': 'denied',
    'rejected': 'denied',
  };
  return statusMap[status.toLowerCase()] || 'unknown';
}

function mapDocumentType(type: string | undefined): string | null {
  if (!type) return null;
  const typeMap: Record<string, string> = {
    'id_card': 'id_card',
    'insurance_card': 'id_card',
    'dec_page': 'dec_page',
    'declarations': 'dec_page',
    'policy': 'policy_doc',
    'policy_document': 'policy_doc',
    'endorsement': 'endorsement',
    'certificate': 'certificate',
    'coi': 'certificate',
  };
  return typeMap[type.toLowerCase()] || 'other';
}
