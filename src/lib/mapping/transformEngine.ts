// ============================================
// Transform Engine
// Applies transformations to intake values
// for ACORD field mapping
// ============================================

import type { TransformType, TransformConfig } from '@/types/intake';

// ============================================
// TYPES
// ============================================

export interface TransformContext {
  allResponses: Record<string, any>;
  metadata?: {
    submissionId?: string;
    accountId?: string;
    effectiveDate?: string;
    producerInfo?: Record<string, any>;
  };
}

// ============================================
// MAIN TRANSFORM FUNCTION
// ============================================

/**
 * Apply transformation to a value
 */
export function applyTransform(
  value: any,
  transformType: TransformType,
  config: TransformConfig,
  allResponses: Record<string, any> = {},
  metadata?: TransformContext['metadata']
): any {
  const context: TransformContext = { allResponses, metadata };

  switch (transformType) {
    case 'direct':
      return transformDirect(value, config);

    case 'format':
      return transformFormat(value, config);

    case 'concatenate':
      return transformConcatenate(value, config, context);

    case 'calculate':
      return transformCalculate(value, config, context);

    case 'lookup':
      return transformLookup(value, config);

    case 'boolean':
      return transformBoolean(value, config);

    case 'date_format':
      return transformDateFormat(value, config);

    case 'phone_format':
      return transformPhoneFormat(value, config);

    case 'currency_format':
      return transformCurrencyFormat(value, config);

    case 'uppercase':
      return String(value || '').toUpperCase();

    case 'lowercase':
      return String(value || '').toLowerCase();

    case 'split':
      return transformSplit(value, config);

    case 'substring':
      return transformSubstring(value, config);

    case 'conditional':
      return transformConditional(value, config, context);

    default:
      return value;
  }
}

// ============================================
// TRANSFORM IMPLEMENTATIONS
// ============================================

/**
 * Direct pass-through with optional trimming
 */
function transformDirect(value: any, config: TransformConfig): any {
  if (value === null || value === undefined) return value;

  let result = value;

  // Convert to string if needed
  if (typeof result !== 'string' && typeof result !== 'boolean' && typeof result !== 'number') {
    result = JSON.stringify(result);
  }

  // Apply trim (default true)
  if (config.trim !== false && typeof result === 'string') {
    result = result.trim();
  }

  // Apply case transformations
  if (config.uppercase && typeof result === 'string') {
    result = result.toUpperCase();
  } else if (config.lowercase && typeof result === 'string') {
    result = result.toLowerCase();
  }

  // Check max length
  if (config.maxLength && typeof result === 'string' && result.length > config.maxLength) {
    switch (config.overflowBehavior) {
      case 'truncate':
        result = result.substring(0, config.maxLength);
        break;
      case 'addendum':
        result = result.substring(0, config.maxLength - 3) + '...';
        break;
      case 'fail':
        throw new Error(`Value exceeds maximum length of ${config.maxLength}`);
    }
  }

  return result;
}

/**
 * Format transformation (dates, phones, etc.)
 */
function transformFormat(value: any, config: TransformConfig): string {
  if (value === null || value === undefined) return '';

  let result = String(value);

  // Apply date format
  if (config.dateFormat) {
    result = formatDate(result, config.dateFormat);
  }

  // Apply phone format
  if (config.phoneFormat) {
    result = formatPhone(result, config.phoneFormat);
  }

  // Apply case
  if (config.uppercase) {
    result = result.toUpperCase();
  } else if (config.lowercase) {
    result = result.toLowerCase();
  }

  // Trim
  if (config.trim !== false) {
    result = result.trim();
  }

  return result;
}

/**
 * Concatenate multiple fields
 */
function transformConcatenate(
  _value: any,
  config: TransformConfig,
  context: TransformContext
): string {
  const sourceFields = config.sourceFields || [];
  const separator = config.separator ?? ' ';

  const values = sourceFields
    .map(fieldId => {
      const val = context.allResponses[fieldId];
      if (val === null || val === undefined || val === '') return null;
      return String(val).trim();
    })
    .filter(v => v !== null);

  return values.join(separator);
}

/**
 * Calculate value using formula
 */
function transformCalculate(
  _value: any,
  config: TransformConfig,
  context: TransformContext
): number | string {
  const formula = config.formula;
  if (!formula) return 0;

  // Replace field references with values
  let expression = formula;
  const fieldPattern = /\{([^}]+)\}/g;
  let match;

  while ((match = fieldPattern.exec(formula)) !== null) {
    const fieldId = match[1];
    const fieldValue = context.allResponses[fieldId];
    const numValue = parseFloat(fieldValue) || 0;
    expression = expression.replace(match[0], String(numValue));
  }

  // Evaluate safe math expression
  try {
    // Only allow numbers, operators, parentheses, and spaces
    if (!/^[\d\s+\-*/().]+$/.test(expression)) {
      throw new Error('Invalid expression');
    }

    // Use Function constructor for safe eval
    const result = new Function(`return ${expression}`)();
    return typeof result === 'number' && !isNaN(result) ? result : 0;
  } catch {
    return 0;
  }
}

/**
 * Lookup value in a table
 */
function transformLookup(value: any, config: TransformConfig): any {
  const lookupTable = config.lookupTable;
  if (!lookupTable) return value;

  // Common lookup tables
  const tables: Record<string, Record<string, string>> = {
    stateAbbrev: STATE_ABBREVIATIONS,
    stateFull: STATE_FULL_NAMES,
    entityType: ENTITY_TYPE_CODES,
    constructionType: CONSTRUCTION_TYPE_CODES,
  };

  const table = tables[lookupTable];
  if (!table) return value;

  const stringValue = String(value).toLowerCase().trim();

  // Try direct lookup
  if (table[stringValue]) {
    return table[stringValue];
  }

  // Try case-insensitive lookup
  for (const [key, val] of Object.entries(table)) {
    if (key.toLowerCase() === stringValue) {
      return val;
    }
  }

  return value;
}

/**
 * Boolean transformation
 */
function transformBoolean(value: any, config: TransformConfig): string {
  const trueValue = config.trueValue ?? 'X';
  const falseValue = config.falseValue ?? '';

  // Check for truthy values
  const isTruthy =
    value === true ||
    value === 'true' ||
    value === '1' ||
    value === 1 ||
    value === 'yes' ||
    value === 'Yes' ||
    value === 'YES' ||
    value === 'on' ||
    value === 'checked';

  return isTruthy ? trueValue : falseValue;
}

/**
 * Date format transformation
 */
function transformDateFormat(value: any, config: TransformConfig): string {
  if (!value) return '';

  const format = config.dateFormat || 'MM/DD/YYYY';
  return formatDate(value, format);
}

/**
 * Phone format transformation
 */
function transformPhoneFormat(value: any, config: TransformConfig): string {
  if (!value) return '';

  const format = config.phoneFormat || '(###) ###-####';
  return formatPhone(value, format);
}

/**
 * Currency format transformation
 */
function transformCurrencyFormat(value: any, _config: TransformConfig): string {
  if (value === null || value === undefined || value === '') return '';

  const numValue = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  if (isNaN(numValue)) return '';

  return numValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Split transformation
 */
function transformSplit(value: any, config: TransformConfig): string {
  if (!value) return '';

  const stringValue = String(value);
  const separator = config.separator || ' ';
  const parts = stringValue.split(separator);

  // Return specific index if configured
  if (config.sourceFields && config.sourceFields.length > 0) {
    const index = parseInt(config.sourceFields[0], 10);
    return parts[index] ?? '';
  }

  return parts[0] ?? '';
}

/**
 * Substring transformation
 */
function transformSubstring(value: any, _config: TransformConfig): string {
  if (!value) return '';

  const stringValue = String(value);

  // Config would have start and end indices
  // For now, just return the value
  return stringValue;
}

/**
 * Conditional transformation
 */
function transformConditional(
  value: any,
  config: TransformConfig,
  context: TransformContext
): any {
  // Check condition in config
  // This is a placeholder for conditional logic
  // In production, this would evaluate conditions like:
  // if field X equals Y, then use value Z

  return transformDirect(value, config);
}

// ============================================
// FORMAT HELPERS
// ============================================

function formatDate(value: string, format: string): string {
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return value;

    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear().toString();
    const shortYear = year.slice(-2);

    const formats: Record<string, string> = {
      'MM/DD/YYYY': `${month}/${day}/${year}`,
      'MM/DD/YY': `${month}/${day}/${shortYear}`,
      'MM-DD-YYYY': `${month}-${day}-${year}`,
      'MM-DD-YY': `${month}-${day}-${shortYear}`,
      'YYYY-MM-DD': `${year}-${month}-${day}`,
      'DD/MM/YYYY': `${day}/${month}/${year}`,
      'MMDDYYYY': `${month}${day}${year}`,
      'YYYYMMDD': `${year}${month}${day}`,
    };

    return formats[format] || formats['MM/DD/YYYY'];
  } catch {
    return value;
  }
}

function formatPhone(value: string, format: string): string {
  const digits = String(value).replace(/\D/g, '');
  if (digits.length < 10) return value;

  const phone = digits.slice(-10);
  const area = phone.substring(0, 3);
  const prefix = phone.substring(3, 6);
  const line = phone.substring(6, 10);

  const formats: Record<string, string> = {
    '(###) ###-####': `(${area}) ${prefix}-${line}`,
    '###-###-####': `${area}-${prefix}-${line}`,
    '### ### ####': `${area} ${prefix} ${line}`,
    '##########': phone,
    '###.###.####': `${area}.${prefix}.${line}`,
  };

  return formats[format] || formats['(###) ###-####'];
}

// ============================================
// LOOKUP TABLES
// ============================================

const STATE_ABBREVIATIONS: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO',
  montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH',
  oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
  'district of columbia': 'DC',
};

const STATE_FULL_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_ABBREVIATIONS).map(([k, v]) => [v.toLowerCase(), k.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')])
);

const ENTITY_TYPE_CODES: Record<string, string> = {
  individual: 'IN',
  'sole proprietor': 'SP',
  'sole proprietorship': 'SP',
  partnership: 'PA',
  corporation: 'CO',
  'c corporation': 'CO',
  's corporation': 'SC',
  llc: 'LL',
  'limited liability company': 'LL',
  llp: 'LP',
  'limited liability partnership': 'LP',
  nonprofit: 'NP',
  'non-profit': 'NP',
  trust: 'TR',
  estate: 'ES',
  government: 'GO',
  other: 'OT',
};

const CONSTRUCTION_TYPE_CODES: Record<string, string> = {
  frame: 'F',
  'wood frame': 'F',
  joisted: 'JM',
  'joisted masonry': 'JM',
  masonry: 'M',
  'non-combustible': 'NC',
  'modified fire resistive': 'MFR',
  'fire resistive': 'FR',
  'superior construction': 'S',
};

// ============================================
// UTILITY EXPORTS
// ============================================

export const TRANSFORM_TYPES: TransformType[] = [
  'direct',
  'format',
  'concatenate',
  'calculate',
  'lookup',
  'boolean',
  'date_format',
  'phone_format',
  'currency_format',
  'uppercase',
  'lowercase',
  'split',
  'substring',
  'conditional',
];

export const LOOKUP_TABLES = {
  stateAbbrev: Object.keys(STATE_ABBREVIATIONS),
  stateFull: Object.keys(STATE_FULL_NAMES),
  entityType: Object.keys(ENTITY_TYPE_CODES),
  constructionType: Object.keys(CONSTRUCTION_TYPE_CODES),
};

export const DATE_FORMATS = [
  'MM/DD/YYYY',
  'MM/DD/YY',
  'MM-DD-YYYY',
  'YYYY-MM-DD',
  'DD/MM/YYYY',
  'MMDDYYYY',
];

export const PHONE_FORMATS = [
  '(###) ###-####',
  '###-###-####',
  '### ### ####',
  '##########',
  '###.###.####',
];
