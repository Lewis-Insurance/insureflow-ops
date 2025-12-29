import { supabase } from '@/integrations/supabase/client';
import {
  ContactImportRecord,
  PolicyImportRecord,
  mapContactTypeToAccountType,
  mapProductTypeToLineOfBusiness,
  normalizePhone,
  buildAccountName,
  extractSecondaryContactInfo,
} from '@/lib/validators/bulkImport';
import { resolveCarriers } from './carrierResolver';

const BATCH_SIZE = 100;

export interface ImportProgress {
  phase: 'contacts' | 'policies';
  currentBatch: number;
  totalBatches: number;
  processed: number;
  total: number;
  accountsCreated: number;
  contactsCreated: number;
  policiesCreated: number;
  errors: number;
}

export interface ImportResult {
  success: boolean;
  batchId: string;
  accountsCreated: number;
  contactsCreated: number;
  policiesCreated: number;
  errors: Array<{
    rowNumber: number;
    sourceId: string;
    error: string;
  }>;
  masterIdToAccountId: Map<string, string>;
}

/**
 * Create an import batch record
 */
export async function createImportBatch(
  filename: string,
  importType: 'contacts' | 'policies' | 'combined',
  totalRows: number,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('import_batches')
    .insert({
      filename,
      import_type: importType,
      total_rows: totalRows,
      status: 'staging',
      imported_by: userId,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to create import batch:', error);
    return null;
  }

  return data.id;
}

/**
 * Update import batch status
 */
export async function updateBatchStatus(
  batchId: string,
  status: string,
  stats?: {
    processedRows?: number;
    successfulRows?: number;
    errorRows?: number;
  }
): Promise<void> {
  const updates: Record<string, unknown> = { status };

  if (stats) {
    if (stats.processedRows !== undefined) updates.processed_rows = stats.processedRows;
    if (stats.successfulRows !== undefined) updates.successful_rows = stats.successfulRows;
    if (stats.errorRows !== undefined) updates.error_rows = stats.errorRows;
  }

  if (status === 'processing') {
    updates.started_at = new Date().toISOString();
  } else if (status === 'completed' || status === 'failed' || status === 'rolled_back') {
    updates.completed_at = new Date().toISOString();
  }

  await supabase.from('import_batches').update(updates).eq('id', batchId);
}

/**
 * Process contacts and create accounts
 * Returns a map of master_id -> account_id for policy linking
 */
export async function processContacts(
  batchId: string,
  contacts: ContactImportRecord[],
  agencyWorkspaceId: string,
  onProgress?: (progress: ImportProgress) => void
): Promise<{
  masterIdToAccountId: Map<string, string>;
  accountsCreated: number;
  contactsCreated: number;
  errors: Array<{ rowNumber: number; sourceId: string; error: string }>;
}> {
  const masterIdToAccountId = new Map<string, string>();
  const errors: Array<{ rowNumber: number; sourceId: string; error: string }> = [];
  let accountsCreated = 0;
  let contactsCreated = 0;

  const totalBatches = Math.ceil(contacts.length / BATCH_SIZE);

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const start = batchIndex * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, contacts.length);
    const batch = contacts.slice(start, end);

    // Report progress
    onProgress?.({
      phase: 'contacts',
      currentBatch: batchIndex + 1,
      totalBatches,
      processed: start,
      total: contacts.length,
      accountsCreated,
      contactsCreated,
      policiesCreated: 0,
      errors: errors.length,
    });

    // Process each contact in the batch
    for (let i = 0; i < batch.length; i++) {
      const contact = batch[i];
      const rowNumber = start + i + 1;

      try {
        // Build account record
        const accountData = {
          name: buildAccountName(contact),
          type: mapContactTypeToAccountType(contact.contact_type),
          email: contact.email_primary || null,
          phone: normalizePhone(contact.phone_primary) || null,
          address_line1: contact.address_street || null,
          address_line2: contact.address_street2 || null,
          city: contact.address_city || null,
          state: contact.address_state || null,
          zip_code: contact.address_zip || null,
          source: contact.source_file || null,
          custom: extractSecondaryContactInfo(contact),
          import_batch_id: batchId,
        };

        // Insert account
        const { data: accountResult, error: accountError } = await supabase
          .from('accounts')
          .insert(accountData)
          .select('id')
          .single();

        if (accountError) {
          throw new Error(`Account insert failed: ${accountError.message}`);
        }

        const accountId = accountResult.id;
        masterIdToAccountId.set(contact.master_id, accountId);
        accountsCreated++;

        // Create contact record for individuals
        if (contact.contact_type === 'individual' && contact.first_name && contact.last_name) {
          const contactData = {
            account_id: accountId,
            first_name: contact.first_name,
            last_name: contact.last_name,
            email: contact.email_primary || null,
            phone: normalizePhone(contact.phone_primary) || null,
            role: 'insured',
            import_batch_id: batchId,
          };

          const { error: contactError } = await supabase
            .from('contacts')
            .insert(contactData);

          if (contactError) {
            console.warn(`Contact insert warning for ${contact.master_id}:`, contactError.message);
          } else {
            contactsCreated++;
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        errors.push({
          rowNumber,
          sourceId: contact.master_id,
          error: errorMessage,
        });
      }
    }
  }

  // Final progress update
  onProgress?.({
    phase: 'contacts',
    currentBatch: totalBatches,
    totalBatches,
    processed: contacts.length,
    total: contacts.length,
    accountsCreated,
    contactsCreated,
    policiesCreated: 0,
    errors: errors.length,
  });

  return { masterIdToAccountId, accountsCreated, contactsCreated, errors };
}

/**
 * Process policies and link to accounts
 */
export async function processPolicies(
  batchId: string,
  policies: PolicyImportRecord[],
  masterIdToAccountId: Map<string, string>,
  onProgress?: (progress: ImportProgress) => void,
  baseProgress?: Partial<ImportProgress>
): Promise<{
  policiesCreated: number;
  errors: Array<{ rowNumber: number; sourceId: string; error: string }>;
}> {
  const errors: Array<{ rowNumber: number; sourceId: string; error: string }> = [];
  let policiesCreated = 0;

  // First, resolve all carriers
  const carrierNames = [...new Set(policies.map(p => p.carrier))];
  const { resolved: carrierMap, failed: failedCarriers } = await resolveCarriers(carrierNames);

  if (failedCarriers.length > 0) {
    console.warn('Failed to resolve some carriers:', failedCarriers);
  }

  const totalBatches = Math.ceil(policies.length / BATCH_SIZE);

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const start = batchIndex * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, policies.length);
    const batch = policies.slice(start, end);

    // Report progress
    onProgress?.({
      phase: 'policies',
      currentBatch: batchIndex + 1,
      totalBatches,
      processed: start,
      total: policies.length,
      accountsCreated: baseProgress?.accountsCreated ?? 0,
      contactsCreated: baseProgress?.contactsCreated ?? 0,
      policiesCreated,
      errors: (baseProgress?.errors ?? 0) + errors.length,
    });

    // Process each policy in the batch
    for (let i = 0; i < batch.length; i++) {
      const policy = batch[i];
      const rowNumber = start + i + 1;

      try {
        // Get account ID from mapping
        const accountId = masterIdToAccountId.get(policy.customer_id);
        if (!accountId) {
          throw new Error(`No account found for customer_id: ${policy.customer_id}`);
        }

        // Get carrier ID
        const carrierId = carrierMap.get(policy.carrier) || null;

        // Build policy record
        const policyData = {
          account_id: accountId,
          carrier_id: carrierId,
          policy_number: policy.policy_number,
          line_of_business: mapProductTypeToLineOfBusiness(policy.product_type),
          effective_date: policy.effective_date,
          expiration_date: policy.expiration_date,
          premium: policy.premium || null,
          status: policy.status || 'active',
          import_batch_id: batchId,
        };

        // Insert policy
        const { error: policyError } = await supabase
          .from('policies')
          .insert(policyData);

        if (policyError) {
          throw new Error(`Policy insert failed: ${policyError.message}`);
        }

        policiesCreated++;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        errors.push({
          rowNumber,
          sourceId: policy.policy_id,
          error: errorMessage,
        });
      }
    }
  }

  // Final progress update
  onProgress?.({
    phase: 'policies',
    currentBatch: totalBatches,
    totalBatches,
    processed: policies.length,
    total: policies.length,
    accountsCreated: baseProgress?.accountsCreated ?? 0,
    contactsCreated: baseProgress?.contactsCreated ?? 0,
    policiesCreated,
    errors: (baseProgress?.errors ?? 0) + errors.length,
  });

  return { policiesCreated, errors };
}

/**
 * Run the full import process
 */
export async function runBulkImport(
  contacts: ContactImportRecord[],
  policies: PolicyImportRecord[],
  agencyWorkspaceId: string,
  userId: string,
  onProgress?: (progress: ImportProgress) => void
): Promise<ImportResult> {
  const totalRecords = contacts.length + policies.length;

  // Create batch record
  const batchId = await createImportBatch(
    `bulk_import_${new Date().toISOString()}`,
    'combined',
    totalRecords,
    userId
  );

  if (!batchId) {
    return {
      success: false,
      batchId: '',
      accountsCreated: 0,
      contactsCreated: 0,
      policiesCreated: 0,
      errors: [{ rowNumber: 0, sourceId: '', error: 'Failed to create import batch' }],
      masterIdToAccountId: new Map(),
    };
  }

  try {
    // Update status to processing
    await updateBatchStatus(batchId, 'processing');

    // Phase 1: Process contacts
    const contactResult = await processContacts(
      batchId,
      contacts,
      agencyWorkspaceId,
      onProgress
    );

    // Phase 2: Process policies
    const policyResult = await processPolicies(
      batchId,
      policies,
      contactResult.masterIdToAccountId,
      onProgress,
      {
        accountsCreated: contactResult.accountsCreated,
        contactsCreated: contactResult.contactsCreated,
        errors: contactResult.errors.length,
      }
    );

    // Calculate totals
    const totalErrors = contactResult.errors.length + policyResult.errors.length;
    const totalSuccess = contactResult.accountsCreated + policyResult.policiesCreated;

    // Update batch status
    await updateBatchStatus(batchId, totalErrors > 0 ? 'completed' : 'completed', {
      processedRows: totalRecords,
      successfulRows: totalSuccess,
      errorRows: totalErrors,
    });

    return {
      success: totalErrors === 0,
      batchId,
      accountsCreated: contactResult.accountsCreated,
      contactsCreated: contactResult.contactsCreated,
      policiesCreated: policyResult.policiesCreated,
      errors: [...contactResult.errors, ...policyResult.errors],
      masterIdToAccountId: contactResult.masterIdToAccountId,
    };
  } catch (err) {
    // Mark batch as failed
    await updateBatchStatus(batchId, 'failed');

    return {
      success: false,
      batchId,
      accountsCreated: 0,
      contactsCreated: 0,
      policiesCreated: 0,
      errors: [{
        rowNumber: 0,
        sourceId: '',
        error: err instanceof Error ? err.message : 'Unknown error',
      }],
      masterIdToAccountId: new Map(),
    };
  }
}

/**
 * Rollback an import batch using the database function
 */
export async function rollbackImportBatch(batchId: string): Promise<{
  success: boolean;
  accountsDeleted: number;
  contactsDeleted: number;
  policiesDeleted: number;
  error?: string;
}> {
  const { data, error } = await supabase.rpc('rollback_import_batch', {
    p_batch_id: batchId,
  });

  if (error) {
    return {
      success: false,
      accountsDeleted: 0,
      contactsDeleted: 0,
      policiesDeleted: 0,
      error: error.message,
    };
  }

  return {
    success: true,
    accountsDeleted: data?.accounts_deleted ?? 0,
    contactsDeleted: data?.contacts_deleted ?? 0,
    policiesDeleted: data?.policies_deleted ?? 0,
  };
}
