// ============================================================================
// QUOTE REQUESTS HOOK
// ============================================================================
// Quote requests with RPC-based creation
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  PortalQuoteRequest,
  QuoteProductType,
  QuoteSource,
} from '@/types/portal';

export function useQuoteRequests() {
  const queryClient = useQueryClient();

  const requestsQuery = useQuery({
    queryKey: ['portal-quote-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('portal_quote_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as PortalQuoteRequest[];
    },
  });

  // Create quote request via RPC
  const createRequest = useMutation({
    mutationFn: async (params: {
      product_type: QuoteProductType;
      request_data: Record<string, unknown>;
      prefilled_data?: Record<string, unknown> | null;
      source?: QuoteSource;
      source_opportunity_id?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('create_my_quote_request', {
        p_product_type: params.product_type,
        p_request_data: params.request_data,
        p_prefilled_data: params.prefilled_data ?? null,
        p_source: params.source ?? 'portal',
        p_source_opportunity_id: params.source_opportunity_id ?? null,
      });

      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-quote-requests'] });
    },
  });

  return {
    requests: requestsQuery.data ?? [],
    isLoading: requestsQuery.isLoading,
    error: requestsQuery.error,
    refetch: requestsQuery.refetch,
    createRequest,
  };
}
