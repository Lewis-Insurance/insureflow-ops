import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PolicyWithAccount } from './usePolicies';

export function usePoliciesByAccount(accountId: string) {
  return useQuery({
    queryKey: ['policies', 'account', accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('policies')
        .select(`
          *,
          account:accounts!policies_account_id_fkey(
            id,
            name,
            type,
            zip_code
          ),
          carrier_info:carriers!policies_carrier_id_fkey(
            id,
            name
          )
        `)
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) {
        throw new Error(`Failed to fetch policies: ${error.message}`);
      }

      return data as PolicyWithAccount[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!accountId,
  });
}