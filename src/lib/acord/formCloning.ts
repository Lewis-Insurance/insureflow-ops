// ============================================
// ACORD Form Cloning System
// Clone forms between accounts with smart field replacement
// ============================================

import { supabase } from '@/integrations/supabase/client';
import type { AcordForm, AcordTemplate } from '@/types/acord';

// ============================================
// TYPES
// ============================================

export interface CloneOptions {
  /** Copy values for these field name patterns */
  copyFieldPatterns?: string[];
  /** Skip these field name patterns */
  skipFieldPatterns?: string[];
  /** Replace field values with these */
  fieldReplacements?: Record<string, any>;
  /** Whether to copy signature-related fields */
  copySignatureFields?: boolean;
  /** Whether to copy loss history */
  copyLossHistory?: boolean;
  /** Whether to preserve dates */
  preserveDates?: boolean;
  /** Add notes explaining this is cloned */
  addCloneNote?: boolean;
}

export interface CloneResult {
  success: boolean;
  clonedFormId?: string;
  fieldsCopied: number;
  fieldsSkipped: number;
  fieldsReplaced: number;
  warnings: string[];
  error?: string;
}

export interface CloneSuggestion {
  fieldName: string;
  fieldLabel: string;
  sourceValue: any;
  suggestedAction: 'copy' | 'clear' | 'replace';
  replacementValue?: any;
  reason: string;
}

export interface ClonePreview {
  sourceForm: {
    id: string;
    formNumber: string;
    accountName: string;
  };
  targetAccount: {
    id: string;
    accountName: string;
  };
  suggestions: CloneSuggestion[];
  estimatedFieldsToCopy: number;
  estimatedFieldsToSkip: number;
}

// ============================================
// FIELD CATEGORIZATION
// ============================================

/**
 * Fields that are typically account-specific and should be replaced
 */
const ACCOUNT_SPECIFIC_FIELDS = [
  'applicant_name',
  'business_name',
  'insured_name',
  'dba',
  'applicant_address',
  'applicant_city',
  'applicant_state',
  'applicant_zip',
  'mailing_address',
  'phone',
  'fax',
  'email',
  'website',
  'fein',
  'ein',
  'ssn',
  'contact_name',
  'contact_phone',
  'contact_email',
];

/**
 * Fields that should typically be cleared (signatures, dates)
 */
const CLEAR_FIELDS = [
  'signature',
  'signed_date',
  'signature_date',
  'applicant_signature',
  'agent_signature',
  'witness_signature',
  'effective_date',
  'expiration_date',
  'policy_number',
  'quote_number',
  'submission_date',
];

/**
 * Fields that are typically reusable across similar accounts
 */
const REUSABLE_FIELDS = [
  'class_code',
  'sic_code',
  'naics_code',
  'classification',
  'business_type',
  'years_in_business',
  'operations_description',
  'coverage_',
  'limit_',
  'deductible',
  'radius_of_operation',
  'territory',
];

// ============================================
// CLONING FUNCTIONS
// ============================================

/**
 * Generate a preview of what would happen when cloning a form
 */
export async function previewClone(
  sourceFormId: string,
  targetAccountId: string,
  options: CloneOptions = {}
): Promise<ClonePreview | null> {
  try {
    // Get source form with template
    const { data: sourceForm, error: formError } = await supabase
      .from('acord_forms')
      .select(`
        *,
        template:template_id(form_number, form_name, field_schema),
        account:account_id(business_name)
      `)
      .eq('id', sourceFormId)
      .single();

    if (formError) throw formError;

    // Get target account
    const { data: targetAccount, error: accountError } = await supabase
      .from('accounts')
      .select('id, business_name')
      .eq('id', targetAccountId)
      .single();

    if (accountError) throw accountError;

    const fieldValues = sourceForm.field_values || {};
    const suggestions: CloneSuggestion[] = [];
    let copyCount = 0;
    let skipCount = 0;

    // Analyze each field
    for (const [fieldName, value] of Object.entries(fieldValues)) {
      const lowercaseName = fieldName.toLowerCase();
      let action: CloneSuggestion['suggestedAction'] = 'copy';
      let reason = 'Business data can be reused for similar accounts';
      let replacementValue: any = undefined;

      // Check if account-specific
      if (ACCOUNT_SPECIFIC_FIELDS.some(f => lowercaseName.includes(f))) {
        action = 'replace';
        reason = 'Account-specific field that should use target account data';
        skipCount++;

        // Try to get replacement from target account
        if (lowercaseName.includes('name') || lowercaseName.includes('insured')) {
          replacementValue = targetAccount.business_name;
        }
      }
      // Check if should be cleared
      else if (CLEAR_FIELDS.some(f => lowercaseName.includes(f))) {
        if (options.copySignatureFields && lowercaseName.includes('signature')) {
          action = 'copy';
        } else if (options.preserveDates && lowercaseName.includes('date')) {
          action = 'copy';
        } else {
          action = 'clear';
          reason = 'Signatures and specific dates should not be copied';
          skipCount++;
        }
      }
      // Check if reusable
      else if (REUSABLE_FIELDS.some(f => lowercaseName.includes(f))) {
        action = 'copy';
        reason = 'This field typically has the same values for similar businesses';
        copyCount++;
      }
      // Check custom patterns
      else if (options.skipFieldPatterns?.some(p => new RegExp(p, 'i').test(fieldName))) {
        action = 'clear';
        reason = 'Field matches skip pattern';
        skipCount++;
      }
      else if (options.copyFieldPatterns?.some(p => new RegExp(p, 'i').test(fieldName))) {
        action = 'copy';
        reason = 'Field matches copy pattern';
        copyCount++;
      }
      else {
        copyCount++;
      }

      // Check for explicit replacements
      if (options.fieldReplacements?.[fieldName] !== undefined) {
        action = 'replace';
        replacementValue = options.fieldReplacements[fieldName];
        reason = 'Explicit replacement value provided';
      }

      suggestions.push({
        fieldName,
        fieldLabel: formatFieldName(fieldName),
        sourceValue: value,
        suggestedAction: action,
        replacementValue,
        reason,
      });
    }

    return {
      sourceForm: {
        id: sourceForm.id,
        formNumber: (sourceForm.template as any)?.form_number,
        accountName: (sourceForm.account as any)?.business_name,
      },
      targetAccount: {
        id: targetAccount.id,
        accountName: targetAccount.business_name,
      },
      suggestions,
      estimatedFieldsToCopy: copyCount,
      estimatedFieldsToSkip: skipCount,
    };
  } catch (error) {
    console.error('Failed to preview clone:', error);
    return null;
  }
}

/**
 * Clone a form to another account
 */
export async function cloneForm(
  sourceFormId: string,
  targetAccountId: string,
  options: CloneOptions = {}
): Promise<CloneResult> {
  const result: CloneResult = {
    success: false,
    fieldsCopied: 0,
    fieldsSkipped: 0,
    fieldsReplaced: 0,
    warnings: [],
  };

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Get source form
    const { data: sourceForm, error: formError } = await supabase
      .from('acord_forms')
      .select('*')
      .eq('id', sourceFormId)
      .single();

    if (formError) throw formError;

    // Get target account info for replacements
    const { data: targetAccount } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', targetAccountId)
      .single();

    const sourceValues = sourceForm.field_values || {};
    const newValues: Record<string, any> = {};

    // Process each field
    for (const [fieldName, value] of Object.entries(sourceValues)) {
      const lowercaseName = fieldName.toLowerCase();

      // Check explicit replacements first
      if (options.fieldReplacements?.[fieldName] !== undefined) {
        newValues[fieldName] = options.fieldReplacements[fieldName];
        result.fieldsReplaced++;
        continue;
      }

      // Check skip patterns
      if (options.skipFieldPatterns?.some(p => new RegExp(p, 'i').test(fieldName))) {
        result.fieldsSkipped++;
        continue;
      }

      // Handle account-specific fields
      if (ACCOUNT_SPECIFIC_FIELDS.some(f => lowercaseName.includes(f))) {
        // Try to populate from target account
        const replacement = getAccountFieldValue(targetAccount, fieldName);
        if (replacement !== undefined) {
          newValues[fieldName] = replacement;
          result.fieldsReplaced++;
        } else {
          result.fieldsSkipped++;
          result.warnings.push(`Skipped account-specific field: ${fieldName}`);
        }
        continue;
      }

      // Handle signature/date fields
      if (CLEAR_FIELDS.some(f => lowercaseName.includes(f))) {
        if (lowercaseName.includes('signature') && options.copySignatureFields) {
          newValues[fieldName] = value;
          result.fieldsCopied++;
        } else if (lowercaseName.includes('date') && options.preserveDates) {
          newValues[fieldName] = value;
          result.fieldsCopied++;
        } else {
          result.fieldsSkipped++;
        }
        continue;
      }

      // Handle loss history
      if (lowercaseName.includes('loss') || lowercaseName.includes('claim')) {
        if (options.copyLossHistory) {
          newValues[fieldName] = value;
          result.fieldsCopied++;
        } else {
          result.fieldsSkipped++;
          result.warnings.push(`Skipped loss history field: ${fieldName}`);
        }
        continue;
      }

      // Default: copy the value
      newValues[fieldName] = value;
      result.fieldsCopied++;
    }

    // Create the cloned form
    const { data: newForm, error: createError } = await supabase
      .from('acord_forms')
      .insert({
        account_id: targetAccountId,
        template_id: sourceForm.template_id,
        field_values: newValues,
        has_addendum: false,
        cloned_from: sourceFormId,
        signature_status: 'unsigned',
        submission_status: 'draft',
        created_by: user.id,
        row_version: 1,
      })
      .select()
      .single();

    if (createError) throw createError;

    result.success = true;
    result.clonedFormId = newForm.id;

    // Add clone note to audit trail
    if (options.addCloneNote) {
      await supabase.from('acord_field_audit').insert({
        acord_form_id: newForm.id,
        field_name: '__clone__',
        old_value: sourceFormId,
        new_value: targetAccountId,
        is_encrypted: false,
        changed_by: user.id,
        change_source: 'clone',
      });
    }

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Clone failed';
    return result;
  }
}

/**
 * Clone multiple forms at once
 */
export async function batchCloneForms(
  sourceFormIds: string[],
  targetAccountId: string,
  options: CloneOptions = {}
): Promise<{
  totalForms: number;
  successCount: number;
  failedCount: number;
  results: CloneResult[];
}> {
  const results: CloneResult[] = [];
  let successCount = 0;
  let failedCount = 0;

  for (const formId of sourceFormIds) {
    const result = await cloneForm(formId, targetAccountId, options);
    results.push(result);

    if (result.success) {
      successCount++;
    } else {
      failedCount++;
    }
  }

  return {
    totalForms: sourceFormIds.length,
    successCount,
    failedCount,
    results,
  };
}

/**
 * Find similar accounts for cloning suggestions
 */
export async function findSimilarAccounts(
  accountId: string,
  limit: number = 10
): Promise<{
  id: string;
  businessName: string;
  naicsCode?: string;
  sicCode?: string;
  similarity: number;
  formCount: number;
}[]> {
  try {
    // Get source account
    const { data: sourceAccount, error: sourceError } = await supabase
      .from('accounts')
      .select('naics_code, sic_code, industry')
      .eq('id', accountId)
      .single();

    if (sourceError) throw sourceError;

    // Find accounts with similar industry codes
    let query = supabase
      .from('accounts')
      .select(`
        id,
        business_name,
        naics_code,
        sic_code,
        industry,
        acord_forms:acord_forms(count)
      `)
      .neq('id', accountId)
      .limit(limit);

    // Filter by industry similarity
    if (sourceAccount.naics_code) {
      // Match on first 2-4 digits for industry similarity
      const prefix = sourceAccount.naics_code.substring(0, 4);
      query = query.ilike('naics_code', `${prefix}%`);
    } else if (sourceAccount.sic_code) {
      const prefix = sourceAccount.sic_code.substring(0, 2);
      query = query.ilike('sic_code', `${prefix}%`);
    } else if (sourceAccount.industry) {
      query = query.eq('industry', sourceAccount.industry);
    }

    const { data: accounts, error } = await query;

    if (error) throw error;

    // Calculate similarity scores
    return (accounts || []).map(account => {
      let similarity = 0;

      // NAICS match
      if (sourceAccount.naics_code && account.naics_code) {
        const matchLength = getMatchingPrefixLength(
          sourceAccount.naics_code,
          account.naics_code
        );
        similarity += (matchLength / 6) * 60; // Up to 60 points
      }

      // SIC match
      if (sourceAccount.sic_code && account.sic_code) {
        const matchLength = getMatchingPrefixLength(
          sourceAccount.sic_code,
          account.sic_code
        );
        similarity += (matchLength / 4) * 30; // Up to 30 points
      }

      // Industry match
      if (sourceAccount.industry && account.industry === sourceAccount.industry) {
        similarity += 10;
      }

      return {
        id: account.id,
        businessName: account.business_name,
        naicsCode: account.naics_code,
        sicCode: account.sic_code,
        similarity: Math.round(similarity),
        formCount: (account.acord_forms as any)?.[0]?.count || 0,
      };
    }).sort((a, b) => b.similarity - a.similarity);
  } catch (error) {
    console.error('Failed to find similar accounts:', error);
    return [];
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get account field value for replacement
 */
function getAccountFieldValue(account: any, fieldName: string): any {
  if (!account) return undefined;

  const lowercaseName = fieldName.toLowerCase();

  // Map common field names to account properties
  if (lowercaseName.includes('name') || lowercaseName.includes('insured')) {
    return account.business_name;
  }
  if (lowercaseName.includes('address') && !lowercaseName.includes('city') && !lowercaseName.includes('state')) {
    return account.address;
  }
  if (lowercaseName.includes('city')) {
    return account.city;
  }
  if (lowercaseName.includes('state')) {
    return account.state;
  }
  if (lowercaseName.includes('zip')) {
    return account.zip_code;
  }
  if (lowercaseName.includes('phone')) {
    return account.phone;
  }
  if (lowercaseName.includes('email')) {
    return account.email;
  }
  if (lowercaseName.includes('fein') || lowercaseName.includes('ein')) {
    return account.fein;
  }

  return undefined;
}

/**
 * Format field name to readable label
 */
function formatFieldName(fieldName: string): string {
  return fieldName
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^\w/, c => c.toUpperCase())
    .trim();
}

/**
 * Get length of matching prefix between two strings
 */
function getMatchingPrefixLength(a: string, b: string): number {
  let length = 0;
  const minLen = Math.min(a.length, b.length);

  for (let i = 0; i < minLen; i++) {
    if (a[i] === b[i]) {
      length++;
    } else {
      break;
    }
  }

  return length;
}

// ============================================
// EXPORTS
// ============================================

export {
  previewClone,
  cloneForm,
  batchCloneForms,
  findSimilarAccounts,
  ACCOUNT_SPECIFIC_FIELDS,
  CLEAR_FIELDS,
  REUSABLE_FIELDS,
};
