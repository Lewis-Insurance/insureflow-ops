/**
 * CRM Prefill Service
 *
 * Pre-fill ACORD forms from CRM data:
 * - Pull data from CRM (customers/accounts)
 * - Map CRM fields to ACORD fields
 * - Track provenance (source = CRM)
 * - Handle conflicts with extracted data
 * - Log all prefill actions for audit
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { FieldStatus, DraftField } from './DraftManager';

export interface CRMAccount {
  id: string;
  name: string;
  dba_name?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  phone?: string;
  email?: string;
  fein?: string;
  website?: string;
  business_type?: string;
  entity_type?: string; // LLC, Corp, Sole Prop, etc.
  years_in_business?: number;
  employee_count?: number;
  annual_revenue?: number;
  sic_code?: string;
  naics_code?: string;
  primary_contact_name?: string;
  primary_contact_phone?: string;
  primary_contact_email?: string;
  // Additional fields
  operations_description?: string;
  locations?: CRMLocation[];
}

export interface CRMLocation {
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  zip_code: string;
  is_primary: boolean;
}

export interface CRMPolicy {
  id: string;
  policy_number?: string;
  carrier_name?: string;
  carrier_naic?: string;
  effective_date?: string;
  expiration_date?: string;
  line_of_business?: string;
  premium?: number;
}

// ACORD field to CRM field mapping
export interface FieldMapping {
  acordField: string;
  crmField: string;
  transform?: (value: any, account: CRMAccount) => string | null;
  trustLevel: 'high' | 'medium' | 'low'; // How much to trust CRM data for this field
}

// Default mappings for common ACORD forms
const DEFAULT_MAPPINGS: FieldMapping[] = [
  { acordField: 'NamedInsured', crmField: 'name', trustLevel: 'high' },
  { acordField: 'DBAName', crmField: 'dba_name', trustLevel: 'high' },
  { acordField: 'MailingAddress', crmField: 'address_line1', trustLevel: 'medium' },
  { acordField: 'MailingAddressLine2', crmField: 'address_line2', trustLevel: 'medium' },
  { acordField: 'MailingCity', crmField: 'city', trustLevel: 'medium' },
  { acordField: 'MailingState', crmField: 'state', trustLevel: 'medium' },
  { acordField: 'MailingZip', crmField: 'zip_code', trustLevel: 'medium' },
  { acordField: 'Phone', crmField: 'phone', trustLevel: 'medium' },
  { acordField: 'Email', crmField: 'email', trustLevel: 'medium' },
  { acordField: 'FEIN', crmField: 'fein', trustLevel: 'high' },
  { acordField: 'Website', crmField: 'website', trustLevel: 'low' },
  { acordField: 'BusinessType', crmField: 'business_type', trustLevel: 'medium' },
  { acordField: 'EntityType', crmField: 'entity_type', trustLevel: 'high' },
  { acordField: 'YearsInBusiness', crmField: 'years_in_business', transform: (v) => v?.toString(), trustLevel: 'medium' },
  { acordField: 'NumEmployees', crmField: 'employee_count', transform: (v) => v?.toString(), trustLevel: 'low' },
  { acordField: 'AnnualRevenue', crmField: 'annual_revenue', transform: (v) => v?.toLocaleString(), trustLevel: 'low' },
  { acordField: 'SICCode', crmField: 'sic_code', trustLevel: 'medium' },
  { acordField: 'NAICSCode', crmField: 'naics_code', trustLevel: 'medium' },
  { acordField: 'ContactName', crmField: 'primary_contact_name', trustLevel: 'medium' },
  { acordField: 'ContactPhone', crmField: 'primary_contact_phone', trustLevel: 'medium' },
  { acordField: 'ContactEmail', crmField: 'primary_contact_email', trustLevel: 'medium' },
  { acordField: 'OperationsDescription', crmField: 'operations_description', trustLevel: 'low' },
];

export interface PrefillResult {
  field: string;
  value: string | null;
  source: 'CRM';
  trustLevel: 'high' | 'medium' | 'low';
  conflictWithExtraction?: {
    extractedValue: string | null;
    extractedConfidence: number;
    resolution: 'KEEP_CRM' | 'KEEP_EXTRACTION' | 'CONFLICT';
  };
}

export interface PrefillAction {
  acordFormId: string;
  accountId: string;
  field: string;
  crmValue: string | null;
  extractedValue?: string | null;
  action: 'APPLIED' | 'SKIPPED_EXTRACTION_STRONGER' | 'CONFLICT_FLAGGED';
  timestamp: string;
  userId: string;
}

class CRMPrefillServiceClass {
  private mappings: FieldMapping[];

  constructor() {
    this.mappings = DEFAULT_MAPPINGS;
  }

  /**
   * Load account data from CRM
   */
  async loadAccount(accountId: string): Promise<CRMAccount | null> {
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select(`
          id,
          name,
          dba_name,
          address_line1,
          address_line2,
          city,
          state,
          zip_code,
          phone,
          email,
          fein,
          website,
          business_type,
          entity_type,
          years_in_business,
          employee_count,
          annual_revenue,
          sic_code,
          naics_code,
          primary_contact_name,
          primary_contact_phone,
          primary_contact_email,
          operations_description
        `)
        .eq('id', accountId)
        .single();

      if (error) throw error;

      return data as CRMAccount;
    } catch (error) {
      logger.error('Failed to load account:', error);
      return null;
    }
  }

  /**
   * Load prior policies for an account (for renewal data)
   */
  async loadPriorPolicies(accountId: string): Promise<CRMPolicy[]> {
    try {
      const { data, error } = await supabase
        .from('policies')
        .select(`
          id,
          policy_number,
          carrier_name,
          carrier_naic,
          effective_date,
          expiration_date,
          line_of_business,
          premium
        `)
        .eq('account_id', accountId)
        .order('expiration_date', { ascending: false })
        .limit(5);

      if (error) throw error;

      return (data || []) as CRMPolicy[];
    } catch (error) {
      logger.error('Failed to load prior policies:', error);
      return [];
    }
  }

  /**
   * Generate prefill values from CRM data
   */
  async generatePrefill(
    accountId: string,
    existingFields?: Record<string, DraftField>,
    options?: {
      overrideExtractionThreshold?: number; // Only override extraction if confidence < this
    }
  ): Promise<{
    fields: Record<string, DraftField>;
    results: PrefillResult[];
    actions: PrefillAction[];
  }> {
    const account = await this.loadAccount(accountId);
    if (!account) {
      return { fields: {}, results: [], actions: [] };
    }

    const fields: Record<string, DraftField> = {};
    const results: PrefillResult[] = [];
    const actions: PrefillAction[] = [];
    const userId = await this.getCurrentUserId();
    const threshold = options?.overrideExtractionThreshold ?? 0.90;

    for (const mapping of this.mappings) {
      let value: string | null = null;

      // Get value from CRM
      const rawValue = (account as any)[mapping.crmField];
      if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
        value = mapping.transform
          ? mapping.transform(rawValue, account)
          : String(rawValue);
      }

      if (value === null) continue;

      // Check for conflict with existing extraction
      const existingField = existingFields?.[mapping.acordField];
      let resolution: PrefillResult['conflictWithExtraction'];
      let action: PrefillAction['action'] = 'APPLIED';

      if (existingField?.value && existingField.source === 'extraction') {
        const extractedConfidence = existingField.confidence || 0;

        if (extractedConfidence >= threshold) {
          // Extraction is strong, don't override
          if (existingField.value !== value) {
            // Values differ - flag as conflict
            resolution = {
              extractedValue: existingField.value,
              extractedConfidence,
              resolution: 'CONFLICT',
            };
            action = 'CONFLICT_FLAGGED';
          } else {
            // Values match, no conflict
            action = 'SKIPPED_EXTRACTION_STRONGER';
            continue; // Don't override, values match
          }
        } else {
          // Extraction is weak, CRM can fill but mark for review
          resolution = {
            extractedValue: existingField.value,
            extractedConfidence,
            resolution: 'KEEP_CRM',
          };
        }
      }

      // Create draft field
      const draftField: DraftField = {
        value,
        status: resolution?.resolution === 'CONFLICT' ? 'CONFLICT' : 'CRM_PREFILL',
        source: 'crm',
        lastModified: new Date().toISOString(),
        modifiedBy: userId,
      };

      // If conflict, keep both values visible
      if (resolution?.resolution === 'CONFLICT') {
        draftField.status = 'CONFLICT';
      }

      fields[mapping.acordField] = draftField;

      results.push({
        field: mapping.acordField,
        value,
        source: 'CRM',
        trustLevel: mapping.trustLevel,
        conflictWithExtraction: resolution,
      });

      actions.push({
        acordFormId: '', // Will be set by caller
        accountId,
        field: mapping.acordField,
        crmValue: value,
        extractedValue: existingField?.value,
        action,
        timestamp: new Date().toISOString(),
        userId,
      });
    }

    return { fields, results, actions };
  }

  /**
   * Apply prefill to an ACORD form and log actions
   */
  async applyPrefill(
    acordFormId: string,
    accountId: string,
    existingFields?: Record<string, DraftField>,
    options?: {
      overrideExtractionThreshold?: number;
    }
  ): Promise<{
    fields: Record<string, DraftField>;
    results: PrefillResult[];
    conflictCount: number;
    appliedCount: number;
  }> {
    const { fields, results, actions } = await this.generatePrefill(
      accountId,
      existingFields,
      options
    );

    // Log all actions for audit
    for (const action of actions) {
      action.acordFormId = acordFormId;
      await this.logPrefillAction(action);
    }

    const conflictCount = results.filter(
      r => r.conflictWithExtraction?.resolution === 'CONFLICT'
    ).length;
    const appliedCount = results.filter(
      r => !r.conflictWithExtraction || r.conflictWithExtraction.resolution === 'KEEP_CRM'
    ).length;

    return { fields, results, conflictCount, appliedCount };
  }

  /**
   * Resolve a specific prefill conflict
   */
  async resolveConflict(
    acordFormId: string,
    field: string,
    resolution: 'KEEP_CRM' | 'KEEP_EXTRACTION',
    crmValue: string | null,
    extractedValue: string | null
  ): Promise<DraftField> {
    const userId = await this.getCurrentUserId();

    const value = resolution === 'KEEP_CRM' ? crmValue : extractedValue;
    const source = resolution === 'KEEP_CRM' ? 'crm' : 'extraction';

    // Log resolution
    await this.logPrefillAction({
      acordFormId,
      accountId: '', // Would need to be passed
      field,
      crmValue,
      extractedValue,
      action: resolution === 'KEEP_CRM' ? 'APPLIED' : 'SKIPPED_EXTRACTION_STRONGER',
      timestamp: new Date().toISOString(),
      userId,
    });

    return {
      value,
      status: 'NEEDS_REVIEW', // Mark as reviewed but should be confirmed
      source: source as DraftField['source'],
      lastModified: new Date().toISOString(),
      modifiedBy: userId,
    };
  }

  /**
   * Get CRM data summary for display
   */
  async getAccountSummary(accountId: string): Promise<{
    name: string;
    address: string;
    phone?: string;
    email?: string;
    fieldCount: number;
  } | null> {
    const account = await this.loadAccount(accountId);
    if (!account) return null;

    let fieldCount = 0;
    for (const mapping of this.mappings) {
      const value = (account as any)[mapping.crmField];
      if (value !== undefined && value !== null && value !== '') {
        fieldCount++;
      }
    }

    const addressParts = [
      account.address_line1,
      account.city,
      account.state,
      account.zip_code,
    ].filter(Boolean);

    return {
      name: account.name,
      address: addressParts.join(', '),
      phone: account.phone,
      email: account.email,
      fieldCount,
    };
  }

  /**
   * Add custom field mappings
   */
  addMappings(mappings: FieldMapping[]): void {
    this.mappings = [...this.mappings, ...mappings];
  }

  /**
   * Set custom field mappings (replace defaults)
   */
  setMappings(mappings: FieldMapping[]): void {
    this.mappings = mappings;
  }

  // Private methods

  private async logPrefillAction(action: PrefillAction): Promise<void> {
    try {
      await supabase.from('crm_prefill_log').insert({
        acord_form_id: action.acordFormId,
        account_id: action.accountId,
        field_name: action.field,
        crm_value: action.crmValue,
        extracted_value: action.extractedValue,
        action: action.action,
        created_at: action.timestamp,
        created_by: action.userId,
      });
    } catch (error) {
      logger.error('Failed to log prefill action:', error);
      // Don't throw - logging failure shouldn't block operation
    }
  }

  private async getCurrentUserId(): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || 'anonymous';
  }
}

// Export singleton
export const crmPrefillService = new CRMPrefillServiceClass();
