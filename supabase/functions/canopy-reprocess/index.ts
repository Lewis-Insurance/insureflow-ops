// ============================================================================
// CANOPY REPROCESS WEBHOOK LOGS
// ============================================================================
// Reprocesses logged webhook events that weren't handled properly
// Call this to replay events from canopy_webhook_log
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Storage bucket for Canopy documents
const CANOPY_STORAGE_BUCKET = 'canopy-documents';

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Max-Age': '86400',
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response('Server configuration error', {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      }
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Check for force flag and pullId in request body
    let forceAll = false;
    let specificPullId: string | null = null;
    try {
      const body = await req.json();
      forceAll = body?.force === true;
      specificPullId = body?.pullId || null;
    } catch {
      // No body or invalid JSON, use default
    }

    console.log(`[Canopy Reprocess] Force all: ${forceAll}, Specific pull: ${specificPullId}`);

    // If a specific pullId is provided, refresh just that pull from the API
    if (specificPullId) {
      console.log(`[Canopy Reprocess] Refreshing specific pull: ${specificPullId}`);
      const result = await refreshSpecificPull(supabase, specificPullId);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    }

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
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
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
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });

  } catch (error) {
    console.error('[Canopy Reprocess] Error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
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

        // Check for documents in pull data or policies
        const pullDocuments = pullData.documents || [];
        if (pullDocuments.length > 0) {
          console.log(`[Canopy Reprocess] Found ${pullDocuments.length} documents in pull data`);
          const { data: firstPolicy } = await supabase
            .from('canopy_policies')
            .select('id')
            .eq('pull_id', pull.id)
            .limit(1)
            .single();

          if (firstPolicy) {
            for (const doc of pullDocuments) {
              const fileUrl = doc.url || doc.download_url || doc.pdf_url || doc.file_url;
              if (!fileUrl) continue;
              // Check if already exists
              const { data: existing } = await supabase
                .from('canopy_documents')
                .select('id')
                .eq('policy_id', firstPolicy.id)
                .eq('file_url', fileUrl)
                .maybeSingle();
              if (!existing) {
                await supabase.from('canopy_documents').insert({
                  policy_id: firstPolicy.id,
                  document_type: mapDocTypeReprocess(doc.type || doc.document_type || 'other'),
                  file_url: fileUrl,
                  file_name: doc.name || doc.file_name || 'Document',
                  mime_type: doc.mime_type || 'application/pdf',
                  downloaded: false
                });
              }
            }
          }
        }

        // Also check for ID cards in policies
        for (const policy of policies) {
          if (policy.id_cards?.length > 0 || policy.documents?.length > 0) {
            const policyDocs = [...(policy.id_cards || []), ...(policy.documents || [])];
            console.log(`[Canopy Reprocess] Found ${policyDocs.length} documents in policy ${policy.policy_id || policy.id}`);

            const { data: ourPolicy } = await supabase
              .from('canopy_policies')
              .select('id')
              .eq('canopy_policy_id', policy.policy_id || policy.id)
              .single();

            if (ourPolicy) {
              for (const doc of policyDocs) {
                const fileUrl = doc.url || doc.download_url || doc.pdf_url || doc.file_url;
                if (!fileUrl) continue;
                // Check if already exists
                const { data: existing } = await supabase
                  .from('canopy_documents')
                  .select('id')
                  .eq('policy_id', ourPolicy.id)
                  .eq('file_url', fileUrl)
                  .maybeSingle();
                if (!existing) {
                  await supabase.from('canopy_documents').insert({
                    policy_id: ourPolicy.id,
                    document_type: mapDocTypeReprocess(doc.type || 'id_card'),
                    file_url: fileUrl,
                    file_name: doc.name || doc.file_name || 'ID Card',
                    mime_type: doc.mime_type || 'application/pdf',
                    downloaded: false
                  });
                }
              }
            }
          }
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

function mapDocTypeReprocess(type: string): string {
  const typeMap: Record<string, string> = {
    'id_card': 'id_card',
    'insurance_card': 'id_card',
    'dec_page': 'dec_page',
    'declarations': 'dec_page',
    'declarations_page': 'dec_page',
    'policy': 'policy_doc',
    'policy_document': 'policy_doc',
    'endorsement': 'endorsement',
    'certificate': 'certificate',
    'coi': 'certificate',
  };
  return typeMap[type.toLowerCase()] || 'other';
}

// Map Canopy's document_type format (uppercase) to our format
function mapDocTypeFromCanopy(type: string): string {
  const typeMap: Record<string, string> = {
    // Canopy uppercase format
    'DECLARATIONS': 'dec_page',
    'DECLARATION': 'dec_page',
    'DECLARATIONS_PAGE': 'dec_page',
    'ID_CARD': 'id_card',
    'INSURANCE_CARD': 'id_card',
    'POLICY': 'policy_doc',
    'POLICY_DOCUMENT': 'policy_doc',
    'ENDORSEMENT': 'endorsement',
    'CERTIFICATE': 'certificate',
    'COI': 'certificate',
    // Also handle lowercase for safety
    'declarations': 'dec_page',
    'id_card': 'id_card',
    'insurance_card': 'id_card',
    'dec_page': 'dec_page',
    'policy': 'policy_doc',
    'policy_document': 'policy_doc',
    'endorsement': 'endorsement',
    'certificate': 'certificate',
    'coi': 'certificate',
  };
  return typeMap[type] || typeMap[type.toUpperCase()] || typeMap[type.toLowerCase()] || 'other';
}

// Helper function to insert a document if it doesn't already exist
async function insertDocumentIfNotExists(
  supabase: ReturnType<typeof createClient>,
  doc: {
    policy_id: string;
    document_type: string;
    file_url: string;
    file_name: string;
    mime_type: string;
    document_id?: string;  // Canopy document ID for downloading
  }
): Promise<string | null> {
  // Check if document already exists
  const { data: existing } = await supabase
    .from('canopy_documents')
    .select('id, downloaded, storage_path')
    .eq('policy_id', doc.policy_id)
    .eq('file_url', doc.file_url)
    .maybeSingle();

  if (existing) {
    console.log(`[Canopy Reprocess] Document already exists: ${doc.file_name}`);
    // If not downloaded yet, return the ID to attempt download
    if (!existing.downloaded && !existing.storage_path) {
      return existing.id;
    }
    return null;
  }

  // Insert new document
  const { data: inserted, error } = await supabase.from('canopy_documents').insert({
    policy_id: doc.policy_id,
    document_type: doc.document_type,
    file_url: doc.file_url,
    file_name: doc.file_name,
    mime_type: doc.mime_type,
    downloaded: false
  }).select('id').single();

  if (error) {
    console.error(`[Canopy Reprocess] Failed to insert document:`, error);
    return null;
  }

  console.log(`[Canopy Reprocess] Inserted document: ${doc.file_name}`);
  return inserted?.id || null;
}

// ============================================================================
// DOWNLOAD AND STORE DOCUMENT
// ============================================================================
// Downloads a document from Canopy API and stores in Supabase Storage
// ============================================================================

async function downloadAndStoreDocument(
  supabase: SupabaseClient,
  documentId: string,
  canopyClientId: string,
  canopyClientSecret: string,
  canopyTeamId: string
): Promise<boolean> {
  console.log(`[Canopy Download] Starting download for document: ${documentId}`);

  // Get the document record
  const { data: docRecord, error: fetchError } = await supabase
    .from('canopy_documents')
    .select('id, file_url, file_name, mime_type, policy_id, document_type')
    .eq('id', documentId)
    .single();

  if (fetchError || !docRecord) {
    console.error(`[Canopy Download] Document not found: ${documentId}`);
    return false;
  }

  // Extract the Canopy document ID from the URL if possible
  let canopyDocId: string | null = null;
  const urlMatch = docRecord.file_url?.match(/documents\/([a-f0-9-]+)/);
  if (urlMatch) {
    canopyDocId = urlMatch[1];
  }

  if (!canopyDocId) {
    console.error(`[Canopy Download] Cannot extract document ID from URL: ${docRecord.file_url}`);
    await supabase.from('canopy_documents').update({
      download_error: 'Cannot extract document ID from URL'
    }).eq('id', documentId);
    return false;
  }

  console.log(`[Canopy Download] Downloading from Canopy: ${canopyDocId}`);

  // Try multiple URL patterns
  const urlPatterns = [
    `https://app.usecanopy.com/api/v1.0.0/teams/${canopyTeamId}/documents/${canopyDocId}/download`,
    `https://app.usecanopy.com/api/v1.0.0/documents/${canopyDocId}/download`,
    `https://app.usecanopy.com/api/v1.0.0/teams/${canopyTeamId}/documents/${canopyDocId}`,
  ];

  let documentContent: ArrayBuffer | null = null;
  let contentType = 'application/pdf';
  let lastError = '';

  for (const url of urlPatterns) {
    console.log(`[Canopy Download] Trying URL: ${url}`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/pdf, image/*, application/octet-stream',
          'x-canopy-client-id': canopyClientId,
          'x-canopy-client-secret': canopyClientSecret,
        },
      });

      if (response.ok) {
        const responseContentType = response.headers.get('Content-Type') || '';
        console.log(`[Canopy Download] Response Content-Type: ${responseContentType}`);

        // Check if this is actually a document (not HTML)
        if (responseContentType.includes('text/html')) {
          console.log(`[Canopy Download] Got HTML response, skipping...`);
          lastError = 'Received HTML instead of document';
          continue;
        }

        documentContent = await response.arrayBuffer();
        contentType = responseContentType || 'application/pdf';
        console.log(`[Canopy Download] Downloaded ${documentContent.byteLength} bytes`);
        break;
      } else {
        lastError = `HTTP ${response.status}`;
        console.log(`[Canopy Download] Failed with ${response.status}`);
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Fetch failed';
      console.error(`[Canopy Download] Fetch error:`, err);
    }
  }

  if (!documentContent || documentContent.byteLength < 100) {
    console.error(`[Canopy Download] Failed to download document: ${lastError}`);
    await supabase.from('canopy_documents').update({
      download_error: `Download failed: ${lastError}`
    }).eq('id', documentId);
    return false;
  }

  // Generate storage path: canopy/{pull_id}/{document_type}/{filename}
  const { data: policyData } = await supabase
    .from('canopy_policies')
    .select('pull_id')
    .eq('id', docRecord.policy_id)
    .single();

  const pullId = policyData?.pull_id || 'unknown';
  const extension = contentType.includes('pdf') ? 'pdf' : contentType.includes('png') ? 'png' : 'jpg';
  const sanitizedFileName = (docRecord.file_name || 'document').replace(/[^a-zA-Z0-9.-]/g, '_');
  const storagePath = `${pullId}/${docRecord.document_type}/${Date.now()}_${sanitizedFileName}.${extension}`;

  console.log(`[Canopy Download] Uploading to storage: ${storagePath}`);

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(CANOPY_STORAGE_BUCKET)
    .upload(storagePath, documentContent, {
      contentType: contentType,
      upsert: true
    });

  if (uploadError) {
    console.error(`[Canopy Download] Upload failed:`, uploadError);
    await supabase.from('canopy_documents').update({
      download_error: `Upload failed: ${uploadError.message}`
    }).eq('id', documentId);
    return false;
  }

  // Update document record with storage path
  const { error: updateError } = await supabase.from('canopy_documents').update({
    downloaded: true,
    storage_path: storagePath,
    storage_bucket: CANOPY_STORAGE_BUCKET,
    downloaded_at: new Date().toISOString(),
    download_error: null,
    file_size: documentContent.byteLength
  }).eq('id', documentId);

  if (updateError) {
    console.error(`[Canopy Download] Failed to update document record:`, updateError);
    return false;
  }

  console.log(`[Canopy Download] Successfully stored document: ${storagePath}`);
  return true;
}

// Download all pending documents for a pull
async function downloadAllPendingDocuments(
  supabase: SupabaseClient,
  pullId: string
): Promise<{ downloaded: number; failed: number }> {
  const canopyClientId = Deno.env.get('CANOPY_CLIENT_ID');
  const canopyClientSecret = Deno.env.get('CANOPY_CLIENT_SECRET');
  const canopyTeamId = Deno.env.get('CANOPY_TEAM_ID');

  if (!canopyClientId || !canopyClientSecret || !canopyTeamId) {
    console.warn('[Canopy Download] Missing API credentials, skipping document downloads');
    return { downloaded: 0, failed: 0 };
  }

  // Get all documents for this pull that haven't been downloaded
  const { data: documents, error } = await supabase
    .from('canopy_documents')
    .select('id, policy_id, canopy_policies!inner(pull_id)')
    .eq('canopy_policies.pull_id', pullId)
    .eq('downloaded', false);

  if (error || !documents || documents.length === 0) {
    console.log(`[Canopy Download] No pending documents for pull ${pullId}`);
    return { downloaded: 0, failed: 0 };
  }

  console.log(`[Canopy Download] Found ${documents.length} pending documents`);

  let downloaded = 0;
  let failed = 0;

  for (const doc of documents) {
    const success = await downloadAndStoreDocument(
      supabase,
      doc.id,
      canopyClientId,
      canopyClientSecret,
      canopyTeamId
    );

    if (success) {
      downloaded++;
    } else {
      failed++;
    }
  }

  console.log(`[Canopy Download] Completed: ${downloaded} downloaded, ${failed} failed`);
  return { downloaded, failed };
}

// ============================================================================
// REFRESH SPECIFIC PULL
// ============================================================================
// Fetches fresh data for a specific pull ID from Canopy API
// ============================================================================

async function refreshSpecificPull(
  supabase: ReturnType<typeof createClient>,
  canopyPullId: string
): Promise<{ success: boolean; message: string; policies?: number; documents?: number }> {
  console.log(`[Canopy Reprocess] Starting refresh for pull: ${canopyPullId}`);

  // First, get our internal pull record
  const { data: pullRecord, error: pullError } = await supabase
    .from('canopy_pulls')
    .select('id, canopy_pull_id, lead_id')
    .or(`canopy_pull_id.eq.${canopyPullId},id.eq.${canopyPullId}`)
    .single();

  if (pullError || !pullRecord) {
    console.error('[Canopy Reprocess] Pull not found:', pullError);
    return { success: false, message: `Pull not found: ${canopyPullId}` };
  }

  const internalPullId = pullRecord.id;
  const externalPullId = pullRecord.canopy_pull_id || canopyPullId;

  console.log(`[Canopy Reprocess] Found pull: internal=${internalPullId}, external=${externalPullId}`);

  // Get Canopy API credentials
  const canopyClientId = Deno.env.get('CANOPY_CLIENT_ID');
  const canopyClientSecret = Deno.env.get('CANOPY_CLIENT_SECRET');
  const canopyTeamId = Deno.env.get('CANOPY_TEAM_ID');
  const canopyApiBaseUrl = 'https://app.usecanopy.com/api/v1.0.0';

  if (!canopyClientId || !canopyClientSecret || !canopyTeamId) {
    const missing = [];
    if (!canopyClientId) missing.push('CANOPY_CLIENT_ID');
    if (!canopyClientSecret) missing.push('CANOPY_CLIENT_SECRET');
    if (!canopyTeamId) missing.push('CANOPY_TEAM_ID');
    console.error(`[Canopy Reprocess] Missing credentials: ${missing.join(', ')}`);
    return { success: false, message: `Missing Canopy API credentials: ${missing.join(', ')}` };
  }

  try {
    // Fetch pull data from Canopy API
    const apiUrl = `${canopyApiBaseUrl}/teams/${canopyTeamId}/pulls/${externalPullId}`;
    console.log(`[Canopy Reprocess] Fetching from: ${apiUrl}`);

    const apiResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'x-canopy-client-id': canopyClientId,
        'x-canopy-client-secret': canopyClientSecret,
      },
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error(`[Canopy Reprocess] API error ${apiResponse.status}: ${errorText}`);
      return { success: false, message: `Canopy API error: ${apiResponse.status}` };
    }

    const responseData = await apiResponse.json();
    console.log(`[Canopy Reprocess] API response (first 2000 chars):`, JSON.stringify(responseData).substring(0, 2000));

    const pullData = responseData.pull || responseData;
    let policies = pullData.policies || [];
    let documentsProcessed = 0;

    // Try policies endpoint if empty
    if (policies.length === 0) {
      console.log(`[Canopy Reprocess] No policies in pull, trying /policies endpoint...`);
      const policiesUrl = `${canopyApiBaseUrl}/teams/${canopyTeamId}/pulls/${externalPullId}/policies`;
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
        policies = policiesData.policies || policiesData.data || (Array.isArray(policiesData) ? policiesData : []);
        console.log(`[Canopy Reprocess] Policies endpoint returned ${policies.length} policies`);
      }
    }

    console.log(`[Canopy Reprocess] Processing ${policies.length} policies`);

    // Log claims and documents for debugging
    for (const policy of policies) {
      const policyId = policy.policy_id || policy.id;
      const claimsCount = policy.claims?.length || 0;
      const idCardsCount = policy.id_cards?.length || 0;
      const docsCount = policy.documents?.length || 0;
      console.log(`[Canopy Reprocess] Policy ${policyId}: ${claimsCount} claims, ${idCardsCount} ID cards, ${docsCount} documents`);
      if (claimsCount > 0) {
        console.log(`[Canopy Reprocess] Claims data:`, JSON.stringify(policy.claims).substring(0, 1000));
      }
      if (idCardsCount > 0) {
        console.log(`[Canopy Reprocess] ID cards data:`, JSON.stringify(policy.id_cards).substring(0, 500));
      }
      if (docsCount > 0) {
        console.log(`[Canopy Reprocess] Documents data:`, JSON.stringify(policy.documents).substring(0, 500));
      }
    }

    // Process each policy
    for (const policy of policies) {
      await processCanopyPolicy(supabase, internalPullId, policy);
    }

    // Process pull-level documents
    const pullDocuments = pullData.documents || [];
    console.log(`[Canopy Reprocess] Pull-level documents: ${pullDocuments.length}`);
    if (pullDocuments.length > 0) {
      console.log(`[Canopy Reprocess] Pull documents data:`, JSON.stringify(pullDocuments).substring(0, 500));
      console.log(`[Canopy Reprocess] Found ${pullDocuments.length} documents in pull data`);

      // Find the policy to associate documents with
      const { data: firstPolicy } = await supabase
        .from('canopy_policies')
        .select('id')
        .eq('pull_id', internalPullId)
        .limit(1)
        .single();

      if (firstPolicy) {
        for (const doc of pullDocuments) {
          // Canopy documents use document_id, not direct URLs
          // Construct the download URL using the document_id
          const documentId = doc.document_id || doc.id;
          let fileUrl = doc.url || doc.download_url || doc.pdf_url || doc.file_url;

          // If no direct URL, construct one from document_id
          if (!fileUrl && documentId) {
            // Canopy document download URL pattern
            fileUrl = `https://app.usecanopy.com/api/v1.0.0/teams/${canopyTeamId}/documents/${documentId}/download`;
            console.log(`[Canopy Reprocess] Constructed document URL: ${fileUrl}`);
          }

          if (!fileUrl) {
            console.log(`[Canopy Reprocess] Skipping document with no URL or document_id:`, JSON.stringify(doc).substring(0, 200));
            continue;
          }

          // Map document type from Canopy format
          const docType = mapDocTypeFromCanopy(doc.document_type || doc.type || 'other');
          const fileName = doc.title || doc.name || doc.file_name || 'Document';

          console.log(`[Canopy Reprocess] Inserting document: ${fileName} (${docType})`);

          const insertResult = await insertDocumentIfNotExists(supabase, {
            policy_id: firstPolicy.id,
            document_type: docType,
            file_url: fileUrl,
            file_name: fileName,
            mime_type: doc.mime_type || 'application/pdf',
          });
          if (insertResult) documentsProcessed++;
        }
      }
    }

    // =========================================================================
    // TRY DEDICATED DOCUMENTS ENDPOINT
    // =========================================================================
    // Canopy may store documents at a separate /documents endpoint
    // =========================================================================
    console.log(`[Canopy Reprocess] Trying dedicated documents endpoint...`);
    try {
      const documentsUrl = `${canopyApiBaseUrl}/teams/${canopyTeamId}/pulls/${externalPullId}/documents`;
      console.log(`[Canopy Reprocess] Fetching documents from: ${documentsUrl}`);

      const documentsResponse = await fetch(documentsUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'x-canopy-client-id': canopyClientId,
          'x-canopy-client-secret': canopyClientSecret,
        },
      });

      if (documentsResponse.ok) {
        const documentsData = await documentsResponse.json();
        console.log(`[Canopy Reprocess] Documents endpoint response:`, JSON.stringify(documentsData).substring(0, 1000));

        // Handle different response formats
        const docs = documentsData.documents || documentsData.data || (Array.isArray(documentsData) ? documentsData : []);
        console.log(`[Canopy Reprocess] Documents endpoint returned ${docs.length} documents`);

        if (docs.length > 0) {
          // Get first policy to associate documents with
          const { data: firstPolicy } = await supabase
            .from('canopy_policies')
            .select('id')
            .eq('pull_id', internalPullId)
            .limit(1)
            .single();

          if (firstPolicy) {
            for (const doc of docs) {
              console.log(`[Canopy Reprocess] Processing document:`, JSON.stringify(doc).substring(0, 300));
              const fileUrl = doc.url || doc.download_url || doc.pdf_url || doc.file_url;
              if (!fileUrl) {
                console.log(`[Canopy Reprocess] Skipping document with no URL`);
                continue;
              }
              // Insert document (check for existing first)
              const insertResult = await insertDocumentIfNotExists(supabase, {
                policy_id: firstPolicy.id,
                document_type: mapDocTypeReprocess(doc.type || doc.document_type || doc.name || 'other'),
                file_url: fileUrl,
                file_name: doc.name || doc.file_name || doc.title || 'Document',
                mime_type: doc.mime_type || doc.content_type || 'application/pdf',
              });
              if (insertResult) documentsProcessed++;
            }
          }
        }
      } else {
        console.log(`[Canopy Reprocess] Documents endpoint returned ${documentsResponse.status}`);
      }
    } catch (docFetchError) {
      console.log(`[Canopy Reprocess] Documents endpoint error:`, docFetchError);
    }

    // =========================================================================
    // TRY ID CARDS ENDPOINT
    // =========================================================================
    // Canopy may also have a separate /id_cards endpoint
    // =========================================================================
    console.log(`[Canopy Reprocess] Trying ID cards endpoint...`);
    try {
      const idCardsUrl = `${canopyApiBaseUrl}/teams/${canopyTeamId}/pulls/${externalPullId}/id_cards`;
      console.log(`[Canopy Reprocess] Fetching ID cards from: ${idCardsUrl}`);

      const idCardsResponse = await fetch(idCardsUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'x-canopy-client-id': canopyClientId,
          'x-canopy-client-secret': canopyClientSecret,
        },
      });

      if (idCardsResponse.ok) {
        const idCardsData = await idCardsResponse.json();
        console.log(`[Canopy Reprocess] ID cards endpoint response:`, JSON.stringify(idCardsData).substring(0, 1000));

        const idCards = idCardsData.id_cards || idCardsData.data || (Array.isArray(idCardsData) ? idCardsData : []);
        console.log(`[Canopy Reprocess] ID cards endpoint returned ${idCards.length} cards`);

        if (idCards.length > 0) {
          const { data: firstPolicy } = await supabase
            .from('canopy_policies')
            .select('id')
            .eq('pull_id', internalPullId)
            .limit(1)
            .single();

          if (firstPolicy) {
            for (const card of idCards) {
              console.log(`[Canopy Reprocess] Processing ID card:`, JSON.stringify(card).substring(0, 300));
              const fileUrl = card.url || card.download_url || card.pdf_url || card.file_url;
              if (!fileUrl) {
                console.log(`[Canopy Reprocess] Skipping ID card with no URL`);
                continue;
              }
              const insertResult = await insertDocumentIfNotExists(supabase, {
                policy_id: firstPolicy.id,
                document_type: 'id_card',
                file_url: fileUrl,
                file_name: card.name || card.file_name || 'ID Card',
                mime_type: card.mime_type || 'application/pdf',
              });
              if (insertResult) documentsProcessed++;
            }
          }
        }
      } else {
        console.log(`[Canopy Reprocess] ID cards endpoint returned ${idCardsResponse.status}`);
      }
    } catch (idCardsFetchError) {
      console.log(`[Canopy Reprocess] ID cards endpoint error:`, idCardsFetchError);
    }

    // Process policy-level documents (from API response)
    for (const policy of policies) {
      const policyId = policy.policy_id || policy.id;
      if (policy.id_cards?.length > 0 || policy.documents?.length > 0) {
        const policyDocs = [...(policy.id_cards || []), ...(policy.documents || [])];
        console.log(`[Canopy Reprocess] Policy ${policyId} has ${policyDocs.length} inline documents`);

        const { data: ourPolicy } = await supabase
          .from('canopy_policies')
          .select('id')
          .eq('canopy_policy_id', policyId)
          .single();

        if (ourPolicy) {
          for (const doc of policyDocs) {
            console.log(`[Canopy Reprocess] Processing inline doc:`, JSON.stringify(doc).substring(0, 200));
            const fileUrl = doc.url || doc.download_url || doc.pdf_url || doc.file_url;
            if (!fileUrl) {
              console.log(`[Canopy Reprocess] Skipping document with no URL`);
              continue;
            }
            const insertResult = await insertDocumentIfNotExists(supabase, {
              policy_id: ourPolicy.id,
              document_type: mapDocTypeReprocess(doc.type || 'id_card'),
              file_url: fileUrl,
              file_name: doc.name || doc.file_name || 'ID Card',
              mime_type: doc.mime_type || 'application/pdf',
            });
            if (insertResult) documentsProcessed++;
          }
        }
      }

      // =========================================================================
      // TRY POLICY-LEVEL DOCUMENTS ENDPOINT
      // =========================================================================
      // Canopy may also have documents at /policies/{policyId}/documents
      // =========================================================================
      console.log(`[Canopy Reprocess] Trying policy documents endpoint for policy ${policyId}...`);
      try {
        const policyDocsUrl = `${canopyApiBaseUrl}/teams/${canopyTeamId}/policies/${policyId}/documents`;
        console.log(`[Canopy Reprocess] Fetching from: ${policyDocsUrl}`);

        const policyDocsResponse = await fetch(policyDocsUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'x-canopy-client-id': canopyClientId,
            'x-canopy-client-secret': canopyClientSecret,
          },
        });

        if (policyDocsResponse.ok) {
          const policyDocsData = await policyDocsResponse.json();
          console.log(`[Canopy Reprocess] Policy documents endpoint response:`, JSON.stringify(policyDocsData).substring(0, 1000));

          const docs = policyDocsData.documents || policyDocsData.data || (Array.isArray(policyDocsData) ? policyDocsData : []);
          console.log(`[Canopy Reprocess] Policy documents endpoint returned ${docs.length} documents`);

          if (docs.length > 0) {
            const { data: ourPolicy } = await supabase
              .from('canopy_policies')
              .select('id')
              .eq('canopy_policy_id', policyId)
              .single();

            if (ourPolicy) {
              for (const doc of docs) {
                console.log(`[Canopy Reprocess] Processing policy doc:`, JSON.stringify(doc).substring(0, 300));
                const fileUrl = doc.url || doc.download_url || doc.pdf_url || doc.file_url;
                if (!fileUrl) {
                  console.log(`[Canopy Reprocess] Skipping document with no URL`);
                  continue;
                }
                const insertResult = await insertDocumentIfNotExists(supabase, {
                  policy_id: ourPolicy.id,
                  document_type: mapDocTypeReprocess(doc.type || doc.document_type || doc.name || 'other'),
                  file_url: fileUrl,
                  file_name: doc.name || doc.file_name || doc.title || 'Document',
                  mime_type: doc.mime_type || doc.content_type || 'application/pdf',
                });
                if (insertResult) documentsProcessed++;
              }
            }
          }
        } else {
          console.log(`[Canopy Reprocess] Policy documents endpoint returned ${policyDocsResponse.status}`);
        }
      } catch (policyDocError) {
        console.log(`[Canopy Reprocess] Policy documents endpoint error:`, policyDocError);
      }

      // Also try ID cards endpoint for this policy
      try {
        const policyIdCardsUrl = `${canopyApiBaseUrl}/teams/${canopyTeamId}/policies/${policyId}/id_cards`;
        console.log(`[Canopy Reprocess] Fetching from: ${policyIdCardsUrl}`);

        const policyIdCardsResponse = await fetch(policyIdCardsUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'x-canopy-client-id': canopyClientId,
            'x-canopy-client-secret': canopyClientSecret,
          },
        });

        if (policyIdCardsResponse.ok) {
          const policyIdCardsData = await policyIdCardsResponse.json();
          console.log(`[Canopy Reprocess] Policy ID cards endpoint response:`, JSON.stringify(policyIdCardsData).substring(0, 1000));

          const idCards = policyIdCardsData.id_cards || policyIdCardsData.data || (Array.isArray(policyIdCardsData) ? policyIdCardsData : []);
          console.log(`[Canopy Reprocess] Policy ID cards endpoint returned ${idCards.length} cards`);

          if (idCards.length > 0) {
            const { data: ourPolicy } = await supabase
              .from('canopy_policies')
              .select('id')
              .eq('canopy_policy_id', policyId)
              .single();

            if (ourPolicy) {
              for (const card of idCards) {
                console.log(`[Canopy Reprocess] Processing policy ID card:`, JSON.stringify(card).substring(0, 300));
                const fileUrl = card.url || card.download_url || card.pdf_url || card.file_url;
                if (!fileUrl) {
                  console.log(`[Canopy Reprocess] Skipping ID card with no URL`);
                  continue;
                }
                const insertResult = await insertDocumentIfNotExists(supabase, {
                  policy_id: ourPolicy.id,
                  document_type: 'id_card',
                  file_url: fileUrl,
                  file_name: card.name || card.file_name || 'ID Card',
                  mime_type: card.mime_type || 'application/pdf',
                });
                if (insertResult) documentsProcessed++;
              }
            }
          }
        } else {
          console.log(`[Canopy Reprocess] Policy ID cards endpoint returned ${policyIdCardsResponse.status}`);
        }
      } catch (policyIdCardError) {
        console.log(`[Canopy Reprocess] Policy ID cards endpoint error:`, policyIdCardError);
      }
    }

    // Update pull counts and metadata
    const { data: storedPolicies } = await supabase
      .from('canopy_policies')
      .select('carrier_name')
      .eq('pull_id', internalPullId);

    await supabase.from('canopy_pulls').update({
      policy_count: storedPolicies?.length || 0,
      carrier_count: [...new Set(storedPolicies?.map(p => p.carrier_name) || [])].length,
      metadata: {
        consumer_first_name: pullData.first_name,
        consumer_last_name: pullData.last_name,
        consumer_email: pullData.account_email || pullData.email,
        consumer_phone: pullData.mobile_phone || pullData.home_phone || pullData.phone,
        insurance_provider: pullData.insurance_provider_name,
        last_refreshed: new Date().toISOString(),
      },
      updated_at: new Date().toISOString()
    }).eq('id', internalPullId);

    console.log(`[Canopy Reprocess] Refresh complete: ${storedPolicies?.length || 0} policies, ${documentsProcessed} documents`);

    // =========================================================================
    // DOWNLOAD DOCUMENTS TO SUPABASE STORAGE
    // =========================================================================
    // After all documents are inserted, download them from Canopy and store locally
    // =========================================================================
    console.log(`[Canopy Reprocess] Starting document downloads for pull ${internalPullId}`);
    const downloadResult = await downloadAllPendingDocuments(supabase, internalPullId);
    console.log(`[Canopy Reprocess] Document downloads: ${downloadResult.downloaded} succeeded, ${downloadResult.failed} failed`);

    return {
      success: true,
      message: 'Refresh complete',
      policies: storedPolicies?.length || 0,
      documents: documentsProcessed,
      downloaded: downloadResult.downloaded,
      download_failed: downloadResult.failed,
    };

  } catch (error) {
    console.error('[Canopy Reprocess] Refresh error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
