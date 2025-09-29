import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type Quote = Database['public']['Tables']['quotes']['Row'];

export interface QuoteWithAccount extends Quote {
  account?: {
    id: string;
    name: string;
    type: string;
  };
  carrier_info?: {
    id: string;
    name: string;
  };
}

export function useQuotesByAccount(accountId: string) {
  return useQuery({
    queryKey: ['quotes', 'account', accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select(`
          *,
          account:accounts!quotes_account_id_fkey(
            id,
            name,
            type
          ),
          carrier_info:carriers!quotes_carrier_id_fkey(
            id,
            name
          )
        `)
        .eq('account_id', accountId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch quotes: ${error.message}`);
      }

      return data as QuoteWithAccount[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!accountId,
  });
}