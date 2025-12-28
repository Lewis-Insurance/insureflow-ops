/**
 * Prefetch Hook
 *
 * Provides prefetching capabilities for React Query queries.
 * Use on hover to preload data for better perceived performance.
 */

import { useCallback } from 'react';
import { useQueryClient, QueryKey } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CACHE_TIMES } from '@/lib/queryConfig';

/**
 * Generic prefetch hook for any query
 */
export function usePrefetch<T>(
  queryKey: QueryKey,
  queryFn: () => Promise<T>,
  staleTime: number = CACHE_TIMES.standard
) {
  const queryClient = useQueryClient();

  const prefetch = useCallback(() => {
    queryClient.prefetchQuery({
      queryKey,
      queryFn,
      staleTime,
    });
  }, [queryClient, queryKey, queryFn, staleTime]);

  return prefetch;
}

/**
 * Prefetch a policy by ID
 */
export function usePrefetchPolicy() {
  const queryClient = useQueryClient();

  const prefetch = useCallback((policyId: string) => {
    queryClient.prefetchQuery({
      queryKey: ['policy', policyId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('policies')
          .select('*')
          .eq('id', policyId)
          .single();
        if (error) throw error;
        return data;
      },
      staleTime: CACHE_TIMES.standard,
    });
  }, [queryClient]);

  return prefetch;
}

/**
 * Prefetch a lead by ID
 */
export function usePrefetchLead() {
  const queryClient = useQueryClient();

  const prefetch = useCallback((leadId: string) => {
    queryClient.prefetchQuery({
      queryKey: ['lead', leadId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('leads')
          .select('*')
          .eq('id', leadId)
          .single();
        if (error) throw error;
        return data;
      },
      staleTime: CACHE_TIMES.standard,
    });
  }, [queryClient]);

  return prefetch;
}

/**
 * Prefetch an account by ID
 */
export function usePrefetchAccount() {
  const queryClient = useQueryClient();

  const prefetch = useCallback((accountId: string) => {
    queryClient.prefetchQuery({
      queryKey: ['account', accountId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('accounts')
          .select('*')
          .eq('id', accountId)
          .single();
        if (error) throw error;
        return data;
      },
      staleTime: CACHE_TIMES.standard,
    });
  }, [queryClient]);

  return prefetch;
}

/**
 * Prefetch a quote by ID
 */
export function usePrefetchQuote() {
  const queryClient = useQueryClient();

  const prefetch = useCallback((quoteId: string) => {
    queryClient.prefetchQuery({
      queryKey: ['quote', quoteId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('quotes')
          .select('*')
          .eq('id', quoteId)
          .single();
        if (error) throw error;
        return data;
      },
      staleTime: CACHE_TIMES.standard,
    });
  }, [queryClient]);

  return prefetch;
}

/**
 * Higher-order component props for prefetch-enabled links
 */
export interface PrefetchLinkProps {
  onMouseEnter?: () => void;
  onFocus?: () => void;
}

/**
 * Creates props for a prefetch-enabled link element
 */
export function createPrefetchProps(prefetchFn: () => void): PrefetchLinkProps {
  return {
    onMouseEnter: prefetchFn,
    onFocus: prefetchFn,
  };
}
