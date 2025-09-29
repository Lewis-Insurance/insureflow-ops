import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface BookOfBusinessData {
  insureds: {
    commercial: number;
    personal: number;
    lifeHealthGroup: number;
    lifeHealthIndividual: number;
    medicare: number;
  };
  prospects: {
    commercial: number;
    personal: number;
    lifeHealthGroup: number;
    lifeHealthIndividual: number;
    medicare: number;
  };
}

export function useBookOfBusinessData() {
  return useQuery({
    queryKey: ['book-of-business'],
    queryFn: async (): Promise<BookOfBusinessData> => {
      // Get insureds (accounts with policies)
      const { data: accountsData, error: accountsError } = await supabase
        .from('accounts')
        .select('type, account_status')
        .not('deleted_at', 'is', null);

      if (accountsError) {
        throw new Error(`Failed to fetch accounts: ${accountsError.message}`);
      }

      const accounts = accountsData || [];

      // Separate insureds (customers with policies) from prospects (leads without policies)
      const insureds = accounts.filter(account => 
        account.account_status && !['lead', 'prospect'].includes(account.account_status.toLowerCase())
      );
      
      const prospects = accounts.filter(account => 
        account.account_status && ['lead', 'prospect'].includes(account.account_status.toLowerCase())
      );

      // Count by type for insureds
      const insuredsCount = {
        commercial: insureds.filter(a => a.type && ['business', 'commercial', 'corporate'].includes(a.type.toLowerCase())).length,
        personal: insureds.filter(a => a.type && ['household', 'individual', 'personal'].includes(a.type.toLowerCase())).length,
        lifeHealthGroup: 0, // Placeholder - would need specific classification
        lifeHealthIndividual: 0, // Placeholder - would need specific classification  
        medicare: 0, // Placeholder - would need specific classification
      };

      // Count by type for prospects
      const prospectsCount = {
        commercial: prospects.filter(a => a.type && ['business', 'commercial', 'corporate'].includes(a.type.toLowerCase())).length,
        personal: prospects.filter(a => a.type && ['household', 'individual', 'personal'].includes(a.type.toLowerCase())).length,
        lifeHealthGroup: 0, // Placeholder - would need specific classification
        lifeHealthIndividual: 0, // Placeholder - would need specific classification
        medicare: 0, // Placeholder - would need specific classification
      };

      return {
        insureds: insuredsCount,
        prospects: prospectsCount,
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}