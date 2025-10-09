import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';

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

export interface QuoteFilters {
  status?: Quote['status'];
  carrier?: string;
  lineOfBusiness?: string;
}

export function useQuotes(filters: QuoteFilters = {}) {
  return useQuery({
    queryKey: ['quotes', filters],
    queryFn: async () => {
      let query = supabase
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
        .order('created_at', { ascending: false });

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.carrier) {
        query = query.ilike('carrier', `%${filters.carrier}%`);
      }

      if (filters.lineOfBusiness) {
        query = query.ilike('line_of_business', `%${filters.lineOfBusiness}%`);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch quotes: ${error.message}`);
      }

      return data as QuoteWithAccount[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
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

export function useUpdateQuoteStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ quoteId, status }: { quoteId: string; status: Quote['status'] }) => {
      const { error } = await supabase
        .from('quotes')
        .update({ status })
        .eq('id', quoteId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      toast({
        title: 'Success',
        description: 'Quote status updated',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to update quote: ${error.message}`,
        variant: 'destructive',
      });
    },
  });
}