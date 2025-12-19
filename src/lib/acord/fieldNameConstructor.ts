// ============================================
// ACORD Field Name Constructor
// Builds proper field names following ACORD conventions
// ============================================

// ============================================
// TYPES
// ============================================

export interface FieldNameParts {
  prefix?: string;
  section?: string;
  fieldName: string;
  index?: number;
  subIndex?: number;
  suffix?: string;
}

export interface FieldNamePattern {
  pattern: RegExp;
  template: string;
  description: string;
}

// ============================================
// ACORD FIELD NAME PATTERNS
// Common naming conventions in ACORD forms
// ============================================

export const ACORD_PATTERNS: Record<string, FieldNamePattern> = {
  // Vehicle fields: Veh_Year_1, Veh_Make_1, etc.
  vehicle: {
    pattern: /^Veh_?(\w+)_?(\d+)?$/i,
    template: 'Veh_{field}_{index}',
    description: 'Vehicle information fields',
  },

  // Driver fields: Driver_Name_1, Driver_DOB_1, etc.
  driver: {
    pattern: /^Driver_?(\w+)_?(\d+)?$/i,
    template: 'Driver_{field}_{index}',
    description: 'Driver information fields',
  },

  // Location fields: Loc_Address_1, Loc_City_1, etc.
  location: {
    pattern: /^Loc_?(\w+)_?(\d+)?$/i,
    template: 'Loc_{field}_{index}',
    description: 'Location information fields',
  },

  // Building fields: Bldg_Value_1, Bldg_Construction_1, etc.
  building: {
    pattern: /^Bldg_?(\w+)_?(\d+)?$/i,
    template: 'Bldg_{field}_{index}',
    description: 'Building information fields',
  },

  // Classification fields: Class_Code_1, Class_Payroll_1, etc.
  classification: {
    pattern: /^Class_?(\w+)_?(\d+)?$/i,
    template: 'Class_{field}_{index}',
    description: 'Classification/class code fields',
  },

  // General Liability: GL_Limit, GL_Deductible, etc.
  generalLiability: {
    pattern: /^GL_?(\w+)$/i,
    template: 'GL_{field}',
    description: 'General liability fields',
  },

  // Commercial Auto: CA_Limit, CA_Symbol, etc.
  commercialAuto: {
    pattern: /^CA_?(\w+)$/i,
    template: 'CA_{field}',
    description: 'Commercial auto fields',
  },

  // Workers Comp: WC_Limit, WC_State, etc.
  workersComp: {
    pattern: /^WC_?(\w+)$/i,
    template: 'WC_{field}',
    description: 'Workers compensation fields',
  },

  // Property: Prop_Limit, Prop_Deductible, etc.
  property: {
    pattern: /^Prop_?(\w+)$/i,
    template: 'Prop_{field}',
    description: 'Property coverage fields',
  },

  // Applicant info: ApplicantName, ApplicantAddress, etc.
  applicant: {
    pattern: /^Applicant(\w+)$/i,
    template: 'Applicant{field}',
    description: 'Applicant information fields',
  },

  // Producer info: ProducerName, ProducerLicense, etc.
  producer: {
    pattern: /^Producer(\w+)$/i,
    template: 'Producer{field}',
    description: 'Producer/agent information fields',
  },

  // Additional Insured: AddIns_Name_1, AddIns_Address_1
  additionalInsured: {
    pattern: /^AddIns_?(\w+)_?(\d+)?$/i,
    template: 'AddIns_{field}_{index}',
    description: 'Additional insured fields',
  },
};

// ============================================
// FIELD NAME MAPPINGS
// Maps common field concepts to ACORD field names
// ============================================

export const FIELD_MAPPINGS: Record<string, Record<string, string>> = {
  applicant: {
    name: 'ApplicantName',
    dba: 'ApplicantDBA',
    address: 'MailAddr1',
    address2: 'MailAddr2',
    city: 'MailCity',
    state: 'MailState',
    zip: 'MailZip',
    phone: 'Phone',
    fax: 'Fax',
    email: 'Email',
    website: 'Website',
    fein: 'FEIN',
    entityType: 'EntityType',
    sic: 'SICCode',
    naics: 'NAICSCode',
    yearEstablished: 'YearEstablished',
    description: 'BusinessDescription',
  },

  policy: {
    effectiveDate: 'EffDate',
    expirationDate: 'ExpDate',
    policyNumber: 'PolicyNumber',
    proposedEffective: 'PropEffDate',
    proposedExpiration: 'PropExpDate',
  },

  producer: {
    name: 'ProducerName',
    agency: 'AgencyName',
    address: 'AgencyAddr',
    city: 'AgencyCity',
    state: 'AgencyState',
    zip: 'AgencyZip',
    phone: 'AgencyPhone',
    email: 'ProducerEmail',
    license: 'ProducerLicense',
    code: 'ProducerCode',
  },

  vehicle: {
    year: 'Veh_Year',
    make: 'Veh_Make',
    model: 'Veh_Model',
    vin: 'Veh_VIN',
    gvw: 'Veh_GVW',
    radius: 'Veh_Radius',
    value: 'Veh_Value',
    cost: 'Veh_Cost',
    use: 'Veh_Use',
    garageZip: 'Veh_GarageZip',
  },

  driver: {
    name: 'Driver_Name',
    dob: 'Driver_DOB',
    license: 'Driver_License',
    licenseState: 'Driver_LicState',
    yearsExperience: 'Driver_YrsExp',
    accidents: 'Driver_Accidents',
    violations: 'Driver_Violations',
    relationship: 'Driver_Relationship',
  },

  generalLiability: {
    perOccurrence: 'GL_PerOccLimit',
    generalAggregate: 'GL_GenAggLimit',
    productsAggregate: 'GL_ProdCompOpsAgg',
    personalAdvertising: 'GL_PersonalAdvLimit',
    fireLimit: 'GL_FireDamageLimit',
    medicalExpense: 'GL_MedExpLimit',
    deductible: 'GL_Deductible',
  },

  workersComp: {
    perAccident: 'WC_PerAccident',
    diseaseEachEmployee: 'WC_DiseaseEE',
    diseasePolicy: 'WC_DiseasePolicy',
    classCode: 'Class_Code',
    payroll: 'Class_Payroll',
    rate: 'Class_Rate',
    premium: 'Class_Premium',
  },

  property: {
    buildingLimit: 'Prop_BldgLimit',
    bppLimit: 'Prop_BPPLimit',
    totalLimit: 'Prop_TotalLimit',
    deductible: 'Prop_Deductible',
    coinsurance: 'Prop_Coins',
    valuation: 'Prop_Valuation',
    construction: 'Prop_Construction',
    protection: 'Prop_Protection',
  },
};

// ============================================
// MAIN FUNCTIONS
// ============================================

/**
 * Build ACORD field name from parts
 */
export function buildFieldName(parts: FieldNameParts): string {
  let name = '';

  if (parts.prefix) {
    name += parts.prefix;
    if (parts.section || parts.fieldName) name += '_';
  }

  if (parts.section) {
    name += parts.section;
    if (parts.fieldName) name += '_';
  }

  name += parts.fieldName;

  if (parts.index !== undefined) {
    name += `_${parts.index}`;
  }

  if (parts.subIndex !== undefined) {
    name += `_${parts.subIndex}`;
  }

  if (parts.suffix) {
    name += `_${parts.suffix}`;
  }

  return name;
}

/**
 * Parse ACORD field name into parts
 */
export function parseFieldName(fieldName: string): FieldNameParts | null {
  // Try each pattern
  for (const [type, pattern] of Object.entries(ACORD_PATTERNS)) {
    const match = fieldName.match(pattern.pattern);
    if (match) {
      const parts: FieldNameParts = {
        fieldName: match[1] || fieldName,
      };

      // Extract prefix based on type
      if (type === 'vehicle') parts.prefix = 'Veh';
      else if (type === 'driver') parts.prefix = 'Driver';
      else if (type === 'location') parts.prefix = 'Loc';
      else if (type === 'building') parts.prefix = 'Bldg';
      else if (type === 'classification') parts.prefix = 'Class';
      else if (type === 'generalLiability') parts.prefix = 'GL';
      else if (type === 'commercialAuto') parts.prefix = 'CA';
      else if (type === 'workersComp') parts.prefix = 'WC';
      else if (type === 'property') parts.prefix = 'Prop';
      else if (type === 'applicant') parts.prefix = 'Applicant';
      else if (type === 'producer') parts.prefix = 'Producer';
      else if (type === 'additionalInsured') parts.prefix = 'AddIns';

      // Extract index if present
      if (match[2]) {
        parts.index = parseInt(match[2], 10);
      }

      return parts;
    }
  }

  // Default parsing for unrecognized patterns
  const defaultMatch = fieldName.match(/^(\w+?)_?(\d+)?$/);
  if (defaultMatch) {
    return {
      fieldName: defaultMatch[1],
      index: defaultMatch[2] ? parseInt(defaultMatch[2], 10) : undefined,
    };
  }

  return { fieldName };
}

/**
 * Get ACORD field name for common field concept
 */
export function getAcordFieldName(
  category: keyof typeof FIELD_MAPPINGS,
  field: string,
  index?: number
): string | null {
  const categoryMappings = FIELD_MAPPINGS[category];
  if (!categoryMappings) return null;

  const baseName = categoryMappings[field];
  if (!baseName) return null;

  if (index !== undefined) {
    return `${baseName}_${index}`;
  }

  return baseName;
}

/**
 * Get all ACORD field names for a category
 */
export function getCategoryFieldNames(
  category: keyof typeof FIELD_MAPPINGS,
  index?: number
): Record<string, string> {
  const categoryMappings = FIELD_MAPPINGS[category];
  if (!categoryMappings) return {};

  const result: Record<string, string> = {};
  for (const [key, baseName] of Object.entries(categoryMappings)) {
    result[key] = index !== undefined ? `${baseName}_${index}` : baseName;
  }

  return result;
}

/**
 * Build indexed field names for repeating items
 */
export function buildIndexedFieldNames(
  category: keyof typeof FIELD_MAPPINGS,
  startIndex: number,
  count: number
): Array<Record<string, string>> {
  const result: Array<Record<string, string>> = [];

  for (let i = 0; i < count; i++) {
    result.push(getCategoryFieldNames(category, startIndex + i));
  }

  return result;
}

/**
 * Map form data to ACORD field names
 */
export function mapToAcordFields(
  formData: Record<string, any>,
  category: keyof typeof FIELD_MAPPINGS,
  index?: number
): Record<string, any> {
  const result: Record<string, any> = {};
  const categoryMappings = FIELD_MAPPINGS[category];

  if (!categoryMappings) return result;

  for (const [sourceKey, value] of Object.entries(formData)) {
    // Check if this key maps to an ACORD field
    const lowerKey = sourceKey.toLowerCase();

    for (const [mappingKey, acordFieldName] of Object.entries(categoryMappings)) {
      if (lowerKey === mappingKey.toLowerCase() || lowerKey.includes(mappingKey.toLowerCase())) {
        const fieldName = index !== undefined ? `${acordFieldName}_${index}` : acordFieldName;
        result[fieldName] = value;
        break;
      }
    }
  }

  return result;
}

/**
 * Reverse map ACORD field names to common field names
 */
export function reverseMapFromAcord(
  acordFields: Record<string, any>
): Record<string, any> {
  const result: Record<string, any> = {};

  // Build reverse lookup
  const reverseLookup: Record<string, { category: string; field: string }> = {};
  for (const [category, mappings] of Object.entries(FIELD_MAPPINGS)) {
    for (const [field, acordName] of Object.entries(mappings)) {
      reverseLookup[acordName.toLowerCase()] = { category, field };
    }
  }

  for (const [acordField, value] of Object.entries(acordFields)) {
    // Remove index suffix for lookup
    const baseField = acordField.replace(/_\d+$/, '');
    const lookup = reverseLookup[baseField.toLowerCase()];

    if (lookup) {
      if (!result[lookup.category]) {
        result[lookup.category] = {};
      }
      result[lookup.category][lookup.field] = value;
    } else {
      // Keep unmapped fields in a separate bucket
      if (!result['_unmapped']) {
        result['_unmapped'] = {};
      }
      result['_unmapped'][acordField] = value;
    }
  }

  return result;
}

/**
 * Validate field name follows ACORD conventions
 */
export function validateFieldName(fieldName: string): {
  valid: boolean;
  matchedPattern?: string;
  suggestions?: string[];
} {
  // Check against known patterns
  for (const [patternName, pattern] of Object.entries(ACORD_PATTERNS)) {
    if (pattern.pattern.test(fieldName)) {
      return { valid: true, matchedPattern: patternName };
    }
  }

  // Check for common issues
  const suggestions: string[] = [];

  // Check for missing underscore
  if (/[a-z][A-Z]/.test(fieldName)) {
    const fixed = fieldName.replace(/([a-z])([A-Z])/g, '$1_$2');
    suggestions.push(`Consider using underscores: ${fixed}`);
  }

  // Check for common prefixes without proper format
  const prefixes = ['Veh', 'Driver', 'Loc', 'Bldg', 'Class', 'GL', 'CA', 'WC', 'Prop'];
  for (const prefix of prefixes) {
    if (fieldName.startsWith(prefix) && !fieldName.startsWith(`${prefix}_`)) {
      suggestions.push(`Add underscore after prefix: ${prefix}_${fieldName.slice(prefix.length)}`);
    }
  }

  return {
    valid: suggestions.length === 0,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  };
}

/**
 * Generate field names for a schedule (vehicles, drivers, etc.)
 */
export function generateScheduleFieldNames(
  scheduleType: 'vehicle' | 'driver' | 'location' | 'building' | 'classification',
  itemCount: number,
  startIndex: number = 1
): Array<Record<string, string>> {
  const result: Array<Record<string, string>> = [];

  for (let i = 0; i < itemCount; i++) {
    const index = startIndex + i;
    result.push(getCategoryFieldNames(scheduleType, index));
  }

  return result;
}
