// ============================================
// ACORD Repeater Engine
// Handles arrays of data (vehicles, drivers, locations)
// across multiple form fields and pages
// ============================================

import { PDFDocument } from 'pdf-lib';
import type { RepeaterConfig } from '@/types/acord';

// ============================================
// TYPES
// ============================================

export interface RepeaterData {
  sourceArrayPath: string;
  items: Record<string, any>[];
}

export interface RepeaterResult {
  fieldMappings: Record<string, any>;
  overflowItems: Record<string, any>[];
  additionalPagesNeeded: number;
  warnings: string[];
}

export interface PageCloneResult {
  pdfBytes: Uint8Array;
  totalPages: number;
  fieldMappingsPerPage: Record<string, any>[];
}

// ============================================
// ACORD FIELD PATTERNS
// Common patterns for repeating fields in ACORD forms
// ============================================

const ACORD_REPEATER_PATTERNS = {
  // ACORD 127 - Commercial Auto
  vehicles: {
    prefix: 'Veh',
    fields: ['Year', 'Make', 'Model', 'VIN', 'GVW', 'Radius', 'Value', 'Cost', 'Deductible'],
    itemsPerPage: 5,
    startIndex: 1,
  },
  drivers: {
    prefix: 'Driver',
    fields: ['Name', 'DOB', 'LicenseNumber', 'LicenseState', 'YearsExp', 'Accidents', 'Violations'],
    itemsPerPage: 6,
    startIndex: 1,
  },
  // ACORD 140 - Property
  locations: {
    prefix: 'Loc',
    fields: ['Address', 'City', 'State', 'Zip', 'BldgValue', 'BPPValue', 'Construction', 'YearBuilt'],
    itemsPerPage: 4,
    startIndex: 1,
  },
  buildings: {
    prefix: 'Bldg',
    fields: ['Number', 'Description', 'Value', 'Construction', 'Occupancy', 'Protection', 'Stories'],
    itemsPerPage: 3,
    startIndex: 1,
  },
  // ACORD 130 - Workers Comp
  classifications: {
    prefix: 'Class',
    fields: ['Code', 'Description', 'Payroll', 'Rate', 'Premium', 'Employees'],
    itemsPerPage: 8,
    startIndex: 1,
  },
  // ACORD 126 - General Liability
  additionalInsureds: {
    prefix: 'AddIns',
    fields: ['Name', 'Address', 'Relationship', 'Interest'],
    itemsPerPage: 4,
    startIndex: 1,
  },
};

// ============================================
// MAIN FUNCTIONS
// ============================================

/**
 * Process repeater data and generate field mappings
 */
export function processRepeaterData(
  config: RepeaterConfig,
  items: Record<string, any>[]
): RepeaterResult {
  const warnings: string[] = [];
  const fieldMappings: Record<string, any> = {};
  const overflowItems: Record<string, any>[] = [];

  const { itemsPerPage, namingPattern, fieldMap, startIndex = 1 } = config;

  // Process items that fit on the first page
  const firstPageItems = items.slice(0, itemsPerPage);
  const remainingItems = items.slice(itemsPerPage);

  // Map fields for first page items
  firstPageItems.forEach((item, arrayIndex) => {
    const formIndex = arrayIndex + startIndex;

    Object.entries(fieldMap).forEach(([sourceField, targetPattern]) => {
      const value = getNestedValue(item, sourceField);
      if (value !== undefined && value !== null) {
        const fieldName = buildFieldName(targetPattern, formIndex, sourceField);
        fieldMappings[fieldName] = value;
      }
    });

    // Also process any fields in the item that match known patterns
    Object.entries(item).forEach(([key, value]) => {
      if (!fieldMap[key] && value !== undefined && value !== null) {
        // Try to auto-detect field mapping
        const autoFieldName = detectFieldName(config.sourceArrayPath, key, formIndex);
        if (autoFieldName) {
          fieldMappings[autoFieldName] = value;
        }
      }
    });
  });

  // Track overflow items
  if (remainingItems.length > 0) {
    overflowItems.push(...remainingItems);
    warnings.push(
      `${remainingItems.length} items exceed page capacity and will require additional pages`
    );
  }

  const additionalPagesNeeded = Math.ceil(remainingItems.length / itemsPerPage);

  return {
    fieldMappings,
    overflowItems,
    additionalPagesNeeded,
    warnings,
  };
}

/**
 * Process all repeaters in form data
 */
export function processAllRepeaters(
  formData: Record<string, any>,
  repeaterConfigs: RepeaterConfig[]
): {
  fieldMappings: Record<string, any>;
  overflowData: Record<string, RepeaterResult>;
  warnings: string[];
} {
  const allFieldMappings: Record<string, any> = {};
  const overflowData: Record<string, RepeaterResult> = {};
  const allWarnings: string[] = [];

  for (const config of repeaterConfigs) {
    const items = getNestedValue(formData, config.sourceArrayPath);

    if (!Array.isArray(items)) {
      continue;
    }

    const result = processRepeaterData(config, items);

    // Merge field mappings
    Object.assign(allFieldMappings, result.fieldMappings);

    // Track overflow
    if (result.overflowItems.length > 0) {
      overflowData[config.sourceArrayPath] = result;
    }

    allWarnings.push(...result.warnings);
  }

  return {
    fieldMappings: allFieldMappings,
    overflowData,
    warnings: allWarnings,
  };
}

/**
 * Clone PDF pages for overflow items
 */
export async function clonePagesForOverflow(
  pdfBytes: Uint8Array,
  pageToClone: number,
  overflowResult: RepeaterResult,
  config: RepeaterConfig
): Promise<PageCloneResult> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const fieldMappingsPerPage: Record<string, any>[] = [];

  // First page mappings are already in the original
  fieldMappingsPerPage.push({});

  const { itemsPerPage, startIndex = 1 } = config;
  const { overflowItems } = overflowResult;

  // Clone pages for each batch of overflow items
  const numOverflowPages = Math.ceil(overflowItems.length / itemsPerPage);

  for (let pageNum = 0; pageNum < numOverflowPages; pageNum++) {
    // Copy the page
    const [copiedPage] = await pdfDoc.copyPages(pdfDoc, [pageToClone - 1]);
    pdfDoc.addPage(copiedPage);

    // Calculate field mappings for this page
    const pageFieldMappings: Record<string, any> = {};
    const startItemIndex = pageNum * itemsPerPage;
    const endItemIndex = Math.min(startItemIndex + itemsPerPage, overflowItems.length);
    const pageItems = overflowItems.slice(startItemIndex, endItemIndex);

    pageItems.forEach((item, arrayIndex) => {
      const formIndex = arrayIndex + startIndex;

      Object.entries(config.fieldMap).forEach(([sourceField, targetPattern]) => {
        const value = getNestedValue(item, sourceField);
        if (value !== undefined && value !== null) {
          const fieldName = buildFieldName(targetPattern, formIndex, sourceField);
          pageFieldMappings[fieldName] = value;
        }
      });
    });

    fieldMappingsPerPage.push(pageFieldMappings);
  }

  const resultBytes = await pdfDoc.save();

  return {
    pdfBytes: new Uint8Array(resultBytes),
    totalPages: pdfDoc.getPageCount(),
    fieldMappingsPerPage,
  };
}

/**
 * Merge multiple PDFs (for continuation forms)
 */
export async function mergePdfsForOverflow(
  mainPdfBytes: Uint8Array,
  continuationPdfBytes: Uint8Array,
  overflowFieldMappings: Record<string, any>[]
): Promise<Uint8Array> {
  const mainDoc = await PDFDocument.load(mainPdfBytes);
  const contDoc = await PDFDocument.load(continuationPdfBytes);

  // Copy all pages from continuation form
  const contPages = await mainDoc.copyPages(contDoc, contDoc.getPageIndices());
  contPages.forEach(page => mainDoc.addPage(page));

  const resultBytes = await mainDoc.save();
  return new Uint8Array(resultBytes);
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Build field name from pattern
 * Pattern examples: "{prefix}_{field}_{index}", "Veh{index}{field}"
 */
function buildFieldName(pattern: string, index: number, field: string): string {
  return pattern
    .replace('{index}', String(index))
    .replace('{field}', field)
    .replace(/\{prefix\}/gi, '');
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: Record<string, any>, path: string): any {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

/**
 * Detect field name based on common ACORD patterns
 */
function detectFieldName(arrayType: string, fieldKey: string, index: number): string | null {
  // Normalize array type
  const normalizedType = arrayType.toLowerCase().replace(/s$/, ''); // Remove trailing 's'

  // Try to find a matching pattern
  for (const [patternKey, pattern] of Object.entries(ACORD_REPEATER_PATTERNS)) {
    if (patternKey.toLowerCase().includes(normalizedType) || normalizedType.includes(patternKey.toLowerCase())) {
      // Check if field matches any known fields
      const matchingField = pattern.fields.find(
        f => f.toLowerCase() === fieldKey.toLowerCase() || fieldKey.toLowerCase().includes(f.toLowerCase())
      );

      if (matchingField) {
        return `${pattern.prefix}_${matchingField}_${index}`;
      }
    }
  }

  return null;
}

/**
 * Detect repeater type from data structure
 */
export function detectRepeaterType(
  data: Record<string, any>
): { path: string; type: keyof typeof ACORD_REPEATER_PATTERNS }[] {
  const detected: { path: string; type: keyof typeof ACORD_REPEATER_PATTERNS }[] = [];

  const checkObject = (obj: Record<string, any>, prefix: string = '') => {
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;

      if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
        // Check if this matches a known repeater pattern
        const lowerKey = key.toLowerCase();
        for (const patternKey of Object.keys(ACORD_REPEATER_PATTERNS)) {
          if (lowerKey.includes(patternKey.toLowerCase()) || patternKey.toLowerCase().includes(lowerKey.replace(/s$/, ''))) {
            detected.push({ path, type: patternKey as keyof typeof ACORD_REPEATER_PATTERNS });
            break;
          }
        }
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        checkObject(value, path);
      }
    }
  };

  checkObject(data);
  return detected;
}

/**
 * Create default repeater config for detected type
 */
export function createDefaultRepeaterConfig(
  path: string,
  type: keyof typeof ACORD_REPEATER_PATTERNS
): RepeaterConfig {
  const pattern = ACORD_REPEATER_PATTERNS[type];

  const fieldMap: Record<string, string> = {};
  for (const field of pattern.fields) {
    fieldMap[field.toLowerCase()] = `${pattern.prefix}_${field}_{index}`;
  }

  return {
    id: `repeater_${type}`,
    sourceArrayPath: path,
    itemsPerPage: pattern.itemsPerPage,
    overflowStrategy: 'clone_page',
    namingPattern: `${pattern.prefix}_{field}_{index}`,
    fieldMap,
    startIndex: pattern.startIndex,
  };
}

/**
 * Validate repeater configuration
 */
export function validateRepeaterConfig(config: RepeaterConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.sourceArrayPath) {
    errors.push('Source array path is required');
  }

  if (!config.itemsPerPage || config.itemsPerPage < 1) {
    errors.push('Items per page must be at least 1');
  }

  if (!config.namingPattern) {
    errors.push('Naming pattern is required');
  }

  if (!config.overflowStrategy) {
    errors.push('Overflow strategy is required');
  }

  if (config.overflowStrategy === 'append_continuation_form' && !config.continuationFormNumber) {
    errors.push('Continuation form number is required when using append_continuation_form strategy');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Calculate how many pages are needed for items
 */
export function calculatePagesNeeded(
  itemCount: number,
  itemsPerPage: number
): { firstPageItems: number; additionalPages: number; overflowItems: number } {
  const firstPageItems = Math.min(itemCount, itemsPerPage);
  const overflowItems = Math.max(0, itemCount - itemsPerPage);
  const additionalPages = Math.ceil(overflowItems / itemsPerPage);

  return {
    firstPageItems,
    additionalPages,
    overflowItems,
  };
}
