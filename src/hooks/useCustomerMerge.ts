import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';

export interface MergeCustomersParams {
  masterId: string;      // Surviving account
  mergedId: string;      // Account to be merged/deleted
}

export interface MergeResult {
  masterId: string;
  policiesTransferred: number;
  quotesTransferred: number;
  documentsTransferred: number;
  tasksTransferred: number;
  communicationsTransferred: number;
  leadsTransferred: number;
  renewalsTransferred: number;
  notesAppended: boolean;
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

export function useCustomerMerge() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mergeCustomers = useMutation({
    mutationFn: async (params: MergeCustomersParams): Promise<MergeResult> => {
      if (!user?.id) {
        throw new Error('Not authenticated');
      }

      const { masterId, mergedId } = params;

      // Validate IDs are different
      if (masterId === mergedId) {
        throw new Error('Cannot merge a customer with itself');
      }

      logger.info('[Customer Merge] Starting merge', { masterId, mergedId });

      // Step 1: Fetch both accounts to validate they exist
      const [masterResult, mergedResult] = await Promise.all([
        supabase.from('accounts').select('*').eq('id', masterId).is('deleted_at', null).single(),
        supabase.from('accounts').select('*').eq('id', mergedId).is('deleted_at', null).single(),
      ]);

      if (masterResult.error || !masterResult.data) {
        throw new Error('Master account not found');
      }
      if (mergedResult.error || !mergedResult.data) {
        throw new Error('Account to be merged not found');
      }

      const masterAccount = masterResult.data;
      const mergedAccount = mergedResult.data;

      // Step 2: Create snapshot of merged account for audit
      const mergedSnapshot = { ...mergedAccount };

      // Step 3: Transfer all related data
      let policiesTransferred = 0;
      let quotesTransferred = 0;
      let documentsTransferred = 0;
      let tasksTransferred = 0;
      let communicationsTransferred = 0;
      let leadsTransferred = 0;
      let renewalsTransferred = 0;

      // 3a: Transfer policies
      const { data: policies } = await supabase
        .from('policies')
        .select('id')
        .eq('account_id', mergedId);

      if (policies && policies.length > 0) {
        const policyIds = policies.map(p => p.id);
        const { error } = await supabase
          .from('policies')
          .update({ account_id: masterId })
          .in('id', policyIds);

        if (!error) {
          policiesTransferred = policies.length;
          logger.info('[Customer Merge] Transferred policies:', policiesTransferred);
        }
      }

      // 3b: Transfer quotes
      const { data: quotes } = await supabase
        .from('quotes')
        .select('id')
        .eq('account_id', mergedId);

      if (quotes && quotes.length > 0) {
        const quoteIds = quotes.map(q => q.id);
        const { error } = await supabase
          .from('quotes')
          .update({ account_id: masterId })
          .in('id', quoteIds);

        if (!error) {
          quotesTransferred = quotes.length;
          logger.info('[Customer Merge] Transferred quotes:', quotesTransferred);
        }
      }

      // 3c: Transfer documents
      const { data: documents } = await supabase
        .from('documents')
        .select('id')
        .eq('account_id', mergedId);

      if (documents && documents.length > 0) {
        const docIds = documents.map(d => d.id);
        const { error } = await supabase
          .from('documents')
          .update({ account_id: masterId })
          .in('id', docIds);

        if (!error) {
          documentsTransferred = documents.length;
          logger.info('[Customer Merge] Transferred documents:', documentsTransferred);
        }
      }

      // 3d: Transfer tasks (both account_id and customer_id)
      const { data: tasks } = await supabase
        .from('tasks')
        .select('id')
        .or(`account_id.eq.${mergedId},customer_id.eq.${mergedId}`);

      if (tasks && tasks.length > 0) {
        const taskIds = tasks.map(t => t.id);
        const { error } = await supabase
          .from('tasks')
          .update({ account_id: masterId, customer_id: masterId })
          .in('id', taskIds);

        if (!error) {
          tasksTransferred = tasks.length;
          logger.info('[Customer Merge] Transferred tasks:', tasksTransferred);
        }
      }

      // 3e: Transfer communications
      const { data: communications } = await supabase
        .from('communications')
        .select('id')
        .eq('account_id', mergedId);

      if (communications && communications.length > 0) {
        const commIds = communications.map(c => c.id);
        const { error } = await supabase
          .from('communications')
          .update({ account_id: masterId })
          .in('id', commIds);

        if (!error) {
          communicationsTransferred = communications.length;
          logger.info('[Customer Merge] Transferred communications:', communicationsTransferred);
        }
      }

      // 3f: Transfer leads (both account_id and converted_account_id)
      const { data: leads } = await supabase
        .from('leads')
        .select('id')
        .or(`account_id.eq.${mergedId},converted_account_id.eq.${mergedId}`);

      if (leads && leads.length > 0) {
        const leadIds = leads.map(l => l.id);
        // Update account_id
        await supabase
          .from('leads')
          .update({ account_id: masterId })
          .eq('account_id', mergedId);
        // Update converted_account_id
        await supabase
          .from('leads')
          .update({ converted_account_id: masterId })
          .eq('converted_account_id', mergedId);

        leadsTransferred = leads.length;
        logger.info('[Customer Merge] Transferred leads:', leadsTransferred);
      }

      // 3g: Transfer renewals
      const { data: renewals } = await supabase
        .from('renewals')
        .select('id')
        .eq('account_id', mergedId);

      if (renewals && renewals.length > 0) {
        const renewalIds = renewals.map(r => r.id);
        const { error } = await supabase
          .from('renewals')
          .update({ account_id: masterId })
          .in('id', renewalIds);

        if (!error) {
          renewalsTransferred = renewals.length;
          logger.info('[Customer Merge] Transferred renewals:', renewalsTransferred);
        }
      }

      // 3h: Transfer ao_renewals
      await supabase
        .from('ao_renewals')
        .update({ account_id: masterId })
        .eq('account_id', mergedId);

      // 3i: Transfer canopy_pulls
      await supabase
        .from('canopy_pulls')
        .update({ account_id: masterId })
        .eq('account_id', mergedId);

      // 3j: Transfer account_tags (avoiding duplicates)
      const { data: mergedTags } = await supabase
        .from('account_tags')
        .select('tag_id')
        .eq('account_id', mergedId);

      if (mergedTags && mergedTags.length > 0) {
        // Get existing tags on master
        const { data: masterTags } = await supabase
          .from('account_tags')
          .select('tag_id')
          .eq('account_id', masterId);

        const masterTagIds = new Set(masterTags?.map(t => t.tag_id) || []);
        const newTags = mergedTags.filter(t => !masterTagIds.has(t.tag_id));

        if (newTags.length > 0) {
          await supabase
            .from('account_tags')
            .insert(newTags.map(t => ({ account_id: masterId, tag_id: t.tag_id })));
        }

        // Delete old tags
        await supabase
          .from('account_tags')
          .delete()
          .eq('account_id', mergedId);
      }

      // Step 4: Append notes from merged account to master
      let notesAppended = false;
      if (mergedAccount.notes) {
        const notePrefix = `\n\n--- Merged from ${mergedAccount.name} (${new Date().toLocaleDateString()}) ---\n`;
        const combinedNotes = masterAccount.notes
          ? `${masterAccount.notes}${notePrefix}${mergedAccount.notes}`
          : `${notePrefix}${mergedAccount.notes}`;

        const { error } = await supabase
          .from('accounts')
          .update({ notes: combinedNotes })
          .eq('id', masterId);

        if (!error) {
          notesAppended = true;
          logger.info('[Customer Merge] Appended notes from merged account');
        }
      }

      // Step 5: Create audit record in merge_history
      const transferredCounts = {
        policies: policiesTransferred,
        quotes: quotesTransferred,
        documents: documentsTransferred,
        tasks: tasksTransferred,
        communications: communicationsTransferred,
        leads: leadsTransferred,
        renewals: renewalsTransferred,
      };

      const { error: auditError } = await supabase
        .from('merge_history')
        .insert({
          entity_type: 'account',
          survivor_id: masterId,
          merged_ids: [mergedId],
          merged_by: user.id,
          merge_data: {
            merged_account: mergedSnapshot,
            transferred_counts: transferredCounts,
            master_account_name: masterAccount.name,
            merged_account_name: mergedAccount.name,
          },
        });

      if (auditError) {
        logger.warn('[Customer Merge] Failed to create audit record:', auditError);
      }

      // Step 6: Soft-delete merged account
      const { error: deleteError } = await supabase
        .from('accounts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', mergedId);

      if (deleteError) {
        logger.error('[Customer Merge] Failed to soft-delete merged account:', deleteError);
        throw new Error('Failed to complete merge: could not archive merged account');
      }

      logger.info('[Customer Merge] Merge complete', { masterId, mergedId, transferredCounts });

      return {
        masterId,
        policiesTransferred,
        quotesTransferred,
        documentsTransferred,
        tasksTransferred,
        communicationsTransferred,
        leadsTransferred,
        renewalsTransferred,
        notesAppended,
      };
    },
    onSuccess: (result) => {
      // Invalidate all affected queries
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['policies'] });
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['communications'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['renewals'] });
      queryClient.invalidateQueries({ queryKey: ['account-with-counts'] });

      const totalTransferred =
        result.policiesTransferred +
        result.quotesTransferred +
        result.documentsTransferred +
        result.tasksTransferred +
        result.communicationsTransferred;

      toast({
        title: 'Customers merged successfully!',
        description: `${totalTransferred} records transferred to master account.`,
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

  return {
    mergeCustomers: mergeCustomers.mutateAsync,
    isMerging: mergeCustomers.isPending,
    error: mergeCustomers.error,
  };
}
