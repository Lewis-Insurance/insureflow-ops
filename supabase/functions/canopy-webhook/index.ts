// ============================================================================
// CANOPY WEBHOOK HANDLER
// ============================================================================
// Receives webhook events from Canopy Connect and processes insurance data
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

// Webhook event types from Canopy
type CanopyEventType =
  | 'pull.started'
  | 'pull.auth_status'
  | 'pull.policy_available'
  | 'pull.complete'
  | 'pull.error'
  | 'pull.documents_ready';

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
async function verifyCanopySignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
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
    encoder.encode(payload)
  );

  const expectedSignature = Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time comparison to prevent timing attacks
  if (signature.length !== expectedSignature.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < signature.length; i++) {
    result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
  }

  return result === 0;
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
    console.error('Missing Supabase configuration');
    return new Response('Server configuration error', { status: 500 });
  }

  try {
    // Read raw body
    const rawBody = await req.text();
    console.log('[Canopy Webhook] Received request, body length:', rawBody.length);

    // Log all headers for debugging
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });
    console.log('[Canopy Webhook] Headers:', JSON.stringify(headers));

    // Get signature from header (Canopy uses different header names)
    const signature = req.headers.get('x-canopy-signature')
      || req.headers.get('x-signature')
      || req.headers.get('canopy-signature');

    // Verify signature if secret is configured
    let signatureValid = false;
    if (canopyWebhookSecret && signature) {
      signatureValid = await verifyCanopySignature(rawBody, signature, canopyWebhookSecret);
      if (!signatureValid) {
        console.warn('[Canopy Webhook] Signature verification failed, but continuing for debugging');
      }
    } else {
      console.log('[Canopy Webhook] Skipping signature verification (secret or signature not present)');
    }

    // Parse payload
    const payload: CanopyWebhookPayload = JSON.parse(rawBody);
    console.log(`Received Canopy webhook: ${payload.event} for pull ${payload.pull_id}`);

    // Create Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Log webhook event for debugging
    const { error: logError } = await supabase.from('canopy_webhook_log').insert({
      event_type: payload.event,
      pull_id: payload.pull_id,
      payload: payload,
      headers: headers,
      signature: signature || 'none',
      signature_valid: signatureValid,
    });

    if (logError) {
      console.error('Failed to log webhook:', logError);
    }

    // Route by event type
    switch (payload.event) {
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

      default:
        console.log(`Unknown event type: ${payload.event}`);
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
    console.error('Canopy webhook error:', error);

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
    console.error('Failed to create/update pull:', error);
  } else {
    console.log(`[Canopy Webhook] Created pull record for ${payload.pull_id}`);
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
    console.error('Failed to update auth status:', error);
  } else {
    console.log(`[Canopy Webhook] Auth status updated for ${payload.pull_id}`);
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
      console.error('Failed to create pull record:', createError);
      return;
    }
    pullId = newPull?.id;
    console.log(`[Canopy Webhook] Created pull record for policies: ${payload.pull_id}`);
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
      console.error('Failed to insert policy:', policyError);
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
        status: 'complete',
        completed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select('id, lead_id')
      .single();

    if (createError) {
      console.error('Failed to create pull record:', createError);
      return;
    }
    pull = newPull;
    console.log(`[Canopy Webhook] Created pull record on complete: ${payload.pull_id}`);
  } else {
    // Update the existing record
    const { error: updateError } = await supabase.from('canopy_pulls')
      .update({
        status: 'complete',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', pull.id);

    if (updateError) {
      console.error('Failed to update pull status:', updateError);
    }
  }

  if (!pull) {
    console.error('No pull record available');
    return;
  }

  let leadId = pull?.lead_id;

  // If no lead is linked, create one automatically from the Canopy data
  if (!leadId && pull?.id) {
    try {
      leadId = await createLeadFromCanopyPull(supabase, pull.id);

      if (leadId) {
        // Link the new lead to the pull
        await supabase.from('canopy_pulls')
          .update({ lead_id: leadId })
          .eq('id', pull.id);

        console.log(`Created new lead ${leadId} from Canopy pull ${payload.pull_id}`);
      }
    } catch (createError) {
      console.error('Failed to create lead from Canopy data:', createError);
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
      console.error('Failed to update lead score:', scoreError);
    }
  }

  console.log(`Pull ${payload.pull_id} completed successfully`);
}

// Create a new lead from Canopy pull data
async function createLeadFromCanopyPull(
  supabase: ReturnType<typeof createClient>,
  pullId: string
): Promise<string | null> {
  // Get the primary driver from the policies
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

  // Create the lead
  const { data: newLead, error: leadError } = await supabase.from('leads')
    .insert({
      first_name: driver?.first_name || 'Unknown',
      last_name: driver?.last_name || 'Customer',
      email: null, // Canopy doesn't typically provide email
      phone: null, // Canopy doesn't typically provide phone
      insurance_types: insuranceTypes,
      lead_source: 'canopy_import',
      lead_score: 75, // High score for verified Canopy data
      status: 'qualified',
      metadata: {
        canopy_pull_id: pullId,
        current_carriers: carriers,
        current_premium: totalPremium,
        policy_expiration: nextExpiration,
        driver_dob: driver?.date_of_birth,
        driver_license_state: driver?.license_state,
        imported_at: new Date().toISOString()
      }
    })
    .select('id')
    .single();

  if (leadError) {
    console.error('Failed to create lead:', leadError);
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
    console.error('Failed to update error status:', error);
  }

  console.error(`Pull ${payload.pull_id} failed: ${payload.data?.error?.message}`);
}

async function handleDocumentsReady(supabase: ReturnType<typeof createClient>, payload: CanopyWebhookPayload) {
  const documents = payload.data?.documents || [];

  // Get the pull record
  const { data: pull } = await supabase.from('canopy_pulls')
    .select('id')
    .eq('canopy_pull_id', payload.pull_id)
    .single();

  if (!pull) {
    console.error(`Pull not found for documents: ${payload.pull_id}`);
    return;
  }

  // Get associated policies
  const { data: policies } = await supabase.from('canopy_policies')
    .select('id')
    .eq('pull_id', pull.id);

  if (!policies?.length) {
    console.error('No policies found for documents');
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
    'auto': 'auto',
    'automobile': 'auto',
    'car': 'auto',
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
  };
  return typeMap[type?.toLowerCase() || ''] || 'other';
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
