import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface BookOfBusinessData {
  insureds: {
    commercial: number;
    personal: number;
  };
  prospects: {
    commercial: number;
    personal: number;
  };
}

export function useBookOfBusinessData() {
  return useQuery({
    queryKey: ['book-of-business'],
    queryFn: async (): Promise<BookOfBusinessData> => {
      // Get all active accounts
      const { data: accountsData, error: accountsError } = await supabase
        .from('accounts')
        .select('id, type, account_type, account_status')
        .is('deleted_at', null);

      if (accountsError) {
        throw new Error(`Failed to fetch accounts: ${accountsError.message}`);
      }

      // Get accounts that have policies (these are insureds)
      const { data: accountsWithPolicies, error: policiesError } = await supabase
        .from('policies')
        .select('account_id')
        .not('account_id', 'is', null);

      if (policiesError) {
        throw new Error(`Failed to fetch policies: ${policiesError.message}`);
      }

      const accounts = accountsData || [];
      const policyAccountIds = new Set((accountsWithPolicies || []).map(p => p.account_id));

      // Separate insureds (accounts with policies) from prospects (accounts without policies)
      const insureds = accounts.filter(account => policyAccountIds.has(account.id));
      const prospects = accounts.filter(account => !policyAccountIds.has(account.id));

      // Helper function to categorize account type
      const isPersonal = (account: any) => {
        const type = account.type?.toLowerCase() || '';
        const accountType = account.account_type?.toLowerCase() || '';
        return ['household', 'individual', 'personal'].includes(type) || 
               ['individual', 'personal'].includes(accountType);
      };

      const isCommercial = (account: any) => {
        const type = account.type?.toLowerCase() || '';
        const accountType = account.account_type?.toLowerCase() || '';
        return ['business', 'commercial', 'corporate'].includes(type) || 
               ['business', 'commercial', 'corporate'].includes(accountType);
      };

      // Count by type for insureds
      const insuredsCount = {
        commercial: insureds.filter(isCommercial).length,
        personal: insureds.filter(isPersonal).length,
      };

      // Count by type for prospects
      const prospectsCount = {
        commercial: prospects.filter(isCommercial).length,
        personal: prospects.filter(isPersonal).length,
      };

      return {
        insureds: insuredsCount,
        prospects: prospectsCount,
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}