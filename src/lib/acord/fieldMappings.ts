// ============================================================================
// ACORD FORM FIELD MAPPINGS
// ============================================================================
// Standard field definitions for common ACORD forms used with Canopy prefill.
// These mappings define the field names, types, and sections for each form.
// ============================================================================

// ============================================================================
// TYPES
// ============================================================================

export interface AcordFieldDefinition {
  fieldName: string;
  label: string;
  type: 'text' | 'checkbox' | 'date' | 'currency' | 'phone' | 'number';
  section: string;
  required: boolean;
  maxLength?: number;
  canopyPath?: string; // Path in Canopy data structure
}

export interface AcordFormMapping {
  formNumber: string;
  formName: string;
  version: string;
  applicableLOBs: string[];
  fields: AcordFieldDefinition[];
}

// ============================================================================
// ACORD 80 - PERSONAL AUTO APPLICATION
// ============================================================================

export const ACORD_80_FIELDS: AcordFieldDefinition[] = [
  // Section 1: Named Insured
  { fieldName: 'NamedInsured_FirstName', label: 'First Name', type: 'text', section: 'Named Insured', required: true, canopyPath: 'pull.first_name' },
  { fieldName: 'NamedInsured_LastName', label: 'Last Name', type: 'text', section: 'Named Insured', required: true, canopyPath: 'pull.last_name' },
  { fieldName: 'NamedInsured_FullName', label: 'Full Name', type: 'text', section: 'Named Insured', required: true },
  { fieldName: 'NamedInsured_Address', label: 'Mailing Address', type: 'text', section: 'Named Insured', required: true },
  { fieldName: 'NamedInsured_City', label: 'City', type: 'text', section: 'Named Insured', required: true },
  { fieldName: 'NamedInsured_State', label: 'State', type: 'text', section: 'Named Insured', required: true, maxLength: 2 },
  { fieldName: 'NamedInsured_Zip', label: 'ZIP Code', type: 'text', section: 'Named Insured', required: true, maxLength: 10 },
  { fieldName: 'NamedInsured_Phone', label: 'Phone', type: 'phone', section: 'Named Insured', required: false },
  { fieldName: 'NamedInsured_Email', label: 'Email', type: 'text', section: 'Named Insured', required: false },
  { fieldName: 'NamedInsured_DOB', label: 'Date of Birth', type: 'date', section: 'Named Insured', required: false },

  // Section 2: Policy Information
  { fieldName: 'PolicyNumber', label: 'Policy Number', type: 'text', section: 'Policy Info', required: false, canopyPath: 'policy.policy_number' },
  { fieldName: 'CarrierName', label: 'Insurance Company', type: 'text', section: 'Policy Info', required: false, canopyPath: 'policy.carrier_name' },
  { fieldName: 'EffectiveDate', label: 'Effective Date', type: 'date', section: 'Policy Info', required: true, canopyPath: 'policy.effective_date' },
  { fieldName: 'ExpirationDate', label: 'Expiration Date', type: 'date', section: 'Policy Info', required: true, canopyPath: 'policy.expiration_date' },
  { fieldName: 'AnnualPremium', label: 'Annual Premium', type: 'currency', section: 'Policy Info', required: false, canopyPath: 'policy.premium' },

  // Section 3: Vehicle 1
  { fieldName: 'Vehicle1_Year', label: 'Year', type: 'number', section: 'Vehicle 1', required: true, canopyPath: 'vehicles[0].year' },
  { fieldName: 'Vehicle1_Make', label: 'Make', type: 'text', section: 'Vehicle 1', required: true, canopyPath: 'vehicles[0].make' },
  { fieldName: 'Vehicle1_Model', label: 'Model', type: 'text', section: 'Vehicle 1', required: true, canopyPath: 'vehicles[0].model' },
  { fieldName: 'Vehicle1_VIN', label: 'VIN', type: 'text', section: 'Vehicle 1', required: true, maxLength: 17, canopyPath: 'vehicles[0].vin' },
  { fieldName: 'Vehicle1_BodyType', label: 'Body Type', type: 'text', section: 'Vehicle 1', required: false, canopyPath: 'vehicles[0].body_type' },
  { fieldName: 'Vehicle1_Use', label: 'Use', type: 'text', section: 'Vehicle 1', required: false, canopyPath: 'vehicles[0].use_type' },
  { fieldName: 'Vehicle1_AnnualMiles', label: 'Annual Miles', type: 'number', section: 'Vehicle 1', required: false, canopyPath: 'vehicles[0].annual_mileage' },
  { fieldName: 'Vehicle1_GarageAddress', label: 'Garage Address', type: 'text', section: 'Vehicle 1', required: false },
  { fieldName: 'Vehicle1_GarageCity', label: 'Garage City', type: 'text', section: 'Vehicle 1', required: false },
  { fieldName: 'Vehicle1_GarageState', label: 'Garage State', type: 'text', section: 'Vehicle 1', required: false, maxLength: 2 },
  { fieldName: 'Vehicle1_GarageZip', label: 'Garage ZIP', type: 'text', section: 'Vehicle 1', required: false, maxLength: 10 },
  { fieldName: 'Vehicle1_BI_Limit', label: 'BI Limit', type: 'text', section: 'Vehicle 1 Coverage', required: false },
  { fieldName: 'Vehicle1_PD_Limit', label: 'PD Limit', type: 'text', section: 'Vehicle 1 Coverage', required: false },
  { fieldName: 'Vehicle1_Coll_Ded', label: 'Collision Deductible', type: 'currency', section: 'Vehicle 1 Coverage', required: false },
  { fieldName: 'Vehicle1_Comp_Ded', label: 'Comprehensive Deductible', type: 'currency', section: 'Vehicle 1 Coverage', required: false },
  { fieldName: 'Vehicle1_UM_Limit', label: 'UM Limit', type: 'text', section: 'Vehicle 1 Coverage', required: false },
  { fieldName: 'Vehicle1_UIM_Limit', label: 'UIM Limit', type: 'text', section: 'Vehicle 1 Coverage', required: false },

  // Section 4: Vehicle 2-4 (same pattern)
  { fieldName: 'Vehicle2_Year', label: 'Year', type: 'number', section: 'Vehicle 2', required: false },
  { fieldName: 'Vehicle2_Make', label: 'Make', type: 'text', section: 'Vehicle 2', required: false },
  { fieldName: 'Vehicle2_Model', label: 'Model', type: 'text', section: 'Vehicle 2', required: false },
  { fieldName: 'Vehicle2_VIN', label: 'VIN', type: 'text', section: 'Vehicle 2', required: false, maxLength: 17 },

  { fieldName: 'Vehicle3_Year', label: 'Year', type: 'number', section: 'Vehicle 3', required: false },
  { fieldName: 'Vehicle3_Make', label: 'Make', type: 'text', section: 'Vehicle 3', required: false },
  { fieldName: 'Vehicle3_Model', label: 'Model', type: 'text', section: 'Vehicle 3', required: false },
  { fieldName: 'Vehicle3_VIN', label: 'VIN', type: 'text', section: 'Vehicle 3', required: false, maxLength: 17 },

  { fieldName: 'Vehicle4_Year', label: 'Year', type: 'number', section: 'Vehicle 4', required: false },
  { fieldName: 'Vehicle4_Make', label: 'Make', type: 'text', section: 'Vehicle 4', required: false },
  { fieldName: 'Vehicle4_Model', label: 'Model', type: 'text', section: 'Vehicle 4', required: false },
  { fieldName: 'Vehicle4_VIN', label: 'VIN', type: 'text', section: 'Vehicle 4', required: false, maxLength: 17 },

  // Section 5: Driver 1
  { fieldName: 'Driver1_FirstName', label: 'First Name', type: 'text', section: 'Driver 1', required: true, canopyPath: 'drivers[0].first_name' },
  { fieldName: 'Driver1_LastName', label: 'Last Name', type: 'text', section: 'Driver 1', required: true, canopyPath: 'drivers[0].last_name' },
  { fieldName: 'Driver1_FullName', label: 'Full Name', type: 'text', section: 'Driver 1', required: false },
  { fieldName: 'Driver1_DOB', label: 'Date of Birth', type: 'date', section: 'Driver 1', required: true, canopyPath: 'drivers[0].date_of_birth' },
  { fieldName: 'Driver1_Gender', label: 'Gender', type: 'text', section: 'Driver 1', required: false, maxLength: 1, canopyPath: 'drivers[0].gender' },
  { fieldName: 'Driver1_MaritalStatus', label: 'Marital Status', type: 'text', section: 'Driver 1', required: false, maxLength: 1 },
  { fieldName: 'Driver1_LicenseNumber', label: 'License Number', type: 'text', section: 'Driver 1', required: true, canopyPath: 'drivers[0].license_number' },
  { fieldName: 'Driver1_LicenseState', label: 'License State', type: 'text', section: 'Driver 1', required: true, maxLength: 2, canopyPath: 'drivers[0].license_state' },
  { fieldName: 'Driver1_YearsLicensed', label: 'Years Licensed', type: 'number', section: 'Driver 1', required: false, canopyPath: 'drivers[0].years_licensed' },
  { fieldName: 'Driver1_Relationship', label: 'Relationship', type: 'text', section: 'Driver 1', required: false, canopyPath: 'drivers[0].relationship' },

  // Driver 2-4 (abbreviated)
  { fieldName: 'Driver2_FirstName', label: 'First Name', type: 'text', section: 'Driver 2', required: false },
  { fieldName: 'Driver2_LastName', label: 'Last Name', type: 'text', section: 'Driver 2', required: false },
  { fieldName: 'Driver2_DOB', label: 'Date of Birth', type: 'date', section: 'Driver 2', required: false },
  { fieldName: 'Driver2_LicenseNumber', label: 'License Number', type: 'text', section: 'Driver 2', required: false },
  { fieldName: 'Driver2_LicenseState', label: 'License State', type: 'text', section: 'Driver 2', required: false, maxLength: 2 },

  { fieldName: 'Driver3_FirstName', label: 'First Name', type: 'text', section: 'Driver 3', required: false },
  { fieldName: 'Driver3_LastName', label: 'Last Name', type: 'text', section: 'Driver 3', required: false },
  { fieldName: 'Driver3_DOB', label: 'Date of Birth', type: 'date', section: 'Driver 3', required: false },

  { fieldName: 'Driver4_FirstName', label: 'First Name', type: 'text', section: 'Driver 4', required: false },
  { fieldName: 'Driver4_LastName', label: 'Last Name', type: 'text', section: 'Driver 4', required: false },
  { fieldName: 'Driver4_DOB', label: 'Date of Birth', type: 'date', section: 'Driver 4', required: false },

  // Claims History
  { fieldName: 'HasPriorClaims', label: 'Prior Claims', type: 'checkbox', section: 'Claims', required: false },
  { fieldName: 'NumberOfClaims', label: 'Number of Claims', type: 'number', section: 'Claims', required: false },
  { fieldName: 'Claim1_Date', label: 'Claim 1 Date', type: 'date', section: 'Claims', required: false },
  { fieldName: 'Claim1_Type', label: 'Claim 1 Type', type: 'text', section: 'Claims', required: false },
  { fieldName: 'Claim1_Amount', label: 'Claim 1 Amount', type: 'currency', section: 'Claims', required: false },
];

// ============================================================================
// ACORD 35 - HOMEOWNERS APPLICATION
// ============================================================================

export const ACORD_35_FIELDS: AcordFieldDefinition[] = [
  // Section 1: Named Insured
  { fieldName: 'NamedInsured_FirstName', label: 'First Name', type: 'text', section: 'Named Insured', required: true },
  { fieldName: 'NamedInsured_LastName', label: 'Last Name', type: 'text', section: 'Named Insured', required: true },
  { fieldName: 'NamedInsured_FullName', label: 'Full Name', type: 'text', section: 'Named Insured', required: true },
  { fieldName: 'NamedInsured_Address', label: 'Mailing Address', type: 'text', section: 'Named Insured', required: true },
  { fieldName: 'NamedInsured_City', label: 'City', type: 'text', section: 'Named Insured', required: true },
  { fieldName: 'NamedInsured_State', label: 'State', type: 'text', section: 'Named Insured', required: true, maxLength: 2 },
  { fieldName: 'NamedInsured_Zip', label: 'ZIP Code', type: 'text', section: 'Named Insured', required: true, maxLength: 10 },
  { fieldName: 'NamedInsured_Phone', label: 'Phone', type: 'phone', section: 'Named Insured', required: false },
  { fieldName: 'NamedInsured_Email', label: 'Email', type: 'text', section: 'Named Insured', required: false },

  // Section 2: Policy Information
  { fieldName: 'PolicyNumber', label: 'Policy Number', type: 'text', section: 'Policy Info', required: false },
  { fieldName: 'CarrierName', label: 'Insurance Company', type: 'text', section: 'Policy Info', required: false },
  { fieldName: 'EffectiveDate', label: 'Effective Date', type: 'date', section: 'Policy Info', required: true },
  { fieldName: 'ExpirationDate', label: 'Expiration Date', type: 'date', section: 'Policy Info', required: true },
  { fieldName: 'AnnualPremium', label: 'Annual Premium', type: 'currency', section: 'Policy Info', required: false },

  // Form Type Checkboxes
  { fieldName: 'FormType_HO1', label: 'HO-1', type: 'checkbox', section: 'Form Type', required: false },
  { fieldName: 'FormType_HO2', label: 'HO-2', type: 'checkbox', section: 'Form Type', required: false },
  { fieldName: 'FormType_HO3', label: 'HO-3', type: 'checkbox', section: 'Form Type', required: false },
  { fieldName: 'FormType_HO4', label: 'HO-4 (Renters)', type: 'checkbox', section: 'Form Type', required: false },
  { fieldName: 'FormType_HO5', label: 'HO-5', type: 'checkbox', section: 'Form Type', required: false },
  { fieldName: 'FormType_HO6', label: 'HO-6 (Condo)', type: 'checkbox', section: 'Form Type', required: false },
  { fieldName: 'FormType_HO8', label: 'HO-8', type: 'checkbox', section: 'Form Type', required: false },

  // Section 3: Property Information
  { fieldName: 'PropertyAddress', label: 'Property Address', type: 'text', section: 'Property', required: true, canopyPath: 'dwelling.property_address' },
  { fieldName: 'PropertyCity', label: 'City', type: 'text', section: 'Property', required: true, canopyPath: 'dwelling.property_city' },
  { fieldName: 'PropertyState', label: 'State', type: 'text', section: 'Property', required: true, maxLength: 2, canopyPath: 'dwelling.property_state' },
  { fieldName: 'PropertyZip', label: 'ZIP Code', type: 'text', section: 'Property', required: true, maxLength: 10, canopyPath: 'dwelling.property_zip' },
  { fieldName: 'PropertyType', label: 'Property Type', type: 'text', section: 'Property', required: true, canopyPath: 'dwelling.property_type' },
  { fieldName: 'YearBuilt', label: 'Year Built', type: 'number', section: 'Property', required: true, canopyPath: 'dwelling.year_built' },
  { fieldName: 'SquareFootage', label: 'Square Footage', type: 'number', section: 'Property', required: false, canopyPath: 'dwelling.square_footage' },
  { fieldName: 'ConstructionType', label: 'Construction Type', type: 'text', section: 'Property', required: true, canopyPath: 'dwelling.construction_type' },
  { fieldName: 'RoofType', label: 'Roof Type', type: 'text', section: 'Property', required: false, canopyPath: 'dwelling.roof_type' },
  { fieldName: 'HeatingType', label: 'Heating Type', type: 'text', section: 'Property', required: false, canopyPath: 'dwelling.heating_type' },
  { fieldName: 'NumberOfStories', label: 'Number of Stories', type: 'number', section: 'Property', required: false },
  { fieldName: 'NumberOfFamilies', label: 'Number of Families', type: 'number', section: 'Property', required: false },
  { fieldName: 'Occupancy', label: 'Occupancy', type: 'text', section: 'Property', required: false },

  // Section 4: Coverages
  { fieldName: 'CovA_Dwelling', label: 'Coverage A - Dwelling', type: 'currency', section: 'Coverages', required: true, canopyPath: 'dwelling.dwelling_coverage' },
  { fieldName: 'CovA_DwellingAdditions', label: 'Coverage A - Additions & Alterations', type: 'currency', section: 'Coverages', required: false },
  { fieldName: 'CovB_OtherStructures', label: 'Coverage B - Other Structures', type: 'currency', section: 'Coverages', required: false, canopyPath: 'dwelling.other_structures_coverage' },
  { fieldName: 'CovC_PersonalProperty', label: 'Coverage C - Personal Property', type: 'currency', section: 'Coverages', required: true, canopyPath: 'dwelling.personal_property_coverage' },
  { fieldName: 'CovD_LossOfUse', label: 'Coverage D - Loss of Use', type: 'currency', section: 'Coverages', required: false, canopyPath: 'dwelling.loss_of_use_coverage' },
  { fieldName: 'CovE_Liability', label: 'Coverage E - Personal Liability', type: 'currency', section: 'Coverages', required: true, canopyPath: 'dwelling.liability_coverage' },
  { fieldName: 'CovF_MedicalPayments', label: 'Coverage F - Medical Payments', type: 'currency', section: 'Coverages', required: false, canopyPath: 'dwelling.medical_payments_coverage' },

  // Section 5: Deductibles
  { fieldName: 'AllPerilDeductible', label: 'All Peril Deductible', type: 'currency', section: 'Deductibles', required: false },
  { fieldName: 'WindHailDeductible', label: 'Wind/Hail Deductible', type: 'currency', section: 'Deductibles', required: false },
  { fieldName: 'HurricaneDeductible', label: 'Hurricane Deductible', type: 'currency', section: 'Deductibles', required: false },

  // Section 6: Additional Coverages
  { fieldName: 'WaterBackupCoverage', label: 'Water Backup Coverage', type: 'currency', section: 'Additional Coverages', required: false },
  { fieldName: 'ScheduledPersonalProperty', label: 'Scheduled Personal Property', type: 'checkbox', section: 'Additional Coverages', required: false },
  { fieldName: 'IdentityTheftCoverage', label: 'Identity Theft Coverage', type: 'checkbox', section: 'Additional Coverages', required: false },
  { fieldName: 'EquipmentBreakdown', label: 'Equipment Breakdown', type: 'checkbox', section: 'Additional Coverages', required: false },

  // Section 7: Condo-specific
  { fieldName: 'IsCondoAssociation', label: 'Condo Association', type: 'checkbox', section: 'Condo', required: false },
  { fieldName: 'MasterPolicyExists', label: 'Master Policy Exists', type: 'checkbox', section: 'Condo', required: false },
  { fieldName: 'LossAssessmentCoverage', label: 'Loss Assessment Coverage', type: 'currency', section: 'Condo', required: false },

  // Section 8: Claims History
  { fieldName: 'HasPriorClaims', label: 'Prior Claims', type: 'checkbox', section: 'Claims', required: false },
  { fieldName: 'NumberOfClaims', label: 'Number of Claims', type: 'number', section: 'Claims', required: false },
];

// ============================================================================
// PERSONAL UMBRELLA FIELDS
// ============================================================================

export const ACORD_35U_FIELDS: AcordFieldDefinition[] = [
  // Named Insured
  { fieldName: 'NamedInsured_FirstName', label: 'First Name', type: 'text', section: 'Named Insured', required: true },
  { fieldName: 'NamedInsured_LastName', label: 'Last Name', type: 'text', section: 'Named Insured', required: true },
  { fieldName: 'NamedInsured_FullName', label: 'Full Name', type: 'text', section: 'Named Insured', required: true },
  { fieldName: 'NamedInsured_Address', label: 'Mailing Address', type: 'text', section: 'Named Insured', required: true },
  { fieldName: 'NamedInsured_City', label: 'City', type: 'text', section: 'Named Insured', required: true },
  { fieldName: 'NamedInsured_State', label: 'State', type: 'text', section: 'Named Insured', required: true, maxLength: 2 },
  { fieldName: 'NamedInsured_Zip', label: 'ZIP Code', type: 'text', section: 'Named Insured', required: true, maxLength: 10 },

  // Policy Information
  { fieldName: 'EffectiveDate', label: 'Effective Date', type: 'date', section: 'Policy Info', required: true },
  { fieldName: 'ExpirationDate', label: 'Expiration Date', type: 'date', section: 'Policy Info', required: true },
  { fieldName: 'UmbrellaLimit', label: 'Umbrella Limit', type: 'currency', section: 'Policy Info', required: true },
  { fieldName: 'SelfInsuredRetention', label: 'Self-Insured Retention', type: 'currency', section: 'Policy Info', required: false },

  // Underlying Auto
  { fieldName: 'UnderlyingAuto_Exists', label: 'Underlying Auto Policy', type: 'checkbox', section: 'Underlying Auto', required: false },
  { fieldName: 'UnderlyingAuto_Carrier', label: 'Auto Carrier', type: 'text', section: 'Underlying Auto', required: false },
  { fieldName: 'UnderlyingAuto_PolicyNumber', label: 'Auto Policy Number', type: 'text', section: 'Underlying Auto', required: false },
  { fieldName: 'UnderlyingAuto_BI_Limit', label: 'Auto BI Limit', type: 'text', section: 'Underlying Auto', required: false },
  { fieldName: 'UnderlyingAuto_PD_Limit', label: 'Auto PD Limit', type: 'text', section: 'Underlying Auto', required: false },
  { fieldName: 'UnderlyingAuto_VehicleCount', label: 'Number of Vehicles', type: 'number', section: 'Underlying Auto', required: false },

  // Underlying Home
  { fieldName: 'UnderlyingHome_Exists', label: 'Underlying Home Policy', type: 'checkbox', section: 'Underlying Home', required: false },
  { fieldName: 'UnderlyingHome_Carrier', label: 'Home Carrier', type: 'text', section: 'Underlying Home', required: false },
  { fieldName: 'UnderlyingHome_PolicyNumber', label: 'Home Policy Number', type: 'text', section: 'Underlying Home', required: false },
  { fieldName: 'UnderlyingHome_Address', label: 'Property Address', type: 'text', section: 'Underlying Home', required: false },
  { fieldName: 'UnderlyingHome_Liability', label: 'Home Liability Limit', type: 'currency', section: 'Underlying Home', required: false },

  // Underlying Counts
  { fieldName: 'UnderlyingPolicyCount', label: 'Total Underlying Policies', type: 'number', section: 'Underlying Summary', required: false },
  { fieldName: 'HouseholdDriverCount', label: 'Household Drivers', type: 'number', section: 'Underlying Summary', required: false },

  // Drivers
  { fieldName: 'Driver1_FullName', label: 'Driver 1 Name', type: 'text', section: 'Drivers', required: false },
  { fieldName: 'Driver1_Age', label: 'Driver 1 Age', type: 'number', section: 'Drivers', required: false },
  { fieldName: 'Driver2_FullName', label: 'Driver 2 Name', type: 'text', section: 'Drivers', required: false },
  { fieldName: 'Driver2_Age', label: 'Driver 2 Age', type: 'number', section: 'Drivers', required: false },
  { fieldName: 'Driver3_FullName', label: 'Driver 3 Name', type: 'text', section: 'Drivers', required: false },
  { fieldName: 'Driver3_Age', label: 'Driver 3 Age', type: 'number', section: 'Drivers', required: false },

  // Watercraft/Recreational
  { fieldName: 'HasWatercraft', label: 'Owns Watercraft', type: 'checkbox', section: 'Recreational', required: false },
  { fieldName: 'WatercraftCount', label: 'Number of Watercraft', type: 'number', section: 'Recreational', required: false },
  { fieldName: 'HasRecreationalVehicles', label: 'Owns Recreational Vehicles', type: 'checkbox', section: 'Recreational', required: false },
  { fieldName: 'RecVehicleCount', label: 'Number of Rec Vehicles', type: 'number', section: 'Recreational', required: false },
];

// ============================================================================
// FORM MAPPING REGISTRY
// ============================================================================

export const ACORD_FORM_MAPPINGS: Record<string, AcordFormMapping> = {
  '80': {
    formNumber: '80',
    formName: 'Personal Auto Application',
    version: '2019/01',
    applicableLOBs: ['auto'],
    fields: ACORD_80_FIELDS,
  },
  '35': {
    formNumber: '35',
    formName: 'Homeowners Application',
    version: '2019/01',
    applicableLOBs: ['home', 'renters', 'condo'],
    fields: ACORD_35_FIELDS,
  },
  '35U': {
    formNumber: '35U',
    formName: 'Personal Umbrella Application',
    version: '2019/01',
    applicableLOBs: ['umbrella'],
    fields: ACORD_35U_FIELDS,
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get field definitions for a specific ACORD form
 */
export function getFormFields(formNumber: string): AcordFieldDefinition[] {
  return ACORD_FORM_MAPPINGS[formNumber]?.fields || [];
}

/**
 * Get required fields for a specific ACORD form
 */
export function getRequiredFields(formNumber: string): string[] {
  return getFormFields(formNumber)
    .filter((f) => f.required)
    .map((f) => f.fieldName);
}

/**
 * Get fields by section for a specific ACORD form
 */
export function getFieldsBySection(formNumber: string): Record<string, AcordFieldDefinition[]> {
  const fields = getFormFields(formNumber);
  const sections: Record<string, AcordFieldDefinition[]> = {};

  fields.forEach((field) => {
    if (!sections[field.section]) {
      sections[field.section] = [];
    }
    sections[field.section].push(field);
  });

  return sections;
}

/**
 * Get the ACORD form number for a given line of business
 */
export function getFormNumberForLOB(lob: string): string {
  for (const [formNumber, mapping] of Object.entries(ACORD_FORM_MAPPINGS)) {
    if (mapping.applicableLOBs.includes(lob.toLowerCase())) {
      return formNumber;
    }
  }
  return '35'; // Default to homeowners
}

/**
 * Validate that required fields are present in field values
 */
export function validateRequiredFields(
  formNumber: string,
  fieldValues: Record<string, any>
): { valid: boolean; missingFields: string[] } {
  const requiredFields = getRequiredFields(formNumber);
  const missingFields = requiredFields.filter(
    (field) => !fieldValues[field] || fieldValues[field] === ''
  );

  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}

export default {
  ACORD_FORM_MAPPINGS,
  getFormFields,
  getRequiredFields,
  getFieldsBySection,
  getFormNumberForLOB,
  validateRequiredFields,
};
