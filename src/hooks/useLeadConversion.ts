import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';

// Types for conversion
export interface NewAccountData {
  name: string;
  type: 'household' | 'commercial_business';
  email?: string;
  phone?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  spouse_name?: string;
  source?: string;
}

export interface PolicyData {
  policy_number: string;
  carrier: string;
  line_of_business: string;
  effective_date: string;
  expiration_date: string;
  premium: number;
  policy_term?: string;
  billing_frequency?: 'monthly' | 'quarterly' | 'semiannual' | 'annual';
  status?: string;
}

export interface ConvertLeadParams {
  leadId: string;
  existingAccountId?: string;
  newAccountData?: NewAccountData;
  policyData: PolicyData;
  importedDocumentPath?: string;
  importedDocumentName?: string;
}

export interface ConversionResult {
  accountId: string;
  policyId: string;
  documentsTransferred: number;
  tasksTransferred: number;
  communicationsTransferred: number;
}

export function useLeadConversion() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const convertLead = useMutation({
    mutationFn: async (params: ConvertLeadParams): Promise<ConversionResult> => {
      if (!user?.id) {
        throw new Error('Not authenticated');
      }

      const { leadId, existingAccountId, newAccountData, policyData, importedDocumentPath, importedDocumentName } = params;

      // Step 1: Fetch the lead data
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (leadError || !lead) {
        throw new Error('Failed to fetch lead data');
      }

      let accountId: string;

      // Step 2: Create new account or use existing
      if (existingAccountId) {
        accountId = existingAccountId;
        logger.info('[Lead Conversion] Using existing account:', accountId);
      } else if (newAccountData) {
        const { data: newAccount, error: accountError } = await supabase
          .from('accounts')
          .insert({
            name: newAccountData.name,
            type: newAccountData.type,
            email: newAccountData.email || null,
            phone: newAccountData.phone || null,
            address_line1: newAccountData.address_line1 || null,
            address_line2: newAccountData.address_line2 || null,
            city: newAccountData.city || null,
            state: newAccountData.state || null,
            zip_code: newAccountData.zip_code || null,
            spouse_name: newAccountData.spouse_name || null,
            source: newAccountData.source || 'Lead Conversion',
            account_status: 'active',
          })
          .select()
          .single();

        if (accountError || !newAccount) {
          logger.error('[Lead Conversion] Failed to create account:', accountError);
          throw new Error('Failed to create customer account');
        }

        accountId = newAccount.id;
        logger.info('[Lead Conversion] Created new account:', accountId);
      } else {
        throw new Error('Must provide either existingAccountId or newAccountData');
      }

      // Step 3: Create policy
      const { data: newPolicy, error: policyError } = await supabase
        .from('policies')
        .insert({
          account_id: accountId,
          insured_user_id: user.id,
          policy_number: policyData.policy_number,
          carrier: policyData.carrier,
          line_of_business: policyData.line_of_business,
          effective_date: policyData.effective_date,
          expiration_date: policyData.expiration_date,
          premium: policyData.premium,
          policy_term: policyData.policy_term || null,
          billing_frequency: policyData.billing_frequency || 'semiannual',
          status: policyData.status || 'active',
        })
        .select()
        .single();

      if (policyError || !newPolicy) {
        logger.error('[Lead Conversion] Failed to create policy:', policyError);
        // If we created a new account, we should clean it up
        if (!existingAccountId && accountId) {
          await supabase.from('accounts').delete().eq('id', accountId);
        }
        throw new Error('Failed to create policy');
      }

      logger.info('[Lead Conversion] Created policy:', newPolicy.id);

      // Step 4: Migrate documents from lead to account
      let documentsTransferred = 0;
      const { data: leadDocs, error: docsQueryError } = await supabase
        .from('documents')
        .select('id')
        .eq('related_entity_type', 'lead')
        .eq('related_entity_id', leadId);

      if (!docsQueryError && leadDocs && leadDocs.length > 0) {
        const docIds = leadDocs.map(d => d.id);
        const { error: docsUpdateError } = await supabase
          .from('documents')
          .update({
            account_id: accountId,
            related_entity_type: 'account',
            related_entity_id: accountId,
            policy_id: newPolicy.id,
          })
          .in('id', docIds);

        if (!docsUpdateError) {
          documentsTransferred = leadDocs.length;
          logger.info('[Lead Conversion] Transferred documents:', documentsTransferred);
        }
      }

      // Step 5: If we have an imported document, create/link it
      if (importedDocumentPath && importedDocumentName) {
        const { error: importDocError } = await supabase
          .from('documents')
          .insert({
            account_id: accountId,
            policy_id: newPolicy.id,
            filename: importedDocumentName,
            storage_path: importedDocumentPath,
            storage_bucket: 'documents',
            kind: 'application',
            category: 'application',
            related_entity_type: 'account',
            related_entity_id: accountId,
          });

        if (!importDocError) {
          documentsTransferred += 1;
        }
      }

      // Step 6: Migrate tasks from lead to account
      let tasksTransferred = 0;
      const { data: leadTasks } = await supabase
        .from('tasks')
        .select('id')
        .eq('entity_type', 'lead')
        .eq('entity_id', leadId);

      if (leadTasks && leadTasks.length > 0) {
        const taskIds = leadTasks.map(t => t.id);
        const { error: tasksUpdateError } = await supabase
          .from('tasks')
          .update({
            account_id: accountId,
            customer_id: accountId,
            entity_type: 'account',
            entity_id: accountId,
          })
          .in('id', taskIds);

        if (!tasksUpdateError) {
          tasksTransferred = leadTasks.length;
          logger.info('[Lead Conversion] Transferred tasks:', tasksTransferred);
        }
      }

      // Step 7: Copy communications if lead had any account association
      let communicationsTransferred = 0;
      if (lead.account_id) {
        const { data: leadComms } = await supabase
          .from('communications')
          .select('*')
          .eq('account_id', lead.account_id);

        if (leadComms && leadComms.length > 0 && lead.account_id !== accountId) {
          // Copy communications to new account
          const commInserts = leadComms.map(comm => ({
            ...comm,
            id: undefined, // Let DB generate new ID
            account_id: accountId,
          }));

          const { error: commInsertError } = await supabase
            .from('communications')
            .insert(commInserts);

          if (!commInsertError) {
            communicationsTransferred = leadComms.length;
            logger.info('[Lead Conversion] Copied communications:', communicationsTransferred);
          }
        }
      }

      // Step 8: Append lead notes to account notes
      if (lead.notes) {
        const { data: account } = await supabase
          .from('accounts')
          .select('notes')
          .eq('id', accountId)
          .single();

        const notePrefix = `--- Converted from Lead (${new Date().toLocaleDateString()}) ---\n`;
        const combinedNotes = account?.notes
          ? `${account.notes}\n\n${notePrefix}${lead.notes}`
          : `${notePrefix}${lead.notes}`;

        await supabase
          .from('accounts')
          .update({ notes: combinedNotes })
          .eq('id', accountId);

        logger.info('[Lead Conversion] Appended lead notes to account');
      }

      // Step 9: Update lead status to 'won'
      const { error: leadUpdateError } = await supabase
        .from('leads')
        .update({
          status: 'won',
          converted_at: new Date().toISOString(),
          converted_account_id: accountId,
          won_premium: policyData.premium,
        })
        .eq('id', leadId);

      if (leadUpdateError) {
        logger.error('[Lead Conversion] Failed to update lead status:', leadUpdateError);
        // Don't throw - the conversion was successful
      }

      logger.info('[Lead Conversion] Conversion complete for lead:', leadId);

      return {
        accountId,
        policyId: newPolicy.id,
        documentsTransferred,
        tasksTransferred,
        communicationsTransferred,
      };
    },
    onSuccess: (result) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['policies'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });

      toast({
        title: 'Lead converted successfully!',
        description: `Customer and policy created. ${result.documentsTransferred} documents, ${result.tasksTransferred} tasks transferred.`,
      });
    },
    onError: (error: Error) => {
      logger.error('[Lead Conversion] Error:', error);
      toast({
        title: 'Conversion failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    convertLead: convertLead.mutateAsync,
    isConverting: convertLead.isPending,
    error: convertLead.error,
  };
}
