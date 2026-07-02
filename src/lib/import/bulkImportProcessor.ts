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
// Rows in flight at once during contact resolution (per browser tab).
const IMPORT_CONCURRENCY = 8;

/** Run task thunks with at most `limit` in flight; resolves when all settle. */
async function runWithConcurrency(tasks: Array<() => Promise<void>>, limit: number): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const idx = next++;
      await tasks[idx]();
    }
  });
  await Promise.all(workers);
}


export interface ImportProgress {
  phase: 'contacts' | 'policies';
  currentBatch: number;
  totalBatches: number;
  processed: number;
  total: number;
  accountsCreated: number;
  accountsMatched?: number;
  contactsCreated: number;
  policiesCreated: number;
  errors: number;
}

export interface ImportResult {
  success: boolean;
  batchId: string;
  accountsCreated: number;
  /** Rows that resolved to an existing account instead of creating a new one. */
  accountsMatched: number;
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
  } else if (status === 'completed' || status === 'completed_with_errors' || status === 'failed' || status === 'rolled_back') {
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
  accountsMatched: number;
  contactsCreated: number;
  errors: Array<{ rowNumber: number; sourceId: string; error: string }>;
}> {
  const masterIdToAccountId = new Map<string, string>();
  const errors: Array<{ rowNumber: number; sourceId: string; error: string }> = [];
  let accountsCreated = 0;
  let accountsMatched = 0;
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
      accountsMatched,
      contactsCreated,
      policiesCreated: 0,
      errors: errors.length,
    });

    // Rows run with bounded concurrency: one awaited RPC per row made a
    // 10-15k-row book import ~10-15k sequential round trips (tens of minutes).
    // Order does not matter (results land in a map keyed by master_id).
    // Per-batch tallies drive the circuit breaker (below) - an order-independent
    // signal, unlike a "consecutive failures" counter which under concurrency
    // reflects completion order rather than CSV row order.
    let batchSuccesses = 0;
    let batchFailures = 0;
    const processRow = async (contact: ContactImportRecord, rowNumber: number) => {
      try {
        // Resolve-or-create instead of a blind insert. import_resolve_account
        // normalizes the name (case, & vs AND, punctuation), matches an existing
        // account (businesses by name; individuals by name + email/phone), follows
        // merged_into_id to the live survivor, and only inserts when nothing
        // matches. This is what stops one business from fragmenting into many
        // accounts across feeds/imports.
        const { data: resolved, error: accountError } = await supabase.rpc('import_resolve_account', {
          p_agency_workspace_id: agencyWorkspaceId || null,
          p_batch_id: batchId,
          p_name: buildAccountName(contact),
          p_type: mapContactTypeToAccountType(contact.contact_type),
          p_email: contact.email_primary || null,
          p_phone: normalizePhone(contact.phone_primary) || null,
          p_address_line1: contact.address_street || null,
          p_address_line2: contact.address_street2 || null,
          p_city: contact.address_city || null,
          p_state: contact.address_state || null,
          p_zip: contact.address_zip || null,
          p_source: contact.source_file || null,
          p_custom: extractSecondaryContactInfo(contact),
        });

        if (accountError) {
          throw new Error(`Account resolve failed: ${accountError.message}`);
        }

        const resolution = resolved as { account_id: string; matched: boolean } | null;
        const accountId = resolution?.account_id;
        if (!accountId) {
          throw new Error('Account resolve returned no account_id');
        }
        const wasMatched = resolution?.matched === true;
        masterIdToAccountId.set(contact.master_id, accountId);
        if (wasMatched) {
          accountsMatched++;
        } else {
          accountsCreated++;
        }

        // Create a contact record for individuals only when we created a brand-new
        // account; matching an existing account means its contact already exists.
        if (!wasMatched && contact.contact_type === 'individual' && contact.first_name && contact.last_name) {
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
        batchSuccesses++;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        batchFailures++;
        errors.push({
          rowNumber,
          sourceId: contact.master_id,
          error: errorMessage,
        });
      }
    };

    await runWithConcurrency(
      batch.map((contact, i) => () => processRow(contact, start + i + 1)),
      IMPORT_CONCURRENCY
    );

    // Circuit breaker: a dead connection/expired session makes an ENTIRE batch
    // fail. Requiring zero successes (not a consecutive-failure count) keeps
    // this order-independent under concurrency and immune to a cluster of
    // legitimately-invalid rows, which will always sit alongside some
    // successes. A full BATCH_SIZE with no success is the dead-connection tell.
    if (batchSuccesses === 0 && batchFailures > 0) {
      errors.push({
        rowNumber: end,
        sourceId: '(batch)',
        error: `Aborted: all ${batchFailures} rows in this batch failed - check the connection/session and re-run the import.`,
      });
      break;
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
    accountsMatched,
    contactsCreated,
    policiesCreated: 0,
    errors: errors.length,
  });

  return { masterIdToAccountId, accountsCreated, accountsMatched, contactsCreated, errors };
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

        // Build policy record - convert empty date strings to null
        const policyData = {
          account_id: accountId,
          carrier: policy.carrier, // Required: carrier name
          carrier_id: carrierId,   // Optional: FK to carriers table
          policy_number: policy.policy_number,
          line_of_business: mapProductTypeToLineOfBusiness(policy.product_type),
          effective_date: policy.effective_date || null,
          expiration_date: policy.expiration_date || null,
          premium: policy.premium || null,
          status: policy.status || 'active',
          import_batch_id: batchId,
        };

        // Insert policy - handle duplicates by catching unique constraint error
        const { data: insertedPolicy, error: policyError } = await supabase
          .from('policies')
          .insert(policyData)
          .select('id');

        if (policyError) {
          // If it's a duplicate error (unique constraint violation), skip silently
          if (policyError.code === '23505' || policyError.message?.includes('duplicate')) {
            console.warn(`Skipping duplicate policy_number: ${policy.policy_number}`);
          } else {
            throw new Error(`Policy insert failed: ${policyError.message}`);
          }
        } else {
          policiesCreated++;
        }
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
      accountsMatched: 0,
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
    // Matched accounts are successful rows too - omitting them understated
    // successful_rows for every re-import of an existing book.
    const totalSuccess =
      contactResult.accountsCreated + contactResult.accountsMatched + policyResult.policiesCreated;

    // Update batch status
    await updateBatchStatus(batchId, totalErrors > 0 ? 'completed_with_errors' : 'completed', {
      processedRows: totalRecords,
      successfulRows: totalSuccess,
      errorRows: totalErrors,
    });

    return {
      success: totalErrors === 0,
      batchId,
      accountsCreated: contactResult.accountsCreated,
      accountsMatched: contactResult.accountsMatched,
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
      accountsMatched: 0,
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
