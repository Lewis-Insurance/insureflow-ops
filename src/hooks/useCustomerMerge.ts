import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';

export interface MergeCustomersParams {
  masterCustomerId: string;
  duplicateCustomerId: string;
  confirmationPhrase: string;
  options?: CustomerMergeOptions;
}

export interface LegacyMergeCustomersParams {
  masterId: string;
  mergedId: string;
  confirmationPhrase: string;
  options?: CustomerMergeOptions;
}

export interface CustomerMergeOptions {
  fillBlankMasterFields?: boolean;
  appendDuplicateNotes?: boolean;
  source?: 'merge_page' | 'duplicate_detection' | 'manual_flag' | 'rpc' | string;
}

export interface CustomerMergeCustomerSummary {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  accountStatus: string | null;
  deletedAt: string | null;
}

export interface TransferPreviewRow {
  table: string;
  foreignKeyColumn: string;
  count: number;
  strategy:
    | 'reassign_fk'
    | 'dedupe_then_reassign'
    | 'append_history_only'
    | 'manual_review'
    | 'preserve_via_customer_account_reassignment'
    | string;
  blockers: string[];
}

export interface ScalarConflict {
  field: string;
  masterValue: Json;
  duplicateValue: Json;
  phase1Resolution: 'master_wins' | 'fill_master_if_blank' | string;
}

export interface CustomerMergePreview {
  master: CustomerMergeCustomerSummary | null;
  duplicate: CustomerMergeCustomerSummary | null;
  transferableTables: TransferPreviewRow[];
  scalarConflicts: ScalarConflict[];
  warnings: string[];
  blockers: string[];
  confirmationPhrase: string;
}

export interface CustomerMergeResult {
  mergeId: string;
  masterCustomerId: string;
  duplicateCustomerId: string;
  source?: string;
  transferredCounts: Record<string, number>;
  dedupedCounts: Record<string, number>;
  transferredRows?: Record<string, string[]>;
  dedupedRows?: Record<string, string[]>;
  skippedRows?: Array<{ table: string; id: string; reason: string }>;
  scalarFieldChanges?: Array<{ field: string; resolution: string; source?: string }>;
  warnings: string[];
  completedAt: string;
  mergedBy?: string;
  softDeletedDuplicate?: boolean;
  preview?: CustomerMergePreview;
}

export interface AccountWithCounts {
  id: string;
  name: string;
  type: string;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  account_status: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Related data counts
  policiesCount: number;
  activePoliciesCount: number;
  quotesCount: number;
  documentsCount: number;
  tasksCount: number;
  openTasksCount: number;
  communicationsCount: number;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeTransferRows(value: unknown): TransferPreviewRow[] {
  if (!Array.isArray(value)) return [];

  return value.map((row) => {
    const item = row as Partial<TransferPreviewRow>;
    return {
      table: String(item.table ?? ''),
      foreignKeyColumn: String(item.foreignKeyColumn ?? ''),
      count: Number(item.count ?? 0),
      strategy: String(item.strategy ?? 'reassign_fk'),
      blockers: normalizeStringArray(item.blockers),
    };
  });
}

function normalizeScalarConflicts(value: unknown): ScalarConflict[] {
  if (!Array.isArray(value)) return [];

  return value.map((row) => {
    const item = row as Partial<ScalarConflict>;
    return {
      field: String(item.field ?? ''),
      masterValue: (item.masterValue ?? null) as Json,
      duplicateValue: (item.duplicateValue ?? null) as Json,
      phase1Resolution: String(item.phase1Resolution ?? 'master_wins'),
    };
  });
}

function normalizePreview(data: unknown): CustomerMergePreview {
  const preview = (data ?? {}) as Partial<CustomerMergePreview>;

  return {
    master: preview.master ?? null,
    duplicate: preview.duplicate ?? null,
    transferableTables: normalizeTransferRows(preview.transferableTables),
    scalarConflicts: normalizeScalarConflicts(preview.scalarConflicts),
    warnings: normalizeStringArray(preview.warnings),
    blockers: normalizeStringArray(preview.blockers),
    confirmationPhrase: String(preview.confirmationPhrase ?? ''),
  };
}

function normalizeCountRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, count]) => [key, Number(count ?? 0)])
  );
}

function normalizeRowsRecord(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, ids]) => [key, normalizeStringArray(ids)])
  );
}

function normalizeResult(data: unknown): CustomerMergeResult {
  const result = (data ?? {}) as Partial<CustomerMergeResult>;

  return {
    mergeId: String(result.mergeId ?? ''),
    masterCustomerId: String(result.masterCustomerId ?? ''),
    duplicateCustomerId: String(result.duplicateCustomerId ?? ''),
    source: result.source,
    transferredCounts: normalizeCountRecord(result.transferredCounts),
    dedupedCounts: normalizeCountRecord(result.dedupedCounts),
    transferredRows: normalizeRowsRecord(result.transferredRows),
    dedupedRows: normalizeRowsRecord(result.dedupedRows),
    skippedRows: Array.isArray(result.skippedRows) ? result.skippedRows : [],
    scalarFieldChanges: Array.isArray(result.scalarFieldChanges) ? result.scalarFieldChanges : [],
    warnings: normalizeStringArray(result.warnings),
    completedAt: String(result.completedAt ?? new Date().toISOString()),
    mergedBy: result.mergedBy,
    softDeletedDuplicate: Boolean(result.softDeletedDuplicate),
    preview: result.preview ? normalizePreview(result.preview) : undefined,
  };
}

// Hook to fetch account with related data counts
export function useAccountWithCounts(accountId: string | null) {
  return useQuery({
    queryKey: ['account-with-counts', accountId],
    queryFn: async (): Promise<AccountWithCounts | null> => {
      if (!accountId) return null;

      // Fetch account details
      const { data: account, error: accountError } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', accountId)
        .is('deleted_at', null)
        .single();

      if (accountError || !account) {
        logger.error('[useAccountWithCounts] Failed to fetch account:', accountError);
        return null;
      }

      // Fetch counts in parallel
      const [
        policiesResult,
        activePoliciesResult,
        quotesResult,
        documentsResult,
        tasksResult,
        openTasksResult,
        communicationsResult,
      ] = await Promise.all([
        supabase.from('policies').select('id', { count: 'exact', head: true }).eq('account_id', accountId),
        supabase.from('policies').select('id', { count: 'exact', head: true }).eq('account_id', accountId).eq('status', 'active'),
        supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('account_id', accountId),
        supabase.from('documents').select('id', { count: 'exact', head: true }).eq('account_id', accountId),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('account_id', accountId),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('account_id', accountId).in('status', ['pending', 'in_progress']),
        supabase.from('communications').select('id', { count: 'exact', head: true }).eq('account_id', accountId),
      ]);

      return {
        id: account.id,
        name: account.name,
        type: account.type,
        email: account.email,
        phone: account.phone,
        address_line1: account.address_line1,
        city: account.city,
        state: account.state,
        zip_code: account.zip_code,
        account_status: account.account_status,
        notes: account.notes,
        created_at: account.created_at,
        updated_at: account.updated_at,
        policiesCount: policiesResult.count || 0,
        activePoliciesCount: activePoliciesResult.count || 0,
        quotesCount: quotesResult.count || 0,
        documentsCount: documentsResult.count || 0,
        tasksCount: tasksResult.count || 0,
        openTasksCount: openTasksResult.count || 0,
        communicationsCount: communicationsResult.count || 0,
      };
    },
    enabled: !!accountId,
    staleTime: 30000, // 30 seconds
  });
}

export function useCustomerMergePreview(
  masterCustomerId: string | null,
  duplicateCustomerId: string | null,
  enabled = true
) {
  return useQuery({
    queryKey: ['customer-merge-preview', masterCustomerId, duplicateCustomerId],
    queryFn: async (): Promise<CustomerMergePreview> => {
      if (!masterCustomerId || !duplicateCustomerId) {
        throw new Error('Both master and duplicate customer IDs are required');
      }

      const { data, error } = await supabase.rpc('preview_customer_merge_v1', {
        p_master_customer_id: masterCustomerId,
        p_duplicate_customer_id: duplicateCustomerId,
      });

      if (error) {
        logger.error('[Customer Merge Preview] RPC failed:', error);
        throw error;
      }

      return normalizePreview(data);
    },
    enabled: enabled && !!masterCustomerId && !!duplicateCustomerId && masterCustomerId !== duplicateCustomerId,
    staleTime: 15000,
    retry: false,
  });
}

export function useExecuteCustomerMerge() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: MergeCustomersParams): Promise<CustomerMergeResult> => {
      if (!user?.id) {
        throw new Error('Not authenticated');
      }

      const { masterCustomerId, duplicateCustomerId, confirmationPhrase, options } = params;

      if (!masterCustomerId || !duplicateCustomerId) {
        throw new Error('Both master and duplicate customer IDs are required');
      }

      if (masterCustomerId === duplicateCustomerId) {
        throw new Error('Cannot merge a customer with itself');
      }

      if (!confirmationPhrase.trim()) {
        throw new Error('Confirmation phrase is required');
      }

      logger.info('[Customer Merge] Executing transactional merge', {
        masterCustomerId,
        duplicateCustomerId,
      });

      const { data, error } = await supabase.rpc('merge_customers_transactional_v1', {
        p_master_customer_id: masterCustomerId,
        p_duplicate_customer_id: duplicateCustomerId,
        p_confirmation_phrase: confirmationPhrase,
        p_options: {
          fillBlankMasterFields: true,
          appendDuplicateNotes: true,
          source: 'merge_page',
          ...options,
        } as Json,
      });

      if (error) {
        logger.error('[Customer Merge] Transactional RPC failed:', error);
        throw error;
      }

      const result = normalizeResult(data);
      logger.info('[Customer Merge] Transactional merge complete', result);
      return result;
    },
    onSuccess: (result) => {
      const keysToInvalidate = [
        ['accounts'],
        ['customers'],
        ['policies'],
        ['quotes'],
        ['documents'],
        ['tasks'],
        ['communications'],
        ['leads'],
        ['renewals'],
        ['account-with-counts'],
        ['customer-merge-preview'],
        ['duplicate-flags'],
        ['duplicate-groups'],
      ];

      keysToInvalidate.forEach((queryKey) => {
        queryClient.invalidateQueries({ queryKey });
      });

      const totalTransferred = Object.values(result.transferredCounts).reduce((sum, count) => sum + count, 0);
      const totalDeduped = Object.values(result.dedupedCounts).reduce((sum, count) => sum + count, 0);

      toast({
        title: 'Customers merged successfully',
        description: `${totalTransferred} row(s) transferred${totalDeduped ? `, ${totalDeduped} duplicate row(s) deduped` : ''}.`,
      });
    },
    onError: (error: Error) => {
      logger.error('[Customer Merge] Error:', error);
      toast({
        title: 'Merge failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useCustomerMerge() {
  const executeMerge = useExecuteCustomerMerge();

  return {
    mergeCustomers: (params: LegacyMergeCustomersParams) =>
      executeMerge.mutateAsync({
        masterCustomerId: params.masterId,
        duplicateCustomerId: params.mergedId,
        confirmationPhrase: params.confirmationPhrase,
        options: params.options,
      }),
    isMerging: executeMerge.isPending,
    error: executeMerge.error,
  };
}
