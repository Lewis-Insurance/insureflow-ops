// ============================================================================
// CANOPY REPROCESS WEBHOOK LOGS
// ============================================================================
// Reprocesses logged webhook events that weren't handled properly
// Call this to replay events from canopy_webhook_log
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  // Only accept POST requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type, authorization',
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response('Server configuration error', { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Check for force flag in request body
    let forceAll = false;
    try {
      const body = await req.json();
      forceAll = body?.force === true;
    } catch {
      // No body or invalid JSON, use default
    }

    console.log(`[Canopy Reprocess] Force all: ${forceAll}`);

    // Get webhook events (all if force, or just unprocessed)
    let query = supabase
      .from('canopy_webhook_log')
      .select('*')
      .order('received_at', { ascending: true });

    if (!forceAll) {
      query = query.or('processed.is.null,processed.eq.false');
    }

    const { data: logs, error: fetchError } = await query;

    if (fetchError) {
      throw fetchError;
    }

    if (!logs || logs.length === 0) {
      return new Response(JSON.stringify({
        message: 'No unprocessed events found',
        processed: 0
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`[Canopy Reprocess] Found ${logs.length} events to reprocess`);

    const results = {
      processed: 0,
      errors: 0,
      details: [] as Array<{ id: string; event: string; status: string; error?: string }>
    };

    for (const log of logs) {
      const payload = log.payload;
      const eventType = payload.event || log.event_type;
      const pullId = payload.pull_id || log.pull_id;

      console.log(`[Canopy Reprocess] Processing ${eventType} for pull ${pullId}`);

      try {
        // Route by event type (same logic as webhook)
        switch (eventType) {
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
          case 'SUCCESS':  // Canopy sends SUCCESS status for completed pulls
            await handlePullComplete(supabase, payload);
            break;

          case 'ERROR':
          case 'FAILURE':  // Canopy also sends FAILURE status
            await handlePullError(supabase, payload);
            break;

          default:
            // Skip non-actionable events (IDENTITY_VERIFICATION, GETTING_CONSUMERS, PULLING_DATA)
            console.log(`[Canopy Reprocess] Skipping non-actionable event: ${eventType}`);
        }

        // Mark as processed
        await supabase.from('canopy_webhook_log')
          .update({
            processed: true,
            processed_at: new Date().toISOString(),
            processing_error: null
          })
          .eq('id', log.id);

        results.processed++;
        results.details.push({ id: log.id, event: eventType, status: 'success' });

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[Canopy Reprocess] Error processing ${eventType}:`, err);

        await supabase.from('canopy_webhook_log')
          .update({ processing_error: errorMsg })
          .eq('id', log.id);

        results.errors++;
        results.details.push({ id: log.id, event: eventType, status: 'error', error: errorMsg });
      }
    }

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Canopy Reprocess] Error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// ============================================================================
// EVENT HANDLERS (copied from canopy-webhook)
// ============================================================================

async function handleAuthStatus(supabase: ReturnType<typeof createClient>, payload: any) {
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
    throw error;
  }
  console.log(`[Canopy Reprocess] Auth status updated for ${payload.pull_id}`);
}

async function handlePolicyAvailable(supabase: ReturnType<typeof createClient>, payload: any) {
  const policies = payload.data?.policies || [];

  // First ensure the pull record exists
  let { data: existingPull } = await supabase.from('canopy_pulls')
    .select('id')
    .eq('canopy_pull_id', payload.pull_id)
    .single();

  let pullId = existingPull?.id;

  if (!pullId) {
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
      throw createError;
    }
    pullId = newPull?.id;
  }

  for (const policy of policies) {
    const { data: insertedPolicy, error: policyError } = await supabase.from('canopy_policies')
      .insert({
        pull_id: pullId,
        canopy_policy_id: policy.id,
        carrier_name: policy.carrier?.name,
        carrier_code: policy.carrier?.code,
        policy_number: policy.policy_number,
        policy_type: mapPolicyType(policy.policy_type),
        effective_date: policy.effective_date,
        expiration_date: policy.expiration_date,
        premium_amount: policy.premium?.amount,
        premium_frequency: policy.premium?.frequency,
        status: policy.status || 'active',
        deductible: policy.deductible,
        coverage_limits: policy.coverage_limits || {},
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
          usage_type: vehicle.usage,
          annual_mileage: vehicle.annual_mileage,
          ownership: vehicle.ownership,
          garage_zip: vehicle.garage_address?.zip,
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
          date_of_birth: driver.date_of_birth,
          gender: driver.gender,
          marital_status: driver.marital_status,
          license_number: driver.license_number,
          license_state: driver.license_state,
          relation_to_insured: driver.relation_to_insured,
          is_primary: driver.is_primary || false,
          violations: driver.violations || [],
          accidents: driver.accidents || []
        });
      }
    }
  }

  // Update pull policy count
  const { count } = await supabase.from('canopy_policies')
    .select('*', { count: 'exact', head: true })
    .eq('pull_id', pullId);

  await supabase.from('canopy_pulls')
    .update({
      policy_count: count || 0,
      updated_at: new Date().toISOString()
    })
    .eq('id', pullId);

  console.log(`[Canopy Reprocess] Policies processed for ${payload.pull_id}`);
}

async function handlePullComplete(supabase: ReturnType<typeof createClient>, payload: any) {
  // First check if the pull exists
  let { data: existingPull } = await supabase.from('canopy_pulls')
    .select('id, lead_id')
    .eq('canopy_pull_id', payload.pull_id)
    .single();

  let pull = existingPull;

  if (!pull) {
    const { data: newPull, error: createError } = await supabase.from('canopy_pulls')
      .insert({
        canopy_pull_id: payload.pull_id,
        status: 'processing',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select('id, lead_id')
      .single();

    if (createError) {
      console.error('Failed to create pull record:', createError);
      throw createError;
    }
    pull = newPull;
  }

  if (!pull) {
    throw new Error('No pull record available');
  }

  // =========================================================================
  // FETCH COMPLETE DATA FROM CANOPY API
  // =========================================================================
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
      console.log(`[Canopy Reprocess] Fetching complete data from: ${apiUrl}`);

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
        console.log(`[Canopy Reprocess] API returned data (first 2000 chars):`, JSON.stringify(responseData).substring(0, 2000));

        // Canopy API response structure: { success: true, pull: { ...pullData, policies: [...] } }
        const pullData = responseData.pull || responseData;
        let policies = pullData.policies || [];

        console.log(`[Canopy Reprocess] Pull consumer info: ${pullData.first_name} ${pullData.last_name}, email: ${pullData.account_email || pullData.email}`);

        // If no policies in pull response, try fetching from the policies endpoint
        if (policies.length === 0) {
          console.log(`[Canopy Reprocess] No policies in pull response, trying /policies endpoint...`);
          try {
            const policiesUrl = `${canopyApiBaseUrl}/teams/${canopyTeamId}/pulls/${payload.pull_id}/policies`;
            console.log(`[Canopy Reprocess] Fetching policies from: ${policiesUrl}`);

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
              console.log(`[Canopy Reprocess] Policies endpoint returned:`, JSON.stringify(policiesData).substring(0, 2000));
              policies = policiesData.policies || policiesData.data || (Array.isArray(policiesData) ? policiesData : []);
            } else {
              console.log(`[Canopy Reprocess] Policies endpoint returned ${policiesResponse.status}`);
            }
          } catch (policiesError) {
            console.error(`[Canopy Reprocess] Failed to fetch policies endpoint:`, policiesError);
          }
        }

        console.log(`[Canopy Reprocess] Total policies to process: ${policies.length}`);

        // Process each policy from the API response
        for (const policy of policies) {
          console.log(`[Canopy Reprocess] Processing policy:`, JSON.stringify(policy).substring(0, 500));
          await processCanopyPolicy(supabase, pull.id, policy);
        }

        // Update pull with counts and consumer info
        const { data: storedPolicies } = await supabase
          .from('canopy_policies')
          .select('carrier_name')
          .eq('pull_id', pull.id);

        await supabase.from('canopy_pulls').update({
          policy_count: storedPolicies?.length || 0,
          carrier_count: [...new Set(storedPolicies?.map(p => p.carrier_name) || [])].length,
          // Store consumer info from the API response
          metadata: {
            consumer_first_name: pullData.first_name,
            consumer_last_name: pullData.last_name,
            consumer_email: pullData.account_email || pullData.email,
            consumer_phone: pullData.mobile_phone || pullData.home_phone || pullData.phone,
            insurance_provider: pullData.insurance_provider_name,
          }
        }).eq('id', pull.id);

        // Store consumer data for lead creation
        pull.consumer_data = {
          first_name: pullData.first_name,
          last_name: pullData.last_name,
          email: pullData.account_email || pullData.email,
          phone: pullData.mobile_phone || pullData.home_phone || pullData.phone,
        };

        console.log(`[Canopy Reprocess] Processed ${storedPolicies?.length || 0} policies from API`);
      } else {
        const errorText = await apiResponse.text();
        console.error(`[Canopy Reprocess] API fetch failed with ${apiResponse.status}: ${errorText}`);
      }
    } catch (fetchError) {
      console.error('[Canopy Reprocess] Failed to fetch from API:', fetchError);
    }
  } else {
    const missing = [];
    if (!canopyClientId) missing.push('CANOPY_CLIENT_ID');
    if (!canopyClientSecret) missing.push('CANOPY_CLIENT_SECRET');
    if (!canopyTeamId) missing.push('CANOPY_TEAM_ID');
    console.warn(`[Canopy Reprocess] Missing API credentials: ${missing.join(', ')}. Cannot fetch full data.`);
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

  // If no lead is linked, create one automatically
  if (!leadId && pull?.id) {
    // Pass consumer data from API if available
    const consumerData = (pull as any).consumer_data;
    leadId = await createLeadFromCanopyPull(supabase, pull.id, consumerData);

    if (leadId) {
      await supabase.from('canopy_pulls')
        .update({ lead_id: leadId })
        .eq('id', pull.id);

      console.log(`[Canopy Reprocess] Created new lead ${leadId} from pull ${payload.pull_id}`);
    }
  }

  // Update lead score
  if (leadId) {
    await supabase.from('leads')
      .update({
        lead_score: 75,
        status: 'qualified',
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId);
  }

  console.log(`[Canopy Reprocess] Pull ${payload.pull_id} completed`);
}

// Process a complete policy from the Canopy API
// Handles Canopy's actual response structure
async function processCanopyPolicy(supabase: ReturnType<typeof createClient>, pullId: string, policy: any) {
  // Get the policy ID (handle both formats)
  const canopyPolicyId = policy.policy_id || policy.id;

  if (!canopyPolicyId) {
    console.error('[Canopy Reprocess] Policy has no ID:', JSON.stringify(policy).substring(0, 200));
    return;
  }

  console.log(`[Canopy Reprocess] Processing policy ${canopyPolicyId}: ${policy.policy_type || policy.name}`);

  // Check if policy already exists
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
    status: policy.status?.toLowerCase() || 'active',
    deductible: policy.deductible || (policy.deductible_cents ? policy.deductible_cents / 100 : null),
    coverage_limits: policy.coverage_limits || {},
    named_insureds: policy.named_insureds || [],
    raw_data: policy,
  };

  if (existingPolicy) {
    await supabase.from('canopy_policies').update(policyData).eq('id', existingPolicy.id);
    policyDbId = existingPolicy.id;
    console.log(`[Canopy Reprocess] Updated existing policy ${policyDbId}`);
  } else {
    const { data: newPolicy, error: policyError } = await supabase
      .from('canopy_policies')
      .insert(policyData)
      .select('id')
      .single();

    if (policyError) {
      console.error('[Canopy Reprocess] Failed to insert policy:', policyError);
      return;
    }
    policyDbId = newPolicy.id;
    console.log(`[Canopy Reprocess] Inserted new policy ${policyDbId}`);
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
  for (const claim of policy.claims || []) {
    await upsertClaim(supabase, policyDbId, claim);
  }

  console.log(`[Canopy Reprocess] Finished processing policy ${canopyPolicyId}`);
}

// Upsert helpers - Updated to handle Canopy's actual API structure
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
    ownership: vehicle.ownership_type || vehicle.ownership,
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
    coverages: coverages,
  };

  if (existingId) {
    await supabase.from('canopy_vehicles').update(vehicleData).eq('id', existingId);
  } else {
    await supabase.from('canopy_vehicles').insert(vehicleData);
  }
}

async function upsertDriver(supabase: ReturnType<typeof createClient>, policyId: string, driver: any) {
  const canopyDriverId = driver.driver_id;
  let existingId: string | null = null;

  // Get license info from nested object or flat fields
  const license = driver.drivers_license || driver.license;
  const licenseNumber = license?.number || driver.license_number;
  const licenseState = license?.state || driver.license_state;

  // First try by driver name for this policy
  if (canopyDriverId) {
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
      dateOfBirth = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    }
  }

  const driverData = {
    policy_id: policyId,
    first_name: driver.first_name,
    last_name: driver.last_name,
    middle_name: driver.middle_name,
    suffix: driver.suffix,
    date_of_birth: dateOfBirth,
    gender: driver.gender,
    marital_status: driver.marital_status,
    license_number: licenseNumber,
    license_state: licenseState,
    license_status: license?.status || driver.license_status,
    license_issue_date: license?.issue_date || driver.license_issue_date,
    license_expiration_date: license?.expiration_date || driver.license_expiration_date,
    relation_to_insured: driver.relation_to_insured,
    is_primary: driver.is_primary || false,
    is_excluded: driver.is_excluded || false,
    sr22_required: driver.sr22_required || false,
    occupation: driver.occupation,
    education_level: driver.education,
    years_licensed: driver.years_licensed,
    violations: driver.violations || [],
    accidents: driver.accidents || [],
  };

  if (existingId) {
    await supabase.from('canopy_drivers').update(driverData).eq('id', existingId);
  } else {
    await supabase.from('canopy_drivers').insert(driverData);
  }
}

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
    property_type: dwelling.property_type,
    occupancy_type: dwelling.occupancy_type,
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
    status: claim.status,
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

async function handlePullError(supabase: ReturnType<typeof createClient>, payload: any) {
  await supabase.from('canopy_pulls')
    .upsert({
      canopy_pull_id: payload.pull_id,
      status: 'error',
      error_message: payload.data?.error?.message,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'canopy_pull_id'
    });

  console.log(`[Canopy Reprocess] Error recorded for ${payload.pull_id}`);
}

// Consumer data from Canopy API
interface CanopyConsumerData {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
}

async function createLeadFromCanopyPull(
  supabase: ReturnType<typeof createClient>,
  pullId: string,
  consumerData?: CanopyConsumerData
): Promise<string | null> {
  console.log(`[Canopy Reprocess] Creating lead from pull ${pullId} with consumer data:`, consumerData);

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

  // Fallback: Get drivers from the pull
  if (!firstName || !lastName) {
    const { data: drivers } = await supabase.from('canopy_drivers')
      .select(`*, canopy_policies!inner (pull_id)`)
      .eq('canopy_policies.pull_id', pullId)
      .eq('is_primary', true)
      .limit(1);

    let driver = drivers?.[0];
    if (!driver) {
      const { data: anyDriver } = await supabase.from('canopy_drivers')
        .select(`*, canopy_policies!inner (pull_id)`)
        .eq('canopy_policies.pull_id', pullId)
        .limit(1);
      driver = anyDriver?.[0];
    }

    if (driver) {
      firstName = firstName || driver.first_name;
      lastName = lastName || driver.last_name;
    }
  }

  // Get policy info
  const { data: policies } = await supabase.from('canopy_policies')
    .select('policy_type, carrier_name, premium_amount, expiration_date')
    .eq('pull_id', pullId);

  const insuranceTypes = [...new Set(policies?.map(p => p.policy_type) || [])];
  const carriers = [...new Set(policies?.map(p => p.carrier_name).filter(Boolean) || [])];
  const totalPremium = policies?.reduce((sum, p) => sum + (p.premium_amount || 0), 0) || 0;

  const expirationDates = policies
    ?.map(p => p.expiration_date)
    .filter(Boolean)
    .sort();
  const nextExpiration = expirationDates?.[0];

  // If we still don't have insurance types, default to auto
  const finalInsuranceTypes = insuranceTypes.length > 0 ? insuranceTypes : ['auto'];

  console.log(`[Canopy Reprocess] Creating lead: ${firstName} ${lastName}, email: ${email}, phone: ${phone}`);
  console.log(`[Canopy Reprocess] Insurance types: ${finalInsuranceTypes.join(', ')}, Carriers: ${carriers.join(', ')}`);

  // Create the lead
  const { data: newLead, error: leadError } = await supabase.from('leads')
    .insert({
      first_name: firstName || 'Unknown',
      last_name: lastName || 'Customer',
      email: email || null,
      phone: phone || null,
      insurance_types: finalInsuranceTypes,
      source_details: { source: 'canopy_import', provider: 'canopy_connect' },
      lead_score: 75,
      status: 'qualified',
      notes: `Imported from Canopy Connect. Carriers: ${carriers.join(', ') || 'N/A'}. Premium: $${totalPremium || 0}. Expiration: ${nextExpiration || 'N/A'}`
    })
    .select('id')
    .single();

  if (leadError) {
    console.error('Failed to create lead:', leadError);
    return null;
  }

  return newLead?.id || null;
}

function mapPolicyType(type: string | undefined): string {
  const typeMap: Record<string, string> = {
    'auto': 'auto',
    'automobile': 'auto',
    'car': 'auto',
    'home': 'home',
    'homeowners': 'home',
    'renters': 'renters',
    'umbrella': 'umbrella',
    'life': 'life',
    'health': 'health',
  };
  return typeMap[type?.toLowerCase() || ''] || 'other';
}
