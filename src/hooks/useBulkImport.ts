import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  validateContacts,
  validatePolicies,
  ContactImportRecord,
  PolicyImportRecord,
  BatchValidationSummary,
  generateErrorReportCSV,
} from '@/lib/validators/bulkImport';
import {
  runBulkImport,
  rollbackImportBatch,
  ImportProgress,
  ImportResult,
} from '@/lib/import/bulkImportProcessor';
import { useAuth } from '@/hooks/useAuth';

export type ImportStep = 'upload' | 'preview' | 'validation' | 'processing' | 'complete' | 'failed';

export interface ParsedFiles {
  contacts: Record<string, unknown>[];
  policies: Record<string, unknown>[];
  contactsFileName: string;
  policiesFileName: string;
}

export interface ValidationState {
  contacts: {
    valid: ContactImportRecord[];
    invalid: Array<{ record: Record<string, unknown>; errors: string[] }>;
    skipped: number;
    summary: BatchValidationSummary;
  } | null;
  policies: {
    valid: PolicyImportRecord[];
    invalid: Array<{ record: Record<string, unknown>; errors: string[] }>;
    skipped: number;
    summary: BatchValidationSummary;
  } | null;
}

export interface BulkImportState {
  step: ImportStep;
  parsedFiles: ParsedFiles | null;
  validation: ValidationState;
  progress: ImportProgress | null;
  result: ImportResult | null;
  error: string | null;
}

const initialState: BulkImportState = {
  step: 'upload',
  parsedFiles: null,
  validation: {
    contacts: null,
    policies: null,
  },
  progress: null,
  result: null,
  error: null,
};

/**
 * Parse CSV content into array of records
 */
function parseCSV(content: string): Record<string, unknown>[] {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];

  // Parse header row
  const headers = parseCSVLine(lines[0]);

  // Parse data rows
  const records: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const record: Record<string, unknown> = {};

    headers.forEach((header, idx) => {
      let value: unknown = values[idx] ?? '';
      // Convert empty strings to undefined for optional fields
      if (value === '') {
        value = undefined;
      }
      // Handle boolean conversion
      if (header === 'is_primary') {
        value = value === 'true' || value === '1' || value === true;
      }
      record[header.trim()] = value;
    });

    records.push(record);
  }

  return records;
}

/**
 * Parse a single CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

export function useBulkImport() {
  const [state, setState] = useState<BulkImportState>(initialState);
  const { user } = useAuth();

  /**
   * Reset to initial state
   */
  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  /**
   * Set current step
   */
  const setStep = useCallback((step: ImportStep) => {
    setState(prev => ({ ...prev, step }));
  }, []);

  /**
   * Parse uploaded CSV files
   */
  const parseFiles = useCallback(async (
    contactsFile: File | null,
    policiesFile: File | null
  ): Promise<boolean> => {
    try {
      if (!contactsFile) {
        toast({
          title: 'Error',
          description: 'Contacts file is required',
          variant: 'destructive',
        });
        return false;
      }

      const contactsContent = await contactsFile.text();
      const contacts = parseCSV(contactsContent);

      let policies: Record<string, unknown>[] = [];
      if (policiesFile) {
        const policiesContent = await policiesFile.text();
        policies = parseCSV(policiesContent);
      }

      setState(prev => ({
        ...prev,
        parsedFiles: {
          contacts,
          policies,
          contactsFileName: contactsFile.name,
          policiesFileName: policiesFile?.name || '',
        },
        step: 'preview',
        error: null,
      }));

      toast({
        title: 'Files parsed successfully',
        description: `${contacts.length} contacts, ${policies.length} policies`,
      });

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse files';
      setState(prev => ({ ...prev, error: message }));
      toast({
        title: 'Parse Error',
        description: message,
        variant: 'destructive',
      });
      return false;
    }
  }, []);

  /**
   * Validate parsed records
   */
  const validateRecords = useCallback(async (skipNonPrimary: boolean = true): Promise<boolean> => {
    const { parsedFiles } = state;
    if (!parsedFiles) {
      toast({
        title: 'Error',
        description: 'No files to validate',
        variant: 'destructive',
      });
      return false;
    }

    try {
      // Validate contacts
      const contactValidation = validateContacts(parsedFiles.contacts, skipNonPrimary);
      const validContacts = contactValidation.results
        .filter(r => r.valid && r.data)
        .map(r => r.data!);

      // Build set of valid customer IDs for policy validation
      const validCustomerIds = new Set(validContacts.map(c => c.master_id));

      // Validate policies
      const policyValidation = validatePolicies(parsedFiles.policies, validCustomerIds);
      const validPolicies = policyValidation.results
        .filter(r => r.valid && r.data)
        .map(r => r.data!);

      // Build invalid records list
      const invalidContacts = contactValidation.results
        .filter(r => !r.valid && r.errors.length > 0 && r.errors[0].message !== 'Skipped: not primary record')
        .map(r => ({
          record: parsedFiles.contacts[r.rowNumber - 1],
          errors: r.errors.map(e => `${e.field}: ${e.message}`),
        }));

      const invalidPolicies = policyValidation.results
        .filter(r => !r.valid)
        .map(r => ({
          record: parsedFiles.policies[r.rowNumber - 1],
          errors: r.errors.map(e => `${e.field}: ${e.message}`),
        }));

      setState(prev => ({
        ...prev,
        validation: {
          contacts: {
            valid: validContacts,
            invalid: invalidContacts,
            skipped: contactValidation.summary.skippedRecords,
            summary: contactValidation.summary,
          },
          policies: {
            valid: validPolicies,
            invalid: invalidPolicies,
            skipped: policyValidation.summary.skippedRecords,
            summary: policyValidation.summary,
          },
        },
        step: 'validation',
        error: null,
      }));

      const totalErrors = invalidContacts.length + invalidPolicies.length;
      if (totalErrors > 0) {
        toast({
          title: 'Validation complete with errors',
          description: `${totalErrors} record(s) have validation errors`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Validation passed',
          description: `${validContacts.length} contacts, ${validPolicies.length} policies ready to import`,
        });
      }

      return totalErrors === 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Validation failed';
      setState(prev => ({ ...prev, error: message }));
      toast({
        title: 'Validation Error',
        description: message,
        variant: 'destructive',
      });
      return false;
    }
  }, [state.parsedFiles]);

  /**
   * Run the import process
   */
  const runImport = useCallback(async (): Promise<boolean> => {
    const { validation } = state;
    if (!validation.contacts || !user?.id) {
      toast({
        title: 'Error',
        description: 'No validated data or user not authenticated',
        variant: 'destructive',
      });
      return false;
    }

    setState(prev => ({ ...prev, step: 'processing', error: null }));

    try {
      // Get agency workspace ID (use a default for now)
      const { data: membership } = await supabase
        .from('agency_workspace_memberships')
        .select('agency_workspace_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      const agencyWorkspaceId = membership?.agency_workspace_id || '';

      const result = await runBulkImport(
        validation.contacts.valid,
        validation.policies?.valid || [],
        agencyWorkspaceId,
        user.id,
        (progress) => {
          setState(prev => ({ ...prev, progress }));
        }
      );

      setState(prev => ({
        ...prev,
        result,
        step: result.success ? 'complete' : 'failed',
        error: result.success ? null : result.errors[0]?.error || 'Import failed',
      }));

      if (result.success) {
        toast({
          title: 'Import complete',
          description: `Created ${result.accountsCreated} accounts, ${result.contactsCreated} contacts, ${result.policiesCreated} policies`,
        });
      } else {
        toast({
          title: 'Import completed with errors',
          description: `${result.errors.length} error(s) occurred`,
          variant: 'destructive',
        });
      }

      return result.success;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      setState(prev => ({
        ...prev,
        step: 'failed',
        error: message,
      }));
      toast({
        title: 'Import Error',
        description: message,
        variant: 'destructive',
      });
      return false;
    }
  }, [state.validation, user]);

  /**
   * Rollback the import
   */
  const rollback = useCallback(async (): Promise<boolean> => {
    const { result } = state;
    if (!result?.batchId) {
      toast({
        title: 'Error',
        description: 'No batch to rollback',
        variant: 'destructive',
      });
      return false;
    }

    try {
      const rollbackResult = await rollbackImportBatch(result.batchId);

      if (rollbackResult.success) {
        toast({
          title: 'Rollback complete',
          description: `Removed ${rollbackResult.accountsDeleted} accounts, ${rollbackResult.contactsDeleted} contacts, ${rollbackResult.policiesDeleted} policies`,
        });
        reset();
        return true;
      } else {
        toast({
          title: 'Rollback failed',
          description: rollbackResult.error || 'Unknown error',
          variant: 'destructive',
        });
        return false;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Rollback failed';
      toast({
        title: 'Rollback Error',
        description: message,
        variant: 'destructive',
      });
      return false;
    }
  }, [state.result, reset]);

  /**
   * Download validation error report as CSV
   */
  const downloadErrorReport = useCallback(() => {
    const { validation } = state;
    if (!validation.contacts && !validation.policies) return;

    const allErrors = [
      ...(validation.contacts?.summary.errors || []),
      ...(validation.policies?.summary.errors || []),
    ];

    if (allErrors.length === 0) {
      toast({
        title: 'No errors',
        description: 'No validation errors to download',
      });
      return;
    }

    const csv = generateErrorReportCSV(allErrors);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import_errors_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state.validation]);

  /**
   * Download import result report
   */
  const downloadResultReport = useCallback(() => {
    const { result } = state;
    if (!result) return;

    const report = {
      batchId: result.batchId,
      success: result.success,
      accountsCreated: result.accountsCreated,
      contactsCreated: result.contactsCreated,
      policiesCreated: result.policiesCreated,
      errors: result.errors,
      timestamp: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import_result_${result.batchId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state.result]);

  return {
    state,
    reset,
    setStep,
    parseFiles,
    validateRecords,
    runImport,
    rollback,
    downloadErrorReport,
    downloadResultReport,
  };
}
