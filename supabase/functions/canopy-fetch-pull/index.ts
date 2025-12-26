// ============================================================================
// CANOPY FETCH PULL DATA
// ============================================================================
// Fetches complete pull data from Canopy's API and stores it in our database.
// Called by the webhook on COMPLETE events or manually to backfill data.
// This ensures we capture ALL data even if webhooks were missed.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface CanopyPullResponse {
  id: string;
  status: string;
  created_at: string;
  completed_at?: string;
  accounts?: CanopyAccount[];
  policies?: CanopyPolicy[];
  error?: {
    code: string;
    message: string;
  };
}

interface CanopyAccount {
  id: string;
  carrier: {
    name: string;
    code?: string;
    naic_code?: string;
  };
  account_number?: string;
  status?: string;
}

interface CanopyPolicy {
  id: string;
  account_id?: string;
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
    term_amount?: number;
    installment_amount?: number;
  };
  status?: string;
  deductible?: number;
  coverage_limits?: Record<string, unknown>;
  named_insureds?: Array<{
    name: string;
    type?: string;
    email?: string;
    phone?: string;
    address?: CanopyAddress;
  }>;
  additional_interests?: Array<{
    name: string;
    type: string;
    address?: CanopyAddress;
  }>;
  vehicles?: CanopyVehicle[];
  drivers?: CanopyDriver[];
  dwellings?: CanopyDwelling[];
  claims?: CanopyClaim[];
}

interface CanopyAddress {
  street?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
  county?: string;
}

interface CanopyVehicle {
  id?: string;
  vin?: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  body_type?: string;
  usage?: string;
  annual_mileage?: number;
  ownership?: string;
  garage_address?: CanopyAddress;
  coverages?: {
    liability_bi?: number;
    liability_bi_total?: number;
    liability_pd?: number;
    collision?: boolean;
    collision_deductible?: number;
    comprehensive?: boolean;
    comprehensive_deductible?: number;
    uninsured_motorist_bi?: number;
    uninsured_motorist_pd?: number;
    underinsured_motorist_bi?: number;
    underinsured_motorist_pd?: number;
    medical_payments?: number;
    pip?: number;
    rental_reimbursement?: number;
    rental_reimbursement_days?: number;
    towing_labor?: number;
    gap?: boolean;
  };
  lienholder?: {
    name: string;
    address?: CanopyAddress;
  };
}

interface CanopyDriver {
  id?: string;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  suffix?: string;
  full_name?: string;
  date_of_birth?: string;
  age?: number;
  gender?: string;
  marital_status?: string;
  email?: string;
  phone?: string;
  address?: CanopyAddress;
  license?: {
    number?: string;
    state?: string;
    status?: string;
    issue_date?: string;
    expiration_date?: string;
    class?: string;
  };
  relation_to_insured?: string;
  is_primary?: boolean;
  is_excluded?: boolean;
  sr22_required?: boolean;
  occupation?: string;
  industry?: string;
  education_level?: string;
  years_licensed?: number;
  age_first_licensed?: number;
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
  id?: string;
  address?: CanopyAddress;
  property_type?: string;
  occupancy_type?: string;
  ownership?: string;
  year_built?: number;
  year_purchased?: number;
  purchase_price?: number;
  estimated_value?: number;
  square_footage?: number;
  living_square_footage?: number;
  lot_size?: number;
  stories?: number;
  bedrooms?: number;
  bathrooms?: number;
  construction_type?: string;
  exterior_type?: string;
  roof_type?: string;
  roof_year?: number;
  roof_condition?: string;
  foundation_type?: string;
  heating_type?: string;
  heating_fuel?: string;
  cooling_type?: string;
  electrical_type?: string;
  electrical_amps?: number;
  plumbing_type?: string;
  water_heater_type?: string;
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
    earthquake_deductible?: number;
    flood?: boolean;
    flood_coverage?: number;
    earthquake?: boolean;
    water_backup?: boolean;
    water_backup_coverage?: number;
    identity_theft?: boolean;
    ordinance_law?: boolean;
    replacement_cost?: boolean;
    scheduled_property?: Array<{
      type: string;
      description: string;
      value: number;
    }>;
  };
  features?: {
    swimming_pool?: boolean;
    swimming_pool_type?: string;
    swimming_pool_fenced?: boolean;
    hot_tub?: boolean;
    trampoline?: boolean;
    dogs?: boolean;
    dog_breed?: string;
    wood_stove?: boolean;
    fireplace?: boolean;
    security_system?: boolean;
    security_system_type?: string;
    fire_alarm?: boolean;
    fire_alarm_type?: string;
    sprinkler_system?: boolean;
    deadbolt_locks?: boolean;
    smoke_detectors?: boolean;
    co_detectors?: boolean;
    gated_community?: boolean;
    home_business?: boolean;
    daycare?: boolean;
  };
  distance_to_fire_station?: number;
  distance_to_coast?: number;
  fire_protection_class?: string;
  flood_zone?: string;
}

interface CanopyClaim {
  id?: string;
  claim_number?: string;
  claim_date?: string;
  report_date?: string;
  close_date?: string;
  claim_type?: string;
  claim_category?: string;
  loss_type?: string;
  status?: string;
  amount_claimed?: number;
  amount_paid?: number;
  amount_reserved?: number;
  deductible_applied?: number;
  description?: string;
  at_fault?: boolean;
  subrogation?: boolean;
  catastrophe?: boolean;
  catastrophe_number?: string;
  claimant_name?: string;
  claimant_type?: string;
}

// Main handler that can be invoked directly or called from webhook
// API URL format: https://app.usecanopy.com/api/v1.0.0/teams/{teamId}/pulls/{pullId}
// Auth: x-canopy-client-id and x-canopy-client-secret headers (NOT Basic auth!)
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
    // Fetch from Canopy API with correct URL and auth headers
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

    const pullData: CanopyPullResponse = await response.json();
    console.log(`[Canopy Fetch] Retrieved ${pullData.policies?.length || 0} policies from API`);

    // Get or create our pull record
    let { data: existingPull } = await supabase
      .from('canopy_pulls')
      .select('id')
      .eq('canopy_pull_id', canopyPullId)
      .single();

    let pullId = existingPull?.id;

    if (!pullId) {
      const { data: newPull, error: createError } = await supabase
        .from('canopy_pulls')
        .insert({
          canopy_pull_id: canopyPullId,
          status: pullData.status === 'complete' ? 'complete' : 'processing',
          created_at: pullData.created_at || new Date().toISOString(),
          completed_at: pullData.completed_at,
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (createError) {
        console.error('[Canopy Fetch] Failed to create pull record:', createError);
        return { success: false, error: `Failed to create pull record: ${createError.message}` };
      }
      pullId = newPull.id;
    }

    const summary = {
      policies: 0,
      vehicles: 0,
      drivers: 0,
      dwellings: 0,
      claims: 0,
    };

    // Process each policy
    for (const policy of pullData.policies || []) {
      // Check if policy already exists (avoid duplicates)
      const { data: existingPolicy } = await supabase
        .from('canopy_policies')
        .select('id')
        .eq('canopy_policy_id', policy.id)
        .single();

      let policyId: string;

      if (existingPolicy) {
        // Update existing policy
        await supabase
          .from('canopy_policies')
          .update({
            carrier_name: policy.carrier.name,
            carrier_code: policy.carrier.code,
            carrier_naic_code: policy.carrier.naic_code,
            policy_number: policy.policy_number,
            policy_type: mapPolicyType(policy.policy_type),
            effective_date: policy.effective_date,
            expiration_date: policy.expiration_date,
            premium_amount: policy.premium?.amount,
            premium_frequency: mapPremiumFrequency(policy.premium?.frequency),
            status: mapPolicyStatus(policy.status),
            deductible: policy.deductible,
            coverage_limits: policy.coverage_limits || {},
            named_insureds: policy.named_insureds || [],
            additional_interests: policy.additional_interests || [],
            raw_data: policy,
          })
          .eq('id', existingPolicy.id);

        policyId = existingPolicy.id;
      } else {
        // Insert new policy
        const { data: newPolicy, error: policyError } = await supabase
          .from('canopy_policies')
          .insert({
            pull_id: pullId,
            canopy_policy_id: policy.id,
            carrier_name: policy.carrier.name,
            carrier_code: policy.carrier.code,
            carrier_naic_code: policy.carrier.naic_code,
            policy_number: policy.policy_number,
            policy_type: mapPolicyType(policy.policy_type),
            effective_date: policy.effective_date,
            expiration_date: policy.expiration_date,
            premium_amount: policy.premium?.amount,
            premium_frequency: mapPremiumFrequency(policy.premium?.frequency),
            status: mapPolicyStatus(policy.status),
            deductible: policy.deductible,
            coverage_limits: policy.coverage_limits || {},
            named_insureds: policy.named_insureds || [],
            additional_interests: policy.additional_interests || [],
            raw_data: policy,
          })
          .select('id')
          .single();

        if (policyError) {
          console.error('[Canopy Fetch] Failed to insert policy:', policyError);
          continue;
        }
        policyId = newPolicy.id;
      }

      summary.policies++;

      // Process vehicles
      for (const vehicle of policy.vehicles || []) {
        await upsertVehicle(supabase, policyId, vehicle);
        summary.vehicles++;
      }

      // Process drivers
      for (const driver of policy.drivers || []) {
        await upsertDriver(supabase, policyId, driver);
        summary.drivers++;
      }

      // Process dwellings
      for (const dwelling of policy.dwellings || []) {
        await upsertDwelling(supabase, policyId, dwelling);
        summary.dwellings++;
      }

      // Process claims
      for (const claim of policy.claims || []) {
        await upsertClaim(supabase, policyId, claim);
        summary.claims++;
      }
    }

    // Update pull record with counts
    await supabase
      .from('canopy_pulls')
      .update({
        status: pullData.status === 'complete' ? 'complete' : 'processing',
        policy_count: summary.policies,
        carrier_count: [...new Set((pullData.policies || []).map(p => p.carrier.name))].length,
        completed_at: pullData.completed_at || (pullData.status === 'complete' ? new Date().toISOString() : null),
        updated_at: new Date().toISOString(),
      })
      .eq('id', pullId);

    console.log(`[Canopy Fetch] Completed processing. Summary:`, summary);
    return { success: true, summary };

  } catch (error) {
    console.error('[Canopy Fetch] Error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Upsert helpers
async function upsertVehicle(supabase: ReturnType<typeof createClient>, policyId: string, vehicle: CanopyVehicle) {
  // Use VIN as unique identifier if available
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

  const vehicleData = {
    policy_id: policyId,
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
    uninsured_motorist: vehicle.coverages?.uninsured_motorist_bi,
    underinsured_motorist: vehicle.coverages?.underinsured_motorist_bi,
    medical_payments: vehicle.coverages?.medical_payments,
    rental_reimbursement: vehicle.coverages?.rental_reimbursement,
    towing_labor: vehicle.coverages?.towing_labor,
    coverages: vehicle.coverages || {},
  };

  if (existingId) {
    await supabase.from('canopy_vehicles').update(vehicleData).eq('id', existingId);
  } else {
    await supabase.from('canopy_vehicles').insert(vehicleData);
  }
}

async function upsertDriver(supabase: ReturnType<typeof createClient>, policyId: string, driver: CanopyDriver) {
  // Use license as unique identifier
  let existingId: string | null = null;

  if (driver.license?.number && driver.license?.state) {
    const { data: existing } = await supabase
      .from('canopy_drivers')
      .select('id')
      .eq('policy_id', policyId)
      .eq('license_number', driver.license.number)
      .eq('license_state', driver.license.state)
      .single();
    existingId = existing?.id;
  }

  const driverData = {
    policy_id: policyId,
    first_name: driver.first_name,
    last_name: driver.last_name,
    middle_name: driver.middle_name,
    suffix: driver.suffix,
    date_of_birth: driver.date_of_birth,
    gender: mapGender(driver.gender),
    marital_status: mapMaritalStatus(driver.marital_status),
    license_number: driver.license?.number,
    license_state: driver.license?.state,
    license_status: mapLicenseStatus(driver.license?.status),
    license_issue_date: driver.license?.issue_date,
    license_expiration_date: driver.license?.expiration_date,
    relation_to_insured: mapRelation(driver.relation_to_insured),
    is_primary: driver.is_primary || false,
    is_excluded: driver.is_excluded || false,
    sr22_required: driver.sr22_required || false,
    occupation: driver.occupation,
    education_level: driver.education_level,
    years_licensed: driver.years_licensed,
    violations: driver.violations || [],
    accidents: driver.accidents || [],
    claims: driver.claims || [],
  };

  if (existingId) {
    await supabase.from('canopy_drivers').update(driverData).eq('id', existingId);
  } else {
    await supabase.from('canopy_drivers').insert(driverData);
  }
}

async function upsertDwelling(supabase: ReturnType<typeof createClient>, policyId: string, dwelling: CanopyDwelling) {
  // Use address as unique identifier
  let existingId: string | null = null;

  if (dwelling.address?.street && dwelling.address?.zip) {
    const { data: existing } = await supabase
      .from('canopy_dwellings')
      .select('id')
      .eq('policy_id', policyId)
      .eq('address_line1', dwelling.address.street)
      .eq('zip', dwelling.address.zip)
      .single();
    existingId = existing?.id;
  }

  const dwellingData = {
    policy_id: policyId,
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
    gated_community: dwelling.features?.gated_community || false,
    raw_data: dwelling,
  };

  if (existingId) {
    await supabase.from('canopy_dwellings').update(dwellingData).eq('id', existingId);
  } else {
    await supabase.from('canopy_dwellings').insert(dwellingData);
  }
}

async function upsertClaim(supabase: ReturnType<typeof createClient>, policyId: string, claim: CanopyClaim) {
  // Use claim number as unique identifier
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
    raw_data: claim,
  };

  if (existingId) {
    await supabase.from('canopy_claims').update(claimData).eq('id', existingId);
  } else {
    await supabase.from('canopy_claims').insert(claimData);
  }
}

// Mapping helpers
function mapPolicyType(type: string | undefined): string {
  const typeMap: Record<string, string> = {
    'auto': 'auto',
    'automobile': 'auto',
    'personal_auto': 'auto',
    'car': 'auto',
    'home': 'home',
    'homeowners': 'home',
    'ho3': 'home',
    'ho5': 'home',
    'dwelling': 'home',
    'renters': 'renters',
    'renter': 'renters',
    'ho4': 'renters',
    'condo': 'condo',
    'condominium': 'condo',
    'ho6': 'condo',
    'umbrella': 'umbrella',
    'personal_umbrella': 'umbrella',
    'pup': 'umbrella',
    'life': 'life',
    'health': 'health',
  };
  return typeMap[type?.toLowerCase() || ''] || 'other';
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
    'in_force': 'active',
    'inforce': 'active',
    'cancelled': 'cancelled',
    'canceled': 'cancelled',
    'expired': 'expired',
    'pending': 'pending',
    'not_in_force': 'expired',
  };
  return statusMap[status.toLowerCase()] || 'unknown';
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
    'artisan': 'business',
  };
  return usageMap[usage.toLowerCase()] || 'other';
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
    'man': 'male',
    'f': 'female',
    'female': 'female',
    'woman': 'female',
    'x': 'other',
    'non-binary': 'other',
    'nonbinary': 'other',
  };
  return genderMap[gender.toLowerCase()] || 'unknown';
}

function mapMaritalStatus(status: string | undefined): string | null {
  if (!status) return null;
  const statusMap: Record<string, string> = {
    's': 'single',
    'single': 'single',
    'never_married': 'single',
    'm': 'married',
    'married': 'married',
    'd': 'divorced',
    'divorced': 'divorced',
    'w': 'widowed',
    'widowed': 'widowed',
    'domestic_partner': 'domestic_partner',
    'civil_union': 'domestic_partner',
    'separated': 'separated',
  };
  return statusMap[status.toLowerCase()] || 'unknown';
}

function mapLicenseStatus(status: string | undefined): string | null {
  if (!status) return null;
  const statusMap: Record<string, string> = {
    'valid': 'valid',
    'active': 'valid',
    'current': 'valid',
    'suspended': 'suspended',
    'revoked': 'revoked',
    'expired': 'expired',
    'permit': 'permit',
    'learner': 'permit',
    'learners': 'permit',
    'international': 'valid',
  };
  return statusMap[status.toLowerCase()] || 'unknown';
}

function mapRelation(relation: string | undefined): string | null {
  if (!relation) return null;
  const relationMap: Record<string, string> = {
    'self': 'self',
    'insured': 'self',
    'named_insured': 'self',
    'policyholder': 'self',
    'spouse': 'spouse',
    'husband': 'spouse',
    'wife': 'spouse',
    'partner': 'spouse',
    'child': 'child',
    'son': 'child',
    'daughter': 'child',
    'dependent': 'child',
    'parent': 'parent',
    'mother': 'parent',
    'father': 'parent',
    'other_relative': 'other_relative',
    'relative': 'other_relative',
    'sibling': 'other_relative',
    'brother': 'other_relative',
    'sister': 'other_relative',
    'employee': 'employee',
    'household_member': 'other',
    'non_relative': 'other',
  };
  return relationMap[relation.toLowerCase()] || 'other';
}

function mapPropertyType(type: string | undefined): string | null {
  if (!type) return null;
  const typeMap: Record<string, string> = {
    'single_family': 'single_family',
    'single': 'single_family',
    'house': 'single_family',
    'sfh': 'single_family',
    'condo': 'condo',
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
  return typeMap[type.toLowerCase()] || 'other';
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
    'active': 'open',
    'in_progress': 'open',
    'closed': 'closed',
    'settled': 'closed',
    'resolved': 'closed',
    'pending': 'pending',
    'under_review': 'pending',
    'denied': 'denied',
    'rejected': 'denied',
  };
  return statusMap[status.toLowerCase()] || 'unknown';
}

// HTTP handler for direct invocation
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
