import { z } from 'zod';

// Phone number regex - flexible to handle various formats like (XXX) XXX-XXXX
const phoneRegex = /^[\d\s\-().\+]+$/;

// US State codes
const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC', 'PR', 'VI', 'GU', 'AS', 'MP'
];

/**
 * Schema for a single contact import record from CSV
 */
export const ContactImportSchema = z.object({
  master_id: z.string().min(1, 'Master ID is required'),
  source_file: z.string().optional(),
  source_date: z.string().optional(),
  contact_type: z.enum(['individual', 'business'], {
    errorMap: () => ({ message: 'Contact type must be "individual" or "business"' })
  }),
  first_name: z.string().optional().transform(v => v?.trim() || ''),
  last_name: z.string().optional().transform(v => v?.trim() || ''),
  business_name: z.string().optional().transform(v => v?.trim() || ''),
  dba: z.string().optional().transform(v => v?.trim() || ''),
  email_primary: z.string()
    .optional()
    .transform(v => v?.trim().toLowerCase() || '')
    .refine(v => !v || z.string().email().safeParse(v).success, {
      message: 'Invalid email format'
    }),
  email_secondary: z.string()
    .optional()
    .transform(v => v?.trim().toLowerCase() || '')
    .refine(v => !v || z.string().email().safeParse(v).success, {
      message: 'Invalid secondary email format'
    }),
  phone_primary: z.string()
    .optional()
    .transform(v => v?.trim() || '')
    .refine(v => !v || phoneRegex.test(v), {
      message: 'Invalid phone format'
    }),
  phone_secondary: z.string().optional().transform(v => v?.trim() || ''),
  phone_mobile: z.string().optional().transform(v => v?.trim() || ''),
  phone_fax: z.string().optional().transform(v => v?.trim() || ''),
  address_street: z.string().optional().transform(v => v?.trim() || ''),
  address_street2: z.string().optional().transform(v => v?.trim() || ''),
  address_city: z.string().optional().transform(v => v?.trim() || ''),
  address_state: z.string()
    .optional()
    .transform(v => v?.trim().toUpperCase() || '')
    .refine(v => !v || US_STATES.includes(v), {
      message: 'Invalid state code'
    }),
  address_zip: z.string()
    .optional()
    .transform(v => v?.trim() || '')
    .refine(v => !v || /^\d{5}(-\d{4})?$/.test(v), {
      message: 'ZIP must be 5 or 9 digits (XXXXX or XXXXX-XXXX)'
    }),
  website: z.string().optional().transform(v => v?.trim() || ''),
  notes: z.string().optional().transform(v => v?.trim() || ''),
  tags: z.string().optional().transform(v => v?.trim() || ''),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  duplicate_group: z.string().optional().transform(v => v?.trim() || ''),
  is_primary: z.union([
    z.boolean(),
    z.string().transform(v => v.toLowerCase() === 'true' || v === '1')
  ]).default(true),
}).refine(data => {
  // Individuals require first_name AND last_name
  if (data.contact_type === 'individual') {
    return data.first_name && data.last_name;
  }
  // Businesses require business_name OR dba
  return data.business_name || data.dba;
}, {
  message: 'Individuals require first and last name; businesses require business name or DBA',
  path: ['contact_type']
});

/**
 * Schema for a single policy import record from CSV
 */
export const PolicyImportSchema = z.object({
  policy_id: z.string().min(1, 'Policy ID is required'),
  customer_id: z.string().min(1, 'Customer ID is required for linking'),
  carrier: z.string().min(1, 'Carrier is required'),
  policy_number: z.string().min(1, 'Policy number is required'),
  product_type: z.string().min(1, 'Product type is required'),
  effective_date: z.string()
    .min(1, 'Effective date is required')
    .refine(v => !isNaN(Date.parse(v)), {
      message: 'Invalid effective date format'
    }),
  expiration_date: z.string()
    .min(1, 'Expiration date is required')
    .refine(v => !isNaN(Date.parse(v)), {
      message: 'Invalid expiration date format'
    }),
  premium: z.union([
    z.number(),
    z.string().transform(v => {
      // Remove currency symbols and commas
      const cleaned = v.replace(/[$,]/g, '').trim();
      return cleaned ? parseFloat(cleaned) : null;
    })
  ]).optional().nullable(),
  status: z.string().optional().default('active'),
  source_file: z.string().optional(),
}).refine(data => {
  // Expiration must be after effective
  const effective = new Date(data.effective_date);
  const expiration = new Date(data.expiration_date);
  return expiration > effective;
}, {
  message: 'Expiration date must be after effective date',
  path: ['expiration_date']
});

export type ContactImportRecord = z.infer<typeof ContactImportSchema>;
export type PolicyImportRecord = z.infer<typeof PolicyImportSchema>;

/**
 * Validation result for a single row
 */
export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  errors: Array<{
    field: string;
    message: string;
  }>;
  rowNumber: number;
  sourceId?: string;
}

/**
 * Batch validation summary
 */
export interface BatchValidationSummary {
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  skippedRecords: number;
  errors: Array<{
    rowNumber: number;
    sourceId: string;
    field: string;
    message: string;
    rawValue?: string;
  }>;
}

/**
 * Validate a batch of contact records
 */
export function validateContacts(
  records: Record<string, unknown>[],
  skipNonPrimary: boolean = true
): { results: ValidationResult<ContactImportRecord>[]; summary: BatchValidationSummary } {
  const results: ValidationResult<ContactImportRecord>[] = [];
  const errors: BatchValidationSummary['errors'] = [];
  let validCount = 0;
  let invalidCount = 0;
  let skippedCount = 0;

  records.forEach((record, index) => {
    const rowNumber = index + 1;
    const sourceId = String(record.master_id || `row_${rowNumber}`);

    // Check if this is a non-primary record that should be skipped
    const isPrimary = record.is_primary === true ||
                      record.is_primary === 'true' ||
                      record.is_primary === '1' ||
                      record.is_primary === undefined;

    if (skipNonPrimary && !isPrimary) {
      skippedCount++;
      results.push({
        valid: false,
        errors: [{ field: 'is_primary', message: 'Skipped: not primary record' }],
        rowNumber,
        sourceId,
      });
      return;
    }

    const parsed = ContactImportSchema.safeParse(record);

    if (parsed.success) {
      validCount++;
      results.push({
        valid: true,
        data: parsed.data,
        errors: [],
        rowNumber,
        sourceId,
      });
    } else {
      invalidCount++;
      const rowErrors = parsed.error.errors.map(e => ({
        field: e.path.join('.') || 'record',
        message: e.message,
      }));

      results.push({
        valid: false,
        errors: rowErrors,
        rowNumber,
        sourceId,
      });

      rowErrors.forEach(err => {
        errors.push({
          rowNumber,
          sourceId,
          field: err.field,
          message: err.message,
          rawValue: String(record[err.field] ?? ''),
        });
      });
    }
  });

  return {
    results,
    summary: {
      totalRecords: records.length,
      validRecords: validCount,
      invalidRecords: invalidCount,
      skippedRecords: skippedCount,
      errors,
    },
  };
}

/**
 * Validate a batch of policy records
 */
export function validatePolicies(
  records: Record<string, unknown>[],
  validCustomerIds: Set<string>
): { results: ValidationResult<PolicyImportRecord>[]; summary: BatchValidationSummary } {
  const results: ValidationResult<PolicyImportRecord>[] = [];
  const errors: BatchValidationSummary['errors'] = [];
  let validCount = 0;
  let invalidCount = 0;
  let skippedCount = 0;

  records.forEach((record, index) => {
    const rowNumber = index + 1;
    const sourceId = String(record.policy_id || `row_${rowNumber}`);
    const customerId = String(record.customer_id || '');

    // Check if customer exists
    if (customerId && !validCustomerIds.has(customerId)) {
      skippedCount++;
      results.push({
        valid: false,
        errors: [{ field: 'customer_id', message: `Customer ID "${customerId}" not found in contacts` }],
        rowNumber,
        sourceId,
      });
      errors.push({
        rowNumber,
        sourceId,
        field: 'customer_id',
        message: `Customer ID "${customerId}" not found in contacts`,
        rawValue: customerId,
      });
      return;
    }

    const parsed = PolicyImportSchema.safeParse(record);

    if (parsed.success) {
      validCount++;
      results.push({
        valid: true,
        data: parsed.data,
        errors: [],
        rowNumber,
        sourceId,
      });
    } else {
      invalidCount++;
      const rowErrors = parsed.error.errors.map(e => ({
        field: e.path.join('.') || 'record',
        message: e.message,
      }));

      results.push({
        valid: false,
        errors: rowErrors,
        rowNumber,
        sourceId,
      });

      rowErrors.forEach(err => {
        errors.push({
          rowNumber,
          sourceId,
          field: err.field,
          message: err.message,
          rawValue: String(record[err.field] ?? ''),
        });
      });
    }
  });

  return {
    results,
    summary: {
      totalRecords: records.length,
      validRecords: validCount,
      invalidRecords: invalidCount,
      skippedRecords: skippedCount,
      errors,
    },
  };
}

/**
 * Map contact_type to account type for database
 */
export function mapContactTypeToAccountType(contactType: 'individual' | 'business'): 'household' | 'business' {
  return contactType === 'individual' ? 'household' : 'business';
}

/**
 * Map product_type to line_of_business
 */
export function mapProductTypeToLineOfBusiness(productType: string): string {
  const mapping: Record<string, string> = {
    // Common variations
    'Auto': 'auto',
    'AUTO': 'auto',
    'Personal Auto': 'auto',
    'HO3': 'home',
    'HO-3': 'home',
    'Homeowners': 'home',
    'Home': 'home',
    'Renters': 'renters',
    'HO4': 'renters',
    'HO-4': 'renters',
    'Umbrella': 'umbrella',
    'GL': 'gl',
    'General Liability': 'gl',
    'BOP': 'bop',
    'Business Owners': 'bop',
    'Commercial Auto': 'commercial_auto',
    'Workers Comp': 'workers_comp',
    'WC': 'workers_comp',
    'Property': 'property',
    'Commercial Property': 'property',
    'Life': 'life',
    'Health': 'health',
  };

  const normalized = mapping[productType];
  if (normalized) return normalized;

  // Try case-insensitive match
  const lowerKey = Object.keys(mapping).find(
    k => k.toLowerCase() === productType.toLowerCase()
  );
  if (lowerKey) return mapping[lowerKey];

  // Return as-is (lowercase) if no mapping found
  return productType.toLowerCase().replace(/\s+/g, '_');
}

/**
 * Normalize phone number to digits only
 */
export function normalizePhone(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  // If 10 digits, add US country code
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  // If 11 digits starting with 1, format as +1
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  return digits;
}

/**
 * Build account name from contact record
 */
export function buildAccountName(contact: ContactImportRecord): string {
  if (contact.contact_type === 'individual') {
    return `${contact.first_name} ${contact.last_name}`.trim();
  }
  return contact.business_name || contact.dba || 'Unknown Business';
}

/**
 * Extract secondary contact info for JSONB storage
 */
export function extractSecondaryContactInfo(contact: ContactImportRecord): Record<string, unknown> {
  const secondary: Record<string, unknown> = {};

  const secondaryPhones: string[] = [];
  if (contact.phone_secondary) secondaryPhones.push(contact.phone_secondary);
  if (contact.phone_mobile) secondaryPhones.push(contact.phone_mobile);
  if (contact.phone_fax) secondaryPhones.push(contact.phone_fax);

  if (secondaryPhones.length > 0) {
    secondary.secondary_phones = secondaryPhones;
  }

  if (contact.email_secondary) {
    secondary.secondary_emails = [contact.email_secondary];
  }

  if (contact.dba && contact.business_name) {
    secondary.dba = contact.dba;
  }

  if (contact.website) {
    secondary.website = contact.website;
  }

  if (contact.notes) {
    secondary.notes = contact.notes;
  }

  if (contact.tags) {
    secondary.tags = contact.tags.split(',').map(t => t.trim()).filter(Boolean);
  }

  return secondary;
}

/**
 * Generate CSV error report content
 */
export function generateErrorReportCSV(errors: BatchValidationSummary['errors']): string {
  const headers = ['Row Number', 'Source ID', 'Field', 'Error', 'Raw Value'];
  const rows = errors.map(e => [
    String(e.rowNumber),
    e.sourceId,
    e.field,
    e.message,
    e.rawValue || '',
  ]);

  const escapeCSV = (val: string): string => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  return [
    headers.map(escapeCSV).join(','),
    ...rows.map(row => row.map(escapeCSV).join(','))
  ].join('\n');
}
