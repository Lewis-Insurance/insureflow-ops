/**
 * Field Normalization Library
 *
 * Handles canonicalization of extracted values for accurate comparison:
 * - Currency: $1,000,000 vs 1,000,000 vs 1000000
 * - Dates: 01/02/25 vs 1-2-2025 vs January 2, 2025
 * - Booleans: Yes/No/Included/Excluded/Y/N
 * - Limits: $1,000,000 per occurrence vs 1M/occ
 * - Lists: Forms schedule normalization
 *
 * CRITICAL: Compare normalized, display raw + formatted
 */

import type {
  FieldType,
  NormalizedValue,
  NormalizedCurrency,
  NormalizedDate,
  NormalizedLimit,
  LimitQualifier,
  BooleanValue,
} from '@/types/coverage-comparison';

export const NORMALIZATION_VERSION = '1.0.0';

// =============================================================================
// CURRENCY NORMALIZATION
// =============================================================================

const CURRENCY_PATTERNS = [
  /^\$?\s*([\d,]+(?:\.\d{2})?)\s*$/,                    // $1,000,000 or 1000000
  /^\$?\s*([\d,]+(?:\.\d{2})?)\s*(?:USD|dollars?)?\s*$/i,  // $1,000,000 USD
  /^([\d,]+(?:\.\d{2})?)\s*(?:per|\/)\s*(?:year|yr|annual)/i, // 1000 per year
];

const CURRENCY_MULTIPLIERS: Record<string, number> = {
  'k': 1_000,
  'K': 1_000,
  'thousand': 1_000,
  'm': 1_000_000,
  'M': 1_000_000,
  'million': 1_000_000,
  'mil': 1_000_000,
  'mm': 1_000_000,
  'b': 1_000_000_000,
  'B': 1_000_000_000,
  'billion': 1_000_000_000,
};

export function normalizeCurrency(rawValue: string): NormalizedCurrency | null {
  if (!rawValue || rawValue.trim() === '') return null;

  const cleaned = rawValue.trim();

  // Check for multiplier suffix (e.g., "1M", "500K")
  const multiplierMatch = cleaned.match(/^\$?\s*([\d,.]+)\s*([kKmMbB]|thousand|million|mil|billion)?\s*$/);
  if (multiplierMatch) {
    const numPart = multiplierMatch[1].replace(/,/g, '');
    const multiplierKey = multiplierMatch[2] || '';
    const multiplier = CURRENCY_MULTIPLIERS[multiplierKey] || 1;
    const amount = parseFloat(numPart) * multiplier;

    if (!isNaN(amount)) {
      return {
        amount,
        currency: 'USD',
        rawValue,
        formatted: formatCurrency(amount),
      };
    }
  }

  // Standard currency patterns
  for (const pattern of CURRENCY_PATTERNS) {
    const match = cleaned.match(pattern);
    if (match) {
      const numStr = match[1].replace(/,/g, '');
      const amount = parseFloat(numStr);

      if (!isNaN(amount)) {
        return {
          amount,
          currency: 'USD',
          rawValue,
          formatted: formatCurrency(amount),
        };
      }
    }
  }

  return null;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// =============================================================================
// DATE NORMALIZATION
// =============================================================================

const DATE_PATTERNS: { pattern: RegExp; parser: (match: RegExpMatchArray) => Date | null }[] = [
  // ISO format: 2025-01-15
  {
    pattern: /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    parser: (m) => new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])),
  },
  // US format: 01/15/2025 or 01-15-2025
  {
    pattern: /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/,
    parser: (m) => new Date(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2])),
  },
  // US format with 2-digit year: 01/15/25
  {
    pattern: /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/,
    parser: (m) => {
      const year = parseInt(m[3]) + (parseInt(m[3]) > 50 ? 1900 : 2000);
      return new Date(year, parseInt(m[1]) - 1, parseInt(m[2]));
    },
  },
  // Verbose: January 15, 2025 or Jan 15, 2025
  {
    pattern: /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/,
    parser: (m) => {
      const monthIndex = parseMonthName(m[1]);
      if (monthIndex === -1) return null;
      return new Date(parseInt(m[3]), monthIndex, parseInt(m[2]));
    },
  },
  // Verbose: 15 January 2025
  {
    pattern: /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/,
    parser: (m) => {
      const monthIndex = parseMonthName(m[2]);
      if (monthIndex === -1) return null;
      return new Date(parseInt(m[3]), monthIndex, parseInt(m[1]));
    },
  },
];

const MONTH_NAMES: Record<string, number> = {
  'january': 0, 'jan': 0,
  'february': 1, 'feb': 1,
  'march': 2, 'mar': 2,
  'april': 3, 'apr': 3,
  'may': 4,
  'june': 5, 'jun': 5,
  'july': 6, 'jul': 6,
  'august': 7, 'aug': 7,
  'september': 8, 'sep': 8, 'sept': 8,
  'october': 9, 'oct': 9,
  'november': 10, 'nov': 10,
  'december': 11, 'dec': 11,
};

function parseMonthName(name: string): number {
  return MONTH_NAMES[name.toLowerCase()] ?? -1;
}

export function normalizeDate(rawValue: string): NormalizedDate | null {
  if (!rawValue || rawValue.trim() === '') return null;

  const cleaned = rawValue.trim();

  for (const { pattern, parser } of DATE_PATTERNS) {
    const match = cleaned.match(pattern);
    if (match) {
      const date = parser(match);
      if (date && !isNaN(date.getTime())) {
        return {
          isoDate: formatISODate(date),
          rawValue,
          formatted: formatDisplayDate(date),
        };
      }
    }
  }

  // Try native Date parsing as fallback
  const fallbackDate = new Date(cleaned);
  if (!isNaN(fallbackDate.getTime())) {
    return {
      isoDate: formatISODate(fallbackDate),
      rawValue,
      formatted: formatDisplayDate(fallbackDate),
    };
  }

  return null;
}

function formatISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

// =============================================================================
// BOOLEAN NORMALIZATION
// =============================================================================

const BOOLEAN_YES_VALUES = new Set([
  'yes', 'y', 'true', 'included', 'incl', 'incl.', 'x', '✓', '✔', 'checked',
  'covered', 'active', 'enabled', 'on', '1',
]);

const BOOLEAN_NO_VALUES = new Set([
  'no', 'n', 'false', 'excluded', 'excl', 'excl.', 'not included', 'not covered',
  'n/a', 'na', 'none', 'inactive', 'disabled', 'off', '0', '-', '',
]);

export function normalizeBoolean(rawValue: string): { value: BooleanValue; rawValue: string } {
  if (!rawValue || rawValue.trim() === '') {
    return { value: 'unknown', rawValue };
  }

  const cleaned = rawValue.trim().toLowerCase();

  if (BOOLEAN_YES_VALUES.has(cleaned)) {
    return { value: 'yes', rawValue };
  }

  if (BOOLEAN_NO_VALUES.has(cleaned)) {
    return { value: 'no', rawValue };
  }

  // Check for "included" or "excluded" substrings
  if (cleaned.includes('included') || cleaned.includes('covered')) {
    return { value: 'included', rawValue };
  }

  if (cleaned.includes('excluded') || cleaned.includes('not covered')) {
    return { value: 'excluded', rawValue };
  }

  return { value: 'unknown', rawValue };
}

// =============================================================================
// LIMIT NORMALIZATION
// Handles currency + qualifiers (per occ, per claim, agg, etc.)
// =============================================================================

const LIMIT_QUALIFIER_PATTERNS: { pattern: RegExp; qualifier: LimitQualifier }[] = [
  { pattern: /per\s*(?:occurrence|occ\.?)/i, qualifier: 'per_occurrence' },
  { pattern: /each\s*(?:occurrence|occ\.?)/i, qualifier: 'per_occurrence' },
  { pattern: /per\s*(?:claim)/i, qualifier: 'per_claim' },
  { pattern: /each\s*(?:claim)/i, qualifier: 'per_claim' },
  { pattern: /(?:general\s*)?aggregate|agg\.?/i, qualifier: 'aggregate' },
  { pattern: /per\s*(?:person)/i, qualifier: 'per_person' },
  { pattern: /each\s*(?:person)/i, qualifier: 'per_person' },
  { pattern: /per\s*(?:accident)/i, qualifier: 'per_accident' },
  { pattern: /each\s*(?:accident)/i, qualifier: 'per_accident' },
  { pattern: /combined\s*(?:single\s*)?(?:limit)?|csl/i, qualifier: 'combined_single' },
  { pattern: /statutory/i, qualifier: 'statutory' },
];

export function normalizeLimit(rawValue: string): NormalizedLimit | null {
  if (!rawValue || rawValue.trim() === '') return null;

  const cleaned = rawValue.trim();

  // Extract currency amount
  const currency = normalizeCurrency(cleaned);
  if (!currency) {
    // Check for "statutory" without amount
    if (/statutory/i.test(cleaned)) {
      return {
        amount: 0,
        qualifier: 'statutory',
        rawValue,
        formatted: 'Statutory Limits',
      };
    }
    return null;
  }

  // Detect qualifier
  let qualifier: LimitQualifier = 'unknown';
  for (const { pattern, qualifier: q } of LIMIT_QUALIFIER_PATTERNS) {
    if (pattern.test(cleaned)) {
      qualifier = q;
      break;
    }
  }

  return {
    amount: currency.amount,
    qualifier,
    rawValue,
    formatted: formatLimit(currency.amount, qualifier),
  };
}

function formatLimit(amount: number, qualifier: LimitQualifier): string {
  const amountStr = formatCurrency(amount);

  const qualifierStr: Record<LimitQualifier, string> = {
    per_occurrence: 'per occurrence',
    per_claim: 'per claim',
    aggregate: 'aggregate',
    per_person: 'per person',
    per_accident: 'per accident',
    combined_single: 'combined single limit',
    statutory: 'statutory',
    unknown: '',
  };

  const suffix = qualifierStr[qualifier];
  return suffix ? `${amountStr} ${suffix}` : amountStr;
}

// =============================================================================
// PERCENTAGE NORMALIZATION
// =============================================================================

export function normalizePercentage(rawValue: string): { value: number; rawValue: string } | null {
  if (!rawValue || rawValue.trim() === '') return null;

  const cleaned = rawValue.trim();

  // Match "50%", "50 %", "50 percent", "0.5"
  const percentMatch = cleaned.match(/^([\d.]+)\s*%?(?:\s*percent)?$/i);
  if (percentMatch) {
    let value = parseFloat(percentMatch[1]);
    // If value < 1 and no % sign, assume it's already a decimal
    if (value <= 1 && !cleaned.includes('%')) {
      value = value * 100;
    }
    return { value, rawValue };
  }

  return null;
}

// =============================================================================
// LIST NORMALIZATION (Forms schedule, endorsements)
// =============================================================================

export function normalizeList(rawValue: string): { value: string[]; rawValue: string } {
  if (!rawValue || rawValue.trim() === '') {
    return { value: [], rawValue };
  }

  const cleaned = rawValue.trim();

  // Split by common delimiters
  const items = cleaned
    .split(/[,;\n\r]+/)
    .map(item => item.trim())
    .filter(item => item.length > 0)
    // Normalize common form variations
    .map(normalizeFormName)
    // Deduplicate
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .sort();

  return { value: items, rawValue };
}

function normalizeFormName(formName: string): string {
  // Remove common prefixes/suffixes
  let normalized = formName
    .replace(/^(CG|GL|CA|CP|WC|IM)\s*/i, (match) => match.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();

  // Standardize edition dates
  normalized = normalized.replace(/\(\s*(\d{2})\/(\d{2})\s*\)/, '($1/$2)');

  return normalized;
}

// =============================================================================
// IDENTIFIER NORMALIZATION
// =============================================================================

export function normalizeIdentifier(rawValue: string, type?: 'policy_number' | 'naic' | 'fein'): { value: string; rawValue: string } {
  if (!rawValue || rawValue.trim() === '') {
    return { value: '', rawValue };
  }

  let normalized = rawValue.trim();

  switch (type) {
    case 'naic':
      // NAIC codes should be 5 digits
      normalized = normalized.replace(/\D/g, '').padStart(5, '0').slice(-5);
      break;

    case 'fein':
      // FEIN format: XX-XXXXXXX
      const digits = normalized.replace(/\D/g, '');
      if (digits.length === 9) {
        normalized = `${digits.slice(0, 2)}-${digits.slice(2)}`;
      }
      break;

    case 'policy_number':
    default:
      // Remove extra whitespace, standardize separators
      normalized = normalized.replace(/\s+/g, ' ').toUpperCase();
      break;
  }

  return { value: normalized, rawValue };
}

// =============================================================================
// COUNT NORMALIZATION
// =============================================================================

export function normalizeCount(rawValue: string): { value: number; rawValue: string } | null {
  if (!rawValue || rawValue.trim() === '') return null;

  const cleaned = rawValue.trim();

  // Extract numeric value
  const match = cleaned.match(/^(\d+)/);
  if (match) {
    return { value: parseInt(match[1], 10), rawValue };
  }

  return null;
}

// =============================================================================
// MASTER NORMALIZATION FUNCTION
// =============================================================================

export function normalizeValue(rawValue: string | null, fieldType: FieldType): NormalizedValue {
  if (rawValue === null || rawValue.trim() === '') {
    return { type: 'not_found' };
  }

  switch (fieldType) {
    case 'currency': {
      const result = normalizeCurrency(rawValue);
      if (result) {
        return { type: 'currency', value: result };
      }
      return { type: 'text', value: rawValue.trim(), rawValue };
    }

    case 'date': {
      const result = normalizeDate(rawValue);
      if (result) {
        return { type: 'date', value: result };
      }
      return { type: 'text', value: rawValue.trim(), rawValue };
    }

    case 'boolean': {
      const result = normalizeBoolean(rawValue);
      return { type: 'boolean', ...result };
    }

    case 'limit':
    case 'deductible': {
      const result = normalizeLimit(rawValue);
      if (result) {
        return { type: 'limit', value: result };
      }
      return { type: 'text', value: rawValue.trim(), rawValue };
    }

    case 'percentage': {
      const result = normalizePercentage(rawValue);
      if (result) {
        return { type: 'percentage', ...result };
      }
      return { type: 'text', value: rawValue.trim(), rawValue };
    }

    case 'list': {
      const result = normalizeList(rawValue);
      return { type: 'list', ...result };
    }

    case 'identifier': {
      const result = normalizeIdentifier(rawValue);
      return { type: 'identifier', ...result };
    }

    case 'count': {
      const result = normalizeCount(rawValue);
      if (result) {
        return { type: 'count', ...result };
      }
      return { type: 'text', value: rawValue.trim(), rawValue };
    }

    case 'text':
    default: {
      return { type: 'text', value: rawValue.trim(), rawValue };
    }
  }
}

// =============================================================================
// COMPARISON HELPERS
// =============================================================================

/**
 * Compare two normalized values for equality
 */
export function areNormalizedValuesEqual(a: NormalizedValue, b: NormalizedValue): boolean {
  if (a.type !== b.type) return false;

  switch (a.type) {
    case 'currency':
      return a.value.amount === (b as typeof a).value.amount;

    case 'date':
      return a.value.isoDate === (b as typeof a).value.isoDate;

    case 'boolean':
      return a.value === (b as typeof a).value;

    case 'limit':
      const bLimit = b as typeof a;
      return a.value.amount === bLimit.value.amount &&
             a.value.qualifier === bLimit.value.qualifier;

    case 'percentage':
      return a.value === (b as typeof a).value;

    case 'count':
      return a.value === (b as typeof a).value;

    case 'list':
      const aList = a.value.sort();
      const bList = (b as typeof a).value.sort();
      return aList.length === bList.length &&
             aList.every((item, i) => item === bList[i]);

    case 'text':
    case 'identifier':
      return a.value.toLowerCase() === (b as typeof a).value.toLowerCase();

    case 'not_found':
      return b.type === 'not_found';

    case 'conflict':
      return false; // Conflicts are never equal

    default:
      return false;
  }
}

/**
 * Get display value from normalized value
 */
export function getDisplayValue(value: NormalizedValue): string {
  switch (value.type) {
    case 'currency':
      return value.value.formatted;
    case 'date':
      return value.value.formatted;
    case 'boolean':
      return value.value === 'yes' ? 'Yes' :
             value.value === 'no' ? 'No' :
             value.value === 'included' ? 'Included' :
             value.value === 'excluded' ? 'Excluded' : 'Unknown';
    case 'limit':
      return value.value.formatted;
    case 'percentage':
      return `${value.value}%`;
    case 'count':
      return value.value.toString();
    case 'list':
      return value.value.join(', ') || 'None';
    case 'text':
    case 'identifier':
      return value.value;
    case 'not_found':
      return 'Not Found';
    case 'conflict':
      return `Conflict: ${value.candidates.join(' vs ')}`;
    default:
      return '';
  }
}

/**
 * Calculate numeric difference between normalized values
 * Returns null if not comparable
 */
export function getNumericDifference(a: NormalizedValue, b: NormalizedValue): { absolute: number; percentage: number } | null {
  const aNum = extractNumericFromNormalized(a);
  const bNum = extractNumericFromNormalized(b);

  if (aNum === null || bNum === null) return null;

  const absolute = bNum - aNum;
  const percentage = aNum !== 0 ? ((bNum - aNum) / aNum) * 100 : (bNum !== 0 ? 100 : 0);

  return { absolute, percentage };
}

function extractNumericFromNormalized(value: NormalizedValue): number | null {
  switch (value.type) {
    case 'currency':
      return value.value.amount;
    case 'limit':
      return value.value.amount;
    case 'percentage':
      return value.value;
    case 'count':
      return value.value;
    default:
      return null;
  }
}
