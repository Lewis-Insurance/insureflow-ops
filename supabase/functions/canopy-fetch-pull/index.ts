// ============================================================================
// CANOPY FETCH PULL DATA - COMPLETE DATA CAPTURE
// ============================================================================
// Fetches complete pull data from Canopy's API and stores ALL fields.
// Handles both single-pull and multi-pull response formats.
// Called by the webhook on COMPLETE events or manually to backfill data.
//
// Data types captured:
// - Pull metadata (consumer info, phones, flags)
// - Policies (with all new fields)
// - Vehicles (with lienholders, features)
// - Drivers (with Canopy IDs, age fields)
// - Dwellings (with property_data, mortgagee info)
// - Claims (with carrier identifiers, representative contact)
// - Documents
// - Driving Records (NEW)
// - Loss Events (NEW)
// - Agents (NEW)
// - Addresses (NEW)
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// TYPE DEFINITIONS - Matching Canopy's actual API response structure
// ============================================================================

interface CanopyApiResponse {
  // Single pull response format
  pull_id?: string;
  id?: string;
  status?: string;

  // Multi-pull response format (from GET /pulls endpoint)
  total_pulls?: number;
  pulls?: CanopyPull[];

  // Single pull may have these directly
  policies?: CanopyPolicy[];
  drivers?: CanopyDriver[];
  documents?: CanopyDocument[];
  addresses?: CanopyAddress[];
  claims?: CanopyClaim[];
  driving_records?: CanopyDrivingRecord[];
  loss_events?: CanopyLossEvent[];
  agents?: CanopyAgent[];

  // Consumer info (if single pull)
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  email?: string;
  account_email?: string;
  phone?: string;
  mobile_phone?: string;
  home_phone?: string;
  work_phone?: string;
  work_phone_extension?: string;

  // Pull metadata
  insurance_provider_name?: string;
  team_id?: string;
  widget_id?: string;
  meta_data?: Record<string, unknown>;
  is_archived?: boolean;
  created_at?: string;
  public_alias?: string;
  deleted_at?: string;
  public_url?: string;
  no_policies?: boolean;
  no_drivers?: boolean;
  no_documents?: boolean;
  no_claims?: boolean;
  no_loss_events?: boolean;
  skipped_product_types?: string[];
  type?: string;

  error?: {
    code: string;
    message: string;
  };
}

interface CanopyPull {
  pull_id: string;
  status: string;

  // Consumer info
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  email?: string;
  account_email?: string;
  phone?: string;
  mobile_phone?: string;
  home_phone?: string;
  work_phone?: string;
  work_phone_extension?: string;

  // Provider/metadata
  insurance_provider_name?: string;
  team_id?: string;
  widget_id?: string;
  meta_data?: Record<string, unknown>;
  is_archived?: boolean;
  created_at?: string;
  public_alias?: string;
  deleted_at?: string;
  public_url?: string;

  // Data availability flags
  no_policies?: boolean;
  no_drivers?: boolean;
  no_documents?: boolean;
  no_claims?: boolean;
  no_loss_events?: boolean;
  skipped_product_types?: string[];
  type?: string;

  // Data arrays
  policies?: CanopyPolicy[];
  drivers?: CanopyDriver[];
  documents?: CanopyDocument[];
  addresses?: CanopyAddress[];
  claims?: CanopyClaim[];
  driving_records?: CanopyDrivingRecord[];
  loss_events?: CanopyLossEvent[];
  agents?: CanopyAgent[];
}

interface CanopyPolicy {
  policy_id: string;
  name?: string;
  description?: string;
  carrier_policy_number?: string;
  policy_number?: string;
  policy_type: string;
  effective_date?: string;
  expiry_date?: string;
  expiration_date?: string;
  renewal_date?: string;
  canceled_date?: string;
  total_premium_cents?: number;
  carrier_name?: string;
  carrier?: {
    name: string;
    code?: string;
    naic_code?: string;
  };
  status?: string;
  limited_access?: boolean;
  form_of_business?: string;
  deductible_cents?: number;
  deductible?: number;
  paid_in_full?: boolean;
  is_monoline?: boolean;
  coverage_limits?: Record<string, unknown>;

  // Nested data
  dwellings?: CanopyDwelling[];
  vehicles?: CanopyVehicle[];
  drivers?: CanopyDriver[];
  claims?: CanopyClaim[];
  commercial_named_insureds?: CanopyCommercialNamedInsured[];
  named_insureds?: CanopyNamedInsured[];

  // Premium object (alternate format)
  premium?: {
    amount: number;
    frequency: string;
  };
}

interface CanopyVehicle {
  vehicle_id?: string;
  year?: number;
  make?: string;
  model?: string;
  series?: string;
  series2?: string;
  type?: string;
  body_type?: string;
  annual_mileage?: number;
  vin?: string;
  uses?: string[] | string;
  purchase_date?: string;
  ownership_type?: string;
  ownership?: string;
  features?: Record<string, unknown>;
  lien_holder?: string;
  is_removed?: boolean;

  // Addresses
  garaging_address?: CanopyAddress;
  GaragingAddress?: CanopyAddress;
  lien_holder_address?: CanopyAddress;
  LienHolderAddress?: CanopyAddress;

  // Coverages array (Canopy actual format)
  coverages?: CanopyVehicleCoverage[];

  // Nested drivers
  drivers?: CanopyDriver[];
}

interface CanopyVehicleCoverage {
  vehicle_coverage_id?: string;
  name: string;
  friendly_name?: string;
  premium_cents?: number;
  per_person_limit_cents?: number;
  per_incident_limit_cents?: number;
  per_day_limit_cents?: number;
  deductible_cents?: number;
  is_declined?: boolean;
  per_mile_premium_tenth_of_cents?: number;
}

interface CanopyDriver {
  driver_id?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  drivers_license?: string;
  drivers_license_state?: string;
  date_of_birth_str?: string;
  date_of_birth?: string;
  gender?: string;
  marital_status?: string;
  relationship_to_insured?: string;
  relation_to_insured?: string;
  age?: number;
  age_on_date?: string;
  education?: string;
  education_level?: string;
  occupation?: string;
  age_licensed?: number;
  years_licensed?: number;
  is_excluded?: boolean;
  is_primary?: boolean;
  sr22_required?: boolean;

  // License object (alternate format)
  license?: {
    number?: string;
    state?: string;
    status?: string;
    issue_date?: string;
    expiration_date?: string;
  };

  // MVR data on driver
  violations?: Array<{
    date?: string;
    type?: string;
    code?: string;
    description?: string;
    points?: number;
    state?: string;
  }>;
  accidents?: Array<{
    date?: string;
    type?: string;
    description?: string;
    at_fault?: boolean;
    amount_paid?: number;
  }>;
  claims?: Array<{
    date?: string;
    type?: string;
    description?: string;
    amount_paid?: number;
    at_fault?: boolean;
  }>;
}

interface CanopyDwelling {
  dwelling_id?: string;
  mortgagee_name?: string;
  mortgage_loan_number?: string;
  replacement_cost_cents?: number;
  cash_value_cents?: number;
  property_data_fetched?: boolean;
  loss_settlement_type?: string;
  extended_replacement_cost_percent?: number;

  address?: CanopyAddress;
  mortgagee_address?: CanopyAddress;

  // Coverages array (Canopy actual format)
  coverages?: CanopyDwellingCoverage[];

  // Property data object
  property_data?: CanopyPropertyData;

  // Legacy flat fields
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

  features?: {
    swimming_pool?: boolean;
    trampoline?: boolean;
    dog_breed?: string;
    security_system?: boolean;
    fire_alarm?: boolean;
    sprinkler_system?: boolean;
    deadbolt_locks?: boolean;
    gated_community?: boolean;
    fireplace?: boolean;
    has_pool?: boolean;
  };
}

interface CanopyDwellingCoverage {
  dwelling_coverage_id?: string;
  name: string;
  friendly_name?: string;
  premium_cents?: number;
  per_person_limit_cents?: number;
  per_incident_limit_cents?: number;
  per_incident_limit_percent?: number;
  deductible_cents?: number;
  deductible_percent?: number;
  is_declined?: boolean;
}

interface CanopyPropertyData {
  property_data_id?: string;
  dwelling_id?: string;
  apn?: string;
  class?: string;
  sub_type?: string;
  year_built?: number;
  construction_type?: string;
  wall_type?: string;
  foundation_type?: string;
  frame_type?: string;
  roof_cover?: string;
  roof_shape?: string;
  cooling_type?: string;
  heating_type?: string;
  heating_fuel?: string;
  energy_type?: string;
  sewer_type?: string;
  building_shape?: string;
  construction_quality?: string;
  has_fireplace?: boolean;
  num_fireplaces?: number;
  fireplace_type?: string;
  has_pool?: boolean;
  pool_type?: string;
  square_ft?: number;
  num_beds?: number;
  num_baths_full?: number;
  num_baths_partial?: number;
  num_stories?: number;
  num_units?: number;
  garage_type?: string;
  garage_square_ft?: number;
  num_parking_spaces?: number;
  assessed_improvement_value_cents?: number;
  assessed_land_value_cents?: number;
  assessed_total_value_cents?: number;
  market_improvement_value_cents?: number;
  market_land_value_cents?: number;
  market_total_value_cents?: number;
  owner1_first_name?: string;
  owner1_last_name?: string;
  owner2_first_name?: string;
  owner2_last_name?: string;
  owner3_first_name?: string;
  owner3_last_name?: string;
  owner4_first_name?: string;
  owner4_last_name?: string;
  first_mortgage_amount_cents?: number;
  first_mortgage_lender?: string;
  second_mortgage_amount_cents?: number;
  second_mortgage_lender?: string;
  purchase_date?: string;
  purchase_price_cents?: number;
  last_update_date?: string;
}

interface CanopyClaim {
  claim_id?: string;
  policy_id?: string;
  dwelling_id?: string;
  vehicle_id?: string;
  address_id?: string;
  driver_id?: string;
  carrier_claim_identifier?: string;
  claim_number?: string;
  date_occurred?: string;
  claim_date?: string;
  type?: string;
  claim_type?: string;
  claim_category?: string;
  status?: string;
  date_closed?: string;
  close_date?: string;
  payout_cents?: number;
  amount_paid?: number;
  amount_reserved?: number;
  deductible_applied?: number;
  description?: string;
  at_fault?: boolean;
  subrogation?: boolean;
  claimant_name?: string;
  representative_name?: string;
  representative_phone?: string;
  representative_email?: string;
}

interface CanopyDocument {
  document_id?: string;
  title?: string;
  date_added?: string;
  document_type?: string;
  policy_id?: string;
  url?: string;
  name?: string;
  mime_type?: string;
  size?: number;
}

interface CanopyAddress {
  address_id?: string;
  full_address?: string;
  country?: string;
  address_nature?: string;
  number?: string;
  street?: string;
  type?: string;
  city?: string;
  state?: string;
  sec_unit_type?: string;
  sec_unit_num?: string;
  zip?: string;
  county?: string;
}

interface CanopyDrivingRecord {
  driving_record_id?: string;
  incident_date?: string;
  incident_type?: string;
  violation_type?: string;
  is_at_fault?: boolean;
  driver_id?: string;
  description?: string;
  points?: number;
  state?: string;
}

interface CanopyLossEvent {
  loss_event_id?: string;
  policy_id?: string;
  date_of_occurrence?: string;
  type?: string;
  date_of_claim?: string;
  amount_paid_cents?: number;
  amount_reserved_cents?: number;
  is_subrogation?: boolean;
  is_claim_open?: boolean;
  description?: string;
  location?: string;
}

interface CanopyAgent {
  agent_info_id?: string;
  address_id?: string;
  agency_name?: string;
  agent_full_name?: string;
  phone_number?: string;
  email?: string;
  policy_ids?: string[];
  address?: CanopyAddress;
}

interface CanopyCommercialNamedInsured {
  commercial_named_insured_id?: string;
  address_id?: string;
  name?: string;
  form_of_business?: string;
  gl_code?: string;
  sic_code?: string;
  naics_code?: string;
  fein?: string;
  ssn?: string;
  business_phone?: string;
  business_email?: string;
  website_url?: string;
  is_primary_named_insured?: boolean;
}

interface CanopyNamedInsured {
  named_insured_id?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  full_name?: string;
  is_primary_named_insured?: boolean;
}

// ============================================================================
// MAIN FETCH FUNCTION
// ============================================================================

export async function fetchCanopyPullData(
  canopyPullId: string,
  supabase: ReturnType<typeof createClient>,
  canopyTeamId: string,
  canopyClientId: string,
  canopyClientSecret: string
): Promise<{ success: boolean; error?: string; summary?: Record<string, number> }> {
  console.log(`[Canopy Fetch] Fetching complete data for pull ${canopyPullId}`);

  const canopyApiBaseUrl = 'https://app.usecanopy.com/api/v1.0.0';

  try {
    // Fetch from Canopy API
    const apiUrl = `${canopyApiBaseUrl}/teams/${canopyTeamId}/pulls/${canopyPullId}`;
    console.log(`[Canopy Fetch] Calling: ${apiUrl}`);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'x-canopy-client-id': canopyClientId,
        'x-canopy-client-secret': canopyClientSecret,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Canopy Fetch] API error ${response.status}:`, errorText);
      return { success: false, error: `Canopy API returned ${response.status}: ${errorText}` };
    }

    const apiResponse: CanopyApiResponse = await response.json();
    console.log(`[Canopy Fetch] Response received, processing...`);

    // Handle both single-pull and multi-pull response formats
    let pullData: CanopyPull;

    if (apiResponse.pulls && apiResponse.pulls.length > 0) {
      // Multi-pull format - find the matching pull
      const matchingPull = apiResponse.pulls.find(p => p.pull_id === canopyPullId);
      if (!matchingPull) {
        return { success: false, error: `Pull ${canopyPullId} not found in response` };
      }
      pullData = matchingPull;
    } else {
      // Single-pull format - convert response to pull format
      pullData = {
        pull_id: apiResponse.pull_id || apiResponse.id || canopyPullId,
        status: apiResponse.status || 'unknown',
        first_name: apiResponse.first_name,
        middle_name: apiResponse.middle_name,
        last_name: apiResponse.last_name,
        email: apiResponse.email,
        account_email: apiResponse.account_email,
        phone: apiResponse.phone,
        mobile_phone: apiResponse.mobile_phone,
        home_phone: apiResponse.home_phone,
        work_phone: apiResponse.work_phone,
        work_phone_extension: apiResponse.work_phone_extension,
        insurance_provider_name: apiResponse.insurance_provider_name,
        team_id: apiResponse.team_id,
        widget_id: apiResponse.widget_id,
        meta_data: apiResponse.meta_data,
        is_archived: apiResponse.is_archived,
        created_at: apiResponse.created_at,
        public_alias: apiResponse.public_alias,
        deleted_at: apiResponse.deleted_at,
        public_url: apiResponse.public_url,
        no_policies: apiResponse.no_policies,
        no_drivers: apiResponse.no_drivers,
        no_documents: apiResponse.no_documents,
        no_claims: apiResponse.no_claims,
        no_loss_events: apiResponse.no_loss_events,
        skipped_product_types: apiResponse.skipped_product_types,
        type: apiResponse.type,
        policies: apiResponse.policies,
        drivers: apiResponse.drivers,
        documents: apiResponse.documents,
        addresses: apiResponse.addresses,
        claims: apiResponse.claims,
        driving_records: apiResponse.driving_records,
        loss_events: apiResponse.loss_events,
        agents: apiResponse.agents,
      };
    }

    // Process the pull data
    return await processPullData(canopyPullId, pullData, supabase);

  } catch (error) {
    console.error('[Canopy Fetch] Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================================================
// PROCESS PULL DATA
// ============================================================================

async function processPullData(
  canopyPullId: string,
  pullData: CanopyPull,
  supabase: ReturnType<typeof createClient>
): Promise<{ success: boolean; error?: string; summary?: Record<string, number> }> {

  const summary = {
    policies: 0,
    vehicles: 0,
    drivers: 0,
    dwellings: 0,
    claims: 0,
    documents: 0,
    driving_records: 0,
    loss_events: 0,
    agents: 0,
    addresses: 0,
  };

  try {
    // Get or create pull record with ALL new fields
    const pullId = await upsertPull(supabase, canopyPullId, pullData);
    if (!pullId) {
      return { success: false, error: 'Failed to create/update pull record' };
    }

    // Track Canopy policy ID to DB policy ID mapping for linking
    const policyIdMap = new Map<string, string>();
    const driverIdMap = new Map<string, string>();

    // Process policies
    for (const policy of pullData.policies || []) {
      const dbPolicyId = await upsertPolicy(supabase, pullId, policy);
      if (dbPolicyId && policy.policy_id) {
        policyIdMap.set(policy.policy_id, dbPolicyId);
        summary.policies++;

        // Process vehicles nested in policy
        for (const vehicle of policy.vehicles || []) {
          await upsertVehicle(supabase, dbPolicyId, vehicle);
          summary.vehicles++;

          // Process drivers nested in vehicle
          for (const driver of vehicle.drivers || []) {
            const dbDriverId = await upsertDriver(supabase, dbPolicyId, driver);
            if (dbDriverId && driver.driver_id) {
              driverIdMap.set(driver.driver_id, dbDriverId);
            }
            summary.drivers++;
          }
        }

        // Process drivers at policy level
        for (const driver of policy.drivers || []) {
          const dbDriverId = await upsertDriver(supabase, dbPolicyId, driver);
          if (dbDriverId && driver.driver_id) {
            driverIdMap.set(driver.driver_id, dbDriverId);
          }
          summary.drivers++;
        }

        // Process dwellings
        for (const dwelling of policy.dwellings || []) {
          await upsertDwelling(supabase, dbPolicyId, dwelling);
          summary.dwellings++;
        }

        // Process claims at policy level
        for (const claim of policy.claims || []) {
          await upsertClaim(supabase, dbPolicyId, pullId, claim);
          summary.claims++;
        }
      }
    }

    // Process pull-level drivers (not in policies)
    for (const driver of pullData.drivers || []) {
      // Find associated policy if any
      const policyId = policyIdMap.values().next().value; // Use first policy as fallback
      if (policyId) {
        const dbDriverId = await upsertDriver(supabase, policyId, driver);
        if (dbDriverId && driver.driver_id) {
          driverIdMap.set(driver.driver_id, dbDriverId);
        }
        summary.drivers++;
      }
    }

    // Process pull-level claims
    for (const claim of pullData.claims || []) {
      const policyId = claim.policy_id ? policyIdMap.get(claim.policy_id) : null;
      await upsertClaim(supabase, policyId || null, pullId, claim);
      summary.claims++;
    }

    // Process documents
    for (const doc of pullData.documents || []) {
      const policyId = doc.policy_id ? policyIdMap.get(doc.policy_id) : null;
      await upsertDocument(supabase, policyId, pullId, doc);
      summary.documents++;
    }

    // Process addresses (NEW)
    for (const address of pullData.addresses || []) {
      await upsertAddress(supabase, pullId, address);
      summary.addresses++;
    }

    // Process driving records (NEW)
    for (const record of pullData.driving_records || []) {
      const dbDriverId = record.driver_id ? driverIdMap.get(record.driver_id) : null;
      const policyId = policyIdMap.values().next().value || null;
      await upsertDrivingRecord(supabase, pullId, policyId, dbDriverId, record);
      summary.driving_records++;
    }

    // Process loss events (NEW)
    for (const event of pullData.loss_events || []) {
      const policyId = event.policy_id ? policyIdMap.get(event.policy_id) : null;
      await upsertLossEvent(supabase, pullId, policyId, event);
      summary.loss_events++;
    }

    // Process agents (NEW)
    for (const agent of pullData.agents || []) {
      await upsertAgent(supabase, pullId, agent, policyIdMap);
      summary.agents++;
    }

    // Update pull record with counts
    await supabase
      .from('canopy_pulls')
      .update({
        status: pullData.status === 'SUCCESS' ? 'complete' : (pullData.status?.toLowerCase() || 'processing'),
        policy_count: summary.policies,
        carrier_count: [...new Set((pullData.policies || []).map(p => p.carrier_name || p.carrier?.name || 'Unknown'))].length,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', pullId);

    console.log(`[Canopy Fetch] Completed processing. Summary:`, summary);
    return { success: true, summary };

  } catch (error) {
    console.error('[Canopy Fetch] Processing error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================================================
// UPSERT FUNCTIONS
// ============================================================================

async function upsertPull(
  supabase: ReturnType<typeof createClient>,
  canopyPullId: string,
  pullData: CanopyPull
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('canopy_pulls')
    .select('id')
    .eq('canopy_pull_id', canopyPullId)
    .single();

  const pullRecord = {
    canopy_pull_id: canopyPullId,
    status: pullData.status === 'SUCCESS' ? 'complete' : (pullData.status?.toLowerCase() || 'processing'),

    // Consumer info
    consumer_first_name: pullData.first_name,
    consumer_middle_name: pullData.middle_name,
    consumer_last_name: pullData.last_name,
    consumer_email: pullData.email,
    account_email: pullData.account_email,
    phone: pullData.phone,
    mobile_phone: pullData.mobile_phone,
    home_phone: pullData.home_phone,
    work_phone: pullData.work_phone,
    work_phone_extension: pullData.work_phone_extension,

    // Metadata
    insurance_provider_name: pullData.insurance_provider_name,
    team_id: pullData.team_id,
    widget_id: pullData.widget_id,
    public_alias: pullData.public_alias,
    public_url: pullData.public_url,
    pull_type: pullData.type,

    // Flags
    is_archived: pullData.is_archived || false,
    no_policies: pullData.no_policies || false,
    no_drivers: pullData.no_drivers || false,
    no_documents: pullData.no_documents || false,
    no_claims: pullData.no_claims || false,
    no_loss_events: pullData.no_loss_events || false,
    skipped_product_types: pullData.skipped_product_types || [],

    // Store meta_data in metadata column
    metadata: {
      ...pullData.meta_data,
      consumer_first_name: pullData.first_name,
      consumer_last_name: pullData.last_name,
      consumer_email: pullData.email || pullData.account_email,
      phone: pullData.phone || pullData.mobile_phone,
    },

    updated_at: new Date().toISOString(),
  };

  if (existing) {
    await supabase.from('canopy_pulls').update(pullRecord).eq('id', existing.id);
    return existing.id;
  } else {
    const { data: newPull, error } = await supabase
      .from('canopy_pulls')
      .insert({
        ...pullRecord,
        created_at: pullData.created_at || new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.error('[Canopy Fetch] Failed to create pull:', error);
      return null;
    }
    return newPull.id;
  }
}

async function upsertPolicy(
  supabase: ReturnType<typeof createClient>,
  pullId: string,
  policy: CanopyPolicy
): Promise<string | null> {
  const canopyPolicyId = policy.policy_id;

  const { data: existing } = await supabase
    .from('canopy_policies')
    .select('id')
    .eq('canopy_policy_id', canopyPolicyId)
    .single();

  // Convert premium from cents to dollars if needed
  let premiumAmount = policy.premium?.amount;
  if (!premiumAmount && policy.total_premium_cents) {
    premiumAmount = policy.total_premium_cents / 100;
  }

  // Get carrier info
  const carrierName = policy.carrier_name || policy.carrier?.name || 'Unknown';

  const policyRecord = {
    pull_id: pullId,
    canopy_policy_id: canopyPolicyId,

    // New fields
    name: policy.name,
    description: policy.description,

    // Carrier info
    carrier_name: carrierName,
    carrier_code: policy.carrier?.code,
    carrier_naic_code: policy.carrier?.naic_code,

    // Policy details
    policy_number: policy.policy_number || policy.carrier_policy_number,
    policy_type: mapPolicyType(policy.policy_type),
    effective_date: policy.effective_date,
    expiration_date: policy.expiration_date || policy.expiry_date,
    renewal_date: policy.renewal_date,
    canceled_date: policy.canceled_date,

    // Premium
    premium_amount: premiumAmount,
    premium_frequency: policy.premium?.frequency ? mapPremiumFrequency(policy.premium.frequency) : 'semi-annual',

    // Status and flags
    status: mapPolicyStatus(policy.status),
    limited_access: policy.limited_access || false,
    paid_in_full: policy.paid_in_full,
    is_monoline: policy.is_monoline || false,
    form_of_business: policy.form_of_business,

    // Deductible
    deductible: policy.deductible || (policy.deductible_cents ? policy.deductible_cents / 100 : null),

    // Coverage data
    coverage_limits: policy.coverage_limits || {},
    named_insureds: policy.named_insureds || [],

    // Raw data
    raw_data: policy,
  };

  if (existing) {
    await supabase.from('canopy_policies').update(policyRecord).eq('id', existing.id);
    return existing.id;
  } else {
    const { data: newPolicy, error } = await supabase
      .from('canopy_policies')
      .insert(policyRecord)
      .select('id')
      .single();

    if (error) {
      console.error('[Canopy Fetch] Failed to insert policy:', error);
      return null;
    }
    return newPolicy.id;
  }
}

async function upsertVehicle(
  supabase: ReturnType<typeof createClient>,
  policyId: string,
  vehicle: CanopyVehicle
): Promise<string | null> {
  let existingId: string | null = null;

  if (vehicle.vin) {
    const { data: existing } = await supabase
      .from('canopy_vehicles')
      .select('id')
      .eq('policy_id', policyId)
      .eq('vin', vehicle.vin)
      .single();
    existingId = existing?.id || null;
  }

  // Parse coverages array into coverage map
  const coverages = vehicle.coverages || [];
  const coverageMap: Record<string, CanopyVehicleCoverage> = {};
  for (const cov of coverages) {
    coverageMap[cov.name] = cov;
  }

  // Get garaging address (handle both formats)
  const garageAddr = vehicle.garaging_address || vehicle.GaragingAddress;

  // Get lien holder address
  const lienAddr = vehicle.lien_holder_address || vehicle.LienHolderAddress;

  // Map uses array to usage type
  let usageType = 'other';
  const uses = Array.isArray(vehicle.uses) ? vehicle.uses : (vehicle.uses ? [vehicle.uses] : []);
  if (uses.some(u => u.toUpperCase().includes('COMMUTE'))) usageType = 'commute';
  else if (uses.some(u => u.toUpperCase().includes('BUSINESS'))) usageType = 'business';
  else if (uses.some(u => u.toUpperCase().includes('PLEASURE') || u.toUpperCase().includes('PERSONAL'))) usageType = 'pleasure';

  const vehicleRecord = {
    policy_id: policyId,
    canopy_vehicle_id: vehicle.vehicle_id,
    vin: vehicle.vin,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.series || vehicle.type,
    series2: vehicle.series2,
    body_type: vehicle.type || vehicle.body_type,
    usage_type: usageType,
    annual_mileage: vehicle.annual_mileage,
    ownership: mapOwnership(vehicle.ownership_type || vehicle.ownership),
    purchase_date: vehicle.purchase_date,
    is_removed: vehicle.is_removed || false,
    features: vehicle.features || {},

    // Garaging address
    garage_address: garageAddr?.full_address || garageAddr?.street,
    garage_city: garageAddr?.city,
    garage_state: garageAddr?.state,
    garage_zip: garageAddr?.zip,

    // Lien holder info (NEW)
    lien_holder_name: vehicle.lien_holder,
    lien_holder_address_line1: lienAddr?.full_address || lienAddr?.street,
    lien_holder_city: lienAddr?.city,
    lien_holder_state: lienAddr?.state,
    lien_holder_zip: lienAddr?.zip,

    // Coverage values (convert from cents)
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

    // Per-mile premium (NEW)
    per_mile_premium_tenth_of_cents: coverageMap['COLLISION']?.per_mile_premium_tenth_of_cents || null,

    // Full coverages array
    coverages: coverages,
  };

  if (existingId) {
    await supabase.from('canopy_vehicles').update(vehicleRecord).eq('id', existingId);
    return existingId;
  } else {
    const { data: newVehicle, error } = await supabase
      .from('canopy_vehicles')
      .insert(vehicleRecord)
      .select('id')
      .single();

    if (error) {
      console.error('[Canopy Fetch] Failed to insert vehicle:', error);
      return null;
    }
    return newVehicle.id;
  }
}

async function upsertDriver(
  supabase: ReturnType<typeof createClient>,
  policyId: string,
  driver: CanopyDriver
): Promise<string | null> {
  let existingId: string | null = null;

  // Get license info from multiple formats
  const licenseNumber = driver.drivers_license || driver.license?.number;
  const licenseState = driver.drivers_license_state || driver.license?.state;

  // Try to find by Canopy driver ID first, then by license
  if (driver.driver_id) {
    const { data: existing } = await supabase
      .from('canopy_drivers')
      .select('id')
      .eq('policy_id', policyId)
      .eq('canopy_driver_id', driver.driver_id)
      .single();
    existingId = existing?.id || null;
  }

  if (!existingId && licenseNumber && licenseState) {
    const { data: existing } = await supabase
      .from('canopy_drivers')
      .select('id')
      .eq('policy_id', policyId)
      .eq('license_number', licenseNumber)
      .eq('license_state', licenseState)
      .single();
    existingId = existing?.id || null;
  }

  // Parse date_of_birth from string format (MM/DD/YYYY)
  let dateOfBirth = driver.date_of_birth;
  if (!dateOfBirth && driver.date_of_birth_str) {
    const parts = driver.date_of_birth_str.split('/');
    if (parts.length === 3) {
      dateOfBirth = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    }
  }

  const driverRecord = {
    policy_id: policyId,
    canopy_driver_id: driver.driver_id,
    first_name: driver.first_name,
    last_name: driver.last_name,
    middle_name: driver.middle_name,
    date_of_birth: dateOfBirth,
    gender: mapGender(driver.gender),
    marital_status: mapMaritalStatus(driver.marital_status),
    license_number: licenseNumber,
    license_state: licenseState,
    license_status: mapLicenseStatus(driver.license?.status),
    license_issue_date: driver.license?.issue_date,
    license_expiration_date: driver.license?.expiration_date,
    relation_to_insured: mapRelation(driver.relationship_to_insured || driver.relation_to_insured),
    is_primary: driver.is_primary || false,
    is_excluded: driver.is_excluded || false,
    sr22_required: driver.sr22_required || false,
    occupation: driver.occupation,
    education: driver.education,
    education_level: driver.education_level || driver.education,
    years_licensed: driver.years_licensed,

    // New age fields
    age: driver.age,
    age_on_date: driver.age_on_date,
    age_licensed: driver.age_licensed,

    // MVR data
    violations: driver.violations || [],
    accidents: driver.accidents || [],
    claims: driver.claims || [],
  };

  if (existingId) {
    await supabase.from('canopy_drivers').update(driverRecord).eq('id', existingId);
    return existingId;
  } else {
    const { data: newDriver, error } = await supabase
      .from('canopy_drivers')
      .insert(driverRecord)
      .select('id')
      .single();

    if (error) {
      console.error('[Canopy Fetch] Failed to insert driver:', error);
      return null;
    }
    return newDriver.id;
  }
}

async function upsertDwelling(
  supabase: ReturnType<typeof createClient>,
  policyId: string,
  dwelling: CanopyDwelling
): Promise<string | null> {
  let existingId: string | null = null;

  // Build address string for lookup
  const street = dwelling.address?.full_address ||
    `${dwelling.address?.number || ''} ${dwelling.address?.street || ''} ${dwelling.address?.type || ''}`.trim();
  const zip = dwelling.address?.zip;

  if (street && zip) {
    const { data: existing } = await supabase
      .from('canopy_dwellings')
      .select('id')
      .eq('policy_id', policyId)
      .eq('zip', zip)
      .single();
    existingId = existing?.id || null;
  }

  // Parse coverages array
  const coverages = dwelling.coverages || [];
  const coverageMap: Record<string, CanopyDwellingCoverage> = {};
  for (const cov of coverages) {
    coverageMap[cov.name] = cov;
  }

  // Get property_data
  const propData = dwelling.property_data;

  const dwellingRecord = {
    policy_id: policyId,
    canopy_dwelling_id: dwelling.dwelling_id,

    // Address
    address_line1: street,
    address_line2: dwelling.address?.sec_unit_type && dwelling.address?.sec_unit_num
      ? `${dwelling.address.sec_unit_type} ${dwelling.address.sec_unit_num}` : null,
    city: dwelling.address?.city,
    state: dwelling.address?.state,
    zip: zip,
    county: dwelling.address?.county,

    // Mortgagee info (NEW)
    mortgagee_name: dwelling.mortgagee_name,
    mortgage_loan_number: dwelling.mortgage_loan_number,
    mortgagee_address_line1: dwelling.mortgagee_address?.full_address ||
      `${dwelling.mortgagee_address?.number || ''} ${dwelling.mortgagee_address?.street || ''}`.trim() || null,
    mortgagee_city: dwelling.mortgagee_address?.city,
    mortgagee_state: dwelling.mortgagee_address?.state,
    mortgagee_zip: dwelling.mortgagee_address?.zip,

    // Valuation (NEW)
    replacement_cost_cents: dwelling.replacement_cost_cents,
    cash_value_cents: dwelling.cash_value_cents,
    loss_settlement_type: dwelling.loss_settlement_type,
    extended_replacement_cost_percent: dwelling.extended_replacement_cost_percent,
    property_data_fetched: dwelling.property_data_fetched || false,

    // Property characteristics
    property_type: mapPropertyType(propData?.class || dwelling.property_type),
    property_class: propData?.class,
    property_sub_type: propData?.sub_type,
    occupancy_type: mapOccupancyType(dwelling.occupancy_type),
    year_built: propData?.year_built || dwelling.year_built,
    square_footage: propData?.square_ft || dwelling.square_footage,
    stories: propData?.num_stories || dwelling.stories,

    // Construction details from property_data
    construction_type: propData?.construction_type || dwelling.construction_type,
    wall_type: propData?.wall_type,
    frame_type: propData?.frame_type,
    roof_cover: propData?.roof_cover,
    roof_shape: propData?.roof_shape,
    foundation_type: propData?.foundation_type || dwelling.foundation_type,
    exterior_type: dwelling.exterior_type,
    roof_type: dwelling.roof_type,
    roof_year: dwelling.roof_year,

    // Systems
    heating_type: propData?.heating_type || dwelling.heating_type,
    heating_fuel: propData?.heating_fuel,
    cooling_type: propData?.cooling_type,
    electrical_type: dwelling.electrical_type,
    plumbing_type: dwelling.plumbing_type,
    energy_type: propData?.energy_type,
    sewer_type: propData?.sewer_type,
    building_shape: propData?.building_shape,
    construction_quality: propData?.construction_quality,

    // Rooms
    num_beds: propData?.num_beds,
    num_baths_full: propData?.num_baths_full,
    num_baths_partial: propData?.num_baths_partial,
    num_units: propData?.num_units,

    // Features
    has_fireplace: propData?.has_fireplace || dwelling.features?.fireplace || false,
    num_fireplaces: propData?.num_fireplaces,
    fireplace_type: propData?.fireplace_type,
    has_pool: propData?.has_pool || dwelling.features?.has_pool || dwelling.features?.swimming_pool || false,
    pool_type: propData?.pool_type,

    // Garage
    garage_type: propData?.garage_type,
    garage_square_ft: propData?.garage_square_ft,
    num_parking_spaces: propData?.num_parking_spaces,

    // Valuations from property_data
    assessed_improvement_value_cents: propData?.assessed_improvement_value_cents,
    assessed_land_value_cents: propData?.assessed_land_value_cents,
    assessed_total_value_cents: propData?.assessed_total_value_cents,
    market_improvement_value_cents: propData?.market_improvement_value_cents,
    market_land_value_cents: propData?.market_land_value_cents,
    market_total_value_cents: propData?.market_total_value_cents,

    // Owner info from property_data
    owner1_first_name: propData?.owner1_first_name,
    owner1_last_name: propData?.owner1_last_name,
    owner2_first_name: propData?.owner2_first_name,
    owner2_last_name: propData?.owner2_last_name,
    owner3_first_name: propData?.owner3_first_name,
    owner3_last_name: propData?.owner3_last_name,
    owner4_first_name: propData?.owner4_first_name,
    owner4_last_name: propData?.owner4_last_name,

    // Mortgage from property_data
    first_mortgage_amount_cents: propData?.first_mortgage_amount_cents,
    first_mortgage_lender: propData?.first_mortgage_lender,
    second_mortgage_amount_cents: propData?.second_mortgage_amount_cents,
    second_mortgage_lender: propData?.second_mortgage_lender,

    // Purchase history
    purchase_date: propData?.purchase_date,
    purchase_price_cents: propData?.purchase_price_cents,
    property_data_last_update: propData?.last_update_date,

    // Coverage values from array (convert from cents)
    dwelling_coverage: coverageMap['DWELLING']?.per_incident_limit_cents
      ? coverageMap['DWELLING'].per_incident_limit_cents / 100 : null,
    other_structures: coverageMap['OTHER_STRUCTURES']?.per_incident_limit_cents
      ? coverageMap['OTHER_STRUCTURES'].per_incident_limit_cents / 100 : null,
    personal_property: coverageMap['PERSONAL_PROPERTY']?.per_incident_limit_cents
      ? coverageMap['PERSONAL_PROPERTY'].per_incident_limit_cents / 100 : null,
    loss_of_use: coverageMap['LOSS_OF_USE']?.per_incident_limit_cents
      ? coverageMap['LOSS_OF_USE'].per_incident_limit_cents / 100 : null,
    liability_coverage: coverageMap['PERSONAL_LIABILITY']?.per_incident_limit_cents
      ? coverageMap['PERSONAL_LIABILITY'].per_incident_limit_cents / 100 : null,
    medical_payments: coverageMap['MEDICAL_PAYMENTS']?.per_person_limit_cents
      ? coverageMap['MEDICAL_PAYMENTS'].per_person_limit_cents / 100 : null,
    deductible: coverageMap['ALL_OTHER_PERILS']?.deductible_cents
      ? coverageMap['ALL_OTHER_PERILS'].deductible_cents / 100 : null,
    wind_hail_deductible: coverageMap['WINDSTORM_OR_HAIL']?.deductible_cents
      ? coverageMap['WINDSTORM_OR_HAIL'].deductible_cents / 100 : null,

    // Features from dwelling object
    swimming_pool: dwelling.features?.swimming_pool || false,
    trampoline: dwelling.features?.trampoline || false,
    dog_breed: dwelling.features?.dog_breed,
    security_system: dwelling.features?.security_system || false,
    fire_alarm: dwelling.features?.fire_alarm || false,
    sprinkler_system: dwelling.features?.sprinkler_system || false,
    deadbolt_locks: dwelling.features?.deadbolt_locks || false,
    gated_community: dwelling.features?.gated_community || false,

    // Full property_data for any fields we missed
    property_data: propData || {},
    raw_data: dwelling,
  };

  if (existingId) {
    await supabase.from('canopy_dwellings').update(dwellingRecord).eq('id', existingId);
    return existingId;
  } else {
    const { data: newDwelling, error } = await supabase
      .from('canopy_dwellings')
      .insert(dwellingRecord)
      .select('id')
      .single();

    if (error) {
      console.error('[Canopy Fetch] Failed to insert dwelling:', error);
      return null;
    }
    return newDwelling.id;
  }
}

async function upsertClaim(
  supabase: ReturnType<typeof createClient>,
  policyId: string | null,
  pullId: string,
  claim: CanopyClaim
): Promise<string | null> {
  let existingId: string | null = null;

  const claimNumber = claim.claim_number || claim.carrier_claim_identifier;

  if (claim.claim_id) {
    const { data: existing } = await supabase
      .from('canopy_claims')
      .select('id')
      .eq('canopy_claim_id', claim.claim_id)
      .single();
    existingId = existing?.id || null;
  }

  if (!existingId && claimNumber && policyId) {
    const { data: existing } = await supabase
      .from('canopy_claims')
      .select('id')
      .eq('policy_id', policyId)
      .eq('claim_number', claimNumber)
      .single();
    existingId = existing?.id || null;
  }

  // Convert payout from cents if needed
  const amountPaid = claim.amount_paid || (claim.payout_cents ? claim.payout_cents / 100 : null);

  const claimRecord = {
    policy_id: policyId,
    canopy_claim_id: claim.claim_id,

    // Entity linking (NEW)
    canopy_dwelling_id: claim.dwelling_id,
    canopy_vehicle_id: claim.vehicle_id,
    canopy_address_id: claim.address_id,
    canopy_driver_id: claim.driver_id,

    // Carrier identifier (NEW)
    carrier_claim_identifier: claim.carrier_claim_identifier,

    // Claim details
    claim_number: claimNumber,
    claim_date: claim.claim_date || claim.date_occurred,
    close_date: claim.close_date || claim.date_closed,
    claim_type: claim.claim_type || claim.type,
    claim_category: claim.claim_category,
    status: mapClaimStatus(claim.status),
    amount_paid: amountPaid,
    amount_reserved: claim.amount_reserved,
    deductible_applied: claim.deductible_applied,
    description: claim.description,
    at_fault: claim.at_fault,
    subrogation: claim.subrogation || false,
    claimant_name: claim.claimant_name,

    // Representative contact (NEW)
    representative_name: claim.representative_name,
    representative_phone: claim.representative_phone,
    representative_email: claim.representative_email,

    raw_data: claim,
  };

  if (existingId) {
    await supabase.from('canopy_claims').update(claimRecord).eq('id', existingId);
    return existingId;
  } else {
    const { data: newClaim, error } = await supabase
      .from('canopy_claims')
      .insert(claimRecord)
      .select('id')
      .single();

    if (error) {
      console.error('[Canopy Fetch] Failed to insert claim:', error);
      return null;
    }
    return newClaim.id;
  }
}

async function upsertDocument(
  supabase: ReturnType<typeof createClient>,
  policyId: string | null,
  pullId: string,
  doc: CanopyDocument
): Promise<string | null> {
  let existingId: string | null = null;

  if (doc.document_id) {
    const { data: existing } = await supabase
      .from('canopy_documents')
      .select('id')
      .eq('canopy_document_id', doc.document_id)
      .single();
    existingId = existing?.id || null;
  }

  // If no policyId but we have the canopy policy_id, try to find it
  let dbPolicyId = policyId;
  if (!dbPolicyId && doc.policy_id) {
    const { data: policy } = await supabase
      .from('canopy_policies')
      .select('id')
      .eq('canopy_policy_id', doc.policy_id)
      .single();
    dbPolicyId = policy?.id || null;
  }

  const docRecord = {
    policy_id: dbPolicyId,
    canopy_document_id: doc.document_id,
    canopy_policy_id: doc.policy_id,
    document_type: mapDocumentType(doc.document_type),
    title: doc.title,
    date_added: doc.date_added,
    file_url: doc.url,
    file_name: doc.name || doc.title,
    mime_type: doc.mime_type,
    file_size: doc.size,
  };

  if (existingId) {
    await supabase.from('canopy_documents').update(docRecord).eq('id', existingId);
    return existingId;
  } else {
    const { data: newDoc, error } = await supabase
      .from('canopy_documents')
      .insert(docRecord)
      .select('id')
      .single();

    if (error) {
      console.error('[Canopy Fetch] Failed to insert document:', error);
      return null;
    }
    return newDoc.id;
  }
}

// ============================================================================
// NEW UPSERT FUNCTIONS
// ============================================================================

async function upsertAddress(
  supabase: ReturnType<typeof createClient>,
  pullId: string,
  address: CanopyAddress
): Promise<string | null> {
  let existingId: string | null = null;

  if (address.address_id) {
    const { data: existing } = await supabase
      .from('canopy_addresses')
      .select('id')
      .eq('canopy_address_id', address.address_id)
      .single();
    existingId = existing?.id || null;
  }

  const addressRecord = {
    pull_id: pullId,
    canopy_address_id: address.address_id,
    full_address: address.full_address,
    number: address.number,
    street: address.street,
    type: address.type,
    sec_unit_type: address.sec_unit_type,
    sec_unit_num: address.sec_unit_num,
    city: address.city,
    state: address.state,
    zip: address.zip,
    county: address.county,
    country: address.country,
    address_nature: address.address_nature,
    raw_data: address,
  };

  if (existingId) {
    await supabase.from('canopy_addresses').update(addressRecord).eq('id', existingId);
    return existingId;
  } else {
    const { data: newAddress, error } = await supabase
      .from('canopy_addresses')
      .insert(addressRecord)
      .select('id')
      .single();

    if (error) {
      console.error('[Canopy Fetch] Failed to insert address:', error);
      return null;
    }
    return newAddress.id;
  }
}

async function upsertDrivingRecord(
  supabase: ReturnType<typeof createClient>,
  pullId: string,
  policyId: string | null,
  driverId: string | null,
  record: CanopyDrivingRecord
): Promise<string | null> {
  let existingId: string | null = null;

  if (record.driving_record_id) {
    const { data: existing } = await supabase
      .from('canopy_driving_records')
      .select('id')
      .eq('canopy_driving_record_id', record.driving_record_id)
      .single();
    existingId = existing?.id || null;
  }

  const recordData = {
    pull_id: pullId,
    policy_id: policyId,
    driver_id: driverId,
    canopy_driving_record_id: record.driving_record_id,
    canopy_driver_id: record.driver_id,
    incident_date: record.incident_date,
    incident_type: record.incident_type,
    violation_type: record.violation_type,
    is_at_fault: record.is_at_fault,
    description: record.description,
    points: record.points,
    state: record.state,
    raw_data: record,
  };

  if (existingId) {
    await supabase.from('canopy_driving_records').update(recordData).eq('id', existingId);
    return existingId;
  } else {
    const { data: newRecord, error } = await supabase
      .from('canopy_driving_records')
      .insert(recordData)
      .select('id')
      .single();

    if (error) {
      console.error('[Canopy Fetch] Failed to insert driving record:', error);
      return null;
    }
    return newRecord.id;
  }
}

async function upsertLossEvent(
  supabase: ReturnType<typeof createClient>,
  pullId: string,
  policyId: string | null,
  event: CanopyLossEvent
): Promise<string | null> {
  let existingId: string | null = null;

  if (event.loss_event_id) {
    const { data: existing } = await supabase
      .from('canopy_loss_events')
      .select('id')
      .eq('canopy_loss_event_id', event.loss_event_id)
      .single();
    existingId = existing?.id || null;
  }

  // Try to find policy by canopy ID if not provided
  let dbPolicyId = policyId;
  if (!dbPolicyId && event.policy_id) {
    const { data: policy } = await supabase
      .from('canopy_policies')
      .select('id')
      .eq('canopy_policy_id', event.policy_id)
      .single();
    dbPolicyId = policy?.id || null;
  }

  const eventData = {
    pull_id: pullId,
    policy_id: dbPolicyId,
    canopy_loss_event_id: event.loss_event_id,
    date_of_occurrence: event.date_of_occurrence,
    type: event.type,
    date_of_claim: event.date_of_claim,
    amount_paid_cents: event.amount_paid_cents,
    amount_reserved_cents: event.amount_reserved_cents,
    is_subrogation: event.is_subrogation || false,
    is_claim_open: event.is_claim_open || false,
    description: event.description,
    location: event.location,
    raw_data: event,
  };

  if (existingId) {
    await supabase.from('canopy_loss_events').update(eventData).eq('id', existingId);
    return existingId;
  } else {
    const { data: newEvent, error } = await supabase
      .from('canopy_loss_events')
      .insert(eventData)
      .select('id')
      .single();

    if (error) {
      console.error('[Canopy Fetch] Failed to insert loss event:', error);
      return null;
    }
    return newEvent.id;
  }
}

async function upsertAgent(
  supabase: ReturnType<typeof createClient>,
  pullId: string,
  agent: CanopyAgent,
  policyIdMap: Map<string, string>
): Promise<string | null> {
  let existingId: string | null = null;

  if (agent.agent_info_id) {
    const { data: existing } = await supabase
      .from('canopy_agents')
      .select('id')
      .eq('canopy_agent_id', agent.agent_info_id)
      .single();
    existingId = existing?.id || null;
  }

  // Map Canopy policy IDs to our policy IDs
  const mappedPolicyIds = (agent.policy_ids || []).map(canopyId => policyIdMap.get(canopyId) || canopyId);

  const agentData = {
    pull_id: pullId,
    canopy_agent_id: agent.agent_info_id,
    canopy_address_id: agent.address_id,
    agency_name: agent.agency_name,
    agent_full_name: agent.agent_full_name,
    phone_number: agent.phone_number,
    email: agent.email,
    address_line1: agent.address?.full_address ||
      `${agent.address?.number || ''} ${agent.address?.street || ''} ${agent.address?.type || ''}`.trim() || null,
    city: agent.address?.city,
    state: agent.address?.state,
    zip: agent.address?.zip,
    policy_ids: mappedPolicyIds,
    raw_data: agent,
  };

  if (existingId) {
    await supabase.from('canopy_agents').update(agentData).eq('id', existingId);
    return existingId;
  } else {
    const { data: newAgent, error } = await supabase
      .from('canopy_agents')
      .insert(agentData)
      .select('id')
      .single();

    if (error) {
      console.error('[Canopy Fetch] Failed to insert agent:', error);
      return null;
    }
    return newAgent.id;
  }
}

// ============================================================================
// MAPPING HELPERS
// ============================================================================

function mapPolicyType(type: string | undefined): string {
  if (!type) return 'other';
  const typeMap: Record<string, string> = {
    'auto': 'auto',
    'AUTO': 'auto',
    'automobile': 'auto',
    'personal_auto': 'auto',
    'car': 'auto',
    'home': 'home',
    'HOME': 'home',
    'homeowners': 'home',
    'HOMEOWNERS': 'home',
    'ho3': 'home',
    'ho5': 'home',
    'dwelling': 'home',
    'renters': 'renters',
    'RENTERS': 'renters',
    'renter': 'renters',
    'ho4': 'renters',
    'condo': 'condo',
    'CONDO': 'condo',
    'condominium': 'condo',
    'ho6': 'condo',
    'umbrella': 'umbrella',
    'UMBRELLA': 'umbrella',
    'personal_umbrella': 'umbrella',
    'pup': 'umbrella',
    'life': 'life',
    'LIFE': 'life',
    'health': 'health',
    'HEALTH': 'health',
    // Commercial types
    'commercial_auto': 'commercial_auto',
    'COMMERCIAL_AUTO': 'commercial_auto',
    'business_owners': 'bop',
    'BUSINESS_OWNERS': 'bop',
    'bop': 'bop',
    'BOP': 'bop',
    'general_liability': 'general_liability',
    'GENERAL_LIABILITY': 'general_liability',
    'workers_comp': 'workers_comp',
    'WORKERS_COMP': 'workers_comp',
    'professional_liability': 'professional_liability',
    'PROFESSIONAL_LIABILITY': 'professional_liability',
  };
  return typeMap[type] || typeMap[type.toLowerCase()] || 'other';
}

function mapPremiumFrequency(freq: string | undefined): string | null {
  if (!freq) return null;
  const freqMap: Record<string, string> = {
    'annual': 'annual',
    'yearly': 'annual',
    'semi-annual': 'semi-annual',
    'semi_annual': 'semi-annual',
    'semiannual': 'semi-annual',
    'quarterly': 'quarterly',
    'monthly': 'monthly',
  };
  return freqMap[freq.toLowerCase()] || 'other';
}

function mapPolicyStatus(status: string | undefined): string | null {
  if (!status) return null;
  const statusMap: Record<string, string> = {
    'active': 'active',
    'ACTIVE': 'active',
    'in_force': 'active',
    'inforce': 'active',
    'cancelled': 'cancelled',
    'canceled': 'cancelled',
    'CANCELLED': 'cancelled',
    'expired': 'expired',
    'EXPIRED': 'expired',
    'pending': 'pending',
    'PENDING': 'pending',
    'not_in_force': 'expired',
  };
  return statusMap[status] || statusMap[status.toLowerCase()] || 'unknown';
}

function mapOwnership(ownership: string | undefined): string | null {
  if (!ownership) return null;
  const ownershipMap: Record<string, string> = {
    'owned': 'owned',
    'own': 'owned',
    'purchased': 'owned',
    'leased': 'leased',
    'lease': 'leased',
    'financed': 'financed',
    'finance': 'financed',
    'loan': 'financed',
    'lien': 'financed',
  };
  return ownershipMap[ownership.toLowerCase()] || 'other';
}

function mapGender(gender: string | undefined): string | null {
  if (!gender) return null;
  const genderMap: Record<string, string> = {
    'm': 'male',
    'male': 'male',
    'MALE': 'male',
    'man': 'male',
    'f': 'female',
    'female': 'female',
    'FEMALE': 'female',
    'woman': 'female',
    'x': 'other',
    'non-binary': 'other',
    'nonbinary': 'other',
  };
  return genderMap[gender] || genderMap[gender.toLowerCase()] || 'unknown';
}

function mapMaritalStatus(status: string | undefined): string | null {
  if (!status) return null;
  const statusMap: Record<string, string> = {
    's': 'single',
    'single': 'single',
    'SINGLE': 'single',
    'never_married': 'single',
    'm': 'married',
    'married': 'married',
    'MARRIED': 'married',
    'd': 'divorced',
    'divorced': 'divorced',
    'DIVORCED': 'divorced',
    'w': 'widowed',
    'widowed': 'widowed',
    'WIDOWED': 'widowed',
    'domestic_partner': 'domestic_partner',
    'civil_union': 'domestic_partner',
    'separated': 'separated',
    'SEPARATED': 'separated',
  };
  return statusMap[status] || statusMap[status.toLowerCase()] || 'unknown';
}

function mapLicenseStatus(status: string | undefined): string | null {
  if (!status) return null;
  const statusMap: Record<string, string> = {
    'valid': 'valid',
    'VALID': 'valid',
    'active': 'valid',
    'current': 'valid',
    'suspended': 'suspended',
    'SUSPENDED': 'suspended',
    'revoked': 'revoked',
    'REVOKED': 'revoked',
    'expired': 'expired',
    'EXPIRED': 'expired',
    'permit': 'permit',
    'PERMIT': 'permit',
    'learner': 'permit',
    'learners': 'permit',
    'international': 'valid',
  };
  return statusMap[status] || statusMap[status.toLowerCase()] || 'unknown';
}

function mapRelation(relation: string | undefined): string | null {
  if (!relation) return null;
  const relationMap: Record<string, string> = {
    'self': 'self',
    'insured': 'self',
    'INSURED': 'self',
    'named_insured': 'self',
    'policyholder': 'self',
    'spouse': 'spouse',
    'SPOUSE': 'spouse',
    'husband': 'spouse',
    'wife': 'spouse',
    'partner': 'spouse',
    'child': 'child',
    'CHILD': 'child',
    'son': 'child',
    'daughter': 'child',
    'dependent': 'child',
    'parent': 'parent',
    'PARENT': 'parent',
    'mother': 'parent',
    'father': 'parent',
    'other_relative': 'other_relative',
    'OTHER_RELATIVE': 'other_relative',
    'relative': 'other_relative',
    'sibling': 'other_relative',
    'brother': 'other_relative',
    'sister': 'other_relative',
    'employee': 'employee',
    'EMPLOYEE': 'employee',
    'household_member': 'other',
    'non_relative': 'other',
  };
  return relationMap[relation] || relationMap[relation.toLowerCase()] || 'other';
}

function mapPropertyType(type: string | undefined): string | null {
  if (!type) return null;
  const typeMap: Record<string, string> = {
    'single_family': 'single_family',
    'SINGLE_FAMILY_RESIDENCE_TOWNHOUSE': 'single_family',
    'single': 'single_family',
    'house': 'single_family',
    'sfh': 'single_family',
    'condo': 'condo',
    'CONDO': 'condo',
    'condominium': 'condo',
    'townhouse': 'townhouse',
    'townhome': 'townhouse',
    'rowhouse': 'townhouse',
    'mobile_home': 'mobile_home',
    'manufactured': 'mobile_home',
    'modular': 'mobile_home',
    'apartment': 'apartment',
    'unit': 'apartment',
    'multi_family': 'multi_family',
    'duplex': 'multi_family',
    'triplex': 'multi_family',
    'fourplex': 'multi_family',
  };
  return typeMap[type] || typeMap[type.toLowerCase()] || 'other';
}

function mapOccupancyType(type: string | undefined): string | null {
  if (!type) return null;
  const typeMap: Record<string, string> = {
    'owner_occupied': 'owner_occupied',
    'owner': 'owner_occupied',
    'primary': 'owner_occupied',
    'primary_residence': 'owner_occupied',
    'tenant': 'tenant',
    'renter': 'tenant',
    'rented': 'tenant',
    'vacant': 'vacant',
    'unoccupied': 'vacant',
    'seasonal': 'seasonal',
    'secondary': 'seasonal',
    'vacation': 'seasonal',
    'second_home': 'seasonal',
  };
  return typeMap[type.toLowerCase()] || 'other';
}

function mapClaimStatus(status: string | undefined): string | null {
  if (!status) return null;
  const statusMap: Record<string, string> = {
    'open': 'open',
    'OPEN': 'open',
    'active': 'open',
    'in_progress': 'open',
    'closed': 'closed',
    'CLOSED': 'closed',
    'settled': 'closed',
    'resolved': 'closed',
    'pending': 'pending',
    'PENDING': 'pending',
    'under_review': 'pending',
    'denied': 'denied',
    'DENIED': 'denied',
    'rejected': 'denied',
  };
  return statusMap[status] || statusMap[status.toLowerCase()] || 'unknown';
}

function mapDocumentType(type: string | undefined): string | null {
  if (!type) return null;
  const typeMap: Record<string, string> = {
    'DECLARATIONS': 'dec_page',
    'declarations': 'dec_page',
    'dec_page': 'dec_page',
    'INSURANCE_ID_CARD': 'id_card',
    'id_card': 'id_card',
    'insurance_id_card': 'id_card',
    'policy': 'policy_doc',
    'POLICY': 'policy_doc',
    'policy_doc': 'policy_doc',
    'endorsement': 'endorsement',
    'ENDORSEMENT': 'endorsement',
    'certificate': 'certificate',
    'CERTIFICATE': 'certificate',
  };
  return typeMap[type] || typeMap[type.toLowerCase()] || 'other';
}

// ============================================================================
// HTTP HANDLER
// ============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type, authorization',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const canopyClientId = Deno.env.get('CANOPY_CLIENT_ID');
  const canopyClientSecret = Deno.env.get('CANOPY_CLIENT_SECRET');
  const canopyTeamId = Deno.env.get('CANOPY_TEAM_ID');

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase configuration' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const missingCreds = [];
  if (!canopyClientId) missingCreds.push('CANOPY_CLIENT_ID');
  if (!canopyClientSecret) missingCreds.push('CANOPY_CLIENT_SECRET');
  if (!canopyTeamId) missingCreds.push('CANOPY_TEAM_ID');

  if (missingCreds.length > 0) {
    return new Response(JSON.stringify({
      error: `Missing Canopy API credentials: ${missingCreds.join(', ')}`,
      hint: 'Set these in Supabase Edge Function secrets. Find Team ID in Canopy dashboard under Settings > API Keys.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { canopy_pull_id } = body;

    if (!canopy_pull_id) {
      return new Response(JSON.stringify({ error: 'canopy_pull_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const result = await fetchCanopyPullData(
      canopy_pull_id,
      supabase,
      canopyTeamId!,
      canopyClientId!,
      canopyClientSecret!
    );

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 500,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Canopy Fetch] Error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
