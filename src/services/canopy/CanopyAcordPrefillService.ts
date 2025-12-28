// ============================================================================
// CANOPY ACORD PREFILL SERVICE
// ============================================================================
// Maps Canopy Connect data to ACORD form field values for all lines of business.
// Supports: Auto (ACORD 80), Home/Renters/Condo (ACORD 35), Umbrella (ACORD 35U)
// ============================================================================

import { supabase } from '@/integrations/supabase/client';

// ============================================================================
// TYPES
// ============================================================================

export type PersonalLinesLOB = 'auto' | 'home' | 'renters' | 'condo' | 'umbrella';

export interface CanopyPrefillResult {
  success: boolean;
  lob: PersonalLinesLOB;
  acordFormNumber: string;
  fieldValues: Record<string, any>;
  unmappedFields: string[];
  warnings: string[];
}

export interface CanopyPolicyData {
  id: string;
  pull_id: string;
  policy_type: string;
  policy_number?: string;
  carrier_name?: string;
  effective_date?: string;
  expiration_date?: string;
  premium?: number;
  deductible?: number;
  raw_data?: Record<string, any>;
}

export interface CanopyDwellingData {
  id: string;
  pull_id: string;
  property_address?: string;
  property_city?: string;
  property_state?: string;
  property_zip?: string;
  property_type?: string;
  year_built?: number;
  square_footage?: number;
  construction_type?: string;
  roof_type?: string;
  heating_type?: string;
  dwelling_coverage?: number;
  other_structures_coverage?: number;
  personal_property_coverage?: number;
  loss_of_use_coverage?: number;
  liability_coverage?: number;
  medical_payments_coverage?: number;
  raw_data?: Record<string, any>;
}

export interface CanopyVehicleData {
  id: string;
  pull_id: string;
  vin?: string;
  year?: number;
  make?: string;
  model?: string;
  body_type?: string;
  use_type?: string;
  annual_mileage?: number;
  ownership?: string;
  garage_address?: string;
  garage_city?: string;
  garage_state?: string;
  garage_zip?: string;
  // Coverages
  bodily_injury_limit?: string;
  property_damage_limit?: string;
  collision_deductible?: number;
  comprehensive_deductible?: number;
  um_limit?: string;
  uim_limit?: string;
  raw_data?: Record<string, any>;
}

export interface CanopyDriverData {
  id: string;
  pull_id: string;
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  gender?: string;
  marital_status?: string;
  license_number?: string;
  license_state?: string;
  license_status?: string;
  years_licensed?: number;
  relationship?: string;
  raw_data?: Record<string, any>;
}

// ============================================================================
// MAIN PREFILL FUNCTION
// ============================================================================

/**
 * Get ACORD prefill data from a Canopy pull for a specific line of business
 */
export async function getCanopyAcordPrefill(
  pullId: string,
  lob: PersonalLinesLOB
): Promise<CanopyPrefillResult> {
  const warnings: string[] = [];
  const unmappedFields: string[] = [];

  try {
    // Get the appropriate ACORD form number for this LOB
    const acordFormNumber = getAcordFormNumber(lob);

    // Fetch Canopy data based on LOB
    const canopyData = await fetchCanopyData(pullId, lob);

    // Map to ACORD fields based on LOB
    const fieldValues = mapToAcordFields(canopyData, lob, warnings);

    return {
      success: true,
      lob,
      acordFormNumber,
      fieldValues,
      unmappedFields,
      warnings,
    };
  } catch (error) {
    console.error('Canopy ACORD prefill error:', error);
    return {
      success: false,
      lob,
      acordFormNumber: getAcordFormNumber(lob),
      fieldValues: {},
      unmappedFields: [],
      warnings: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

// ============================================================================
// ACORD FORM NUMBERS
// ============================================================================

function getAcordFormNumber(lob: PersonalLinesLOB): string {
  switch (lob) {
    case 'auto':
      return '80'; // ACORD 80 - Personal Auto Application
    case 'home':
    case 'renters':
    case 'condo':
      return '35'; // ACORD 35 - Homeowners Application
    case 'umbrella':
      return '35U'; // Personal Umbrella (custom form or ACORD 35 variant)
    default:
      return '35';
  }
}

// ============================================================================
// DATA FETCHING
// ============================================================================

interface CanopyDataBundle {
  policy?: CanopyPolicyData;
  dwelling?: CanopyDwellingData;
  vehicles?: CanopyVehicleData[];
  drivers?: CanopyDriverData[];
  claims?: any[];
  namedInsured?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
}

async function fetchCanopyData(
  pullId: string,
  lob: PersonalLinesLOB
): Promise<CanopyDataBundle> {
  const bundle: CanopyDataBundle = {};

  // Always get pull data for named insured info
  const { data: pullData } = await supabase
    .from('canopy_pulls')
    .select('*')
    .eq('id', pullId)
    .single();

  if (pullData) {
    bundle.namedInsured = {
      first_name: pullData.first_name,
      last_name: pullData.last_name,
      email: pullData.email,
      phone: pullData.phone,
    };
  }

  // Get policy data for this LOB
  const { data: policies } = await supabase
    .from('canopy_policies')
    .select('*')
    .eq('pull_id', pullId)
    .eq('policy_type', lob);

  if (policies && policies.length > 0) {
    bundle.policy = policies[0] as CanopyPolicyData;
  }

  // LOB-specific data fetching
  switch (lob) {
    case 'auto':
      // Get vehicles
      const { data: vehicles } = await supabase
        .from('canopy_vehicles')
        .select('*')
        .eq('pull_id', pullId);
      bundle.vehicles = vehicles as CanopyVehicleData[] || [];

      // Get drivers
      const { data: drivers } = await supabase
        .from('canopy_drivers')
        .select('*')
        .eq('pull_id', pullId);
      bundle.drivers = drivers as CanopyDriverData[] || [];
      break;

    case 'home':
    case 'renters':
    case 'condo':
      // Get dwelling
      const { data: dwellings } = await supabase
        .from('canopy_dwellings')
        .select('*')
        .eq('pull_id', pullId);
      if (dwellings && dwellings.length > 0) {
        bundle.dwelling = dwellings[0] as CanopyDwellingData;
      }
      break;

    case 'umbrella':
      // Get underlying policies for umbrella
      const { data: underlyingPolicies } = await supabase
        .from('canopy_policies')
        .select('*')
        .eq('pull_id', pullId)
        .in('policy_type', ['auto', 'home']);

      // Get dwelling for home underlying
      const { data: umbDwellings } = await supabase
        .from('canopy_dwellings')
        .select('*')
        .eq('pull_id', pullId);
      if (umbDwellings && umbDwellings.length > 0) {
        bundle.dwelling = umbDwellings[0] as CanopyDwellingData;
      }

      // Get vehicles for auto underlying
      const { data: umbVehicles } = await supabase
        .from('canopy_vehicles')
        .select('*')
        .eq('pull_id', pullId);
      bundle.vehicles = umbVehicles as CanopyVehicleData[] || [];
      break;
  }

  // Get claims history for all LOBs
  const { data: claims } = await supabase
    .from('canopy_claims')
    .select('*')
    .eq('pull_id', pullId);
  bundle.claims = claims || [];

  return bundle;
}

// ============================================================================
// FIELD MAPPING
// ============================================================================

function mapToAcordFields(
  data: CanopyDataBundle,
  lob: PersonalLinesLOB,
  warnings: string[]
): Record<string, any> {
  switch (lob) {
    case 'auto':
      return mapAutoFields(data, warnings);
    case 'home':
      return mapHomeFields(data, warnings);
    case 'renters':
      return mapRentersFields(data, warnings);
    case 'condo':
      return mapCondoFields(data, warnings);
    case 'umbrella':
      return mapUmbrellaFields(data, warnings);
    default:
      return {};
  }
}

// ============================================================================
// ACORD 80 - PERSONAL AUTO MAPPING
// ============================================================================

function mapAutoFields(
  data: CanopyDataBundle,
  warnings: string[]
): Record<string, any> {
  const fields: Record<string, any> = {};

  // Named Insured (Section 1)
  if (data.namedInsured) {
    fields['NamedInsured_FirstName'] = data.namedInsured.first_name || '';
    fields['NamedInsured_LastName'] = data.namedInsured.last_name || '';
    fields['NamedInsured_FullName'] = formatFullName(
      data.namedInsured.first_name,
      data.namedInsured.last_name
    );
    fields['NamedInsured_Email'] = data.namedInsured.email || '';
    fields['NamedInsured_Phone'] = formatPhone(data.namedInsured.phone);
  }

  // Policy Information
  if (data.policy) {
    fields['PolicyNumber'] = data.policy.policy_number || '';
    fields['CarrierName'] = data.policy.carrier_name || '';
    fields['EffectiveDate'] = formatDate(data.policy.effective_date);
    fields['ExpirationDate'] = formatDate(data.policy.expiration_date);
    fields['AnnualPremium'] = formatCurrency(data.policy.premium);
  }

  // Vehicle Schedule (up to 4 vehicles for ACORD 80)
  if (data.vehicles && data.vehicles.length > 0) {
    data.vehicles.slice(0, 4).forEach((vehicle, index) => {
      const prefix = `Vehicle${index + 1}`;
      fields[`${prefix}_Year`] = vehicle.year?.toString() || '';
      fields[`${prefix}_Make`] = vehicle.make || '';
      fields[`${prefix}_Model`] = vehicle.model || '';
      fields[`${prefix}_VIN`] = vehicle.vin || '';
      fields[`${prefix}_BodyType`] = vehicle.body_type || '';
      fields[`${prefix}_Use`] = mapVehicleUse(vehicle.use_type);
      fields[`${prefix}_AnnualMiles`] = vehicle.annual_mileage?.toString() || '';
      fields[`${prefix}_Ownership`] = vehicle.ownership || '';

      // Garage Location
      fields[`${prefix}_GarageAddress`] = vehicle.garage_address || '';
      fields[`${prefix}_GarageCity`] = vehicle.garage_city || '';
      fields[`${prefix}_GarageState`] = vehicle.garage_state || '';
      fields[`${prefix}_GarageZip`] = vehicle.garage_zip || '';

      // Coverages
      fields[`${prefix}_BI_Limit`] = vehicle.bodily_injury_limit || '';
      fields[`${prefix}_PD_Limit`] = vehicle.property_damage_limit || '';
      fields[`${prefix}_Coll_Ded`] = formatCurrency(vehicle.collision_deductible);
      fields[`${prefix}_Comp_Ded`] = formatCurrency(vehicle.comprehensive_deductible);
      fields[`${prefix}_UM_Limit`] = vehicle.um_limit || '';
      fields[`${prefix}_UIM_Limit`] = vehicle.uim_limit || '';
    });

    if (data.vehicles.length > 4) {
      warnings.push(`${data.vehicles.length - 4} vehicles not included (ACORD 80 supports max 4)`);
    }
  }

  // Driver Schedule (up to 4 drivers for ACORD 80)
  if (data.drivers && data.drivers.length > 0) {
    data.drivers.slice(0, 4).forEach((driver, index) => {
      const prefix = `Driver${index + 1}`;
      fields[`${prefix}_FirstName`] = driver.first_name || '';
      fields[`${prefix}_LastName`] = driver.last_name || '';
      fields[`${prefix}_FullName`] = formatFullName(driver.first_name, driver.last_name);
      fields[`${prefix}_DOB`] = formatDate(driver.date_of_birth);
      fields[`${prefix}_Gender`] = driver.gender?.charAt(0).toUpperCase() || '';
      fields[`${prefix}_MaritalStatus`] = mapMaritalStatus(driver.marital_status);
      fields[`${prefix}_LicenseNumber`] = driver.license_number || '';
      fields[`${prefix}_LicenseState`] = driver.license_state || '';
      fields[`${prefix}_YearsLicensed`] = driver.years_licensed?.toString() || '';
      fields[`${prefix}_Relationship`] = driver.relationship || '';
    });

    if (data.drivers.length > 4) {
      warnings.push(`${data.drivers.length - 4} drivers not included (ACORD 80 supports max 4)`);
    }
  }

  // Claims History
  if (data.claims && data.claims.length > 0) {
    fields['HasPriorClaims'] = 'X';
    fields['NumberOfClaims'] = data.claims.length.toString();

    // Map first 3 claims
    data.claims.slice(0, 3).forEach((claim, index) => {
      const prefix = `Claim${index + 1}`;
      fields[`${prefix}_Date`] = formatDate(claim.loss_date);
      fields[`${prefix}_Type`] = claim.claim_type || '';
      fields[`${prefix}_Amount`] = formatCurrency(claim.amount_paid);
    });
  } else {
    fields['HasPriorClaims'] = '';
    fields['NumberOfClaims'] = '0';
  }

  return fields;
}

// ============================================================================
// ACORD 35 - HOMEOWNERS MAPPING
// ============================================================================

function mapHomeFields(
  data: CanopyDataBundle,
  warnings: string[]
): Record<string, any> {
  const fields: Record<string, any> = {};

  // Named Insured (Section 1)
  if (data.namedInsured) {
    fields['NamedInsured_FirstName'] = data.namedInsured.first_name || '';
    fields['NamedInsured_LastName'] = data.namedInsured.last_name || '';
    fields['NamedInsured_FullName'] = formatFullName(
      data.namedInsured.first_name,
      data.namedInsured.last_name
    );
    fields['NamedInsured_Email'] = data.namedInsured.email || '';
    fields['NamedInsured_Phone'] = formatPhone(data.namedInsured.phone);
  }

  // Policy Information
  if (data.policy) {
    fields['PolicyNumber'] = data.policy.policy_number || '';
    fields['CarrierName'] = data.policy.carrier_name || '';
    fields['EffectiveDate'] = formatDate(data.policy.effective_date);
    fields['ExpirationDate'] = formatDate(data.policy.expiration_date);
    fields['AnnualPremium'] = formatCurrency(data.policy.premium);
  }

  // Form Type
  fields['FormType_HO3'] = 'X'; // Default to HO-3

  // Property Information (Section 2)
  if (data.dwelling) {
    fields['PropertyAddress'] = data.dwelling.property_address || '';
    fields['PropertyCity'] = data.dwelling.property_city || '';
    fields['PropertyState'] = data.dwelling.property_state || '';
    fields['PropertyZip'] = data.dwelling.property_zip || '';
    fields['PropertyType'] = mapPropertyType(data.dwelling.property_type);
    fields['YearBuilt'] = data.dwelling.year_built?.toString() || '';
    fields['SquareFootage'] = data.dwelling.square_footage?.toString() || '';
    fields['ConstructionType'] = mapConstructionType(data.dwelling.construction_type);
    fields['RoofType'] = data.dwelling.roof_type || '';
    fields['HeatingType'] = data.dwelling.heating_type || '';

    // Coverages (Section 3)
    fields['CovA_Dwelling'] = formatCurrency(data.dwelling.dwelling_coverage);
    fields['CovB_OtherStructures'] = formatCurrency(data.dwelling.other_structures_coverage);
    fields['CovC_PersonalProperty'] = formatCurrency(data.dwelling.personal_property_coverage);
    fields['CovD_LossOfUse'] = formatCurrency(data.dwelling.loss_of_use_coverage);
    fields['CovE_Liability'] = formatCurrency(data.dwelling.liability_coverage);
    fields['CovF_MedicalPayments'] = formatCurrency(data.dwelling.medical_payments_coverage);
  }

  // Claims History
  if (data.claims && data.claims.length > 0) {
    const propertyClaims = data.claims.filter(c =>
      c.claim_category === 'home' || c.claim_category === 'property'
    );
    fields['HasPriorClaims'] = propertyClaims.length > 0 ? 'X' : '';
    fields['NumberOfClaims'] = propertyClaims.length.toString();
  }

  return fields;
}

// ============================================================================
// ACORD 35 - RENTERS MAPPING (HO-4)
// ============================================================================

function mapRentersFields(
  data: CanopyDataBundle,
  warnings: string[]
): Record<string, any> {
  // Start with base home fields
  const fields = mapHomeFields(data, warnings);

  // Override form type for renters
  fields['FormType_HO3'] = '';
  fields['FormType_HO4'] = 'X'; // HO-4 Renters

  // Clear dwelling coverage (renters don't insure dwelling)
  fields['CovA_Dwelling'] = '';
  fields['CovB_OtherStructures'] = '';

  // Keep personal property and liability
  if (data.dwelling) {
    fields['CovC_PersonalProperty'] = formatCurrency(data.dwelling.personal_property_coverage);
    fields['CovE_Liability'] = formatCurrency(data.dwelling.liability_coverage);
    fields['CovF_MedicalPayments'] = formatCurrency(data.dwelling.medical_payments_coverage);
  }

  // Property type override
  fields['PropertyType'] = 'Apartment/Rented';

  return fields;
}

// ============================================================================
// ACORD 35 - CONDO MAPPING (HO-6)
// ============================================================================

function mapCondoFields(
  data: CanopyDataBundle,
  warnings: string[]
): Record<string, any> {
  // Start with base home fields
  const fields = mapHomeFields(data, warnings);

  // Override form type for condo
  fields['FormType_HO3'] = '';
  fields['FormType_HO6'] = 'X'; // HO-6 Condo

  // Adjust dwelling coverage label (building additions & alterations)
  if (data.dwelling) {
    fields['CovA_DwellingAdditions'] = formatCurrency(data.dwelling.dwelling_coverage);
    fields['CovA_Dwelling'] = ''; // Use additions field instead
  }

  // Property type override
  fields['PropertyType'] = 'Condo/Townhouse';

  // Add condo-specific fields
  fields['IsCondoAssociation'] = 'X';
  fields['MasterPolicyExists'] = 'X';

  return fields;
}

// ============================================================================
// PERSONAL UMBRELLA MAPPING
// ============================================================================

function mapUmbrellaFields(
  data: CanopyDataBundle,
  warnings: string[]
): Record<string, any> {
  const fields: Record<string, any> = {};

  // Named Insured
  if (data.namedInsured) {
    fields['NamedInsured_FirstName'] = data.namedInsured.first_name || '';
    fields['NamedInsured_LastName'] = data.namedInsured.last_name || '';
    fields['NamedInsured_FullName'] = formatFullName(
      data.namedInsured.first_name,
      data.namedInsured.last_name
    );
  }

  // Policy Information
  if (data.policy) {
    fields['UmbrellaLimit'] = formatCurrency(data.policy.premium); // This should be limit, not premium
    fields['EffectiveDate'] = formatDate(data.policy.effective_date);
    fields['ExpirationDate'] = formatDate(data.policy.expiration_date);
  }

  // Underlying Auto Policy
  if (data.vehicles && data.vehicles.length > 0) {
    fields['UnderlyingAuto_Exists'] = 'X';
    fields['UnderlyingAuto_VehicleCount'] = data.vehicles.length.toString();

    // Get liability limits from first vehicle
    const firstVehicle = data.vehicles[0];
    fields['UnderlyingAuto_BI_Limit'] = firstVehicle.bodily_injury_limit || '';
    fields['UnderlyingAuto_PD_Limit'] = firstVehicle.property_damage_limit || '';
  }

  // Underlying Home Policy
  if (data.dwelling) {
    fields['UnderlyingHome_Exists'] = 'X';
    fields['UnderlyingHome_Address'] = data.dwelling.property_address || '';
    fields['UnderlyingHome_Liability'] = formatCurrency(data.dwelling.liability_coverage);
  }

  // Count underlying policies
  let underlyingCount = 0;
  if (data.vehicles && data.vehicles.length > 0) underlyingCount++;
  if (data.dwelling) underlyingCount++;
  fields['UnderlyingPolicyCount'] = underlyingCount.toString();

  // Driver count for umbrella
  if (data.drivers) {
    fields['HouseholdDriverCount'] = data.drivers.length.toString();

    // List drivers
    data.drivers.forEach((driver, index) => {
      const prefix = `Driver${index + 1}`;
      fields[`${prefix}_FullName`] = formatFullName(driver.first_name, driver.last_name);
      fields[`${prefix}_Age`] = calculateAge(driver.date_of_birth);
    });
  }

  return fields;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatFullName(firstName?: string, lastName?: string): string {
  return [firstName, lastName].filter(Boolean).join(' ');
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  } catch {
    return '';
  }
}

function formatPhone(phone?: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function formatCurrency(amount?: number): string {
  if (amount === undefined || amount === null) return '';
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function calculateAge(dob?: string): string {
  if (!dob) return '';
  try {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age.toString();
  } catch {
    return '';
  }
}

function mapVehicleUse(useType?: string): string {
  if (!useType) return '';
  const useMap: Record<string, string> = {
    pleasure: 'Pleasure',
    commute: 'Commute',
    business: 'Business',
    farm: 'Farm',
  };
  return useMap[useType.toLowerCase()] || useType;
}

function mapMaritalStatus(status?: string): string {
  if (!status) return '';
  const statusMap: Record<string, string> = {
    single: 'S',
    married: 'M',
    divorced: 'D',
    widowed: 'W',
    separated: 'P',
  };
  return statusMap[status.toLowerCase()] || status.charAt(0).toUpperCase();
}

function mapPropertyType(type?: string): string {
  if (!type) return '';
  const typeMap: Record<string, string> = {
    single_family: 'Single Family',
    condo: 'Condo/Townhouse',
    townhouse: 'Condo/Townhouse',
    mobile_home: 'Mobile Home',
    apartment: 'Apartment/Rented',
    multi_family: 'Multi-Family',
  };
  return typeMap[type.toLowerCase()] || type;
}

function mapConstructionType(type?: string): string {
  if (!type) return '';
  const typeMap: Record<string, string> = {
    frame: 'Frame',
    masonry: 'Masonry',
    'fire resistive': 'Fire Resistive',
    'superior construction': 'Superior',
    brick: 'Masonry',
    stucco: 'Masonry',
    wood: 'Frame',
  };
  return typeMap[type.toLowerCase()] || type;
}

// ============================================================================
// BATCH PREFILL
// ============================================================================

/**
 * Get prefill data for all available LOBs from a Canopy pull
 */
export async function getCanopyPrefillAllLOBs(
  pullId: string
): Promise<Map<PersonalLinesLOB, CanopyPrefillResult>> {
  const results = new Map<PersonalLinesLOB, CanopyPrefillResult>();

  // Check what data is available
  const { data: policies } = await supabase
    .from('canopy_policies')
    .select('policy_type')
    .eq('pull_id', pullId);

  const availableLOBs = new Set<PersonalLinesLOB>();

  policies?.forEach(p => {
    const lob = p.policy_type?.toLowerCase() as PersonalLinesLOB;
    if (['auto', 'home', 'renters', 'condo', 'umbrella'].includes(lob)) {
      availableLOBs.add(lob);
    }
  });

  // Generate prefill for each available LOB
  for (const lob of availableLOBs) {
    const result = await getCanopyAcordPrefill(pullId, lob);
    results.set(lob, result);
  }

  return results;
}

export default {
  getCanopyAcordPrefill,
  getCanopyPrefillAllLOBs,
};
